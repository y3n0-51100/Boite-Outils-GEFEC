#!/usr/bin/env node
/* Rapport « Boîte à Outils GEFEC — Version 2 » (docs/v2/Rapport-Version-2.pdf).
   Les captures viennent de docs/v2/captures (node scripts/shoot-v2.js). */
'use strict';
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const ROOT = path.resolve(__dirname, '..');
const CAP = path.join(ROOT, 'docs', 'v2', 'captures');
const OUT = path.join(ROOT, 'docs', 'v2', 'Rapport-Version-2.pdf');
const FONT = (w) => path.join(__dirname, 'fonts', `Manrope-${w}.ttf`);

const C = { red: '#e30613', yellow: '#ffd500', ink: '#101828', ink2: '#475467', ink3: '#8591a3', line: '#e4e9f1', soft: '#f5f7fb', ok: '#12803c', warn: '#b25a06', bad: '#c8201f', blue: '#2f5bea' };
const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, info: { Title: 'Boîte à Outils GEFEC — Version 2', Author: 'Boîte à Outils GEFEC' } });
doc.pipe(fs.createWriteStream(OUT));
doc.registerFont('R', FONT(400)); doc.registerFont('M', FONT(600)); doc.registerFont('B', FONT(700)); doc.registerFont('X', FONT(800));

const W = 595.28, H = 841.89, M = 50, CW = W - 2 * M;
let y = 0, page = 0;

function footer() {
  doc.font('R').fontSize(8).fillColor(C.ink3)
    .text(`Boîte à Outils GEFEC — Version 2 · ${page}`, M, H - 32, { width: CW, align: 'right', lineBreak: false });
}
function newPage() {
  doc.addPage(); page++;
  doc.rect(0, 0, W, 6).fill(C.red);
  y = 44;
  footer();
}
function need(h) { if (y + h > H - 56) newPage(); }
function h1(t, n) {
  newPage();
  doc.font('X').fontSize(10).fillColor(C.red).text(n ? `PARTIE ${n}` : '', M, y, { characterSpacing: 1.2 });
  y += 16;
  doc.font('X').fontSize(22).fillColor(C.ink).text(t, M, y, { width: CW });
  y = doc.y + 14;
}
function h2(t) {
  need(60);
  doc.font('B').fontSize(13.5).fillColor(C.ink).text(t, M, y, { width: CW });
  y = doc.y + 6;
}
function p(t, o) {
  o = o || {};
  doc.font(o.font || 'R').fontSize(o.size || 10.3).fillColor(o.color || C.ink2);
  const h = doc.heightOfString(t, { width: o.width || CW, lineGap: 2.2 });
  need(h + 6);
  doc.text(t, o.x || M, y, { width: o.width || CW, lineGap: 2.2 });
  y = doc.y + (o.after != null ? o.after : 8);
}
function bullets(list) {
  for (const t of list) {
    doc.font('R').fontSize(10.3);
    const h = doc.heightOfString(t, { width: CW - 16, lineGap: 2.2 });
    need(h + 4);
    doc.circle(M + 4, y + 6.5, 2.2).fill(C.red);
    doc.fillColor(C.ink2).text(t, M + 14, y, { width: CW - 14, lineGap: 2.2 });
    y = doc.y + 4;
  }
  y += 4;
}
function box(title, text, color) {
  doc.font('R').fontSize(10);
  const h = doc.heightOfString(text, { width: CW - 30, lineGap: 2 }) + 36;
  need(h + 10);
  doc.roundedRect(M, y, CW, h, 9).fill(C.soft);
  doc.rect(M, y, 4, h).fill(color || C.blue);
  doc.font('B').fontSize(10.5).fillColor(C.ink).text(title, M + 16, y + 11, { width: CW - 30 });
  doc.font('R').fontSize(10).fillColor(C.ink2).text(text, M + 16, doc.y + 3, { width: CW - 30, lineGap: 2 });
  y += h + 12;
}
function table(rows, widths) {
  const pad = 6;
  rows.forEach((r, i) => {
    doc.font(i === 0 ? 'B' : 'R').fontSize(9.2);
    const hs = r.map((c, k) => doc.heightOfString(c, { width: widths[k] - 2 * pad, lineGap: 1.5 }));
    const rh = Math.max(...hs) + 2 * pad;
    need(rh + 2);
    if (i === 0) doc.rect(M, y, CW, rh).fill(C.ink);
    else if (i % 2 === 0) doc.rect(M, y, CW, rh).fill(C.soft);
    let x = M;
    r.forEach((c, k) => {
      doc.font(i === 0 ? 'B' : (k === 0 ? 'M' : 'R')).fontSize(9.2).fillColor(i === 0 ? '#fff' : (k === 0 ? C.ink : C.ink2))
        .text(c, x + pad, y + pad, { width: widths[k] - 2 * pad, lineGap: 1.5 });
      x += widths[k];
    });
    y += rh;
  });
  y += 12;
}
function img(file, caption, maxH) {
  const f = path.join(CAP, file);
  if (!fs.existsSync(f)) return;
  const im = doc.openImage(f);
  let w = CW, h = im.height * (CW / im.width);
  maxH = maxH || 430;
  if (h > maxH) { h = maxH; w = im.width * (maxH / im.height); }
  need(h + 34);
  const x = M + (CW - w) / 2;
  doc.roundedRect(x - 1, y - 1, w + 2, h + 2, 4).lineWidth(0.8).stroke(C.line);
  doc.image(im, x, y, { width: w, height: h });
  y += h + 6;
  if (caption) { doc.font('M').fontSize(8.6).fillColor(C.ink3).text(caption, M, y, { width: CW, align: 'center' }); y = doc.y + 14; }
}

