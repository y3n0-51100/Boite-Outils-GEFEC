#!/usr/bin/env node
/*
 * Génère le tutoriel PDF destiné aux Directeurs de magasin.
 *
 *   node scripts/make-tutoriel.js [sortie.pdf]
 *
 * Une page de présentation, puis deux pages par outil : à quoi il sert,
 * la marche à suivre, une capture annotée et un mémo « 30 secondes ».
 * Les captures viennent de docs/captures/ (régénérées par scripts/shoot-captures.js).
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT  = process.argv[2] || 'docs/Tutoriel-Directeurs-GEFEC.pdf';
const ROOT = path.join(__dirname, '..');
const SHOT = n => path.join(ROOT, 'docs/captures', n);
const SITE = 'https://y3n0-51100.github.io/Boite-Outils-GEFEC/';

/* ── Charte ────────────────────────────────────────────────────────── */
const C = {
  ink:'#0f172a', body:'#3f4a5c', mute:'#6b7686', faint:'#98a2b3',
  line:'#e3e8ef', soft:'#f6f8fb', white:'#ffffff',
  navy:'#0b1220', navy2:'#16233c',
  gefec:'#3b6cf6', cetelem:'#e2690a', etiquette:'#d90512', solde:'#12923f', sisto:'#0284c7',
};

const PW = 595.28, PH = 841.89;
const ML = 42, MR = PW - 42, CW = MR - ML;
const TOP = 74, BOT = PH - 46;

const doc = new PDFDocument({ size:'A4', margins:{ top:0, bottom:0, left:0, right:0 },
  info:{ Title:'Boîte à Outils GEFEC — Tutoriel Directeur de magasin', Author:'GEFEC' } });
fs.mkdirSync(path.dirname(OUT), { recursive:true });
doc.pipe(fs.createWriteStream(OUT));

const F = w => path.join(__dirname, 'fonts', `Manrope-${w}.ttf`);
doc.registerFont('r', F(400)); doc.registerFont('m', F(600));
doc.registerFont('b', F(700)); doc.registerFont('x', F(800));

let y = TOP, current = null, pageNo = 0;

/* Garde-fou : signale tout dépassement de page (pdfkit paginerait tout seul). */
function checkFit() {
  if (y > BOT + 0.5) console.warn(`⚠ page ${pageNo} déborde de ${(y - BOT).toFixed(0)} pt`);
  else if (process.env.DEBUG_FIT) console.log(`page ${pageNo} : ${(BOT - y).toFixed(0)} pt restants`);
}

/* pdfkit ne gère pas les hex à 8 chiffres (alpha) : on mélange vraiment
   la couleur vers le blanc pour obtenir fonds et bordures clairs. */
function mix(hex, target, t) {
  const parts = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = parts(hex), b = parts(target);
  return '#' + a.map((v, i) => Math.round(v * (1 - t) + b[i] * t).toString(16).padStart(2, '0')).join('');
}
const tint = (c, t) => mix(c, '#ffffff', t);

/* ── Primitives ────────────────────────────────────────────────────── */
function txt(s, x, yy, o = {}) {
  doc.font(o.f || 'r').fontSize(o.s || 10).fillColor(o.c || C.body);
  doc.text(s, x, yy, Object.assign({ width: o.w || CW, lineGap: o.lg != null ? o.lg : 2.2 }, o.opt || {}));
  return doc.y;
}
function h(s, x, yy, o = {}) { return txt(s, x, yy, Object.assign({ f:'x', s:13, c:C.ink, lg:1 }, o)); }
const hgt = (s, o = {}) => {
  doc.font(o.f || 'r').fontSize(o.s || 10);
  return doc.heightOfString(s, { width: o.w || CW, lineGap: o.lg != null ? o.lg : 2.2 });
};

function pill(x, yy, w, hh, r, fill, stroke) {
  doc.roundedRect(x, yy, w, hh, r);
  if (fill && stroke) doc.fillColor(fill).strokeColor(stroke).lineWidth(1).fillAndStroke();
  else if (fill) doc.fillColor(fill).fill();
  else doc.strokeColor(stroke).lineWidth(1).stroke();
}
function badge(n, cx, cy, r, color) {
  doc.circle(cx, cy, r).fillColor(color).fill();
  doc.font('x').fontSize(r * 1.15).fillColor('#fff')
     .text(String(n), cx - r, cy - r * 0.62, { width: r * 2, align:'center', lineGap:0 });
}

