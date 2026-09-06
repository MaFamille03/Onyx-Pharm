-- ============================================================================
-- ONYX PHARM — Migration 0034 : CORRECTION CRITIQUE — validation d'un
-- inventaire pouvait échouer si un article était réparti sur plusieurs
-- conteneurs dans l'emplacement inventorié
--
-- CAUSE EXACTE DU BUG
-- La quantité théorique d'un inventaire est calculée (à la création)
-- comme le TOTAL du stock d'un article dans l'emplacement, tous
-- conteneurs confondus. Mais à la validation, tout l'écart était
-- appliqué au seul conteneur "Stock Initial". Si l'article était en
-- réalité réparti sur plusieurs conteneurs (ex : 50 dans Stock Initial +
-- 30 dans un autre conteneur = 80 en théorique) et que le comptage réel
-- était inférieur (ex : 20, écart de -60), la validation tentait de
-- mettre Stock Initial à 50 - 60 = -10 — ce qui viole la contrainte
-- "stock_non_negatif" de la table stocks, et fait échouer TOUTE la
-- validation avec un message générique "Impossible de valider".
--
-- CORRECTION : un écart POSITIF (surplus trouvé) continue d'être ajouté
-- à Stock Initial (on ne sait pas d'où vient le surplus). Un écart
-- NÉGATIF (manquant) est désormais consommé en FIFO à travers tous les
-- conteneurs réellement présents dans cet emplacement — exactement
-- comme une vente ou une correction de stock classique.
-- ============================================================================

create or replace function public.valider_inventaire(
  p_inventaire_id uuid,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_ligne record;
  v_emplacement_id uuid;
  v_reference text;
  v_statut text;
  v_stock_initial_id uuid := public.get_stock_initial_id();
  v_repartition record;
begin
  select emplacement_id, reference, statut
  into v_emplacement_id, v_reference, v_statut
  from public.inventaires
  where id = p_inventaire_id
  for update;

  if v_emplacement_id is null then
    raise exception 'Inventaire introuvable.';
  end if;

  if v_statut = 'Validé' then
    raise exception 'Cet inventaire a déjà été validé.';
  end if;

  for v_ligne in
    select * from public.inventaire_lignes
    where inventaire_id = p_inventaire_id and ecart <> 0
  loop
    if v_ligne.ecart > 0 then
      insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
      values (v_ligne.article_id, v_emplacement_id, v_stock_initial_id, v_ligne.ecart)
      on conflict (article_id, emplacement_id, conteneur_id)
      do update set quantite = public.stocks.quantite + v_ligne.ecart;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, document_id, reference_document, observation, created_by
      ) values (
        v_ligne.article_id, v_emplacement_id, 'ajustement_inventaire',
        v_ligne.ecart, 'inventaire', p_inventaire_id, v_reference,
        coalesce(v_ligne.observation, 'Surplus constaté lors de l''inventaire'),
        p_utilisateur_id
      );
    else
      -- Manquant : on consomme en FIFO à travers tous les conteneurs
      -- réellement présents dans cet emplacement, jamais uniquement
      -- Stock Initial.
      for v_repartition in
        select * from public.consommer_stock_fifo(
          v_ligne.article_id, v_emplacement_id, abs(v_ligne.ecart), null
        )
      loop
        insert into public.mouvements_stock (
          article_id, emplacement_id, type, quantite,
          document_type, document_id, reference_document, observation, created_by
        ) values (
          v_ligne.article_id, v_emplacement_id, 'ajustement_inventaire',
          -v_repartition.quantite, 'inventaire', p_inventaire_id, v_reference,
          coalesce(v_ligne.observation, 'Manquant constaté lors de l''inventaire'),
          p_utilisateur_id
        );
      end loop;
    end if;
  end loop;

  update public.inventaires
  set statut = 'Validé', valide_at = now(), valide_by = p_utilisateur_id
  where id = p_inventaire_id;
end;
$$;

grant execute on function public.valider_inventaire(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Même correction pour la correction d'une ligne d'inventaire déjà
-- validé (migration 0032/0029) — même défaut, même risque.
-- ----------------------------------------------------------------------------
create or replace function public.corriger_ligne_inventaire_validee(
  p_ligne_id uuid,
  p_nouvelle_quantite_reelle numeric,
  p_pin text
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_ligne record;
  v_inventaire record;
  v_designation text;
  v_ancien_ecart numeric;
  v_nouvel_ecart numeric;
  v_delta numeric;
  v_stock_initial_id uuid := public.get_stock_initial_id();
  v_repartition record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  if p_nouvelle_quantite_reelle < 0 then
    raise exception 'La quantité comptée ne peut pas être négative.';
  end if;

  select * into v_ligne from public.inventaire_lignes where id = p_ligne_id for update;
  if v_ligne is null then
    raise exception 'Ligne d''inventaire introuvable.';
  end if;

  select * into v_inventaire from public.inventaires where id = v_ligne.inventaire_id;
  if v_inventaire.statut <> 'Validé' then
    raise exception 'Cet inventaire n''est pas encore validé : modifiez la ligne normalement.';
  end if;

  select designation into v_designation from public.articles where id = v_ligne.article_id;

  v_ancien_ecart := v_ligne.ecart;
  v_nouvel_ecart := p_nouvelle_quantite_reelle - v_ligne.quantite_theorique;
  v_delta := v_nouvel_ecart - v_ancien_ecart;

  if v_delta > 0 then
    update public.stocks
    set quantite = quantite + v_delta
    where article_id = v_ligne.article_id
      and emplacement_id = v_inventaire.emplacement_id
      and conteneur_id = v_stock_initial_id;

    if not found then
      insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
      values (v_ligne.article_id, v_inventaire.emplacement_id, v_stock_initial_id, v_delta);
    end if;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, reference_document, observation
    ) values (
      v_ligne.article_id, v_inventaire.emplacement_id, 'ajustement_inventaire', v_delta,
      'correction_inventaire_valide', v_inventaire.reference,
      'Correction d''une ligne d''inventaire déjà validé (code PIN)'
    );
  elsif v_delta < 0 then
    for v_repartition in
      select * from public.consommer_stock_fifo(
        v_ligne.article_id, v_inventaire.emplacement_id, abs(v_delta), null
      )
    loop
      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, reference_document, observation
      ) values (
        v_ligne.article_id, v_inventaire.emplacement_id, 'ajustement_inventaire',
        -v_repartition.quantite, 'correction_inventaire_valide', v_inventaire.reference,
        'Correction d''une ligne d''inventaire déjà validé (code PIN)'
      );
    end loop;
  end if;

  update public.inventaire_lignes
  set quantite_reelle = p_nouvelle_quantite_reelle
  where id = p_ligne_id;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description,
    donnees_annulation
  ) values (
    auth.uid(), 'modification', 'inventaire_lignes', p_ligne_id,
    'Ligne d''inventaire ' || v_inventaire.reference || ' — "' || coalesce(v_designation, '?') ||
    '" corrigée après validation (quantité comptée : ' ||
    v_ligne.quantite_reelle || ' → ' || p_nouvelle_quantite_reelle || ', code PIN)',
    jsonb_build_object(
      'type', 'inventaire_ligne_quantite',
      'article_designation', v_designation,
      'ligne_id', p_ligne_id,
      'article_id', v_ligne.article_id,
      'emplacement_id', v_inventaire.emplacement_id,
      'quantite_reelle_avant', v_ligne.quantite_reelle,
      'quantite_reelle_apres', p_nouvelle_quantite_reelle
    )
  );
end;
$$;

grant execute on function public.corriger_ligne_inventaire_validee(uuid, numeric, text) to authenticated;
