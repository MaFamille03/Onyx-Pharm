-- ============================================================================
-- ONYX PHARM — Migration 0035 :
--   1) Supprime les ".00" superflus dans tous les textes affichés
--      (historique, messages d'erreur) — 3 doit s'afficher "3", pas "3.00"
--   2) Ajoute la quantité initiale par ligne de conteneur, conservée
--      pour toujours (traçabilité), affichée à côté de la quantité
--      actuelle sur la fiche du conteneur
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Utilitaire de formatage : "3.00" → "3", "78.50" → "78.5" (les
-- décimales réellement significatives restent affichées).
-- ----------------------------------------------------------------------------
create or replace function public.fmt_qte(v numeric)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(v, 0)::text, '\.?0+$', '');
$$;

grant execute on function public.fmt_qte(numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 1) Quantité initiale par ligne de stock — conservée pour toujours,
-- jamais modifiée après la création, pour garder une trace de ce qui a
-- été réellement déclaré à l'arrivée du conteneur.
-- ----------------------------------------------------------------------------
alter table public.stocks
  add column if not exists quantite_initiale numeric(14, 2);

update public.stocks
set quantite_initiale = quantite
where quantite_initiale is null;

alter table public.stocks
  alter column quantite_initiale set default 0;

-- ----------------------------------------------------------------------------
-- 2) consommer_stock_fifo — messages d'erreur sans ".00"
-- ----------------------------------------------------------------------------
create or replace function public.consommer_stock_fifo(
  p_article_id uuid,
  p_emplacement_id uuid,
  p_quantite numeric,
  p_conteneur_id uuid default null
)
returns table(conteneur_id uuid, quantite numeric)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_total numeric := 0;
  v_restant numeric := p_quantite;
  v_ligne record;
  v_pris numeric;
  v_nom_emplacement text;
begin
  if p_quantite <= 0 then
    raise exception 'La quantité doit être supérieure à zéro.';
  end if;

  select nom into v_nom_emplacement from public.emplacements where id = p_emplacement_id;

  if p_conteneur_id is not null then
    perform 1 from public.stocks
    where public.stocks.article_id = p_article_id
      and public.stocks.emplacement_id = p_emplacement_id
      and public.stocks.conteneur_id = p_conteneur_id
    for update;

    select coalesce(public.stocks.quantite, 0) into v_total from public.stocks
    where public.stocks.article_id = p_article_id
      and public.stocks.emplacement_id = p_emplacement_id
      and public.stocks.conteneur_id = p_conteneur_id;

    -- Un SELECT INTO qui ne trouve aucune ligne (l'article n'a jamais
    -- eu de stock dans ce conteneur précis) écrase la variable avec
    -- NULL, même déjà initialisée à 0 — protection explicite.
    v_total := coalesce(v_total, 0);

    if v_total < p_quantite then
      raise exception 'Stock insuffisant dans ce conteneur, emplacement "%" (disponible : %, demandé : %).',
        coalesce(v_nom_emplacement, '?'), public.fmt_qte(v_total), public.fmt_qte(p_quantite);
    end if;

    update public.stocks set quantite = public.stocks.quantite - p_quantite
    where public.stocks.article_id = p_article_id
      and public.stocks.emplacement_id = p_emplacement_id
      and public.stocks.conteneur_id = p_conteneur_id;

    conteneur_id := p_conteneur_id;
    quantite := p_quantite;
    return next;
    return;
  end if;

  perform 1 from public.stocks
  where public.stocks.article_id = p_article_id
    and public.stocks.emplacement_id = p_emplacement_id
  for update;

  select coalesce(sum(public.stocks.quantite), 0) into v_total from public.stocks
  where public.stocks.article_id = p_article_id
    and public.stocks.emplacement_id = p_emplacement_id;

  if v_total < p_quantite then
    raise exception 'Quantité insuffisante dans l''emplacement "%" (disponible : %, demandé : %).',
      coalesce(v_nom_emplacement, '?'), public.fmt_qte(v_total), public.fmt_qte(p_quantite);
  end if;

  for v_ligne in
    select s.conteneur_id as cid, s.quantite as qte
    from public.stocks s
    join public.conteneurs c on c.id = s.conteneur_id
    where s.article_id = p_article_id and s.emplacement_id = p_emplacement_id
      and s.quantite > 0
    order by c.date_arrivee asc, c.created_at asc
  loop
    exit when v_restant <= 0;
    v_pris := least(v_ligne.qte, v_restant);

    update public.stocks set quantite = public.stocks.quantite - v_pris
    where public.stocks.article_id = p_article_id
      and public.stocks.emplacement_id = p_emplacement_id
      and public.stocks.conteneur_id = v_ligne.cid;

    conteneur_id := v_ligne.cid;
    quantite := v_pris;
    return next;

    v_restant := v_restant - v_pris;
  end loop;
