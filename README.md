# ONYX PHARM — Application de gestion intégrée

Socle technique de l'application (Étape 1 du projet).
Stack : **Next.js 14 + TypeScript + Tailwind CSS**, **Supabase** (base de
données + authentification), **Vercel** (hébergement), **GitHub** (code).

---

## Ce que contient cette étape 1

- Authentification complète : connexion, inscription, mot de passe oublié,
  réinitialisation, déconnexion — sécurisée via Supabase Auth
- Protection des routes : impossible d'accéder à l'application sans être
  connecté (middleware + double vérification côté serveur)
- Navigation complète de l'application (Stock, Ventes, Achats, Caisse,
  Tiers, Rapports, Import/Export, Utilisateurs, Historique, Paramètres),
  avec des pages "en construction" pour les modules qui arriveront aux
  étapes suivantes
- Interface responsive (mobile, tablette, ordinateur) avec menu latéral sur
  desktop et menu tiroir + barre d'onglets sur mobile
- Base PWA (l'application pourra être "installée" sur l'écran d'accueil du
  téléphone)

**Rien n'est encore branché à de vraies données métier** (articles, ventes,
stock...) : ça viendra aux étapes 2 à 10. Cette étape pose uniquement les
fondations techniques.

---

## PARTIE 1 — Créer les comptes (si pas déjà fait)

