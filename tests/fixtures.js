/* Jeux d'essai : plans promo PDF de mises en page DIFFÉRENTES, valorisation
   magasin, affiches « centrale » et archive ZIP — fabriqués avec pdfkit pour
   que les tests lisent de vrais PDF, comme en production.

   Chaque plan est décrit par ses colonnes ; le contenu attendu (EAN, prix,
   dates) est connu d'avance et sert de vérité aux tests. */
'use strict';
const PDFDocument = require('pdfkit');

/* EAN-13 valide à partir de 12 chiffres */
function ean13(base12) {
  const s = String(base12).padStart(12, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+s[i]) * (i % 2 ? 3 : 1);
  return s + ((10 - (sum % 10)) % 10);
}
const euro = (v) => v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
const fr = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

/* Produits TV : codes internes BUT (zéros de tête, perdus dans le plan) */
const TV = [
  { ean: ean13('001112027163'), cat: 'OLED', brand: 'LG', ref: 'OLED55C4', price: 1299.00, base: 1499.00, cession: 890.12, avoir: 42.00, from: '2026-11-12', to: '2026-11-25' },
  { ean: ean13('001112027164'), cat: 'QLED', brand: 'SAMSUNG', ref: 'TQ55Q60D', price: 549.99, base: 699.99, cession: 401.50, avoir: 35.00, from: '2026-11-12', to: '2026-11-25' },
  { ean: ean13('001112027165'), cat: '4K UHD', brand: 'TCL', ref: '65P755', price: 499.99, base: 599.99, cession: 372.00, avoir: 20.00, from: '2026-11-12', to: '2026-11-18' },
  { ean: ean13('001112027165'), cat: '4K UHD', brand: 'TCL', ref: '65P755', price: 479.99, base: 599.99, cession: 372.00, avoir: 30.00, from: '2026-11-19', to: '2026-11-25' },
  { ean: ean13('880609556323'), cat: 'MINI LED', brand: 'SAMSUNG', ref: 'TQ65QN85D', price: 1699.99, base: 1999.99, cession: 1201.00, avoir: 100.00, from: '2026-11-12', to: '2026-12-02' },
  { ean: ean13('871882977220'), cat: 'FULL HD', brand: 'PHILIPS', ref: '32PHS6009', price: 179.99, base: 179.99, cession: 121.30, avoir: 8.00, from: '2026-11-12', to: '2026-11-25' },
];
const PEM = [
  { ean: ean13('322169400123'), cat: 'ASPIRATEUR TRAINEAU', brand: 'ROWENTA', ref: 'ASPITRA RO2611EA', price: 79.99, base: 99.99, cession: 51.20, avoir: 6.00, from: '2026-11-12', to: '2026-11-25' },
  { ean: ean13('322169400124'), cat: 'ASPIRATEUR BALAI', brand: 'ROWENTA', ref: 'ASPIBAL RH6A35WO', price: 199.99, base: 249.99, cession: 132.00, avoir: 15.00, from: '2026-11-12', to: '2026-11-25' },
  { ean: ean13('800482337401'), cat: 'EXPRESSO', brand: 'DELONGHI', ref: 'EXPRESS ECAM290.22.B', price: 349.99, base: 399.99, cession: 240.00, avoir: 25.00, from: '2026-11-12', to: '2026-11-25' },
  { ean: ean13('304538680123'), cat: 'FRITEUSE', brand: 'MOULINEX', ref: 'EZ501820', price: 119.99, base: 149.99, cession: 80.10, avoir: 10.00, from: '2026-11-14', to: '2026-11-25' },
  { ean: ean13('304538680124'), cat: 'BLENDER', brand: 'MOULINEX', ref: 'LM811D10', price: 59.99, base: 79.99, cession: 39.00, avoir: 5.00, from: '2026-11-12', to: '2026-11-25' },
  { ean: ean13('871010396123'), cat: 'RASOIR', brand: 'PHILIPS', ref: 'S5887/10', price: 89.99, base: 129.99, cession: 60.00, avoir: 9.00, from: '2026-11-12', to: '2026-11-25' },
  { ean: ean13('421012961234'), cat: 'ROBOT PATISSIER', brand: 'BOSCH', ref: 'MUM58720', price: 249.99, base: 329.99, cession: 170.00, avoir: 20.00, from: '2026-11-12', to: '2026-12-01' },
  { ean: ean13('802188012345'), cat: 'CENTRALE VAPEUR', brand: 'CALOR', ref: 'GV9230C0', price: 229.99, base: 279.99, cession: 150.00, avoir: 12.00, from: '2026-11-12', to: '2026-11-25' },
];
/* plus long, pour forcer plusieurs pages */
function many(list, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const src = list[i % list.length];
    out.push(Object.assign({}, src, {
      ean: ean13(String(340000000000 + i * 7 + (list === TV ? 500000 : 0))),
      ref: src.ref.replace(/(\d)(?!.*\d)/, (d) => String((+d + i) % 10)) + (i >= list.length ? '-' + i : ''),
      price: Math.round((src.price + i) * 100) / 100, base: Math.round((src.base + i) * 100) / 100,
    }));
  }
  return out;
}

