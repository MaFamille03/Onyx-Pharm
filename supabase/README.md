# Base de données Supabase — ONYX PHARM

Ce dossier contient les migrations SQL qui créent l'intégralité de la base
de données (tables, relations, sécurité). Elles sont numérotées et doivent
être exécutées **dans l'ordre**.


## Migration 0045 — Mode multi-entreprises (même base Supabase)

Si votre projet contient déjà les migrations jusqu'à `0044_import_ventes_excel_atomique.sql`, exécutez **une seule fois** `migrations/0045_multi_entreprises.sql` dans Supabase → SQL Editor. Ne rejouez pas les migrations précédentes sur une base déjà utilisée.

Cette migration rattache les données actuelles à l'entreprise par défaut **ONYX PHARM SARL**, ajoute l'isolation par entreprise sur les tables métier, et modifie les politiques RLS. Les données existantes ne sont pas supprimées.

Après déploiement :

1. Connectez-vous avec votre compte actuel : ses données restent dans l'espace ONYX PHARM.
2. Ouvrez **Utilisateurs** et relevez le code d'invitation affiché dans la carte de votre entreprise.
3. Pour créer un espace indépendant, ouvrez **Créer un compte** puis choisissez **Nouvelle entreprise** et saisissez son nom.
4. Pour rattacher un collègue à une entreprise existante, choisissez **Rejoindre une entreprise** et utilisez le code d'invitation de cette entreprise.
5. Vérifiez qu'un compte de la nouvelle entreprise ne voit pas les articles, ventes, caisses et utilisateurs d'ONYX PHARM.

Chaque entreprise utilise les mêmes tables et les mêmes fonctionnalités, mais les données et la numérotation des documents sont séparées par entreprise. Le code d'invitation doit être partagé uniquement avec les personnes autorisées à rejoindre cet espace.

## Comment exécuter les migrations

**Base déjà en service :** si votre projet Supabase a déjà toutes les migrations précédentes jusqu'à `0044_import_ventes_excel_atomique.sql`, appliquez uniquement `migrations/0045_multi_entreprises.sql`, une seule fois. Ne relancez pas les anciens scripts sur les données réelles.

**Nouvelle installation :** les fichiers présents dans `migrations/` doivent être exécutés dans l'ordre numérique, du plus petit au plus grand (y compris les migrations intermédiaires). Chaque fichier dépend des structures créées précédemment.

Pour exécuter un fichier :

1. Allez sur [supabase.com](https://supabase.com) → votre projet.
2. Ouvrez **SQL Editor** puis cliquez sur **New query**.
3. Ouvrez le fichier SQL souhaité, copiez tout son contenu et collez-le dans l'éditeur.
4. Cliquez sur **Run** et vérifiez qu'aucune erreur n'apparaît.

La migration `0045_multi_entreprises.sql` modifie la sécurité RLS et doit donc être appliquée seulement après les migrations de création de toutes les tables et fonctions.

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

Les migrations initiales autorisaient tous les utilisateurs connectés à partager les mêmes données. Après l'application de `0045_multi_entreprises.sql`, les politiques RLS isolent les données selon `entreprise_id`. Un membre ne consulte que l'espace de son entreprise ; l'inscription doit créer une entreprise ou utiliser un code d'invitation valide.
