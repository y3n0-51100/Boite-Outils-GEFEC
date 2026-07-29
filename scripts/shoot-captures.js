#!/usr/bin/env node
/*
 * Régénère les captures annotées du tutoriel (docs/captures/*.jpg).
 *
 *   npx playwright install chromium      # une fois
 *   python3 -m http.server 8099          # servir le dépôt
 *   node scripts/shoot-captures.js       # puis : node scripts/make-tutoriel.js
 *
 * Variables d'environnement facultatives :
 *   BASE_URL        adresse du site servi        (défaut http://127.0.0.1:8099)
 *   SISTO_PDF       SISTO d'exemple à déposer    (sinon les captures SISTO sont ignorées)
 *   CHROME_PATH     binaire Chromium à utiliser
 *   PDFJS_DIR       dossier contenant pdf.js / pdf.worker.js à servir en local,
 *                   utile quand le CDN cdnjs n'est pas joignable
 *
 * Les pastilles numérotées sont injectées dans la page avant la capture : elles
 * se positionnent sur les éléments réels, donc elles suivent la mise en page.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE  = process.env.BASE_URL || 'http://127.0.0.1:8099';
const SISTO = process.env.SISTO_PDF || '';
const OUT   = path.join(__dirname, '..', 'docs', 'captures');
fs.mkdirSync(OUT, { recursive: true });

/* Les captures visent ~1700 px de large : suffisant pour une pleine page A4. */
const DSF = w => 1700 / w;
const JPEG = { type: 'jpeg', quality: 88 };

const ORANGE = '#f97316', RED = '#e6071a', GREEN = '#15a34a', CYAN = '#0284c7', BLUE = '#3b6cf6';

async function newPage(browser, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: DSF(w) });
  if (process.env.PDFJS_DIR) {
    const lib = fs.readFileSync(path.join(process.env.PDFJS_DIR, 'pdf.js'), 'utf8');
    const wk  = fs.readFileSync(path.join(process.env.PDFJS_DIR, 'pdf.worker.js'), 'utf8');
    await page.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.route('**/cdnjs.cloudflare.com/**pdf.min.js', r => r.fulfill({ contentType: 'application/javascript', body: lib }));
    await page.route('**/cdnjs.cloudflare.com/**pdf.worker.min.js', r => r.fulfill({ contentType: 'application/javascript', body: wk }));
  }
  // Le portail Supabase n'est pas nécessaire pour illustrer les outils.
  await page.route('**/cdn.jsdelivr.net/**', r =>
    r.fulfill({ contentType: 'application/javascript', body: 'window.supabase={createClient(){throw new Error("hors-ligne")}};' }));
  return page;
}

/* marks : { sel, n, color, place:'tl'|'tr'|'in'|'c', dx, dy, box:false } */
async function annotate(scope, marks) {
  await scope.evaluate(list => {
    document.getElementById('__anno')?.remove();
    const lay = document.createElement('div');
    lay.id = '__anno';
    lay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    document.body.appendChild(lay);
    for (const m of list) {
      const el = document.querySelector(m.sel);
      if (!el) { console.warn('cible introuvable : ' + m.sel); continue; }
      const r = el.getBoundingClientRect();
      if (m.box !== false) {
        const b = document.createElement('div');
        b.style.cssText = `position:absolute;left:${r.left - 5}px;top:${r.top - 5}px;` +
          `width:${r.width + 10}px;height:${r.height + 10}px;border:3px solid ${m.color};border-radius:14px`;
        lay.appendChild(b);
      }
      let bx = r.left - 18, by = r.top - 18;
      if (m.place === 'tr') { bx = r.right - 18; by = r.top - 18; }
      if (m.place === 'in') { bx = r.right - 46; by = r.top + 10; }
      if (m.place === 'c')  { bx = r.left + r.width / 2 - 18; by = r.top - 18; }
      bx = Math.max(8, Math.min(bx + (m.dx || 0), innerWidth - 44));
      by = Math.max(8, Math.min(by + (m.dy || 0), innerHeight - 44));
      const d = document.createElement('div');
      d.textContent = m.n;
      d.style.cssText = `position:absolute;left:${bx}px;top:${by}px;width:36px;height:36px;border-radius:50%;` +
        `background:${m.color};color:#fff;font:800 19px/36px Manrope,sans-serif;text-align:center;` +
        `box-shadow:0 4px 14px rgba(0,0,0,.55),0 0 0 4px #0b0e14`;
      lay.appendChild(d);
    }
  }, marks);
  await scope.waitForTimeout(250);
}
const clearAnno = scope => scope.evaluate(() => document.getElementById('__anno')?.remove());

/* Rogne le bas d'un élément : les écrans vides laissent beaucoup de noir inutile. */
async function shootElement(page, sel, file, keep = 1, top = 0) {
  const b = await page.$eval(sel, e => { const r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  await page.screenshot(Object.assign({ path: path.join(OUT, file), clip: {
    x: b.x, y: b.y + b.height * top,
    width: b.width, height: b.height * (keep - top),
  } }, JPEG));
}

async function openShell(browser, w, h) {
  const page = await newPage(browser, w, h);
  await page.goto(SITE + '/index.html');
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    document.getElementById('authGate')?.remove();
    window.moduleGate = () => true;              // la pop-up « document partagé » exige Supabase
  });
  await page.waitForTimeout(1000);
  return page;
}

