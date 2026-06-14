/* Génère le guide PDF "Outil Promo GEFEC" — 2 pages, pro, illustré. */
const PDFDocument = require('pdfkit');
const fs = require('fs');

const OUT = process.argv[2] || 'docs/Guide-Outil-Promo-GEFEC.pdf';
const LINK = 'https://outil-promo.pages.dev/';

const C = {
  blue: '#2f55d4', band: '#21317a', dark: '#16223b', grey: '#5a6678', light: '#9aa3b2',
  soft: '#eef2fb', softline: '#d7def0', border: '#dde3ec', green: '#16a34a',
  yellowSoft: '#fff8e6', yellowLine: '#f0d98a',
};
const BUT = { red: '#e30613', yellow: '#ffd200', dark: '#161616' };

const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 40, bottom: 54, left: 44, right: 44 } });
fs.mkdirSync('docs', { recursive: true });
doc.pipe(fs.createWriteStream(OUT));
const PW = doc.page.width, PH = doc.page.height, ML = 44, CW = PW - 88;

/* ---------- helpers ---------- */
function T(str, x, y, o) {
  o = o || {};
  doc.font(o.b ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.s || 11).fillColor(o.c || C.dark);
  doc.text(str, x, y, { width: o.w, align: o.a || 'left', lineBreak: o.br === undefined ? true : o.br, lineGap: o.lg || 0, characterSpacing: o.cs || 0 });
}
function box(x, y, w, h, r, fill, stroke) {
  doc.roundedRect(x, y, w, h, r); doc.lineWidth(1);
  if (fill && stroke) doc.fillAndStroke(fill, stroke); else if (fill) doc.fill(fill); else doc.stroke(stroke);
}
function badge(cx, cy, color) { doc.circle(cx, cy, 16).fill(color); }
function icoSave(cx, cy) { doc.lineWidth(1.7).strokeColor('#fff');
  doc.moveTo(cx, cy - 6).lineTo(cx, cy + 2).stroke();
  doc.moveTo(cx - 4, cy - 2).lineTo(cx, cy + 2).lineTo(cx + 4, cy - 2).stroke();
  doc.moveTo(cx - 6, cy + 5).lineTo(cx + 6, cy + 5).stroke(); }
function icoLock(cx, cy) {
  doc.path(`M ${cx - 4} ${cy - 1} A 4 4 0 0 1 ${cx + 4} ${cy - 1}`).lineWidth(1.8).strokeColor('#fff').stroke();
  doc.roundedRect(cx - 6, cy - 1, 12, 9, 2).fill('#fff');
  doc.circle(cx, cy + 3, 1.4).fill(C.blue); }
function icoUsers(cx, cy) {
  doc.circle(cx - 5, cy - 4, 3).fill('#fff'); doc.circle(cx + 5, cy - 4, 3).fill('#fff');
  doc.ellipse(cx - 5, cy + 4, 5, 4).fill('#fff'); doc.ellipse(cx + 5, cy + 4, 5, 4).fill('#fff'); }
function star(cx, cy, ro, ri, color) {
  const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? ri : ro; const a = -Math.PI / 2 + i * Math.PI / 5; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  doc.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 10; i++) doc.lineTo(p[i][0], p[i][1]); doc.closePath().fill(color);
}
function feature(y, color, ico, title, text) {
  box(ML, y, CW, 58, 10, '#fff', C.border);
  badge(ML + 26, y + 29, color); ico(ML + 26, y + 29);
  T(title, ML + 52, y + 11, { b: true, s: 12, c: C.dark });
  T(text, ML + 52, y + 28, { s: 9.5, c: C.grey, w: CW - 66, lg: 1.5 });
}

/* mini écran de connexion */
function loginMock(x, y, w, h) {
  box(x, y, w, h, 8, '#fff', C.border);
  doc.roundedRect(x + w / 2 - 11, y + 10, 22, 22, 6).fill(C.blue);
  T('G', x + w / 2 - 11, y + 14, { b: true, s: 13, c: '#fff', w: 22, a: 'center', br: false });
  doc.roundedRect(x + 16, y + 42, w - 32, 13, 4).fill(C.soft);
  doc.roundedRect(x + 16, y + 60, w - 32, 13, 4).fill(C.soft);
  doc.roundedRect(x + 16, y + 80, w - 32, 15, 5).fill(C.blue);
  T('Se connecter', x + 16, y + 84, { b: true, s: 7.5, c: '#fff', w: w - 32, a: 'center', br: false });
}

