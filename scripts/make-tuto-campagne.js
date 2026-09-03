/* Génère le tutoriel PDF « Envoi Campagne Mail » — la mise en place côté
   administrateur : Supabase (schéma, fonction, voie d'envoi), réglages dans
   l'outil, puis le déroulé d'une campagne. */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || 'docs/Tuto-Envoi-Campagne-Mail.pdf';
const SITE = 'https://y3n0-51100.github.io/Boite-Outils-GEFEC/';
const SUPA = 'https://supabase.com/dashboard/project/wtqqjsfctyzgawfgjfvf';

const C = {
  band: '#1b1440', violet: '#7c3aed', violet2: '#a78bfa',
  ink: '#141b2d', body: '#4a5568', faint: '#8a93a3',
  line: '#dde3ec', soft: '#f5f3ff',
  green: '#16a34a', amber: '#b25e00', red: '#d92020', blue: '#3056d3',
  code: '#0f172a', codebg: '#f1f5f9',
};

const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 56, bottom: 64, left: 54, right: 54 } });
fs.mkdirSync('docs', { recursive: true });
doc.pipe(fs.createWriteStream(OUT));

const F = w => path.join(__dirname, 'fonts', `Manrope-${w}.ttf`);
doc.registerFont('r', F(400)); doc.registerFont('m', F(600));
doc.registerFont('b', F(700)); doc.registerFont('x', F(800));

/* Manrope ne couvre ni les emoji ni les symboles rares : on les retire avant
   écriture, sinon pdfkit les rend en carrés vides. */
const KEEP = /[\u2010-\u2027\u2030-\u205e\u20ac\u2122\u2190-\u2193\u2248\u2260\u2264\u2265]/;
const S = (t) => String(t == null ? '' : t)
  .split('')
  .filter(ch => ch.codePointAt(0) < 0x2000 || KEEP.test(ch))
  .join('')
  .replace(/[ \t]{2,}/g, ' ');

const PW = doc.page.width, PH = doc.page.height;
const ML = 54, MR = PW - 54, CW = MR - ML;
const BOTTOM = PH - 68;
let y = 0;

/* ──────────────────────────── Briques ──────────────────────────── */
function newPage() { doc.addPage(); y = 62; }
function ensure(h) { if (y + h > BOTTOM) newPage(); }
function gap(h) { y += (h == null ? 8 : h); }

function h1(num, title, color) {
  ensure(58);
  const col = color || C.violet;
  doc.roundedRect(ML, y, 32, 32, 9).fill(col);
  doc.font('x').fontSize(15).fillColor('#fff').text(String(num), ML, y + 8, { width: 32, align: 'center', lineGap: 0 });
  doc.font('x').fontSize(15.5).fillColor(C.ink).text(title, ML + 44, y + 7, { width: CW - 44, lineGap: 0 });
  y += 32 + Math.max(0, doc.heightOfString(title, { width: CW - 44 }) - 20) + 16;
  doc.moveTo(ML, y - 6).lineTo(MR, y - 6).lineWidth(0.8).strokeColor(C.line).stroke();
  gap(6);
}

function h2(title, color) {
  ensure(30);
  doc.font('b').fontSize(11.5).fillColor(color || C.violet).text(title, ML, y, { width: CW, lineGap: 0 });
  y += doc.heightOfString(title, { width: CW }) + 8;
}

function para(t, o) {
  o = o || {};
  doc.font(o.f || 'r').fontSize(o.s || 10.2).fillColor(o.c || C.body);
  const h = doc.heightOfString(t, { width: CW, lineGap: 3 });
  ensure(h + 6);
  doc.text(S(t), ML, y, { width: CW, lineGap: 3 });
  y += h + 9;
}