function baseMap(lists) {
  const m = new Map();
  for (const p of [].concat(...lists)) m.set(p.ean.replace(/^0+/, ''), { name: (p.brand + ' ' + p.ref).trim(), price: p.base });
  return m;
}

/* Dessine un tableau. cols : [{ key, label:[lignes], w, align, fmt(row) }] */
function drawPlan(o) {
  const doc = new PDFDocument({ size: 'A4', layout: o.portrait ? 'portrait' : 'landscape', margin: 0, autoFirstPage: false });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const left = o.left || 24, fs = o.fontSize || 7.5, rowH = o.rowH || 22;
  const pageH = o.portrait ? 842 : 595;
  let x = left;
  const cols = o.cols.map((c) => { const r = Object.assign({}, c, { x }); x += c.w; return r; });
  let y = 0, page = 0, i = 0;
  const cell = (c, text, yy, opt) => {
    doc.font(opt && opt.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs);
    doc.text(String(text), c.x + 2, yy, { width: c.w - 4, align: c.align || 'center', lineBreak: false });
  };
  const header = () => {
    const lines = Math.max(...cols.map((c) => c.label.length));
    for (const c of cols) c.label.forEach((l, k) => cell(c, l, y + (lines - c.label.length) * 4.5 + k * 9, { bold: true }));
    y += lines * 9 + 10;
  };
  const newPage = () => {
    doc.addPage();
    if (o.rotate) doc.page.dictionary.data.Rotate = o.rotate;
    page++;
    y = 26;
    if (o.title && (page === 1 || o.titleEveryPage !== false)) {
      doc.font('Helvetica-Bold').fontSize(13).text(o.title, left, y, { lineBreak: false });
      y += 30;
    }
    if (!o.noHeader && (page === 1 || o.headerEveryPage)) header();
  };
  newPage();
  for (const row of o.rows) {
    const extra = row._wrap ? 9 : 0;
    if (y + rowH + extra > pageH - 30) newPage();
    for (const c of cols) {
      let v = c.fmt ? c.fmt(row) : row[c.key];
      if (v == null || v === '') continue;
      if (Array.isArray(v)) v.forEach((line, k) => cell(c, line, y + k * 9));
      else cell(c, v, y + (row._wrap && !c.top ? 4.5 : 0));
    }
    y += rowH + extra;
    i++;
  }
  if (o.footer) doc.font('Helvetica').fontSize(6).text(o.footer, left, pageH - 20, { lineBreak: false });
  doc.end();
  return done;
}

