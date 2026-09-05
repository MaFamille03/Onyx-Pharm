-- ============================================================================
-- ONYX PHARM — Migration 0015 : Conteneurs (fondations)
--
-- Restructure le stock pour qu'il soit suivi PAR CONTENEUR (lot d'entrée),
-- tout en conservant à l'écran l'affichage global habituel (quantité
-- totale par article/emplacement, inchangée pour l'utilisateur).
--
-- Chaque article en stock est désormais rattaché à un conteneur, qui
-- porte un prix d'achat GLOBAL (jamais par article). Le stock déjà
-- existant devient un conteneur spécial "Stock Initial", créé
-- automatiquement ci-dessous.
--
-- IMPORTANT — étape transitoire : tant que l'étape 2 (arrivée de
-- nouveaux conteneurs) n'est pas livrée, tout le stock réel continue de
-- vivre dans "Stock Initial". Les fonctions ci-dessous préparent déjà la
-- structure multi-conteneurs (vérifications de disponibilité basées sur
-- le TOTAL tous conteneurs confondus), mais les écritures (sorties,
-- réceptions) ciblent encore "Stock Initial" par défaut. La répartition
-- intelligente entre conteneurs (FIFO) sera mise en place à l'étape 3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE CONTENEURS
-- ----------------------------------------------------------------------------
create table public.conteneurs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  fournisseur_id uuid references public.fournisseurs(id),
  date_arrivee date not null default current_date,
  montant_achat_global numeric(14, 2) not null default 0,
  statut text not null default 'Actif',
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

comment on table public.conteneurs is
  'Lot d''entrée de marchandise (conteneur réel, ou "Stock Initial" pour le stock antérieur). Porte un prix d''achat global, jamais réparti par article.';
comment on column public.conteneurs.montant_achat_global is
  'Montant total facturé pour tout le contenu du conteneur, saisi directement — jamais calculé à partir des articles.';

alter table public.conteneurs enable row level security;
create policy "Lecture utilisateurs connectés" on public.conteneurs for select to authenticated using (true);
create policy "Écriture utilisateurs connectés" on public.conteneurs for insert to authenticated with check (true);
create policy "Modification utilisateurs connectés" on public.conteneurs for update to authenticated using (true) with check (true);
create policy "Suppression utilisateurs connectés" on public.conteneurs for delete to authenticated using (true);

-- Le conteneur "Stock Initial" : représente tout le stock enregistré
-- avant la mise en place du suivi par conteneur. Son montant d'achat
-- global n'est pas connu rétroactivement — laissé à 0, modifiable
-- manuellement dans l'application si cette information est retrouvée.
insert into public.conteneurs (code, date_arrivee, montant_achat_global, statut, observation)
values (
  'STOCK-INITIAL',
  current_date,
  0,
  'Actif',
  'Conteneur technique regroupant tout le stock enregistré avant la mise en place du suivi par conteneur.'
)
on conflict (code) do nothing;

create function public.get_stock_initial_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select id from public.conteneurs where code = 'STOCK-INITIAL';
$$;

grant execute on function public.get_stock_initial_id() to authenticated;

-- ----------------------------------------------------------------------------
-- RESTRUCTURATION DE LA TABLE STOCKS
-- Un article peut désormais avoir plusieurs lignes de stock pour un même
-- emplacement (une par conteneur). L'affichage global (somme) reste
-- identique pour l'utilisateur.
-- ----------------------------------------------------------------------------
alter table public.stocks add column if not exists conteneur_id uuid references public.conteneurs(id);

update public.stocks
set conteneur_id = public.get_stock_initial_id()
where conteneur_id is null;

alter table public.stocks drop constraint if exists stocks_article_id_emplacement_id_key;
alter table public.stocks add constraint stocks_article_emplacement_conteneur_key
  unique (article_id, emplacement_id, conteneur_id);
alter table public.stocks alter column conteneur_id set not null;

create index if not exists idx_stocks_conteneur on public.stocks (conteneur_id);