function step(n, t, sub) {
  doc.font('r').fontSize(10.2);
  const tw = CW - 32;
  const h = doc.heightOfString(t, { width: tw, lineGap: 3 });
  const hs = sub ? doc.heightOfString(sub, { width: tw, lineGap: 2.5 }) + 4 : 0;
  ensure(Math.max(22, h + hs) + 9);
  doc.circle(ML + 10, y + 7.5, 9.5).fill(C.violet);
  doc.font('x').fontSize(9).fillColor('#fff').text(String(n), ML + 1, y + 4, { width: 18, align: 'center', lineGap: 0 });
  doc.font('r').fontSize(10.2).fillColor(C.ink).text(S(t), ML + 32, y, { width: tw, lineGap: 3 });
  if (sub) {
    doc.font('r').fontSize(9).fillColor(C.faint).text(S(sub), ML + 32, y + h + 3, { width: tw, lineGap: 2.5 });
  }
  y += Math.max(22, h + hs) + 9;
}

function bullet(t, color) {
  doc.font('r').fontSize(10).fillColor(C.body);
  const tw = CW - 22;
  const h = doc.heightOfString(t, { width: tw, lineGap: 3 });
  ensure(h + 6);
  doc.circle(ML + 7, y + 6, 2.5).fill(color || C.violet2);
  doc.fillColor(C.body).text(S(t), ML + 20, y, { width: tw, lineGap: 3 });
  y += h + 6;
}

/* Bloc « à recopier » : nom de fichier, secret, valeur… */
function code(t) {
  doc.font('Courier').fontSize(9.6);
  const tw = CW - 28;
  const h = doc.heightOfString(t, { width: tw, lineGap: 2 });
  ensure(h + 22);
  doc.roundedRect(ML, y, CW, h + 18, 8).lineWidth(1).fillAndStroke(C.codebg, C.line);
  doc.font('Courier').fontSize(9.6).fillColor(C.code).text(t, ML + 14, y + 9, { width: tw, lineGap: 2 });
  y += h + 18 + 9;
}

/* Encadré coloré : conseil (ambre), attention (rouge), info (violet) */
function box(kind, title, t) {
  const St = {
    tip:  { bg: '#fff8ec', bd: '#f0d9a8', tc: C.amber, txt: '#7a5a16' },
    warn: { bg: '#fef2f2', bd: '#f5c2c2', tc: C.red,   txt: '#8a2020' },
    info: { bg: C.soft,    bd: '#ddd6fe', tc: C.violet, txt: '#4c2d92' },
    ok:   { bg: '#f0fdf4', bd: '#bbf7d0', tc: C.green, txt: '#14532d' },
  }[kind] || {};
  const tw = CW - 36;
  doc.font('r').fontSize(9.8);
  const hT = doc.heightOfString(t, { width: tw, lineGap: 3 });
  const boxH = hT + 36;
  ensure(boxH + 8);
  doc.roundedRect(ML, y, CW, boxH, 10).lineWidth(1).fillAndStroke(St.bg, St.bd);
  doc.font('x').fontSize(10).fillColor(St.tc).text(S(title), ML + 18, y + 11, { width: tw, lineGap: 0 });
  doc.font('r').fontSize(9.8).fillColor(St.txt).text(S(t), ML + 18, y + 26, { width: tw, lineGap: 3 });
  y += boxH + 11;
}

/* Tableau à 2 ou 3 colonnes, largeurs en fractions de la colonne de texte */
function table(cols, rows, widths) {
  const w = widths.map(f => f * CW);
  const pad = 8;
  // la 1re colonne est en gras : plus large que le regular, elle doit être
  // mesurée avec SA police, sinon la ligne est trop basse et le texte déborde
  const rowH = (cells, font, size) => Math.max(...cells.map((c, i) => {
    doc.font(font === 'r' && i === 0 ? 'b' : font).fontSize(size);
    return doc.heightOfString(S(c), { width: w[i] - pad * 2, lineGap: 2 });
  })) + 12;
  const hHead = rowH(cols, 'x', 8.6);
  ensure(hHead + rowH(rows[0], 'r', 9.2) + 6);
  // en-tête
  doc.rect(ML, y, CW, hHead).fill(C.band);
  let x = ML;
  cols.forEach((c, i) => {
    doc.font('x').fontSize(8.6).fillColor('#fff')
      .text(S(c).toUpperCase(), x + pad, y + 6, { width: w[i] - pad * 2, lineGap: 2 });
    x += w[i];
  });
  y += hHead;
  rows.forEach((cells, ri) => {
    const h = rowH(cells, 'r', 9.2);
    if (y + h > BOTTOM) {                       // le tableau reprend page suivante
      newPage();
      doc.rect(ML, y, CW, hHead).fill(C.band);
      let xh = ML;
      cols.forEach((c, i) => {
        doc.font('x').fontSize(8.6).fillColor('#fff')
          .text(S(c).toUpperCase(), xh + pad, y + 6, { width: w[i] - pad * 2, lineGap: 2 });
        xh += w[i];
      });
      y += hHead;
    }
    if (ri % 2) doc.rect(ML, y, CW, h).fill('#fafbfd');
    let cx = ML;
    cells.forEach((c, i) => {
      doc.font(i === 0 ? 'b' : 'r').fontSize(9.2).fillColor(i === 0 ? C.ink : C.body)
        .text(S(c), cx + pad, y + 6, { width: w[i] - pad * 2, lineGap: 2 });
      cx += w[i];
    });
    doc.moveTo(ML, y + h).lineTo(MR, y + h).lineWidth(0.6).strokeColor(C.line).stroke();
    y += h;
  });
  gap(12);
}

