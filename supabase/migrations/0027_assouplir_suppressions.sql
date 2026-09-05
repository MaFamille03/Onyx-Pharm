-- ============================================================================
-- ONYX PHARM — Migration 0027 : Le code PIN doit vraiment permettre de
-- corriger une erreur — retrait du blocage "stock non vide" sur les
-- conteneurs, ajout de la modification des quantités par ligne, et
-- Modifier/Supprimer sur les ventes déjà validées
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) SUPPRIMER UN CONTENEUR — même s'il contient encore du stock
--
-- Avant : la suppression était refusée tant qu'il restait du stock.
-- Problème signalé à juste titre : le code PIN existe justement pour
-- pouvoir corriger une erreur de saisie — une règle supplémentaire qui
-- bloque quand même n'a pas de sens.
--
-- Après : le code PIN suffit. S'il reste du stock au moment de la
-- suppression, il est automatiquement transféré vers le conteneur
-- "Stock Initial" avant suppression — pour ne jamais faire disparaître
-- une quantité physiquement réelle. Si le conteneur a été rempli par
-- erreur (mauvais article, mauvaise quantité), corrigez d'abord les
-- quantités via la nouvelle fonction "Modifier une ligne" ci-dessous,
-- puis supprimez.
-- ----------------------------------------------------------------------------
create or replace function public.supprimer_conteneur(p_conteneur_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_conteneur record;
  v_stock_initial_id uuid := public.get_stock_initial_id();
  v_ligne record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_conteneur from public.conteneurs where id = p_conteneur_id for update;
  if v_conteneur is null then
    raise exception 'Conteneur introuvable.';
  end if;

  if v_conteneur.code = 'STOCK-INITIAL' then
    raise exception 'Le conteneur "Stock Initial" ne peut pas être supprimé.';
  end if;

  -- Le stock restant, s'il y en a, est transféré vers Stock Initial
  -- plutôt que supprimé, pour ne jamais perdre une quantité réelle.
  for v_ligne in
    select article_id, emplacement_id, quantite
    from public.stocks
    where conteneur_id = p_conteneur_id and quantite > 0
  loop
    insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
    values (v_ligne.article_id, v_ligne.emplacement_id, v_stock_initial_id, v_ligne.quantite)
    on conflict (article_id, emplacement_id, conteneur_id)
    do update set quantite = public.stocks.quantite + v_ligne.quantite;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, reference_document, observation
    ) values (
      v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_ligne.quantite,
      'suppression_conteneur', v_conteneur.code,
      'Stock transféré vers Stock Initial suite à la suppression du conteneur ' || v_conteneur.code
    );
  end loop;

  delete from public.stocks where conteneur_id = p_conteneur_id;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'conteneurs', p_conteneur_id,
    'Suppression du conteneur ' || v_conteneur.code || ' (code PIN)'
  );

  -- Si des ventes ont déjà puisé dans ce conteneur, la contrainte de clé
  -- étrangère refuse la suppression ici, avec un message clair — c'est
  -- volontaire, pour protéger l'historique des ventes.
  delete from public.conteneurs where id = p_conteneur_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) MODIFIER LA QUANTITÉ D'UNE LIGNE DE CONTENEUR
-- Corrige une erreur de saisie (mauvaise quantité) sans passer par une
-- vente ou un transfert. Protégé par le code PIN, puisque ça modifie
-- directement le stock physique.
-- ----------------------------------------------------------------------------
create function public.modifier_ligne_conteneur(
  p_conteneur_id uuid,
  p_article_id uuid,
  p_emplacement_id uuid,
  p_nouvelle_quantite numeric,
  p_pin text
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_quantite_actuelle numeric;
  v_conteneur record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  if p_nouvelle_quantite < 0 then
    raise exception 'La quantité ne peut pas être négative.';
  end if;

  select * into v_conteneur from public.conteneurs where id = p_conteneur_id;
  if v_conteneur is null then
    raise exception 'Conteneur introuvable.';
  end if;

  select coalesce(quantite, 0) into v_quantite_actuelle
  from public.stocks
  where conteneur_id = p_conteneur_id and article_id = p_article_id
    and emplacement_id = p_emplacement_id;

  insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
  values (p_article_id, p_emplacement_id, p_conteneur_id, p_nouvelle_quantite)
  on conflict (article_id, emplacement_id, conteneur_id)
  do update set quantite = p_nouvelle_quantite;

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, reference_document, observation
  ) values (
    p_article_id, p_emplacement_id,
    case when p_nouvelle_quantite >= v_quantite_actuelle then 'autre_entree' else 'autre_sortie' end,
    abs(p_nouvelle_quantite - v_quantite_actuelle),
    'correction_conteneur', v_conteneur.code,
    'Correction de quantité dans le conteneur ' || v_conteneur.code
  );

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'modification', 'conteneurs', p_conteneur_id,
    'Quantité corrigée dans le conteneur ' || v_conteneur.code || ' (' ||
    v_quantite_actuelle || ' → ' || p_nouvelle_quantite || ')'
  );
