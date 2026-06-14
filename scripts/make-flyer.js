/* Génère le guide PDF "Outil Promo GEFEC" — 2 pages, guide complet toutes nouveautés. */
const PDFDocument = require('pdfkit');
const fs = require('fs');

const OUT = process.argv[2] || 'docs/Guide-Outil-Promo-GEFEC.pdf';
const LINK = 'https://outil-promo.pages.dev/';

const C = {
  blue: '#2f55d4', band: '#21317a', dark: '#16223b', grey: '#5a6678', light: '#9aa3b2',
  soft: '#eef2fb', softline: '#d7def0', border: '#dde3ec', green: '#16a34a',
  yellowSoft: '#fff8e6', yellowLine: '#f0d98a', orange: '#e67514', teal: '#0891b2',
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

function icoSave(cx, cy) {
  doc.lineWidth(1.7).strokeColor('#fff');
  doc.moveTo(cx, cy - 6).lineTo(cx, cy + 2).stroke();
  doc.moveTo(cx - 4, cy - 2).lineTo(cx, cy + 2).lineTo(cx + 4, cy - 2).stroke();
  doc.moveTo(cx - 6, cy + 5).lineTo(cx + 6, cy + 5).stroke();
}
function icoLock(cx, cy) {
  doc.path("M " + (cx-4) + " " + (cy-1) + " A 4 4 0 0 1 " + (cx+4) + " " + (cy-1)).lineWidth(1.8).strokeColor('#fff').stroke();
  doc.roundedRect(cx - 6, cy - 1, 12, 9, 2).fill('#fff');
  doc.circle(cx, cy + 3, 1.4).fill(C.blue);
}
function icoUsers(cx, cy) {
  doc.circle(cx - 5, cy - 4, 3).fill('#fff'); doc.circle(cx + 5, cy - 4, 3).fill('#fff');
  doc.ellipse(cx - 5, cy + 4, 5, 4).fill('#fff'); doc.ellipse(cx + 5, cy + 4, 5, 4).fill('#fff');
}
function icoZap(cx, cy) {
  doc.moveTo(cx + 2, cy - 7).lineTo(cx - 4, cy + 1).lineTo(cx, cy + 1)
    .lineTo(cx - 2, cy + 7).lineTo(cx + 4, cy - 1).lineTo(cx, cy - 1).closePath().fill('#fff');
}
function icoCloud(cx, cy) {
  doc.save().fillColor('#fff');
  doc.circle(cx - 3, cy, 5).fill('#fff');
  doc.circle(cx + 4, cy - 2, 4).fill('#fff');
  doc.rect(cx - 7, cy, 16, 5).fill('#fff');
  doc.restore();
  doc.lineWidth(1.4).strokeColor('#fff');
  doc.moveTo(cx - 1, cy + 5).lineTo(cx - 1, cy + 9).stroke();
  doc.moveTo(cx + 3, cy + 5).lineTo(cx + 3, cy + 9).stroke();
  doc.moveTo(cx - 1, cy + 9).lineTo(cx + 3, cy + 9).stroke();
}
function icoCheck(cx, cy) {
  doc.moveTo(cx - 5, cy).lineTo(cx - 1, cy + 4).lineTo(cx + 5, cy - 4).lineWidth(2.2).strokeColor('#fff').stroke();
}
function star(cx, cy, ro, ri, color) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  doc.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < 10; i++) doc.lineTo(p[i][0], p[i][1]);
  doc.closePath().fill(color);
}

function feature(y, color, ico, title, text) {
  box(ML, y, CW, 58, 10, '#fff', C.border);
  badge(ML + 26, y + 29, color); ico(ML + 26, y + 29);
  T(title, ML + 52, y + 11, { b: true, s: 12, c: C.dark });
  T(text, ML + 52, y + 28, { s: 9.5, c: C.grey, w: CW - 66, lg: 1.5 });
}

function loginMock(x, y, w, h) {
  box(x, y, w, h, 8, '#fff', C.border);
  doc.roundedRect(x + w / 2 - 11, y + 10, 22, 22, 6).fill(C.blue);
  T('G', x + w / 2 - 11, y + 14, { b: true, s: 13, c: '#fff', w: 22, a: 'center', br: false });
  doc.roundedRect(x + 14, y + 40, w - 28, 12, 4).fill(C.soft);
  doc.roundedRect(x + 14, y + 57, w - 28, 12, 4).fill(C.soft);
  doc.roundedRect(x + 14, y + 75, w - 28, 14, 5).fill(C.blue);
  T('Se connecter', x + 14, y + 79, { b: true, s: 7.5, c: '#fff', w: w - 28, a: 'center', br: false });
}