function check(t) {
  doc.font('r').fontSize(10).fillColor(C.ink);
  const tw = CW - 30;
  const h = Math.max(16, doc.heightOfString(t, { width: tw, lineGap: 3 }));
  ensure(h + 8);
  doc.roundedRect(ML + 1, y + 1, 13, 13, 3.5).lineWidth(1.2).strokeColor(C.violet).stroke();
  doc.font('r').fontSize(10).fillColor(C.ink).text(S(t), ML + 28, y, { width: tw, lineGap: 3 });
  y += h + 8;
}

/* ──────────────────────────── Couverture ──────────────────────────── */
doc.save();
doc.rect(0, 0, PW, 300).fill(C.band);
doc.rect(0, 300, PW, 7).fill(C.violet);
doc.roundedRect(ML, 62, 66, 66, 16).fill('#ffffff');
doc.font('x').fontSize(34).fillColor(C.band).text('G', ML, 80, { width: 66, align: 'center', lineGap: 0 });
doc.font('m').fontSize(11).fillColor(C.violet2).text('BOÎTE À OUTILS GEFEC · MAGASIN BUT', ML, 152, { width: CW, characterSpacing: 1.2 });
doc.font('x').fontSize(31).fillColor('#ffffff').text('Envoi Campagne Mail', ML, 174, { width: CW, lineGap: 1 });
doc.font('r').fontSize(13.5).fillColor('#c8bdf0')
  .text('Mise en place et utilisation — ce que vous devez faire de votre côté', ML, 216, { width: CW - 40, lineGap: 3 });
doc.roundedRect(ML, 258, 150, 26, 13).fill(C.violet);
doc.font('b').fontSize(9.5).fillColor('#fff').text('≈ 20 MINUTES, UNE SEULE FOIS', ML, 265, { width: 150, align: 'center', lineGap: 0 });
doc.restore();

y = 336;
para("L'outil « Envoi Campagne Mail » envoie à chaque magasin, en un clic, les affiches prix qui le concernent : "
   + "il contrôle sa valorisation, croise les plans promo publiés avec elle, fabrique un PDF par plan promo et poste le mail "
   + "avec les PDF en pièces jointes. Aucune application tierce, aucun envoi à préparer à la main.", { s: 11, c: C.body });
para("Le code est déjà en ligne. Il reste trois choses à faire de votre côté — une seule fois — puis l'outil s'utilise "
   + "en quelques clics à chaque campagne.", { s: 11, c: C.body });

