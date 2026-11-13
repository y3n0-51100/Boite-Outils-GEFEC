#!/usr/bin/env node
/* Tests de bout en bout dans Chromium (Playwright) — `npm run test:navigateur`.

   1. Plan Promo : valorisation + plan TV (PDF) + ZIP de la centrale (plan PEM
      + affiches déjà faites) déposés comme le ferait l'utilisateur ;
      croisement, rattachement des affiches, planches, impression, PDF.
   2. Chaîne d'envoi (etiquette.html?export=1) : le même ZIP publié par
      l'administrateur -> un PDF par plan, affiches centrale comprises.
   3. Masques : chaque affiche (BON PLAN / PROMO DU MOMENT / Star, A4 / A5,
      papier blanc / pré-imprimé) est comparée pixel à pixel à la version
      d'origine de l'outil (GEFEC_REF=chemin vers l'ancien etiquette.html,
      facultatif) ; sans référence, elle est seulement rendue et contrôlée.

   Variables : GEFEC_SHOTS=dossier  -> enregistre des captures d'écran. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');
const F = require('./fixtures.js');

const ROOT = path.resolve(__dirname, '..');
const REF = process.env.GEFEC_REF || '';
const SHOTS = process.env.GEFEC_SHOTS || '';
let pass = 0, fail = 0;
const failures = [];
function ok(c, label) { if (c) pass++; else { fail++; failures.push(label); console.log('  ✗ ' + label); } }
function eq(a, b, label) { ok(a === b, `${label} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); }
const section = (t) => console.log('\n' + t);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.json': 'application/json' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
      let file = rel === '__ref.html' && REF ? path.resolve(REF) : path.resolve(ROOT, rel);
      if (rel !== '__ref.html' && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function buildInputs() {
  const valoEans = F.TV.map(p => p.ean).concat(F.PEM.map(p => p.ean)).concat(F.many(F.PEM, 40).slice(0, 10).map(p => p.ean));
  const valo = await F.makeValo([...new Set(valoEans)].filter(e => e !== F.PEM[7].ean));
  const tv = await F.VARIANTS['tv-habituel']().pdf;
  const pem = await F.VARIANTS['pem-habituel']().pdf;
  const zip = new JSZip();
  zip.file('Plan promo PEM S46.pdf', pem);
  zip.file(`Affiches/EAN_${F.PEM[3].ean}_A4.pdf`, await F.makeAffiche([F.PEM[3]], { mode: 'muet', color: '#5a1a8a' }));
  zip.file('Affiches/Rowenta.pdf', await F.makeAffiche([F.PEM[0], F.PEM[1]], { mode: 'code', color: '#0a2a66' }));
  zip.file('Affiches/Planche A5.pdf', await F.makeAffiche([F.PEM[2], F.PEM[4]], { mode: 'ref', landscape: true, color: '#0b5d3b' }));
  zip.file('Affiches/scan0001.pdf', await F.makeAffiche([F.PEM[5]], { mode: 'muet', color: '#444' }));
  zip.file('__MACOSX/._Rowenta.pdf', 'x');
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  return { valo, tv, pem, zipBuf };
}

(async () => {
  const { chromium } = require('playwright');
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 }, acceptDownloads: true });
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('requestfailed', r => { if (!/\/favicon/.test(r.url())) errors.push('requête échouée : ' + r.url()); });
  };
  const shot = async (p, name, opt) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot(Object.assign({ path: path.join(SHOTS, name + '.png') }, opt || {})); } };
  const inp = await buildInputs();
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gefec-'));
  const w = (n, b) => { const f = path.join(tmp, n); fs.writeFileSync(f, b); return f; };
  const fValo = w('valorisation.pdf', inp.valo), fTv = w('PLAN PROMO TV S46.pdf', inp.tv), fZip = w('Centrale S46.zip', inp.zipBuf);

  try {
    /* ── 1. Plan Promo, comme un utilisateur ─────────────────── */
    section('Plan Promo : dépôt PDF + ZIP centrale');
    const p = await ctx.newPage(); watch(p);
    await p.goto(base + 'etiquette.html', { waitUntil: 'load' });
    await p.waitForFunction(() => window.GefecPlan && document.getElementById('chipBase').textContent.includes('NOSICA'));
    await p.setInputFiles('#fileValo', fValo);
    await p.waitForFunction(() => state.storeKeys.size > 0);
    await p.setInputFiles('#filePromo', [fTv, fZip]);
    await p.waitForFunction(() => state.plans.tv.products.length && state.plans.pem.products.length, null, { timeout: 60000 });
    const r1 = await p.evaluate(() => ({
      tv: state.plans.tv.promoProducts.length, pem: state.plans.pem.promoProducts.length,
      tvM: state.plans.tv.products.length, pemM: state.plans.pem.products.length,
      aff: state.affiches.map(a => ({ f: a.file, p: a.page, k: a.keys.length, by: a.by, land: a.land, fmt: a.fmt, ign: a.ignored })),
      rep: state.reports.tv && state.reports.tv.level, repPem: state.reports.pem && state.reports.pem.level,
    }));
    eq(r1.tv, 40, 'plan TV : produits lus');
    eq(r1.pem, 48, 'plan PEM (dans le ZIP) : produits lus');
    eq(r1.tvM, F.TV.length, 'plan TV : produits de la valorisation');
    eq(r1.pemM, F.PEM.length - 1 + 10, 'plan PEM : produits de la valorisation');
    eq(r1.aff.length, 5, 'affiches centrale trouvées dans le ZIP (dossier __MACOSX ignoré)');
    eq(r1.aff.filter(a => a.k).length, 4, 'affiches rattachées automatiquement');
    ok(r1.aff.find(a => a.f.startsWith('EAN_')).by === 'fichier', 'rattachement par nom de fichier');
    ok(r1.aff.filter(a => a.f === 'Rowenta.pdf').every(a => a.by === 'ean'), 'rattachement par EAN imprimé (PDF de 2 pages)');
    ok(r1.aff.find(a => a.f === 'Planche A5.pdf').k === 2 && r1.aff.find(a => a.f === 'Planche A5.pdf').land, 'planche paysage : 2 produits par référence');
    ok(r1.aff.find(a => a.f === 'scan0001.pdf').k === 0, 'affiche illisible : signalée « à rattacher »');
    // (un EAN de test existe réellement dans la base NOSICA à un autre prix :
    // l'outil le signale « à vérifier », ce qui est le comportement attendu)
    ok(r1.rep !== 'error' && r1.repPem !== 'error', 'contrôle de lecture : aucun point bloquant');
    await p.evaluate(() => setPlan('pem'));
    await p.waitForTimeout(400);
    await shot(p, '01-fichiers-controle', { fullPage: true });

    // rattachement manuel de l'affiche illisible
    const k5 = F.PEM[5].ean.replace(/^0+/, '');
    await p.evaluate((k) => { const a = state.affiches.find(x => x.file === 'scan0001.pdf'); assignAffiche(a.id, k); }, k5);
    eq(await p.evaluate(() => state.affiches.filter(a => a.keys.length).length), 5, 'rattachement manuel');

    section('Tableau produits');
    await p.evaluate(() => goStep(2));
    await p.waitForTimeout(300);
    const t = await p.evaluate(() => ({
      rows: document.querySelectorAll('#tableWrap tbody tr').length,
      aff: +document.getElementById('fAff').textContent,
      check: +document.getElementById('fCheck').textContent,
    }));
    eq(t.rows, F.PEM.length - 1 + 10, 'lignes du tableau');
    eq(t.aff, 6, 'produits couverts par une affiche centrale');
    await p.evaluate(() => setFilter('aff'));
    eq(await p.evaluate(() => document.querySelectorAll('#tableWrap tbody tr').length), 6, 'filtre « affiche centrale »');
    await p.evaluate(() => { setFilter('all'); document.getElementById('tableSearch').value = 'moulinex'; renderTable(); });
    ok(await p.evaluate(() => document.querySelectorAll('#tableWrap tbody tr').length) >= 2, 'recherche dans le tableau');
    await p.evaluate(() => { document.getElementById('tableSearch').value = ''; renderTable(); });
    // saisie d'un prix : le produit redevient sûr et coché
    const fixed = await p.evaluate(() => {
      const x = state.products[state.products.length - 1];
      x.flags = ['prix_absent']; x.check = 'bloquant'; x.selected = false; x.price = null;
      updProd(x.id, 'price', '89,90');
      return [x.price, x.check, x.selected];
    });
    eq(JSON.stringify(fixed), JSON.stringify([89.9, 'ok', true]), 'prix corrigé à la main');
    await shot(p, '02-produits');

    section('Affiches : aperçu, impression, PDF');
    await p.evaluate(() => { setFmt('a4'); goStep(3); });
    await p.waitForFunction(() => document.querySelectorAll('#previewWrap .pv').length > 0);
    await p.waitForFunction(() => !document.querySelector('#previewWrap .affwait'), null, { timeout: 30000 });
    const pv = await p.evaluate(() => {
      const sh = buildSheets();
      return { n: sh.length, aff: sh.filter(s => s.affs).length, land: sh.filter(s => s.affs && s.land).length, prods: state.products.filter(x => x.selected).length };
    });
    eq(pv.aff, 5, 'feuilles d\'affiches centrale (A4 ×4 dont 1 rattachée à la main + planche paysage)');
    eq(pv.n, pv.aff + (pv.prods - 6), 'une feuille par autre produit en A4');
    await shot(p, '03-apercu-a4');
    await p.evaluate(() => setFmt('a5'));
    await p.waitForTimeout(500);
    const pv5 = await p.evaluate(() => buildSheets().length);
    eq(pv5, 5 + Math.ceil((pv.prods - 6) / 2), 'A5 ×2 : deux produits par feuille');
    await shot(p, '04-apercu-a5');
    // impression : intercepte window.print et contrôle la zone imprimée
    const pr = await p.evaluate(async () => {
      let called = false; window.print = () => { called = true; };
      await doPrint();
      const pa = document.getElementById('printArea');
      return { called, sheets: pa.querySelectorAll('.sheet').length, imgs: [...pa.querySelectorAll('.affimg')].every(i => i.complete && i.naturalWidth > 1000), css: document.getElementById('pageStyle').textContent };
    });
    ok(pr.called && pr.sheets === pv5, 'impression : toutes les feuilles dans la zone imprimée');
    ok(pr.imgs, 'impression : affiches centrale en haute définition');
    ok(/@page paysage/.test(pr.css), 'impression : orientation mixte gérée');
    // PDF
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.evaluate(() => downloadPdf())]);
    const pdfBuf = fs.readFileSync(await dl.path());
    const doc = await PDFDocument.load(pdfBuf);
    eq(doc.getPageCount(), pv5, 'PDF téléchargé : nombre de pages');
    const sizes = doc.getPages().map(pg => pg.getSize()).map(s => Math.round(s.width) + 'x' + Math.round(s.height));
    eq(sizes.filter(s => s === '595x842').length, 4, 'PDF : affiches centrale A4 en portrait');
    eq(sizes.filter(s => s === '842x595').length, pv5 - 4, 'PDF : planches A5 ×2 et planche centrale en paysage');
    await p.evaluate(() => setFmt('a4'));

    // dates de validité : jamais inventées pour un produit du plan sans dates
    const dv = await p.evaluate(() => {
      const base = { id: 1, ean: '3221694001235', name: 'X', brand: 'Y', price: 10, eco: null, selected: true, flags: [] };
      return [
        validityTextFor(Object.assign({}, base, { from: '2026-11-12', to: '2026-11-25' })),
        validityTextFor(Object.assign({}, base, { from: null, to: '2026-11-22' })),
        validityTextFor(Object.assign({}, base, { from: null, to: null })),
      ];
    });
    eq(dv[0], 'PRIX VALABLE DU 12 NOVEMBRE AU 25 NOVEMBRE 2026', 'dates du plan imprimées');
    eq(dv[1], "PRIX VALABLE JUSQU'AU 22 NOVEMBRE 2026", "date de fin seule : « jusqu'au »");
    eq(dv[2], '', 'produit du plan sans dates : aucune date inventée');

    // thème sombre
    await p.evaluate(() => GefecUI.setTheme('dark'));
    await p.evaluate(() => goStep(2));
    await shot(p, '05-produits-sombre');
    await p.evaluate(() => GefecUI.setTheme('light'));
    await p.close();

    /* ── 2. Chaîne d'envoi (cadre d'export) ─────────────────── */
    section('Chaîne d\'envoi : etiquette.html?export=1');
    const e = await ctx.newPage(); watch(e);
    await e.goto(base + 'etiquette.html?export=1', { waitUntil: 'load' });
    const camp = await e.evaluate(async ({ valo, tv, zip }) => {
      const ab = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const r = await window.gefecBuildCampagne({
        valo: ab(valo), plans: { tv: [{ data: ab(tv), name: 'tv.pdf' }], pem: [{ data: ab(zip), name: 'centrale.zip' }] },
        tpl: 'promo', fmt: 'a4', plansToken: 'x1',
      });
      const out = [];
      for (const f of r.files) out.push({ id: f.id, pages: f.pages, products: f.products, b64: btoa(String.fromCharCode(...new Uint8Array(await f.blob.arrayBuffer()).slice(0, 4))), size: f.blob.size });
      return { files: out, skipped: r.skipped };
    }, { valo: inp.valo.toString('base64'), tv: inp.tv.toString('base64'), zip: inp.zipBuf.toString('base64') });
    eq(camp.files.length, 2, 'un PDF par plan');
    ok(camp.files.every(f => f.b64 === 'JVBERg=='), 'fichiers PDF valides');
    const pemF = camp.files.find(f => f.id === 'pem');
    eq(pemF && pemF.pages, 3 + 1 + (F.PEM.length - 1 + 10 - 5), 'PEM : affiches centrale reprises + affiches générées');
    eq(camp.skipped, 0, 'aucune ligne bloquante écartée');
    // tournée du jour : seules les offres qui COMMENCENT ce jour-là partent
    const tour = (date, extra) => e.evaluate(async ({ valo, zip, date, extra }) => {
      const ab = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const r = await window.gefecBuildAuto(Object.assign({
        valo: ab(valo), plans: { pem: [{ data: ab(zip), name: 'centrale.zip' }] }, plansToken: 'x2',
        date, operations: [], sent: [], fmtPEM: 'a4',
      }, extra || {}));
      return { files: r.files.map(f => ({ id: f.id, pages: f.pages })), items: r.items.map(i => i.from), alerts: r.alerts.map(a => a.type) };
    }, { valo: inp.valo.toString('base64'), zip: inp.zipBuf.toString('base64'), date, extra });
    const j14 = await tour('2026-11-14');
    ok(j14.items.length === 2 && j14.items.every(f => f === '2026-11-14'), 'tournée du 14 : uniquement les 2 offres qui commencent le 14');
    ok(j14.alerts.includes('offres_non_envoyees'), 'offres déjà commencées : signalées, pas envoyées');
    ok(j14.alerts.includes('sans_operation'), 'tournée : alerte « sans opération » remontée');
    const j15 = await tour('2026-11-15');
    eq(j15.files.length, 0, 'tournée du 15 : aucune offre ne commence -> aucun mail');
    const rattrape = await tour('2026-11-15', { catchUp: true });
    ok(rattrape.items.length > 1, '« Envoyer maintenant » : rattrape les offres en cours non envoyées');
    await e.close();

    /* ── 3. Masques ──────────────────────────────────────────── */
    section('Masques : rendu' + (REF ? ' et comparaison avec la version d\'origine' : ''));
    const cases = [];
    for (const tpl of ['bonplan', 'promo']) for (const fmt of ['a4', 'a5']) for (const bg of [true, false]) cases.push({ plan: 'tv', tpl, fmt, bg });
    for (const fmt of ['a4', 'a5']) cases.push({ plan: 'star', tpl: 'promo', fmt, bg: true, old: true }, { plan: 'star', tpl: 'bonplan', fmt, bg: true });
    cases.push({ plan: 'perso', tpl: 'promo', fmt: 'a4', bg: true, old: true }, { plan: 'perso', tpl: 'promo', fmt: 'a5', bg: true, old: true });
    const renderCase = async (pg, c) => pg.evaluate(async (c) => {
      const prods = [
        { id: 9001, ean: '0011120271638', name: 'OLED55C4', cat: 'TÉLÉVISEUR', brand: 'LG', price: 1299, oldPrice: c.old ? 1499 : null, eco: 12, from: '2026-11-12', to: '2026-11-25', selected: true },
        { id: 9002, ean: '3221694001231', name: 'RO2611EA', cat: 'ASPIRATEUR TRAINEAU', brand: 'ROWENTA', price: 79.99, oldPrice: c.old ? 99.99 : null, eco: 0.5, from: '2026-11-12', to: '2026-11-25', selected: true },
      ];
      state.plan = c.plan; state.plans[c.plan].products = prods; state.products = prods;
      state.tpl = c.tpl; state.fmt = c.fmt; state.printBg = c.bg; state.useMaskImages = true;
      if (typeof state.affiches !== 'undefined') state.affiches = [];
      document.getElementById('showDates').checked = true; document.getElementById('showBrand').checked = true;
      document.getElementById('perProductDates').checked = true;
      const sh = buildSheets()[0];
      let host = document.getElementById('__maskHost');
      if (!host) { host = document.createElement('div'); host.id = '__maskHost'; host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff'; document.body.appendChild(host); }
      host.innerHTML = typeof sh === 'string' ? sh : sh.html;
      await Promise.all([...host.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 150));
      const s = host.firstElementChild.getBoundingClientRect();
      return { w: Math.round(s.width), h: Math.round(s.height) };
    }, c);
    const np = await ctx.newPage(); watch(np);
    await np.goto(base + 'etiquette.html', { waitUntil: 'load' });
    await np.waitForFunction(() => window.GefecPlan);
    let rp = null;
    if (REF) {
      rp = await ctx.newPage();
      await rp.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
      await rp.goto(base + '__ref.html', { waitUntil: 'load' });
      await rp.waitForFunction(() => typeof buildSheets === 'function');
    }
    const cmp = await ctx.newPage();
    for (const c of cases) {
      const name = `${c.plan}-${c.tpl}-${c.fmt}-${c.bg ? 'fond' : 'sans-fond'}${c.old ? '-barre' : ''}`;
      const sz = await renderCase(np, c);
      const a = await np.locator('#__maskHost > *').first().screenshot();
      ok(sz.w > 700 && sz.h > 700, `${name} : planche rendue (${sz.w}×${sz.h})`);
      if (SHOTS && (c.bg && (c.tpl === 'promo' || c.plan === 'star'))) fs.writeFileSync(path.join(SHOTS, 'masque-' + name + '.png'), a);
      if (!rp) continue;
      const sz2 = await renderCase(rp, c);
      const b = await rp.locator('#__maskHost > *').first().screenshot();
      eq(sz.w + 'x' + sz.h, sz2.w + 'x' + sz2.h, `${name} : même format que l'origine`);
      const diff = await cmp.evaluate(async ({ a, b }) => {
        const load = (s) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const W = Math.min(ia.width, ib.width), H = Math.min(ia.height, ib.height);
        const px = (im) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, W, H).data; };
        const da = px(ia), db = px(ib);
        let n = 0;
        for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) n++;
        return n / (W * H);
      }, { a: a.toString('base64'), b: b.toString('base64') });
      ok(diff < 0.002, `${name} : identique à l'origine (écart ${(diff * 100).toFixed(3)} % des pixels)`);
    }

    section('Erreurs JavaScript');
    eq(errors.length, 0, 'aucune erreur dans la console' + (errors.length ? ' : ' + errors.slice(0, 5).join(' | ') : ''));
  } catch (err) {
    fail++; failures.push('exception : ' + (err && err.stack || err));
    console.log(err);
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} vérification(s) réussie(s), ${fail} échec(s).`);
  if (fail) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
})();