/* ── Couverture ─────────────────────────────────────────────── */
doc.addPage(); page++;
doc.rect(0, 0, W, H).fill(C.red);
doc.roundedRect(M, 120, 92, 50, 10).fill(C.yellow);
doc.font('X').fontSize(30).fillColor(C.red).text('BUT', M, 128, { width: 92, align: 'center' });
doc.font('X').fontSize(40).fillColor('#fff').text('Boîte à Outils GEFEC', M, 220, { width: CW });
doc.font('X').fontSize(40).fillColor(C.yellow).text('Version 2', M, doc.y + 2, { width: CW });
doc.font('M').fontSize(14).fillColor('#ffe6e7').text('Ce qui a été analysé, proposé et mis en place', M, doc.y + 18, { width: CW });
doc.font('R').fontSize(11).fillColor('#ffe6e7').text(
  'Plan promo à mise en page variable · ZIP de la centrale avec affiches déjà faites · contrôle de lecture et garde-fous de prix · nouvelle interface claire / sombre · outil entièrement autonome · tests automatiques.',
  M, doc.y + 30, { width: CW - 40, lineGap: 3 });
doc.font('M').fontSize(10).fillColor('#ffe6e7').text(`Novembre 2026 · branche claude/dazzling-fermi-5o604r`, M, H - 80, { width: CW });

