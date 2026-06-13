/* Génère le guide d'utilisation PDF (magasins & directeurs régionaux). */
const PDFDocument = require('pdfkit');
const fs = require('fs');

const OUT = process.argv[2] || 'docs/Guide-Utilisation-GEFEC.pdf';
const SITE = 'https://y3n0-51100.github.io/Boite-Outils-GEFEC/';

const C = {
  blue: '#3056d3', dark: '#172033', grey: '#5a6678', light: '#8a93a3',
  band: '#1e3aa8', soft: '#eef1f6', line: '#dde3ec',
  orange: '#e67514', red: '#e30613', green: '#16a34a', amber: '#b25e00',
};

const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 56, bottom: 64, left: 54, right: 54 } });
fs.mkdirSync('docs', { recursive: true });
doc.pipe(fs.createWriteStream(OUT));

const PW = doc.page.width, PH = doc.page.height;
const ML = 54, MR = PW - 54, CW = MR - ML;
const BOTTOM = PH - 64;

/* ---------- Couverture ---------- */
doc.save();
doc.rect(0, 0, PW, 250).fill(C.band);
doc.rect(0, 250, PW, 6).fill(C.blue);
// logo
doc.roundedRect(ML, 70, 72, 72, 16).fill('#ffffff');
doc.font('Helvetica-Bold').fontSize(40).fillColor(C.band).text('G', ML, 84, { width: 72, align: 'center' });
doc.font('Helvetica-Bold').fontSize(30).fillColor('#ffffff').text('Boîte à Outils GEFEC', ML, 168, { width: CW });
doc.font('Helvetica').fontSize(14).fillColor('#cdd6f5').text('Guide d’utilisation — Magasins & Directeurs régionaux', ML, 206, { width: CW });
doc.restore();

doc.font('Helvetica').fontSize(12).fillColor(C.grey)
  .text('Ce guide explique, en quelques minutes, comment vous connecter, déposer votre valorisation (une seule fois) et utiliser les outils du magasin.', ML, 300, { width: CW, lineGap: 4 });

// encadré "à retenir"
let by = 380;
doc.roundedRect(ML, by, CW, 110, 12).lineWidth(1).fillAndStroke('#f1f5ff', C.line);
doc.font('Helvetica-Bold').fontSize(12).fillColor(C.blue).text('L’essentiel en 3 points', ML + 18, by + 14);
doc.font('Helvetica').fontSize(11).fillColor(C.dark);
const pts = [
  'Vous vous connectez avec votre identifiant et votre mot de passe personnels.',
  'Vous déposez votre valorisation une seule fois : elle est mémorisée et rechargée à chaque connexion.',
  'Vous imprimez vos affiches et étiquettes depuis les outils intégrés.',
];
let py = by + 38;
pts.forEach(t => {
  doc.circle(ML + 23, py + 5, 2.4).fill(C.blue);
  doc.fillColor(C.dark).text(t, ML + 34, py, { width: CW - 50 });
  py += doc.heightOfString(t, { width: CW - 50 }) + 6;
});

doc.font('Helvetica').fontSize(10).fillColor(C.light)
  .text('Document interne GEFEC · Magasin BUT — Juin 2026', ML, PH - 112, { width: CW, lineBreak: false });
doc.font('Helvetica').fontSize(10).fillColor(C.light)
  .text('Adresse de l’outil : ' + SITE, ML, PH - 96, { width: CW, lineBreak: false });

/* ---------- Helpers contenu ---------- */
let y = 0;
function newPage() { doc.addPage(); y = 70; }
function ensure(h) { if (y + h > BOTTOM) newPage(); }

function section(num, title, color) {
  ensure(54);
  doc.save();
  doc.roundedRect(ML, y, 30, 30, 8).fill(color || C.blue);
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#fff').text(String(num), ML, y + 6, { width: 30, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.dark).text(title, ML + 42, y + 5, { width: CW - 42 });
  doc.restore();
  y += 44;
}

function para(t) {
  doc.font('Helvetica').fontSize(11).fillColor(C.grey);
  const h = doc.heightOfString(t, { width: CW, lineGap: 3 });
  ensure(h + 6);
  doc.text(t, ML, y, { width: CW, lineGap: 3 });
  y += h + 8;
}

function step(n, t) {
  doc.font('Helvetica').fontSize(11).fillColor(C.dark);
  const tw = CW - 30;
  const h = Math.max(20, doc.heightOfString(t, { width: tw, lineGap: 3 }));
  ensure(h + 8);
  doc.circle(ML + 9, y + 7, 9).fill(C.blue);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#fff').text(String(n), ML, y + 3, { width: 18, align: 'center' });
  doc.font('Helvetica').fontSize(11).fillColor(C.dark).text(t, ML + 30, y, { width: tw, lineGap: 3 });
  y += h + 8;
}

function bullet(t, color) {
  doc.font('Helvetica').fontSize(11).fillColor(C.dark);
  const tw = CW - 22;
  const h = doc.heightOfString(t, { width: tw, lineGap: 3 });
  ensure(h + 6);
  doc.circle(ML + 7, y + 6, 2.6).fill(color || C.blue);
  doc.fillColor(C.dark).text(t, ML + 20, y, { width: tw, lineGap: 3 });
  y += h + 7;
}

function tip(title, t) {
  doc.font('Helvetica').fontSize(10.5);
  const tw = CW - 36;
  const hT = doc.heightOfString(t, { width: tw, lineGap: 3 });
  const boxH = hT + 38;
  ensure(boxH + 6);
  doc.roundedRect(ML, y, CW, boxH, 10).lineWidth(1).fillAndStroke('#fff8ec', '#f0d9a8');
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.amber).text(title, ML + 18, y + 12, { width: tw });
  doc.font('Helvetica').fontSize(10.5).fillColor('#7a5a16').text(t, ML + 18, y + 28, { width: tw, lineGap: 3 });
  y += boxH + 10;
}

