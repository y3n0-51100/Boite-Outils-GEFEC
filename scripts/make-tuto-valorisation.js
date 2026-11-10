/* Génère le tuto « Comment ajouter sa valorisation », proposé en
   téléchargement sur l'écran de création de compte.
   node scripts/make-tuto-valorisation.js  ->  docs/Comment-ajouter-sa-valorisation.pdf */
const PDFDocument = require('pdfkit');
const fs = require('fs');

const OUT = process.argv[2] || 'docs/Comment-ajouter-sa-valorisation.pdf';
const C = { blue: '#3056d3', band: '#1e3aa8', dark: '#172033', grey: '#5a6678', light: '#8a93a3', amber: '#b25e00' };

const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 54, right: 54 } });
fs.mkdirSync('docs', { recursive: true });
doc.pipe(fs.createWriteStream(OUT));
const PW = doc.page.width, ML = 54, CW = PW - 108;
let y = 0;

// bandeau
doc.rect(0, 0, PW, 150).fill(C.band);
doc.font('Helvetica-Bold').fontSize(26).fillColor('#fff').text('Comment ajouter sa valorisation', ML, 52, { width: CW });
doc.font('Helvetica').fontSize(13).fillColor('#cdd6f5').text('Boîte à Outils GEFEC — création du compte magasin', ML, 96, { width: CW });
y = 180;

function title(t) {
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.dark).text(t, ML, y, { width: CW });
  y += 26;
}
function para(t) {
  doc.font('Helvetica').fontSize(11).fillColor(C.grey);
  const h = doc.heightOfString(t, { width: CW, lineGap: 3 });
  doc.text(t, ML, y, { width: CW, lineGap: 3 }); y += h + 10;
}
function step(n, t) {
  const tw = CW - 32;
  doc.font('Helvetica').fontSize(11);
  const h = Math.max(20, doc.heightOfString(t, { width: tw, lineGap: 3 }));
  doc.circle(ML + 10, y + 7, 10).fill(C.blue);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff').text(String(n), ML, y + 2, { width: 20, align: 'center' });
  doc.font('Helvetica').fontSize(11).fillColor(C.dark).text(t, ML + 32, y, { width: tw, lineGap: 3 });
  y += h + 10;
}
function tip(head, t) {
  const tw = CW - 36;
  doc.font('Helvetica').fontSize(10.5);
  const h = doc.heightOfString(t, { width: tw, lineGap: 3 }) + 38;
  doc.roundedRect(ML, y, CW, h, 10).lineWidth(1).fillAndStroke('#fff8ec', '#f0d9a8');
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.amber).text(head, ML + 18, y + 12, { width: tw });
  doc.font('Helvetica').fontSize(10.5).fillColor('#7a5a16').text(t, ML + 18, y + 28, { width: tw, lineGap: 3 });
  y += h + 14;
}

title('1. Éditer la valorisation depuis NOSICA');
para("La valorisation est l'édition « Valorisation du stock » de votre magasin. Elle liste les produits exposés : c'est elle qui permet de ne vous envoyer que les affiches des produits réellement présents chez vous.");
step(1, 'Ouvrez NOSICA et lancez l’édition « Valorisation du stock » de votre magasin.');
step(2, 'Choisissez une sortie au format PDF.');
step(3, 'Enregistrez le PDF sur votre ordinateur (par exemple sur le Bureau).');

y += 6;
title('2. Déposer la valorisation à la création du compte');
step(1, 'Sur la page de connexion de l’outil, cliquez sur « Créer un compte ».');
step(2, 'Renseignez le nom du magasin, le mot de passe et de 1 à 3 adresses e-mail de réception des affiches.');
step(3, 'Glissez le PDF de valorisation dans la zone « Déposez votre valorisation », ou cliquez dessus pour le choisir.');
step(4, 'Cliquez sur « Créer mon compte ». L’outil vérifie que le PDF contient bien des codes EAN, puis crée le compte.');

y += 4;
tip('Bon à savoir', "Le PDF doit être l'édition NOSICA d'origine (pas une photo ni un scan) : l'outil y lit les codes EAN à 13 chiffres. Un PDF sans code EAN est refusé.");
tip('Ensuite', "Connectez-vous avec le nom de votre magasin et votre mot de passe. Votre espace affiche l'historique des mails envoyés, vos adresses de réception (modifiables à tout moment) et l'interrupteur de réception des mails.");

doc.end();
