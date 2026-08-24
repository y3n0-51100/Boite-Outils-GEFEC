# Boîte à Outils GEFEC — Suite (Magasin BUT)

Suite d'outils PDF pour le magasin, réunis dans une interface unique à la charte
claire et professionnelle. Fusion des deux outils existants (Outil-Promo-GEFEC +
Étiquettes 2.0) : l'ancien outil **Plan Promo** a été **remplacé par Étiquettes 2.0**.

## Deux profils d'accès

Le rôle du compte connecté (table `profiles`) décide de l'interface servie —
`app-auth.js` appelle `applyUserMode()` **avant** que la coque ne charge le
moindre outil, pour qu'aucun cadre ne démarre dans le mauvais mode.

| | **Magasin** (`role = store`) | **Administrateur / directeur régional** |
| --- | --- | --- |
| Valorisation | **Obligatoire et de moins de 4 semaines** : un portail bloque tout accès tant qu'elle n'est pas déposée | Aucun barrage |
| Outils servis | Affiches CETELEM · Plan Promo TV & PEM · Soldes Magasin | Les cinq outils |
| Plan Promo | Onglets TV / PEM, **trois choix** (type d'affiche, format, papier) et l'aperçu — croisement automatique, ni fichiers ni tableau produits ni réglages | Outil complet (étapes 1 à 4) |
| Promo Perso · SISTO Checker | Hors périmètre : carte, onglet et vue retirés du document | Accessibles |
| Soldes Magasin | Fichiers Média Centrale **publiés par l'administrateur** (lecture seule) ; le magasin n'apporte que son regroupement | Dépôt libre des deux jeux de fichiers |
| Pop-ups | Aucun | Rappels « document partagé » à l'ouverture d'un outil |

Le cloisonnement est **côté interface** : il retire ce qui n'a pas lieu d'être
pour un magasin, il ne remplace pas les politiques RLS Supabase, qui restent la
seule barrière sur les données (valorisations, documents partagés, comptes).

## Outils inclus

| Outil | Rôle | Valorisation requise |
| --- | --- | --- |
| **Affiches CETELEM** | Sélectionne et imprime les affiches de financement sur les produits exposés (PDF valorisation + ZIP des affiches `EAN_*.pdf`). | Oui |
| **Plan Promo TV & PEM** | Deux onglets — **Plan Promo TV** et **Plan Promo PEM** — croisent chaque plan promo national avec le stock magasin et impriment les affiches prix **BON PLAN** / **PROMO DU MOMENT** (A4 et A5), fidèles à la charte BUT. | Oui |
| **Promo Perso** | Outil **dissocié** du plan promo national : le magasin compose lui-même sa sélection (recherche dans la base article, import d'une liste de codes EAN, ou **récupération des EAN filtrés dans SISTO Checker**), saisit ses prix promo et imprime les mêmes affiches. | Non |
| **Soldes Magasin** | Déduplique le listing magasin vs Média Centrale, imprimable. | Non |
| **SISTO Checker** | Relit l'édition PDF « Situation Stocks des Encours Fournisseurs » du magasin et permet de **filtrer et trier** les références sur tous leurs critères : stock expo / dépôt, disponible à la vente, disponible à terme, commandes, média, gamme, famille, marque, verrouillage, ventes M à M-3, prix, marge… Export CSV et impression. Le bouton **« ⭐ Envoyer vers Promo Perso »** enregistre les EAN du filtre courant pour les récupérer d'un clic dans **Promo Perso**. | Non |

## Architecture

- `index.html` — la **coque** : page d'accueil (cartes outils + dépôt de la
  valorisation partagée), navigation par onglets, et chargement de chaque outil
  dans une iframe. Charte claire commune ; les outils hérités (CETELEM, Soldes)
  sont automatiquement rebasculés en charte claire par injection de variables CSS.
- `etiquette.html` — le moteur d'étiquettes complet et autonome (polices et
  masques officiels intégrés). Chargé en iframe par la coque, dans **deux modes**
  qui ne partagent rien à l'écran : `etiquette.html` = **Plan Promo TV & PEM**
  (onglets TV / PEM), `etiquette.html?plan=perso` = **Promo Perso** (outil à part,
  sa propre carte sur l'accueil, chargé seulement à la première ouverture).
  Le paramètre `?mode=simple`, ajouté par la coque pour les comptes magasin,
  réduit l'outil à l'écran d'impression : barre d'étapes, panneau fichiers,
  tableau produits et réglages sont masqués (les nœuds restent en place, le
  moteur continue d'y écrire), `goStep()` ramène toujours aux étiquettes et le
  croisement se fait tout seul dès que plan promo et valorisation sont là.
- `sisto.html` — l'outil **SISTO Checker**, complet et autonome. Chargé en iframe
  par la coque. Il ne dépend ni de la valorisation ni d'un document publié par
  l'administrateur : chaque utilisateur y dépose son propre SISTO.
- `base-eco.js` — base article NOSICA (éco-participations, libellés, prix de
  vente) régénérée chaque nuit par GitHub Actions et chargée automatiquement au
  démarrage. En cas de panne de la mise à jour automatique, l'administrateur peut
  **déposer le fichier Excel NOSICA à la main** (⚙️ Réglages → « Base article
  NOSICA ») : il est alors injecté chez tous les magasins et remplace la base
  automatique dans les deux outils d'étiquettes. Dans les deux cas, le ruban
  « Base NOSICA » de l'accueil affiche le **nombre de références** de la base
  active : lu directement dans `base-eco.js` pour la base automatique, remonté
  par l'outil Étiquettes (message `gefec:base-count`) après relecture du
  classeur pour la base déposée à la main — la coque n'embarque pas SheetJS.

### SISTO Checker → Promo Perso

Le passage d'un outil à l'autre se fait par le **stockage local du navigateur**
(même origine, clé `GEFEC_SISTO_PROMO`) : SISTO Checker y dépose les références
affichées par le filtre courant (EAN, libellé, marque, prix de vente magasin),
Promo Perso les reprend à la demande. Une référence absente de la base article
reste exploitable : son libellé et son prix viennent alors du SISTO.

### SISTO Checker — lecture du PDF

L'édition SISTO est un état à colonnes fixes : chaque référence occupe un bloc de
**3 lignes logiques**, et chaque colonne occupe une **bande horizontale constante**
(en points PDF, page A4 paysage). L'analyseur reconstruit donc chaque référence
**par position**, jamais par ordre d'apparition des mots :

| Ligne | Contenu |
| --- | --- |
| 0 | RVC (V = verrouillé, R = réapprovisionné) · EAN 13 · libellé · « A stocker » · famille · Px vnt moy · PV Mag · **STK expo.** · DV Expo · Qté indis. Mag · information commande · DAT+Prop. · ventes M à M-3 · Qté vente année · DEEE · UCDE |
| 1 | Gamme · marque · typologie · « A exposer » · marge moy % · PADE · **STK HE (dépôt)** · DV HE · réglage STK Min/Max · prévisions M à M+3 · DEA · CDT |
| 2 | Liste clé · indice stock · IDV (index de vendabilité) · étoile · **Média** + code média · date DEEE/DEA |

Les bandes de colonnes sont déclarées en tête du script de `sisto.html`
(`CB` colonnes centrées, `RB` alignées à droite, `LB` alignées à gauche) : c'est
le seul endroit à ajuster si la mise en forme de l'édition évolue. Dans cet état,
une case chiffrée laissée vide vaut **zéro** ; filtres et totaux la comptent comme telle.

La **valorisation** est déposée une seule fois sur l'accueil et transmise
automatiquement aux outils qui en ont besoin (Affiches CETELEM et Étiquettes).
Pour Plan Promo TV & PEM, il ne reste qu'à déposer les plans promo (TV et/ou PEM,
reconnus automatiquement) dans l'outil — ou à les publier depuis le compte
administrateur pour tous les magasins. **Promo Perso**, **Soldes Magasin** et
**SISTO Checker** s'ouvrent sans valorisation.

## Documentation

| Document | Public | Régénération |
| --- | --- | --- |
| `docs/Tutoriel-Directeurs-GEFEC.pdf` | **Directeurs de magasin** — 9 pages : une page de présentation, puis deux pages par outil (à quoi il sert, la marche à suivre, une capture annotée, un mémo « 30 secondes »). | `node scripts/make-tutoriel.js` |
| `docs/Guide-Utilisation-GEFEC.pdf` | Magasins & directeurs régionaux — connexion, valorisation, principes généraux. | `node scripts/make-guide.js` |
| `docs/Guide-Outil-Promo-GEFEC.pdf` | Outil promo (historique). | `node scripts/make-flyer.js` |

Les captures annotées du tutoriel vivent dans `docs/captures/`. Elles sont
produites par un navigateur réel, les pastilles numérotées étant injectées sur
les éléments avant la capture — elles suivent donc la mise en page :

```bash
python3 -m http.server 8099 &                     # servir le dépôt
SISTO_PDF=/chemin/vers/un-sisto.pdf \
  node scripts/shoot-captures.js                  # régénère docs/captures/
node scripts/make-tutoriel.js                     # régénère le PDF
```

`scripts/fonts/` contient Manrope (OFL), la police de la charte, embarquée dans
le PDF pour qu'il soit identique partout.

## Démarrage

Servir le dossier (les outils étant chargés en iframe + `base-eco.js` en relatif,
il faut un serveur, pas un simple `file://`) :

```bash
python3 -m http.server 8080   # puis ouvrir http://localhost:8080
```

Ou publier le dépôt sur **GitHub Pages** (Settings → Pages → branche `main`).
Une connexion internet est requise au premier chargement (polices + bibliothèques
PDF via CDN).

## Charte graphique

Charte claire, moderne et neutre, commune à l'accueil et aux trois outils
(variables CSS partagées : fond clair, surfaces blanches, accents par outil —
orange CETELEM, rouge BUT Étiquettes, vert Soldes, cyan SISTO). Les **affiches imprimées**
par Étiquettes conservent obligatoirement la charte BUT rouge/jaune (fidélité
d'impression).
