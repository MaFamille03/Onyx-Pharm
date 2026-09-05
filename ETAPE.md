# Suivi du projet ONYX PHARM

## Étape actuelle : 17 — Conteneurs remplacent complètement les Achats (livrée)

Ce projet est livré de façon **cumulative** : chaque nouveau zip
(`onyx-pharm-app-etape-N`) contient l'intégralité du code depuis l'étape 1,
plus les ajouts de l'étape N. Vous n'avez jamais besoin de fusionner
plusieurs zips entre eux — le plus récent contient toujours tout.

## Historique des étapes livrées

| Étape | Contenu | Statut |
|---|---|---|
| 1 | Socle technique : Next.js, authentification, navigation, déploiement Vercel | ✅ Livré |
| 2 | Base de données Supabase complète (tables, relations, sécurité) | ✅ Livré |
| 3 | Paramètres & données de référence : emplacements, catégories, clients, fournisseurs, listes configurables | ✅ Livré |
| 4 | Articles & Stock | ✅ Livré |
| 5 | Mouvements, Transferts & Inventaires | ✅ Livré |
| 6 | Achats | ✅ Livré |
| 7 | Ventes | ✅ Livré |
| 8 | Caisse & liens automatiques | ✅ Livré |
| 9 | Traçabilité, sécurité & annulations | ✅ Livré |
| 10 | Rapports, Import/Export & Tableau de bord | ✅ Livré |
| 11 | Audit global, catalogue réel & finalisation | ✅ Livré |
| 12 | Diagnostic détaillé sur la page Stocks | ✅ Livré |
| 13 | Audit complet des opérations silencieuses (tout le projet) | ✅ Livré |

## Le projet est maintenant complet

Les 10 étapes du cahier des charges ont été livrées. L'application couvre
l'intégralité du cycle : articles → stock → achats → ventes → marges →
encaissements → décaissements → créances → dettes → inventaires →
rapports, avec traçabilité, sécurité et documents imprimables.

## Étape 11 — Audit global, catalogue réel & finalisation (livrée)

Suite à l'audit demandé, cette étape corrige les permissions Supabase de
fond en comble et ajoute plusieurs finitions professionnelles :

- **Correction du bug de permissions (403 / 42501)** : accordée à tout le
  rôle `authenticated`, sur toutes les tables existantes ET futures
- **Logo officiel ONYX PHARM** intégré (connexion, navigation, favicon,
  documents imprimés) — extrait directement du catalogue fourni
- **Catalogue réel** : ~130 articles + 21 catégories repris du catalogue
  officiel ONYX PHARM 2026 (équipements, instruments, consommables)
- **Présentation initiale** pour les nouveaux utilisateurs, revisible
  depuis Paramètres
- **Formulaire Article élargi** sur ordinateur (grille 2 colonnes, plus de
  défilement excessif) + case « Non applicable » pour la date d'expiration
- **Paramètres réorganisés** : Général (entreprise/logo), Entrepôt (à
  compléter), Sécurité, Compte (zone dangereuse)
- **Zone dangereuse** : désactivation de compte (historique conservé) et
  suppression (données personnelles anonymisées, documents commerciaux
  préservés), toutes deux protégées par le second mot de passe

## Étape actuelle : « Conteneurs — étape 4-A » (livrée)

Suite du chantier conteneurs : coût de revient par conteneur, prix de
vente libéré du prix d'achat, Paramètres > Seuils, date de conception du
site, code PIN pour les suppressions sensibles (Articles, Paiements,
Retours), et modification/suppression des brouillons de vente.

## Étape actuelle : « Correctifs post-chantier conteneurs » (livrée)

Suite à ton retour terrain, correction de plusieurs vrais problèmes :
le bouton "Conteneur" de la page Stock qui semblait ne rien faire
(il ouvrait bien un formulaire, mais invisible en bas de page),
l'absence de Modifier/Supprimer sur un conteneur, et clarification du
fonctionnement du code PIN.

## Comment mettre à jour votre dossier de travail à chaque étape

Votre dossier de travail (celui connecté à GitHub Desktop) peut garder son
nom d'origine (`onyx-pharm-app`) — inutile de le renommer à chaque fois,
cela compliquerait la connexion avec GitHub Desktop. Le numéro dans le nom
du zip (`onyx-pharm-app-etape-3`) sert uniquement à identifier clairement
**quelle version vous avez téléchargée et installée en dernier** — ce
fichier `ETAPE.md` fait foi une fois le zip installé : ouvrez-le à
n'importe quel moment pour vérifier où vous en êtes.

1. Dézippez le nouveau `onyx-pharm-app-etape-N.zip`
2. Copiez **tout le contenu** du dossier extrait par-dessus votre dossier
   de travail existant (remplacez les fichiers)
3. GitHub Desktop → Changes → message de commit `Étape N` → Commit → Push
4. Si l'étape contient des instructions SQL (dossier `supabase/`), suivez
   `supabase/README.md`