function affiche(ox, oy, w, h) {
  const s = h / 232;
  box(ox, oy, w, h, 8, '#fff', '#e3e3e3');
  doc.font('Helvetica-Bold').fillColor(BUT.red);
  doc.fontSize(20 * s).text('BON', ox, oy + 14 * s, { width: w, align: 'center', lineBreak: false });
  doc.fontSize(25 * s).text('PLAN', ox, oy + 33 * s, { width: w, align: 'center', lineBreak: false });
  doc.rect(ox + 8, oy + 70 * s, w - 16, 15 * s).fill(BUT.yellow);
  T('PRIX VALABLE DU 02/06 AU 30/06', ox + 8, oy + 74 * s, { b: true, s: 5.3 * s, c: BUT.dark, w: w - 16, a: 'center', br: false });
  doc.font('Helvetica-Bold').fontSize(34 * s).fillColor('#111').text('749 €', ox, oy + 104 * s, { width: w, align: 'center', lineBreak: false });
  T('ASPIRATEUR TRAÎNEAU', ox, oy + 158 * s, { b: true, s: 8 * s, c: BUT.dark, w: w, a: 'center', br: false });
  T('RO2611EA', ox, oy + 171 * s, { b: true, s: 11 * s, c: BUT.dark, w: w, a: 'center', br: false });
  T('ROWENTA', ox, oy + 192 * s, { b: true, s: 10 * s, c: '#111', w: w, a: 'center', br: false });
}

/* ================================================
   PAGE 1 — Nouveautés + identifiants
   ================================================ */
doc.rect(0, 0, PW, 104).fill(C.band);
doc.rect(0, 104, PW, 4).fill(BUT.yellow);

doc.roundedRect(ML, 28, 50, 50, 13).fill('#fff');
T('G', ML, 38, { b: true, s: 30, c: C.band, w: 50, a: 'center', br: false });
T('Outil Promo GEFEC', 108, 32, { b: true, s: 22, c: '#fff', br: false });
T('Guide complet — toutes les nouveautés', 108, 62, { s: 11.5, c: '#cfd8f5', br: false });
doc.roundedRect(PW - ML - 136, 40, 136, 22, 11).fill(BUT.yellow);
T('NOUVELLE VERSION', PW - ML - 136, 46, { b: true, s: 8.5, c: BUT.dark, w: 136, a: 'center', cs: 0.5, br: false });

T('Un outil qui pense à votre place.', ML, 124, { b: true, s: 15, c: C.dark, br: false });
T("Chaque magasin dispose de son propre espace sécurisé. Votre valorisation est mémorisée dans le cloud. Les documents communs sont publiés par l’administrateur. Dès votre connexion, tout est déjà là.", ML, 147, { s: 10.5, c: C.grey, w: CW, lg: 2 });

box(ML, 188, CW, 42, 10, C.soft, C.softline);
doc.circle(ML + 22, 209, 9).lineWidth(1.4).strokeColor(C.blue).stroke();
doc.moveTo(ML + 13, 209).lineTo(ML + 31, 209).stroke();
doc.ellipse(ML + 22, 209, 4, 9).lineWidth(1.4).strokeColor(C.blue).stroke();
T("Accès à l’outil", ML + 42, 196, { b: true, s: 9, c: C.grey, br: false });
T(LINK, ML + 42, 209, { b: true, s: 12.5, c: C.blue, br: false });

T('Ce qui change pour vous', ML, 246, { b: true, s: 13, c: C.dark, br: false });

feature(266, C.blue, icoLock,
  'Un compte par magasin',
  "Chaque magasin a son identifiant et son mot de passe (= le nom du magasin en minuscules). Vos données restent séparées de celles des autres.");

feature(332, C.green, icoSave,
  'Votre valorisation est mémorisée dans le cloud',
  "Fini le réimport à chaque connexion : votre VALORISATION.pdf est sauvegardée automatiquement. Un pop-up vous alerte si elle a plus de 10 jours.");

feature(398, C.orange, icoCloud,
  'Documents publiés par l’administrateur pour tous',
  "Le plan promo (Étiquettes), les affiches CETELEM et les médias Soldes sont uploadés une fois par Rémi et disponibles immédiatement pour tous.");

