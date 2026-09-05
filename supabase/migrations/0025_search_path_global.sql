-- ============================================================================
-- ONYX PHARM — Migration 0025 : Applique la correction "extensions" à
-- TOUTES les fonctions du projet (pas seulement les 4 qui en avaient
-- strictement besoin)
--
-- La migration 0024 a corrigé les 4 fonctions qui utilisaient crypt()/
-- gen_salt() directement. Cette migration-ci va plus loin, comme demandé :
-- elle élargit le chemin de recherche (search_path) de TOUTES les
-- fonctions du schéma public pour inclure "extensions", afin qu'aucune
-- fonction actuelle ou future ne puisse un jour reproduire ce type de
-- problème, même si elle vient à utiliser une fonction d'extension
-- PostgreSQL (pgcrypto ou autre) sans qu'on y pense.
--
-- Sans risque : ALTER FUNCTION ... SET search_path ne change ni le code
-- ni le comportement d'une fonction, seulement l'endroit où elle est
-- autorisée à chercher les fonctions qu'elle appelle.
-- ============================================================================

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
      'alter function public.%I(%s) set search_path = public, extensions;',
      r.nom, r.args
    );
  end loop;
end $$;
