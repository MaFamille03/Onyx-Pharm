-- ============================================================================
-- ONYX PHARM — Migration 0002 : Articles, Stock, Mouvements,
-- Transferts, Inventaires
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ARTICLES (section 11)
-- La quantité en stock N'EST PAS stockée ici : elle vit dans la table
-- `stocks`, ventilée par emplacement (section 12). Le total est une somme.
-- ----------------------------------------------------------------------------
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  designation text not null,
  categorie_id uuid references public.categories(id),
  sous_categorie_id uuid references public.sous_categories(id),
  marque text,
  fournisseur_id uuid references public.fournisseurs(id),
  stock_minimum numeric(14, 2) not null default 0,
  prix_achat numeric(14, 2) not null default 0,
  prix_vente_conseille numeric(14, 2) not null default 0,
  numero_lot text,
  date_expiration date,
  statut text not null default 'Actif',
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index idx_articles_designation on public.articles using gin (to_tsvector('french', designation));
create index idx_articles_categorie on public.articles (categorie_id);
create index idx_articles_fournisseur on public.articles (fournisseur_id);
create index idx_articles_statut on public.articles (statut);

-- Trigger générique de mise à jour de updated_at
create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_articles_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- STOCKS — quantité par article ET par emplacement (section 12)
-- ----------------------------------------------------------------------------
create table public.stocks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  emplacement_id uuid not null references public.emplacements(id),
  quantite numeric(14, 2) not null default 0,
  unique (article_id, emplacement_id),
  constraint stock_non_negatif check (quantite >= 0)
);

create index idx_stocks_article on public.stocks (article_id);
create index idx_stocks_emplacement on public.stocks (emplacement_id);

-- Vue pratique : stock total par article (somme sur tous les emplacements)
create view public.v_stock_total as
select
  article_id,
  sum(quantite) as quantite_totale
from public.stocks
group by article_id;

-- ----------------------------------------------------------------------------
-- MOUVEMENTS DE STOCK (section 22) — journal immuable de toute variation
-- ----------------------------------------------------------------------------
create table public.mouvements_stock (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id),
  emplacement_id uuid not null references public.emplacements(id),
  type text not null check (type in (
    'achat', 'vente', 'transfert_entrant', 'transfert_sortant',
    'retour_client', 'retour_fournisseur', 'ajustement_inventaire',
    'perte', 'dommage', 'autre_entree', 'autre_sortie'
  )),
  -- quantite est signée : positive pour une entrée, négative pour une sortie
  quantite numeric(14, 2) not null,
  document_type text,
  document_id uuid,
  reference_document text,
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index idx_mouvements_article on public.mouvements_stock (article_id, created_at desc);
create index idx_mouvements_document on public.mouvements_stock (document_type, document_id);

-- ----------------------------------------------------------------------------
-- TRANSFERTS ENTRE EMPLACEMENTS (sections 24-25)
-- ----------------------------------------------------------------------------
create table public.transferts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  article_id uuid not null references public.articles(id),
  emplacement_source_id uuid not null references public.emplacements(id),
  emplacement_destination_id uuid not null references public.emplacements(id),
  quantite numeric(14, 2) not null check (quantite > 0),
  statut text not null default 'Validé',
  observation text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint transfert_emplacements_distincts check (emplacement_source_id <> emplacement_destination_id)
);

-- ----------------------------------------------------------------------------
-- INVENTAIRES (sections 26-28)
-- ----------------------------------------------------------------------------
create table public.inventaires (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  emplacement_id uuid not null references public.emplacements(id),
  statut text not null default 'Brouillon',
  created_at timestamptz not null default now(),
  valide_at timestamptz,
  created_by uuid references public.profiles(id),
  valide_by uuid references public.profiles(id)
);

create table public.inventaire_lignes (
  id uuid primary key default gen_random_uuid(),
  inventaire_id uuid not null references public.inventaires(id) on delete cascade,
  article_id uuid not null references public.articles(id),
  quantite_theorique numeric(14, 2) not null,
  quantite_reelle numeric(14, 2) not null,
  ecart numeric(14, 2) generated always as (quantite_reelle - quantite_theorique) stored,
  observation text
);

create index idx_inventaire_lignes_inventaire on public.inventaire_lignes (inventaire_id);