const stripZeros = (e) => e.replace(/^0+/, '');
const COL = {
  envoi: { key: 'envoi', label: ['DATE D\'ENVOI', 'DU PLAN', 'D\'ACTION'], w: 58, fmt: () => '05/11/2026' },
  techno: { key: 'cat', label: ['TECHNO'], w: 62 },
  categorie: { key: 'cat', label: ['CATEGORIE'], w: 96 },
  marque: { key: 'brand', label: ['MARQUE'], w: 58 },
  refs: { key: 'ref', label: ['REFERENCES'], w: 118, align: 'left' },
  ean: { key: 'ean', label: ['EAN'], w: 74, fmt: (r) => stripZeros(r.ean) },
  gamme: { key: 'gamme', label: ['GAMME'], w: 40, fmt: () => 'PERM' },
  cession: { key: 'cession', label: ['Prix de', 'cession HT'], w: 56, fmt: (r) => euro(r.cession) },
  marge: { key: 'marge', label: ['taux de', 'marge'], w: 42, fmt: (r) => ((1 - r.cession * 1.2 / r.price) * 100).toFixed(1).replace('.', ',') + '%' },
  promo: { key: 'price', label: ['PRIX', 'PROMO'], w: 58, fmt: (r) => (r.price == null ? '' : euro(r.price)) },
  avoir: { key: 'avoir', label: ['AVOIR HT', 'MAGASIN A', 'RECEVOIR'], w: 56, fmt: (r) => euro(r.avoir) },
  dates: { key: 'dates', label: ['DATES'], w: 110, fmt: (r) => (r.from ? `${fr(r.from)} au ${fr(r.to)}` : '') },
};