function gap(h) { y += (h || 6); }

/* ---------- Contenu ---------- */
newPage();

section(1, 'Se connecter à l’outil', C.blue);
para('L’outil s’ouvre dans votre navigateur internet (Chrome, Edge, Safari…). Aucun logiciel à installer.');
step(1, 'Ouvrez l’adresse de l’outil : ' + SITE + ' (ou le lien fourni par votre administrateur).');
step(2, 'Saisissez votre identifiant et votre mot de passe (transmis par Rémi SCHAFFHAUSER).');
step(3, 'Cliquez sur « Se connecter ».');
tip('Bon à savoir', 'Vos identifiants sont personnels à votre magasin. Vous restez connecté sur votre navigateur : pas besoin de retaper le mot de passe à chaque fois.');

section(2, 'Déposer votre valorisation (une seule fois)', C.green);
para('La valorisation est le PDF « Valorisation du stock » de votre magasin. Elle sert à tous les outils. Vous ne la déposez qu’une fois : elle est ensuite mémorisée et rechargée automatiquement.');
step(1, 'Sur la page d’accueil, en haut, glissez votre PDF de valorisation dans la zone prévue (ou cliquez pour parcourir vos fichiers).');
step(2, 'Le message « Valorisation enregistrée dans le cloud » confirme la sauvegarde.');
step(3, 'À votre prochaine connexion, elle se recharge toute seule — rien à refaire.');
bullet('Pour la mettre à jour : déposez simplement un nouveau PDF. C’est vous qui décidez quand.', C.green);
bullet('Le bandeau tout en haut indique aussi que la « base article » est chargée et sa date : elle est gérée automatiquement, vous n’avez rien à faire.', C.green);

section(3, 'Les outils du magasin', C.blue);
para('Depuis l’accueil, choisissez un outil. Votre valorisation est déjà prise en compte automatiquement.');

doc.font('Helvetica-Bold').fontSize(12).fillColor(C.orange); ensure(20);
doc.text('Affiches CETELEM', ML, y); y += 18;
bullet('Imprime les affiches de financement sur les produits réellement en exposition.', C.orange);
bullet('Déposez le ZIP des affiches : l’outil le croise avec votre valorisation et prépare la liste à imprimer.', C.orange);
gap(4);

doc.font('Helvetica-Bold').fontSize(12).fillColor(C.red); ensure(20);
doc.text('Étiquettes 2.0', ML, y); y += 18;
bullet('Croise le plan promo national avec votre stock et imprime les affiches BON PLAN et PROMO DU MOMENT (formats A4 et A5).', C.red);
bullet('Déposez le plan promo national, lancez le croisement, cochez les produits, puis préparez et imprimez les étiquettes.', C.red);
bullet('Ajouter un produit manuellement : bouton « + Ajouter un produit », puis recherchez par code EAN13 ou par libellé dans la base article (même hors promo). Le code, le libellé et le prix de vente sont repris automatiquement.', C.red);
gap(4);

doc.font('Helvetica-Bold').fontSize(12).fillColor(C.green); ensure(20);
doc.text('Soldes Magasin', ML, y); y += 18;
bullet('Retire les références déjà gérées par la Média Centrale et celles sans stock. Résultat imprimable.', C.green);

section(4, 'Directeurs régionaux : voir tous les magasins', C.blue);
para('Si vous êtes directeur régional (ou administrateur), un bouton supplémentaire apparaît en haut.');
step(1, 'Cliquez sur le bouton « Valorisations » en haut de la page.');
step(2, 'La liste de tous les magasins s’affiche, avec la date de leur dernière valorisation.');
step(3, 'Pour chaque magasin : « Télécharger » le PDF, ou « Charger dans les outils » pour l’utiliser directement (par ex. imprimer pour ce magasin).');

section(5, 'Se déconnecter', C.blue);
para('Cliquez sur « Déconnexion » en haut à droite. Utile sur un ordinateur partagé.');

section(6, 'Besoin d’aide ?', C.blue);
para('En cas de problème (connexion, valorisation, impression…), contactez :');
ensure(54);
doc.roundedRect(ML, y, CW, 46, 10).lineWidth(1).fillAndStroke('#f1f5ff', C.line);
doc.font('Helvetica-Bold').fontSize(13).fillColor(C.blue).text('Rémi SCHAFFHAUSER', ML + 18, y + 9);
doc.font('Helvetica').fontSize(10.5).fillColor(C.grey).text('Administrateur de la Boîte à Outils GEFEC', ML + 18, y + 27);
y += 56;

/* ---------- Pieds de page (après coup, pages bufferisées) ---------- */
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  if (i === 0) continue; // pas de pied sur la couverture
  doc.switchToPage(i);
  doc.page.margins.bottom = 0; // empêche pdfkit d'ajouter une page en écrivant dans la marge basse
  const fy = PH - 42;
  doc.moveTo(ML, fy).lineTo(MR, fy).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(C.light)
    .text('Boîte à Outils GEFEC  —  Guide d’utilisation', ML, fy + 6, { width: CW / 2, align: 'left', lineBreak: false });
  doc.text('Contact : Rémi SCHAFFHAUSER  ·  page ' + i, ML + CW / 2, fy + 6, { width: CW / 2, align: 'right', lineBreak: false });
}

doc.flushPages();
doc.end();
console.log('PDF généré : ' + OUT);