/* ── Gabarit de page ───────────────────────────────────────────────── */
function page(tool) {
  // pdfkit ouvre déjà la première page : on n'en ajoute une qu'ensuite.
  if (pageNo) { if (current !== null || pageNo) checkFit(); doc.addPage(); }
  pageNo++;
  current = tool;
  doc.rect(0, 0, PW, 4).fillColor(tool ? tool.color : C.gefec).fill();
  if (tool) {
    doc.rect(ML, 26, 3, 13).fillColor(tool.color).fill();
    doc.font('x').fontSize(10).fillColor(tool.color)
       .text(tool.name.toUpperCase(), ML + 10, 27, { width: CW - 60, lineGap:0, characterSpacing:0.6 });
    doc.font('m').fontSize(8.5).fillColor(C.faint)
       .text(tool.step, ML, 28, { width: CW, align:'right', lineGap:0 });
    doc.moveTo(ML, 48).lineTo(MR, 48).strokeColor(C.line).lineWidth(1).stroke();
  }
  doc.font('m').fontSize(8).fillColor(C.faint)
     .text('Boîte à Outils GEFEC · Tutoriel Directeur de magasin', ML, PH - 32, { width: CW, lineGap:0 });
  doc.font('b').fontSize(8).fillColor(C.faint)
     .text(String(pageNo), ML, PH - 32, { width: CW, align:'right', lineGap:0 });
  y = TOP;
}

/* ── Blocs de contenu ──────────────────────────────────────────────── */
function heading(t, sub, color) {
  h(t, ML, y, { s:19, c:C.ink });
  y = doc.y + 2;
  if (sub) { txt(sub, ML, y, { f:'m', s:10.5, c: color || C.mute }); y = doc.y; }
  y += 12;
}

/* encadré « à quoi ça sert » */
function purpose(text, color) {
  const pad = 12, w = CW, th = hgt(text, { s:10.2, w: w - pad * 2 - 4, lg:3 });
  const hh = th + pad * 2;
  pill(ML, y, w, hh, 10, tint(color, 0.94), tint(color, 0.62));
  doc.rect(ML, y, 3.2, hh).fillColor(color).fill();
  txt(text, ML + pad + 4, y + pad, { s:10.2, c:C.ink, w: w - pad * 2 - 4, lg:3 });
  y += hh + 16;
}

/* liste d'étapes numérotées */
function steps(list, color, o = {}) {
  const nw = 26, gap = 11, tw = CW - nw - gap;
  for (const it of list) {
    const th = hgt(it.t, { f:'b', s:10.4, w:tw, lg:1 });
    const dh = it.d ? hgt(it.d, { s:9.4, w:tw, lg:2.4 }) : 0;
    const hh = th + (dh ? dh + 2.5 : 0);
    badge(it.n, ML + 10, y + 9, 10, color);
    txt(it.t, ML + nw + gap, y, { f:'b', s:10.4, c:C.ink, w:tw, lg:1 });
    if (it.d) txt(it.d, ML + nw + gap, y + th + 2.5, { s:9.4, c:C.mute, w:tw, lg:2.4 });
    y += hh + (o.gap != null ? o.gap : 11);
  }
}

/* capture d'écran encadrée */
function shot(file, o = {}) {
  const f = SHOT(file);
  const w = o.w || CW, x = o.x != null ? o.x : ML;
  const dim = doc.openImage(f);
  const hh = dim.height * w / dim.width;
  pill(x - 3, y - 3, w + 6, hh + 6, 8, C.soft, C.line);
  doc.save().roundedRect(x, y, w, hh, 5).clip();
  doc.image(f, x, y, { width:w });
  doc.restore();
  y += hh + (o.after != null ? o.after : 9);
  return hh;
}

/* légende des pastilles d'une capture, en colonnes */
function legend(items, color, cols = 2, labels) {
  const colW = (CW - 14) / cols;
  const rows = Math.ceil(items.length / cols);
  const heights = [];
  items.forEach((it, i) => { heights[i] = hgt(it, { s:8.8, w: colW - 22, lg:1.8 }); });
  let rowY = y, maxRow = 0;
  items.forEach((it, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    if (c === 0 && r > 0) { rowY += maxRow + 7; maxRow = 0; }
    const x = ML + c * (colW + 14);
    badge(labels ? labels[i] : i + 1, x + 7, rowY + 6, 7, color);
    txt(it, x + 19, rowY - 1.5, { s:8.8, c:C.body, w: colW - 22, lg:1.8 });
    maxRow = Math.max(maxRow, heights[i]);
  });
  y = rowY + maxRow + 12;
}

