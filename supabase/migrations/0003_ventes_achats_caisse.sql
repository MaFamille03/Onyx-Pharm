-- ============================================================================
-- ONYX PHARM — Migration 0003 : Achats, Ventes, Devis, Retours,
-- Caisse (encaissements/décaissements), numérotation des documents
-- ============================================================================

-- ----------------------------------------------------------------------------
-- NUMÉROTATION DES DOCUMENTS (section 73)
-- Génère des références uniques du type FAC-2026-00001, incrémentées de
-- façon atomique (sûr en cas d'utilisateurs simultanés — section 81).
-- ----------------------------------------------------------------------------
create table public.numero_sequences (
  prefixe text not null,
  annee integer not null,
  dernier_numero integer not null default 0,
  primary key (prefixe, annee)
);

create function public.generer_numero_document(p_prefixe text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_annee integer := extract(year from now());
  v_numero integer;
begin
  insert into public.numero_sequences (prefixe, annee, dernier_numero)
  values (p_prefixe, v_annee, 1)
  on conflict (prefixe, annee)
  do update set dernier_numero = public.numero_sequences.dernier_numero + 1
  returning dernier_numero into v_numero;

  return p_prefixe || '-' || v_annee || '-' || lpad(v_numero::text, 5, '0');
end;
$$;

comment on function public.generer_numero_document is
  'Utilisation : select generer_numero_document(''FAC''); Préfixes : DEV, FAC, ACH, ENC, DEC, TRF, INV.';

-- ----------------------------------------------------------------------------
-- ACHATS (sections 29-33)
-- ----------------------------------------------------------------------------
create table public.achats (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  fournisseur_id uuid not null references public.fournisseurs(id),
  date_achat date not null default current_date,
  montant_total numeric(14, 2) not null default 0,
  montant_paye numeric(14, 2) not null default 0,
  statut text not null default 'Brouillon',
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.lignes_achats (
  id uuid primary key default gen_random_uuid(),
  achat_id uuid not null references public.achats(id) on delete cascade,
  article_id uuid not null references public.articles(id),
  emplacement_destination_id uuid references public.emplacements(id),
  quantite numeric(14, 2) not null check (quantite > 0),
  prix_achat_unitaire numeric(14, 2) not null,
  montant_ligne numeric(14, 2) generated always as (quantite * prix_achat_unitaire) stored,
  recu boolean not null default false
);

create table public.paiements_achats (
  id uuid primary key default gen_random_uuid(),
  achat_id uuid not null references public.achats(id) on delete cascade,
  montant numeric(14, 2) not null check (montant > 0),
  mode_paiement text not null,
  date_paiement date not null default current_date,
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index idx_lignes_achats_achat on public.lignes_achats (achat_id);
create index idx_paiements_achats_achat on public.paiements_achats (achat_id);
create index idx_achats_fournisseur on public.achats (fournisseur_id);

-- ----------------------------------------------------------------------------
-- VENTES (sections 34-42)
-- Chaque ligne conserve un instantané des prix au moment de la vente
-- (sections 37, 89) : une modification ultérieure de l'article n'affecte
-- jamais une vente déjà enregistrée.
-- ----------------------------------------------------------------------------
create table public.ventes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  client_id uuid references public.clients(id),
  date_vente date not null default current_date,
  montant_total numeric(14, 2) not null default 0,
  montant_paye numeric(14, 2) not null default 0,
  statut text not null default 'Brouillon',
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.lignes_ventes (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes(id) on delete cascade,
  article_id uuid not null references public.articles(id),
  emplacement_id uuid not null references public.emplacements(id),
  quantite numeric(14, 2) not null check (quantite > 0),
  prix_achat_reference numeric(14, 2) not null,
  prix_vente_conseille_reference numeric(14, 2) not null,
  prix_vente_reel numeric(14, 2) not null,
  remise numeric(14, 2) not null default 0,
  montant_ligne numeric(14, 2) generated always as (quantite * prix_vente_reel - remise) stored,
  marge_ligne numeric(14, 2) generated always as (quantite * (prix_vente_reel - prix_achat_reference) - remise) stored
);

create table public.paiements_ventes (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes(id) on delete cascade,
  montant numeric(14, 2) not null check (montant > 0),
  mode_paiement text not null,
  date_paiement date not null default current_date,
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index idx_lignes_ventes_vente on public.lignes_ventes (vente_id);
create index idx_paiements_ventes_vente on public.paiements_ventes (vente_id);
create index idx_ventes_client on public.ventes (client_id);

-- ----------------------------------------------------------------------------
-- DEVIS (section 5, menu Ventes > Devis)
-- ----------------------------------------------------------------------------
create table public.devis (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  client_id uuid references public.clients(id),
  date_devis date not null default current_date,
  montant_total numeric(14, 2) not null default 0,
  statut text not null default 'Brouillon',
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.lignes_devis (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis(id) on delete cascade,
  article_id uuid not null references public.articles(id),
  quantite numeric(14, 2) not null check (quantite > 0),
  prix_unitaire numeric(14, 2) not null,
  montant_ligne numeric(14, 2) generated always as (quantite * prix_unitaire) stored
);

-- ----------------------------------------------------------------------------
-- RETOURS (section 44)
-- ----------------------------------------------------------------------------
create table public.retours_clients (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  vente_id uuid references public.ventes(id),
  article_id uuid not null references public.articles(id),
  emplacement_id uuid not null references public.emplacements(id),
  quantite numeric(14, 2) not null check (quantite > 0),
  motif text,
  montant_impact numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.retours_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  achat_id uuid references public.achats(id),
  article_id uuid not null references public.articles(id),
  emplacement_id uuid not null references public.emplacements(id),
  quantite numeric(14, 2) not null check (quantite > 0),
  motif text,
  montant_impact numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

-- ----------------------------------------------------------------------------
-- CAISSE — ENCAISSEMENTS / DÉCAISSEMENTS (sections 45-51)
-- ----------------------------------------------------------------------------
create table public.encaissements (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  date_operation date not null default current_date,
  montant numeric(14, 2) not null check (montant > 0),
  mode_paiement text not null,
  client_id uuid references public.clients(id),
  vente_id uuid references public.ventes(id),
  categorie text,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.decaissements (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  date_operation date not null default current_date,
  montant numeric(14, 2) not null check (montant > 0),
  mode_paiement text not null,
  fournisseur_id uuid references public.fournisseurs(id),
  achat_id uuid references public.achats(id),
  categorie text,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index idx_encaissements_date on public.encaissements (date_operation desc);
create index idx_decaissements_date on public.decaissements (date_operation desc);

-- ----------------------------------------------------------------------------
-- VUES DE CALCUL — Créances clients & Dettes fournisseurs (sections 32, 43)
-- Toujours dérivées des ventes/achats + paiements : jamais stockées en dur.
-- ----------------------------------------------------------------------------
create view public.v_creances_clients as
select
  v.id as vente_id,
  v.reference,
  v.client_id,
  v.montant_total,
  coalesce(sum(p.montant), 0) as montant_paye,
  v.montant_total - coalesce(sum(p.montant), 0) as creance
from public.ventes v
left join public.paiements_ventes p on p.vente_id = v.id
where v.statut <> 'Annulé'
group by v.id
having v.montant_total - coalesce(sum(p.montant), 0) > 0;

create view public.v_dettes_fournisseurs as
select
  a.id as achat_id,
  a.reference,
  a.fournisseur_id,
  a.montant_total,
  coalesce(sum(p.montant), 0) as montant_paye,
  a.montant_total - coalesce(sum(p.montant), 0) as dette
from public.achats a
left join public.paiements_achats p on p.achat_id = a.id
where a.statut <> 'Annulé'
group by a.id
having a.montant_total - coalesce(sum(p.montant), 0) > 0;