/* ── Résumé ─────────────────────────────────────────────────── */
h1('En bref', null);
p("L'outil a été repris de fond en comble autour de trois exigences : lire le plan promo de la centrale même quand sa mise en page change, reprendre obligatoirement les affiches que la centrale fournit dans son ZIP, et ne jamais imprimer ni envoyer un prix douteux. L'interface a été entièrement redessinée et chaque point a été vérifié par des tests automatiques.", { size: 11, color: C.ink });
table([
  ['Demande', 'Réponse apportée'],
  ['Le PDF de la centrale varie d\'une semaine à l\'autre', 'Double lecture (lecteur historique + lecteur adaptatif qui reconnaît les colonnes à leur intitulé), contre-lecture, contrôle de chaque prix par la base NOSICA, rapport de lecture visible à l\'écran.'],
  ['ZIP = plan promo + affiches déjà faites, à reprendre obligatoirement', 'Le ZIP est ouvert, le plan est lu, chaque affiche est rattachée à son produit et remplace l\'affiche générée : à l\'écran, à l\'impression, dans le PDF téléchargé, dans les mails de campagne et dans la tournée automatique de 6 h.'],
  ['Nouvelle interface, nouvelle ergonomie', 'Charte commune claire / sombre, en-tête compact, onglets de plan, tableau filtrable avec états, aperçu à côté des réglages avec zoom, téléchargement PDF, export CSV, statut base / valorisation toujours visible.'],
  ['Nouvelles fonctionnalités', 'Contrôle d\'un plan avant publication, plans en Excel/CSV, affiches rattachables à la main, calendrier des envois qui signale les offres bloquées et les affiches centrale, PDF mixte vectoriel.'],
  ['Fiabilité, vérification des masques', '213 vérifications automatiques ; les 14 combinaisons de masques testées sont identiques au pixel près à la version d\'origine ; plus aucune dépendance à un CDN ; tests lancés par GitHub à chaque modification.'],
], [150, CW - 150]);
box('Ce qui ne change pas', "Les affiches générées par l'outil (BON PLAN, PROMO DU MOMENT, Produits Star, A4 et A5, papier blanc ou pré-imprimé) sont strictement identiques : leur code n'a pas été modifié et la comparaison pixel à pixel avec l'ancienne version le prouve. Les comptes, la base Supabase, les fonctions d'envoi de mail et l'espace magasin restent tels quels : aucune migration SQL n'est nécessaire.", C.ok);

/* ── 1. Plan variable ───────────────────────────────────────── */
h1('Un plan promo qui peut changer de forme', 1);
p("Avant : l'outil cherchait une ligne d'en-tête contenant exactement « EAN » et « MARQUE », puis les intitulés « PRIX PROMO », « AVOIR », « DATES » écrits d'une certaine manière, et des dates au format JJ/MM/AAAA au JJ/MM/AAAA. Un intitulé reformulé, une colonne déplacée ou des dates écrites autrement suffisaient à perdre des prix ou des dates — sans que personne ne soit prévenu.");
h2('La double lecture');
bullets([
  "Le lecteur historique est conservé tel quel : sur le format habituel, il donne exactement les mêmes résultats qu'avant.",
  "Un lecteur adaptatif lit le même PDF en parallèle. Il reconnaît chaque colonne à son intitulé, avec ses variantes (« Code EAN », « GENCOD », « Désignation produit », « Prix de vente promo TTC », « PVC », « Prix fond de rayon », « Période de validité », « Date début / Date fin »…) et délimite les colonnes d'après la position réelle des données.",
  "Les colonnes à ne jamais imprimer sont identifiées pour être écartées : prix de cession, PA HT, avoir, remise arrière, marge, date d'envoi.",
  "Si la colonne du prix n'est reconnue par aucun intitulé, l'outil la retrouve en comparant chaque colonne chiffrée aux prix NOSICA — et marque ces prix « à vérifier » : jamais d'envoi automatique sans relecture.",
  "Le meilleur des deux lecteurs fait foi ; l'autre sert de contre-lecture : il complète un prix ou une date manquants et signale tout prix sur lequel les deux lectures divergent.",
  "Dates acceptées : 12/11/2026 au 25/11/2026, du 12/11 au 25/11, 12.11.26 – 25.11.26, « du 12 au 25 novembre », colonnes début / fin séparées, période annoncée dans le titre du plan, passage d'année (28/12 au 03/01). Une date impossible (31/02) est refusée.",
  "Prix acceptés : 1 699,99 €, 1.699,99, 1699.99, 749€99, 749,- … Un commentaire contenant un montant n'est jamais pris pour un prix.",
  "Pages pivotées, intitulés sur plusieurs lignes, références sur deux lignes, en-tête répété ou non à chaque page : tout est géré. Le type de plan (TV / PEM) est reconnu au titre, puis au nom du fichier, puis au contenu.",
]);
h2('Les garde-fous de prix');
table([
  ['État', 'Quand', 'Conséquence'],
  ['Sûr', 'Prix, référence et dates lus, prix cohérent avec NOSICA', 'Coché, imprimé, envoyé'],
  ['À vérifier', 'Prix supérieur au prix NOSICA, dates illisibles, EAN à la clé invalide, période de plus de 4 mois…', 'Coché, signalé en orange'],
  ['À corriger', 'Prix illisible, contradictoire entre les deux lectures, inférieur à 35 % du prix NOSICA (souvent l\'avoir lu à la place du prix), colonne prix déduite', 'Décoché, bandeau rouge, jamais envoyé par la tournée automatique tant que le plan n\'est pas corrigé ; l\'administrateur reçoit une alerte'],
], [80, 230, CW - 310]);
p("Saisir le bon prix dans le tableau suffit à lever l'alerte : la ligne redevient sûre et se coche toute seule.");
img('07-plan-nouveau-format.png', 'Un plan au format différent (colonnes déplacées et renommées) : lecture adaptative, 20/20 prix et dates, colonnes reconnues affichées.', 520);
img('04-plan-a-corriger.png', 'Un prix incohérent avec la base NOSICA : la ligne est décochée et signalée « à corriger ».', 330);