/* encadré coloré (résultat, vigilance, mémo) */
function box(title, lines, color, o = {}) {
  const pad = 11, w = o.w || CW, x = o.x != null ? o.x : ML;
  const tw = w - pad * 2;
  let inner = hgt(title, { f:'x', s:9.6, w:tw, lg:1 }) + 6;
  const lh = lines.map(l => hgt(l, { s:9.3, w: tw - 11, lg:2.3 }));
  inner += lh.reduce((s, v) => s + v + 5.5, 0);
  const hh = inner + pad * 2 - 5.5;
  pill(x, y, w, hh, 10, o.tint || C.soft, C.line);
  txt(title.toUpperCase(), x + pad, y + pad, { f:'x', s:9.6, c:color, w:tw, lg:1, opt:{ characterSpacing:0.4 } });
  let ly = y + pad + hgt(title, { f:'x', s:9.6, w:tw, lg:1 }) + 6;
  lines.forEach((l, i) => {
    doc.circle(x + pad + 2.6, ly + 4.4, 1.9).fillColor(color).fill();
    txt(l, x + pad + 11, ly, { s:9.3, c:C.body, w: tw - 11, lg:2.3 });
    ly += lh[i] + 5.5;
  });
  y += hh + (o.after != null ? o.after : 13);
  return hh;
}

/* enchaînement horizontal : étapes reliées par des flèches */
function flow(items, color, title) {
  if (title) { txt(title.toUpperCase(), ML, y, { f:'x', s:9.6, c:color, lg:1, opt:{ characterSpacing:0.4 } }); y = doc.y + 8; }
  const n = items.length, aw = 16;
  const w = (CW - aw * (n - 1)) / n, hh = 58;
  items.forEach((it, i) => {
    const x = ML + i * (w + aw);
    pill(x, y, w, hh, 10, tint(color, 0.94), tint(color, 0.66));
    doc.circle(x + w / 2, y + 15, 9).fillColor(color).fill();
    doc.font('x').fontSize(9).fillColor('#fff').text(String(i + 1), x + w / 2 - 9, y + 10.5, { width:18, align:'center', lineGap:0 });
    doc.font('b').fontSize(8.6).fillColor(C.ink).text(it, x + 7, y + 30, { width: w - 14, align:'center', lineGap:1.4 });
    if (i < n - 1) {
      const ax = x + w + aw / 2;
      doc.moveTo(ax - 4, y + hh / 2).lineTo(ax + 3, y + hh / 2).strokeColor(color).lineWidth(1.3).stroke();
      doc.moveTo(ax, y + hh / 2 - 3.4).lineTo(ax + 3.6, y + hh / 2).lineTo(ax, y + hh / 2 + 3.4)
         .fillColor(color).fill();
    }
  });
  y += hh + 15;
}

/* deux encadrés côte à côte, même hauteur visuelle */
function boxes2(a, b) {
  const w = (CW - 12) / 2, y0 = y;
  const h1 = box(a.t, a.l, a.c, { w, x:ML, tint:a.tint, after:0 });
  const y1 = y; y = y0;
  const h2 = box(b.t, b.l, b.c, { w, x:ML + w + 12, tint:b.tint, after:0 });
  y = Math.max(y1, y) ; y = y0 + Math.max(h1, h2) + 13;
}

/* ════════════════════════════════════════════════════════════════════
   PAGE 1 — Présentation
   ════════════════════════════════════════════════════════════════════ */
const TOOLS = [
  { key:'cetelem', name:'Affiches CETELEM', color:C.cetelem, page:2,
    sub:'Dépliant centrale → vos affiches',
    desc:"N'imprimez que les affiches de financement qui concernent vos produits exposés." },
  { key:'promo', name:'Plans Promo TV & PEM', color:C.etiquette, page:4,
    sub:'Plans nationaux → étiquettes prix',
    desc:'Croise le plan promo avec votre stock et sort les affiches BON PLAN et PROMO DU MOMENT.' },
  { key:'soldes', name:'Soldes Magasin', color:C.solde, page:6,
    sub:'Listing magasin − Média Centrale',
    desc:'Retire ce que gère déjà la centrale et ce qui est sans stock. Listing prêt à imprimer.' },
  { key:'sisto', name:'SISTO Checker', color:C.sisto, page:8,
    sub:'Votre SISTO, filtré et trié',
    desc:"Vos produits verrouillés, vos ruptures d'expo, vos commandes en cours — en un clic." },
];

