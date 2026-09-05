-- ============================================================================
-- ONYX PHARM — Migration 0026 : CORRECTION CRITIQUE — la table historique
-- n'acceptait pas la valeur 'suppression'
--
-- CAUSE EXACTE DU BUG (confirmée en relisant le schéma, pas supposée)
-- La table "historique" a été créée avec cette contrainte :
--
--   action text not null check (action in
--     ('creation', 'modification', 'validation', 'annulation'))
--
-- Or TOUTES les fonctions de suppression protégée écrites depuis
-- (article, retour client, paiement de vente, paiement de conteneur,
-- inventaire, conteneur) tentent d'enregistrer une ligne d'historique
-- avec action = 'suppression' — une valeur que la contrainte refuse.
--
-- Résultat concret : dès que l'une de ces fonctions essaie de
-- journaliser la suppression, PostgreSQL rejette l'insertion pour
-- violation de contrainte — et comme cette écriture fait partie de la
-- même transaction que la suppression elle-même, TOUTE l'opération est
-- annulée. C'est la cause exacte de "je n'arrive pas à supprimer"
-- rencontrée sur les inventaires, les retours, les paiements et les
-- conteneurs.
--
-- CORRECTION : élargir la contrainte pour autoriser 'suppression',
-- sans rien retirer ni modifier d'autre.
-- ============================================================================

alter table public.historique drop constraint if exists historique_action_check;

alter table public.historique add constraint historique_action_check
  check (action in ('creation', 'modification', 'validation', 'annulation', 'suppression'));