/* ── 2. ZIP ─────────────────────────────────────────────────── */
h1('Le ZIP de la centrale et ses affiches', 2);
p("Le ZIP peut être déposé dans l'outil Plan Promo par n'importe quel utilisateur, ou publié par l'administrateur dans ⚙️ Plans promo & documents (emplacement TV ou PEM). Il peut contenir des sous-dossiers ; les fichiers techniques de macOS sont ignorés ; un ZIP dans le ZIP est ouvert.");
h2('Ce que fait l\'outil de chaque fichier');
table([
  ['Fichier du ZIP', 'Traitement'],
  ['PDF en tableau', 'Plan promo : lu, contrôlé, rangé dans l\'onglet TV ou PEM'],
  ['PDF d\'affiches (une ou plusieurs pages)', 'Chaque page devient une affiche de la centrale, rattachée à son produit'],
  ['Classeur « Récapitulatif des Stars »', 'Plan Produits Star'],
  ['Autre classeur Excel / CSV', 'Plan promo en tableur'],
], [190, CW - 190]);
h2('Le rattachement d\'une affiche à son produit');
bullets([
  "1. Un code EAN imprimé sur l'affiche (le plus sûr).",
  "2. Un code EAN dans le nom du fichier (EAN_3045386801237_A4.pdf).",
  "3. La référence du produit (RO2611EA) retrouvée sur l'affiche, confirmée par la présence du prix promo. Les références emboîtées (RO2611 / RO2611EA) sont départagées ; une planche à deux poses rattache ses deux produits.",
  "Une affiche non reconnue est signalée « À rattacher » : une liste permet de choisir le produit en deux clics. Une affiche peut aussi être détachée (l'outil reprend alors l'affiche générée).",
]);
h2('Une reprise obligatoire, partout');
p("Dès qu'un produit a son affiche de la centrale, c'est elle qui sort — sans option pour l'ignorer — à l'écran, à l'impression (en haute définition, environ 175 dpi), dans le PDF téléchargé et dans les PDF envoyés par Campagne Mail et par la tournée de 6 h. Dans les PDF, l'affiche de la centrale est recopiée en vectoriel depuis son fichier d'origine : aucune perte de qualité. Les formats sont respectés : A4 portrait, planche A4 paysage à deux poses, et deux affiches A5 réunies sur une feuille A4 paysage. L'impression gère les feuilles portrait et paysage dans un même lot.");
img('02-plan-controle-affiches.png', 'Après dépôt du plan TV et du ZIP : contrôle de lecture du plan PEM et affiches de la centrale rattachées (une affiche illisible à rattacher à la main).', 560);
img('05-plan-apercu-a4.png', 'Aperçu : les affiches de la centrale passent en premier (repère « centrale »), puis les affiches générées.', 380);
img('06-plan-apercu-a5.png', 'Le même jeu en A5 ×2 : la planche paysage de la centrale est reprise telle quelle.', 380);