page(null);
/* bandeau */
doc.rect(0, 0, PW, 172).fillColor(C.navy).fill();
doc.rect(0, 168, PW, 4).fillColor(C.gefec).fill();
doc.roundedRect(ML, 34, 46, 46, 13).fillColor(C.gefec).fill();
doc.font('x').fontSize(25).fillColor('#fff').text('G', ML, 47, { width:46, align:'center', lineGap:0 });
doc.font('x').fontSize(24).fillColor('#fff').text('Boîte à Outils GEFEC', ML + 60, 38, { width: CW - 60, lineGap:1 });
doc.font('m').fontSize(11.5).fillColor('#93a4c8')
   .text('Tutoriel express — Directeur de magasin', ML + 60, 68, { width: CW - 60, lineGap:0 });
doc.font('r').fontSize(9.8).fillColor('#8fa0c4')
   .text("Quatre outils, une seule adresse. Chaque fichier que vous déposez est analysé directement dans votre navigateur. Comptez deux minutes par outil.",
     ML, 100, { width: CW - 10, lineGap:3.2 });
doc.font('m').fontSize(9).fillColor('#6f82ab').text(SITE, ML, 144, { width: CW, lineGap:0 });

y = 190;

/* les quatre outils, 2 × 2 */
const cw = (CW - 13) / 2, ch = 102;
TOOLS.forEach((t, i) => {
  const cx = ML + (i % 2) * (cw + 13), cy = y + Math.floor(i / 2) * (ch + 12);
  pill(cx, cy, cw, ch, 11, C.white, C.line);
  doc.roundedRect(cx, cy, cw, 3.4, 2).fillColor(t.color).fill();
  doc.roundedRect(cx + 13, cy + 15, 26, 26, 8).fillColor(t.color).fill();
  doc.font('x').fontSize(12).fillColor('#fff')
     .text(String(i + 1), cx + 13, cy + 22, { width:26, align:'center', lineGap:0 });
  doc.font('x').fontSize(11.4).fillColor(C.ink).text(t.name, cx + 47, cy + 15, { width: cw - 60, lineGap:0 });
  doc.font('m').fontSize(8.2).fillColor(t.color)
     .text(t.sub, cx + 47, cy + 29, { width: cw - 58, lineGap:1, height:11, ellipsis:true });
  doc.font('r').fontSize(8.8).fillColor(C.mute).text(t.desc, cx + 13, cy + 50, { width: cw - 26, lineGap:2.4 });
  doc.moveTo(cx + 13, cy + ch - 22).lineTo(cx + cw - 13, cy + ch - 22).strokeColor(C.line).lineWidth(1).stroke();
  doc.font('b').fontSize(8).fillColor(t.color)
     .text('page ' + t.page + '  →', cx + 13, cy + ch - 15, { width: cw - 26, align:'right', lineGap:0 });
});
y += ch * 2 + 12 + 12;

/* avant de commencer */
box('Avant de commencer — 3 réflexes', [
  'Connectez-vous avec votre identifiant et votre mot de passe personnels.',
  "Déposez votre valorisation Nosica une seule fois sur l'accueil : elle est mémorisée d'une connexion à l'autre. Indispensable aux Affiches CETELEM et aux Plans Promo ; Soldes et SISTO Checker s'ouvrent sans elle.",
  "Surveillez le ruban « Base NOSICA » : s'il passe en orange (« figée depuis N jours »), signalez-le à l'administrateur.",
], C.gefec, { tint:'#f2f6ff' });

shot('accueil.jpg', { w:382, x:ML + (CW - 382) / 2, after:8 });
legend([
  'Ruban Base NOSICA : fraîcheur de la base article.',
  'Étape 1 : dépôt de la valorisation (une seule fois).',
  'Vos outils : cliquez sur une carte pour ouvrir.',
], C.gefec, 3);

