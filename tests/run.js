#!/usr/bin/env node
/* Tests du lecteur de plan promo (plan-parser.js) — `npm test`.
   De vrais PDF sont fabriqués (tests/fixtures.js) dans neuf mises en page
   différentes puis relus avec pdf.js, exactement comme dans le navigateur.
   Aucun réseau, aucun compte : tout tourne en local. */
'use strict';
const path = require('path');
const G = require('../plan-parser.js');
const F = require('./fixtures.js');

let pdfjs;
try { pdfjs = require('pdfjs-dist/legacy/build/pdf.js'); }
catch (e) { console.error('pdfjs-dist manquant : lancez « npm install » puis « npm test ».'); process.exit(2); }

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(a, b, label) { ok(a === b, `${label} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); }
const section = (t) => console.log('\n' + t);

async function rowsOf(buf) {
  return G.extractRows(pdfjs, new Uint8Array(buf), { docOptions: { standardFontDataUrl: path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/' } });
}

(async () => {
  /* ── 1. utilitaires ───────────────────────────────────────── */
  section('Prix');
  const prices = [
    ['1 699,99 €', 1699.99], ['1 699,99 €', 1699.99], ['1.699,99', 1699.99], ['1,699.99', 1699.99],
    ['1699.99', 1699.99], ['749€99', 749.99], ['749,-', 749], ['749 €', 749], ['42,00 €', 42], [' 9,90', 9.9],
    ['reste en net à 319,99€', null], ['-12,5%', null], ['', null], ['12/11/2026', null], [299.99, 299.99],
  ];
  for (const [s, v] of prices) eq(G.parsePrice(s), v, `parsePrice(${JSON.stringify(s)})`);

  section('Dates');
  const R = (a, b) => JSON.stringify(a && { from: a.from, to: a.to }) === JSON.stringify(b);
  const dates = [
    ['12/11/2026 au 25/11/2026', {}, { from: '2026-11-12', to: '2026-11-25' }],
    ['du 12/11 au 25/11/2026', {}, { from: '2026-11-12', to: '2026-11-25' }],
    ['12/11/26 - 25/11/26', {}, { from: '2026-11-12', to: '2026-11-25' }],
    ['12.11.2026 – 25.11.2026', {}, { from: '2026-11-12', to: '2026-11-25' }],
    ['Du 28 octobre au 3 novembre 2026', {}, { from: '2026-10-28', to: '2026-11-03' }],
    ['du 12 au 25 novembre', { refYear: 2026 }, { from: '2026-11-12', to: '2026-11-25' }],
    ['Du Mardi 4 Aout au Jeudi 3 Decembre', { refYear: 2026 }, { from: '2026-08-04', to: '2026-12-03' }],
    ['28/12 au 03/01', { refYear: 2026 }, { from: '2026-12-28', to: '2027-01-03' }],
    ["jusqu'au 22 octobre", { refYear: 2026 }, { from: null, to: '2026-10-22' }],
    ['31/02/2026 au 05/03/2026', {}, null],
    ['25/11/2026 au 12/11/2026', {}, null],
    ['prix 12,10 puis 25,11', { strict: true }, null],
    ['05/11/2026 OLED LG 1 299,00 € 12/11/2026 au 25/11/2026', { strict: true }, { from: '2026-11-12', to: '2026-11-25' }],
  ];
  for (const [s, o, v] of dates) ok(R(G.parseDateRange(s, o), v ? JSON.parse(JSON.stringify(v)) : null) || (v === null && G.parseDateRange(s, o) === null), `parseDateRange(${JSON.stringify(s)})`);

  section('EAN, références, intitulés');
  ok(G.eanValid('0011120271638'), 'clé EAN valide (code interne BUT)');
  ok(!G.eanValid('0011120271639'), 'clé EAN invalide détectée');
  eq(G.normCode('0011120271638'), '11120271638', 'normCode');
  eq(G.cleanRef('ASPITRA RO2611EA'), 'RO2611EA', 'cleanRef retire le préfixe de famille');
  eq(G.cleanRef('VERTUO PLUS NOIRE 11399'), 'VERTUO PLUS NOIRE 11399', 'cleanRef garde un libellé parlant');
  const heads = {
    'PRIX PROMO': 'promo', 'Prix de cession HT': 'cession', 'AVOIR HT MAGASIN A RECEVOIR': 'avoir', 'taux de marge': 'marge',
    'DATES': 'dates', "DATE D'ENVOI DU PLAN D'ACTION": 'envoi', 'EAN': 'ean', 'Code EAN': 'ean', 'GENCOD': 'ean',
    'MARQUE': 'brand', 'REFERENCES': 'ref', 'Désignation produit': 'ref', 'CATEGORIE': 'cat', 'TECHNO': 'cat',
    'Prix de vente promo TTC': 'promo', 'PVC': 'promo', 'Prix fond de rayon': 'old', 'Ancien prix': 'old',
    'PA HT': 'cession', 'Remise arrière': 'avoir', 'Période de validité': 'dates', 'Date début': 'from', 'Date fin': 'to',
    'PRIX BARRE': 'old', 'Prix de référence': 'old', 'PLAN PROMO TV': null,
  };
  for (const [h, f] of Object.entries(heads)) { const c = G.classifyHeader(h); eq(c ? c.field : null, f, `intitulé « ${h} »`); }

  /* ── 2. plans promo PDF, mise en page par mise en page ────── */
  const base = F.baseMap([F.TV, F.PEM, F.many(F.TV, 34), F.many(F.PEM, 40), F.many(F.PEM, 12)]);
  for (const [name, make] of Object.entries(F.VARIANTS)) {
    section('Plan « ' + name + ' »');
    const v = make();
    const buf = await v.pdf;
    const ex = await rowsOf(buf);
    const out = G.parsePlan(ex.pages, { base, fileName: name + '.pdf', refYear: 2026 });
    const exp = v.rows;
    const got = new Map();
    for (const p of out.products) got.set(p.key + '|' + p.from + '|' + p.to, p);
    eq(out.products.length, exp.length, 'nombre de produits');
    if (v.type) eq(out.type, v.type, 'type de plan');
    let okPrice = 0, okDates = 0, okName = 0, okBrand = 0, okOld = 0, avoirTrap = 0;
    for (const e of exp) {
      const key = G.normCode(e.ean);
      const p = got.get(key + '|' + e.from + '|' + e.to) || out.products.find(x => x.key === key);
      if (!p) continue;
      if (e.price == null ? p.price == null : p.price === e.price) okPrice++;
      if (p.price != null && (p.price === e.avoir || p.price === e.cession)) avoirTrap++;
      if (p.from === e.from && p.to === e.to) okDates++;
      const ref = G.cleanRef(e.ref);
      if (p.name && (p.name === ref || p.name.replace(/\s+/g, ' ') === ref || (v.noHeader && p.name.includes(ref)))) okName++;
      if (p.brand === e.brand) okBrand++;
      if (v.oldPrice && p.oldPrice === (e.base > e.price ? e.base : null)) okOld++;
    }
    eq(okPrice, exp.length, 'prix promo exacts');
    eq(avoirTrap, 0, 'aucun avoir / prix de cession pris pour un prix promo');
    eq(okDates, exp.length, 'dates de validité exactes');
    if (!v.noHeader) { eq(okName, exp.length, 'références exactes'); eq(okBrand, exp.length, 'marques exactes'); }
    if (v.oldPrice) eq(okOld, exp.length, 'prix fond de rayon (barré) lus');
    if (v.inferred) ok(out.products.every(p => p.flags.includes('prix_deduit')), 'prix déduits signalés (bloquants en envoi auto)');
    const noPrice = exp.filter(e => e._noPrice);
    for (const e of noPrice) {
      const p = out.products.find(x => x.key === G.normCode(e.ean));
      ok(p && p.price == null && p.check === 'bloquant', 'cellule prix vide -> prix vide et produit bloqué');
    }
    console.log(`  lecteur ${out.report.reader} · ${out.report.products} produits · ${out.report.ok} sûrs · ${out.report.toCheck} à vérifier · ${out.report.blocking} bloquants`);
  }

  /* ── 3. garde-fous prix (base NOSICA) ─────────────────────── */
  section('Garde-fous prix');
  {
    const rows = F.TV.map((r, i) => (i === 0 ? Object.assign({}, r, { price: 42.00 }) : r));   // avoir à la place du prix
    const buf = await F.drawPlan({
      title: 'PLAN PROMO TV', headerEveryPage: true, rows,
      cols: [
        { key: 'cat', label: ['TECHNO'], w: 62 }, { key: 'brand', label: ['MARQUE'], w: 58 }, { key: 'ref', label: ['REFERENCES'], w: 118, align: 'left' },
        { key: 'ean', label: ['EAN'], w: 74, fmt: (r) => r.ean.replace(/^0+/, '') },
        { key: 'price', label: ['PRIX', 'PROMO'], w: 58, fmt: (r) => F.euro(r.price) },
        { key: 'dates', label: ['DATES'], w: 110, fmt: (r) => `${r.from.slice(8)}/${r.from.slice(5, 7)}/2026 au ${r.to.slice(8)}/${r.to.slice(5, 7)}/2026` },
      ],
    });
    const out = G.parsePlan((await rowsOf(buf)).pages, { base, refYear: 2026 });
    const p = out.products.find(x => x.key === G.normCode(F.TV[0].ean));
    ok(p && p.flags.includes('prix_suspect_bas') && p.check === 'bloquant', 'prix à 42 € pour un produit à 1 499 € : bloqué');
    eq(out.report.level, 'error', 'rapport en erreur');
    eq(out.products.filter(x => x.check === 'ok').length, out.products.length - 1, 'les autres produits restent sûrs');
  }

  /* ── 4. plan fourni en tableur ────────────────────────────── */
  section('Plan en tableur (Excel / CSV)');
  {
    const grid = [
      ['PLAN PROMO PEM'], [],
      ['Famille', 'Marque', 'Désignation', 'Code EAN', 'Prix fond de rayon', 'Prix promo', 'Date début', 'Date fin'],
      ...F.PEM.map(p => [p.cat, p.brand, p.ref, p.ean, p.base, p.price, 46338, '25/11/2026']),
    ];
    const out = G.parsePlanGrid(grid, { refYear: 2026 });
    eq(out.products.length, F.PEM.length, 'produits lus');
    ok(out.products.every((p, i) => p.price === F.PEM[i].price && p.oldPrice === F.PEM[i].base), 'prix promo et prix barré');
    ok(out.products.every(p => p.from === '2026-11-12' && p.to === '2026-11-25'), 'dates (numéro de série Excel + texte)');
  }

  /* ── 5. affiches de la centrale ───────────────────────────── */
  section('Affiches centrale');
  {
    const prods = F.PEM.map(p => ({ key: G.normCode(p.ean), name: G.cleanRef(p.ref), price: p.price }));
    const a = F.PEM[0], b = F.PEM[3];
    // EAN imprimé
    let ex = await rowsOf(await F.makeAffiche([a], { mode: 'code' }));
    let m = G.matchAffiche(ex.texts[0], 'affiche-01.pdf', prods);
    ok(m.by === 'ean' && m.keys[0] === G.normCode(a.ean), 'rattachement par EAN imprimé');
    // EAN dans le nom du fichier
    ex = await rowsOf(await F.makeAffiche([b], { mode: 'muet' }));
    m = G.matchAffiche(ex.texts[0], `EAN_${b.ean}_A4.pdf`, prods);
    ok(m.by === 'fichier' && m.keys[0] === G.normCode(b.ean), 'rattachement par nom de fichier');
    // référence + prix
    ex = await rowsOf(await F.makeAffiche([a], { mode: 'ref' }));
    m = G.matchAffiche(ex.texts[0], 'promo.pdf', prods);
    ok(m.by === 'reference' && m.keys[0] === G.normCode(a.ean) && m.sure, 'rattachement par référence + prix');
    // rien d'exploitable
    ex = await rowsOf(await F.makeAffiche([a], { mode: 'muet' }));
    m = G.matchAffiche(ex.texts[0], 'scan0001.pdf', prods);
    eq(m.keys.length, 0, 'affiche muette : non rattachée (à affecter à la main)');
    // planche paysage à deux poses
    ex = await rowsOf(await F.makeAffiche([a, b], { mode: 'code', landscape: true }));
    m = G.matchAffiche(ex.texts[0], 'planche.pdf', prods);
    eq(m.keys.length, 2, 'planche 2 poses : deux produits');
    eq(G.afficheFormat('planche.pdf', ex.sizes[0].w, ex.sizes[0].h).land, true, 'planche paysage reconnue');
    eq(G.afficheFormat('EAN_1_A5.pdf', 595, 842).fmt, 'a5', 'format A5 lu dans le nom');
    eq(G.afficheFormat('x.pdf', 595, 842).fmt, 'a4', 'A4 portrait par défaut');
    // plan ou affiches ?
    ok(G.looksLikePlan((await rowsOf(await F.VARIANTS['pem-habituel']().pdf)).pages), 'un plan est reconnu comme plan');
    ok(!G.looksLikePlan((await rowsOf(await F.makeAffiche(F.PEM.slice(0, 3), { mode: 'code' }))).pages), 'un jeu d\'affiches n\'est pas pris pour un plan');
  }

  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  if (fail) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