-- ============================================================================
-- MISE À JOUR DES FONCTIONS EXISTANTES
-- Toutes les fonctions qui lisaient/écrivaient "stocks" via la clé
-- (article_id, emplacement_id) doivent être adaptées à la nouvelle clé
-- (article_id, emplacement_id, conteneur_id). Le contrôle de
-- disponibilité se fait désormais sur le TOTAL tous conteneurs confondus
-- (verrouillage explicite des lignes concernées avant la somme, "FOR
-- UPDATE" n'étant pas compatible avec une fonction d'agrégation).
-- ============================================================================

-- ---- Transferts (remplace la version de la migration 0005) ----------------
create or replace function public.effectuer_transfert(
  p_article_id uuid,
  p_source_id uuid,
  p_destination_id uuid,
  p_quantite numeric,
  p_observation text,
  p_utilisateur_id uuid
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_stock_source numeric;
  v_reference text;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  if p_quantite <= 0 then
    raise exception 'La quantité à transférer doit être supérieure à zéro.';
  end if;

  if p_source_id = p_destination_id then
    raise exception 'L''emplacement source et destination doivent être différents.';
  end if;

  perform 1 from public.stocks
  where article_id = p_article_id and emplacement_id = p_source_id
  for update;

  select coalesce(sum(quantite), 0) into v_stock_source
  from public.stocks
  where article_id = p_article_id and emplacement_id = p_source_id;

  if v_stock_source < p_quantite then
    raise exception 'Stock insuffisant à l''emplacement source (disponible : %).', v_stock_source;
  end if;

  v_reference := public.generer_numero_document('TRF');

  insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
  values (p_article_id, p_source_id, v_stock_initial_id, 0)
  on conflict (article_id, emplacement_id, conteneur_id) do nothing;

  update public.stocks
  set quantite = quantite - p_quantite
  where article_id = p_article_id and emplacement_id = p_source_id and conteneur_id = v_stock_initial_id;

  insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
  values (p_article_id, p_destination_id, v_stock_initial_id, p_quantite)
  on conflict (article_id, emplacement_id, conteneur_id)
  do update set quantite = public.stocks.quantite + p_quantite;

  insert into public.transferts (
    reference, article_id, emplacement_source_id, emplacement_destination_id,
    quantite, statut, observation, created_by
  ) values (
    v_reference, p_article_id, p_source_id, p_destination_id,
    p_quantite, 'Validé', p_observation, p_utilisateur_id
  );

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, reference_document, observation, created_by
  ) values
    (p_article_id, p_source_id, 'transfert_sortant', -p_quantite,
     'transfert', v_reference, p_observation, p_utilisateur_id),
    (p_article_id, p_destination_id, 'transfert_entrant', p_quantite,
     'transfert', v_reference, p_observation, p_utilisateur_id);

  return v_reference;
end;
$$;

-- ---- Validation d'inventaire (remplace la version de la migration 0005) ---
create or replace function public.valider_inventaire(
  p_inventaire_id uuid,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ligne record;
  v_emplacement_id uuid;
  v_reference text;
  v_statut text;
  v_stock_initial_id uuid := public.get_stock_initial_id();
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
      coalesce(v_ligne.observation, 'Ajustement suite inventaire'),
      p_utilisateur_id
    );
  end loop;

  update public.inventaires
  set statut = 'Validé', valide_at = now(), valide_by = p_utilisateur_id
  where id = p_inventaire_id;
end;
$$;

-- ---- Réception d'achat (remplace la version de la migration 0006) --------
create or replace function public.receptionner_ligne_achat(
  p_ligne_id uuid,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ligne record;
  v_achat record;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  select * into v_ligne
  from public.lignes_achats
  where id = p_ligne_id
  for update;

  if v_ligne is null then
    raise exception 'Ligne d''achat introuvable.';
  end if;

  if v_ligne.recu then
    raise exception 'Cette ligne a déjà été réceptionnée.';
  end if;

  if v_ligne.emplacement_destination_id is null then
    raise exception 'Aucun emplacement de destination défini pour cette ligne.';
  end if;

  select * into v_achat from public.achats where id = v_ligne.achat_id;

  if v_achat.statut in ('Brouillon', 'Annulé') then
    raise exception 'Impossible de réceptionner un achat en brouillon ou annulé.';
  end if;

  insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
  values (v_ligne.article_id, v_ligne.emplacement_destination_id, v_stock_initial_id, v_ligne.quantite)
  on conflict (article_id, emplacement_id, conteneur_id)
  do update set quantite = public.stocks.quantite + v_ligne.quantite;

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, document_id, reference_document, created_by
  ) values (
    v_ligne.article_id, v_ligne.emplacement_destination_id, 'achat', v_ligne.quantite,
    'achat', v_ligne.achat_id, v_achat.reference, p_utilisateur_id
  );

  update public.lignes_achats set recu = true where id = p_ligne_id;
end;
$$;

-- ---- Retour fournisseur (remplace la version de la migration 0006) -------
create or replace function public.effectuer_retour_fournisseur(
  p_achat_id uuid,
  p_article_id uuid,
  p_emplacement_id uuid,
  p_quantite numeric,
  p_motif text,
  p_montant_impact numeric,
  p_utilisateur_id uuid
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_stock_actuel numeric;
  v_reference text;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  if p_quantite <= 0 then
    raise exception 'La quantité à retourner doit être supérieure à zéro.';
  end if;

  perform 1 from public.stocks
  where article_id = p_article_id and emplacement_id = p_emplacement_id
  for update;

  select coalesce(sum(quantite), 0) into v_stock_actuel
  from public.stocks
  where article_id = p_article_id and emplacement_id = p_emplacement_id;

  if v_stock_actuel < p_quantite then
    raise exception 'Stock insuffisant à cet emplacement (disponible : %).', v_stock_actuel;
  end if;

  v_reference := public.generer_numero_document('RTF');

  insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
  values (p_article_id, p_emplacement_id, v_stock_initial_id, 0)
  on conflict (article_id, emplacement_id, conteneur_id) do nothing;

  update public.stocks
  set quantite = quantite - p_quantite
  where article_id = p_article_id and emplacement_id = p_emplacement_id and conteneur_id = v_stock_initial_id;

  insert into public.retours_fournisseurs (
    reference, achat_id, article_id, emplacement_id, quantite,
    motif, montant_impact, created_by
  ) values (
    v_reference, p_achat_id, p_article_id, p_emplacement_id, p_quantite,
    p_motif, p_montant_impact, p_utilisateur_id
  );

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, document_id, reference_document, observation, created_by
  ) values (
    p_article_id, p_emplacement_id, 'retour_fournisseur', -p_quantite,
    'retour_fournisseur', p_achat_id, v_reference, p_motif, p_utilisateur_id
  );

  return v_reference;
end;
$$;

-- ---- Validation de vente (remplace la version de la migration 0007) ------
create or replace function public.valider_vente(
  p_vente_id uuid,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ligne record;
  v_vente record;
  v_stock_actuel numeric;
  v_designation text;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  select * into v_vente from public.ventes where id = p_vente_id for update;

  if v_vente is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_vente.statut <> 'Brouillon' then
    raise exception 'Cette vente a déjà été validée.';
  end if;

  for v_ligne in
    select * from public.lignes_ventes where vente_id = p_vente_id
  loop
    perform 1 from public.stocks
    where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_id
    for update;

    select coalesce(sum(quantite), 0) into v_stock_actuel
    from public.stocks
    where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_id;

    if v_stock_actuel < v_ligne.quantite then
      select designation into v_designation from public.articles where id = v_ligne.article_id;
      raise exception 'Stock insuffisant pour "%" (disponible : %, demandé : %).',
        v_designation, v_stock_actuel, v_ligne.quantite;
    end if;

    insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
    values (v_ligne.article_id, v_ligne.emplacement_id, v_stock_initial_id, 0)
    on conflict (article_id, emplacement_id, conteneur_id) do nothing;

    update public.stocks
    set quantite = quantite - v_ligne.quantite
    where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_id
      and conteneur_id = v_stock_initial_id;

    insert into public.mouvements_stock (
      article_id, emplacement_id, type, quantite,
      document_type, document_id, reference_document, created_by
    ) values (
      v_ligne.article_id, v_ligne.emplacement_id, 'vente', -v_ligne.quantite,
      'vente', p_vente_id, v_vente.reference, p_utilisateur_id
    );
  end loop;

  update public.ventes set statut = 'Validé' where id = p_vente_id;
end;
$$;

-- ---- Retour client (remplace la version de la migration 0007) ------------
create or replace function public.effectuer_retour_client(
  p_vente_id uuid,
  p_article_id uuid,
  p_emplacement_id uuid,
  p_quantite numeric,
  p_motif text,
  p_montant_impact numeric,
  p_utilisateur_id uuid
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_reference text;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  if p_quantite <= 0 then
    raise exception 'La quantité retournée doit être supérieure à zéro.';
  end if;

  v_reference := public.generer_numero_document('RTC');

  insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
  values (p_article_id, p_emplacement_id, v_stock_initial_id, p_quantite)
  on conflict (article_id, emplacement_id, conteneur_id)
  do update set quantite = public.stocks.quantite + p_quantite;

  insert into public.retours_clients (
    reference, vente_id, article_id, emplacement_id, quantite,
    motif, montant_impact, created_by
  ) values (
    v_reference, p_vente_id, p_article_id, p_emplacement_id, p_quantite,
    p_motif, p_montant_impact, p_utilisateur_id
  );

  insert into public.mouvements_stock (
    article_id, emplacement_id, type, quantite,
    document_type, document_id, reference_document, observation, created_by
  ) values (
    p_article_id, p_emplacement_id, 'retour_client', p_quantite,
    'retour_client', p_vente_id, v_reference, p_motif, p_utilisateur_id
  );

  return v_reference;
end;
$$;

-- ---- Annulation de vente (remplace la version de la migration 0009) ------
create or replace function public.annuler_vente(
  p_vente_id uuid,
  p_second_mdp text,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_vente record;
  v_ligne record;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  select * into v_vente from public.ventes where id = p_vente_id for update;

  if v_vente is null then
    raise exception 'Vente introuvable.';
  end if;

  if v_vente.statut = 'Annulé' then
    raise exception 'Cette vente est déjà annulée.';
  end if;

  if v_vente.statut <> 'Brouillon' then
    if p_second_mdp is null or not public.verifier_second_mot_de_passe(p_second_mdp) then
      raise exception 'Mot de passe de sécurité incorrect.';
    end if;

    for v_ligne in
      select * from public.lignes_ventes where vente_id = p_vente_id
    loop
      insert into public.stocks (article_id, emplacement_id, conteneur_id, quantite)
      values (v_ligne.article_id, v_ligne.emplacement_id, v_stock_initial_id, v_ligne.quantite)
      on conflict (article_id, emplacement_id, conteneur_id)
      do update set quantite = public.stocks.quantite + v_ligne.quantite;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, document_id, reference_document, observation, created_by
      ) values (
        v_ligne.article_id, v_ligne.emplacement_id, 'autre_entree', v_ligne.quantite,
        'annulation_vente', p_vente_id, v_vente.reference,
        'Stock restitué suite annulation de la vente', p_utilisateur_id
      );
    end loop;

    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id, description
    ) values (
      p_utilisateur_id, 'annulation', 'ventes', p_vente_id,
      'Annulation de la vente ' || v_vente.reference || ' (stock restitué)'
    );
  end if;

  update public.ventes set statut = 'Annulé' where id = p_vente_id;
end;
$$;

-- ---- Annulation d'achat (remplace la version de la migration 0009) -------
create or replace function public.annuler_achat(
  p_achat_id uuid,
  p_second_mdp text,
  p_utilisateur_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_achat record;
  v_ligne record;
  v_stock_actuel numeric;
  v_designation text;
  v_stock_initial_id uuid := public.get_stock_initial_id();
begin
  select * into v_achat from public.achats where id = p_achat_id for update;

  if v_achat is null then
    raise exception 'Achat introuvable.';
  end if;

  if v_achat.statut = 'Annulé' then
    raise exception 'Cet achat est déjà annulé.';
  end if;

  if v_achat.statut <> 'Brouillon' then
    if p_second_mdp is null or not public.verifier_second_mot_de_passe(p_second_mdp) then
      raise exception 'Mot de passe de sécurité incorrect.';
    end if;

    for v_ligne in
      select * from public.lignes_achats where achat_id = p_achat_id and recu = true
    loop
      perform 1 from public.stocks
      where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_destination_id
      for update;

      select coalesce(sum(quantite), 0) into v_stock_actuel
      from public.stocks
      where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_destination_id;

      if v_stock_actuel < v_ligne.quantite then
        select designation into v_designation from public.articles where id = v_ligne.article_id;
        raise exception 'Impossible d''annuler : le stock de "%" a déjà été utilisé ailleurs.', v_designation;
      end if;

      update public.stocks
      set quantite = quantite - v_ligne.quantite
      where article_id = v_ligne.article_id and emplacement_id = v_ligne.emplacement_destination_id
        and conteneur_id = v_stock_initial_id;

      insert into public.mouvements_stock (
        article_id, emplacement_id, type, quantite,
        document_type, document_id, reference_document, observation, created_by
      ) values (
        v_ligne.article_id, v_ligne.emplacement_destination_id, 'autre_sortie', -v_ligne.quantite,
        'annulation_achat', p_achat_id, v_achat.reference,
        'Stock retiré suite annulation de l''achat', p_utilisateur_id
      );
    end loop;

    insert into public.historique (
      utilisateur_id, action, table_cible, enregistrement_id, description
    ) values (
      p_utilisateur_id, 'annulation', 'achats', p_achat_id,
      'Annulation de l''achat ' || v_achat.reference
    );
  end if;

  update public.achats set statut = 'Annulé' where id = p_achat_id;
end;
$$;
