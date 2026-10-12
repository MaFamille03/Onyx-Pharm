# Base de données Supabase — ONYX PHARM

Ce dossier contient les migrations SQL qui créent l'intégralité de la base
de données (tables, relations, sécurité). Elles sont numérotées et doivent
être exécutées **dans l'ordre**.

## Comment exécuter les migrations

1. Allez sur [supabase.com](https://supabase.com) → votre projet
   `onyx-pharm`
2. Dans le menu de gauche, cliquez sur **SQL Editor**
3. Cliquez **New query**
4. Ouvrez le fichier `migrations/0001_reference_data.sql` (avec le Bloc-
   notes, VS Code, ou n'importe quel éditeur de texte), copiez tout son
   contenu
5. Collez-le dans l'éditeur SQL de Supabase
6. Cliquez **Run** (ou `Ctrl+Entrée` / `Cmd+Entrée`)
7. Vous devez voir **Success. No rows returned**
8. Répétez les étapes 3 à 7 pour :
   - `0002_articles_stock.sql`
   - `0003_ventes_achats_caisse.sql`
   - `0004_historique_rls.sql`

**Important : respectez l'ordre.** Chaque fichier dépend des tables créées
par le précédent.

## Vérifier que tout s'est bien passé

1. Dans le menu de gauche, cliquez sur **Table Editor**
2. Vous devez voir apparaître une trentaine de tables : `profiles`,
   `emplacements`, `categories`, `articles`, `stocks`, `ventes`, `achats`,
   `encaissements`, `decaissements`, `historique`, etc.
3. Ouvrez la table `emplacements` : vous devez voir 3 lignes déjà présentes
   — **Bureau**, **Entrepôt**, **Domicile de la patronne**
4. Ouvrez la table `parametres_options` : vous devez voir les statuts,
   modes de paiement, etc. déjà pré-remplis

## En cas d'erreur

Si un script affiche une erreur en rouge :

1. Notez le message d'erreur complet
2. Vérifiez que vous avez bien exécuté les fichiers **dans l'ordre** (0001
   avant 0002, etc.)
3. Si un fichier a été exécuté deux fois par erreur, vous aurez des erreurs
   du type `relation "xxx" already exists` — c'est normal, ignorez-le si le
   reste s'est bien passé, ou repartez d'un projet Supabase neuf si vous
   n'êtes pas sûr

## Ce que ces migrations créent

| Fichier | Contenu |
|---|---|
| `0001_reference_data.sql` | Profils utilisateurs, emplacements, catégories/sous-catégories, clients, fournisseurs, paramètres configurables |
| `0002_articles_stock.sql` | Articles, stock par emplacement, mouvements de stock, transferts, inventaires |
| `0003_ventes_achats_caisse.sql` | Achats, ventes, devis, retours, encaissements/décaissements, numérotation automatique des documents (FAC-2026-00001...) |
| `0004_historique_rls.sql` | Journal d'historique + sécurité (Row Level Security) : seuls les utilisateurs connectés peuvent lire/écrire les données |
| `0005_transferts_inventaires_fonctions.sql` | Fonctions sécurisées pour les transferts et la validation d'inventaires (protection contre les accès simultanés) |
| `0006_achats_fonctions.sql` | Réception d'achat, retours fournisseurs, synchronisation automatique des paiements et du statut des achats |
| `0007_ventes_fonctions.sql` | Validation atomique des ventes (interdiction du stock négatif), retours clients, synchronisation automatique des paiements et du statut des ventes |
| `0008_caisse_liaisons.sql` | Liaison automatique vente→encaissement et achat→décaissement, solde de caisse initial |
| `0009_securite_annulations.sql` | Second mot de passe de sécurité (haché), annulation sécurisée des ventes/achats avec réversion du stock, historique automatique des changements de prix |
| `0010_audit_privileges.sql` | **Correction critique** : accorde au rôle `authenticated` les privilèges PostgreSQL nécessaires sur toutes les tables (corrige les erreurs 403 / `permission denied`), avec privilèges par défaut pour les futures tables |
| `0011_catalogue_onyx_pharm.sql` | Intègre le catalogue réel ONYX PHARM : ~130 articles et 21 catégories |
| `0012_comptes_entreprise.sql` | Statut de compte (Actif/Désactivé/Supprimé), informations entreprise et entrepôt |
| `0014_reparation_profils.sql` | Répare les comptes créés avant l'existence de la table des profils |
| `0015_conteneurs.sql` | **Restructuration majeure** : le stock est désormais suivi par conteneur (lot d'entrée), avec un conteneur technique "Stock Initial" regroupant tout le stock antérieur |
| `0016_creation_conteneur.sql` | Création atomique d'un conteneur avec toutes ses lignes de stock (saisie manuelle + import Excel) |
| `0017_conteneurs_paiements_fifo.sql` | **Remplacement complet des Achats** : prix d'achat du conteneur optionnel, paiements et statut liés au conteneur (sans rapport avec les ventes), décaissement automatique, et sorties de stock en FIFO multi-conteneurs avec ciblage manuel possible |
| `0018_cout_revient_conteneurs.sql` | Coût de revient par conteneur (calculé à la volée, une fois entièrement écoulé), date de conception du site |
| `0019_pin_securite_paiements.sql` | Code PIN à 4 chiffres, cohérence paiement ↔ caisse, suppression sécurisée des brouillons/paiements/retours |
| `0020_inventaire_realtime.sql` | Date d'inventaire, suppression sécurisée d'un inventaire, **activation du temps réel (Supabase Realtime)** |
| `0021_journalisation_suppressions.sql` | Journalisation dans l'Historique de toutes les suppressions sensibles (articles, paiements, retours, inventaires) |
| `0022_modifier_supprimer_conteneur.sql` | Modifier un conteneur (code, fournisseur, date, montant, observation) et le supprimer (protégé par PIN, refusé s'il reste du stock ou s'il a déjà servi à une vente) |

Il n'y a pas de nouveau fichier SQL pour l'étape 10 : elle s'appuie
entièrement sur les tables et vues déjà créées.

## Sécurité (Row Level Security)

Chaque table est protégée : **seuls les utilisateurs connectés** à
l'application peuvent lire ou modifier les données (personne d'anonyme ne
peut y accéder directement). Conformément au cahier des charges, tous les
comptes connectés partagent les mêmes données — il n'y a pas de
restriction entre utilisateurs à ce stade, seule la traçabilité (qui a fait
quoi) est assurée via la colonne `created_by` et la table `historique`.