gap(6);
const phases = [
  ['A', 'Supabase', 'Le schéma, la fonction d\'envoi et la voie de messagerie.', '≈ 10 min'],
  ['B', "Réglages de l'outil", "L'adresse d'expédition, l'objet et le message par défaut, puis un mail de test.", '≈ 5 min'],
  ['C', 'Votre première campagne', 'Les adresses des magasins, les trois choix d\'affiche, l\'envoi.', '≈ 5 min'],
];
phases.forEach(([lettre, titre, txt, dur]) => {
  ensure(66);
  doc.roundedRect(ML, y, CW, 58, 11).lineWidth(1).fillAndStroke('#ffffff', C.line);
  doc.roundedRect(ML + 14, y + 14, 30, 30, 9).fill(C.violet);
  doc.font('x').fontSize(14).fillColor('#fff').text(lettre, ML + 14, y + 21, { width: 30, align: 'center', lineGap: 0 });
  doc.font('x').fontSize(11.5).fillColor(C.ink).text(titre, ML + 56, y + 14, { width: CW - 140, lineGap: 0 });
  doc.font('r').fontSize(9.4).fillColor(C.faint).text(txt, ML + 56, y + 31, { width: CW - 140, lineGap: 2 });
  doc.font('b').fontSize(9).fillColor(C.violet).text(dur, MR - 84, y + 23, { width: 70, align: 'right', lineGap: 0 });
  y += 66;
});

doc.font('r').fontSize(9).fillColor(C.faint)
  .text("Document interne GEFEC · Rémi SCHAFFHAUSER — l'outil : " + SITE, ML, PH - 96, { width: CW, lineGap: 2 });

/* ════════════════ PARTIE A — SUPABASE ════════════════ */
newPage();
doc.font('x').fontSize(10).fillColor(C.violet).text('PARTIE A', ML, y, { characterSpacing: 1.4 });
y += 16;
doc.font('x').fontSize(21).fillColor(C.ink).text('Supabase — une seule fois', ML, y);
y += 32;
para("Tout se fait dans le tableau de bord Supabase de votre projet. Ouvrez-le dans un onglet et gardez-le sous la main :");
code(SUPA);
box('info', 'Vous avez déjà configuré le mail « affiches prêtes » ?',
  "Alors l'étape 3 (la voie d'envoi) est déjà faite : les secrets sont les mêmes. Il ne vous reste que les étapes 1 et 2, "
+ "soit deux copier-coller.");

h1(1, 'Créer les tables et les règles');
para("Ce script ajoute l'adresse mail sur la fiche de chaque magasin, la table des réglages d'envoi, le journal des "
   + "campagnes et le dossier privé où sont déposés les PDF. Il est sans risque : il ne touche à rien d'existant et peut "
   + "être relancé sans dommage.");
step(1, 'Dans Supabase, menu de gauche : SQL Editor, puis « New query ».');
step(2, "Ouvrez le fichier du dépôt et copiez TOUT son contenu :", null);
code('supabase/add-campagne-mail.sql');
step(3, "Collez dans l'éditeur, puis cliquez sur « Run » (ou Ctrl + Entrée).");
step(4, "Le message « Success. No rows returned » confirme que c'est passé.");
box('ok', 'Ce que le script vient de créer',
  "· stores.email — une adresse par magasin (jamais générique)\n"
+ "· app_settings — vos réglages d'envoi, dont l'adresse d'expédition\n"
+ "· campagne_mails — le journal « dernière campagne envoyée le… »\n"
+ "· le dossier privé « affiches » et ses règles d'accès");

h1(2, "Déployer la fonction d'envoi");
para("C'est elle qui poste réellement le mail : elle relit les PDF côté serveur et les attache. Vos identifiants de "
   + "messagerie restent chez Supabase, ils ne sont jamais dans le site.");
step(1, 'Menu de gauche : Edge Functions, puis « Deploy a new function » (éditeur dans le navigateur).');
step(2, 'Nom de la fonction — à recopier exactement, sans majuscule ni espace :');
code('send-campagne-mail');
step(3, "Effacez l'exemple proposé, puis collez tout le contenu du fichier :");
code('supabase/functions/send-campagne-mail/index.ts');
step(4, 'Cliquez sur « Deploy ». La fonction apparaît alors dans la liste, statut « Active ».');
para('Si vous préférez la ligne de commande, une seule commande suffit :');
code('supabase functions deploy send-campagne-mail --project-ref wtqqjsfctyzgawfgjfvf');

h1(3, 'Choisir par où partent les mails');
para("Une seule des trois voies suffit. La première configurée l'emporte. Tout se passe dans Edge Functions → Secrets "
   + "(bouton « Add new secret »).");