/* ════════════════════════════════════════════════════════════════════
   OUTIL 1 — Affiches CETELEM
   ════════════════════════════════════════════════════════════════════ */
const T1 = { name:'Affiches CETELEM', color:C.cetelem, step:'1 / 2' };
page(T1);
heading('Affiches CETELEM', 'Imprimer uniquement les affiches de financement qui vous concernent', C.cetelem);
purpose("La centrale diffuse un dépliant PDF contenant toutes les affiches de financement, une par page. L'outil lit le code EAN de chaque affiche, le compare aux produits exposés dans votre magasin (votre valorisation) et ne retient que les affiches utiles. Vous n'imprimez plus rien pour rien.", C.cetelem);

shot('valorisation.jpg', { w:400, x:ML + (CW - 400) / 2, after:5 });
txt("L'étape 1 se joue sur l'accueil, une seule fois : c'est cette valorisation qui dit à l'outil quels produits sont exposés chez vous.",
  ML, y, { s:8.8, c:C.faint, lg:1.8 });
y = doc.y + 14;

steps([
  { n:1, t:'Votre valorisation est déjà là', d:"Déposée sur l'accueil, elle est transmise automatiquement à l'outil. Rien à refaire." },
  { n:2, t:'Déposez le dépliant CETELEM', d:'Le PDF de la centrale (ou un ZIP le contenant). Le dépliant publié par votre administrateur est déjà chargé : ne déposez le vôtre que si vous avez une version plus récente.' },
  { n:3, t:'Laissez tourner le croisement', d:"La console affiche l'avancement page par page. Quelques secondes suffisent." },
  { n:4, t:'Cochez, nommez, imprimez', d:'Décochez au besoin, choisissez A5 ou A4 portrait, puis Imprimer — ou Enregistrer pour récupérer un PDF unique.' },
], C.cetelem);

y += 2;
shot('cetelem.jpg', { after:8 });
legend([
  'Zone de dépôt du dépliant CETELEM.',
  "Console : suivi de la lecture, page par page.",
  'Résultats : la liste des affiches retenues et les boutons Enregistrer / Imprimer apparaissent ici.',
], C.cetelem, 3);

page(Object.assign({}, T1, { step:'2 / 2' }));
heading('Affiches CETELEM', 'Ce que vous obtenez, et les pièges à éviter', C.cetelem);
boxes2(
  { t:'Ce que vous obtenez', c:C.cetelem, tint:'#fff7ef', l:[
    'Un PDF unique regroupant les seules affiches correspondant à vos produits exposés.',
    'Une impression directe en A5 portrait (deux affiches par feuille A4) ou A4 portrait.',
    'Un nom de fichier libre, pour archiver simplement vos éditions successives.',
  ]},
  { t:'Points de vigilance', c:'#b4530a', tint:'#fff7ef', l:[
    "Sans valorisation à jour, le croisement se fait sur d'anciens produits exposés.",
    "Un dépliant d'une centaine de pages met quelques secondes : laissez la console finir.",
    "Vérifiez la liste avant d'imprimer : un produit retiré de l'expo reste dans une valorisation ancienne.",
  ]}
);
box('Mémo 30 secondes', [
  'Accueil → carte Affiches CETELEM → déposer le dépliant → attendre la console → cocher → Imprimer.',
  'Format A5 : deux affiches par feuille, à découper. Format A4 : une affiche pleine page.',
  "Rien ne sort de votre poste : le dépliant est lu dans le navigateur, aucune donnée n'est envoyée.",
], C.cetelem, { tint:'#fff7ef' });

flow(['Valorisation à jour', 'Dépliant de la centrale', 'Croisement automatique', 'Impression A5 / A4'],
     C.cetelem, "Le cycle, à chaque vague d'affiches");

box('Et si le résultat est vide ?', [
  "Aucune affiche retenue signifie qu'aucun EAN du dépliant ne correspond à un produit de votre valorisation — c'est un résultat possible et normal selon les mois.",
  'Vérifiez d\'abord la date de votre valorisation sur l\'accueil, puis rechargez le dépliant le plus récent.',
], C.mute, { tint:C.soft });

box("Quand l'utiliser", [
  "À chaque nouvelle vague d'affiches de financement diffusée par la centrale.",
  "Après chaque mise à jour de votre valorisation : les produits exposés ont changé, les affiches retenues aussi.",
  "Avant une opération commerciale, pour vérifier que chaque produit financé porte bien son affiche en rayon.",
], C.cetelem, { tint:'#fff7ef' });