feature(464, C.teal, icoZap,
  'Tout se charge tout seul dès la connexion',
  "Valorisation, plan promo, affiches et médias : retrouvés automatiquement. Un pop-up vous informe de l’état de chaque document à l’ouverture d’un outil.");

/* Bloc identifiants */
const CY = 540;
box(ML, CY, CW - 158, 114, 12, C.yellowSoft, C.yellowLine);
T('Vos identifiants', ML + 18, CY + 13, { b: true, s: 13, c: C.dark, br: false });
T('Identifiant', ML + 18, CY + 38, { b: true, s: 10, c: C.grey, br: false });
T('le nom de votre magasin en minuscules', ML + 105, CY + 38, { s: 10, c: C.dark, br: false });
T('Mot de passe', ML + 18, CY + 56, { b: true, s: 10, c: C.grey, br: false });
T('le nom de votre magasin en minuscules', ML + 105, CY + 56, { s: 10, c: C.dark, br: false });
T('Exemples', ML + 18, CY + 80, { b: true, s: 9, c: C.grey, br: false });
doc.roundedRect(ML + 86, CY + 76, 82, 16, 8).fill('#fff');
T('lure  /  lure', ML + 86, CY + 80, { b: true, s: 9, c: C.dark, w: 82, a: 'center', br: false });
doc.roundedRect(ML + 178, CY + 76, 122, 16, 8).fill('#fff');
T('barsuraube  /  barsuraube', ML + 178, CY + 80, { b: true, s: 8.5, c: C.dark, w: 122, a: 'center', br: false });
loginMock(ML + CW - 150, CY + 6, 150, 102);

/* ================================================
   PAGE 2 — Les 3 outils + base + directeurs + contact
   ================================================ */
doc.addPage();
doc.rect(0, 0, PW, 60).fill(C.band);
doc.rect(0, 60, PW, 4).fill(BUT.yellow);
T('3 outils, 1 flux de travail simplifié', ML, 18, { b: true, s: 17, c: '#fff', br: false });
T('Tout est intégré, tout coopère, tout se souvient.', ML, 43, { s: 10, c: '#cfd8f5', br: false });

/* ── ÉTIQUETTES ── */
const ET_Y = 76;
const AW = 158, AX = ML + CW - AW;
const LW = CW - AW - 12;

doc.rect(ML, ET_Y, CW, 5).fill(C.blue);
box(ML, ET_Y, CW, 182, 8, '#fff', C.border);

T('Étiquettes', ML + 14, ET_Y + 14, { b: true, s: 14, c: C.blue, br: false });
T("Génère automatiquement les affiches de vos produits en promotion.", ML + 14, ET_Y + 32, { s: 9, c: C.grey, w: LW - 6, br: false });

const stepData = [
  ['Connexion', "Votre valorisation et le plan promo sont déjà chargés automatiquement."],
  ['Plan promo', "Déposez-le ou utilisez celui déposé par l’administrateur pour tous."],
  ['Génération', "Croisement automatique — les affiches disponibles apparaissent instantanément."],
  ['Impression', "Masque, taille et papier mémorisés. Un bouton \"Imprimer\" lance tout."],
];
const S0 = ET_Y + 55, SH = 26;
stepData.forEach(function(item, i) {
  const title = item[0], desc = item[1];
  const sy = S0 + i * (SH + 7);
  doc.circle(ML + 20, sy + 12, 10).fill(C.blue);
  T(String(i + 1), ML, sy + 6, { b: true, s: 10, c: '#fff', w: 40, a: 'center', br: false });
  T(title, ML + 36, sy + 4, { b: true, s: 9.5, c: C.dark, br: false });
  T(desc, ML + 36, sy + 16, { s: 8.5, c: C.grey, w: LW - 42, br: false });
});

affiche(AX, ET_Y + 8, AW, 170);
T('Charte BUT respectée', AX, ET_Y + 183, { b: true, s: 8, c: BUT.red, w: AW, a: 'center', br: false });

/* ── CETELEM + SOLDES ── */
const CS_Y = ET_Y + 196;
const HW = (CW - 8) / 2;