/* Les mises en page testées. expected = produits attendus (clé normalisée). */
const VARIANTS = {
  /* 1. format habituel TV : en-tête répété à chaque page */
  'tv-habituel': () => {
    const rows = TV.concat(many(TV, 34));
    return { type: 'tv', rows, pdf: drawPlan({
      title: 'PLAN PROMO TV - SEMAINE 46', headerEveryPage: true, rows,
      cols: [COL.envoi, COL.techno, COL.marque, COL.refs, COL.ean, COL.gamme, COL.cession, COL.marge, COL.promo, COL.avoir, COL.dates],
    }) };
  },
  /* 2. format habituel PEM : en-tête sur la 1re page seulement, références sur 2 lignes */
  'pem-habituel': () => {
    const rows = PEM.concat(many(PEM, 40)).map((r, i) => (i % 5 === 2 ? Object.assign({ _wrap: true }, r) : r));
    const refs = Object.assign({}, COL.refs, { fmt: (r) => (r._wrap ? [r.ref.split(' ')[0] || r.ref, r.ref.split(' ').slice(1).join(' ') || ''] .filter(Boolean) : r.ref), top: true });
    return { type: 'pem', rows, pdf: drawPlan({
      title: 'PLAN PROMO PEM - SEMAINE 46', headerEveryPage: false, titleEveryPage: false, rows,
      cols: [COL.categorie, COL.marque, refs, COL.ean, COL.gamme, COL.cession, COL.marge, COL.promo, COL.avoir, COL.dates],
    }) };
  },
  /* 3. colonnes déplacées et intitulés reformulés, prix sans « € », dates « du … au … » */
  'pem-reformule': () => {
    const rows = PEM.concat(many(PEM, 12));
    return { type: 'pem', rows, pdf: drawPlan({
      title: 'Plan d\'action promo PEM — novembre', headerEveryPage: true, rows,
      cols: [
        { key: 'ean', label: ['Code EAN'], w: 80, fmt: (r) => r.ean },
        { key: 'brand', label: ['Marque'], w: 60 },
        { key: 'ref', label: ['Désignation', 'produit'], w: 130, align: 'left' },
        { key: 'cat', label: ['Famille'], w: 100 },
        { key: 'price', label: ['Prix de vente', 'promo TTC'], w: 70, align: 'right', fmt: (r) => r.price.toFixed(2).replace('.', ',') },
        { key: 'cession', label: ['PA HT'], w: 54, align: 'right', fmt: (r) => r.cession.toFixed(2).replace('.', ',') },
        { key: 'marge', label: ['Marge %'], w: 46, fmt: (r) => '24,5%' },
        { key: 'avoir', label: ['Remise', 'arrière'], w: 54, align: 'right', fmt: (r) => r.avoir.toFixed(2).replace('.', ',') },
        { key: 'dates', label: ['Période de', 'validité'], w: 120, fmt: (r) => `du ${r.from.slice(8, 10)}/${r.from.slice(5, 7)} au ${fr(r.to)}` },
      ],
    }) };
  },
  /* 4. dates début / fin séparées + prix fond de rayon (prix barré) */
  'tv-debut-fin': () => {
    const rows = TV.slice();
    return { type: 'tv', rows, oldPrice: true, pdf: drawPlan({
      title: 'PLAN PROMO TV', headerEveryPage: true, rows,
      cols: [
        COL.techno, COL.marque, COL.refs, COL.ean,
        { key: 'base', label: ['Prix fond', 'de rayon'], w: 62, fmt: (r) => euro(r.base) },
        COL.promo, COL.cession, COL.avoir,
        { key: 'from', label: ['Date', 'début'], w: 60, fmt: (r) => fr(r.from) },
        { key: 'to', label: ['Date', 'fin'], w: 60, fmt: (r) => fr(r.to) },
      ],
    }) };
  },
  /* 5. intitulé du prix méconnaissable : retrouvé grâce aux prix NOSICA */
  'pem-prix-inconnu': () => {
    const rows = PEM.slice();
    return { type: 'pem', rows, inferred: true, pdf: drawPlan({
      title: 'PLAN PROMO PEM', headerEveryPage: true, rows,
      cols: [COL.categorie, COL.marque, COL.refs, COL.ean,
        { key: 'cession', label: ['Coût'], w: 56, fmt: (r) => euro(r.cession) },
        { key: 'price', label: ['Montant', 'semaine'], w: 60, fmt: (r) => euro(r.price) },
        { key: 'avoir', label: ['Compensation'], w: 62, fmt: (r) => euro(r.avoir) }, COL.dates],
    }) };
  },
  /* 6. piège de l'avoir : cellule « PRIX PROMO » vide, l'avoir ne doit jamais être imprimé */
  'tv-prix-vide': () => {
    const rows = TV.map((r, i) => (i === 1 ? Object.assign({}, r, { price: null, _noPrice: true }) : r));
    const marge = Object.assign({}, COL.marge, { fmt: () => '22,0%' });
    return { type: 'tv', rows, pdf: drawPlan({
      title: 'PLAN PROMO TV - SEMAINE 46', headerEveryPage: true, rows,
      cols: [COL.envoi, COL.techno, COL.marque, COL.refs, COL.ean, COL.gamme, COL.cession, marge, COL.promo, COL.avoir, COL.dates],
    }) };
  },
  /* 7. pas de colonne de dates : la période est dans le titre */
  'pem-dates-titre': () => {
    const rows = PEM.map((r) => Object.assign({}, r, { from: '2026-11-12', to: '2026-11-25' }));
    return { type: 'pem', rows, pdf: drawPlan({
      title: 'PLAN PROMO PEM — offres valables du 12 au 25 novembre 2026', headerEveryPage: true, rows,
      cols: [COL.categorie, COL.marque, COL.refs, COL.ean, COL.cession, COL.promo, COL.avoir],
    }) };
  },
  /* 8. page pivotée (/Rotate 90) : portrait dans le fichier, paysage à l'écran */
  'tv-pivote': () => {
    const rows = TV.slice();
    return { type: 'tv', rows, pdf: drawPlan({
      title: 'PLAN PROMO TV - SEMAINE 46', headerEveryPage: true, rows, rotate: 0,
      cols: [COL.techno, COL.marque, COL.refs, COL.ean, COL.cession, COL.promo, COL.avoir, COL.dates],
    }) };
  },
  /* 9. aucun en-tête : seuls les codes, les dates et (via NOSICA) rien d'autre de sûr */
  'sans-entete': () => {
    const rows = PEM.slice(0, 5);
    return { type: null, rows, noHeader: true, pdf: drawPlan({
      noHeader: true, rows,
      cols: [COL.marque, COL.refs, COL.ean, COL.promo, COL.dates],
    }) };
  },
};