/* ════════════════════════════════════════════════════════════════════
   OUTIL 2 — Plans Promo TV & PEM
   ════════════════════════════════════════════════════════════════════ */
const T2 = { name:'Plans Promo TV & PEM', color:C.etiquette, step:'1 / 2' };
page(T2);
heading('Plans Promo TV & PEM', 'Du plan promo national aux étiquettes prix de votre magasin', C.etiquette);
purpose("Deux onglets — Plan Promo TV et Plan Promo PEM — croisent le plan promo national avec votre stock, puis impriment les affiches prix BON PLAN et PROMO DU MOMENT à la charte BUT. Quatre étapes numérotées vous guident de gauche à droite.", C.etiquette);

shot('etiquette-etapes.jpg', { after:8 });
legend([
  'Choisissez d’abord votre univers : Plan Promo TV ou Plan Promo PEM. Le compteur indique le nombre de produits trouvés.',
  'Puis avancez dans les quatre étapes : 1 Fichiers, 2 Produits, 3 Étiquettes, 4 Réglages (réservé à l’administrateur).',
], C.etiquette, 1, ['A', 'B']);

steps([
  { n:1, t:'Fichiers — tout est déjà chargé', d:"Le plan promo publié par l'administrateur et votre valorisation arrivent automatiquement. Déposez un PDF ici seulement si vous avez une version plus récente : il est reconnu (TV ou PEM) et rangé dans le bon onglet. Puis « Croiser les références »." },
  { n:2, t:'Produits — cochez ce que vous imprimez', d:"La liste ne contient que vos produits concernés par une offre. Libellé, marque, prix et éco-participation restent modifiables dans le tableau. Vous pouvez aussi ajouter un produit à la main." },
], C.etiquette);
shot('etiquette-fichiers.jpg', { after:6 });

page(Object.assign({}, T2, { step:'2 / 2' }));
heading('Plans Promo TV & PEM', 'Étapes 2 et 3 : sélectionner, mettre en page, imprimer', C.etiquette);
shot('etiquette-step2.jpg', { after:7 });
txt("Étape 2 — la recherche filtre la liste, « Tout cocher » / « Tout décocher » vont plus vite, et le compteur « sélectionné(s) » vous dit exactement ce qui partira à l'impression.", ML, y, { s:9.4, c:C.mute, lg:2.4 });
y = doc.y + 13;
shot('etiquette-step3.jpg', { w:430, x:ML + (CW - 430) / 2, after:6 });

steps([
  { n:3, t:'Étiquettes — quatre réglages, puis Imprimer', d:"Type d'affiche (BON PLAN ou PROMO DU MOMENT, masques officiels) · Format A4, une par feuille, ou A5 ×2, deux par feuille paysage · Papier : « Avec fond » sur feuille blanche, « Sans fond » sur papier pré-imprimé · Période de validité, reprise du plan promo ou saisie à la main. L'aperçu se met à jour en direct." },
], C.etiquette, { gap:6 });

box('Mémo 30 secondes', [
  "Onglet TV ou PEM → étape 1 « Croiser les références » → étape 2 cocher → étape 3 régler le format → Imprimer.",
  "« Sans fond » est le réglage à utiliser si votre magasin dispose déjà du papier BON PLAN / PROMO pré-imprimé : seul le contenu s'imprime.",
  "L'éco-participation est reprise automatiquement de la base NOSICA ; corrigez-la dans le tableau de l'étape 2 si besoin.",
], C.etiquette, { tint:'#fff3f4' });

/* ════════════════════════════════════════════════════════════════════
   OUTIL 3 — Soldes Magasin
   ════════════════════════════════════════════════════════════════════ */
const T3 = { name:'Soldes Magasin', color:C.solde, step:'1 / 2' };
page(T3);
heading('Soldes Magasin', 'Un listing propre, débarrassé de ce que gère déjà la Média Centrale', C.solde);
purpose("L'outil compare votre listing de regroupement magasin aux fichiers de la Média Centrale : il retire les références déjà prises en charge par la centrale ainsi que celles sans stock, et vous rend un listing net, prêt à imprimer. Aucune valorisation n'est nécessaire.", C.solde);

