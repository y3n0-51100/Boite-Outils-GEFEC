# Boîte à Outils GEFEC — Suite (Magasin BUT)

Suite d'outils PDF pour le magasin, réunis dans une interface unique à la charte
claire et professionnelle. Fusion des deux outils existants (Outil-Promo-GEFEC +
Étiquettes 2.0) : l'ancien outil **Plan Promo** a été **remplacé par Étiquettes 2.0**.

## Deux profils d'accès

Le rôle du compte connecté (table `profiles`) décide de l'interface servie —
`app-auth.js` appelle `applyUserMode()` **avant** que la coque ne charge le
moindre outil, pour qu'aucun cadre ne démarre dans le mauvais mode.

> Depuis la mise en place de l'envoi automatique, le magasin a **trois états**
> possibles, décidés par lui-même à la première connexion (voir « Le magasin
> choisit »). Le tableau ci-dessous décrit le magasin qui imprime lui-même.

| | **Magasin** (`role = store`) | **Administrateur / directeur régional** |
| --- | --- | --- |
| Valorisation | **Obligatoire et de moins de 4 semaines** : un portail bloque tout accès tant qu'elle n'est pas déposée | Aucun barrage |
| Outils servis | Affiches CETELEM · Plan Promo TV, PEM & Star · Soldes Magasin | Les cinq outils magasin + **Envoi Campagne Mail** (administrateur seul) |
| Plan Promo | Onglets TV / PEM / Star, **trois choix** (type d'affiche, format, papier) et l'aperçu — croisement automatique, ni fichiers ni tableau produits ni réglages | Outil complet (étapes 1 à 4) |
| Promo Perso · SISTO Checker | Hors périmètre : carte, onglet et vue retirés du document | Accessibles |
| Soldes Magasin | Fichiers Média Centrale **publiés par l'administrateur** (lecture seule) ; le magasin n'apporte que son regroupement | Dépôt libre des deux jeux de fichiers |
| Affiches par mail | Reçues par le directeur, prêtes à imprimer | **Bouton « ✉️ Affiches »** dans 📂 Valorisations : envoie le PDF de toutes les affiches du magasin |
| Envoi Campagne Mail | Hors périmètre : carte, onglet et vue retirés du document | **Réservé à l'administrateur** (les directeurs régionaux ne l'ont pas) : la liste des magasins, un bouton par magasin, les affiches en pièces jointes |
| Ruban d'état (valorisation, documents) | Masqué | Affiché pour l'**administrateur** seul |
| Accueil | Cartes des outils | **Cases de réglages** : documents, valorisations, campagne, envois, comptes, masques — les outils restent sur la barre d'onglets |
| Pop-ups | Aucun | Rappels « document partagé » à l'ouverture d'un outil |

Le cloisonnement est **côté interface** : il retire ce qui n'a pas lieu d'être
pour un magasin, il ne remplace pas les politiques RLS Supabase, qui restent la
seule barrière sur les données (valorisations, documents partagés, comptes).

## Outils inclus