/* ── 3. Administration ──────────────────────────────────────── */
h1('Côté administrateur', 3);
h2('Contrôle avant publication');
p("Dans ⚙️ Plans promo & documents, choisir le PDF, l'Excel ou le ZIP de la semaine déclenche aussitôt sa lecture par le moteur d'affiches lui-même, exactement comme chez les magasins. Le rapport s'affiche sous le fichier : produits, prix et dates lus, lignes sûres / à vérifier / bloquantes, exemples de lignes signalées, affiches rattachées. S'il reste des points bloquants, une confirmation est demandée avant de publier pour tous les magasins.");
p("Un plan déposé dans le mauvais emplacement (un plan PEM dans « Plan promo TV ») est rangé selon son titre, et l'administrateur en est averti.");
img('21-admin-controle-zip.png', 'Le ZIP de la centrale contrôlé avant publication : 48 produits sûrs, 5 affiches dont 4 rattachées automatiquement.', 520);
h2('Envois automatiques et Campagne Mail');
bullets([
  "Les offres « à corriger » ne partent jamais : elles ne sont pas mémorisées comme envoyées et repartent dès que le plan publié est corrigé. Une alerte « offres au prix illisible ou incohérent » est envoyée à l'administrateur avec les EAN concernés.",
  "Le calendrier des envois programmés signale, offre par offre, les lignes bloquées, à vérifier et celles qui partiront avec l'affiche de la centrale.",
  "Les campagnes complètes écartent de même les lignes bloquantes et en donnent le nombre.",
  "Les réglages internes de l'outil Plan Promo (masques) ne sont plus protégés par un mot de passe écrit en clair dans le code (« admin123 ») : ils sont réservés au compte administrateur connecté.",
]);

/* ── 4. Interface ───────────────────────────────────────────── */
h1('Nouvelle interface', 4);
bullets([
  "Charte unique pour la coque et les six outils, en thème clair (par défaut) ou sombre ; un bouton en haut à droite bascule tout, le choix est mémorisé.",
  "Accueil : date du jour, dépôt de la valorisation mis en avant, cartes d'outils avec leur état (« Valorisation requise » / « Prêt »).",
  "Plan Promo : en-tête compact avec les onglets TV / PEM / Star et l'état de la valorisation et de la base NOSICA toujours visibles ; étapes Fichiers → Produits → Affiches.",
  "Tableau des produits : recherche, filtres (à vérifier, affiche centrale, non cochés), colonne État, cases de prix colorées selon le diagnostic, détail au survol (autre lecture du PDF, prix NOSICA), export CSV pour Excel.",
  "Affiches : réglages à gauche, aperçu à droite avec zoom réglable et numéro de feuille, boutons Imprimer et Télécharger le PDF.",
  "Les compteurs des onglets donnent le nombre d'affiches à imprimer ; les notifications indiquent le nombre de lignes à corriger.",
]);
img('11-accueil.png', 'Accueil (thème clair).', 400);
img('13-accueil-sombre.png', 'Accueil (thème sombre).', 400);
img('03-plan-produits.png', 'Tableau des produits : filtres, états, affiches centrale.', 420);
img('08-plan-sombre.png', 'Le même tableau en thème sombre.', 420);
img('12-outil-match.png', 'Affiches CETELEM dans la nouvelle charte.', 380);
img('12-outil-sisto.png', 'SISTO Checker dans la nouvelle charte.', 380);
img('20-accueil-admin.png', 'Accueil administrateur.', 400);

