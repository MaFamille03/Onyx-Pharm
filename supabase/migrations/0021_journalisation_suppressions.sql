-- ============================================================================
-- ONYX PHARM — Migration 0021 : Journalisation des suppressions sensibles
--
-- Les suppressions protégées par le code PIN (paiements, retours,
-- inventaires validés) et la suppression d'un article ne laissaient
-- aucune trace dans l'Historique. Corrigé ici : chacune de ces actions
-- est désormais journalisée, avec l'utilisateur qui l'a réalisée.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Suppression d'un article — journalisée via un trigger générique
-- (couvre aussi bien une suppression directe qu'une future évolution).
-- ----------------------------------------------------------------------------
create function public.log_historique_suppression_article()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'articles', old.id,
    'Suppression de l''article "' || old.designation || '"'
  );
  return old;
end;
$$;

create trigger trg_log_historique_suppression_article
  before delete on public.articles
  for each row execute function public.log_historique_suppression_article();

-- ----------------------------------------------------------------------------
-- 2) Suppression d'un retour client — ajoute la journalisation
-- ----------------------------------------------------------------------------
create or replace function public.supprimer_retour_client(p_retour_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_retour record;
  v_stock_actuel numeric;
begin
  if p_pin is null or not public.verifier_pin_securite(p_pin) then
    raise exception 'Code PIN incorrect.';
  end if;

  select * into v_retour from public.retours_clients where id = p_retour_id for update;
  if v_retour is null then
    raise exception 'Retour introuvable.';
  end if;

  perform 1 from public.stocks
  where article_id = v_retour.article_id and emplacement_id = v_retour.emplacement_id
  for update;

  select coalesce(sum(quantite), 0) into v_stock_actuel
  from public.stocks
  where article_id = v_retour.article_id and emplacement_id = v_retour.emplacement_id;

  if v_stock_actuel < v_retour.quantite then
    raise exception 'Impossible de supprimer : le stock restitué a déjà été utilisé ailleurs.';
  end if;

  perform * from public.consommer_stock_fifo(
    v_retour.article_id, v_retour.emplacement_id, v_retour.quantite, null
  );

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, document_id, reference_document, observation
  ) values (
    v_retour.article_id, v_retour.emplacement_id, 'autre_sortie', -v_retour.quantite,
    'suppression_retour_client', p_retour_id, v_retour.reference,
    'Annulation du retour client (suppression)'
  );

  insert into public.historique (
    utilisateur_id, action, table_cible, enregistrement_id, description
  ) values (
    auth.uid(), 'suppression', 'retours_clients', p_retour_id,
    'Suppression du retour client ' || v_retour.reference || ' (code PIN)'
  );

  delete from public.retours_clients where id = p_retour_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Suppression d'un paiement (vente ou conteneur) — journalisée
-- ----------------------------------------------------------------------------
create or replace function public.supprimer_paiement_vente(p_paiement_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public
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
    'Suppression d''un paiement de ' || v_paiement.montant || ' FCFA (code PIN)'
  );

  delete from public.paiements_ventes where id = p_paiement_id;
end;
$$;

create or replace function public.supprimer_paiement_conteneur(p_paiement_id uuid, p_pin text)
returns void
language plpgsql
security definer set search_path = public
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
    'Suppression d''un paiement de ' || v_paiement.montant || ' FCFA (code PIN)'
  );

  delete from public.paiements_conteneurs where id = p_paiement_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Suppression d'un inventaire — journalisée
-- ----------------------------------------------------------------------------
create or replace function public.supprimer_inventaire(p_inventaire_id uuid, p_pin text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_inventaire record;
  v_ligne record;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  select * into v_inventaire from public.inventaires where id = p_inventaire_id for update;

  if v_inventaire is null then
    raise exception 'Inventaire introuvable.';
  end if;

  if v_inventaire.statut = 'Validé' then
    if p_pin is null or not public.verifier_pin_securite(p_pin) then
      raise exception 'Code PIN incorrect.';
    end if;

    for v_ligne in
      select * from public.inventaire_lignes
      where inventaire_id = p_inventaire_id and ecart <> 0
    loop
      update public.stocks
      set quantite = quantite - v_ligne.ecart
      where article_id = v_ligne.article_id
        and emplacement_id = v_inventaire.emplacement_id
        and conteneur_id = v_stock_initial_id;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, reference_document, observation
      ) values (
        v_ligne.article_id, v_inventaire.emplacement_id, 'ajustement_inventaire',
        -v_ligne.ecart, 'suppression_inventaire', v_inventaire.reference,
        'Annulation suite suppression de l''inventaire'
      );
    end loop;

    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id, description
    ) values (
      auth.uid(), 'suppression', 'inventaires', p_inventaire_id,
      'Suppression de l''inventaire validé ' || v_inventaire.reference || ' (code PIN, stock restitué)'
    );
  else
    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id, description
    ) values (
      auth.uid(), 'suppression', 'inventaires', p_inventaire_id,
      'Suppression du brouillon d''inventaire ' || v_inventaire.reference
    );
  end if;

  delete from public.inventaires where id = p_inventaire_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) TEMPS RÉEL — l'Historique doit aussi se rafraîchir automatiquement.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'historique'
  ) then
    execute 'alter publication supabase_realtime add table public.historique;';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6) TEMPS RÉEL — retours clients, oublié de la liste initiale.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'retours_clients'
  ) then
    execute 'alter publication supabase_realtime add table public.retours_clients;';
  end if;
end $$;
