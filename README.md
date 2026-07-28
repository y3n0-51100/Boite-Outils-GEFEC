# Boîte à Outils GEFEC — Suite (Magasin BUT)

Suite d'outils PDF pour le magasin, réunis dans une interface unique à la charte
claire et professionnelle. Fusion des deux outils existants (Outil-Promo-GEFEC +
Étiquettes 2.0) : l'ancien outil **Plan Promo** a été **remplacé par Étiquettes 2.0**.

## Outils inclus

| Outil | Rôle | Valorisation requise |
| --- | --- | --- |
| **Affiches CETELEM** | Sélectionne et imprime les affiches de financement sur les produits exposés (PDF valorisation + ZIP des affiches `EAN_*.pdf`). | Oui |
| **Plans Promo TV & PEM** (Étiquettes 2.0) | Deux onglets — **Plan Promo TV** et **Plan Promo PEM** — croisent chaque plan promo national avec le stock magasin et impriment les affiches prix **BON PLAN** / **PROMO DU MOMENT** (A4 et A5), fidèles à la charte BUT. | Oui |
| **Soldes Magasin** | Déduplique le listing magasin vs Média Centrale, imprimable. | Non |
| **SISTO Checker** | Relit l'édition PDF « Situation Stocks des Encours Fournisseurs » du magasin et permet de **filtrer et trier** les références sur tous leurs critères : stock expo / dépôt, disponible à la vente, disponible à terme, commandes, média, gamme, famille, marque, verrouillage, ventes M à M-3, prix, marge… Export CSV et impression. | Non |

## Architecture

- `index.html` — la **coque** : page d'accueil (cartes outils + dépôt de la
  valorisation partagée), navigation par onglets, et chargement de chaque outil
  dans une iframe. Charte claire commune ; les outils hérités (CETELEM, Soldes)
  sont automatiquement rebasculés en charte claire par injection de variables CSS.
- `etiquette.html` — l'outil **Étiquettes 2.0** complet et autonome (polices et
  masques officiels intégrés). Chargé en iframe par la coque.
- `sisto.html` — l'outil **SISTO Checker**, complet et autonome. Chargé en iframe
  par la coque. Il ne dépend ni de la valorisation ni d'un document publié par
  l'administrateur : chaque utilisateur y dépose son propre SISTO.
- `base-eco.js` — base des éco-participations (publiée par l'administrateur depuis
  l'outil Étiquettes ; chargée automatiquement au démarrage).

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
Pour Plans Promo TV & PEM, il ne reste qu'à déposer les plans promo (TV et/ou PEM,
reconnus automatiquement) dans l'outil — ou à les publier depuis le compte
administrateur pour tous les magasins. **Soldes Magasin** et **SISTO Checker**
s'ouvrent sans valorisation.

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