| Outil | Rôle | Valorisation requise |
| --- | --- | --- |
| **Affiches CETELEM** | Sélectionne et imprime les affiches de financement sur les produits exposés (PDF valorisation + ZIP des affiches `EAN_*.pdf`). | Oui |
| **Plan Promo TV, PEM & Star** | Trois onglets — **Plan Promo TV**, **Plan Promo PEM** et **Produits Star** — croisent chaque plan national avec le stock magasin et impriment les affiches prix **BON PLAN** / **PROMO DU MOMENT** (A4 et A5), fidèles à la charte BUT. Les plans TV et PEM sont publiés en PDF, le plan **Produits Star** en **Excel** (fichier « récapitulatif des stars ») ; le masque est choisi **automatiquement par produit** — BON PLAN sans promo, PROMO DU MOMENT (prix fond de rayon barré + pastille de remise) dès qu'une promo existe — avec un repère ★ à côté de la référence. | Oui |
| **Promo Perso** | Outil **dissocié** du plan promo national : le magasin compose lui-même sa sélection (recherche dans la base article, import d'une liste de codes EAN, ou **récupération des EAN filtrés dans SISTO Checker**), saisit ses prix promo et imprime les mêmes affiches. | Non |
| **Soldes Magasin** | Déduplique le listing magasin vs Média Centrale, imprimable. | Non |
| **Envoi Campagne Mail** | **Administrateur uniquement.** Liste tous les magasins ; pour chacun un bouton qui contrôle la valorisation (**moins de 20 jours**), croise les plans promo publiés, génère **un PDF d'affiches par plan** (TV, PEM et Star) et envoie le mail au magasin avec les PDF **en pièces jointes**. Aucune application tierce. | Oui (celle du magasin visé) |
| **SISTO Checker** | Relit l'édition PDF « Situation Stocks des Encours Fournisseurs » du magasin et permet de **filtrer et trier** les références sur tous leurs critères : stock expo / dépôt, disponible à la vente, disponible à terme, commandes, média, gamme, famille, marque, verrouillage, ventes M à M-3, prix, marge… Export CSV et impression. Le bouton **« ⭐ Envoyer vers Promo Perso »** enregistre les EAN du filtre courant pour les récupérer d'un clic dans **Promo Perso**. | Non |

## Architecture

- `index.html` — la **coque** : page d'accueil (cartes outils + dépôt de la
  valorisation partagée), navigation par onglets, et chargement de chaque outil
  dans une iframe. Charte claire commune ; les outils hérités (CETELEM, Soldes)
  sont automatiquement rebasculés en charte claire par injection de variables CSS.
