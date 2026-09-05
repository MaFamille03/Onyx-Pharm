-- ============================================================================
-- ONYX PHARM — Migration 0004 : Historique global & Row Level Security
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HISTORIQUE GLOBAL (sections 9, 72) — journal d'audit
-- ----------------------------------------------------------------------------
create table public.historique (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid references public.profiles(id),
  action text not null check (action in ('creation', 'modification', 'validation', 'annulation')),
  table_cible text not null,
  enregistrement_id uuid,
  ancienne_valeur jsonb,
  nouvelle_valeur jsonb,
  description text,
  created_at timestamptz not null default now()
);

create index idx_historique_table on public.historique (table_cible, enregistrement_id);
create index idx_historique_date on public.historique (created_at desc);
create index idx_historique_utilisateur on public.historique (utilisateur_id);

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Conformément à la section 6 du cahier des charges : tous les utilisateurs
-- connectés (authenticated) partagent les mêmes données et fonctionnalités.
-- Il n'y a donc pas de cloisonnement entre comptes à ce stade — seule
-- l'authentification est vérifiée. Le second mot de passe (section 8) et les
-- règles d'annulation (section 75) seront appliqués côté application.
-- ============================================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles', 'emplacements', 'categories', 'sous_categories',
      'fournisseurs', 'clients', 'parametres_options', 'parametres_generaux',
      'articles', 'stocks', 'mouvements_stock', 'transferts',
      'inventaires', 'inventaire_lignes',
      'achats', 'lignes_achats', 'paiements_achats',
      'ventes', 'lignes_ventes', 'paiements_ventes',
      'devis', 'lignes_devis',
      'retours_clients', 'retours_fournisseurs',
      'encaissements', 'decaissements',
      'historique', 'numero_sequences'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format(
      'create policy "Lecture utilisateurs connectés" on public.%I for select to authenticated using (true);',
      t
    );
    execute format(
      'create policy "Écriture utilisateurs connectés" on public.%I for insert to authenticated with check (true);',
      t
    );
    execute format(
      'create policy "Modification utilisateurs connectés" on public.%I for update to authenticated using (true) with check (true);',
      t
    );
    execute format(
      'create policy "Suppression utilisateurs connectés" on public.%I for delete to authenticated using (true);',
      t
    );
  end loop;
end $$;

-- Cas particulier : chaque utilisateur ne modifie que son propre profil,
-- mais tout le monde peut lire les profils (pour afficher "créé par X").
drop policy if exists "Modification utilisateurs connectés" on public.profiles;
create policy "Un utilisateur modifie son propre profil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
