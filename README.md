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
| Outils servis | Affiches CETELEM · Plan Promo TV & PEM · Soldes Magasin | Les cinq outils magasin + **Envoi Campagne Mail** (administrateur seul) |
| Plan Promo | Onglets TV / PEM, **trois choix** (type d'affiche, format, papier) et l'aperçu — croisement automatique, ni fichiers ni tableau produits ni réglages | Outil complet (étapes 1 à 4) |
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
| **Plan Promo TV & PEM** | Deux onglets — **Plan Promo TV** et **Plan Promo PEM** — croisent chaque plan promo national avec le stock magasin et impriment les affiches prix **BON PLAN** / **PROMO DU MOMENT** (A4 et A5), fidèles à la charte BUT. | Oui |
| **Promo Perso** | Outil **dissocié** du plan promo national : le magasin compose lui-même sa sélection (recherche dans la base article, import d'une liste de codes EAN, ou **récupération des EAN filtrés dans SISTO Checker**), saisit ses prix promo et imprime les mêmes affiches. | Non |
| **Soldes Magasin** | Déduplique le listing magasin vs Média Centrale, imprimable. | Non |
| **Envoi Campagne Mail** | **Administrateur uniquement.** Liste tous les magasins ; pour chacun un bouton qui contrôle la valorisation (**moins de 20 jours**), croise les plans promo publiés, génère **un PDF d'affiches par plan** (TV et PEM) et envoie le mail au magasin avec les deux PDF **en pièces jointes**. Aucune application tierce. | Oui (celle du magasin visé) |
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

## Le magasin choisit : imprimer lui-même, ou être servi par mail

À sa première connexion, une fois sa valorisation déposée, le magasin répond à
une question avant d'atteindre ses outils : **souhaite-t-il recevoir ses
affiches automatiquement par mail ?** C'est lui qui décide, et l'administrateur
n'a aucune adresse à saisir.

| Réponse | `stores.email` | Ce que le magasin voit | Ce que l'administrateur voit |
| --- | --- | --- | --- |
| Pas encore posée | `NULL` | Le portail s'ouvre après la valorisation | Aucune adresse — le magasin sort des envois groupés |
| **Oui** + adresse | l'adresse | **SISTO Checker seul**, plus le dépôt de sa valorisation et le choix du format de ses affiches (A4 / A5, par jeu) | Le magasin est prêt : ses affiches partent avec les autres |
| **Non** | `REFUSE` | Ses outils au complet, pour imprimer lui-même | « Ne souhaite pas d'affiches par mail » — exclu des envois |

Le magasin qui a dit oui n'a plus rien à croiser : la centrale fabrique ses
affiches et les lui envoie. Son périmètre se réduit donc à ce qui lui reste
utile. Il revient sur son choix quand il veut par **✉️ Mes envois mail**, qui
lui rend aussitôt ses outils s'il repasse en manuel.

Le format retenu par chaque magasin (`stores.mail_prefs`) est celui qu'emploie
l'outil de campagne : c'est le magasin qui décide s'il imprime en A4 ou en A5,
plan par plan.

## L'outil « ✉️ Envoi Campagne Mail » (administrateur)

L'administrateur dépose ses fichiers promo comme avant — rien ne change — puis
ouvre l'outil. **Tous les magasins apparaissent en liste**, chacun avec son
bouton. Un clic, et l'outil fait tout, seul :

| Étape | Ce que fait l'outil |
| --- | --- |
| 1 · Contrôle | La valorisation du magasin doit avoir **moins de 20 jours**. Au-delà — ou si elle n'a jamais été déposée — la ligne est marquée et ses boutons restent inactifs : des affiches issues d'une photo périmée porteraient sur des produits qui ne sont plus exposés. |
| 2 · Génération | `etiquette.html?export=1` est chargé hors écran (le moteur d'affiches, sans interface) : `gefecBuildCampagne()` croise les plans promo publiés avec la valorisation du magasin et rend **un PDF par plan** — Plan Promo TV et Plan Promo PEM. Le type d'affiche, le format (A4 ou A5 ×2) et le papier (blanc ou pré-imprimé) sont choisis par l'administrateur en tête d'écran. |
| 3 · Dépôt | Les PDF sont déposés dans le bucket privé `affiches`, sous `<code magasin>/campagne/<plan>.pdf`, remplacés à chaque campagne. |
| 4 · Envoi | La fonction Edge `send-campagne-mail` relit les PDF **côté serveur** et poste le mail avec les **deux pièces jointes** et le message annonçant le plan promo envoyé. Les mégaoctets ne repassent jamais par le navigateur. |
| 5 · Trace | Table `campagne_mails` : « dernière campagne il y a 3 jours à … » sous chaque magasin. |

Le bouton **« ⬇️ PDF »** fait les étapes 1 et 2 seulement et télécharge les
fichiers sur le poste de l'administrateur : de quoi contrôler une campagne avant
de l'envoyer. Le bouton **« ✉️ Envoyer à tous les magasins prêts (N) »** enchaîne
les magasins dont la valorisation est fraîche **et** l'adresse renseignée.

**Les adresses ne sont pas génériques** : une par magasin, saisie sur sa ligne
dans l'outil et mémorisée sur sa fiche (`stores.email`).

**L'adresse d'expédition se règle dans ⚙️ Réglages → « Envoi des campagnes
mail »** (nom de l'expéditeur, adresse, adresse de réponse, objet et message par
défaut). Elle est stockée dans la table `app_settings` et lue par la fonction
d'envoi : la changer ne demande aucun redéploiement. Le bouton « ✉️ Envoyer un
test » y envoie un vrai mail sans pièce jointe pour valider la configuration.
L'objet et le message acceptent `{magasin}`, `{code}`, `{plans}`, `{affiches}`,
`{pages}` et `{date}`.

Mise en place : exécuter [`supabase/add-campagne-mail.sql`](./supabase/add-campagne-mail.sql)
puis déployer la fonction `send-campagne-mail` — étape 7 de
[`supabase/SETUP.md`](./supabase/SETUP.md). Les voies d'envoi (SMTP, Brevo ou
Resend) sont **les mêmes secrets** que pour le mail « affiches prêtes » : si
celui-ci est déjà configuré, il n'y a rien à ajouter.

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
