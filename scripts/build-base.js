#!/usr/bin/env node
/*
 * Convertit la base article Excel (base.xlsx) en base-eco.js, le format
 * chargé automatiquement par l'outil Étiquettes 2.0.
 *
 * Sortie : window.BASE_ECO = { updated, count, data:{code:eco}, info:{code:[libellé,prix]} }
 * Les codes sont normalisés (zéros de tête retirés) comme dans l'outil.
 *
 * Le champ `updated` n'est mis à jour que si les données (eco/libellé/prix)
 * ont réellement changé, afin d'éviter des commits quotidiens inutiles.
 *
 * Deux sources, fusionnées :
 *   - base.xlsx      (argument 1) : éco-participations DEA + DEEE (seule source),
 *                                   libellés et prix en repli ;
 *   - products.json  (argument 4, facultatif) : libellés et prix fond de rayon
 *                                   à jour, publiés par le site sous forme JSON.
 * base-checked.js note si chaque source a été lue correctement (BASE_OK).
 */
const fs = require('fs');
const XLSX = require('xlsx');

const SRC = process.argv[2] || 'base.xlsx';
const OUT = process.argv[3] || 'base-eco.js';
const CHECKED = process.argv[4] || 'base-checked.js';
const JSON_SRC = process.argv[5] || '';

const normCode = s => String(s).replace(/^0+/, '');
function parsePrice(s) {
  if (s == null) return null;
  const m = String(s).replace(/\s/g, '').match(/(\d+)[,.€](\d{2})/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / 100;
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// DT_PHOTO : date de la photo de la base (numéro de série Excel, date ou texte)
function photoDate(v) {
  if (v == null || v === '') return null;
  let d = null;
  if (typeof v === 'number') d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
  else if (v instanceof Date) d = v;
  else {
    const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    d = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : new Date(String(v));
  }
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function parseBaseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const eco = new Map();
  const info = new Map();
  let photo = null;                      // date de photo la plus récente du classeur
  const addInfo = (code, name, price) => {
    const nm = name != null ? String(name).trim() : '';
    if (!nm && price == null) return;
    const k = normCode(code);
    const cur = info.get(k) || { name: '', price: null };
    if (nm && !cur.name) cur.name = nm.slice(0, 90);
    if (price != null && cur.price == null) cur.price = price;
    info.set(k, cur);
  };
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true });
    if (!rows.length) continue;
    let headerIdx = -1;
    const c = {};
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const idxEan = (rows[r] || []).findIndex(x => String(x ?? '').trim().toUpperCase() === 'EAN_13');
      if (idxEan >= 0) {
        headerIdx = r;
        (rows[r] || []).forEach((cell, i) => {
          const h = String(cell ?? '').trim().toUpperCase();
          if (h === 'EAN_13') c.ean = i;
          else if (h === 'DT_PHOTO') c.photo = i;
          else if (h === 'MNT_DEA_TTC') c.dea = i;
          else if (h === 'MNT_DEEE_TTC') c.deee = i;
          else if (c.price == null && h.includes('PRIX') && h.includes('VENTE')) c.price = i;
          else if (c.name == null && (h === 'LIB_PRODUIT' || h.includes('DESIGN') || h.includes('LIBELL'))) c.name = i;
        });
        break;
      }
    }
    if (c.ean != null && (c.dea != null || c.deee != null)) {
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const code = String(row[c.ean] ?? '').trim();
        if (!/^\d{8,13}$/.test(code)) continue;
        if (c.photo != null) { const p = photoDate(row[c.photo]); if (p && (!photo || p > photo)) photo = p; }
        const dea = c.dea != null ? (parseFloat(row[c.dea]) || 0) : 0;
        const deee = c.deee != null ? (parseFloat(row[c.deee]) || 0) : 0;
        const e = Math.round((dea + deee) * 100) / 100;
        if (e > 0) eco.set(normCode(code), e);
        addInfo(code, c.name != null ? row[c.name] : null, c.price != null ? parsePrice(row[c.price]) : null);
      }
      continue;
    }
    // repli heuristique
    let codeCol = -1, ecoCol = -1, priceCol = -1, nameCol = -1, hIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 20) && hIdx < 0; r++) {
      (rows[r] || []).forEach((cell, i) => {
        const s = String(cell ?? '');
        if (ecoCol < 0 && /[ée]co/i.test(s)) { ecoCol = i; hIdx = r; }
        if (priceCol < 0 && /prix.*vente/i.test(s)) priceCol = i;
        if (nameCol < 0 && /(d[ée]sign|libell|lib_produit)/i.test(s)) nameCol = i;
      });
    }
    const counts = {};
    for (let r = hIdx + 1; r < Math.min(rows.length, hIdx + 200); r++) {
      (rows[r] || []).forEach((cell, i) => {
        if (/^\d{11,13}$/.test(String(cell ?? '').trim())) counts[i] = (counts[i] || 0) + 1;
      });
    }
    codeCol = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if (codeCol === undefined || ecoCol < 0) continue;
    codeCol = +codeCol;
    for (let r = hIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const code = String(row[codeCol] ?? '').trim();
      if (!/^\d{8,13}$/.test(code)) continue;
      const e = parsePrice(row[ecoCol]);
      if (e !== null && e > 0) eco.set(normCode(code), e);
      addInfo(code, nameCol >= 0 ? row[nameCol] : null, priceCol >= 0 ? parsePrice(row[priceCol]) : null);
    }
  }
  return { eco, info, photo };
}