h2('Voie 1 — votre messagerie actuelle (recommandée)', C.green);
para("Rien à créer, aucun domaine à acheter : les magasins reçoivent le mail depuis une adresse qu'ils connaissent déjà.");
table(['Secret', 'Valeur à saisir'], [
  ['SMTP_HOST', 'smtp.gmail.com pour Gmail · smtp-mail.outlook.com pour Outlook · sinon le serveur de la centrale'],
  ['SMTP_PORT', '465 (par défaut) ou 587 si votre serveur l’exige'],
  ['SMTP_USER', 'l’adresse du compte, ex. remi.schaff@gmail.com'],
  ['SMTP_PASS', 'un mot de passe d’application (16 caractères), jamais le mot de passe du compte'],
], [0.26, 0.74]);
box('warn', 'Gmail : le mot de passe d’application est obligatoire',
  "Activez d'abord la validation en deux étapes sur le compte, puis créez un mot de passe d'application sur "
+ "myaccount.google.com/apppasswords. C'est ce code de 16 caractères qui va dans SMTP_PASS — le mot de passe "
+ "habituel est systématiquement refusé. Limite Gmail : environ 500 envois par jour, très au-delà de vos 16 magasins.");

h2('Voie 2 — Brevo', C.blue);
bullet("Un secret : BREVO_API_KEY. 300 mails par jour gratuits.", C.blue);
bullet("Il suffit de valider l'adresse d'expéditeur par un clic dans un mail — aucun domaine exigé.", C.blue);

h2('Voie 3 — Resend', C.blue);
bullet("Un secret : RESEND_API_KEY. 3 000 mails par mois.", C.blue);
bullet("Attention : Resend exige un domaine vérifié pour écrire à des destinataires quelconques.", C.blue);

box('info', 'Et si aucune voie n’est configurée ?',
  "L'outil génère les PDF mais refuse d'envoyer, avec un message clair. Contrairement au mail « affiches prêtes », "
+ "il n'y a pas de repli sur votre messagerie : une campagne avec pièces jointes part de l'outil ou ne part pas.");

/* ════════════════ PARTIE B — RÉGLAGES ════════════════ */
newPage();
doc.font('x').fontSize(10).fillColor(C.violet).text('PARTIE B', ML, y, { characterSpacing: 1.4 });
y += 16;
doc.font('x').fontSize(21).fillColor(C.ink).text("Les réglages dans l'outil", ML, y);
y += 32;
para("Connectez-vous à l'outil avec votre compte administrateur, puis cliquez sur Réglages en haut à droite. "
   + "Descendez jusqu'au bloc « Envoi des campagnes mail ».");

h1(4, "Renseigner l'adresse d'expédition");
table(['Champ', 'Ce que vous mettez'], [
  ['Nom de l’expéditeur', 'Ce que le magasin verra comme nom, ex. « Boîte à Outils GEFEC ». Facultatif.'],
  ['Adresse d’expédition', 'L’adresse d’où part le mail. C’est le champ demandé : il remplace tout réglage technique.'],
  ['Adresse de réponse', 'Où arrivent les réponses des magasins si elle diffère de l’expéditeur. Facultatif.'],
  ['Objet par défaut', 'Proposé à chaque campagne, modifiable au moment de l’envoi.'],
  ['Message par défaut', 'Le corps du mail, lui aussi modifiable campagne par campagne.'],
], [0.28, 0.72]);
step(1, 'Remplissez les champs, puis cliquez sur « Enregistrer ».');
step(2, "Le message vert « Expéditeur enregistré » confirme la prise en compte.");
box('warn', "Avec la voie SMTP, l'adresse d'expédition doit être celle du compte SMTP",
  "Si SMTP_USER vaut remi.schaff@gmail.com, l'adresse d'expédition doit être remi.schaff@gmail.com. "
+ "Les serveurs de messagerie refusent d'expédier au nom d'une autre adresse : le mail serait rejeté.");
box('ok', 'Aucun redéploiement pour changer d’adresse',
  "Ce réglage est lu par la fonction d'envoi à chaque mail. Changer l'expéditeur plus tard ne demandera que "
+ "de revenir ici et d'enregistrer.");