(async () => {
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

  /* ── Accueil ───────────────────────────────────────────────────── */
  let page = await openShell(browser, 1420, 1460);
  await annotate(page, [
    { sel:'#statusRibbon', n:'1', color:BLUE },
    { sel:'#homeDrop',     n:'2', color:BLUE },
    { sel:'.tools-grid',   n:'3', color:BLUE },
  ]);
  await page.screenshot(Object.assign({ path: path.join(OUT, 'accueil.jpg'),
    clip: { x:0, y:0, width:1420, height:750 } }, JPEG));   // ruban + valorisation + 1re rangée
  await clearAnno(page);
  await shootElement(page, '.valo-section', 'valorisation.jpg');   // zone valorisation seule
  await page.close();

  /* ── Affiches CETELEM ──────────────────────────────────────────── */
  page = await openShell(browser, 1420, 760);
  await page.evaluate(() => window.switchView('match'));
  await page.waitForTimeout(2600);
  let host = await page.$('.view-tool[data-view="match"] .tool-frame');
  let frame = await host.contentFrame();
  await annotate(frame, [
    { sel:'#zone2',       n:'1', color:ORANGE, dx:14 },
    { sel:'#consoleBar2', n:'2', color:ORANGE, dx:14, box:false },
    { sel:'#empty',       n:'3', color:ORANGE, place:'c', dy:-30, box:false },
  ]);
  await shootElement(page, '.view-tool[data-view="match"] .tool-frame', 'cetelem.jpg', 0.63);
  await page.close();

  /* ── Soldes Magasin ────────────────────────────────────────────── */
  page = await openShell(browser, 1420, 760);
  await page.evaluate(() => window.switchView('solde'));
  await page.waitForTimeout(2600);
  host = await page.$('.view-tool[data-view="solde"] .tool-frame');
  frame = await host.contentFrame();
  await annotate(frame, [
    { sel:'#mc-zone',     n:'1', color:GREEN, dx:14 },
    { sel:'#rg-zone',     n:'2', color:GREEN, dx:14 },
    { sel:'#btn-analyze', n:'3', color:GREEN, dx:14 },
    { sel:'#btn-pdf',     n:'4', color:GREEN, dx:-4 },
    { sel:'#btn-print',   n:'5', color:GREEN, dx:-4 },
  ]);
  await shootElement(page, '.view-tool[data-view="solde"] .tool-frame', 'soldes.jpg', 0.63);
  await page.close();

  /* ── Plans Promo TV & PEM ──────────────────────────────────────── */
  page = await newPage(browser, 1420, 920);
  await page.goto(SITE + '/etiquette.html');
  await page.waitForTimeout(3500);
  await annotate(page, [
    { sel:'#tabTv',    n:'A', color:RED, dx:10 },   // lettres : les chiffres servent aux étapes de l'outil
    { sel:'nav.steps', n:'B', color:RED, dx:10 },
  ]);
  await page.screenshot(Object.assign({ path: path.join(OUT, 'etiquette-etapes.jpg'),
    clip: { x:0, y:0, width:1420, height:270 } }, JPEG));
  await clearAnno(page);
  await shootElement(page, '#step1 .card', 'etiquette-fichiers.jpg');
  for (const n of [2, 3]) {
    await page.evaluate(k => window.goStep(k), n);
    await page.waitForTimeout(900);
    await shootElement(page, `#step${n}`, `etiquette-step${n}.jpg`);
  }
  await page.close();

  /* ── SISTO Checker ─────────────────────────────────────────────── */
  if (!SISTO || !fs.existsSync(SISTO)) {
    console.warn('⚠ SISTO_PDF non fourni — captures SISTO conservées telles quelles.');
  } else {
    page = await newPage(browser, 1500, 900);
    await page.goto(SITE + '/sisto.html');
    await page.waitForTimeout(2500);
    await page.screenshot(Object.assign({ path: path.join(OUT, 'sisto-depot.jpg'),
      clip: { x:0, y:165, width:1500, height:455 } }, JPEG));
    await page.setInputFiles('#fileSisto', SISTO);
    await page.waitForSelector('#work.on', { timeout: 30000 });
    await page.waitForTimeout(1500);

    await annotate(page, [
      { sel:'#topMeta', n:'1', color:CYAN },
      { sel:'#presets', n:'2', color:CYAN, dx:16 },
      { sel:'.side',    n:'3', color:CYAN, place:'in' },
      { sel:'#thead',   n:'4', color:CYAN, place:'tr', dx:-70, dy:22 },
      { sel:'#foot',    n:'5', color:CYAN, place:'tr', dx:-60 },
    ]);
    await page.screenshot(Object.assign({ path: path.join(OUT, 'sisto-travail.jpg') }, JPEG));
    await clearAnno(page);

    await annotate(page, [
      { sel:'#q',        n:'1', color:CYAN },
      { sel:'#btnCols',  n:'2', color:CYAN },
      { sel:'#btnSort',  n:'3', color:CYAN },
      { sel:'#btnCsv',   n:'4', color:CYAN },
      { sel:'#btnPrint', n:'5', color:CYAN },
    ]);
    await page.screenshot(Object.assign({ path: path.join(OUT, 'sisto-barre.jpg'),
      clip: { x:0, y:52, width:1500, height:120 } }, JPEG));
    await clearAnno(page);

    await page.click('[data-p="verr"]');            // exemple : références verrouillées
    await page.waitForTimeout(500);
    await page.screenshot(Object.assign({ path: path.join(OUT, 'sisto-exemple.jpg'),
      clip: { x:296, y:110, width:1204, height:480 } }, JPEG));
    await page.close();
  }

  await browser.close();
  console.log('✅ captures régénérées dans docs/captures/');
})();
