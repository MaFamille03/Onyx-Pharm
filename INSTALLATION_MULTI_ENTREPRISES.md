# Mise à jour ONYX PHARM — multi-entreprises

Cette version permet à plusieurs entreprises de partager **une même base Supabase**, tout en séparant leurs données par entreprise.

## Avant de commencer

1. Faites une sauvegarde de la base Supabase actuelle.
2. Vérifiez que le projet Supabase est déjà à jour jusqu'à la migration `0044_import_ventes_excel_atomique.sql`.
3. Ne rejouez pas les anciennes migrations sur une base en service.

## 1. Appliquer la migration SQL

1. Ouvrez le projet Supabase existant.
2. Allez dans **SQL Editor** et créez une nouvelle requête.
3. Ouvrez `supabase/migrations/0045_multi_entreprises.sql` dans cette archive.
4. Copiez tout le contenu dans SQL Editor et exécutez-le **une seule fois**.
5. Vérifiez qu'aucune erreur n'est affichée avant de poursuivre.

La migration associe les données existantes à l'espace **ONYX PHARM SARL**. Elle ne crée pas une base Supabase supplémentaire et ne supprime pas les données métier existantes.

## 2. Déployer l'application

1. Remplacez les fichiers du dépôt GitHub par ceux de cette archive, en conservant votre historique Git habituel.
2. Vérifiez que les variables d'environnement Supabase déjà utilisées par Vercel restent configurées.
3. Envoyez les modifications sur GitHub. Vercel lancera le déploiement si l'intégration du dépôt est active.
4. Vérifiez que le build Vercel se termine correctement.

## 3. Utiliser les espaces entreprise

- Les comptes déjà existants restent rattachés à **ONYX PHARM SARL**.
- Pour une nouvelle entreprise : ouvrez **Créer un compte**, choisissez **Nouvelle entreprise**, puis saisissez son nom.
- Pour un collègue : ouvrez **Créer un compte**, choisissez **Rejoindre une entreprise**, puis entrez le code affiché dans la page **Utilisateurs** d'un membre de cette entreprise.
- Les produits, stocks, ventes, achats, caisses, paramètres et historiques sont filtrés par entreprise.

Partagez le code d'invitation uniquement avec les personnes autorisées à rejoindre l'entreprise.

## Important

L'archive contient le code et la migration, mais ne modifie pas automatiquement votre projet Supabase ni votre déploiement Vercel. La migration SQL doit être appliquée dans le projet Supabase concerné avant de déployer la nouvelle application.