h1(5, 'Personnaliser le message');
para("L'objet et le message acceptent des champs remplacés automatiquement, magasin par magasin, au moment de l'envoi :");
table(['Champ', 'Remplacé par'], [
  ['{magasin}', 'Le nom du magasin, ex. BUT Reims'],
  ['{code}', 'Son code, ex. 51100'],
  ['{plans}', 'Les plans promo envoyés, ex. Plan Promo TV + Plan Promo PEM'],
  ['{affiches}', 'Le nombre d’affiches concernant ce magasin'],
  ['{pages}', 'Le nombre de pages à imprimer'],
  ['{date}', 'La date de l’envoi'],
], [0.2, 0.8]);
para("Exemple d'objet : « Votre plan promo — {plans} — {magasin} » devient, pour Reims : "
   + "« Votre plan promo — Plan Promo TV + Plan Promo PEM — BUT Reims ».");

h1(6, 'Envoyer un mail de test');
para("Avant de toucher aux 16 magasins, vérifiez que la chaîne complète fonctionne.");
step(1, "Dans le même bloc, saisissez VOTRE adresse dans le champ « adresse pour un mail de test ».");
step(2, "Cliquez sur « Envoyer un test ».");
step(3, "Message vert « Test envoyé à … » : tout est bon, la partie A est terminée.");
step(4, "Message rouge : consultez le tableau de dépannage en fin de document — l'erreur y est expliquée.");
box('tip', 'Le test ne porte pas de pièce jointe',
  "C'est normal : il valide la voie d'envoi et l'expéditeur, pas la génération des affiches. Celle-ci se vérifie "
+ "avec le bouton « PDF » de l'outil (partie C).");

/* ════════════════ PARTIE C — LA CAMPAGNE ════════════════ */
newPage();
doc.font('x').fontSize(10).fillColor(C.violet).text('PARTIE C', ML, y, { characterSpacing: 1.4 });
y += 16;
doc.font('x').fontSize(21).fillColor(C.ink).text('Envoyer une campagne', ML, y);
y += 32;
para("Cette partie se répète à chaque campagne — comptez cinq minutes une fois les adresses saisies.");

h1(7, 'Avant tout : publier les plans promo', C.blue);
para("L'outil croise les plans promo publiés avec la valorisation de chaque magasin. Sans plan publié, il ne peut "
   + "rien fabriquer.");
step(1, 'Réglages → « Plan promo TV » : choisissez le ou les PDF, puis « Téléverser ».');
step(2, 'Faites de même pour « Plan promo PEM ».');
step(3, "C'est votre geste habituel : rien ne change de ce côté.");
box('info', "Pourquoi deux PDF en pièces jointes ?",
  "Parce qu'il y a deux plans : l'outil fabrique un PDF pour le Plan Promo TV et un pour le Plan Promo PEM. "
+ "Si un seul plan concerne le magasin, il n'y aura qu'une pièce jointe — et le message le dira.");

h1(8, "Ouvrir l'outil et régler la campagne");
step(1, "Sur l'accueil, cliquez sur la carte « Envoi Campagne Mail » (visible de vous seul).");
step(2, "En haut, section « 1 · Réglages de la campagne », faites vos trois choix :", null);
bullet("Type d'affiche : BON PLAN ou PROMO DU MOMENT.");
bullet("Format : A4 (une affiche par page) ou A5 (deux affiches par page — deux fois moins de papier).");
bullet("Papier : blanc (le fond est imprimé) ou pré-imprimé (seul le contenu est imprimé).");
step(3, "Ajustez l'objet et le message si cette campagne mérite un mot particulier. Le modèle enregistré en partie B "
      + "est repris à chaque ouverture.");
step(4, "La ligne verte sous le message confirme les plans pris en compte. Si elle est rouge, retournez publier les plans.");

h1(9, "Renseigner l'adresse de chaque magasin");
para("Chaque magasin a son champ d'adresse sur sa ligne. L'adresse n'est pas générique : vous saisissez celle du "
   + "magasin, elle est mémorisée sur sa fiche dès que vous quittez le champ.");