/* Valorisation magasin : « V 0011120238679 LIBELLÉ … qté valeur » */
function makeValo(eans, extra) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  doc.font('Helvetica-Bold').fontSize(11).text('VALORISATION DU STOCK — MAGASIN 51100', 30, 30, { lineBreak: false });
  let y = 60;
  const all = eans.map((e, i) => ({ ean: e, name: 'PRODUIT EXPO ' + (i + 1) })).concat(extra || []);
  doc.font('Helvetica').fontSize(8);
  for (const p of all) {
    if (y > 800) { doc.addPage(); y = 40; }
    doc.text('V', 30, y, { lineBreak: false });
    doc.text(p.ean, 48, y, { lineBreak: false });
    doc.text(p.name, 140, y, { lineBreak: false });
    doc.text('1', 420, y, { lineBreak: false });
    doc.text('123,45', 470, y, { lineBreak: false });
    y += 13;
  }
  doc.end();
  return done;
}

/* Affiche « centrale » : une page A4 portrait par produit (ou planche A4
   paysage à deux poses A5). mode : 'code' (EAN imprimé), 'ref' (référence et
   prix seulement), 'muet' (aucun texte exploitable). */
function makeAffiche(products, o) {
  o = o || {};
  const land = !!o.landscape;
  const doc = new PDFDocument({ size: 'A4', layout: land ? 'landscape' : 'portrait', margin: 0, autoFirstPage: false });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const pose = (p, x0, w, h) => {
    doc.rect(x0, 0, w, h).fill(o.color || '#0a2a66');
    doc.rect(x0 + 24, h * 0.3, w - 48, h * 0.62).fill('#ffffff');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(w / 9).text(o.title || 'OFFRE CENTRALE', x0 + 24, 40, { width: w - 48, align: 'left', lineBreak: false });
    doc.fillColor('#111111');
    if (o.mode === 'muet') return;
    const e = Math.floor(p.price), c = String(Math.round((p.price - e) * 100)).padStart(2, '0');
    doc.font('Helvetica-Bold').fontSize(w / 5).text(String(e), x0 + 40, h * 0.42, { lineBreak: false, continued: false });
    doc.fontSize(w / 12).text('€' + c, x0 + w * 0.62, h * 0.43, { lineBreak: false });
    doc.font('Helvetica').fontSize(w / 26).text((p.cat || '') + ' ' + p.brand, x0 + 40, h * 0.68, { lineBreak: false });
    doc.fontSize(w / 22).text(p.ref.replace(/^[A-Z]+ (?=\S*\d)/, ''), x0 + 40, h * 0.73, { lineBreak: false });
    if (o.mode !== 'ref') doc.fontSize(w / 34).text('Code ' + p.ean, x0 + 40, h * 0.79, { lineBreak: false });
  };
  if (land) {
    for (let i = 0; i < products.length; i += 2) {
      doc.addPage();
      pose(products[i], 0, 421, 595);
      if (products[i + 1]) pose(products[i + 1], 421, 421, 595);
    }
  } else {
    for (const p of products) { doc.addPage(); pose(p, 0, 595, 842); }
  }
  doc.end();
  return done;
}

module.exports = { ean13, euro, TV, PEM, many, baseMap, drawPlan, VARIANTS, makeValo, makeAffiche };