function buildPayload(eco, info, updated) {
  const infoData = {};
  for (const [k, v] of info) infoData[k] = [v.name || '', v.price != null ? v.price : null];
  return '/* Base article (éco-participations, libellés, prix de vente) — générée automatiquement (GitHub Actions). Ne pas éditer à la main. */\n'
    + 'window.BASE_ECO = ' + JSON.stringify({
        updated,
        count: eco.size,
        data: Object.fromEntries(eco),
        info: infoData,
      }) + ';\n';
}

// données existantes (pour ne pas bumper `updated` sans changement réel)
function readExisting() {
  try {
    const txt = fs.readFileSync(OUT, 'utf8');
    const m = txt.match(/window\.BASE_ECO\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (!m) return null;
    return JSON.parse(m[1]);
  } catch (e) { return null; }
}

const { eco, info, photo } = parseBaseWorkbook(fs.readFileSync(SRC));
if (!eco.size) {
  console.error('❌ Aucune éco-participation détectée — base inchangée.');
  process.exit(1);
}

// products.json : libellés + prix fond de rayon à jour (remplacent ceux du classeur)
let jsonOk = false;
if (JSON_SRC) {
  try {
    const list = JSON.parse(fs.readFileSync(JSON_SRC, 'utf8'));
    if (!Array.isArray(list) || list.length < 1000) throw new Error('liste de produits vide ou incomplète');
    let n = 0;
    for (const p of list) {
      const code = String(p && p.ean != null ? p.ean : '').trim();
      if (!/^\d{8,13}$/.test(code)) continue;
      const price = typeof p.prixFdr === 'number' ? p.prixFdr : parsePrice(p.prixFdr);
      const name = String(p.designation || '').trim().slice(0, 90);
      if (!name && price == null) continue;
      const k = normCode(code);
      const cur = info.get(k) || { name: '', price: null };
      info.set(k, { name: name || cur.name, price: price != null ? price : cur.price });
      n++;
    }
    if (n < 1000) throw new Error('trop peu de produits exploitables (' + n + ')');
    jsonOk = true;
    console.log(`✓ products.json : ${n} produits (libellés + prix fond de rayon).`);
  } catch (e) {
    console.log('⚠️ products.json illisible — libellés et prix du classeur conservés : ' + e.message);
  }
} else {
  console.log('⚠️ products.json absent — libellés et prix du classeur conservés.');
}

const prev = readExisting();
const now = new Date().toISOString();

// on compare le contenu utile (tout sauf `updated`)
const sameData = prev
  && JSON.stringify({ d: prev.data, i: prev.info }) ===
     JSON.stringify({ d: Object.fromEntries(eco), i: (() => { const o = {}; for (const [k, v] of info) o[k] = [v.name || '', v.price != null ? v.price : null]; return o; })() });

// Heartbeat : on enregistre la date de dernière vérification à CHAQUE passage,
// même si les données n'ont pas bougé. Fichier minuscule, prouve que le contrôle
// quotidien fonctionne. (base-eco.js, lui, n'est réécrit que sur changement réel.)
// BASE_DATA_UPDATED = date des données en vigueur : l'écran admin la relit pour
// dire si une mise à jour a apporté du nouveau, sans charger base-eco.js.
fs.writeFileSync(CHECKED,
  '/* Date de dernière vérification de la base (GitHub Actions). Généré automatiquement. */\n'
  + 'window.BASE_CHECKED = ' + JSON.stringify(now) + ';\n'
  + 'window.BASE_DATA_UPDATED = ' + JSON.stringify(sameData ? prev.updated : now) + ';\n'
  // vraie date des données : la photo de la base (colonne DT_PHOTO du classeur)
  + 'window.BASE_PHOTO = ' + JSON.stringify(photo) + ';\n'
  // état des deux sources lors de ce passage (logo OK de l'accueil)
  + 'window.BASE_OK = ' + JSON.stringify({ xlsx: true, json: jsonOk }) + ';\n');

if (sameData) {
  console.log(`✓ Données identiques (${eco.size} éco, ${info.size} libellés/prix) — base-eco.js inchangé, ${CHECKED} mis à jour.`);
  process.exit(0);
}

fs.writeFileSync(OUT, buildPayload(eco, info, now));
console.log(`✅ ${OUT} régénéré : ${eco.size} éco-participations, ${info.size} libellés/prix.`);
