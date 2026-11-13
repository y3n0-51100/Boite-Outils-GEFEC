/* ════════════════════════════════════════════════════════════════
   GEFEC — LECTEUR DE PLAN PROMO (TV / PEM)
   ────────────────────────────────────────────────────────────────
   Le PDF envoyé chaque semaine par la centrale n'a pas une mise en page
   garantie : colonnes ajoutées, retirées ou déplacées, intitulés reformulés,
   en-tête répété ou non d'une page à l'autre, dates écrites autrement…
   Ce module lit donc le plan DEUX FOIS, par deux méthodes indépendantes :

     · le lecteur « historique » — celui qui tourne depuis l'origine, calé au
       point près sur le format habituel (ancres X des intitulés d'en-tête) ;
     · le lecteur « adaptatif » — qui reconnaît les colonnes à leur intitulé
       (synonymes compris), où qu'elles soient, et délimite chaque colonne
       d'après la position réelle des données, pas d'après une mise en page
       supposée.

   Le meilleur des deux sert de lecture principale, l'autre de contre-lecture :
   une valeur manquante est complétée, un prix sur lequel les deux lectures
   divergent est SIGNALÉ. Chaque prix est enfin confronté au prix de vente de
   la base NOSICA : un « prix promo » à 42 € sur un produit vendu 899 € est
   presque toujours une autre colonne (avoir fournisseur) lue par erreur.

   Règle d'or, inchangée : on n'imprime JAMAIS un montant douteux. Un prix
   illisible reste vide ; un prix incohérent est marqué « à vérifier » et
   n'est pas envoyé automatiquement.

   Sans dépendance : utilisable dans le navigateur (window.GefecPlan) comme
   sous Node (tests : node tests/run.js).
   ════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GefecPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────
     Utilitaires
     ────────────────────────────────────────────────────────────── */
  function stripAccents(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  const up = (s) => stripAccents(s).toUpperCase().replace(/\s+/g, ' ').trim();
  /* Les codes du plan promo perdent leurs zéros de tête (11120271638), la
     valorisation les garde (0011120271638) : on croise sur la forme normalisée. */
  function normCode(s) { return String(s).replace(/\D/g, '').replace(/^0+/, ''); }
  function padCode(s) { return String(s).replace(/\D/g, '').padStart(13, '0'); }
  /* Clé de contrôle EAN-13 (les codes internes BUT 00111… la respectent aussi) */
  function eanValid(code) {
    const s = padCode(code);
    if (!/^\d{13}$/.test(s) || /^0{13}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (+s[i]) * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === +s[12];
  }

  /* Montant -> nombre. Accepte « 1 699,99 € », « 1.699,99 », « 1699.99 »,
     « 749€99 », « 749,- », « 749 € », 749 ; rejette tout texte qui n'est pas
     QUE un montant (un commentaire contenant un prix n'est pas un prix). */
  function parsePrice(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
    let s = String(v).replace(/[\s   ]/g, '').replace(/(TTC|EUR|EUROS?)$/i, '');
    if (!s) return null;
    let m = s.match(/^(\d+)€(\d{2})$/);                       // 749€99
    if (m) return +m[1] + (+m[2]) / 100;
    s = s.replace(/€/g, '');
    m = s.match(/^(\d+)[,.][-–—]{1,2}$/);                     // 749,-
    if (m) return +m[1];
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // 1.699,99
    else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');                 // 1,699.99
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');                                  // 749,99
    else if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  /* Référence affichée : retire les préfixes de famille (ASPITRA, EXPRESS,
     ASPIBAL, MACHDOS…) — mots purement alphabétiques placés AVANT le vrai
     code modèle, lequel contient toujours au moins un chiffre (RO2611EA). */
  function cleanRef(refs) {
    const s = String(refs || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const tokens = s.split(' ');
    const i = tokens.findIndex(t => /\d/.test(t));
    if (i <= 0) return s;
    const rest = tokens.slice(i);
    if (rest.every(t => /^\d+$/.test(t))) return s;
    return rest.join(' ');
  }

  /* ──────────────────────────────────────────────────────────────
     Dates
     ────────────────────────────────────────────────────────────── */
  const MONTHS = {
    janvier: 1, janv: 1, jan: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5,
    juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, sep: 9, octobre: 10, oct: 10,
    novembre: 11, nov: 11, decembre: 12, dec: 12,
  };
  const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  const pad2 = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
  function validDMY(d, m, y) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    if (y != null) {
      if (!(y >= 2000 && y <= 2100)) return false;
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }
    return true;
  }
  const fullYear = (y) => (y == null ? null : (y < 100 ? 2000 + y : y));
  /* Deux dates (jour, mois, année facultative) -> période ISO. L'année
     manquante est déduite de l'autre date, sinon de l'année de référence ;
     une fin dont le mois précède celui du début bascule sur l'année suivante. */
  function resolveRange(a, b, refYear) {
    let ya = fullYear(a.y), yb = fullYear(b.y);
    if (ya == null && yb == null) { ya = refYear; yb = (b.m < a.m) ? refYear + 1 : refYear; }
    else if (ya == null) ya = (a.m > b.m) ? yb - 1 : yb;
    else if (yb == null) yb = (b.m < a.m) ? ya + 1 : ya;
    if (!validDMY(a.d, a.m, ya) || !validDMY(b.d, b.m, yb)) return null;
    const from = iso(ya, a.m, a.d), to = iso(yb, b.m, b.d);
    if (from > to) return null;
    return { from, to };
  }
  const D_NUM = '(\\d{1,2})\\s*[\\/.]\\s*(\\d{1,2})(?:\\s*[\\/.]\\s*(\\d{4}|\\d{2}))?';
  const D_DASH = '(\\d{1,2})-(\\d{1,2})-(\\d{4})';
  const RE_NUM_STRICT = new RegExp('(?<![\\d,.])(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?\\s*(?:au|a|-|–|—|>|→)\\s*(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?(?![\\d\\/])', 'i');
  const RE_NUM_LOOSE = new RegExp('(?<![\\d,.])' + D_NUM + '\\s*(?:au|a|-|–|—|>|→|jusqu.?au)?\\s*' + D_NUM + '(?![\\d])', 'i');
  const RE_DASH = new RegExp('(?<!\\d)' + D_DASH + '\\s*(?:au|a|–|—|>|→)?\\s*' + D_DASH + '(?!\\d)', 'i');
  const RE_TXT = new RegExp('(\\d{1,2})(?:er)?\\s*(' + MONTH_ALT + ')?\\.?\\s*(\\d{4})?\\s*(?:au|-|–|—)\\s*(?:\\w+\\s+)?(\\d{1,2})(?:er)?\\s*(' + MONTH_ALT + ')\\.?\\s*(\\d{4})?', 'i');
  const RE_UNTIL = new RegExp('jusqu.?(?:au|a)\\s*(?:\\w+\\s+)?(?:' + D_NUM + '|(\\d{1,2})(?:er)?\\s*(' + MONTH_ALT + ')\\.?\\s*(\\d{4})?)', 'i');

  /* Période de validité lue dans un texte. strict = le texte est une ligne
     entière (on exige alors « JJ/MM[/AAAA] au JJ/MM[/AAAA] », sans quoi un
     prix « 12.10 » passerait pour un 12 octobre) ; sinon le texte vient de la
     colonne des dates et toutes les écritures sont admises. */
  function parseDateRange(text, o) {
    o = o || {};
    const refYear = o.refYear || new Date().getFullYear();
    const t = stripAccents(String(text || '')).toLowerCase().replace(/\s+/g, ' ');
    if (!t) return null;
    let m = t.match(o.strict ? RE_NUM_STRICT : RE_NUM_LOOSE);
    if (m) {
      const r = resolveRange({ d: +m[1], m: +m[2], y: m[3] ? +m[3] : null }, { d: +m[4], m: +m[5], y: m[6] ? +m[6] : null }, refYear);
      if (r) return r;
    }
    m = t.match(RE_DASH);
    if (m) {
      const r = resolveRange({ d: +m[1], m: +m[2], y: +m[3] }, { d: +m[4], m: +m[5], y: +m[6] }, refYear);
      if (r) return r;
    }
    m = t.match(RE_TXT);
    if (m) {
      const mb = MONTHS[m[5]];
      const ma = m[2] ? MONTHS[m[2]] : mb;
      const r = resolveRange({ d: +m[1], m: ma, y: m[3] ? +m[3] : null }, { d: +m[4], m: mb, y: m[6] ? +m[6] : null }, refYear);
      if (r) return r;
    }
    if (!o.strict) {
      m = t.match(RE_UNTIL);
      if (m) {
        const d = m[1] ? +m[1] : +m[4], mo = m[1] ? +m[2] : MONTHS[m[5]];
        const y = fullYear(m[1] ? (m[3] ? +m[3] : null) : (m[6] ? +m[6] : null)) || refYear;
        if (validDMY(d, mo, y)) return { from: null, to: iso(y, mo, d) };
      }
    }
    return null;
  }
  /* Une seule date (colonnes « début » / « fin » séparées) */
  function parseOneDate(text, refYear) {
    const t = stripAccents(String(text || '')).toLowerCase();
    let m = t.match(new RegExp('(?<![\\d,.])' + D_NUM + '(?!\\d)'));
    if (m) return { d: +m[1], m: +m[2], y: m[3] ? +m[3] : null };
    m = t.match(new RegExp('(\\d{1,2})(?:er)?\\s*(' + MONTH_ALT + ')\\.?\\s*(\\d{4})?'));
    if (m) return { d: +m[1], m: MONTHS[m[2]], y: m[3] ? +m[3] : null };
    return null;
  }

  /* ──────────────────────────────────────────────────────────────
     Lignes du PDF
     ──────────────────────────────────────────────────────────────
     items : [{ x, y, w, h, s }] — y croît vers le BAS (repère de l'écran).
     Regroupement par proximité verticale (et non par arrondi) : deux mots
     d'une même ligne ne sont plus séparés parce qu'ils tombent de part et
     d'autre d'un palier d'arrondi. */
  function rowsFromItems(items, tol) {
    tol = tol || 3;
    const out = [];
    const sorted = items.filter(i => i && i.s && String(i.s).trim()).slice().sort((a, b) => a.y - b.y || a.x - b.x);
    let cur = null;
    for (const it of sorted) {
      if (cur && Math.abs(it.y - cur.y) <= tol) {
        cur.items.push(it);
        cur.sum += it.y; cur.y = cur.sum / cur.items.length;
      } else {
        cur = { y: it.y, sum: it.y, items: [it] };
        out.push(cur);
      }
    }
    return out.map(r => ({ y: r.y, items: r.items.sort((a, b) => a.x - b.x) }));
  }
  /* Un item contenant de grands blancs (« SAMSUNG     QE55Q60D ») réunit en
     réalité plusieurs cellules : on le redécoupe, x réparti au prorata. */
  function splitWideItem(it) {
    const s = String(it.s);
    if (!/\S\s{3,}\S/.test(s) || !(it.w > 0)) return [it];
    const out = [];
    const unit = it.w / s.length;
    const re = /\S+(?:\s{1,2}\S+)*/g;
    let m;
    while ((m = re.exec(s))) out.push({ x: it.x + m.index * unit, y: it.y, w: m[0].length * unit, h: it.h, s: m[0] });
    return out.length ? out : [it];
  }
  /* PDF -> lignes positionnées, page par page. Les coordonnées passent par
     la matrice de la page : une page pivotée (/Rotate 90) se lit comme elle
     s'affiche. pdfjs : la bibliothèque pdf.js ; data : ArrayBuffer/Uint8Array.
     -> { pages:[[{y, items:[{x,y,w,h,s}]}]], sizes:[{w,h}], texts:[…] }      */
  async function extractRows(pdfjs, data, o) {
    o = o || {};
    const pdf = await pdfjs.getDocument(Object.assign({ data, useSystemFonts: true }, o.docOptions || {})).promise;
    const pages = [], sizes = [], texts = [];
    const max = Math.min(pdf.numPages, o.maxPages || 400);
    for (let p = 1; p <= max; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = [];
      for (const it of content.items) {
        if (!it.str || !it.str.trim()) continue;
        const t = pdfjs.Util.transform(vp.transform, it.transform);
        const h = it.height || Math.hypot(t[2], t[3]) || 8;
        const base = { x: t[4], y: t[5], w: it.width || 0, h, s: it.str.trim() };
        for (const part of splitWideItem(base)) items.push(part);
      }
      pages.push(rowsFromItems(items, o.tol || 3));
      sizes.push({ w: vp.width, h: vp.height });
      texts.push(items.map(i => i.s).join(' '));
      if (page.cleanup) page.cleanup();
    }
    const numPages = pdf.numPages;
    try { await pdf.destroy(); } catch (e) {}
    return { pages, sizes, texts, numPages };
  }
  const rowText = (row) => row.items.map(i => i.s).join(' ');
  const itemW = (it) => (it.w > 0 ? it.w : Math.max(4, String(it.s).length * 4.4));
  const itemCx = (it) => it.x + itemW(it) / 2;

  const CODE_ITEM_RE = /^\d{11,13}$/;
  const CODE_IN_RE = /(?<![\d,.\/])\d{11,13}(?![\d,.\/])/;
  /* code EAN d'une ligne : un item qui n'est QUE le code, sinon un code
     isolé à l'intérieur d'un item (« 8806095563237 SAMSUNG ») */
  function rowCode(row) {
    for (const it of row.items) if (CODE_ITEM_RE.test(it.s)) return { item: it, code: it.s };
    for (const it of row.items) {
      const m = String(it.s).match(CODE_IN_RE);
      if (m) return { item: it, code: m[0] };
    }
    return null;
  }
  const PRICE_ITEM_RE = /^\d{1,3}(?:[\s  ]\d{3})*,\d{2}(?:\s*€)?$/;       // lecteur historique
  const PRICE_ANY_RE = /^(?:\d{1,3}(?:[\s  .]\d{3})+|\d+)(?:[,.]\d{1,2})?\s*€?$|^\d+€\d{2}$|^\d+,[-–]$/;
  const DATES_RE = /(\d{2}\/\d{2}\/\d{4})\s*au\s*(\d{2}\/\d{2}\/\d{4})/;
  const frToIso = (s) => { const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

  /* ──────────────────────────────────────────────────────────────
     Type de plan : TV ou PEM
     ────────────────────────────────────────────────────────────── */
  const TV_WORDS = /\b(TV|TELEVISEURS?|OLED|QLED|NEO ?QLED|MINI ?LED|UHD|4K|8K|FULL ?HD|BARRE DE SON|HOME CINEMA)\b/;
  const PEM_WORDS = /\b(PEM|ASPIRATEUR|EXPRESSO|CAFETIERE|FRITEUSE|ROBOT|BLENDER|GRILLE[- ]PAIN|BOUILLOIRE|FER|CENTRALE VAPEUR|MICRO[- ]ONDES?|RASOIR|EPILATEUR|SECHE[- ]CHEVEUX|MULTICUISEUR|PETIT ELECTROMENAGER)\b/;
  function pageType(rows) {
    for (const row of rows.slice(0, 14)) {
      const t = up(rowText(row));
      if (/PLAN\s*(D.ACTION\s*)?PROMO\w*\s*(TV|TELE|IMAGE|BRUN)/.test(t) || /\bPROMO\w*\s+TV\b/.test(t)) return 'tv';
      if (/PLAN\s*(D.ACTION\s*)?PROMO\w*\s*(PEM|PETIT)/.test(t) || /\bPROMO\w*\s+PEM\b/.test(t)) return 'pem';
    }
    return null;
  }
  function detectPlanType(pages, fileName) {
    for (const rows of pages) { const t = pageType(rows); if (t) return { type: t, by: 'titre' }; }
    const fn = up(String(fileName || '').replace(/[_\-.]+/g, ' '));
    if (/\b(TV|TELE|TELEVISEURS?|IMAGE|BRUN)\b/.test(fn) && !/\bPEM\b/.test(fn)) return { type: 'tv', by: 'nom du fichier' };
    if (/\b(PEM|PETIT ELECTRO\w*)\b/.test(fn)) return { type: 'pem', by: 'nom du fichier' };
    let techno = false, categorie = false, tv = 0, pem = 0;
    for (const rows of pages) {
      rows.forEach((row, i) => {
        const t = up(rowText(row));
        if (i < 14) { if (t.includes('TECHNO')) techno = true; if (t.includes('CATEGORIE')) categorie = true; }
        if (!rowCode(row)) return;
        if (TV_WORDS.test(t)) tv++;
        if (PEM_WORDS.test(t)) pem++;
      });
    }
    if (techno !== categorie) return { type: techno ? 'tv' : 'pem', by: 'en-tête' };
    if (tv || pem) return tv === pem ? { type: null, by: null } : { type: tv > pem ? 'tv' : 'pem', by: 'contenu' };
    return { type: null, by: null };
  }

  /* ──────────────────────────────────────────────────────────────
     LECTEUR HISTORIQUE — repris tel quel de l'outil d'origine
     ──────────────────────────────────────────────────────────────
     Tableau à colonnes [DATE D'ENVOI] | CATEGORIE / TECHNO | MARQUE |
     REFERENCES | EAN | GAMME | Prix de cession HT | taux de marge |
     PRIX PROMO | AVOIR HT MAGASIN A RECEVOIR | DATES | …
     ⚠️ Le prix imprimé est celui de la colonne « PRIX PROMO », JAMAIS le
     « Prix de cession HT » ni l'« AVOIR HT MAGASIN A RECEVOIR ». */
  function readLegacy(pages) {
    const products = [];
    const seen = new Set();
    let cols = null, headerPages = 0;
    pages.forEach((rows, pageIdx) => {
      for (let hi = 0; hi < rows.length; hi++) {
        const t = rowText(rows[hi]).toUpperCase();
        if (t.includes('EAN') && t.includes('MARQUE')) {
          const band = [...rows[hi].items];
          for (const j of [hi - 3, hi - 2, hi - 1, hi + 1, hi + 2, hi + 3]) {
            if (j < 0 || j >= rows.length) continue;
            const rt = rowText(rows[j]);
            if (/\d{6,}/.test(rt)) continue;
            if (rows[j].items.some(i => PRICE_ITEM_RE.test(i.s))) continue;
            if (!/[A-Za-zÀ-ÿ]/.test(rt)) continue;
            band.push(...rows[j].items);
          }
          const eanIt = rows[hi].items.find(i => i.s.toUpperCase() === 'EAN');
          const eanX = eanIt ? eanIt.x : -Infinity;
          const min = (cur, x) => Math.min(cur == null ? Infinity : cur, x);
          cols = {};
          for (const it of band) {
            const s = it.s.toUpperCase();
            if (s.includes('ENVOI')) cols.envoi = min(cols.envoi, it.x);
            else if (s.includes('CATEGORIE') || s.includes('TECHNO')) cols.cat = min(cols.cat, it.x);
            else if (s.includes('MARQUE') && it.x < eanX) cols.marque = min(cols.marque, it.x);
            else if (s.includes('REFERENCE') && it.x < eanX) cols.ref = min(cols.ref, it.x);
            else if (s === 'EAN') cols.ean = it.x;
            else if (s.includes('CESSION') && it.x > eanX) cols.cession = min(cols.cession, it.x);
            else if (s.includes('PROMO') && !s.includes('PLAN') && it.x > eanX) cols.promo = min(cols.promo, it.x);
            else if ((s.includes('AVOIR') || s.includes('RECEVOIR')) && it.x > eanX) cols.avoir = min(cols.avoir, it.x);
            else if (s.includes('DATES') && it.x > eanX) cols.dates = min(cols.dates, it.x);
          }
          headerPages++;
          break;
        }
      }
      let b = null;
      if (cols && cols.marque != null && cols.ref != null && cols.ean != null) {
        b = {
          catStart: cols.envoi != null && cols.cat != null ? (cols.envoi + cols.cat) / 2 : -Infinity,
          catEnd: ((cols.cat != null ? cols.cat : cols.marque - 120) + cols.marque) / 2,
          marqueEnd: Math.min((cols.marque + cols.ref) / 2, cols.marque + 30),
          refEnd: (cols.ref + cols.ean) / 2,
        };
      }
      const promoPrice = (row) => {
        if (!cols || cols.promo == null) return null;
        const leftLimit = cols.cession != null ? (cols.cession + cols.promo) / 2 : cols.promo - 45;
        const rightLimit = cols.avoir != null ? (cols.promo + cols.avoir) / 2 : cols.promo + 45;
        let best = null, bestD = Infinity;
        for (const i of row.items) {
          if (!PRICE_ITEM_RE.test(i.s)) continue;
          if (i.x <= leftLimit || i.x >= rightLimit) continue;
          const d = Math.abs(i.x - cols.promo);
          if (d < bestD) { bestD = d; best = i; }
        }
        return best ? parsePrice(best.s) : null;
      };
      const extractFields = (row) => {
        const f = { cat: '', brand: '', refs: '', price: null };
        if (!b) return f;
        const it = row.items;
        f.cat = it.filter(i => !CODE_ITEM_RE.test(i.s) && i.x >= b.catStart && i.x < b.catEnd && /[A-Za-zÀ-ÿ]/.test(i.s)).map(i => i.s).join(' ').trim();
        f.brand = it.filter(i => i.x >= b.catEnd && i.x < b.marqueEnd && /[A-Za-zÀ-ÿ]/.test(i.s)).map(i => i.s).join(' ').trim();
        f.refs = it.filter(i => !CODE_ITEM_RE.test(i.s) && i.x >= b.marqueEnd && i.x < b.refEnd).map(i => i.s).join(' ').trim();
        f.price = promoPrice(row);
        return f;
      };
      const rowHasCode = rows.map(row => row.items.some(i => CODE_ITEM_RE.test(i.s)));
      const recs = [];
      rows.forEach((row, i) => {
        if (!rowHasCode[i]) return;
        const orphans = [];
        if (i > 0 && !rowHasCode[i - 1]) orphans.push(rows[i - 1]);
        if (i + 1 < rows.length && !rowHasCode[i + 1]) orphans.push(rows[i + 1]);
        recs.push({ row, orphans });
      });
      for (const rec of recs) {
        const codeItem = rec.row.items.find(i => CODE_ITEM_RE.test(i.s));
        const key = normCode(codeItem.s);
        const f = extractFields(rec.row);
        for (const o of rec.orphans) {
          const of = extractFields(o);
          if (!f.cat) f.cat = of.cat;
          if (!f.brand) f.brand = of.brand;
          if (!f.refs) f.refs = of.refs;
          if (f.price == null) f.price = of.price;
        }
        const cat = (f.cat || '').replace(/\s+/g, ' ').trim();
        let name = cleanRef(f.refs);
        const full = [rowText(rec.row), ...rec.orphans.map(rowText)].join(' ');
        if (!name) {
          name = full.split(codeItem.s)[0]
            .replace(/\d{1,5},\d{2}\s*€?/g, '').replace(/-?\d+,\d+%/g, '')
            .replace(/\s+/g, ' ').trim().slice(0, 80);
        }
        const dm = full.match(DATES_RE);
        const from = dm ? frToIso(dm[1]) : null;
        const to = dm ? frToIso(dm[2]) : null;
        const dedup = key + '|' + from + '|' + to;
        if (seen.has(dedup)) continue;
        seen.add(dedup);
        products.push({
          key, ean: padCode(codeItem.s), name: name.slice(0, 90), cat: cat.slice(0, 60),
          brand: f.brand, price: f.price, oldPrice: null, from, to, page: pageIdx + 1, rawRef: f.refs || '',
        });
      }
      if (!recs.length) {
        for (const row of rows) {
          for (const it of row.items) {
            if (!CODE_ITEM_RE.test(it.s)) continue;
            const k = normCode(it.s);
            if ([...seen].some(s => s.startsWith(k + '|'))) continue;
            seen.add(k + '|null|null');
            products.push({ key: k, ean: padCode(it.s), name: rowText(row).replace(it.s, '').trim().slice(0, 90), cat: '', brand: '', price: null, oldPrice: null, from: null, to: null, page: pageIdx + 1 });
          }
        }
      }
    });
    return { products, headerPages, cols };
  }

  /* ──────────────────────────────────────────────────────────────
     LECTEUR ADAPTATIF
     ────────────────────────────────────────────────────────────── */
  /* Rôle d'une colonne d'après son intitulé (accents et casse ignorés).
     L'ordre des tests compte : « Prix de cession HT » n'est pas le prix
     promo, « DATE D'ENVOI » n'est pas la période de validité. */
  function classifyHeader(label) {
    const L = up(label);
    if (!L || L.length > 70) return null;
    if (/\bENVOI\b|\bEDITION\b|\bMAJ\b|MISE A JOUR/.test(L)) return { field: 'envoi', w: 3 };
    if (/\bEAN\b|GENCOD|CODE\W*BARRES?/.test(L)) return { field: 'ean', w: 3 };
    if (/ECO\W*(PART|MOB|CONTRIB)|\bDEEE\b|\bD3E\b|\bDEA\b/.test(L)) return { field: 'eco', w: 2 };
    if (/AVOIR|RECEVOIR|REMISE\s*ARR|SUBVENTION|\bRFA\b|\bODR\b|REMBOURS|COMPENSATION|PARTICIPATION/.test(L)) return { field: 'avoir', w: 3 };
    if (/CESSION|\bACHAT\b|\bPA\b|\bPAHT\b|\bPRI\b|REVIENT/.test(L)) return { field: 'cession', w: 3 };
    if (/MARGE|\bTAUX\b|\bTX\b|\bCOEF/.test(L)) return { field: 'marge', w: 3 };
    if (/STOCK|\bQTE\b|QUANTITE|\bVOLUME\b|\bCA\b/.test(L)) return { field: 'autre', w: 1 };
    const pricey = /PRIX|\bPV[CP]?\b|\bPVTTC\b|TARIF|\bTTC\b/.test(L);
    if (pricey && /BARRE|ANCIEN|FOND\s*DE\s*RAYON|\bFDR\b|INITIAL|\bAVANT\b|HABITUEL|NORMAL|REFERENCE|HORS\s*PROMO|CONSTATE|\bBASE\b/.test(L)) return { field: 'old', w: 3 };
    if (/\bHT\b/.test(L) && pricey) return { field: 'cession', w: 2 };
    if (/PROMO|BON\s*PLAN|\bOFFRE\b/.test(L) && !/\bPLAN\s*PROMO|\bPLAN\s*D.ACTION/.test(L) && (pricey || /^(PROMO|PRIX)/.test(L) || /PROMO$/.test(L))) return { field: 'promo', w: 3 };
    if (pricey && /VENTE|PUBLIC|CLIENT|MAGASIN|CONSEILLE|\bNET\b|\bTTC\b|\bPV[CP]?\b|\bPVTTC\b/.test(L)) return { field: 'promo', w: 2 };
    if (/^PRIX$|^TARIF$/.test(L)) return { field: 'promo', w: 1 };
    if (/REMISE|REDUCTION|ECONOMIE|\bECART\b|%/.test(L)) return { field: 'autre', w: 1 };
    if (/\bDEBUT\b|\bDU\b$|^DU\b|DATE\s*DE\s*DEBUT|\bDEPART\b/.test(L) && !/\bAU\b/.test(L)) return { field: 'from', w: 2 };
    if (/\bFIN\b|^AU\b|DATE\s*DE\s*FIN/.test(L) && !/\bDU\b/.test(L)) return { field: 'to', w: 2 };
    if (/\bDATES?\b|PERIODE|VALIDITE|VALABLE|\bDUREE\b|OPERATION/.test(L)) return { field: 'dates', w: 2 };
    if (/CATEGORIE|TECHNO|FAMILLE|\bTYPE\b|RAYON|UNIVERS|SEGMENT|\bNATURE\b/.test(L)) return { field: 'cat', w: 2 };
    if (/MARQUE|FABRICANT/.test(L)) return { field: 'brand', w: 3 };
    if (/REFERENCE|\bREFS?\b|MODELE|DESIGNATION|LIBELLE|\bPRODUITS?\b|\bARTICLES?\b|DESCRIPTION/.test(L)) return { field: 'ref', w: 2 };
    if (/FOURNISSEUR/.test(L)) return { field: 'fourn', w: 1 };
    if (/GAMME|MEDIA|COMMENTAIRE|REMARQUE|OBSERVATION/.test(L)) return { field: 'autre', w: 1 };
    return null;
  }
  const HEADER_WORD = /\bEAN\b|GENCOD|MARQUE|REFERENCE|\bREFS?\b|MODELE|DESIGNATION|LIBELLE|CATEGORIE|TECHNO|FAMILLE|PRIX|\bPV[CP]?\b|PROMO|\bDATES?\b|PERIODE|VALIDITE|GAMME|CESSION|MARGE|AVOIR/g;

  /* Bande d'en-tête d'une page : la ligne qui réunit le plus d'intitulés
     connus, plus les lignes de libellés qui la touchent (intitulés éclatés
     sur 2-3 lignes : « PRIX » / « PROMO », « AVOIR HT » / « MAGASIN A »…). */
  function findHeaderBand(rows) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rowCode(rows[i])) continue;
      if (rows[i].items.some(it => PRICE_ITEM_RE.test(it.s))) continue;
      const t = up(rowText(rows[i]));
      const hits = new Set(t.match(HEADER_WORD) || []);
      let score = hits.size;
      if (/\bEAN\b|GENCOD/.test(t)) score += 1.5;
      if (/PLAN\s*PROMO|PLAN\s*D.ACTION\s*PROMO/.test(t) && hits.size < 3) continue;   // titre du document
      if (score >= 2.5 && score > bestScore) { best = i; bestScore = score; }
    }
    if (best < 0) return null;
    const hgt = (r) => Math.max(...r.items.map(i => i.h || 0), 7);
    const band = [best];
    const okRow = (r) => {
      if (rowCode(r)) return false;
      const rt = rowText(r);
      if (/\d{6,}/.test(rt)) return false;
      if (r.items.some(i => PRICE_ITEM_RE.test(i.s))) return false;
      if (!/[A-Za-zÀ-ÿ]/.test(rt)) return false;
      if (/PLAN\s*PROMO|PLAN\s*D.ACTION\s*PROMO|\bSEMAINE\b|\bPAGE\b/.test(up(rt)) && !/ENVOI/.test(up(rt))) return false;
      return true;
    };
    for (const dir of [-1, 1]) {
      let prev = best;
      for (let k = 1; k <= 3; k++) {
        const j = best + dir * k;
        if (j < 0 || j >= rows.length || !okRow(rows[j])) break;
        if (Math.abs(rows[j].y - rows[prev].y) > Math.max(hgt(rows[j]), hgt(rows[prev])) * 2.1 + 2) break;
        band.push(j); prev = j;
      }
    }
    return { anchor: best, rows: band.sort((a, b) => a - b) };
  }

  /* Intitulés de la bande -> colonnes { field, label, x0, x1, cx }.
     Les fragments empilés au même endroit forment un seul intitulé. */
  function headerColumns(rows, band) {
    const items = [];
    for (const j of band.rows) for (const it of rows[j].items) items.push({ x0: it.x, x1: it.x + itemW(it), y: rows[j].y, s: String(it.s) });
    items.sort((a, b) => a.x0 - b.x0);
    const groups = [];
    for (const it of items) {
      let g = null;
      for (const cand of groups) {
        const ov = Math.min(cand.x1, it.x1) - Math.max(cand.x0, it.x0);
        const narrow = Math.min(cand.x1 - cand.x0, it.x1 - it.x0);
        const sameRow = cand.parts.some(p => Math.abs(p.y - it.y) < 2);
        if (!sameRow && (ov > narrow * 0.3 || Math.abs((cand.x0 + cand.x1) / 2 - (it.x0 + it.x1) / 2) < 10)) { g = cand; break; }
      }
      if (g) { g.parts.push(it); g.x0 = Math.min(g.x0, it.x0); g.x1 = Math.max(g.x1, it.x1); }
      else groups.push({ x0: it.x0, x1: it.x1, parts: [it] });
    }
    const cols = [];
    for (const g of groups) {
      const label = g.parts.slice().sort((a, b) => a.y - b.y || a.x0 - b.x0).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim();
      const c = classifyHeader(label);
      cols.push({ field: c ? c.field : null, w: c ? c.w : 0, label, x0: g.x0, x1: g.x1, cx: (g.x0 + g.x1) / 2 });
    }
    // un rôle = une colonne : en cas de doublon, l'intitulé le plus explicite l'emporte
    const byField = {};
    for (const c of cols) {
      if (!c.field || c.field === 'autre') continue;
      const cur = byField[c.field];
      if (!cur || c.w > cur.w) { if (cur) cur.field = 'autre'; byField[c.field] = c; }
      else c.field = 'autre';
    }
    return cols.sort((a, b) => a.x0 - b.x0);
  }

  /* Zones de colonnes : on projette les données sur l'axe horizontal ; les
     bandes jamais couvertes sont les gouttières entre colonnes. Chaque
     paquet de données est rattaché à l'intitulé qui le surplombe. */
  function buildZones(cols, dataRows) {
    const ev = [];
    let n = 0;
    for (const r of dataRows) {
      n++;
      for (const it of r.items) { const a = it.x, b = it.x + itemW(it); ev.push([a, 1], [b, -1]); }
    }
    if (!ev.length) return [];
    ev.sort((p, q) => p[0] - q[0] || q[1] - p[1]);
    const thresh = Math.floor(n * 0.03);
    const clusters = [];
    let depth = 0, start = null;
    for (const [x, d] of ev) {
      const before = depth; depth += d;
      if (before <= thresh && depth > thresh) start = x;
      else if (before > thresh && depth <= thresh && start != null) {
        const last = clusters[clusters.length - 1];
        if (last && start - last[1] < 1.2) last[1] = x; else clusters.push([start, x]);
        start = null;
      }
    }
    const zones = [];
    const used = new Set();
    for (const c of clusters) {
      const inside = cols.filter(h => (h.cx >= c[0] - 3 && h.cx <= c[1] + 3)
        || (Math.min(h.x1, c[1]) - Math.max(h.x0, c[0])) > (h.x1 - h.x0) * 0.5);
      if (!inside.length) { zones.push({ field: null, x0: c[0], x1: c[1] }); continue; }
      inside.sort((a, b) => a.cx - b.cx);
      let left = c[0];
      inside.forEach((h, i) => {
        const right = i + 1 < inside.length ? (h.x1 + inside[i + 1].x0) / 2 : c[1];
        zones.push({ field: h.field, label: h.label, x0: left, x1: right, col: h });
        used.add(h); left = right;
      });
    }
    // intitulé sans données dessous (texte calé à l'opposé dans une colonne
    // large) : il reprend le paquet anonyme le plus proche
    for (const h of cols) {
      if (used.has(h) || !h.field) continue;
      let best = null, bestD = 70;
      for (const z of zones) {
        if (z.field) continue;
        const d = h.cx < z.x0 ? z.x0 - h.x1 : (h.cx > z.x1 ? h.x0 - z.x1 : 0);
        if (d < bestD) { bestD = d; best = z; }
      }
      if (best) { best.field = h.field; best.label = h.label; best.col = h; used.add(h); }
    }
    return zones.sort((a, b) => a.x0 - b.x0);
  }
  function zoneOf(zones, it) {
    const cx = itemCx(it);
    for (const z of zones) if (cx >= z.x0 - 0.5 && cx <= z.x1 + 0.5) return z;
    let best = null, bestD = 14;
    for (const z of zones) { const d = cx < z.x0 ? z.x0 - cx : cx - z.x1; if (d < bestD) { bestD = d; best = z; } }
    return best;
  }

  /* Colonne « prix promo » introuvable à l'intitulé : on cherche, parmi les
     colonnes chiffrées, celle dont les montants collent au prix de vente
     NOSICA (rapport médian le plus haut sans dépasser 1,05). Le prix de
     cession tourne autour de 0,6-0,8, l'avoir autour de 0,1. */
  function inferPriceZone(zones, recs, base) {
    if (!base || !base.size) return null;
    let best = null, bestMed = 0;
    for (const z of zones) {
      if (z.field && z.field !== 'autre') continue;
      const ratios = [];
      let numeric = 0, total = 0;
      for (const rec of recs) {
        const its = rec.row.items.filter(it => zoneOf(zones, it) === z);
        if (!its.length) continue;
        total++;
        const v = its.map(i => parsePrice(i.s)).find(x => x != null && PRICE_ANY_RE.test(String(its[0].s).trim()));
        if (v == null) continue;
        numeric++;
        const b = base.get(rec.key);
        if (b && b.price > 0) ratios.push(v / b.price);
      }
      if (total < 3 || numeric / total < 0.7 || ratios.length < 3) continue;
      ratios.sort((a, b) => a - b);
      const med = ratios[Math.floor(ratios.length / 2)];
      if (med > 0.45 && med <= 1.05 && med > bestMed) { bestMed = med; best = z; }
    }
    return best;
  }

  function readAdaptive(pages, opts) {
    opts = opts || {};
    const refYear = opts.refYear || new Date().getFullYear();
    const products = [];
    const seen = new Set();
    const columnsSeen = [];
    let cols = null, zones = null, headerPages = 0, inferred = false, titlePeriod = null;
    let planType = null;
    const notes = [];

    pages.forEach((rows, pageIdx) => {
      const pt = pageType(rows);
      if (pt) planType = pt;
      const band = findHeaderBand(rows);
      const bandSet = new Set(band ? band.rows : []);
      if (band) {
        const c = headerColumns(rows, band);
        if (c.some(h => h.field === 'ean') || c.filter(h => h.field && h.field !== 'autre').length >= 3) {
          cols = c; zones = null; headerPages++;
          if (!columnsSeen.length) for (const h of c) if (h.field) columnsSeen.push({ field: h.field, label: h.label });
        }
      }
      // période annoncée dans le titre du document (au-dessus du tableau)
      if (!titlePeriod) {
        const limit = band ? band.rows[0] : Math.min(rows.length, 8);
        for (let i = 0; i < limit; i++) {
          if (rowCode(rows[i])) break;
          const r = parseDateRange(rowText(rows[i]), { refYear, strict: false });
          if (r && r.from && /\b(du|au|valable|validite|periode|semaine|promo)\b/i.test(stripAccents(rowText(rows[i])))) { titlePeriod = r; break; }
        }
      }

      // lignes produit + lignes de débord rattachées à la plus proche
      const recs = [];
      const codeAt = rows.map((r, i) => (bandSet.has(i) ? null : rowCode(r)));
      const prodIdx = [];
      codeAt.forEach((c, i) => { if (c) prodIdx.push(i); });
      if (!prodIdx.length) return;
      const firstData = band ? band.rows[band.rows.length - 1] + 1 : 0;
      const recByIdx = new Map();
      for (const i of prodIdx) {
        const rec = { row: rows[i], code: codeAt[i].code, codeItem: codeAt[i].item, key: normCode(codeAt[i].code), extra: [] };
        recs.push(rec); recByIdx.set(i, rec);
      }
      const pitch = [];
      for (let k = 1; k < prodIdx.length; k++) pitch.push(rows[prodIdx[k]].y - rows[prodIdx[k - 1]].y);
      pitch.sort((a, b) => a - b);
      const medPitch = pitch.length ? pitch[Math.floor(pitch.length / 2)] : 24;
      const reach = Math.max(9, Math.min(medPitch * 0.75, 30));
      for (let i = firstData; i < rows.length; i++) {
        if (codeAt[i] || bandSet.has(i)) continue;
        let near = null, nearD = Infinity, second = Infinity;
        for (const p of prodIdx) {
          const d = Math.abs(rows[p].y - rows[i].y);
          if (d < nearD) { second = nearD; nearD = d; near = p; } else if (d < second) second = d;
        }
        if (near == null || nearD > reach) continue;
        recByIdx.get(near).extra.push({ row: rows[i], d: nearD, tie: second - nearD < nearD * 0.15 });
      }

      if (!zones) {
        // sans en-tête, les colonnes restent anonymes : seule la comparaison
        // aux prix NOSICA peut désigner celle du prix promo
        const data = [];
        for (const rec of recs) { data.push(rec.row); for (const e of rec.extra) data.push(e.row); }
        zones = buildZones(cols || [], data);
        if (!zones.some(z => z.field === 'promo')) {
          const z = inferPriceZone(zones, recs, opts.base);
          if (z) { z.field = 'promo'; z.inferred = true; inferred = true; notes.push('Colonne du prix promo non reconnue à son intitulé : retrouvée par comparaison avec les prix NOSICA.'); }
        }
      }

      for (const rec of recs) {
        const f = { cat: [], brand: [], ref: [], fourn: [], dates: [], from: [], to: [], promo: [], old: [], loose: [] };
        const feed = (row, isMain) => {
          for (const it of row.items) {
            if (it === rec.codeItem && CODE_ITEM_RE.test(it.s)) continue;
            const z = zones ? zoneOf(zones, it) : null;
            const fld = z ? z.field : null;
            const s = it === rec.codeItem ? String(it.s).replace(rec.code, ' ').trim() : String(it.s);
            if (!s) continue;
            if (fld && f[fld]) f[fld].push({ s, main: isMain, x: it.x });
            else if (!fld || fld === 'ean') f.loose.push({ s, main: isMain, x: it.x });
          }
        };
        feed(rec.row, true);
        for (const e of rec.extra.sort((a, b) => a.row.y - b.row.y)) feed(e.row, false);
        const txt = (arr) => arr.map(a => a.s).join(' ').replace(/\s+/g, ' ').trim();
        const priceOf = (arr) => {
          for (const pref of [true, false]) {
            for (const a of arr) {
              if (a.main !== pref) continue;
              const s = a.s.trim();
              if (!PRICE_ANY_RE.test(s)) continue;
              const v = parsePrice(s);
              if (v != null && v > 0) return v;
            }
          }
          return null;
        };
        let cat = txt(f.cat).replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*/, '');
        let brand = txt(f.brand) || txt(f.fourn);
        let name = cleanRef(txt(f.ref));
        const full = [rowText(rec.row), ...rec.extra.map(e => rowText(e.row))].join(' ');
        if (!name && !cols) {
          name = full.replace(rec.code, ' ')
            .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ' ').replace(/\d[\d\s]*,\d{2}\s*€?/g, ' ').replace(/-?\d+(,\d+)?\s*%/g, ' ')
            .replace(/\s+/g, ' ').trim().slice(0, 80);
        }
        if (!name && cols) name = cleanRef(txt(f.loose.filter(a => /[A-Za-zÀ-ÿ]/.test(a.s))));
        const price = priceOf(f.promo);
        const oldPrice = priceOf(f.old);
        let range = null, datesBy = null;
        if (f.dates.length) { range = parseDateRange(txt(f.dates), { refYear }); if (range) datesBy = 'colonne'; }
        if (!range && (f.from.length || f.to.length)) {
          const a = parseOneDate(txt(f.from), refYear), b = parseOneDate(txt(f.to), refYear);
          if (a && b) { range = resolveRange(a, b, refYear); if (range) datesBy = 'colonnes'; }
        }
        if (!range) { range = parseDateRange(full, { refYear, strict: true }); if (range) datesBy = 'ligne'; }
        const flags = [];
        if (!range && titlePeriod) { range = titlePeriod; datesBy = 'titre'; flags.push('dates_titre'); }
        const from = range ? range.from : null, to = range ? range.to : null;
        const dedup = rec.key + '|' + from + '|' + to;
        if (seen.has(dedup)) continue;
        seen.add(dedup);
        if (zones && zones.some(z => z.field === 'promo' && z.inferred) && price != null) flags.push('prix_deduit');
        products.push({
          key: rec.key, ean: padCode(rec.code), name: name.slice(0, 90), cat: cat.slice(0, 60), brand: brand.slice(0, 40),
          price, oldPrice: oldPrice != null && price != null && oldPrice > price ? oldPrice : null,
          from, to, page: pageIdx + 1, plan: planType, flags, datesBy, rawRef: txt(f.ref),
        });
      }
    });
    return { products, headerPages, columns: columnsSeen, inferred, titlePeriod, notes };
  }

  /* ──────────────────────────────────────────────────────────────
     LECTURE COMPLÈTE : double lecture, fusion, contrôles
     ──────────────────────────────────────────────────────────────
     opts = { base: Map(code -> {name, price}), fileName, refYear, today }
     -> { products, type, typeBy, report }                                  */
  const FLAG_TEXT = {
    prix_absent: 'prix promo illisible',
    prix_conflit: 'les deux lectures donnent un prix différent',
    prix_secours: 'prix repris de la contre-lecture',
    prix_deduit: 'colonne prix non identifiée par son intitulé',
    prix_suspect_bas: 'prix très inférieur au prix NOSICA',
    prix_suspect_haut: 'prix supérieur au prix NOSICA',
    ean_invalide: 'code EAN à la clé de contrôle invalide',
    dates_absentes: 'dates de validité illisibles',
    dates_titre: 'dates reprises du titre du plan',
    dates_longues: 'période de plus de 4 mois',
    dates_corrigees: 'date de fin antérieure au début dans le plan : année de fin corrigée (+1 an)',
    dates_incoherentes: 'date de fin antérieure au début, non corrigeable : dates écartées',
    libelle_absent: 'référence illisible',
    lecture_secours: 'produit vu par une seule des deux lectures',
  };
  /* ce qui empêche un envoi AUTOMATIQUE (personne ne relit avant le mail) */
  const BLOCKING = ['prix_absent', 'prix_conflit', 'prix_deduit', 'prix_suspect_bas'];

  function score(r) {
    const n = r.products.length;
    if (!n) return 0;
    const share = (fn) => r.products.filter(fn).length / n;
    return n * (0.5 * share(p => p.price != null) + 0.25 * share(p => !!p.name) + 0.25 * share(p => p.from && p.to));
  }
  function indexByKey(list) {
    const m = new Map();
    for (const p of list) { if (!m.has(p.key)) m.set(p.key, []); m.get(p.key).push(p); }
    return m;
  }
  function plausible(price, base) { return base > 0 && price >= base * 0.35 && price <= base * 1.05; }

  function parsePlan(pages, opts) {
    opts = opts || {};
    const base = opts.base || null;
    const L = readLegacy(pages);
    const A = readAdaptive(pages, opts);
    const sL = score(L), sA = score(A);
    const legacyFirst = sL > 0 && sL >= sA * 0.98;
    const P = legacyFirst ? L : A, S = legacyFirst ? A : L;
    // une contre-lecture qui a elle-même mal lu le document (format changé :
    // le lecteur historique perd ses repères) ne peut ni contredire ni
    // compléter un prix — elle ne sert plus qu'à combler un libellé manquant
    const credible = (legacyFirst ? sA : sL) >= (legacyFirst ? sL : sA) * 0.9;
    const sIdx = indexByKey(S.products);
    const taken = new Set();
    const products = P.products.map(p => ({ ...p, flags: (p.flags || []).slice() }));
    const pIdx = indexByKey(products);

    for (const [key, list] of pIdx) {
      const others = sIdx.get(key) || [];
      list.forEach((p, i) => {
        // même période en priorité, sinon même rang d'apparition
        let s = others.find(o => !taken.has(o) && o.from === p.from && o.to === p.to);
        if (!s) s = others.find((o, j) => !taken.has(o) && j === i) || others.find(o => !taken.has(o));
        if (!s) { if (credible) p.flags.push('lecture_secours'); return; }
        taken.add(s);
        // références sur plusieurs lignes : la lecture adaptative les recolle
        const a = legacyFirst ? s : p, l = legacyFirst ? p : s;
        if (legacyFirst && a.rawRef && l.rawRef != null && a.rawRef.length > l.rawRef.length
            && up(a.rawRef).includes(up(l.rawRef)) && cleanRef(a.rawRef)) p.name = cleanRef(a.rawRef).slice(0, 90);
        if (!credible) { /* prix : la lecture principale seule fait foi */ }
        else if (p.price == null && s.price != null) { p.price = s.price; p.flags.push('prix_secours'); }
        else if (p.price != null && s.price != null && Math.abs(p.price - s.price) >= 0.01) {
          const b = base && base.get(key);
          const okP = b && b.price ? plausible(p.price, b.price) : null;
          const okS = b && b.price ? plausible(s.price, b.price) : null;
          p.altPrice = s.price;
          if (okS && !okP) { p.altPrice = p.price; p.price = s.price; }
          p.flags.push('prix_conflit');
        }
        if (!p.from && !p.to && (s.from || s.to)) { p.from = s.from; p.to = s.to; if ((s.flags || []).includes('dates_titre')) p.flags.push('dates_titre'); }
        if (!p.name && s.name) p.name = s.name;
        if (!p.brand && s.brand) p.brand = s.brand;
        if (!p.cat && s.cat) p.cat = s.cat;
        if (p.oldPrice == null && s.oldPrice != null && p.price != null && s.oldPrice > p.price) p.oldPrice = s.oldPrice;
        if (!p.plan && s.plan) p.plan = s.plan;
        if ((s.flags || []).includes('prix_deduit') && !p.flags.includes('prix_deduit') && legacyFirst === false) p.flags.push('prix_deduit');
      });
    }
    for (const s of S.products) {
      if (!credible || taken.has(s) || pIdx.has(s.key)) continue;
      products.push({ ...s, flags: (s.flags || []).concat('lecture_secours') });
    }

    checkProducts(products, base);
    const det = detectPlanType(pages, opts.fileName);
    const report = buildReport(products, {
      reader: legacyFirst ? 'historique' : 'adaptatif', pages: pages.length, headerPages: P.headerPages,
      columns: A.columns, titlePeriod: A.titlePeriod, notes: A.notes, base,
    });
    return { products, type: det.type, typeBy: det.by, report };
  }

  /* Contrôles de cohérence, produit par produit : pose p.flags et p.check
     ('ok' | 'a_verifier' | 'bloquant'). Réutilisé pour les plans en tableur. */
  function checkProducts(products, base) {
    for (const p of products) {
      const F = new Set(p.flags || []);
      for (const k of ['prix_absent', 'libelle_absent', 'ean_invalide', 'dates_absentes', 'dates_longues', 'prix_suspect_bas', 'prix_suspect_haut']) F.delete(k);
      if (p.toOrig) { p.to = p.toOrig; delete p.toOrig; F.delete('dates_corrigees'); }
      if (p.price == null) F.add('prix_absent');
      if (!p.name) F.add('libelle_absent');
      if (!eanValid(p.ean)) F.add('ean_invalide');
      // fin avant début (erreur de saisie fréquente au changement d'année :
      // « 13/11/2026 au 01/01/2026 ») : l'année de fin est corrigée si la
      // période obtenue reste plausible, sinon les dates sont écartées
      if (p.from && p.to && p.to < p.from) {
        const fixed = (+p.to.slice(0, 4) + 1) + p.to.slice(4);
        if (fixed >= p.from && (new Date(fixed) - new Date(p.from)) / 864e5 <= 124) {
          p.toOrig = p.to; p.to = fixed; F.add('dates_corrigees');
        } else { p.from = null; p.to = null; F.add('dates_incoherentes'); }
      }
      if (!p.from || !p.to) F.add('dates_absentes');
      else if ((new Date(p.to) - new Date(p.from)) / 864e5 > 124) F.add('dates_longues');
      const b = base && base.get(p.key);
      p.inBase = !!b;
      if (b && b.price > 0 && p.price != null) {
        p.basePrice = b.price;
        if (p.price < b.price * 0.35) F.add('prix_suspect_bas');
        else if (p.price > b.price * 1.5) F.add('prix_suspect_haut');
      }
      p.flags = [...F];
      p.check = checkLevel(p.flags);
      delete p.datesBy; delete p.rawRef;
    }
    return products;
  }
  function checkLevel(flags) {
    if (flags.some(f => BLOCKING.includes(f))) return 'bloquant';
    return flags.some(f => f !== 'dates_titre' && f !== 'prix_secours') ? 'a_verifier' : 'ok';
  }
  /* Rapport de lecture d'un plan, recalculé à partir des produits */
  function buildReport(products, meta) {
    meta = meta || {};
    const count = {};
    for (const p of products) for (const f of (p.flags || [])) count[f] = (count[f] || 0) + 1;
    const issues = [];
    const add = (level, text) => issues.push({ level, text });
    if (!products.length) add('error', 'Aucun code EAN trouvé : ce fichier ne ressemble pas à un plan promo (ou c\'est un scan sans texte).');
    if (products.length && meta.headerPages === 0) add('warn', 'Aucune ligne d\'en-tête reconnue : colonnes non identifiées, références et prix à contrôler.');
    if (meta.reader === 'adaptatif' && products.length) add('info', 'Mise en page différente du format habituel : lecture adaptative utilisée.');
    for (const n of (meta.notes || [])) add('warn', n);
    for (const x of (meta.extra || [])) issues.push(x);
    const lines = [
      ['prix_absent', 'error'], ['prix_conflit', 'error'], ['prix_suspect_bas', 'error'], ['prix_deduit', 'warn'],
      ['prix_suspect_haut', 'warn'], ['dates_absentes', 'warn'], ['ean_invalide', 'warn'], ['libelle_absent', 'warn'],
      ['dates_longues', 'warn'], ['dates_corrigees', 'warn'], ['dates_incoherentes', 'warn'], ['dates_titre', 'info'], ['prix_secours', 'info'], ['lecture_secours', 'info'],
    ];
    for (const [k, level] of lines) if (count[k]) add(level, `${count[k]} produit(s) : ${FLAG_TEXT[k]}.`);
    const unknown = meta.base && meta.base.size ? products.filter(p => p.inBase === false).length : 0;
    if (unknown) add('info', `${unknown} référence(s) absente(s) de la base NOSICA (pas de contrôle de prix, pas d'éco-participation).`);
    const blocking = products.filter(p => p.check === 'bloquant').length;
    const toCheck = products.filter(p => p.check === 'a_verifier').length;
    return {
      reader: meta.reader || null, pages: meta.pages || 0, headerPages: meta.headerPages || 0,
      columns: meta.columns || [], titlePeriod: meta.titlePeriod || null,
      products: products.length, blocking, toCheck, ok: products.length - blocking - toCheck,
      withPrice: products.filter(p => p.price != null).length,
      withDates: products.filter(p => p.from && p.to).length,
      counts: count, issues,
      level: !products.length || blocking ? 'error' : (toCheck ? 'warn' : 'ok'),
    };
  }

  /* ──────────────────────────────────────────────────────────────
     Plan promo fourni en tableur (Excel / CSV) plutôt qu'en PDF
     ──────────────────────────────────────────────────────────────
     grid : tableau de lignes, chaque ligne un tableau de cellules. */
  function parsePlanGrid(grid, opts) {
    opts = opts || {};
    const refYear = opts.refYear || new Date().getFullYear();
    const products = [];
    const seen = new Set();
    let map = null, headerRows = 0;
    const cell = (v) => (v == null ? '' : String(v).trim());
    const excelDate = (v) => {
      if (typeof v === 'number' && v > 30000 && v < 80000) {
        const d = new Date(Math.round((v - 25569) * 864e5));
        return { d: d.getUTCDate(), m: d.getUTCMonth() + 1, y: d.getUTCFullYear() };
      }
      if (v instanceof Date && !isNaN(v)) return { d: v.getDate(), m: v.getMonth() + 1, y: v.getFullYear() };
      return parseOneDate(cell(v), refYear);
    };
    for (const row of grid) {
      const cells = (row || []).map(cell);
      if (!cells.some(Boolean)) continue;
      const cls = cells.map(c => (c && !/^\d/.test(c) ? classifyHeader(c) : null));
      const fields = cls.filter(c => c && c.field !== 'autre');
      if (fields.length >= 3 && cls.some(c => c && c.field === 'ean')) {
        map = {};
        cls.forEach((c, i) => { if (c && c.field !== 'autre' && (map[c.field] == null || c.w > map[c.field].w)) map[c.field] = { i, w: c.w }; });
        headerRows++;
        continue;
      }
      let code = null;
      if (map && map.ean) { const s = cell(row[map.ean.i]).replace(/\.0+$/, '').replace(/\s/g, ''); if (/^\d{8,13}$/.test(s)) code = s; }
      if (!code) { const s = cells.map(c => c.replace(/\s/g, '')).find(c => /^\d{11,13}$/.test(c)); if (s) code = s; }
      if (!code) continue;
      const get = (f) => (map && map[f] ? row[map[f].i] : null);
      const price = parsePrice(get('promo'));
      const old = parsePrice(get('old'));
      let range = null;
      if (map && map.dates) range = parseDateRange(cell(get('dates')), { refYear });
      // « DATES DE L'OPERATION » réparti sur plusieurs cellules (format de la
      // centrale) : date de début | « au » | date de fin, en dates Excel
      if (!range && map && map.dates) {
        const i0 = map.dates.i, a = excelDate(row[i0]);
        if (a) {
          for (let k = i0 + 1; k <= i0 + 3 && k < row.length; k++) {
            const b = /^\s*(au|a|-|–)?\s*$/i.test(cell(row[k])) ? null : excelDate(row[k]);
            if (b) {
              range = resolveRange(a, b, refYear);
              // fin avant début : gardée telle quelle, checkProducts() la corrige ou l'écarte
              const ya = fullYear(a.y) || refYear, yb = fullYear(b.y) || ya;
              if (!range && validDMY(a.d, a.m, ya) && validDMY(b.d, b.m, yb)) range = { from: iso(ya, a.m, a.d), to: iso(yb, b.m, b.d) };
              break;
            }
          }
        }
      }
      if (!range && map && map.from && map.to) {
        const a = excelDate(get('from')), b = excelDate(get('to'));
        if (a && b) range = resolveRange(a, b, refYear);
      }
      if (!range) range = parseDateRange(cells.join(' '), { refYear, strict: true });
      const key = normCode(code);
      const from = range ? range.from : null, to = range ? range.to : null;
      const dedup = key + '|' + from + '|' + to;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      products.push({
        key, ean: padCode(code), name: cleanRef(cell(get('ref'))).slice(0, 90), cat: cell(get('cat')).slice(0, 60),
        brand: (cell(get('brand')) || cell(get('fourn'))).slice(0, 40),
        price: price != null && price > 0 ? price : null,
        oldPrice: old != null && price != null && old > price ? old : null, from, to, page: 1, flags: [],
      });
    }
    return { products, headerRows };
  }

  /* ──────────────────────────────────────────────────────────────
     AFFICHES DÉJÀ FAITES PAR LA CENTRALE
     ──────────────────────────────────────────────────────────────
     Une page d'affiche -> le ou les produits du plan qu'elle concerne.
     Trois indices, du plus sûr au moins sûr :
       1. un code EAN imprimé sur l'affiche (« Code 0011120271638 ») ;
       2. un code EAN dans le nom du fichier (EAN_3660767123456.pdf) ;
       3. la référence du produit (RO2611EA) retrouvée dans le texte ou le
          nom du fichier — confortée par la présence du prix promo.
     products : [{ key, name, price }]
     -> { keys:[…], by:'ean'|'fichier'|'reference'|null, sure:boolean }       */
  const squash = (s) => up(s).replace(/[^A-Z0-9]/g, '');
  function refTokens(name) {
    const out = [];
    for (const t of up(name).split(/[\s\/|,;]+/)) {
      const c = t.replace(/[^A-Z0-9]/g, '');
      if (c.length >= 5 && /\d/.test(c) && /[A-Z]/.test(c)) out.push(c);
    }
    return out;
  }
  function hasPrice(price, text) { return priceInText(price, squash(text), up(text)); }
  function priceInText(price, textSquashed, textRaw) {
    if (price == null) return false;
    const e = String(Math.floor(price)), c = pad2(Math.round((price - Math.floor(price)) * 100));
    if (textSquashed.includes(e + c)) return true;
    return new RegExp('(?<!\\d)' + e.replace(/(\d)(?=(\d{3})+$)/g, '$1\\s?') + '\\s*(?:[,.€]|EUROS?)?\\s*' + c + '(?!\\d)').test(textRaw)
      || (c === '00' && new RegExp('(?<!\\d)' + e + '\\s*€').test(textRaw));
  }
  function codesIn(text) {
    const out = new Set();
    const re = /(?<!\d)\d{8,13}(?!\d)/g;
    let m;
    while ((m = re.exec(String(text || '')))) { const k = normCode(m[0]); if (k.length >= 7) out.add(k); }
    return out;
  }
  function matchAffiche(pageText, fileName, products) {
    const keys = new Set(products.map(p => p.key));
    const hit = (set) => [...set].filter(k => keys.has(k));
    let found = hit(codesIn(pageText));
    if (found.length) return { keys: found, by: 'ean', sure: true };
    found = hit(codesIn(String(fileName || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]/g, ' ')));
    if (found.length) return { keys: found, by: 'fichier', sure: true };
    const raw = up(pageText), sq = squash(pageText), fsq = squash(String(fileName || '').replace(/\.[a-z0-9]+$/i, ''));
    const cands = [];
    for (const p of products) {
      const toks = refTokens(p.name);
      if (!toks.length) continue;
      const inText = toks.some(t => sq.includes(t)), inName = toks.some(t => fsq.includes(t));
      if (!inText && !inName) continue;
      cands.push({ p, price: priceInText(p.price, sq, raw), len: Math.max(...toks.map(t => t.length)) });
    }
    if (!cands.length) return { keys: [], by: null, sure: false };
    const byKey = new Map();
    for (const c of cands) { const cur = byKey.get(c.p.key); if (!cur || (c.price && !cur.price)) byKey.set(c.p.key, c); }
    let list = [...byKey.values()];
    if (list.length > 1 && list.some(c => c.price)) list = list.filter(c => c.price);
    // références emboîtées (RO2611 / RO2611EA) : seule la plus complète compte ;
    // deux références distinctes (planche à deux poses) restent toutes deux
    if (list.length > 1) {
      const toks = new Map(list.map(c => [c, refTokens(c.p.name).filter(t => sq.includes(t) || fsq.includes(t))]));
      list = list.filter(c => !toks.get(c).every(t => list.some(o => o !== c && toks.get(o).some(u => u !== t && u.includes(t)))));
    }
    if (list.length > 2) return { keys: [], by: null, sure: false, ambiguous: list.map(c => c.p.key) };
    return { keys: list.map(c => c.p.key), by: 'reference', sure: list.every(c => c.price) };
  }
  /* Format voulu par la centrale pour une affiche : indice dans le nom du
     fichier (« …_A5.pdf »), sinon la géométrie de la page. */
  function afficheFormat(fileName, w, h) {
    const n = up(String(fileName || ''));
    const land = w > h * 1.15;
    if (/(^|[^A-Z0-9])A5([^A-Z0-9]|$)/.test(n)) return { fmt: 'a5', land };
    if (/(^|[^A-Z0-9])A4([^A-Z0-9]|$)/.test(n) && !land) return { fmt: 'a4', land };
    if (land) return { fmt: 'a5', land: true };                 // planche A4 paysage = 2 poses A5
    return { fmt: Math.max(w, h) < 640 ? 'a5' : 'a4', land: false };   // 595 pt = A5 portrait, 842 pt = A4
  }
  /* Nature de chaque page : 'table' (lignes de plan promo) ou 'autre'
     (affiche, page de garde…). Une page sans en-tête est un tableau si elle
     porte au moins deux lignes produit, ou une seule mais garnie comme une
     ligne de tableau (une affiche n'a que « Code 0011… » sur sa ligne). */
  function pageKinds(pages) {
    return pages.map((rows) => {
      let n = 0, rich = false;
      for (const r of rows) { if (rowCode(r)) { n++; if (r.items.length >= 4) rich = true; } }
      if (n >= 2 || (n === 1 && rich)) return 'table';
      return findHeaderBand(rows) && n >= 1 ? 'table' : 'autre';
    });
  }
  /* Un PDF est-il un plan promo (tableau) ou un jeu d'affiches ? */
  function looksLikePlan(pages) {
    let maxCodes = 0, header = false;
    for (const rows of pages) {
      let n = 0;
      for (const r of rows) if (rowCode(r)) n++;
      if (n > maxCodes) maxCodes = n;
      if (!header && findHeaderBand(rows)) header = true;
    }
    return maxCodes >= 4 || (header && maxCodes >= 1);
  }

  return {
    parsePlan, parsePlanGrid, readLegacy, readAdaptive, detectPlanType, classifyHeader,
    extractRows, rowsFromItems, splitWideItem, rowText, parsePrice, parseDateRange, cleanRef,
    normCode, padCode, eanValid, stripAccents, matchAffiche, afficheFormat, looksLikePlan, pageKinds,
    checkProducts, checkLevel, buildReport, hasPrice,
    FLAG_TEXT, BLOCKING,
  };
});