box('tip', 'À faire une seule fois',
  "Aux campagnes suivantes, les adresses sont déjà là. Un magasin dont le champ reste vide reste visible mais "
+ "sort de l'envoi groupé.");

h1(10, 'Lire les pastilles de valorisation', C.amber);
para("Avant tout envoi, l'outil contrôle l'âge de la valorisation déposée par le magasin.");
table(['Pastille', 'Ce que ça veut dire', 'Boutons'], [
  ['Valorisation 4 j', 'Moins de 20 jours : la photo du stock est fiable.', 'Actifs'],
  ['Périmée · 45 j', 'Plus de 20 jours : les affiches porteraient sur des produits qui ne sont plus exposés.', 'Inactifs'],
  ['Aucune valorisation', 'Le magasin n’a jamais rien déposé.', 'Inactifs'],
], [0.24, 0.56, 0.2]);
box('warn', 'Un magasin bloqué se débloque par lui-même',
  "Demandez au magasin de déposer une valorisation à jour depuis l'accueil : sa pastille repasse au vert dès que "
+ "vous cliquez sur « Actualiser ». Le seuil de 20 jours n'est pas contournable depuis l'outil — c'est ce qui "
+ "garantit que les affiches envoyées correspondent au stock réel.");

h1(11, "Contrôler, puis envoyer");
h2('Contrôler une campagne avant de l’envoyer', C.green);
step(1, "Sur la ligne d'un magasin, cliquez sur « PDF ».");
step(2, "L'outil génère les PDF et les télécharge sur votre poste, sans rien envoyer. Ouvrez-les, vérifiez le rendu.");

h2('Envoyer à un magasin', C.violet);
step(1, "Cliquez sur « Générer & envoyer » sur sa ligne.");
step(2, "Suivez l'avancement sous la ligne : lecture de la valorisation, croisement, affiche 12/34, dépôt, envoi.");
step(3, "Le compte rendu vert récapitule : destinataire, nombre de pièces jointes, d'affiches et de pages.");

h2('Envoyer à tous les magasins', C.violet);
step(1, "Bouton « Envoyer à tous les magasins prêts (N) » en haut à droite.");
step(2, "N compte les magasins dont la valorisation est fraîche ET l'adresse renseignée. Confirmez.");
step(3, "Les magasins sont traités l'un après l'autre : chacun reçoit les affiches de SON magasin.");
box('tip', 'Comptez quelques minutes pour 16 magasins',
  "Chaque affiche est rendue une par une dans votre navigateur. Laissez l'onglet ouvert et au premier plan "
+ "pendant l'envoi groupé : c'est votre machine qui fabrique les PDF.");

/* ════════════════ CE QUE REÇOIT LE MAGASIN ════════════════ */
gap(6);
h1(12, 'Ce que reçoit le magasin', C.green);
para("Un mail classique, dans sa boîte habituelle, sans lien à cliquer ni compte à saisir :");
bullet("l'objet que vous avez choisi, avec le nom de son magasin ;", C.green);
bullet("votre message, annonçant le plan promo envoyé ;", C.green);
bullet("le récapitulatif des pièces jointes : nom du plan, nombre d'affiches, nombre de pages ;", C.green);
bullet("les deux PDF joints — Plan Promo TV et Plan Promo PEM — prêts à imprimer.", C.green);
gap(4);
para("De votre côté, la ligne du magasin affiche désormais « dernière campagne aujourd'hui à … » : "
   + "l'historique est conservé et visible à chaque ouverture de l'outil.");