/* ── 5. Fiabilité ───────────────────────────────────────────── */
h1('Fiabilité et vérifications', 5);
h2('Un outil autonome');
p("Toutes les bibliothèques (lecture PDF, Excel, ZIP, création de PDF, Supabase) et les polices sont désormais servies depuis le dépôt (dossier vendor/). Avant, l'outil dépendait de trois CDN externes : la panne de l'un d'eux suffisait à le rendre inutilisable. Seule la connexion à Supabase (comptes et documents publiés) demande encore internet.");
h2('Les tests automatiques');
table([
  ['Batterie', 'Ce qui est vérifié', 'Résultat'],
  ['Lecteur de plan (npm test)', 'Prix, dates, EAN, intitulés de colonnes, 9 mises en page de PDF réelles (habituelle TV et PEM, colonnes reformulées et déplacées, début/fin séparés + prix barré, intitulé de prix méconnaissable, cellule prix vide, dates dans le titre, page pivotée, sans en-tête), garde-fou de l\'avoir, plan Excel, rattachement des affiches (EAN, nom de fichier, référence + prix, planche, affiche muette)', '138 / 138'],
  ['Outil complet dans Chromium (npm run test:navigateur)', 'Dépôt valorisation + PDF + ZIP, croisement, rattachement, rattachement manuel, tableau et filtres, correction d\'un prix, aperçu A4 / A5, impression, PDF téléchargé (pages et orientations), chaîne Campagne Mail et tournée automatique avec le ZIP, aucune erreur JavaScript', '33 / 33'],
  ['Masques', 'BON PLAN et PROMO DU MOMENT × A4 / A5 × papier blanc / pré-imprimé, Produits Star promo et bon plan, prix barré : comparés pixel à pixel à la version d\'origine', '14 combinaisons, 42 / 42'],
], [120, CW - 200, 80]);
p("Ces tests sont relancés par GitHub à chaque modification du code (onglet Actions, « Tests de l'outil ») : une régression ne peut plus passer inaperçue.");
box('Limite à connaître', "Aucun vrai PDF ni vrai ZIP de la centrale n'était disponible pour cette refonte : les tests utilisent des PDF fabriqués qui reproduisent fidèlement le format actuel et ses variantes probables. Au premier vrai ZIP, il suffit de regarder le contrôle de lecture affiché à la publication : s'il annonce une lecture sûre, tout est en ordre ; sinon, il dit précisément quoi vérifier. Le contrôle s'appuie sur la base NOSICA : un produit absent de la base n'a pas de contrôle de prix (c'est indiqué). Enfin, la taille maximale d'un fichier publié est celle du projet Supabase (50 Mo par défaut) : un ZIP plus lourd devra être réduit ou la limite relevée dans Supabase.", C.warn);

/* ── 6. Mise en service ─────────────────────────────────────── */
h1('Mise en service', 6);
bullets([
  "Tout le travail est sur la branche claude/dazzling-fermi-5o604r ; la branche main n'a pas été touchée. Pour mettre en ligne : fusionner la branche dans main (GitHub Pages republie le site tout seul).",
  "Aucune migration SQL, aucun redéploiement des fonctions Supabase, aucun nouveau secret.",
  "La tournée de 6 h (GitHub Actions) utilise automatiquement le nouveau moteur dès la fusion.",
  "Le thème clair est le thème par défaut ; chaque utilisateur peut passer en sombre.",
  "Les anciens guides PDF (docs/) décrivent encore l'ancienne interface ; les captures de la v2 sont dans docs/v2/captures et ce rapport dans docs/v2.",
]);
h2('Fichiers ajoutés ou modifiés');
table([
  ['Fichier', 'Rôle'],
  ['plan-parser.js (nouveau)', 'Lecteur de plan promo : double lecture, dates, prix, contrôles, rapport, rattachement des affiches'],
  ['etiquette.html', 'Moteur d\'affiches : import PDF / ZIP / Excel, affiches centrale, contrôle de lecture, nouvel écran, PDF mixte, contrôle avant publication'],
  ['gefec-ui.css / gefec-ui.js (nouveaux)', 'Charte commune et bascule clair / sombre'],
  ['index.html, sisto.html, campagne.html', 'Nouvelle coque, harmonisation des outils, bibliothèques locales'],
  ['app-auth.js, auto-engine.js, campagne.js', 'Contrôle avant publication, ZIP accepté, alerte des offres bloquées, calendrier enrichi'],
  ['vendor/ (nouveau)', 'Bibliothèques et polices servies localement'],
  ['tests/, .github/workflows/tests.yml (nouveaux)', 'Tests automatiques et leur lancement sur GitHub'],
  ['scripts/shoot-v2.js, scripts/make-rapport-v2.js', 'Captures et ce rapport'],
], [190, CW - 190]);

doc.end();
console.log('Rapport : ' + path.relative(ROOT, OUT));
