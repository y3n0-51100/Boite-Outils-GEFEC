#!/usr/bin/env node
/* Captures d'écran de la version 2 (docs/v2/captures/), utilisées par le
   rapport PDF (scripts/make-rapport-v2.js). Tout tourne en local, avec les
   jeux d'essai de tests/fixtures.js : aucun compte, aucune donnée réelle.
   La connexion Supabase est coupée ; la coque est ouverte dans le rôle voulu. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const F = require('../tests/fixtures.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'v2', 'captures');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;

  // jeux d'essai
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gefec-shots-'));
  const w = (n, b) => { const f = path.join(tmp, n); fs.writeFileSync(f, b); return f; };
  const valoEans = F.TV.map(p => p.ean).concat(F.PEM.map(p => p.ean)).concat(F.many(F.PEM, 40).slice(0, 10).map(p => p.ean));
  const fValo = w('valorisation.pdf', await F.makeValo([...new Set(valoEans)]));
  const fTv = w('PLAN PROMO TV S46.pdf', await F.VARIANTS['tv-habituel']().pdf);
  const fPemNew = w('Plan PEM nouveau format.pdf', await F.VARIANTS['pem-reformule']().pdf);
  const zip = new JSZip();
  zip.file('Plan promo PEM S46.pdf', await F.VARIANTS['pem-habituel']().pdf);
  zip.file(`Affiches/EAN_${F.PEM[3].ean}_A4.pdf`, await F.makeAffiche([F.PEM[3]], { mode: 'muet', color: '#5a1a8a', title: 'BLACK FRIDAY' }));
  zip.file('Affiches/Rowenta.pdf', await F.makeAffiche([F.PEM[0], F.PEM[1]], { mode: 'code', color: '#0a2a66', title: 'OFFRE CENTRALE' }));
  zip.file('Affiches/Planche A5.pdf', await F.makeAffiche([F.PEM[2], F.PEM[4]], { mode: 'ref', landscape: true, color: '#0b5d3b', title: 'NOËL' }));
  zip.file('Affiches/scan0001.pdf', await F.makeAffiche([F.PEM[5]], { mode: 'muet', color: '#444', title: 'OFFRE' }));
  const fZip = w('Centrale S46.zip', await zip.generateAsync({ type: 'nodebuffer' }));

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.route(/supabase\.co/, r => r.abort());
  // les notifications passagères sont masquées : elles cacheraient l'écran
  const shot = async (p, n, o) => {
    await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.classList.remove('show')));
    await p.waitForTimeout(300);
    return p.screenshot(Object.assign({ path: path.join(OUT, n + '.png') }, o || {}));
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  /* Plan Promo, seul */
  const p = await ctx.newPage();
  await p.goto(base + 'etiquette.html');
  await p.waitForFunction(() => window.GefecPlan && document.getElementById('chipBase').textContent.includes('NOSICA'));
  await shot(p, '01-plan-vide');
  await p.setInputFiles('#fileValo', fValo);
  await p.waitForFunction(() => state.storeKeys.size > 0);
  await p.setInputFiles('#filePromo', [fTv, fZip]);
  await p.waitForFunction(() => state.plans.pem.products.length > 0, null, { timeout: 60000 });
  await p.evaluate(() => { setPlan('pem'); goStep(1); });
  await p.waitForFunction(() => [...document.querySelectorAll('img[data-th]')].every(i => i.src), null, { timeout: 30000 });
  await wait(400);
  await shot(p, '02-plan-controle-affiches', { fullPage: true });
  await p.evaluate(() => goStep(2));
  await wait(300);
  await shot(p, '03-plan-produits');
  // une ligne bloquante, pour montrer le garde-fou
  await p.evaluate(() => { const x = state.products[2]; x.price = 9.5; x.flags = ['prix_suspect_bas']; x.basePrice = 199.99; x.check = 'bloquant'; x.selected = false; setFilter('check'); });
  await wait(300);
  await shot(p, '04-plan-a-corriger');
  await p.evaluate(() => { const x = state.products[2]; updProd(x.id, 'price', '199,99'); setFilter('all'); goStep(3); });
  await p.waitForFunction(() => !document.querySelector('#previewWrap .affwait'), null, { timeout: 30000 });
  await wait(500);
  await shot(p, '05-plan-apercu-a4');
  await p.evaluate(() => setFmt('a5'));
  await p.waitForFunction(() => !document.querySelector('#previewWrap .affwait'), null, { timeout: 30000 });
  await wait(500);
  await shot(p, '06-plan-apercu-a5');
  // nouveau format de PDF : lecture adaptative
  await p.evaluate(() => { setFmt('a4'); });
  await p.setInputFiles('#filePromo', [fPemNew]);
  await p.waitForFunction(() => state.plans.pem.promoFileName.includes('nouveau'), null, { timeout: 60000 });
  await p.evaluate(() => { setPlan('pem'); goStep(1); window.scrollTo(0, 0); });
  await wait(400);
  await shot(p, '07-plan-nouveau-format', { fullPage: true });
  await p.evaluate(() => GefecUI.setTheme('dark'));
  await p.evaluate(() => goStep(2));
  await wait(400);
  await shot(p, '08-plan-sombre');
  await p.evaluate(() => GefecUI.setTheme('light'));
  await p.close();

  /* Coque : connexion, accueil, outils */
  const s = await ctx.newPage();
  await s.goto(base + 'index.html');
  await wait(1200);
  await shot(s, '10-connexion');
  await s.evaluate(() => { document.getElementById('authGate').classList.add('hide'); applyUserMode({ role: 'director' }); });
  await wait(900);
  await shot(s, '11-accueil');
  for (const v of ['match', 'solde', 'sisto']) {
    await s.evaluate((v) => { window.moduleGate = null; switchView(v); }, v);
    await wait(1800);
    await shot(s, '12-outil-' + v);
  }
  await s.evaluate(() => { GefecUI.setTheme('dark'); switchView('home'); });
  await wait(800);
  await shot(s, '13-accueil-sombre');
  await s.evaluate(() => GefecUI.setTheme('light'));
  await s.close();

  /* Administrateur : contrôle d'un plan avant publication */
  const a = await ctx.newPage();
  await a.goto(base + 'index.html');
  await wait(1000);
  await a.evaluate(() => { document.getElementById('authGate').classList.add('hide'); window.GEFEC_ROLE = 'admin'; applyUserMode({ role: 'admin' }); });
  await wait(800);
  await shot(a, '20-accueil-admin');
  await a.evaluate(() => openAdminSection('docs'));
  await a.setInputFiles('#ds-file-plan-promo-pem', fZip);
  await a.waitForFunction(() => { const b = document.getElementById('ds-check-plan-promo-pem'); return b && !b.hidden && !/en cours/.test(b.textContent); }, null, { timeout: 90000 });
  await wait(300);
  await a.locator('#adminModal .gmodal-card').screenshot({ path: path.join(OUT, '21-admin-controle-zip.png') });
  await a.setInputFiles('#ds-file-plan-promo-tv', fPemNew);
  await a.waitForFunction(() => { const b = document.getElementById('ds-check-plan-promo-tv'); return b && !b.hidden && !/en cours/.test(b.textContent); }, null, { timeout: 90000 });
  await wait(300);
  await a.locator('#ds-check-plan-promo-tv').evaluate(n => n.closest('.gpromo').scrollIntoView());
  await a.locator('#ds-check-plan-promo-tv').evaluate(n => n.closest('.gpromo')).then(() => {});
  await a.locator('.gpromo:has(#ds-check-plan-promo-tv)').screenshot({ path: path.join(OUT, '22-admin-controle-mauvais-emplacement.png') });

  await browser.close();
  srv.close();
  console.log('Captures enregistrées dans ' + path.relative(ROOT, OUT));
})().catch(e => { console.error(e); process.exit(1); });
