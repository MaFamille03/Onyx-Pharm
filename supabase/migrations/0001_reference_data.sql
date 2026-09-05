-- ============================================================================
-- ONYX PHARM — Migration 0001 : Extensions, profils utilisateurs,
-- données de référence (emplacements, catégories, paramètres configurables)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- PROFILS UTILISATEURS
-- Étend auth.users (géré par Supabase) avec les infos propres à l'application.
-- Un profil est créé automatiquement à chaque inscription (trigger plus bas).
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nom_complet text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Identifie chaque utilisateur pour la traçabilité (section 6 et 9 du cahier des charges).';

-- Création automatique du profil à l'inscription
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- EMPLACEMENTS DE STOCK (section 10)
-- Enregistrés en base, jamais codés en dur dans l'interface. Extensible.
-- ----------------------------------------------------------------------------
create table public.emplacements (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.emplacements (nom) values
  ('Bureau'),
  ('Entrepôt'),
  ('Domicile de la patronne');

-- ----------------------------------------------------------------------------
-- CATÉGORIES / SOUS-CATÉGORIES (section 17)
-- ----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sous_categories (
  id uuid primary key default gen_random_uuid(),
  categorie_id uuid not null references public.categories(id) on delete cascade,
  nom text not null,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (categorie_id, nom)
);

-- ----------------------------------------------------------------------------
-- FOURNISSEURS & CLIENTS (sections 18-19)
-- ----------------------------------------------------------------------------
create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text,
  email text,
  adresse text,
  observations text,
  statut text not null default 'Actif',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text,
  email text,
  adresse text,
  observations text,
  statut text not null default 'Actif',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

-- ----------------------------------------------------------------------------
-- PARAMÈTRES CONFIGURABLES (section 90)
-- Listes d'options modifiables sans toucher au code : statuts d'article,
-- modes de paiement, statuts d'opération, catégories de caisse.
-- ----------------------------------------------------------------------------
create table public.parametres_options (
  id uuid primary key default gen_random_uuid(),
  groupe text not null,
  valeur text not null,
  ordre integer not null default 0,
  actif boolean not null default true,
  unique (groupe, valeur)
);

comment on column public.parametres_options.groupe is
  'statut_article | mode_paiement | statut_operation | categorie_caisse | type_mouvement_stock';

insert into public.parametres_options (groupe, valeur, ordre) values
  ('statut_article', 'Actif', 1),
  ('statut_article', 'Inactif', 2),
  ('statut_article', 'Épuisé', 3),
  ('statut_article', 'Expiré', 4),
  ('statut_article', 'Archivé', 5),
  ('mode_paiement', 'Espèces', 1),
  ('mode_paiement', 'Banque', 2),
  ('mode_paiement', 'Mobile Money', 3),
  ('mode_paiement', 'Autre', 4),
  ('statut_operation', 'Brouillon', 1),
  ('statut_operation', 'Validé', 2),
  ('statut_operation', 'Payé', 3),
  ('statut_operation', 'Partiellement payé', 4),
  ('statut_operation', 'Annulé', 5),
  ('categorie_caisse', 'Vente', 1),
  ('categorie_caisse', 'Achat', 2),
  ('categorie_caisse', 'Dépense', 3),
  ('categorie_caisse', 'Autre', 4);

-- Réglages généraux à valeur unique (clé/valeur), ex : délai d'alerte
-- d'expiration, opérations protégées par le second mot de passe (section 8).
create table public.parametres_generaux (
  cle text primary key,
  valeur jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.parametres_generaux (cle, valeur) values
  ('delai_alerte_expiration_jours', '30'),
  ('operations_protegees_second_mdp', '["modifier_parametres_sensibles", "supprimer_operation", "corriger_stock_manuellement"]');