end;
$$;

grant execute on function public.consommer_stock_fifo(uuid, uuid, numeric, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) modifier_ligne_conteneur — sans ".00" dans l'historique, et
-- renseigne quantite_initiale la toute première fois qu'une ligne
-- apparaît dans un conteneur (jamais modifiée ensuite).
-- ----------------------------------------------------------------------------
create or replace function public.modifier_ligne_conteneur(
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
  v_quantite_actuelle numeric := 0;
  v_ligne_existe boolean;
  v_conteneur record;
  v_designation text;
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

  select designation into v_designation from public.articles where id = p_article_id;

  select exists(
    select 1 from public.stocks
    where conteneur_id = p_conteneur_id and article_id = p_article_id
      and emplacement_id = p_emplacement_id
  ) into v_ligne_existe;

  select coalesce(quantite, 0) into v_quantite_actuelle
  from public.stocks
  where conteneur_id = p_conteneur_id and article_id = p_article_id
    and emplacement_id = p_emplacement_id;

  -- Un SELECT INTO qui ne trouve aucune ligne écrase la variable avec
  -- NULL, même déjà initialisée à 0 — on s'en protège explicitement.
  v_quantite_actuelle := coalesce(v_quantite_actuelle, 0);

  if v_ligne_existe then
    update public.stocks
    set quantite = p_nouvelle_quantite
    where conteneur_id = p_conteneur_id and article_id = p_article_id
      and emplacement_id = p_emplacement_id;
  else
    -- Première apparition de cette ligne dans ce conteneur : la
    -- quantité initiale se fige ici, pour toujours.
    insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite, quantite_initiale)
    values (p_article_id, p_emplacement_id, p_conteneur_id, p_nouvelle_quantite, p_nouvelle_quantite);
  end if;

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
    utilisateur_id, action, table_cible, enregistrement_id, description,
    donnees_annulation
  ) values (
    auth.uid(), 'modification', 'conteneurs', p_conteneur_id,
    'Quantité de "' || coalesce(v_designation, '?') || '" corrigée dans le conteneur ' ||
    v_conteneur.code || ' (' || public.fmt_qte(v_quantite_actuelle) || ' → ' ||
    public.fmt_qte(p_nouvelle_quantite) || ')',
    jsonb_build_object(
      'type', 'stock_conteneur_quantite',
      'article_designation', v_designation,
      'conteneur_id', p_conteneur_id,
      'article_id', p_article_id,
      'emplacement_id', p_emplacement_id,
      'quantite_avant', v_quantite_actuelle,
      'quantite_apres', p_nouvelle_quantite
    )
  );
end;
$$;

grant execute on function public.modifier_ligne_conteneur(uuid, uuid, uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) corriger_ligne_inventaire_validee — sans ".00"
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
      insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite, quantite_initiale)
      values (v_ligne.article_id, v_inventaire.emplacement_id, v_stock_initial_id, v_delta, 0);
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
    public.fmt_qte(v_ligne.quantite_reelle) || ' → ' || public.fmt_qte(p_nouvelle_quantite_reelle) ||
    ', code PIN)',
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

-- ----------------------------------------------------------------------------
-- 5) supprimer_article et suppression de paiements — sans ".00"
-- ----------------------------------------------------------------------------
create or replace function public.supprimer_article(p_article_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_article record;
  v_nb_ventes int;
  v_nb_retours int;
  v_nb_inventaires int;
  v_stock_total numeric;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_article from public.articles where id = p_article_id for update;
  if v_article is null then
    raise exception 'Article introuvable.';
  end if;

  select count(*) into v_nb_ventes from public.lignes_ventes where article_id = p_article_id;
  select count(*) into v_nb_retours from public.retours_clients where article_id = p_article_id;
  select count(*) into v_nb_inventaires from public.inventaire_lignes where article_id = p_article_id;

  if v_nb_ventes > 0 or v_nb_retours > 0 or v_nb_inventaires > 0 then
    raise exception
      'Impossible de supprimer "%" : il a un historique réel (% vente(s), % retour(s), % ligne(s) d''inventaire). Utilisez plutôt le statut "Archivé" pour le retirer de la circulation sans perdre cet historique.',
      v_article.designation, v_nb_ventes, v_nb_retours, v_nb_inventaires;
  end if;

  select coalesce(sum(quantite), 0) into v_stock_total
  from public.stocks where article_id = p_article_id;

  delete from public.stocks where article_id = p_article_id;
  delete from public.mouvements_stock where article_id = p_article_id;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'articles', p_article_id,
    'Suppression de l''article "' || v_article.designation || '"' ||
    case when v_stock_total > 0
      then ' (' || public.fmt_qte(v_stock_total) || ' unité(s) en stock retirée(s) au passage)'
      else ''
    end
  );

  delete from public.articles where id = p_article_id;