/* ════════════════ DÉPANNAGE ════════════════ */
h1(13, 'Dépannage', C.red);
table(['Message affiché', 'Cause', 'Ce qu’il faut faire'], [
  ['Réglages d’envoi illisibles — la migration a-t-elle été exécutée ?',
   'Le script SQL n’est pas passé.',
   'Refaire l’étape 1 (SQL Editor → add-campagne-mail.sql → Run).'],
  ['Aucune adresse d’expédition',
   'Le champ est vide dans Réglages.',
   'Étape 4 : saisir l’adresse et enregistrer.'],
  ['Aucune voie d’envoi (SMTP_HOST, RESEND_API_KEY ou BREVO_API_KEY) n’est définie',
   'Aucun secret n’est renseigné côté Supabase.',
   'Étape 3 : ajouter les secrets d’une des trois voies.'],
  ['Envoi SMTP refusé par smtp.gmail.com — 535',
   'Mot de passe refusé.',
   'Utiliser un mot de passe d’application de 16 caractères, pas le mot de passe du compte.'],
  ['Envoi SMTP refusé — 550 / sender not allowed',
   'L’adresse d’expédition n’est pas celle du compte SMTP.',
   'Mettre la même adresse que SMTP_USER dans Réglages.'],
  ['Failed to send a request to the Edge Function',
   'La fonction n’est pas déployée, ou son nom est mal orthographié.',
   'Étape 2 : vérifier qu’elle s’appelle exactement send-campagne-mail.'],
  ['Aucun plan promo publié',
   'Les plans TV / PEM ne sont pas en ligne.',
   'Étape 7 : les téléverser dans Réglages.'],
  ['Aucun produit des plans promo n’est présent dans la valorisation de ce magasin',
   'Aucune correspondance réelle.',
   'Normal : ce magasin n’expose aucun produit en promo. Rien à envoyer.'],
  ['Valorisation de 45 jours — au-delà de 20 jours…',
   'Photo du stock trop ancienne.',
   'Demander au magasin de redéposer sa valorisation, puis « Actualiser ».'],
  ['Pièces jointes trop lourdes — au-delà de 20 Mo',
   'Trop d’affiches en A4.',
   'Choisir le format A5, ou envoyer un plan à la fois.'],
], [0.33, 0.24, 0.43]);

/* ════════════════ CHECKLIST ════════════════ */
newPage();
h1(14, 'Votre check-list', C.violet);
para("À cocher une fois, dans l'ordre. Les trois premières lignes ne se refont jamais.");
gap(2);
h2('Une seule fois', C.violet);
check('Script add-campagne-mail.sql exécuté dans le SQL Editor Supabase');
check('Fonction send-campagne-mail déployée (statut « Active »)');
check('Secrets de la voie d’envoi renseignés (SMTP, Brevo ou Resend)');
check('Adresse d’expédition enregistrée dans Réglages');
check('Mail de test reçu');
gap(6);
h2('À chaque campagne', C.violet);
check('Plans promo TV et PEM publiés dans Réglages');
check('Adresses des magasins renseignées (une seule fois par magasin)');
check('Type d’affiche, format et papier choisis');
check('Objet et message relus');
check('Un magasin testé avec « PDF » avant l’envoi groupé');
check('« Envoyer à tous les magasins prêts » lancé, onglet laissé ouvert');

gap(14);
const fin = "Le détail technique de chaque étape est dans supabase/SETUP.md (étape 7) et dans le README du dépôt.";
doc.font('r').fontSize(10);
const finH = doc.heightOfString(fin, { width: CW - 36, lineGap: 2 }) + 46;
ensure(finH + 8);
doc.roundedRect(ML, y, CW, finH, 11).lineWidth(1).fillAndStroke(C.soft, '#ddd6fe');
doc.font('x').fontSize(12).fillColor(C.violet).text('Une question, un blocage ?', ML + 18, y + 13, { width: CW - 36 });
doc.font('r').fontSize(10).fillColor('#4c2d92').text(fin, ML + 18, y + 33, { width: CW - 36, lineGap: 2 });
y += finH + 12;

/* ──────────────────────────── Pieds de page ──────────────────────────── */
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  if (i === 0) continue;
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  const fy = PH - 44;
  doc.moveTo(ML, fy).lineTo(MR, fy).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.font('m').fontSize(8).fillColor(C.faint)
    .text('Boîte à Outils GEFEC — Envoi Campagne Mail', ML, fy + 7, { width: CW / 2, align: 'left', lineBreak: false });
  doc.font('b').fontSize(8).fillColor(C.faint)
    .text('page ' + i, ML + CW / 2, fy + 7, { width: CW / 2, align: 'right', lineBreak: false });
}

doc.flushPages();
doc.end();
console.log('PDF généré : ' + OUT);