box(ML, CS_Y, HW, 88, 10, '#fff', C.border);
doc.rect(ML, CS_Y, 5, 88).fill(BUT.red);
T('CETELEM', ML + 14, CS_Y + 12, { b: true, s: 12, c: BUT.red, br: false });
T('Affiches de financement à crédit', ML + 14, CS_Y + 28, { s: 9, c: C.grey, br: false });
T("L’administrateur dépose les affiches CETELEM pour tous. À votre connexion, elles sont prêtes — un pop-up confirme si elles sont à jour. Impression directe.", ML + 14, CS_Y + 43, { s: 8.5, c: C.grey, w: HW - 22, lg: 1.5 });

const SO_X = ML + HW + 8;
box(SO_X, CS_Y, HW, 88, 10, '#fff', C.border);
doc.rect(SO_X, CS_Y, 5, 88).fill(C.orange);
T('Soldes', SO_X + 14, CS_Y + 12, { b: true, s: 12, c: C.orange, br: false });
T('Médias Centrale pour les Soldes', SO_X + 14, CS_Y + 28, { s: 9, c: C.grey, br: false });
T("L’administrateur publie le ZIP des médias Soldes pour tous. Distribué automatiquement au chargement — aucune manipulation requise de votre part.", SO_X + 14, CS_Y + 43, { s: 8.5, c: C.grey, w: HW - 22, lg: 1.5 });

/* ── BASE NOSICA ── */
const BN_Y = CS_Y + 98;
box(ML, BN_Y, CW, 58, 10, '#f8f6ff', '#d0c8f0');
badge(ML + 26, BN_Y + 29, '#f59e0b'); star(ML + 26, BN_Y + 28, 8, 3.4, '#fff');
T('Base NOSICA — mise à jour automatique chaque nuit', ML + 52, BN_Y + 10, { b: true, s: 12, c: C.dark, br: false });
T("La base produit complète est synchronisée via GitHub. Besoin d’un article absent du plan promo ? Tapez sa référence ou son EAN : il est retrouvé instantanément et ajouté en BON PLAN ou PROMO.", ML + 52, BN_Y + 27, { s: 9, c: C.grey, w: CW - 66, lg: 1.5 });

/* ── VUE DIRECTEURS + PANNEAU D'ÉTAT ── */
const DV_Y = BN_Y + 68;
const DW = CW / 2 - 4;

box(ML, DV_Y, DW, 68, 10, '#f0fdf4', '#bfe3cc');
badge(ML + 26, DV_Y + 34, C.green); icoUsers(ML + 26, DV_Y + 34);
T('Vue Directeurs', ML + 52, DV_Y + 12, { b: true, s: 11, c: C.dark, br: false });
T("Jérémie et Antony visualisent l’état de valorisation de tous les magasins : badge à jour / en retard / jamais uploadée, triés par urgence.", ML + 52, DV_Y + 29, { s: 8.5, c: C.grey, w: DW - 62, lg: 1.5 });

const PP_X = ML + DW + 8;
box(PP_X, DV_Y, DW, 68, 10, C.soft, C.softline);
badge(PP_X + 26, DV_Y + 34, C.blue); icoCheck(PP_X + 26, DV_Y + 34);
T('Panneau d’état', PP_X + 52, DV_Y + 12, { b: true, s: 11, c: C.dark, br: false });
T("Sur l’accueil, un panneau indique si votre valorisation et le plan promo sont à jour — avant même d’ouvrir un outil.", PP_X + 52, DV_Y + 29, { s: 8.5, c: C.grey, w: DW - 62, lg: 1.5 });

/* ── CONTACT ── */
const CT_Y = DV_Y + 78;
box(ML, CT_Y, CW, 52, 12, '#f1f5ff', C.softline);
T('Une question ?', ML + 20, CT_Y + 11, { b: true, s: 12, c: C.dark, br: false });
T('Rémi SCHAFFHAUSER — Administrateur de l’outil. Je reste à votre disposition pour tout accompagnement. Bonne semaine à tous !', ML + 20, CT_Y + 29, { s: 10, c: C.grey, w: CW - 40, br: false });

/* ---------- pieds de page ---------- */
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  const fy = PH - 34;
  doc.moveTo(ML, fy).lineTo(PW - ML, fy).lineWidth(0.6).strokeColor(C.border).stroke();
  T('Outil Promo GEFEC', ML, fy + 6, { s: 8, c: C.light, w: CW / 2, br: false });
  T('Contact : Rémi SCHAFFHAUSER  ·  page ' + (i + 1) + '/' + range.count, ML + CW / 2, fy + 6, { s: 8, c: C.light, w: CW / 2, a: 'right', br: false });
}
doc.flushPages();
doc.end();
console.log('PDF généré : ' + OUT);