/* affiche BON PLAN (charte BUT) */
function affiche(ox, oy, w, h) {
  box(ox, oy, w, h, 8, '#fff', '#e3e3e3');
  doc.font('Helvetica-Bold').fillColor(BUT.red);
  doc.fontSize(20).text('BON', ox, oy + 14, { width: w, align: 'center', lineBreak: false });
  doc.fontSize(25).text('PLAN', ox, oy + 33, { width: w, align: 'center', lineBreak: false });
  doc.rect(ox + 8, oy + 70, w - 16, 15).fill(BUT.yellow);
  T('PRIX VALABLE DU 02/06 AU 30/06', ox + 8, oy + 74, { b: true, s: 5.3, c: BUT.dark, w: w - 16, a: 'center', br: false });
  doc.font('Helvetica-Bold').fontSize(34).fillColor('#111').text('749 €', ox, oy + 104, { width: w, align: 'center', lineBreak: false });
  T('ASPIRATEUR TRAÎNEAU', ox, oy + 158, { b: true, s: 8, c: BUT.dark, w: w, a: 'center', br: false });
  T('RO2611EA', ox, oy + 170, { b: true, s: 11, c: BUT.dark, w: w, a: 'center', br: false });
  T('Code 3221614002045', ox, oy + 188, { s: 6, c: '#666', w: w, a: 'center', br: false });
  T('ROWENTA', ox, oy + 206, { b: true, s: 11, c: '#111', w: w, a: 'center', br: false });
}

/* ════════════════ PAGE 1 ════════════════ */
doc.rect(0, 0, PW, 104).fill(C.band);
doc.rect(0, 104, PW, 4).fill(BUT.yellow);
doc.roundedRect(ML, 28, 50, 50, 13).fill('#fff');
T('G', ML, 38, { b: true, s: 30, c: C.band, w: 50, a: 'center', br: false });
T('Outil Promo GEFEC', 108, 34, { b: true, s: 22, c: '#fff', br: false });
T('Guide express — nouvelle version', 108, 64, { s: 12, c: '#cfd8f5', br: false });
doc.roundedRect(PW - ML - 120, 40, 120, 22, 11).fill(BUT.yellow);
T('VERSION FINALE', PW - ML - 120, 46, { b: true, s: 8.5, c: BUT.dark, w: 120, a: 'center', cs: 0.5, br: false });

T('L’outil promo atteint sa phase finale !', ML, 126, { b: true, s: 15, c: C.dark, br: false });
T('Les 3 outils sont toujours là, avec une amélioration de taille : votre travail est réduit au minimum. Tout est mémorisé — l’outil peut être déjà prêt à l’emploi dès votre connexion.', ML, 150, { s: 11, c: C.grey, w: CW, lg: 2 });

box(ML, 190, CW, 42, 10, C.soft, C.softline);
doc.circle(ML + 22, 211, 9).lineWidth(1.4).strokeColor(C.blue).stroke();
doc.moveTo(ML + 13, 211).lineTo(ML + 31, 211).stroke();
doc.ellipse(ML + 22, 211, 4, 9).lineWidth(1.4).strokeColor(C.blue).stroke();
T('Accès à l’outil', ML + 42, 198, { b: true, s: 9, c: C.grey, br: false });
T(LINK, ML + 42, 211, { b: true, s: 12.5, c: C.blue, br: false });

T('Ce qui change', ML, 248, { b: true, s: 13, c: C.dark, br: false });
feature(270, C.blue, icoSave, 'Votre valorisation reste en mémoire',
  'Fini le réimport à chaque fois : votre VALORISATION.pdf est sauvegardée automatiquement. Mettez-la à jour quand vous le souhaitez.');
feature(336, C.green, icoLock, 'Un outil par magasin',
  'Chaque magasin a son propre accès et sa valorisation mémorisée : l’outil est déjà chargé dès la connexion.');
feature(402, '#e67514', icoUsers, 'Vue régionale',
  'Jérémie et Antony ont accès aux valorisations de tous les magasins.');