1. **GitHub** : allez sur [github.com](https://github.com), créez un compte
2. **Vercel** : allez sur [vercel.com](https://vercel.com), cliquez
   **Continue with GitHub** pour connecter directement les deux comptes
3. **Supabase** : allez sur [supabase.com](https://supabase.com), connectez-
   vous aussi avec GitHub si possible

---

## PARTIE 2 — Créer le dépôt GitHub et y déposer le code

### Étape 2.1 — Créer le dépôt

1. Sur GitHub, cliquez sur le bouton **+** en haut à droite → **New
   repository**
2. Nom du dépôt : `onyx-pharm-app`
3. Visibilité : **Private** (recommandé, car ce sera relié à vos vraies
   données d'entreprise)
4. Ne cochez **aucune** case (pas de README, pas de .gitignore — le projet
   les a déjà)
5. Cliquez **Create repository**

### Étape 2.2 — Installer GitHub Desktop

1. Téléchargez et installez **GitHub Desktop** :
   [desktop.github.com](https://desktop.github.com)
2. Connectez-le à votre compte GitHub

### Étape 2.3 — Déposer le code du projet

1. Dézippez le fichier `onyx-pharm-app.zip` que je vous ai fourni, dans un
   dossier de votre choix sur votre ordinateur (par exemple
   `Documents/onyx-pharm-app`)
2. Dans GitHub Desktop : **File > Add local repository**
3. Sélectionnez le dossier que vous venez de dézipper
4. GitHub Desktop va vous proposer de créer un dépôt Git local si ce n'est
   pas déjà fait — acceptez
5. En bas à gauche, dans **Current repository**, vérifiez que c'est bien
   `onyx-pharm-app`
6. Assurez-vous que le dépôt distant pointe vers celui créé à l'étape 2.1
   (**Repository > View on GitHub**, ou **Publish repository** si ce n'est
   pas encore fait)
7. Dans l'onglet **Changes**, vous verrez tous les fichiers du projet
   listés
8. En bas à gauche, écrivez un message de commit, par exemple :
   `Étape 1 : socle technique (auth, navigation, structure)`
9. Cliquez **Commit to main**
10. Cliquez **Publish repository** (ou **Push origin** si déjà publié)

Le code est maintenant sur GitHub.

---

## PARTIE 3 — Configurer Supabase

### Étape 3.1 — Créer le projet Supabase

1. Sur [supabase.com](https://supabase.com), cliquez **New project**
2. Choisissez votre organisation (ou créez-en une)
3. **Name** : `onyx-pharm`
4. **Database Password** : générez-en un fort et **conservez-le
   précieusement** dans un endroit sûr (gestionnaire de mots de passe) —
   vous en aurez besoin plus tard pour certaines opérations avancées
5. **Region** : choisissez une région proche, par exemple `Europe West
   (Ireland/London)` pour une meilleure latence depuis la Côte d'Ivoire
6. Cliquez **Create new project** (la création prend 1 à 2 minutes)

### Étape 3.2 — Récupérer les clés API

1. Une fois le projet créé, allez dans **Project Settings** (icône
   d'engrenage en bas à gauche) → **API**
2. Notez ces deux valeurs, vous en aurez besoin juste après :
   - **Project URL** (ressemble à `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** (une longue clé sous **Project API keys**)

### Étape 3.3 — Configurer l'authentification par e-mail

1. Dans le menu de gauche, allez dans **Authentication** → **Providers**
2. Vérifiez que **Email** est bien activé (il l'est par défaut)
3. Allez dans **Authentication** → **URL Configuration**
4. Renseignez pour l'instant :
   - **Site URL** : laissez `http://localhost:3000` pour le moment (on la
     changera dès que l'application sera en ligne sur Vercel, à l'étape 4.3
     ci-dessous)
   - **Redirect URLs** : ajoutez `http://localhost:3000/**`

*(Ces réglages seront à corriger une fois l'application déployée — voir
Partie 4, étape 4.3 plus bas. C'est normal de ne pas encore avoir l'URL
Vercel à ce stade.)*

---

## PARTIE 4 — Déployer sur Vercel

### Étape 4.1 — Importer le projet

1. Sur [vercel.com](https://vercel.com), cliquez **Add New** → **Project**
2. Dans la liste de vos dépôts GitHub, trouvez `onyx-pharm-app` et cliquez
   **Import**
3. Vercel détecte automatiquement qu'il s'agit d'un projet Next.js — ne
   changez rien aux réglages de build

### Étape 4.2 — Ajouter les variables d'environnement

Avant de cliquer sur Deploy :

1. Dépliez la section **Environment Variables**
2. Ajoutez :

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | la **Project URL** notée à l'étape 3.2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé **anon public** notée à l'étape 3.2 |

3. Cliquez **Deploy**

Le déploiement prend 1 à 2 minutes. Vous obtenez une URL du type
`onyx-pharm-app.vercel.app`.

### Étape 4.3 — Finaliser la configuration Supabase avec l'URL réelle

Maintenant que vous avez l'URL Vercel :

1. Retournez sur Supabase → **Authentication** → **URL Configuration**
2. **Site URL** : remplacez par votre URL Vercel, par exemple
   `https://onyx-pharm-app.vercel.app`
3. **Redirect URLs** : ajoutez `https://onyx-pharm-app.vercel.app/**`
4. Sauvegardez

### Étape 4.4 — Tester

1. Ouvrez votre URL Vercel dans le navigateur
2. Vous devriez arriver sur la page **Connexion**
3. Cliquez **Créer un compte**, créez votre premier compte utilisateur
4. Un e-mail de confirmation arrive (vérifiez aussi les spams) — cliquez
   sur le lien
5. Reconnectez-vous : vous arrivez sur le **Tableau de bord**, avec le
   menu complet à gauche (ou en bas/menu ☰ sur mobile)

Si tout fonctionne, l'étape 1 est validée !

---

## PARTIE 5 — Utiliser l'application au quotidien (mises à jour futures)

À chaque nouvelle étape, je vous fournirai un nouveau zip. La procédure
sera toujours la même :

1. Dézippez le nouveau zip **par-dessus** votre dossier de projet existant
   (remplace les fichiers modifiés)
2. Ouvrez GitHub Desktop
3. Vérifiez les fichiers modifiés dans l'onglet **Changes**
4. Écrivez un message de commit décrivant l'étape (ex : `Étape 2 : base de
   données complète`)
5. **Commit to main** puis **Push origin**
6. Vercel redéploie automatiquement en 1 à 2 minutes — aucune autre action
   nécessaire

---

## Aide-mémoire : où retrouver quoi

| Élément | Où le trouver |
|---|---|
| Code source | GitHub → dépôt `onyx-pharm-app` |
| Application en ligne | URL Vercel (ex: `onyx-pharm-app.vercel.app`) |
| Base de données / utilisateurs | Supabase → **Table Editor** / **Authentication** |
| Variables d'environnement | Vercel → **Project Settings** → **Environment Variables** |
| Logs en cas d'erreur | Vercel → onglet **Deployments** → cliquez sur le déploiement → **Logs** |

---

## Développement local (optionnel, pour votre informaticien)

```bash
npm install
cp .env.local.example .env.local
# renseigner les clés Supabase dans .env.local
npm run dev
```

L'application est alors disponible sur `http://localhost:3000`.

---

## ÉTAPE 2 — Base de données complète

Cette étape ajoute l'intégralité des tables de la base de données dans
Supabase (articles, stocks, ventes, achats, caisse, historique, etc.).
**Aucune nouvelle page visible** dans l'application : c'est un travail en
coulisses qui prépare les étapes suivantes.

### Procédure

1. Dézippez ce nouveau zip par-dessus votre dossier de projet existant
2. Dans **GitHub Desktop**, faites un commit (`Étape 2 : base de données
   complète`) puis **Push origin** — cela met à jour le code sur GitHub
   (Vercel redéploiera, mais rien ne changera visuellement)
3. Ouvrez le dossier **supabase/** du projet et suivez précisément les
   instructions du fichier **supabase/README.md** : vous devrez copier-
   coller 4 scripts SQL dans l'éditeur SQL de Supabase, dans l'ordre

Une fois les 4 scripts exécutés, votre base de données Supabase contiendra
toutes les tables nécessaires à la gestion des articles, du stock, des
ventes, des achats, de la caisse et des rapports — prête à être connectée
aux pages de l'application dans les étapes suivantes.

### Vérification rapide

Dans Supabase → **Table Editor**, vous devez voir une trentaine de tables,
et la table `emplacements` doit déjà contenir **Bureau**, **Entrepôt** et
**Domicile de la patronne**.

---

## ÉTAPE 3 — Paramètres & données de référence

Cette étape rend fonctionnelles les premières vraies pages de
l'application (connectées à Supabase, avec de vraies données) :

- **Paramètres** : gestion des emplacements, des catégories/sous-
  catégories, et des listes configurables (statuts, modes de paiement,
  catégories de caisse)
- **Tiers > Clients** : création et modification des fiches clients
- **Tiers > Fournisseurs** : création et modification des fiches
  fournisseurs

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 3 : paramètres et données de
   référence`) → Push
3. **Aucune action Supabase nécessaire** cette fois-ci (la base a déjà été
   créée à l'étape 2)
4. Une fois Vercel redéployé (1-2 minutes), ouvrez votre application :
   les pages **Paramètres**, **Clients** et **Fournisseurs** sont
   maintenant utilisables

### À tester

- Paramètres > Emplacements : ajoutez un nouvel emplacement, désactivez-en
  un puis réactivez-le
- Paramètres > Catégories : créez une catégorie, ouvrez-la, ajoutez-y une
  sous-catégorie
- Tiers > Clients : créez un client, modifiez-le
- Tiers > Fournisseurs : créez un fournisseur, modifiez-le

---

## ÉTAPE 4 — Articles & Stock

Cette étape rend fonctionnels les modules centraux de la gestion des
stocks :

- **Stock > Articles** : fiche article complète (désignation, catégorie/
  sous-catégorie, marque, fournisseur, prix d'achat, prix de vente
  conseillé, stock minimum, numéro de lot, date d'expiration, statut,
  observations), avec possibilité de saisir un **stock initial par
  emplacement** à la création
- **Stock > Stocks** : tableau des quantités par article et par
  emplacement, avec **correction traçable** (chaque ajustement crée un
  mouvement de stock enregistré, jamais une modification silencieuse)
- **Stock > Alertes** : ruptures de stock, stocks faibles (sous le seuil
  minimum), produits expirés et produits proches de l'expiration

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 4 : articles et stock`) → Push
3. Aucune action Supabase nécessaire (les tables existent déjà depuis
   l'étape 2)

### À tester

1. Allez dans **Paramètres** et vérifiez qu'il existe au moins une
   catégorie (créez-en une si besoin, voir étape 3)
2. Allez dans **Stock > Articles** → **Nouvel article** : remplissez la
   fiche, renseignez un stock initial pour un ou deux emplacements,
   enregistrez
3. Allez dans **Stock > Stocks** : vérifiez que les quantités saisies
   apparaissent bien par emplacement
4. Cliquez sur une quantité pour l'ajuster : entrez une nouvelle valeur,
   validez
5. Créez un article avec un stock minimum élevé (ex : 100) et un stock
   initial faible (ex : 2) → allez dans **Stock > Alertes** : il doit
   apparaître dans « Stocks faibles »
6. Créez un article avec une date d'expiration passée → il doit
   apparaître dans « Produits expirés »

---

## ÉTAPE 5 — Mouvements, Transferts & Inventaires

Cette étape complète la gestion du stock avec trois nouveaux modules :

- **Stock > Mouvements** : journal complet de toutes les entrées/sorties
  de stock, avec filtres (type, emplacement, recherche)
- **Stock > Transferts** : déplacer une quantité d'un emplacement à un
  autre, avec **contrôle automatique du stock disponible** — impossible de
  transférer plus que ce qui est réellement en stock à la source
- **Stock > Inventaires** : lancez un inventaire sur un emplacement, les
  quantités théoriques se chargent automatiquement, saisissez les
  quantités réellement comptées, puis validez : le stock est ajusté et un
  mouvement est enregistré pour chaque écart constaté

**Important technique :** les transferts et la validation d'inventaire
passent par des fonctions spéciales directement dans la base de données
(et non par l'application), pour garantir qu'aucune erreur de stock ne
peut survenir même si plusieurs personnes travaillent en même temps.
Cela nécessite une nouvelle migration SQL à exécuter.

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 5 : mouvements, transferts et
   inventaires`) → Push
3. **Action Supabase requise** : ouvrez **SQL Editor** dans Supabase et
   exécutez le nouveau fichier `supabase/migrations/0005_transferts_inventaires_fonctions.sql`
   (copier-coller, comme pour les précédents — voir `supabase/README.md`)

### À tester

1. **Transferts** : créez un transfert d'un article que vous avez en
   stock, d'un emplacement vers un autre → vérifiez dans **Stock >
   Stocks** que les quantités ont bien bougé
2. Essayez de transférer **plus** que ce qui est disponible → le système
   doit refuser avec un message clair
3. **Mouvements** : vérifiez que le transfert apparaît bien dans le
   journal (une ligne sortie + une ligne entrée)
4. **Inventaires** : démarrez un inventaire sur un emplacement, modifiez
   quelques quantités réelles, cliquez « Valider l'inventaire » →
   vérifiez que le stock a été corrigé et qu'un mouvement d'ajustement
   apparaît dans le journal pour chaque écart

---

## ÉTAPE 6 — Achats

Cette étape met en place le cycle complet des achats fournisseurs :

- **Achats > Achats** : créez un achat multi-articles (fournisseur, date,
  lignes avec quantité/prix/emplacement de destination), validez-le, puis
  enregistrez des paiements partiels ou complets
- **Achats > Réceptions** : réceptionnez chaque ligne d'achat validée —
  la quantité entre alors réellement en stock à l'emplacement prévu
- **Achats > Paiements** : vue d'ensemble des dettes fournisseurs en
  cours, avec paiement rapide, et historique de tous les règlements
- **Achats > Retours** : enregistrez un retour vers un fournisseur (sortie
  de stock, avec contrôle de disponibilité)
- **Tiers > Dettes** : reprend la même vue que Achats > Paiements

Le montant payé et le statut d'un achat (Validé → Partiellement payé →
Payé) se mettent à jour **automatiquement** à chaque paiement enregistré.

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 6 : achats`) → Push
3. **Action Supabase requise** : exécutez le nouveau fichier
   `supabase/migrations/0006_achats_fonctions.sql` dans le SQL Editor

### À tester

1. Créez un achat avec 1-2 articles, choisissez une destination pour
   chaque ligne, enregistrez
2. Cliquez sur l'achat créé → **Valider l'achat**
3. Allez dans **Achats > Réceptions** → réceptionnez les lignes →
   vérifiez dans **Stock > Stocks** que les quantités ont bien augmenté
4. Retournez sur l'achat → **Enregistrer un paiement** partiel → vérifiez
   que le statut passe à « Partiellement payé » et que le reste dû est
   correct
5. Effectuez un second paiement pour solder → le statut doit passer à
   « Payé »
6. Vérifiez que la dette apparaît bien dans **Achats > Paiements** tant
   qu'elle n'est pas soldée
7. Testez un retour fournisseur depuis **Achats > Retours**

---

## ÉTAPE 7 — Ventes

L'étape la plus riche du projet : le cycle complet de vente.

- **Ventes > Devis** : créez une proposition commerciale multi-articles ;
  un devis peut être **converti en vente** en un clic
- **Ventes > Ventes** : vente multi-articles avec **prix personnalisable**
  (le prix conseillé de la fiche article est proposé par défaut, mais
  reste modifiable — l'ancien et le nouveau prix sont tous les deux
  affichés), remise éventuelle, et **calcul automatique de la marge**
  ligne par ligne
- **Ventes > Paiements** : créances clients en cours avec encaissement
  rapide, et historique des règlements
- **Ventes > Retours** : retour d'un client (entrée de stock)
- **Tiers > Créances** : reprend la même vue que Ventes > Paiements

**Point essentiel :** la validation d'une vente **vérifie et décrémente le
stock en une seule opération sécurisée** — impossible de vendre plus que
ce qui est réellement disponible, même avec plusieurs utilisateurs
simultanés (conforme à la section 40 du cahier des charges : interdiction
du stock négatif).

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 7 : ventes`) → Push
3. **Action Supabase requise** : exécutez le nouveau fichier
   `supabase/migrations/0007_ventes_fonctions.sql` dans le SQL Editor

### À tester

1. Créez une vente avec 1-2 articles ayant du stock disponible, modifiez
   le prix de vente d'une ligne, vérifiez que la marge s'actualise
2. Cliquez **Valider la vente** → vérifiez dans **Stock > Stocks** que
   les quantités ont bien diminué
3. Essayez de créer une vente avec une quantité **supérieure** au stock
   disponible et validez-la → le système doit refuser avec un message
   clair
4. Enregistrez un paiement partiel → le statut passe à « Partiellement
   payé » ; soldez → il passe à « Payé »
5. Vérifiez que la créance apparaît dans **Ventes > Paiements** tant
   qu'elle n'est pas soldée
6. Créez un devis, puis cliquez **Convertir en vente** → retrouvez la
   vente créée dans **Ventes > Ventes** (en brouillon, à finaliser)
7. Testez un retour client depuis **Ventes > Retours**

---

## ÉTAPE 8 — Caisse & liens automatiques

Cette étape connecte la caisse au reste de l'application :

- **Caisse > Encaissements** : toutes les sommes reçues — générées
  **automatiquement** à chaque paiement de vente enregistré (étape 7), et
  vous pouvez aussi ajouter une entrée manuelle (apport personnel, autre
  recette...)
- **Caisse > Décaissements** : toutes les sommes sorties — générées
  **automatiquement** à chaque paiement d'achat, plus la possibilité
  d'ajouter une dépense manuelle (loyer, électricité, etc.)
- **Caisse > Solde** : solde initial (modifiable) + encaissements −
  décaissements, avec filtre par période (aujourd'hui, cette semaine, ce
  mois, depuis le début)

**Point clé du cahier des charges (sections 50-51) :** vous n'avez
**jamais** à ressaisir manuellement en caisse un paiement de vente ou
d'achat déjà enregistré — l'application le fait automatiquement dès que
vous enregistrez le paiement dans Achats ou Ventes.

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 8 : caisse et liens automatiques`) →
   Push
3. **Action Supabase requise** : exécutez le nouveau fichier
   `supabase/migrations/0008_caisse_liaisons.sql` dans le SQL Editor

### À tester

1. Enregistrez un paiement sur une vente existante (Ventes > Ventes) →
   allez dans **Caisse > Encaissements** : le paiement doit apparaître
   automatiquement, sans action supplémentaire
2. Faites de même avec un paiement d'achat → vérifiez qu'il apparaît dans
   **Caisse > Décaissements**
3. Ajoutez un encaissement manuel (ex : « Apport personnel ») et un
   décaissement manuel (ex : « Loyer »)
4. Allez dans **Caisse > Solde** : vérifiez que le total encaissements,
   le total décaissements et le solde semblent corrects
5. Modifiez le **solde initial** (bouton en haut à droite, visible sur
   « Depuis le début ») et vérifiez que le solde se met à jour
6. Changez de période (Aujourd'hui / Cette semaine / Ce mois) et vérifiez
   que les totaux se filtrent correctement

---

## ÉTAPE 9 — Traçabilité, sécurité & annulations

Cette étape renforce la sécurité et la traçabilité de l'application :

- **Paramètres > Sécurité** : définissez un **second mot de passe**,
  distinct du mot de passe de connexion, partagé par tous les
  utilisateurs de l'application. Il protège les opérations sensibles.
- **Historique** : journal réel des actions importantes — pour l'instant,
  toute modification du prix d'achat ou du prix de vente conseillé d'un
  article, et toute annulation de vente/achat déjà validé, y sont
  automatiquement enregistrées avec l'utilisateur, la date, l'ancienne et
  la nouvelle valeur
- **Utilisateurs** : vous pouvez maintenant renseigner votre nom complet,
  affiché dans l'historique à la place de votre e-mail
- **Annulation sécurisée des ventes et achats déjà validés** : un nouveau
  bouton « Annuler la vente/l'achat » apparaît même après validation. Il
  **restitue automatiquement le stock concerné** et exige le second mot
  de passe. Un achat ne peut pas être annulé si le stock reçu a déjà été
  utilisé ailleurs (vendu, transféré...) — le système le détecte et
  refuse proprement.

**Aucune donnée n'est jamais supprimée silencieusement** : annuler une
opération change son statut en "Annulé" et conserve tout son historique,
conformément au cahier des charges.

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 9 : traçabilité, sécurité et
   annulations`) → Push
3. **Action Supabase requise** : exécutez le nouveau fichier
   `supabase/migrations/0009_securite_annulations.sql` dans le SQL Editor

### À tester

1. Allez dans **Paramètres > Sécurité** et définissez un second mot de
   passe
2. Allez dans **Utilisateurs** et renseignez votre nom complet
3. Modifiez le prix de vente conseillé d'un article (Stock > Articles) →
   allez dans **Historique** : la modification doit apparaître avec votre
   nom, l'ancien et le nouveau prix
4. Ouvrez une vente déjà validée → cliquez **Annuler la vente** → entrez
   le second mot de passe → vérifiez dans **Stock > Stocks** que la
   quantité a bien été restituée, et que l'annulation apparaît dans
   **Historique**
5. Essayez avec un mauvais mot de passe : le système doit refuser
   clairement
6. Faites de même avec un achat déjà réceptionné, puis essayez d'annuler
   un achat dont le stock reçu a déjà été vendu ailleurs : le système
   doit refuser avec un message explicite

---

## ÉTAPE 10 — Rapports, Import/Export & Tableau de bord final

Dernière étape du projet : elle relie toutes les données déjà saisies
dans une vue d'ensemble exploitable, et ajoute les outils d'échange de
données et de documents imprimables.

- **Tableau de bord** : maintenant connecté à de vraies données — chiffre
  d'affaires, marge, valeur du stock, encaissements/décaissements,
  créances, dettes, alertes de stock, ventes et achats récents — avec
  filtre par période (aujourd'hui / semaine / mois / tout)
- **Rapports** : 5 onglets (Stock, Ventes, Achats, Caisse, Créances/
  Dettes), chacun exportable en un clic vers Excel
- **Import/Export** :
  - Export Excel pour Articles, Ventes, Achats, Encaissements,
    Décaissements
  - Import d'articles depuis un modèle Excel téléchargeable, avec
    contrôle automatique des erreurs avant import (désignation vide,
    quantité/prix invalides, catégorie/fournisseur/emplacement
    inexistants, doublons, dates incorrectes) et aperçu ligne par ligne
- **Documents imprimables** : chaque vente, achat et devis validé
  dispose désormais d'un bouton **Imprimer**, qui ouvre un aperçu
  professionnel exportable directement en PDF via la fonction
  d'impression du navigateur (« Enregistrer au format PDF »)

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 10 : rapports, import/export et
   tableau de bord final`) → Push
3. **Aucune action Supabase nécessaire** — cette étape s'appuie
   entièrement sur les données déjà en place

### À tester

1. Ouvrez le **Tableau de bord** : vérifiez que les chiffres
   correspondent à vos données, changez de période
2. Allez dans **Rapports**, parcourez les 5 onglets, exportez-en un vers
   Excel et ouvrez le fichier téléchargé
3. Allez dans **Import/Export** → téléchargez le modèle → remplissez
   quelques lignes (avec une erreur volontaire sur l'une d'elles, par
   exemple un emplacement inexistant) → importez-le → vérifiez que
   l'erreur est bien détectée et que seules les lignes valides sont
   proposées à l'import
4. Ouvrez une vente validée → cliquez **Imprimer** → vérifiez l'aperçu →
   testez « Enregistrer au format PDF » depuis la fenêtre d'impression
   de votre navigateur
5. Faites de même pour un achat et un devis

---

## 🎉 Projet complet

Les 10 étapes du cahier des charges ONYX PHARM sont livrées. L'application
couvre l'intégralité du cycle métier : articles, stock, transferts,
inventaires, achats, ventes, caisse, créances, dettes, traçabilité,
sécurité, rapports et documents — le tout responsive, sécurisé et déployé
sur des services gratuits (GitHub, Vercel, Supabase).

Consultez `ETAPE.md` à tout moment pour un rappel de ce qui a été livré.

---

## ÉTAPE 11 — Audit global, catalogue réel & finalisation

Suite à votre demande d'audit complet, voici ce qui a été corrigé et ajouté.

### Le bug des permissions (403 / `permission denied`)

**Cause exacte :** les policies RLS (qui décident *qui* a le droit de lire/
écrire une ligne) avaient été correctement créées dès l'étape 2. Mais
PostgreSQL exige **en plus** un `GRANT` de base sur chaque table pour le
rôle `authenticated` — sans lui, la policy RLS ne sert à rien, la requête
est bloquée avant même d'être évaluée. C'est exactement ce que vous avez
rencontré sur `emplacements`, et cela touchait potentiellement toutes les
tables créées depuis l'étape 2.

La migration `0010_audit_privileges.sql` corrige ce point une fois pour
toutes : elle accorde les privilèges sur **toutes les tables existantes**,
et configure les **privilèges par défaut** pour qu'aucune table créée à
l'avenir ne reproduise ce problème. RLS reste actif partout — rien n'a été
désactivé pour "faire marcher" l'application.

### Ce qui a été ajouté

- **Logo officiel** ONYX PHARM extrait de votre catalogue, intégré partout
  (connexion, menu, favicon, factures/bons imprimés)
- **Catalogue réel** : les catégories et ~130 articles de votre catalogue
  2026 sont maintenant préchargés dans Stock > Articles (prix à compléter,
  puisque le catalogue ne les indique pas)
- **Présentation initiale** : les nouveaux comptes voient un écran de
  bienvenue présentant les modules ; revisible depuis Paramètres > Général
- **Formulaire Article élargi** sur ordinateur — la grille utilise
  maintenant toute la largeur disponible, avec une case à cocher claire
  pour marquer un article "Date d'expiration non applicable"
- **Paramètres réorganisés** en 7 onglets : Général, Emplacements,
  Catégories, Listes, Entrepôt (à compléter), Sécurité, Compte
- **Zone dangereuse** (Paramètres > Compte) : désactivation de compte
  (historique conservé, comme "Jean Kouassi — Compte désactivé") et
  suppression définitive (données personnelles anonymisées, documents
  commerciaux préservés), toutes deux protégées par le second mot de passe
  et une double confirmation

### Limite technique honnête à connaître

La "suppression définitive" anonymise vos données personnelles (nom) dans
l'application et désactive l'accès — c'est tout ce qu'une application
cliente peut faire en toute sécurité. La suppression complète du compte
d'authentification lui-même (l'entrée dans Supabase Auth) nécessite une
clé d'administration que je ne peux pas intégrer côté navigateur sans
créer une faille de sécurité majeure (n'importe qui pourrait alors
supprimer n'importe quel compte). Pour une suppression totale du compte
d'authentification, il faudra le faire une fois depuis le tableau de bord
Supabase (Authentication > Users), ce qui prend quelques secondes.

### Ce qui reste à faire de votre côté

- Les **prix d'achat et de vente** des ~130 articles importés sont à 0 —
  le catalogue ne les indiquait pas. À compléter progressivement dans
  Stock > Articles selon vos tarifs réels.
- Les **informations de l'entrepôt** (Paramètres > Entrepôt) sont vides,
  volontairement — à remplir dès que vous les aurez.
- Si vous avez un **logo plus récent ou en meilleure définition**,
  transmettez-le et je le remplacerai partout.

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 11 : audit, catalogue et finalisation`)
   → Push
3. **Action Supabase requise** : exécutez dans l'ordre les 3 nouveaux
   fichiers SQL du dossier `supabase/migrations/` :
   - `0010_audit_privileges.sql` (la correction critique — à exécuter en
     priorité)
   - `0011_catalogue_onyx_pharm.sql`
   - `0012_comptes_entreprise.sql`

### À tester

1. Essayez de créer un emplacement, une catégorie, un article : les
   erreurs 403 doivent avoir disparu
2. Allez dans **Stock > Articles** : le catalogue ONYX PHARM doit
   apparaître (environ 130 articles classés par catégorie)
3. Créez un **nouveau compte de test** : la présentation doit s'afficher
   automatiquement à la première connexion
4. Ouvrez **Stock > Articles > Nouvel article** sur un écran d'ordinateur :
   le formulaire doit utiliser toute la largeur, en 2 colonnes
5. Testez la case "Non applicable" sur la date d'expiration
6. Allez dans **Paramètres > Général** : le logo et les informations de
   l'entreprise doivent s'afficher
7. Testez la **zone dangereuse** (Paramètres > Compte) avec un compte de
   test — vérifiez qu'un compte désactivé ne peut plus se reconnecter et
   que l'historique reste lisible

---

## ÉTAPE 13 — Audit complet des opérations silencieuses

Suite à votre remarque sur le stock qui ne se mettait pas à jour, j'ai
relu **l'intégralité** du code de l'application (pas seulement la page
concernée) à la recherche du même type de problème.

### Ce qui a été trouvé et corrigé

Plusieurs actions de l'application appelaient Supabase **sans jamais
vérifier si l'opération avait réellement réussi**. Quand une erreur
survenait (permission, contrainte, connexion...), l'écran se contentait
de se recharger sans que rien ne se passe — sans aucun message. C'est
exactement le symptôme "aucun changement" que vous aviez signalé.

Corrigé dans la totalité de l'application : Emplacements, Catégories,
Listes de paramètres, Clients/Fournisseurs, Caisse, Solde, Transferts,
Inventaires, Achats, Réceptions, Paiements (achats et ventes), Retours
(fournisseurs et clients), Ventes, Devis, Import Excel, et la fiche
Article. Chaque opération affiche maintenant un message clair en cas
d'échec, et journalise le détail technique exact (code, table,
opération) dans la console du navigateur (F12) pour un diagnostic
immédiat si un problème survient encore.

**Deux cas plus sérieux** ont aussi été trouvés et corrigés : lors de la
conversion d'un devis en vente, et lors de la création d'un inventaire,
les lignes de détail pouvaient échouer à s'enregistrer silencieusement —
laissant croire qu'un document complet avait été créé alors qu'il était
vide. Ces deux opérations vérifient désormais explicitement leur succès.

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 13 : audit des opérations
   silencieuses`) → Push
3. **Aucune action Supabase nécessaire** — cette étape ne touche qu'au
   code de l'application, pas à la base de données

### À tester

1. Allez dans **Stock > Stocks**, ajustez une quantité : elle doit
   maintenant se mettre à jour correctement
2. Testez les boutons "Activer/Désactiver" dans Paramètres > Emplacements
   et Catégories : le changement doit être immédiat et visible
3. Si un message d'erreur apparaît quelque part, ouvrez la console du
   navigateur (**F12 → Console**) : vous verrez désormais `[ONYX PHARM]
   Erreur Supabase` avec le code exact — partagez-le-moi si besoin, ce
   sera immédiatement exploitable

---

## ÉTAPE 14 — Réparation des comptes sans profil

Si "Impossible d'enregistrer l'article" persiste malgré l'étape 13, la
cause probable est différente : votre compte de connexion a été créé
avant que la table des profils n'existe dans la base (lors des tout
premiers tests, à l'étape 1). Votre compte fonctionne pour vous
connecter, mais n'a pas de "fiche profil" — or chaque article créé essaie
de s'y rattacher pour savoir qui l'a créé. Sans cette fiche, l'insertion
est bloquée (violation de contrainte, pas un problème de droits).

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 14 : réparation des profils`) → Push
3. **Action Supabase requise** : exécutez `0014_reparation_profils.sql`
   dans le SQL Editor — il répare automatiquement tout compte concerné,
   sans rien modifier pour les comptes déjà en ordre

### À tester

1. Après avoir exécuté le script, réessayez de créer un article
2. Si ça échoue encore : ouvrez la console (**F12**), regardez le message
   `[ONYX PHARM] Erreur Supabase`, et partagez-moi le `code` exact affiché
   — avec cette information, la cause sera identifiée avec certitude

---

## ÉTAPE 15 — Conteneurs, étape 1/5 : fondations

Première étape du chantier "gestion par conteneur" : le stock est
désormais structuré, en coulisses, comme une somme de lots d'entrée
(conteneurs), chacun avec son propre prix d'achat global. **Rien ne
change encore à l'écran** — c'est une restructuration de fondation.

### Ce qui a été fait

- Nouvelle table **Conteneurs** (code, fournisseur, date d'arrivée,
  montant d'achat global, statut, observation)
- Un conteneur technique **"Stock Initial"** est créé automatiquement
  et regroupe tout le stock existant avant ce changement
- Le stock est maintenant suivi par **(article, emplacement, conteneur)**
  au lieu de (article, emplacement) — mais le **total affiché reste
  identique** partout dans l'application (Articles, Stocks, Rapports,
  Tableau de bord, Alertes)
- Toutes les fonctions qui touchent au stock (ventes, achats, transferts,
  retours, inventaires, annulations) ont été mises à jour pour
  fonctionner avec cette nouvelle structure, sans rien casser
- Nouvelle page **Stock > Conteneurs** (lecture seule pour l'instant) pour
  vérifier que "Stock Initial" existe bien et regroupe tout le stock

### Important — comportement transitoire

Tant que l'étape 2 (arrivée de nouveaux conteneurs) n'est pas livrée,
**tout le stock réel continue de vivre dans "Stock Initial"** — c'est
normal et volontaire. Les vérifications de disponibilité (ventes,
transferts...) tiennent déjà compte du total tous conteneurs confondus,
mais les sorties de stock ciblent encore Stock Initial par défaut. La
répartition intelligente entre plusieurs conteneurs (FIFO) arrive à
l'étape 3.

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 15 : conteneurs — fondations`) → Push
3. **Action Supabase requise** : exécutez `0015_conteneurs.sql` dans le
   SQL Editor (migration volumineuse, c'est normal — laissez-la aller
   jusqu'au bout)

### À tester

1. Allez dans **Stock > Conteneurs** : vous devez voir le conteneur
   "Stock Initial", avec le stock total qui correspond à ce que vous avez
   déjà en base
2. Vérifiez que **Stock > Articles** et **Stock > Stocks** affichent
   toujours les mêmes quantités qu'avant (rien ne doit avoir changé à
   l'écran)
3. Testez un ajustement de stock, un transfert, une vente : tout doit
   continuer à fonctionner normalement
4. Créez un nouvel article avec un stock initial : vérifiez qu'il
   apparaît bien rattaché au conteneur Stock Initial

---

## ÉTAPE 16 — Conteneurs, étape 2/5 : entrée de marchandise

Vous pouvez maintenant créer un conteneur réel, avec un seul montant
d'achat global et sans aucun prix par article.

### Ce qui a été fait

- **Stock > Conteneurs > Nouveau conteneur** : formulaire avec code
  (généré automatiquement, modifiable), fournisseur, date d'arrivée,
  montant d'achat global, observation
- **Ajout des articles de deux façons, combinables** :
  - **Import Excel** (méthode recommandée) : modèle téléchargeable avec
    les colonnes habituelles + Quantité + Emplacement ; si un article du
    fichier n'existe pas encore dans le catalogue, il est **créé
    automatiquement** ; s'il existe déjà, sa quantité est simplement
    ajoutée au conteneur
  - **Ajout manuel** : sélection d'un article déjà existant, quantité,
    emplacement — pour les petits conteneurs ou les compléments rapides
- La création du conteneur (articles + stock) se fait en **une seule
  opération atomique** : si quelque chose échoue, rien n'est
  partiellement créé

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape conteneurs 2/5 : entrée de
   marchandise`) → Push
3. **Action Supabase requise** : exécutez `0016_creation_conteneur.sql`
   dans le SQL Editor

### À tester

1. Allez dans **Stock > Conteneurs > Nouveau conteneur**
2. Renseignez un montant d'achat global, puis testez l'import Excel avec
   quelques lignes (mélangez un article déjà existant et un nouveau)
3. Ajoutez aussi une ligne manuellement
4. Créez le conteneur, vérifiez qu'il apparaît dans la liste avec le bon
   stock restant
5. Vérifiez dans **Stock > Articles** et **Stock > Stocks** que les
   quantités sont bien remontées dans le total affiché
6. Vérifiez dans **Stock > Mouvements** que chaque entrée est bien
   journalisée, référencée par le code du conteneur

---

## ÉTAPE 17 — Les Conteneurs remplacent complètement les Achats

Changement majeur : le module **Achats** (menu, pages) est retiré — les
**Conteneurs** sont désormais l'unique porte d'entrée du stock, avec leur
propre suivi financier, entièrement indépendant des ventes.

**Rien n'est supprimé en base** : les anciennes données d'achats restent
disponibles (aucune perte), simplement plus utilisées pour de nouvelles
opérations.

### Ce qui a changé

- **Menu Achats retiré** (Achats, Réceptions, Paiements, Retours) — tout
  se fait désormais depuis **Stock > Conteneurs**
- **Prix d'achat du conteneur devenu optionnel** — un conteneur peut être
  créé sans aucun montant renseigné
- **Chaque conteneur a désormais son propre statut de paiement**
  (Validé → Partiellement payé → Payé), avec possibilité d'enregistrer des
  paiements directement depuis sa fiche détail (cliquez sur un conteneur
  dans la liste) — **sans aucun rapport avec les ventes**
- Chaque paiement de conteneur crée **automatiquement** le décaissement
  correspondant, exactement comme avant pour les achats
- **Tiers > Dettes** affiche désormais les dettes par conteneur
- **Sorties de stock en FIFO multi-conteneurs** : une vente ou un
  transfert peut désormais puiser automatiquement dans **plusieurs
  conteneurs** si le plus ancien ne suffit pas — totalement invisible pour
  vous, ça fonctionne tout seul
- **Ciblage manuel possible** : sur chaque ligne de vente, un sélecteur
  "Conteneur (optionnel)" apparaît dès qu'un article a du stock dans
  plusieurs conteneurs — utile quand un client demande spécifiquement la
  nouvelle version d'un article alors que l'ancienne est encore
  disponible. Laissé sur "Automatique", le système prend le plus ancien
  en priorité
- **Annulation d'une vente validée** restitue désormais le stock
  exactement aux conteneurs d'où il avait été prélevé (et non plus
  systématiquement à Stock Initial)

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Étape 17 : conteneurs remplacent les
   achats`) → Push
3. **Action Supabase requise** : exécutez `0017_conteneurs_paiements_fifo.sql`
   dans le SQL Editor

### À tester

1. Créez un conteneur **sans montant d'achat** : vérifiez qu'il se crée
   normalement
2. Créez un conteneur **avec montant** contenant un article déjà présent
   dans un autre conteneur (ex : Stock Initial)
3. Créez une vente sur cet article avec une quantité qui dépasse ce qu'il
   y a dans le conteneur le plus ancien : vérifiez que la vente se valide
   quand même (elle doit puiser automatiquement dans les deux conteneurs)
4. Recommencez une vente sur ce même article, mais cette fois choisissez
   explicitement un conteneur dans le sélecteur "Conteneur (optionnel)" :
   vérifiez que seul ce conteneur est décrémenté
5. Annulez une vente validée : vérifiez que le stock revient bien dans
   les bons conteneurs (regardez le détail du conteneur concerné)
6. Enregistrez un paiement sur un conteneur : vérifiez qu'il apparaît
   automatiquement dans **Caisse > Décaissements** et dans **Tiers >
   Dettes**

---

## CONTENEURS — ÉTAPE 4-A

Cette livraison ajoute le coût de revient par conteneur, libère
définitivement le prix de vente du prix d'achat, et généralise la
possibilité de modifier/supprimer les données sensibles — protégée par
un nouveau **code PIN à 4 chiffres**, distinct du second mot de passe.

### Ce qui a été fait

- **Coût de revient par conteneur** (Stock > Conteneurs, ouvrez un
  conteneur) : calculé automatiquement, uniquement quand le conteneur est
  entièrement écoulé et qu'un montant d'achat a été renseigné — toujours
  recalculé à la volée, jamais figé
- **Paramètres > Seuils** : le délai d'alerte avant expiration est
  maintenant modifiable depuis un onglet dédié
- **Date de conception du site** : modifiable dans Paramètres > Général,
  affichée en pied de menu latéral
- **Code PIN à 4 chiffres** (Paramètres > Sécurité) : nouveau, distinct du
  second mot de passe, protège désormais les suppressions d'articles, de
  paiements et de retours
- **Articles** : la colonne et le champ "Prix d'achat" ont disparu ;
  suppression d'un article possible (protégée par le code PIN ; refusée
  proprement si l'article est déjà utilisé dans une vente ou un
  mouvement de stock)
- **Ventes — brouillons** : "Modifier" et "Supprimer" disponibles sur
  tout brouillon (aucun code requis, puisqu'un brouillon n'a encore
  engagé ni stock ni caisse) ; modifier recharge les lignes existantes et
  les remplace à l'enregistrement
- **Ventes — prix de référence** : affiché au-dessus du champ de prix
  réel (n'en décale plus jamais la position), avec un message d'alerte
  dès que le prix réel tombe sous le prix de référence ; colonne "Prix
  référence" ajoutée au détail de la vente
- **Paiements de ventes et retours clients** : modifier et supprimer
  disponibles partout ; la suppression est protégée par le code PIN et
  répercute automatiquement la caisse (le décaissement/encaissement lié
  disparaît avec le paiement)
- Nettoyage : pages Caisse (Encaissements/Décaissements séparés) et Tiers
  (Créances) retirées, devenues orphelines depuis la simplification du
  menu

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Conteneurs étape 4-A`) → Push
3. **Aucune action Supabase requise** — toutes les fonctions nécessaires
   (code PIN, suppressions sécurisées, coût de revient) étaient déjà en
   base depuis les livraisons précédentes

### À tester

1. **Paramètres > Sécurité** : définissez votre code PIN à 4 chiffres si
   ce n'est pas déjà fait
2. **Paramètres > Seuils** : modifiez le délai d'alerte d'expiration
3. **Paramètres > Général** : renseignez la date de conception du site,
   vérifiez qu'elle s'affiche en bas du menu
4. **Stock > Articles** : vérifiez l'absence du prix d'achat, testez la
   suppression d'un article inutilisé (code PIN demandé)
5. **Ventes** : créez un brouillon, modifiez-le, supprimez-le ; sur une
   ligne, saisissez un prix inférieur au prix de référence et vérifiez le
   message d'alerte
6. **Ventes > Paiements** et **Ventes > Retours** : testez modifier et
   supprimer (code PIN demandé pour supprimer)
7. **Stock > Conteneurs** : ouvrez un conteneur entièrement vendu avec un
   montant d'achat renseigné, vérifiez que le coût de revient s'affiche

---

## CONTENEURS — ÉTAPE 4-B

Dernière grande livraison du chantier conteneurs : caisse en livre
comptable, Stock unifié, Tiers fusionnés, Rapports ajustés, onboarding
réellement obligatoire, Inventaire complet, et surtout — **le temps
réel** : ce que fait un utilisateur apparaît désormais chez tous les
autres sans qu'ils aient besoin de recharger la page.

### Ce qui a été fait

- **Caisse > Solde** devient un véritable livre de caisse : tableau
  Numéro/Date/Désignation/Recette/Dépense/Solde cumulatif, boutons
  "Recette" et "Dépense" pour ajouter une opération manuelle
  directement, export Excel au même format. Les anciennes pages
  Encaissements/Décaissements séparées ont disparu (l'encaissement
  d'une vente s'y ajoute déjà automatiquement)
- **Tiers** : Clients et Fournisseurs sont réunis sur une seule page
  (`Tiers`) avec un simple bouton pour filtrer entre les deux
- **Stock** devient une page unique avec trois onglets en défilement
  (Articles / Stock / Inventaire) et trois boutons en en-tête ouvrant
  des formulaires : **Mouvements** (transfert rapide entre
  emplacements), **Alerte** (ajuster en masse les seuils de stock
  minimum), **Conteneur** (import Excel direct, sans quitter la page)
- **Stock (onglet)** : quantité détaillée par conteneur ajoutée à côté
  du total, et raccourci pour vider un stock
- **Inventaire** : date de l'inventaire à la création, export PDF dédié
  (théorique / réel / écart), et surtout **modifier et supprimer
  toujours possibles** — librement si le brouillon n'a pas encore été
  validé, protégé par le code PIN et avec restitution automatique du
  stock si l'inventaire était déjà validé
- **Rapports** : la valeur du stock a été retirée du rapport Stock ;
  un filtre **Mois + Année précis** s'ajoute aux périodes relatives
  existantes ; l'onglet "Achats" devient "Conteneurs"
- **Import/Export** : la colonne "Prix d'achat" a disparu du modèle
  articles ; l'export "Achats" devient "Conteneurs"
- **Présentation obligatoire** : elle s'affiche désormais dès la
  première page visitée par un nouveau compte, quelle qu'elle soit —
  et non plus seulement si l'utilisateur passe par le tableau de bord
- **Temps réel (Supabase Realtime)** : activé sur les tables les plus
  partagées (articles, stocks, conteneurs, ventes, paiements,
  caisse, inventaires, historique...). Concrètement : si un collègue
  valide une vente pendant que vous regardez le tableau de bord ou la
  page Stock, les chiffres se mettent à jour tout seuls, sans recharger
- **Historique** : les suppressions protégées par le code PIN
  (paiements, retours, inventaires) et la suppression d'un article sont
  désormais journalisées, comme n'importe quelle autre action sensible

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Conteneurs étape 4-B`) → Push
3. **Action Supabase requise** : exécutez dans l'ordre `0020_inventaire_realtime.sql`
   puis `0021_journalisation_suppressions.sql` dans le SQL Editor

### À tester

1. **Caisse > Solde** : ajoutez une recette et une dépense manuelles,
   vérifiez le livre de caisse et exportez-le en Excel
2. **Tiers** : basculez entre Clients et Fournisseurs sur la même page
3. **Stock** : parcourez les 3 onglets, testez les 3 boutons
   (Mouvements, Alerte, Conteneur)
4. **Inventaire** : créez-en un avec une date différente d'aujourd'hui,
   exportez-le en PDF, testez la suppression d'un brouillon puis d'un
   inventaire validé (le code PIN doit être demandé)
5. **Rapports > Stock** : vérifiez l'absence de la colonne Valeur ;
   testez le filtre Mois/Année sur Ventes ou Caisse
6. **Temps réel** : ouvrez l'application dans deux onglets ou deux
   appareils différents, connectés avec deux comptes. Faites une vente
   sur l'un, vérifiez que le tableau de bord de l'autre se met à jour
   sans recharger la page
7. **Nouveau compte** : inscrivez un compte de test, vérifiez que la
   présentation s'affiche immédiatement quelle que soit la première
   page visitée, et qu'il est impossible de la fermer sans cliquer sur
   "Commencer"
8. **Historique** : supprimez un paiement ou un retour (code PIN),
   vérifiez que l'action apparaît bien dans Historique

### Point de vigilance

Si le temps réel ne semble pas fonctionner après avoir exécuté les
migrations, vérifiez dans Supabase que la réplication est bien active :
**Database > Replication**, la publication `supabase_realtime` doit
lister les tables concernées (c'est normalement automatique après avoir
exécuté `0020_inventaire_realtime.sql`, mais certains projets Supabase
désactivent Realtime par défaut au niveau du projet — dans ce cas,
activez-le dans **Settings > API > Realtime**).

---

## CONTENEURS — ÉTAPE 5/5 : COHÉRENCE GLOBALE (chantier terminé)

Dernière étape du chantier "conteneurs" démarré il y a quelques
livraisons : une relecture complète et méthodique du projet, page par
page, pour traquer tout ce que les étapes précédentes auraient pu
laisser incohérent — pas une nouvelle fonctionnalité, mais un vrai
passage de nettoyage.

### Ce qui a été trouvé et corrigé

- **Tableau de bord** : la carte "Solde caisse (période)" traînait
  encore alors qu'elle ne fait pas partie des 6 indicateurs que vous
  aviez validés (CA, valeur du stock, créances, dettes, encaissements,
  décaissements) — retirée, grille réorganisée
- **Un vrai bug d'utilisabilité** : depuis la fusion des Tiers, la page
  "Dettes fournisseurs" (paiements de conteneurs) n'était plus reliée
  nulle part dans le menu — impossible d'y accéder autrement qu'en
  ouvrant un conteneur précis. Remise en place sous **Tiers**, avec
  deux sous-entrées : Annuaire et Dettes fournisseurs
- **Import Excel articles** : la colonne "Prix d'achat" avait été
  retirée du modèle téléchargeable, mais le code de validation et
  d'insertion la lisait encore (sans bloquer les imports, mais de
  façon incohérente) — entièrement nettoyé
- **Textes obsolètes** : la présentation initiale et Paramètres >
  Listes mentionnaient encore "Devis" et "achats" — corrigés pour
  refléter l'application actuelle
- **Ventes** : tout résidu du champ "prix d'achat" par article a été
  retiré du code (sélection, formulaire, état) — la colonne technique
  correspondante en base, obligatoire depuis l'ancien système, reste
  remplie à 0 avec un commentaire expliquant pourquoi, plutôt que de
  laisser croire qu'elle sert encore à quelque chose
- **Page Transferts en doublon** : depuis l'ajout de la modale
  "Mouvements" (Stock), l'ancienne page dédiée aux transferts faisait
  doublon et n'était plus reliée au menu — supprimée
- **Temps réel étendu** : Retours clients, Paiements de ventes et
  Paiements de conteneurs se rafraîchissent désormais eux aussi
  automatiquement ; la table `retours_clients`, oubliée de la première
  liste, a été ajoutée à la publication temps réel

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Conteneurs étape 5/5 : cohérence
   globale`) → Push
3. **Action Supabase requise** : si vous n'avez pas encore exécuté
   `0021_journalisation_suppressions.sql` de l'étape précédente,
   faites-le — cette étape s'appuie dessus (ajout de la publication
   temps réel sur `retours_clients`). Aucun nouveau fichier SQL pour
   cette étape.

### À tester

1. **Tableau de bord** : vérifiez qu'il n'affiche plus que les 6
   indicateurs validés, en deux rangées de 3
2. **Tiers > Dettes fournisseurs** : vérifiez que la page est de
   nouveau accessible depuis le menu
3. **Import/Export** : téléchargez le modèle articles, vérifiez
   l'absence de la colonne "Prix d'achat", testez un import complet
4. **Stock** : vérifiez que le bouton "Mouvements" fonctionne toujours
   normalement (la page dédiée aux transferts a été retirée, tout
   passe maintenant par cette modale)
5. Repassez rapidement sur les écrans du quotidien (Ventes, Paiements,
   Retours, Conteneurs) pour confirmer que tout reste cohérent

### Bilan honnête

Cette relecture a porté sur l'ensemble du code visible et les parcours
les plus utilisés. Elle n'a pas inclus de test en conditions réelles
avec plusieurs comptes simultanés sur une longue durée — si vous
repérez encore une incohérence en utilisant l'application au
quotidien, dites-le-moi et je la corrige directement.

---

## CORRECTIFS — Conteneur (Stock), Modifier/Supprimer, code PIN

### Ce qui a été corrigé

- **Le bouton "Conteneur" dans Stock** semblait ne rien faire au clic —
  en réalité le formulaire s'ouvrait bien, mais s'ajoutait
  silencieusement tout en bas de la page au lieu de s'afficher en
  fenêtre superposée. Corrigé : il s'affiche maintenant clairement
  au-dessus du reste, comme les autres formulaires de l'application.
- **Modifier et Supprimer un conteneur** — n'existaient pas du tout
  jusqu'ici, uniquement le paiement. Ajoutés dans le détail d'un
  conteneur (clic depuis Stock > Conteneurs) :
  - **Modifier** : code, fournisseur, date, montant d'achat, observation
    — jamais le stock ni les paiements déjà enregistrés
  - **Supprimer** : protégé par le code PIN. Refusé automatiquement
    tant qu'il reste du stock dans ce conteneur, et refusé aussi s'il a
    déjà servi à une vente (pour ne jamais perdre l'historique) — avec
    un message clair dans chaque cas

### Sur le code PIN — une clarification importante

**Je n'ai jamais choisi de mot de passe ou de code à ta place.** Le
code PIN à 4 chiffres est à définir **par toi-même**, une seule fois,
dans **Paramètres > Sécurité**. Tant qu'il n'a jamais été défini,
aucune suppression protégée ne peut fonctionner nulle part dans
l'application — c'est normal, pas un bug.

**Si tu as essayé de le définir et que tu as vu un message "Impossible
de définir le code..."**, la cause la plus probable est que les
migrations SQL des étapes précédentes (`0019`, `0020`, `0021`) n'ont
pas encore été exécutées dans Supabase — sans elles, la fonction qui
enregistre le code n'existe tout simplement pas côté base de données.
Vérifie dans Supabase (SQL Editor → historique des requêtes) si ces
trois fichiers ont bien été lancés ; sinon, exécute-les dans l'ordre
maintenant, puis réessaie de définir ton code.

### Sur les Ventes — pour être précis

Modifier et Supprimer fonctionnent aujourd'hui **uniquement sur les
brouillons** (avant validation) — c'est volontaire, car une vente
validée a déjà touché le stock et potentiellement la caisse. Une vente
validée dispose d'"Annuler la vente" (protégée par le second mot de
passe, qui restitue le stock), pas d'une suppression directe. Si tu
constates que même un brouillon ne se supprime pas, c'est très
probablement la même cause que ci-dessus (migration 0019 non exécutée,
puisque `supprimer_vente_brouillon` en dépend) — dis-le-moi si le
problème persiste une fois les migrations à jour, je regarderai plus
précisément.

### Procédure

1. Dézippez ce zip par-dessus votre dossier de travail
2. GitHub Desktop → commit (`Correctifs conteneur, PIN, modifier/
   supprimer`) → Push
3. **Action Supabase requise** : exécutez `0022_modifier_supprimer_conteneur.sql`.
   Si vous avez un doute sur les migrations précédentes, vérifiez aussi
   que `0019`, `0020` et `0021` ont bien été exécutées (voir ci-dessus)

### À tester

1. **Paramètres > Sécurité** : définissez votre code PIN si ce n'est
   pas déjà fait — vérifiez qu'aucun message d'erreur n'apparaît
2. **Stock > bouton "Conteneur"** : vérifiez que le formulaire
   s'affiche bien immédiatement, en fenêtre superposée
3. **Stock > Conteneurs > cliquez sur un conteneur** : testez
   "Modifier" (changez l'observation par exemple), puis "Supprimer"
   sur un conteneur vide de test (le code PIN doit être demandé)
4. **Ventes** : ouvrez un brouillon, testez Modifier et Supprimer