shot('soldes.jpg', { after:8 });
legend([
  'Fichiers Média Centrale : PDF individuels ou un .zip les contenant.',
  'Fichiers Regroupement : votre listing magasin, même format.',
  '« Analyser et générer » : le bouton s’active dès que les deux sont là.',
  'Télécharger le PDF du listing dédupliqué.',
  'Impression du listing complet (Verrou + Vieux Stock).',
], C.solde, 2);

box('Outil Intégration EAN — application Windows', [
  'Le bouton vert en haut du panneau télécharge un utilitaire Windows à exécuter sur votre poste, en complément du listing.',
  "C'est un programme séparé : il ne fonctionne pas dans le navigateur et n'est pas nécessaire pour produire le listing.",
], C.solde, { tint:'#f0fbf3' });

steps([
  { n:1, t:'Ajoutez les fichiers Média Centrale', d:'Glissez les PDF ou un ZIP. Vous pouvez en ajouter autant que nécessaire.' },
  { n:2, t:'Ajoutez vos fichiers de regroupement', d:'Même principe. Le journal en bas à gauche récapitule ce qui a été lu.' },
  { n:3, t:'Analysez et générez', d:'Le rapprochement se fait dans votre navigateur, en quelques secondes.' },
  { n:4, t:'Téléchargez ou imprimez', d:'PDF du listing, ou impression du document complet regroupant Verrou et Vieux Stock.' },
], C.solde);

page(Object.assign({}, T3, { step:'2 / 2' }));
heading('Soldes Magasin', 'Ce que vous obtenez, et l’outil Intégration EAN', C.solde);
boxes2(
  { t:'Ce que vous obtenez', c:C.solde, tint:'#f0fbf3', l:[
    'Un listing dédupliqué : plus aucune référence déjà traitée par la Média Centrale.',
    'Les références sans stock sont écartées automatiquement.',
    'Un document unique imprimable regroupant Verrou et Vieux Stock.',
    'Un journal détaillant fichier par fichier ce qui a été lu.',
  ]},
  { t:'Points de vigilance', c:'#0d7a34', tint:'#f0fbf3', l:[
    "Déposez bien les fichiers dans la bonne zone : Média Centrale à gauche, Regroupement en dessous.",
    'Un ZIP peut contenir plusieurs PDF : inutile de les extraire.',
    'Le bouton reste grisé tant que les deux familles de fichiers ne sont pas fournies.',
    'Relancez une analyse après tout ajout de fichier : le résultat précédent ne se met pas à jour tout seul.',
  ]}
);

box('Comprendre le résultat — trois motifs de retrait', [
  "Doublon Média Centrale : l'EAN figure déjà dans un fichier de la centrale.",
  'Sans stock : disponible hors expo, en expo et total sont tous à zéro.',
  "Doublon regroupement : la référence est déjà conservée dans un autre de vos regroupements — c'est le premier fichier traité qui la garde.",
  "Chaque regroupement est traité séparément ; son en-tête rappelle le magasin, le regroupement et la date de solde.",
], C.solde, { tint:'#f0fbf3' });

flow(['Fichiers Média Centrale', 'Fichiers Regroupement', 'Analyser et générer', 'Listing imprimé'],
     C.solde, 'Le cycle, à chaque démarque');

box('Mémo 30 secondes', [
  'Accueil → carte Soldes Magasin → Média Centrale → Regroupement → Analyser et générer → Imprimer.',
  "Aucune valorisation requise : l'outil est utilisable immédiatement.",
  'Le journal indique quel fichier a été lu et combien de références en sont sorties.',
], C.solde, { tint:'#f0fbf3' });

txt("À utiliser au lancement des soldes, à chaque démarque successive, et dès réception d'un nouveau fichier de la Média Centrale : le périmètre à traiter change.",
  ML, y, { s:8.8, c:C.faint, lg:2 });
y = doc.y;

/* ════════════════════════════════════════════════════════════════════
   OUTIL 4 — SISTO Checker
   ════════════════════════════════════════════════════════════════════ */
const T4 = { name:'SISTO Checker', color:C.sisto, step:'1 / 2' };
page(T4);
heading('SISTO Checker', 'Votre SISTO devient une liste que vous interrogez', C.sisto);
purpose("Déposez l'édition « Situation Stocks des Encours Fournisseurs » de votre magasin : l'outil relit chaque référence — stock expo et dépôt, disponible à la vente, commandes en cours, média, gamme, famille, ventes — puis vous laisse filtrer et trier librement. Fini le déroulé de 36 pages à la main.", C.sisto);

