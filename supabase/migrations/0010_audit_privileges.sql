-- ============================================================================
-- ONYX PHARM — Migration 0010 : Audit et correction des privilèges
-- PostgreSQL pour le rôle "authenticated"
--
-- CONTEXTE DU PROBLÈME
-- Les policies RLS (migrations 0004, 0009) définissent QUI a le droit de
-- lire/écrire une ligne. Mais elles ne suffisent pas seules : PostgreSQL
-- exige EN PLUS que le rôle possède le privilège de base sur la table
-- (GRANT SELECT/INSERT/UPDATE/DELETE). Sans ce GRANT, toute requête échoue
-- avec une erreur "permission denied for table ..." (code 42501), même si
-- la policy RLS correspondante autorise l'opération.
--
-- C'est exactement l'erreur rencontrée sur la table "emplacements" :
-- la policy RLS existait, mais le GRANT manquait.
--
-- Cette migration corrige ce problème pour TOUTES les tables existantes
-- (et non uniquement "emplacements"), et configure les privilèges par
-- défaut pour que ce problème ne se reproduise jamais sur une table créée
-- ultérieurement. RLS reste actif partout : cette migration ne l'affaiblit
-- en aucune façon, elle ajoute seulement la couche de privilèges qui doit
-- fonctionner CONJOINTEMENT avec RLS (privilèges ET policies, jamais l'un
-- sans l'autre).
-- ============================================================================

-- Accès au schéma lui-même (nécessaire pour toute requête)
grant usage on schema public to authenticated;

-- Accès complet (SELECT/INSERT/UPDATE/DELETE) sur toutes les tables
-- existantes du schéma public, pour les utilisateurs connectés. RLS filtre
-- ensuite, ligne par ligne, ce que chaque requête peut réellement voir ou
-- modifier — ce GRANT ouvre seulement la porte, RLS décide qui peut entrer.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Accès aux séquences (numérotation auto-incrémentée éventuelle)
grant usage, select on all sequences in schema public to authenticated;

-- Autorise l'exécution de toutes les fonctions déjà créées (transferts,
-- inventaires, achats, ventes, sécurité...). Certaines l'étaient déjà
-- individuellement ; ce GRANT global garantit qu'aucune ne peut être
-- oubliée par erreur dans une future mise à jour.
grant execute on all functions in schema public to authenticated;

-- ----------------------------------------------------------------------------
-- PRIVILÈGES PAR DÉFAUT — pour que ce problème ne revienne jamais
--
-- Sans cela, toute NOUVELLE table ou fonction créée dans une future étape
-- du projet reproduirait exactement le même bug 42501 tant qu'un GRANT
-- explicite n'aurait pas été rejoué manuellement. Cette configuration
-- s'applique automatiquement à tout ce que le rôle propriétaire de la
-- base (postgres, celui qui exécute ces migrations) créera à l'avenir.
-- ----------------------------------------------------------------------------
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;

alter default privileges in schema public
  grant execute on functions to authenticated;

-- ----------------------------------------------------------------------------
-- VÉRIFICATION — RLS reste actif sur toutes les tables métier
--
-- Ce bloc ne modifie rien ; il s'assure simplement (par une exception
-- explicite) qu'aucune table de l'application n'a RLS désactivé. Si une
-- table listée ci-dessous devait un jour ne plus avoir RLS actif, cette
-- migration corrige la situation plutôt que de la laisser passer
-- silencieusement — la sécurité par ligne ne doit jamais être désactivée
-- globalement, même par erreur.
-- ----------------------------------------------------------------------------
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
  end loop;
end $$;
