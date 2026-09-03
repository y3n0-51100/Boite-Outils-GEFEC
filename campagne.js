/* ════════════════════════════════════════════════════════════════
   ENVOI CAMPAGNE MAIL — outil administrateur
   ────────────────────────────────────────────────────────────────
   Tous les magasins en liste ; chacun a son bouton. Un clic et l'outil,
   seul, sans application tierce :
     1. contrôle la valorisation du magasin (moins de 20 jours) ;
     2. croise les plans promo publiés avec cette valorisation, dans un
        cadre etiquette.html?export=1 hors écran (le moteur d'affiches) ;
     3. fabrique UN PDF PAR PLAN — Plan Promo TV et Plan Promo PEM : ce
        sont les deux pièces jointes du mail ;
     4. dépose les PDF dans le bucket privé « affiches » ;
     5. appelle la fonction Edge « send-campagne-mail », qui relit les
        fichiers côté serveur et poste le mail depuis l'adresse réglée
        dans ⚙️ Réglages.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const cfg = window.GEFEC_CONFIG || {};

  /* La valorisation doit être fraîche : au-delà, les affiches portent sur des
     produits qui ne sont plus en exposition. C'est le contrôle demandé avant
     tout envoi de campagne. */
  const VALO_MAX_DAYS = 20;

  const AFF_BUCKET = 'affiches';
  const SETTINGS_KEY = 'mail';

  const DEFAULT_SUBJECT = 'Votre plan promo — {plans} — {magasin}';
  const DEFAULT_MESSAGE = [
    'Bonjour,',
    '',
    'Voici la campagne promo à mettre en place dans votre magasin : {plans}.',
    '',
    'Vous trouverez en pièces jointes les affiches prix correspondant aux produits',
    'réellement présents chez vous ({affiches} affiche(s), {pages} page(s) à imprimer).',
    'Elles ont été générées à partir de la valorisation que vous avez déposée.',
    '',
    "Il n'y a plus qu'à imprimer et à poser en rayon.",
    '',
    'Bonne vente,',
  ].join('\n');

  let sb = null;
  let ME = null;                 // { userId, role }
  let SETTINGS = {};             // contenu de app_settings.mail
  let STORES = [];               // lignes enrichies
  let busy = false;

  /* ---------- Outils ---------- */
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim());
  const daysSince = (d) => Math.floor((Date.now() - d.getTime()) / 86400000);
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'magasin';
  }
  function relAge(dt) {
    const d = daysSince(dt);
    if (d <= 0) return "aujourd'hui";
    if (d === 1) return 'il y a 1 jour';
    if (d < 7) return `il y a ${d} jours`;
    const w = Math.floor(d / 7);
    return w === 1 ? 'il y a 1 semaine' : `il y a ${w} semaines`;
  }
  let toastTimer = null;
  function toast(msg, err) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.toggle('error', !!err);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function guard(html) {
    const g = el('guard');
    g.innerHTML = html; g.hidden = false;
    el('cardOpts').hidden = true; el('cardStores').hidden = true;
    el('btnAll').disabled = true; el('btnReload').disabled = true;
  }

  /* La coque (app-auth.js) a déjà un client Supabase authentifié : on le
     réutilise plutôt que d'en ouvrir un second qui rafraîchirait le même
     jeton en parallèle. Hors coque, on crée le nôtre. */
  function getSb() {
    try {
      if (window.parent && window.parent !== window && window.parent.GEFEC_SB)
        return window.parent.GEFEC_SB;
    } catch (e) { /* origine différente : on prend la voie normale */ }
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_KEY) return null;
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: false },
    });
  }

  /* ---------- Réglages d'envoi (⚙️ Réglages de la coque) ---------- */
  async function loadSettings() {
    try {
      const { data } = await sb.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
      SETTINGS = (data && data.value) || {};
    } catch (e) { SETTINGS = {}; }
    el('optSubject').value = SETTINGS.subject || DEFAULT_SUBJECT;
    el('optMessage').value = SETTINGS.message || DEFAULT_MESSAGE;
    const from = String(SETTINGS.from_email || '').trim();
    const m = el('fromMsg');
    if (isMail(from)) {
      m.className = 'msg ok';
      m.textContent = `Expéditeur : ${SETTINGS.from_name ? SETTINGS.from_name + ' <' + from + '>' : from}`
        + (SETTINGS.reply_to ? ` · réponses vers ${SETTINGS.reply_to}` : '');
    } else {
      m.className = 'msg warn';
      m.textContent = "Aucune adresse d'expédition enregistrée : renseignez-la dans ⚙️ Réglages → « Envoi des campagnes mail ». "
        + "À défaut, la fonction utilisera le secret MAIL_FROM s'il est défini.";
    }
  }

  /* ---------- Plans promo publiés par l'administrateur ----------
     Mêmes documents partagés que la coque (bucket « shared » + table
     « shared_docs »). Le résultat est gardé tant que la publication n'a pas
     changé : une campagne sur 16 magasins ne relit pas 16 fois les mêmes PDF. */
  let planCache = null;
  const isFolder = (p) => typeof p === 'string' && p.endsWith('/');

  async function fetchSharedMeta(id) {
    try {
      const { data } = await sb.from('shared_docs')
        .select('file_path, file_name, updated_at').eq('id', id).maybeSingle();
      return data || null;
    } catch (e) { return null; }
  }
  async function listShared(prefix) {
    try {
      const { data } = await sb.storage.from('shared').list(prefix.replace(/\/$/, ''), { limit: 200 });
      return (data || []).filter(f => f && f.name && f.id !== null)
        .map(f => prefix.replace(/\/$/, '') + '/' + f.name);
    } catch (e) { return []; }
  }
  async function planFiles() {
    const ids = ['plan-promo-tv', 'plan-promo-pem', 'plan-promo', 'affiches-cetelem'];
    const metas = {};
    for (const id of ids) metas[id] = await fetchSharedMeta(id);
    const token = ids.map(id => (metas[id] && metas[id].file_path ? metas[id].updated_at : '-')).join('|');
    if (planCache && planCache.token === token) return planCache;

    const plans = { tv: [], pem: [], auto: [], cet: [] }, labels = [];
    const hasNew = ['plan-promo-tv', 'plan-promo-pem'].some(id => metas[id] && metas[id].file_path);
    const pick = async (id, slot, label) => {
      const meta = metas[id];
      if (!meta || !meta.file_path) return;
      const paths = isFolder(meta.file_path) ? (await listShared(meta.file_path)).sort() : [meta.file_path];
      let n = 0;
      for (const p of paths) {
        const { data, error } = await sb.storage.from('shared').download(p);
        if (error || !data) continue;
        const name = (p.split('/').pop() || id).replace(/^\d+_/, '');
        plans[slot].push({ data: await data.arrayBuffer(), name });
        n++;
      }
      if (n) labels.push(label);
    };
    await pick('plan-promo-tv', 'tv', 'Plan Promo TV');
    await pick('plan-promo-pem', 'pem', 'Plan Promo PEM');
    await pick('affiches-cetelem', 'cet', 'Affiches CETELEM');
    // transition : l'ancien plan unique ne sert que si aucun des deux nouveaux
    // n'est publié (le moteur reconnaît alors lui-même le type de chaque PDF)
    if (!hasNew) await pick('plan-promo', 'auto', 'Plan promo (format unique)');
    planCache = { plans, labels, token, count: plans.tv.length + plans.pem.length + plans.auto.length + plans.cet.length };
    return planCache;
  }
  async function refreshPlanStatus() {
    const st = el('planMsg');
    st.className = 'msg'; st.textContent = 'Vérification des plans promo publiés…';
    try {
      const p = await planFiles();
      if (!p.count) {
        st.className = 'msg err';
        st.textContent = "Aucun plan promo publié : déposez d'abord les plans TV et/ou PEM dans ⚙️ Réglages.";
      } else {
        st.className = 'msg ok';
        st.textContent = `Plans pris en compte : ${p.labels.join(' + ')} — ${p.count} fichier(s).`;
      }
      return p;
    } catch (e) {
      st.className = 'msg err';
      st.textContent = 'Plans promo : ' + ((e && e.message) || e);
      return null;
    }
  }

  /* ---------- Le générateur : etiquette.html, hors écran ---------- */
  let genFrameP = null;
  function getGenFrame() {
    if (genFrameP) return genFrameP;
    genFrameP = new Promise((res, rej) => {
      const fr = document.createElement('iframe');
      fr.id = 'genFrame';
      fr.title = "Générateur d'affiches";
      fr.setAttribute('aria-hidden', 'true');
      fr.addEventListener('load', () => res(fr));
      fr.addEventListener('error', () => rej(new Error("générateur d'affiches introuvable")));
      fr.src = 'etiquette.html?export=1';
      document.body.appendChild(fr);
      setTimeout(() => rej(new Error("le générateur d'affiches n'a pas démarré")), 90000);
    }).catch(e => { genFrameP = null; throw e; });
    return genFrameP;
  }

  const PHASE = {
    libs: 'préparation du générateur…', valo: 'lecture de la valorisation…',
    plans: 'lecture des plans promo…', match: 'croisement plan × valorisation…',
  };

  // -> { files:[{id,label,blob,pages,products}], pages, products, plans }
  async function buildPdfs(store, plans, opts, onStep) {
    const win = (await getGenFrame()).contentWindow;
    if (!win || typeof win.gefecBuildCampagne !== 'function')
      throw new Error("générateur d'affiches indisponible");
    const { data, error } = await sb.storage.from('valorisations')
      .download(`${store.id}/valorisation.pdf`);
    if (error || !data) throw new Error('aucune valorisation déposée pour ce magasin');
    
    const valoBuffer = await data.arrayBuffer();
    let files = [];
    let pages = 0;
    let products = 0;

    const filteredPlans = { tv: [], pem: [], auto: [] };
    if (opts.chkTV) filteredPlans.tv = plans.plans.tv || [];
    if (opts.chkPEM) filteredPlans.pem = plans.plans.pem || [];
    filteredPlans.auto = plans.plans.auto || [];

    if (filteredPlans.tv.length || filteredPlans.pem.length || filteredPlans.auto.length) {
      const res = await win.gefecBuildCampagne({
        valo: valoBuffer.slice(0), valoName: `valorisation-${store.id}.pdf`,
        plans: filteredPlans, plansToken: plans.token,
        tpl: opts.tpl, 
        fmtTV: opts.storePrefs.tv || 'a4',
        fmtPEM: opts.storePrefs.pem || 'a4',
        printBg: opts.printBg,
        onProgress: onStep,
      });
      files.push(...res.files);
      pages += res.pages;
      products += res.products;
    }
    
    if (opts.chkCET && plans.plans.cet && plans.plans.cet.length) {
      if (window.parent && typeof window.parent.gefecBuildCetelem === 'function') {
        onStep('match', 0, 1); // Indique qu'on traite Cetelem
        try {
          const cetRes = await window.parent.gefecBuildCetelem({
            valo: valoBuffer.slice(0),
            plans: plans.plans.cet,
            fmt: opts.storePrefs.cetelem || 'a4',
            onProgress: onStep
          });
          files.push(...cetRes);
          for (const c of cetRes) {
            pages += c.pages;
            products += c.products;
          }
        } catch (e) {
          if (e.message !== 'aucune affiche CETELEM ne correspond à votre valorisation') {
            throw e;
          }
        }
      }
    }
    
    if (files.length === 0) throw new Error("Aucun plan généré (aucun produit trouvé ou plans décochés).");

    return { files, pages, products, plans: files.map(f => ({ id: f.id, label: f.label, n: f.products })) };
  }

  /* ---------- Dépôt des PDF (bucket privé « affiches ») ----------
     Un fichier par plan et par magasin, remplacé à chaque campagne. La
     fonction Edge les relit côté serveur pour les joindre au mail : les
     mégaoctets ne repassent pas par le navigateur. */
  async function uploadPdfs(store, files, dateStr) {
    const out = [];
    for (const f of files) {
      const path = `${store.id}/campagne/${f.id}.pdf`;
      const { error } = await sb.storage.from(AFF_BUCKET)
        .upload(path, f.blob, { upsert: true, contentType: 'application/pdf' });
      if (error) throw new Error('dépôt du PDF : ' + error.message);
      out.push({
        path,
        filename: `affiches-${f.id}-${slugify(store.name || store.id)}-${dateStr}.pdf`,
        label: f.label, pages: f.pages, products: f.products, bytes: f.blob.size,
      });
    }
    return out;
  }

  /* ---------- Le mail (fonction Edge) ----------
     supabase-js ne remonte qu'un message générique (« Edge Function returned a
     non-2xx status code ») : le motif réel est dans le CORPS de la réponse. Et
     les erreurs de la plateforme elle-même (fonction absente, budget de calcul
     dépassé) n'ont même pas le champ « error » de nos réponses — d'où la table
     de correspondance par code HTTP. Sans cela, l'écran affiche une phrase qui
     ne dit rien de ce qu'il faut corriger. */
  const FN_HINT = {
    401: 'session expirée — reconnectez-vous',
    403: "action réservée au compte administrateur",
    404: "la fonction « send-campagne-mail » n'est pas déployée (ou porte un autre nom)",
    504: "la fonction a dépassé son temps d'exécution",
    546: "la fonction a dépassé son budget de calcul : les pièces jointes sont trop lourdes — passez en format A5, ou envoyez un plan à la fois",
  };
  async function fnErrorMessage(error) {
    const res = error && error.context;
    const status = res && res.status;
    let detail = '';
    try {
      if (res && typeof res.text === 'function') {
        const raw = (await res.text()).trim();
        if (raw) {
          try {
            const j = JSON.parse(raw);
            detail = j.error || j.message || j.msg || (j.code ? 'code ' + j.code : '') || raw;
          } catch (e) { detail = raw.slice(0, 300); }
        }
      }
    } catch (e) { /* corps déjà lu ou illisible : on garde l'indice du code */ }
    const hint = FN_HINT[status];
    const parts = [];
    if (hint) parts.push(hint);
    if (detail && detail !== hint) parts.push(detail);
    if (!parts.length) parts.push((error && error.message) || 'erreur inconnue');
    return parts.join(' — ') + (status ? ` (HTTP ${status})` : '');
  }

  async function sendMail(payload) {
    const { data, error } = await sb.functions.invoke('send-campagne-mail', { body: payload });
    if (error) throw new Error(await fnErrorMessage(error));
    if (data && data.ok === false) throw new Error(data.error || 'envoi non configuré');
    if (data && data.error) throw new Error(data.error);
    return data || {};
  }

  async function logCampagne(store, to, subject, files, res, info) {
    try {
      await sb.from('campagne_mails').insert({
        store_id: store.id, email: to, subject,
        plans: info.plansLabel, files, pages: info.pages, products: info.products,
        valo_days: info.valoDays, provider: (res && res.provider) || null,
        sent_by: ME.userId,
      });
    } catch (e) { /* journal facultatif : le mail, lui, est parti */ }
  }

  // L'adresse n'est pas générique : une par magasin, mémorisée sur sa fiche.
  // Un champ vidé retire l'adresse (le magasin sort de l'envoi groupé).
  async function saveStoreEmail(store, to) {
    const v = String(to || '').trim() || null;
    if ((store.email || null) === v) return;
    const { error } = await sb.from('stores').update({ email: v }).eq('id', store.id);
    if (error) throw new Error('adresse non mémorisée : ' + error.message);
    store.email = v;
  }

  /* ---------- Le texte du mail ---------- */
  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(magasin|code|plans|affiches|pages|date)\}/g, (m, k) =>
      vars[k] != null ? String(vars[k]) : m);
  }

  /* ---------- Liste des magasins ---------- */
  async function loadStores() {
    const host = el('rows');
    host.innerHTML = '<div class="empty">Chargement…</div>';
    try {
      let stores = null, serr = null;
      ({ data: stores, error: serr } = await sb.from('stores').select('id, name, region, email, mail_prefs').order('id'));
      if (serr) throw serr;
      if (!stores || !stores.length) {
        host.innerHTML = '<div class="empty">Aucun magasin enregistré.</div>';
        el('pills').innerHTML = ''; STORES = []; syncBulk(); return;
      }

      const metaBy = {};
      try {
        const { data } = await sb.from('valorisations').select('store_id, ean_count, updated_at');
        (data || []).forEach(m => { metaBy[m.store_id] = m; });
      } catch (e) {}

      const lastBy = {};
      try {
        const { data } = await sb.from('campagne_mails')
          .select('store_id, email, sent_at, products, plans').order('sent_at', { ascending: false });
        (data || []).forEach(m => { if (!lastBy[m.store_id]) lastBy[m.store_id] = m; });
      } catch (e) {}

      // vérité = le fichier réellement présent dans le Storage
      const rows = await Promise.all(stores.map(async s => {
        let file = null;
        try {
          const { data } = await sb.storage.from('valorisations').list(String(s.id), { limit: 100 });
          file = (data || []).find(f => f.name === 'valorisation.pdf') || null;
        } catch (e) {}
        const meta = metaBy[s.id];
        const when = (meta && meta.updated_at) || (file && (file.updated_at || file.created_at));
        const dt = when ? new Date(when) : null;
        const has = !!file;
        const ageDays = (has && dt && !isNaN(dt.getTime())) ? daysSince(dt) : null;
        const status = !has ? 'never' : (ageDays != null && ageDays > VALO_MAX_DAYS ? 'late' : 'ok');
        return { ...s, has, meta, dt, ageDays, status, last: lastBy[s.id] || null };
      }));

      STORES = rows;
      renderStores();
    } catch (e) {
      host.innerHTML = `<div class="empty">Erreur : ${esc(e.message || e)}</div>`;
    }
  }

  function renderPills() {
    const nOk = STORES.filter(s => s.status === 'ok').length;
    const nLate = STORES.filter(s => s.status === 'late').length;
    const nNever = STORES.filter(s => s.status === 'never').length;
    const nMail = STORES.filter(s => isMail(s.email)).length;
    el('pills').innerHTML = `
      <span class="pill ok">Valorisation à jour<b>${nOk}</b></span>
      <span class="pill late">Périmée (&gt; ${VALO_MAX_DAYS} j)<b>${nLate}</b></span>
      <span class="pill never">Jamais déposée<b>${nNever}</b></span>
      <span class="pill">Adresse renseignée<b>${nMail}</b></span>
      <span class="pill">Total<b>${STORES.length}</b></span>`;
  }

  function renderStores() {
    renderPills();
    el('rows').innerHTML = STORES.map(s => {
      const badge = s.status === 'ok'
        ? `<span class="badge ok">Valorisation ${s.ageDays === 0 ? 'du jour' : s.ageDays + ' j'}</span>`
        : s.status === 'late'
          ? `<span class="badge late">Périmée · ${s.ageDays} j</span>`
          : '<span class="badge never">Aucune valorisation</span>';
      const sub = s.has
        ? `${s.meta && s.meta.ean_count != null ? s.meta.ean_count + ' EAN · ' : ''}déposée le ${s.dt ? s.dt.toLocaleDateString('fr-FR') : '?'}`
        : 'le magasin n’a pas encore déposé sa valorisation';
      const last = s.last
        ? `✉️ dernière campagne ${relAge(new Date(s.last.sent_at))} à ${esc(s.last.email)}${s.last.plans ? ' — ' + esc(s.last.plans) : ''}`
        : '';
      const blocked = s.status !== 'ok';
      return `<div class="row" data-id="${esc(s.id)}">
        ${badge}
        <div class="main">
          <b>${esc(s.name || s.id)}</b>
          <div class="sub">${esc(s.id)}${s.region ? ' · ' + esc(s.region) : ''} — ${esc(sub)}</div>
          ${last ? `<div class="last">${last}</div>` : ''}
        </div>
        <input class="mail" type="email" data-mail spellcheck="false" autocapitalize="none"
               placeholder="${s.email === 'REFUSE' ? 'Ne souhaite pas de mails' : 'adresse du magasin'}" 
               value="${esc(s.email === 'REFUSE' ? '' : (s.email || ''))}">
        <div class="acts">
          <button class="btn small" data-remind type="button"${s.status === 'ok' ? ' style="display:none"' : ''}>🔔 Relancer</button>
          <button class="btn small" data-pdf type="button"${blocked ? ' disabled' : ''}>⬇️ PDF</button>
          <button class="btn primary small" data-send type="button"${blocked ? ' disabled' : ''}>✉️ Générer &amp; envoyer</button>
        </div>
        <div class="bar" hidden><i></i></div>
        <div class="st"></div>
      </div>`;
    }).join('');

    el('rows').querySelectorAll('.row').forEach(row => {
      const id = row.dataset.id;
      const store = STORES.find(s => String(s.id) === id);
      if (!store) return;
      row.querySelector('[data-send]').addEventListener('click', () => runOne(store, true));
      row.querySelector('[data-pdf]').addEventListener('click', () => runOne(store, false));
      const remindBtn = row.querySelector('[data-remind]');
      if (remindBtn) remindBtn.addEventListener('click', () => remindStore(store));
      const inp = row.querySelector('[data-mail]');
      inp.addEventListener('change', async () => {
        const v = inp.value.trim();
        if (v && !isMail(v)) { setStatus(store, 'ko', 'Adresse e-mail invalide.'); return; }
        try {
          await saveStoreEmail(store, v);
          setStatus(store, 'ok', v ? 'Adresse mémorisée ✓' : 'Adresse retirée.');
        } catch (e) {
          setStatus(store, 'ko', (e && e.message) || String(e));
        }
        renderPills(); syncBulk();
      });
    });
    syncBulk();
  }

  async function remindStore(store) {
    const row = rowOf(store);
    const to = ((row && row.querySelector('[data-mail]').value) || store.email || '').trim();
    if (!isMail(to)) {
      setStatus(store, 'ko', "Adresse e-mail manquante pour la relance.");
      return;
    }
    const age = store.ageDays != null ? store.ageDays : 'plusieurs';
    const msg = `Bonjour,

Votre valorisation magasin enregistrée date de ${age} jours. 
Afin de pouvoir générer les affiches promotionnelles (TV, PEM, CETELEM) correspondant exactement à votre stock exposé, merci de vous connecter à l'outil pour y déposer votre nouvelle valorisation PDF issue de NOSICA.

Ceci est un message automatique, merci de ne pas y répondre.`;

    setStatus(store, 'run', `envoi de la relance à ${to}…`);
    try {
      await sendMail({
        to, store_id: store.id, store_name: store.name || store.id,
        subject: `Mise à jour de votre valorisation magasin nécessaire`,
        message: msg,
        files: []
      });
      setStatus(store, 'ok', `Relance envoyée avec succès à ${to}.`);
    } catch (e) {
      setStatus(store, 'ko', `Relance échouée : ${e.message}`);
    }
  }

  // le mail vient de partir : on rafraîchit « dernière campagne » sans
  // re-rendre la liste, sinon le compte rendu de l'envoi disparaîtrait
  function touchLast(store, to, plansLabel) {
    store.last = { sent_at: new Date().toISOString(), email: to, plans: plansLabel };
    const row = rowOf(store); if (!row) return;
    let node = row.querySelector('.last');
    if (!node) {
      node = document.createElement('div');
      node.className = 'last';
      row.querySelector('.main').appendChild(node);
    }
    node.innerHTML = `✉️ dernière campagne aujourd'hui à ${esc(to)}${plansLabel ? ' — ' + esc(plansLabel) : ''}`;
    renderPills();
  }

  function rowOf(store) { return el('rows').querySelector(`.row[data-id="${CSS.escape(String(store.id))}"]`); }
  function setStatus(store, cls, txt) {
    const row = rowOf(store); if (!row) return;
    const st = row.querySelector('.st');
    st.className = 'st ' + (cls || ''); st.textContent = txt || '';
  }
  function setBar(store, pct) {
    const row = rowOf(store); if (!row) return;
    const bar = row.querySelector('.bar');
    bar.hidden = pct == null;
    bar.querySelector('i').style.width = (pct == null ? 0 : pct) + '%';
  }
  function lockRows(on) {
    busy = on;
    el('btnAll').disabled = on || !readyStores().length;
    el('btnReload').disabled = on;
    el('rows').querySelectorAll('button[data-send],button[data-pdf]').forEach(b => {
      const store = STORES.find(s => String(s.id) === b.closest('.row').dataset.id);
      b.disabled = on || !store || store.status !== 'ok';
    });
  }
  const readyStores = () => STORES.filter(s => s.status === 'ok' && isMail(s.email));
  function syncBulk() {
    const n = readyStores().length;
    el('btnAll').textContent = `✉️ Envoyer à tous les magasins prêts (${n})`;
    el('btnAll').disabled = busy || !n;
  }

  /* ---------- Le traitement d'un magasin ---------- */
  function currentOpts() {
    return {
      tpl: el('optTpl').value,
      printBg: el('optBg').value === '1',
      subject: el('optSubject').value || DEFAULT_SUBJECT,
      message: el('optMessage').value || DEFAULT_MESSAGE,
      chkTV: el('chkTV').checked,
      chkPEM: el('chkPEM').checked,
      chkCET: el('chkCET').checked,
    };
  }

  // send = true : génération + envoi. send = false : génération seule, les PDF
  // sont téléchargés sur le poste de l'administrateur (contrôle avant campagne).
  async function processStore(store, send, opts, plans) {
    if (store.status === 'never') throw new Error("ce magasin n'a pas déposé de valorisation");
    if (store.status === 'late')
      throw new Error(`valorisation de ${store.ageDays} jours — au-delà de ${VALO_MAX_DAYS} jours, elle ne reflète plus le stock exposé`);

    opts.storePrefs = store.mail_prefs || {};

    let to = '';
    if (send) {
      const row = rowOf(store);
      to = ((row && row.querySelector('[data-mail]').value) || store.email || '').trim();
      if (!isMail(to)) throw new Error("adresse e-mail du magasin manquante ou invalide");
    }

    setStatus(store, 'run', 'génération des affiches…');
    setBar(store, 0);
    const res = await buildPdfs(store, plans, opts, (phase, i, n) => {
      if (phase === 'pdf') {
        setStatus(store, 'run', n ? `affiche ${i}/${n}` : 'mise en page…');
        setBar(store, n ? Math.round(i / n * 100) : 0);
      } else setStatus(store, 'run', PHASE[phase] || 'en cours…');
    });
    setBar(store, null);

    // Les PDF sortent du cadre générateur : ce sont des Blob d'un AUTRE realm
    // JS, qui échouent aux tests instanceof des bibliothèques (même piège que
    // l'injection des documents partagés). On les reconstruit ici.
    for (const f of res.files) f.blob = new Blob([await f.blob.arrayBuffer()], { type: 'application/pdf' });

    const plansLabel = res.plans.map(p => p.label).join(' + ');
    const dateStr = new Date().toISOString().slice(0, 10);

    if (!send) {
      for (const f of res.files) {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `affiches-${f.id}-${slugify(store.name || store.id)}-${dateStr}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      const poids = res.files.reduce((n, f) => n + f.blob.size, 0) / 1048576;
      setStatus(store, 'ok', `${res.files.length} PDF téléchargé(s) (${poids.toFixed(1)} Mo) — `
        + `${res.products} affiche(s), ${res.pages} page(s) · ${plansLabel}`);
      return { sent: false };
    }

    setStatus(store, 'run', 'dépôt des PDF…');
    const files = await uploadPdfs(store, res.files, dateStr);
    const mo = files.reduce((n, f) => n + (f.bytes || 0), 0) / 1048576;
    await saveStoreEmail(store, to);

    const vars = {
      magasin: store.name || store.id, code: store.id, plans: plansLabel,
      affiches: res.products, pages: res.pages,
      date: new Date().toLocaleDateString('fr-FR'),
    };
    const subject = fill(opts.subject, vars);
    const message = fill(opts.message, vars);

    setStatus(store, 'run', `envoi du mail à ${to} — ${mo.toFixed(1)} Mo de pièces jointes…`);
    const out = await sendMail({
      to, store_id: store.id, store_name: store.name || store.id,
      subject, message,
      files: files.map(f => ({ path: f.path, filename: f.filename, label: f.label, pages: f.pages, products: f.products })),
    });

    await logCampagne(store, to, subject, files, out, {
      plansLabel, pages: res.pages, products: res.products, valoDays: store.ageDays,
    });
    touchLast(store, to, plansLabel);
    setStatus(store, 'ok',
      `Mail envoyé à ${to} — ${files.length} pièce(s) jointe(s) (${mo.toFixed(1)} Mo), `
      + `${res.products} affiche(s), ${res.pages} page(s) · ${plansLabel}`);
    return { sent: true };
  }

  async function runOne(store, send) {
    if (busy) return;
    const opts = currentOpts();
    lockRows(true);
    try {
      const plans = await planFiles();
      if (!plans.count) throw new Error('aucun plan promo publié : déposez les plans TV et/ou PEM dans ⚙️ Réglages');
      const r = await processStore(store, send, opts, plans);
      toast(r.sent ? `Campagne envoyée à ${store.name || store.id} ✓` : 'PDF généré ✓');
    } catch (e) {
      setBar(store, null);
      setStatus(store, 'ko', 'Échec : ' + ((e && e.message) || e));
      toast('Échec : ' + ((e && e.message) || e), true);
    } finally {
      lockRows(false);
    }
  }

  async function runAll() {
    if (busy) return;
    const targets = readyStores();
    if (!targets.length) return;
    if (!confirm(`Envoyer la campagne à ${targets.length} magasin(s) ?\n`
      + `Chaque magasin reçoit les affiches de SON magasin en pièces jointes.`)) return;

    const opts = currentOpts();
    lockRows(true);
    let done = 0, failed = 0, lastErr = '';
    try {
      const plans = await planFiles();
      if (!plans.count) throw new Error('aucun plan promo publié : déposez les plans TV et/ou PEM dans ⚙️ Réglages');
      for (const store of targets) {
        try { await processStore(store, true, opts, plans); done++; }
        catch (e) {
          failed++; lastErr = (e && e.message) || String(e);
          setBar(store, null);
          setStatus(store, 'ko', 'Échec : ' + lastErr);
        }
      }
    } catch (e) {
      toast('Échec : ' + ((e && e.message) || e), true);
    } finally {
      lockRows(false);
    }
    if (done) toast(`${done} campagne(s) envoyée(s)${failed ? ` · ${failed} échec(s)` : ''} ✓`);
    else if (failed) toast('Échec : ' + lastErr, true);
  }

  /* ---------- Démarrage ---------- */
  async function init() {
    el('btnReload').addEventListener('click', async () => {
      if (busy) return;
      planCache = null;
      await refreshPlanStatus();
      await loadStores();
    });
    el('btnAll').addEventListener('click', runAll);

    sb = getSb();
    if (!sb) {
      guard("<b>Configuration Supabase manquante.</b><br>Vérifiez <code>app-config.js</code> et le chargement de la bibliothèque Supabase.");
      return;
    }
    let user = null;
    try { ({ data: { user } } = await sb.auth.getUser()); } catch (e) {}
    if (!user) { guard('<b>Session expirée.</b><br>Reconnectez-vous depuis la page d’accueil.'); return; }

    let prof = null;
    try {
      const { data } = await sb.from('profiles').select('role').eq('user_id', user.id).single();
      prof = data;
    } catch (e) {}
    if (!prof || prof.role !== 'admin') {
      guard("<b>Outil réservé à l'administrateur.</b><br>L'envoi des campagnes mail se pilote depuis le compte administrateur.");
      return;
    }
    ME = { userId: user.id, role: prof.role };

    el('cardOpts').hidden = false;
    el('cardStores').hidden = false;
    await loadSettings();
    await refreshPlanStatus();
    await loadStores();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