- `etiquette.html` — le moteur d'étiquettes complet et autonome (polices et
  masques officiels intégrés). Chargé en iframe par la coque, dans **deux modes**
  qui ne partagent rien à l'écran : `etiquette.html` = **Plan Promo TV, PEM &
  Star** (onglets TV / PEM / Star — le plan **Star** est publié en **Excel**,
  pas en PDF comme TV/PEM ; le masque est choisi automatiquement par produit
  — BON PLAN sans promo, PROMO DU MOMENT avec prix barré et pastille de
  remise dès qu'une promo existe —, avec un repère ★ à côté de la
  référence), `etiquette.html?plan=perso` = **Promo
  Perso** (outil à part, sa propre carte sur l'accueil, chargé seulement à la
  première ouverture).
  Le paramètre `?mode=simple`, ajouté par la coque pour les comptes magasin,
  réduit l'outil à l'écran d'impression : barre d'étapes, panneau fichiers,
  tableau produits et réglages sont masqués (les nœuds restent en place, le
  moteur continue d'y écrire), `goStep()` ramène toujours aux étiquettes et le
  croisement se fait tout seul dès que plan promo et valorisation sont là.
- `campagne.html` + `campagne.js` — l'outil **Envoi Campagne Mail**, autonome et
  réservé à l'administrateur (voir plus bas). Chargé en iframe par la coque, à
  la première ouverture seulement.
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

### Le mail « vos affiches sont prêtes »

Une fois qu'un magasin a déposé sa valorisation **et** que les plans promo TV et
PEM sont publiés, plus rien n'oblige le directeur à ouvrir l'outil : depuis
**📂 Valorisations**, l'administrateur clique sur **✉️ Affiches** en face du
magasin, et le directeur reçoit un mail contenant **un seul lien**. Un clic, et
tout le jeu d'affiches de son magasin arrive en PDF, prêt à imprimer — sans
connexion, sans croisement à faire. Le bouton **« ✉️ Envoyer les affiches aux N
magasin(s) prêt(s) »** fait la même chose pour tous les magasins d'un coup.

Le PDF est fabriqué **dans le navigateur de l'administrateur**, par le moteur
d'étiquettes lui-même : la coque charge `etiquette.html?export=1` dans un cadre
invisible — l'outil complet, sans écran — lui passe les plans publiés et la
valorisation du magasin, et récupère toutes les planches en un seul PDF. Ce sont
donc exactement les affiches que le magasin verrait dans l'outil, avec les mêmes
trois choix (type d'affiche, format A4 / A5 ×2, papier blanc ou pré-imprimé),
faits ici par l'administrateur au moment de l'envoi.

| Étape | Où | Détail |
| --- | --- | --- |
| Génération | Navigateur de l'admin | `gefecBuildAffiches()` : valorisation × plans promo → planches → PDF (html2canvas + jsPDF, chargés à la demande). Le rendu se fait dans un document réduit à la feuille de style de l'outil : html2canvas recopie le document à chaque planche, et recopier la page entière (masques embarqués compris) coûte des secondes par affiche au lieu d'un dixième de seconde. |
| Dépôt | Bucket privé `affiches` | `<code magasin>/affiches.pdf`, remplacé à chaque envoi : les liens déjà partis restent valides et servent la dernière version. |
| Lien | URL signée Supabase | Valable 30, 60 ou 90 jours au choix, avec l'option `download` pour que le clic télécharge au lieu d'afficher. |
| Mail | Fonction Edge `send-affiches-mail` | Trois voies, la première configurée l'emporte : **SMTP** (la messagerie que vous avez déjà — ni compte ni domaine à créer), Brevo, ou Resend. Les identifiants restent côté serveur. **Sans aucune voie configurée**, l'outil ne bloque pas : il prépare le message dans la messagerie de l'administrateur, lien inclus. Un fournisseur qui refuse (clé invalide, domaine non vérifié) affiche l'erreur au lieu de basculer sur la messagerie — la panne est réparable, autant la montrer. |
| Trace | Table `affiches_mails` | « affiches envoyées il y a 3 jours à … » sous chaque magasin. |

Mise en place : exécuter [`supabase/add-affiches-mail.sql`](./supabase/add-affiches-mail.sql)
puis déployer la fonction — tout est détaillé dans
[`supabase/SETUP.md`](./supabase/SETUP.md), étape 6. L'adresse du directeur est
demandée au premier envoi et mémorisée sur la fiche du magasin.

## Comptes magasins en autonomie

Seuls l'**administrateur** et le **compte robot** sont créés à la main. Chaque
magasin crée lui-même son compte depuis l'écran de connexion (**Créer un
compte**). Le compte n'est valide qu'avec les quatre éléments :

| Élément | Règle |
| --- | --- |
| Nom du magasin | Sert d'identifiant de connexion (« BUT Reims » → `but-reims`) ; unique |
| Mot de passe | 8 caractères minimum |
| Adresses de réception | 1 à 3 adresses, où partent les affiches |
| Valorisation PDF | Obligatoire ; le PDF doit contenir des codes EAN. Tuto téléchargeable : `docs/Comment-ajouter-sa-valorisation.pdf` (`node scripts/make-tuto-valorisation.js`) |

La création passe par la fonction Edge publique `store-signup` (service_role,
retour arrière si une étape échoue).

Une fois connecté, le magasin **n'a aucun accès aux outils** : la coque n'est
pas chargée. Son espace se limite à :

- l'**historique des mails** envoyés à ses adresses (`campagne_mails`) ;
- ses **adresses de réception**, modifiables à tout moment ;
- l'interrupteur **Recevoir les affiches par mail** (`stores.mail_enabled`).

Les adresses et l'interrupteur s'enregistrent via la fonction SQL
`set_my_mail_settings()` — le magasin ne peut rien modifier d'autre sur sa
fiche. Côté envoi, chaque mail part à **chacune** des adresses du magasin, et
un magasin qui a coupé la réception est exclu des tournées.

Schéma : [`supabase/comptes-autonomes.sql`](./supabase/comptes-autonomes.sql).
Remise à zéro des comptes : [`supabase/purge-comptes.sql`](./supabase/purge-comptes.sql).

## L'outil « ✉️ Envoi Campagne Mail » (administrateur)

Les affiches ne partent plus en bloc : **chaque affiche TV ou PEM part le jour
où son offre démarre**, sur le masque de l'opération commerciale en cours, et
**une seule fois** par magasin. Pas d'affiche à mettre en place : pas de mail.

### Trois onglets

| Onglet | Contenu |
| --- | --- |
| **📅 Opérations** | Les opérations commerciales (nom, du, au, **masque des offres PROMO**, **masque des offres BON PLAN** — officiels ou masques perso), sur une frise et en liste. En dessous, les **réglages de l'envoi automatique** : activation, date de mise en service, adresse d'alerte, papier, objet et message du mail. |
| **📬 Envois programmés** | Le calendrier des 45 prochains jours : pour chaque jour, les offres qui démarrent, leur type (PROMO / BON PLAN), le masque retenu. Puis les magasins : **👁 Aperçu** (télécharge ce que le magasin recevra le jour choisi), **✉️ Envoyer maintenant**, **▶️ Lancer la tournée du jour**, et **📦 Campagne complète** (l'ancien mode : tous les plans, Star et CETELEM compris, sans tenir compte des dates). |
| **🕘 Historique** | Les tournées (automatiques ou manuelles, statut, magasins servis, alertes) et les 60 derniers mails. |

### Les règles

| Règle | Détail |
| --- | --- |
| Quand | Chaque matin à **6 h** (heure de Paris), GitHub Actions lance la tournée (`.github/workflows/envoi-auto-affiches.yml`). |
| Quelles offres | Celles **en cours** ce jour-là (du ≤ J ≤ au), dont le début est postérieur à la **mise en service**, et **jamais envoyées** à ce magasin. Une offre ratée (plan publié en retard) part donc à la tournée suivante. |
| Doublons | Clé `plan + EAN + du + au + prix` mémorisée dans `auto_sent` : une offre reprise à l'identique d'un plan promo à l'autre ne repart jamais ; si le prix ou les dates changent, l'affiche repart. |
| PROMO ou BON PLAN | Prix du plan **inférieur** au prix de vente de la base NOSICA → PROMO, avec le prix NOSICA **barré** ; sinon BON PLAN. |
| Masque | Celui de l'opération qui couvre la **date de début** de l'offre. Aucune opération → PROMO DU MOMENT / BON PLAN, et alerte. |
| Destinataires | Les magasins qui ont donné leur adresse (`stores.email`), au format qu'ils ont choisi (A4 / A5 par plan). |
| Valorisation | Plus de **20 jours** → rien n'est envoyé au magasin, alerte à l'administrateur. |
| Alertes | Un mail à l'adresse d'alerte **seulement s'il y a un problème** : valorisation périmée ou absente, offre sans opération, masque introuvable, échec d'envoi, base NOSICA non vérifiée depuis 48 h. |

### Architecture

- `auto-engine.js` — le moteur (réglages, opérations, croisement, dépôt, mail,
  mémorisation, journal). **Le même code** sert l'outil admin et la tournée.
- `etiquette.html?export=1` — `gefecBuildAuto()` génère les affiches du jour
  d'un magasin (masque **par produit**), `gefecPlanOffers()` liste les offres
  pour le calendrier.
- `auto-run.html` + `scripts/run-auto.js` — la tournée sans écran : Chromium
  (Playwright) ouvre la page, se connecte avec un **compte robot
  administrateur**, et lance `runDay()`.
- Mail : fonction Edge `send-campagne-mail`, inchangée (pièces jointes
  `<code magasin>/campagne/auto-tv.pdf` et `auto-pem.pdf`).
- Tables : `operations`, `auto_sent`, `auto_runs` ; réglages dans
  `app_settings` (clé `auto`) — [`supabase/add-envoi-auto.sql`](./supabase/add-envoi-auto.sql).

Mise en place : étape 8 de [`supabase/SETUP.md`](./supabase/SETUP.md).

## Documentation

| Document | Public | Régénération |
| --- | --- | --- |
| `docs/Tutoriel-Directeurs-GEFEC.pdf` | **Directeurs de magasin** — 9 pages : une page de présentation, puis deux pages par outil (à quoi il sert, la marche à suivre, une capture annotée, un mémo « 30 secondes »). | `node scripts/make-tutoriel.js` |
| `docs/Tuto-Envoi-Campagne-Mail.pdf` | **Administrateur** — 11 pages : la mise en place de l'outil « Envoi Campagne Mail » (Supabase, réglages, voie d'envoi), le déroulé d'une campagne, un tableau de dépannage et une check-list. | `node scripts/make-tuto-campagne.js` |
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
