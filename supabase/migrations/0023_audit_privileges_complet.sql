-- ============================================================================
-- ONYX PHARM — Migration 0023 : Audit global et définitif des privilèges
-- PostgreSQL (tables, séquences, fonctions)
--
-- CONTEXTE
-- La migration 0010 avait corrigé les privilèges des TABLES existant à
-- l'époque, et configuré les privilèges par défaut pour les objets créés
-- par la suite. Mais plusieurs fonctions créées depuis (paiements,
-- transferts, PIN, conteneurs...) n'ont jamais reçu de `grant execute`
-- explicite dans leur migration d'origine — une omission qui peut, selon
-- la façon dont les migrations ont été exécutées, laisser certaines
-- opérations bloquées par un refus de permission silencieux côté
-- PostgreSQL, quand bien même RLS autorise l'opération.
--
-- Cette migration ne se contente pas de corriger les fonctions
-- identifiées : elle balaie SYSTÉMATIQUEMENT toutes les tables, toutes
-- les séquences et TOUTES les fonctions du schéma public, sans exception,
-- pour garantir qu'aucune ne puisse reproduire ce problème — conformément
-- au principe : ne jamais corriger un seul symptôme, toujours auditer
-- l'ensemble.
--
-- RLS n'est ni modifié ni désactivé nulle part dans cette migration.
-- Aucune table n'est supprimée, recréée ou réinitialisée.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABLES — ré-applique le GRANT complet sur absolument toutes les
-- tables du schéma public (idempotent : sans effet si déjà accordé).
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ----------------------------------------------------------------------------
-- 2) SÉQUENCES — usage et lecture, pour toute colonne à identifiant
-- généré automatiquement.
-- ----------------------------------------------------------------------------
grant usage, select on all sequences in schema public to authenticated;

-- ----------------------------------------------------------------------------
-- 3) FONCTIONS — GRANT EXECUTE explicite sur CHAQUE fonction du schéma
-- public, une par une, quelle que soit sa signature. Ce bloc ne suppose
-- rien : il interroge le catalogue système PostgreSQL directement plutôt
-- que de se fier à une liste écrite à la main, pour ne jamais en oublier
-- une seule — passées ou futures créées par la suite.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.proname as nom, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format(
      'grant execute on function public.%I(%s) to authenticated;',
      r.nom, r.args
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4) PRIVILÈGES PAR DÉFAUT — ré-affirmés pour que toute future table,
-- séquence ou fonction créée dans le schéma public reçoive automatiquement
-- les mêmes privilèges, sans jamais avoir à rejouer cette migration.
-- ----------------------------------------------------------------------------
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;

alter default privileges in schema public
  grant execute on functions to authenticated;

-- ----------------------------------------------------------------------------
-- 5) VÉRIFICATION — confirme que RLS reste actif sur toutes les tables
-- métier (ne désactive jamais, ne fait que constater et corriger si une
-- table s'était retrouvée sans RLS actif par erreur).
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;