box(ML, 482, CW, 116, 12, C.yellowSoft, C.yellowLine);
T('Vos identifiants', ML + 20, 496, { b: true, s: 13, c: C.dark, br: false });
T('Identifiant', ML + 20, 522, { b: true, s: 10.5, c: C.grey, br: false });
T('le nom de votre magasin, en minuscules', ML + 110, 522, { s: 10.5, c: C.dark, br: false });
T('Mot de passe', ML + 20, 540, { b: true, s: 10.5, c: C.grey, br: false });
T('le nom de votre magasin, en minuscules', ML + 110, 540, { s: 10.5, c: C.dark, br: false });
T('Exemples', ML + 20, 566, { b: true, s: 9, c: C.grey, br: false });
doc.roundedRect(ML + 90, 562, 96, 18, 9).fill('#fff');
T('lure  /  lure', ML + 90, 567, { b: true, s: 9.5, c: C.dark, w: 96, a: 'center', br: false });
doc.roundedRect(ML + 196, 562, 150, 18, 9).fill('#fff');
T('barsuraube  /  barsuraube', ML + 196, 567, { b: true, s: 9.5, c: C.dark, w: 150, a: 'center', br: false });
loginMock(ML + CW - 150, 492, 150, 96);

/* ════════════════ PAGE 2 ════════════════ */
doc.addPage();
doc.rect(0, 0, PW, 60).fill(C.band);
doc.rect(0, 60, PW, 4).fill(BUT.yellow);
T('Générer vos affiches en 4 étapes', ML, 22, { b: true, s: 17, c: '#fff', br: false });

const SX = ML, SW = 300;
function step(n, y, text) {
  doc.circle(SX + 11, y + 7, 11).fill(C.blue);
  T(String(n), SX, y + 1, { b: true, s: 11, c: '#fff', w: 22, a: 'center', br: false });
  T(text, SX + 32, y, { s: 10.5, c: C.dark, w: SW - 32, lg: 2 });
}
step(1, 92, 'Connectez-vous. Votre valorisation est déjà chargée (ainsi que le plan promo s’il a été publié par l’administrateur).');
step(2, 150, 'Déposez le plan promo (le PDF reçu par mail). Les affiches ne sont plus fournies par la centrale.');
step(3, 206, 'L’outil croise le plan promo avec votre dernière valorisation et génère automatiquement les affiches de vos produits disponibles.');
step(4, 278, 'Choisissez le masque (BON PLAN / PROMO), la taille (A4 / A5), le papier (blanc ou pré-imprimé), puis imprimez.');

affiche(PW - ML - 178, 86, 178, 232);
T('La charte BUT est respectée', PW - ML - 178, 324, { b: true, s: 9, c: BUT.red, w: 178, a: 'center', br: false });

box(ML, 352, CW, 60, 10, C.soft, C.softline);
badge(ML + 26, 382, '#f59e0b'); star(ML + 26, 381, 8, 3.4, '#fff');
T('Le petit plus', ML + 52, 363, { b: true, s: 12, c: C.dark, br: false });
T('L’outil intègre la base NOSICA complète, mise à jour automatiquement. Besoin d’un produit absent du plan promo ? Ajoutez-le manuellement, en BON PLAN ou PROMO.', ML + 52, 380, { s: 9.5, c: C.grey, w: CW - 66, lg: 1.5 });

box(ML, 424, CW, 60, 10, '#eaf7ef', '#bfe3cc');
badge(ML + 26, 454, C.green); icoSave(ML + 26, 454);
T('Déjà prêt à l’emploi', ML + 52, 435, { b: true, s: 12, c: C.dark, br: false });
T('À chaque connexion, vos fichiers mémorisés se rechargent tout seuls. Un pop-up vous indique si le plan promo est à jour, et vous alerte si votre valorisation a plus de 10 jours.', ML + 52, 452, { s: 9.5, c: C.grey, w: CW - 66, lg: 1.5 });

box(ML, 500, CW, 58, 12, '#f1f5ff', C.softline);
T('Une question ?', ML + 20, 512, { b: true, s: 12, c: C.dark, br: false });
T('Rémi SCHAFFHAUSER — Administrateur de l’outil. Je reste à votre disposition. Bonne semaine à tous !', ML + 20, 531, { s: 10.5, c: C.grey, w: CW - 40, br: false });

/* ---------- pieds de page ---------- */
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  const fy = PH - 34;
  doc.moveTo(ML, fy).lineTo(PW - ML, fy).lineWidth(0.6).strokeColor(C.border).stroke();
  T('Outil Promo GEFEC', ML, fy + 6, { s: 8, c: C.light, w: CW / 2, br: false });
  T('Contact : Rémi SCHAFFHAUSER  ·  page ' + (i + 1) + '/' + range.count, ML + CW / 2, fy + 6, { s: 8, c: C.light, w: CW / 2, a: 'right', br: false });
}
doc.flushPages();
doc.end();
console.log('PDF généré : ' + OUT);