end;
$$;

grant execute on function public.modifier_ligne_conteneur(uuid, uuid, uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) VENTES DÉJÀ VALIDÉES — Modifier et Supprimer, protégés par le PIN
--
-- "Supprimer" une vente validée : restitue le stock exactement aux
-- conteneurs d'origine (comme l'annulation), supprime les paiements
-- (le décaissement/encaissement lié disparaît automatiquement), puis
-- supprime la vente elle-même. Contrairement à l'annulation existante
-- (qui garde une trace "Annulé"), ceci retire complètement
-- l'enregistrement — pour corriger une vente entièrement mal saisie.
-- ----------------------------------------------------------------------------
create function public.supprimer_vente_validee(p_vente_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_vente record;
  v_ligne record;
  v_repartition record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_vente from public.ventes where id = p_vente_id for update;
  if v_vente is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_vente.statut = 'Brouillon' then
    raise exception 'Utilisez la suppression de brouillon pour cette vente.';
  end if;

  if v_vente.statut <> 'Annulé' then
    for v_ligne in
      select * from public.lignes_ventes where vente_id = p_vente_id
    loop
      for v_repartition in
        select * from public.lignes_ventes_conteneurs where ligne_vente_id = v_ligne.id
      loop
        insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
        values (v_ligne.article_id, v_ligne.emplacement_id, v_repartition.conteneur_id, v_repartition.quantite)
        on conflict (article_id, emplacement_id, conteneur_id)
        do update set quantite = public.stocks.quantite + v_repartition.quantite;

        insert into public.mouvements_stock (
          article_id, emplacement_id, type, quantite,
          document_type, document_id, reference_document, observation
        ) values (
          v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_repartition.quantite,
          'suppression_vente', p_vente_id, v_vente.reference,
          'Stock restitué suite à la suppression définitive de la vente'
        );
      end loop;
    end loop;
  end if;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'ventes', p_vente_id,
    'Suppression définitive de la vente ' || v_vente.reference || ' (code PIN)'
  );

  delete from public.paiements_ventes where vente_id = p_vente_id;
  delete from public.ventes where id = p_vente_id;
end;
$$;

grant execute on function public.supprimer_vente_validee(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- "Modifier" une vente validée : restitue le stock aux conteneurs
-- d'origine et repasse la vente en Brouillon pour permettre de corriger
-- les lignes puis de la revalider. Refusé si des paiements ont déjà été
-- enregistrés (il faut d'abord les supprimer depuis Ventes > Paiements).
-- ----------------------------------------------------------------------------
create function public.rouvrir_vente_en_brouillon(p_vente_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_vente record;
  v_nb_paiements int;
  v_ligne record;
  v_repartition record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_vente from public.ventes where id = p_vente_id for update;
  if v_vente is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_vente.statut = 'Brouillon' then
    raise exception 'Cette vente est déjà un brouillon.';
  end if;

  select count(*) into v_nb_paiements from public.paiements_ventes where vente_id = p_vente_id;
  if v_nb_paiements > 0 then
    raise exception 'Supprimez d''abord les % paiement(s) enregistré(s) sur cette vente (Ventes > Paiements) avant de pouvoir la modifier.', v_nb_paiements;
  end if;

  for v_ligne in
    select * from public.lignes_ventes where vente_id = p_vente_id
  loop
    for v_repartition in
      select * from public.lignes_ventes_conteneurs where ligne_vente_id = v_ligne.id
    loop
      insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
      values (v_ligne.article_id, v_ligne.emplacement_id, v_repartition.conteneur_id, v_repartition.quantite)
      on conflict (article_id, emplacement_id, conteneur_id)
      do update set quantite = public.stocks.quantite + v_repartition.quantite;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, document_id, reference_document, observation
      ) values (
        v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_repartition.quantite,
        'reouverture_vente', p_vente_id, v_vente.reference,
        'Stock restitué pour permettre la modification de la vente'
      );
    end loop;

    delete from public.lignes_ventes_conteneurs where ligne_vente_id = v_ligne.id;
  end loop;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'modification', 'ventes', p_vente_id,
    'Vente ' || v_vente.reference || ' rouverte en brouillon pour modification (code PIN)'
  );

  update public.ventes set statut = 'Brouillon' where id = p_vente_id;
end;
$$;

grant execute on function public.rouvrir_vente_en_brouillon(uuid, text) to authenticated;