shot('sisto-depot.jpg', { w:330, x:ML + (CW - 330) / 2, after:9 });
steps([
  { n:1, t:'Déposez votre SISTO au format PDF', d:"Glissez le fichier ou cliquez pour le choisir. La lecture affiche sa progression page par page ; comptez quelques secondes." },
], C.sisto, { gap:8 });

shot('sisto-travail.jpg', { w:452, x:ML + (CW - 452) / 2, after:8 });
legend([
  "Rappel de votre magasin, de la date d'édition et du nombre de références lues.",
  'Filtres rapides : un clic suffit (voir page suivante).',
  'Panneau de filtres détaillés : statut, stocks, fournisseur, famille, marque…',
  'Cliquez un en-tête pour trier. Maj + clic pour ajouter un second critère.',
  'Totaux recalculés en direct sur la sélection affichée.',
], C.sisto, 2);

page(Object.assign({}, T4, { step:'2 / 2' }));
heading('SISTO Checker', 'Les réponses les plus utiles, en un clic', C.sisto);

txt("Les filtres rapides répondent aux questions du quotidien sans rien paramétrer. Un clic active le filtre, un second le désactive.", ML, y, { s:9.8, c:C.body, lg:2.6 });
y = doc.y + 11;

/* échantillon de filtres rapides */
const QUICK = [
  ['Verrouillés · 1 seul en expo', "les références verrouillées dont il ne reste qu'un exemplaire en exposition"],
  ['Dernier exemplaire', 'un seul en expo et rien au dépôt : à remonter en priorité'],
  ['Rupture expo (0)', 'plus rien en exposition'],
  ['À exposer mais 0 en expo', 'des produits censés être exposés et absents du linéaire'],
  ['En commande', 'ce qui est déjà commandé chez le fournisseur'],
  ['Aucune vente sur l’année', 'les références dormantes'],
];
QUICK.forEach(([t, d]) => {
  const tw = doc.font('b').fontSize(8.6).widthOfString(t) + 16;
  pill(ML, y, tw, 15, 7.5, tint(C.sisto, 0.92), tint(C.sisto, 0.55));
  doc.font('b').fontSize(8.6).fillColor(C.sisto).text(t, ML + 8, y + 3.6, { width: tw - 16, lineGap:0 });
  doc.font('r').fontSize(9).fillColor(C.mute)
     .text(d, ML + tw + 9, y + 3.4, { width: CW - tw - 9, lineGap:0 });
  y += 21;
});
y += 6;
shot('sisto-exemple.jpg', { w:392, x:ML + (CW - 392) / 2, after:5 });
txt("Exemple : filtre « Verrouillés » actif — 4 références sur 9, avec leurs stocks et leur fournisseur.", ML, y, { s:8.8, c:C.faint, lg:1 });
y = doc.y + 13;

shot('sisto-barre.jpg', { after:7 });
legend([
  'Recherche libre : EAN, libellé, marque, fournisseur, famille.',
  'Colonnes : affichez ou masquez chacune des 52 colonnes du SISTO.',
  'Tri en cours ; cliquez pour l’effacer.',
  'Export CSV de la sélection, ouvrable dans Excel.',
  'Impression de la liste filtrée, en A4 paysage.',
], C.sisto, 2);

box('Mémo 30 secondes', [
  "Déposer le SISTO → cliquer un filtre rapide → trier par la colonne qui vous intéresse → Export CSV ou Imprimer.",
  "Un clic sur une ligne ouvre la fiche complète de la référence : stocks, ventes, prix, média, commandes.",
  "Dans le SISTO, une case chiffrée laissée vide vaut zéro : les filtres et les totaux la comptent comme telle.",
  "« Critères chiffrés avancés » combine autant de conditions que vous voulez, sur n'importe quel champ.",
], C.sisto, { tint:'#eff9ff' });

txt("Un problème, une question ? Le bouton « Aide », en haut à droite de l'accueil, prépare un message pré-rempli avec les informations techniques utiles.",
  ML, y, { s:8.8, c:C.faint, lg:2 });
y = doc.y;

checkFit();
doc.end();
console.log('✅ ' + OUT + ' — ' + pageNo + ' pages');