end;
$$;

grant execute on function public.supprimer_article(uuid, text) to authenticated;

create or replace function public.supprimer_paiement_vente(p_paiement_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_paiement record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_paiement from public.paiements_ventes where id = p_paiement_id;
  if v_paiement is null then
    raise exception 'Paiement introuvable.';
  end if;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'paiements_ventes', p_paiement_id,
    'Suppression d''un paiement de ' || public.fmt_qte(v_paiement.montant) || ' FCFA (code PIN)'
  );

  delete from public.paiements_ventes where id = p_paiement_id;
end;
$$;

create or replace function public.supprimer_paiement_conteneur(p_paiement_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_paiement record;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_paiement from public.paiements_conteneurs where id = p_paiement_id;
  if v_paiement is null then
    raise exception 'Paiement introuvable.';
  end if;

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'paiements_conteneurs', p_paiement_id,
    'Suppression d''un paiement de ' || public.fmt_qte(v_paiement.montant) || ' FCFA (code PIN)'
  );

  delete from public.paiements_conteneurs where id = p_paiement_id;
end;
$$;

grant execute on function public.supprimer_paiement_vente(uuid, text) to authenticated;
grant execute on function public.supprimer_paiement_conteneur(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) creer_conteneur — renseigne quantite_initiale à la création d'un
-- conteneur (une nouvelle ligne = sa quantité de départ, figée pour
-- toujours).
-- ----------------------------------------------------------------------------
create or replace function public.creer_conteneur(
  p_code text,
  p_fournisseur_id uuid,
  p_date_arrivee date,
  p_montant_achat_global numeric,
  p_observation text,
  p_lignes jsonb,
  p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_conteneur_id uuid;
  v_ligne jsonb;
  v_article_id uuid;
  v_emplacement_id uuid;
  v_quantite numeric;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Le code du conteneur est obligatoire.';
  end if;

  if p_montant_achat_global is null or p_montant_achat_global < 0 then
    raise exception 'Le montant d''achat global doit être renseigné et positif.';
  end if;

  if jsonb_array_length(coalesce(p_lignes, '[]'::jsonb)) = 0 then
    raise exception 'Ajoutez au moins un article au conteneur.';
  end if;

  insert into public.conteneurs (
    code, fournisseur_id, date_arrivee, montant_achat_global,
    statut, observation, created_by
  ) values (
    trim(p_code), p_fournisseur_id, coalesce(p_date_arrivee, current_date),
    p_montant_achat_global, 'Actif', p_observation, p_utilisateur_id
  )
  returning id into v_conteneur_id;

  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_article_id := (v_ligne ->> 'article_id')::uuid;
    v_emplacement_id := (v_ligne ->> 'emplacement_id')::uuid;
    v_quantite := (v_ligne ->> 'quantite')::numeric;

    if v_article_id is null or v_emplacement_id is null then
      raise exception 'Chaque ligne doit avoir un article et un emplacement.';
    end if;

    if v_quantite is null or v_quantite <= 0 then
      continue;
    end if;

    insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite, quantite_initiale)
    values (v_article_id, v_emplacement_id, v_conteneur_id, v_quantite, v_quantite)
    on conflict (article_id, emplacement_id, conteneur_id)
    do update set quantite = public.stocks.quantite + v_quantite;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, document_id, reference_document, observation, created_by
    ) values (
      v_article_id, v_emplacement_id, 'autre_entree', v_quantite,
      'creation_conteneur', v_conteneur_id, trim(p_code),
      'Entrée via conteneur ' || trim(p_code), p_utilisateur_id
    );
  end loop;

  return v_conteneur_id;
end;
$$;

grant execute on function public.creer_conteneur(text, uuid, date, numeric, text, jsonb, uuid) to authenticated;
