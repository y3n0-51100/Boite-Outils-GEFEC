#!/usr/bin/env node
/*
 * Tournée quotidienne de l'envoi automatique des affiches.
 * Lancée par .github/workflows/envoi-auto-affiches.yml (ou à la main :
 *   GEFEC_ROBOT_USER=… GEFEC_ROBOT_PASS=… node scripts/run-auto.js).
 *
 * 1. sert le dépôt sur un port local (les outils se chargent en relatif) ;
 * 2. ouvre auto-run.html dans Chromium sans écran (Playwright) ;
 * 3. y appelle gefecAutoRun() : connexion du compte robot, puis la tournée
 *    du jour (auto-engine.js) — exactement le moteur de l'outil admin.
 *
 * Variables :
 *   GEFEC_ROBOT_USER / GEFEC_ROBOT_PASS  compte administrateur dédié (obligatoire)
 *   GEFEC_DATE   AAAA-MM-JJ : rejoue un autre jour (facultatif)
 *   GEFEC_FORCE  1 : ignore l'heure et une tournée déjà faite (facultatif)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const USER = process.env.GEFEC_ROBOT_USER || '';
const PASS = process.env.GEFEC_ROBOT_PASS || '';
const DATE = process.env.GEFEC_DATE || '';
const FORCE = process.env.GEFEC_FORCE === '1' || process.env.GEFEC_FORCE === 'true';

function parisHour() {
  return +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(new Date());
}

// Le planificateur GitHub passe à 4 h et 5 h UTC : on ne part qu'à partir
// de 6 h, heure de Paris (heure d'hiver comme d'été).
if (!FORCE && !DATE && !process.env.GEFEC_CORRECTIF && parisHour() < 6) {
  console.log(`Il est ${parisHour()} h à Paris : la tournée part à 6 h, rien à faire maintenant.`);
  process.exit(0);
}
if (!USER || !PASS) {
  console.error('::error::Secrets manquants — définissez GEFEC_ROBOT_USER et GEFEC_ROBOT_PASS (compte administrateur dédié) dans Settings → Secrets and variables → Actions.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.xlsx': 'application/octet-stream',
};
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('introuvable'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const { chromium } = require('playwright');
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch();
  let code = 0;
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { const t = m.text(); if (t.startsWith('[tournée]')) console.log(t.slice(10)); });
    page.on('pageerror', (e) => console.log('erreur de page : ' + e.message));
    await page.goto(`http://127.0.0.1:${port}/auto-run.html`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => typeof window.gefecAutoRun === 'function' && window.GefecAuto, null, { timeout: 60000 });
    // envoi correctif ponctuel (workflow « correctif-affiches.yml ») : GEFEC_CORRECTIF = JSON { magasin: [EAN, …] }
    if (process.env.GEFEC_CORRECTIF) {
      const res = await page.evaluate((o) => window.gefecCorrectifTV(o), { user: USER, pass: PASS, targets: JSON.parse(process.env.GEFEC_CORRECTIF) });
      for (const r of res) console.log(`${r.store} : ${r.status}${r.affiches ? ` — ${r.affiches} affiche(s) à ${r.to}` : ''}${r.failed && r.failed.length ? ' — échecs : ' + r.failed.join(' · ') : ''}`);
      if (res.some(r => r.status !== 'envoye')) code = 1;
      return;
    }
    const out = await page.evaluate((o) => window.gefecAutoRun(o), { user: USER, pass: PASS, date: DATE, force: FORCE });
    if (out && out.skipped) {
      console.log('Tournée non lancée : ' + out.skipped);
    } else {
      console.log(`Tournée terminée — statut ${out.status} : ${out.storesSent} magasin(s) servi(s), ${out.affiches} affiche(s).`);
      for (const a of out.alerts || []) console.log('::warning::' + a);
    }
  } catch (e) {
    console.error('::error::' + ((e && e.message) || e));
    code = 1;
  } finally {
    await browser.close();
    srv.close();
  }
  process.exit(code);
})();
