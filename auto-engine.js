/* ════════════════════════════════════════════════════════════════
   MOTEUR D'ENVOI AUTOMATIQUE DES AFFICHES
   ────────────────────────────────────────────────────────────────
   Partagé par :
     · campagne.html  — l'outil admin (aperçu, « envoyer maintenant »,
                        calendrier des envois programmés) ;
     · auto-run.html  — la tournée quotidienne, ouverte sans écran par
                        GitHub Actions (scripts/run-auto.js).

   Une tournée, pour un jour J :
     1. relit les réglages (app_settings « auto »), les opérations
        commerciales, les plans TV/PEM publiés et les masques perso ;
     2. pour chaque magasin qui a donné son adresse : contrôle la
        valorisation (moins de 20 jours), génère UNIQUEMENT les affiches des
        offres en cours à J et jamais envoyées à ce magasin
        (etiquette.html?export=1 → gefecBuildAuto) ;
     3. rien à mettre en place → aucun mail ; sinon dépôt des PDF, mail via
        la fonction Edge « send-campagne-mail », mémorisation des affiches
        envoyées (auto_sent) ;
     4. journal de la tournée (auto_runs) et, s'il y a des alertes, un mail
        à l'adresse d'alerte de l'administrateur.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const VALO_MAX_DAYS = 20;
  // rappel « valorisation à mettre à jour » : au-delà de 30 jours, toutes les 72 h
  const VALO_REMIND_DAYS = 30;
  const VALO_REMIND_EVERY_H = 72;
  const SITE_URL = 'https://y3n0-51100.github.io/Boite-Outils-GEFEC/';
  const BASE_MAX_HOURS = 48;
  const BASE_PHOTO_MAX_DAYS = 45;   // au-delà, les éco-participations de la base Excel sont réputées périmées
  const AFF_BUCKET = 'affiches';

  const DEFAULT_SUBJECT = 'Affiches à mettre en place le {date} — {operations} — {magasin}';
  const DEFAULT_MESSAGE = [
    'Bonjour,',
    '',
    "Voici les affiches à mettre en place aujourd'hui ({date}) : {operations}.",
    '',
    'Vous trouverez en pièces jointes {affiches} affiche(s) ({pages} page(s) à imprimer),',
    'uniquement pour les produits présents dans votre valorisation et qui démarrent maintenant.',
    '',
    "Il n'y a plus qu'à imprimer et à poser en rayon.",
    '',
    'Bonne vente,',
  ].join('\n');

  const isMail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim());
  const PLAN_LABEL = { tv: 'Plan Promo TV', pem: 'Plan Promo PEM' };

  /* Date du jour à Paris, quel que soit le fuseau de la machine (les
     serveurs GitHub tournent en UTC) */
  function parisDate(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(d || new Date());
  }
  function parisHour(d) {
    return +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
      .format(d || new Date());
  }
  const frDate = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'magasin';
  }
  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(magasin|code|plans|affiches|pages|date|operations)\}/g,
      (m, k) => vars[k] != null ? String(vars[k]) : m);
  }
  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }

  /* supabase-js ne remonte qu'un message générique : le motif réel est dans
     le corps de la réponse (même table de correspondance que campagne.js) */
  const FN_HINT = {
    401: 'session expirée — reconnectez-vous',
    403: 'action réservée au compte administrateur',
    404: "la fonction « send-campagne-mail » n'est pas déployée",
    504: "la fonction a dépassé son temps d'exécution",
    546: 'pièces jointes trop lourdes pour la fonction — passez ce magasin en A5',
  };
  async function fnErrorMessage(error) {
    const res = error && error.context;
    const status = res && res.status;
    let detail = '';
    try {
      if (res && typeof res.text === 'function') {
        const raw = (await res.text()).trim();
        if (raw) {
          try { const j = JSON.parse(raw); detail = j.error || j.message || raw; }
          catch (e) { detail = raw.slice(0, 300); }
        }
      }
    } catch (e) {}
    const parts = [];
    if (FN_HINT[status]) parts.push(FN_HINT[status]);
    if (detail && detail !== FN_HINT[status]) parts.push(detail);
    if (!parts.length) parts.push((error && error.message) || 'erreur inconnue');
    return parts.join(' — ') + (status ? ` (HTTP ${status})` : '');
  }

  /* ──────────────────────────────────────────────────────────────
     Création du moteur — sb : client Supabase connecté en admin
     ────────────────────────────────────────────────────────────── */
  function create(sb, env) {
    env = env || {};
    const log = typeof env.log === 'function' ? env.log : function () {};
    const host = env.host || document.body;

    /* ---------- Réglages ---------- */
    async function getSetting(key) {
      const { data, error } = await sb.from('app_settings').select('value').eq('key', key).maybeSingle();
      if (error) throw new Error('réglages : ' + error.message);
      return (data && data.value) || {};
    }
    async function loadSettings() {
      const a = await getSetting('auto');
      return {
        enabled: !!a.enabled,
        since: a.since || null,
        admin_email: a.admin_email || '',
        print_bg: a.print_bg !== false,
        subject: a.subject || DEFAULT_SUBJECT,
        message: a.message || DEFAULT_MESSAGE,
      };
    }
    async function saveSettings(v, userId) {
      const { error } = await sb.from('app_settings').upsert({
        key: 'auto', value: v, updated_at: new Date().toISOString(), updated_by: userId || null,
      });
      if (error) throw new Error('réglages non enregistrés : ' + error.message);
    }

    /* ---------- Opérations commerciales ---------- */
    async function loadOperations() {
      const { data, error } = await sb.from('operations').select('*').order('date_from', { ascending: true });
      if (error) throw new Error('opérations : ' + error.message);
      return data || [];
    }
    async function saveOperation(op, userId) {
      const row = {
        name: String(op.name || '').trim(), date_from: op.date_from, date_to: op.date_to,
        mask_promo: op.mask_promo || 'promo', mask_bonplan: op.mask_bonplan || 'bonplan',
        updated_at: new Date().toISOString(), updated_by: userId || null,
      };
      if (!row.name) throw new Error("nom de l'opération manquant");
      if (!row.date_from || !row.date_to) throw new Error('dates manquantes');
      if (row.date_to < row.date_from) throw new Error('la date de fin précède la date de début');
      const q = op.id ? sb.from('operations').update(row).eq('id', op.id) : sb.from('operations').insert(row);
      const { error } = await q;
      if (error) throw new Error('opération non enregistrée : ' + error.message);
    }
    async function deleteOperation(id) {
      const { error } = await sb.from('operations').delete().eq('id', id);
      if (error) throw new Error('suppression impossible : ' + error.message);
    }

    /* ---------- Magasins + valorisations ---------- */
    async function loadStores() {
      const { data: stores, error } = await sb.from('stores').select('id, name, region, emails, mail_enabled, mail_prefs, valo_reminded_at').order('id');
      if (error) throw new Error('magasins : ' + error.message);
      const metaBy = {};
      try {
        const { data } = await sb.from('valorisations').select('store_id, ean_count, updated_at');
        (data || []).forEach(m => { metaBy[m.store_id] = m; });
      } catch (e) {}
      const now = Date.now();
      return (stores || []).map(s => {
        const meta = metaBy[s.id] || null;
        const dt = meta && meta.updated_at ? new Date(meta.updated_at) : null;
        const ageDays = dt && !isNaN(dt.getTime()) ? Math.floor((now - dt.getTime()) / 864e5) : null;
        const valo = !meta ? 'never' : (ageDays != null && ageDays > VALO_MAX_DAYS ? 'late' : 'ok');
        // destinataires : les 1 à 3 adresses du magasin, s'il n'a pas coupé la réception
        const recipients = (s.emails || []).map(e => String(e || '').trim()).filter(isMail);
        return { ...s, meta, dt, ageDays, valo, recipients, auto: s.mail_enabled !== false && recipients.length > 0 };
      });
    }

    /* ---------- Plans publiés (TV / PEM) ---------- */
    let planCache = null;
    const isFolder = (p) => typeof p === 'string' && p.endsWith('/');
    async function planFiles() {
      const ids = ['plan-promo-tv', 'plan-promo-pem', 'plan-promo'];
      const metas = {};
      for (const id of ids) {
        try {
          const { data } = await sb.from('shared_docs').select('file_path, file_name, updated_at').eq('id', id).maybeSingle();
          metas[id] = data || null;
        } catch (e) { metas[id] = null; }
      }
      const token = ids.map(id => (metas[id] && metas[id].file_path ? metas[id].updated_at : '-')).join('|');
      if (planCache && planCache.token === token) return planCache;
      const plans = { tv: [], pem: [], auto: [] };
      const pick = async (id, slot) => {
        const meta = metas[id];
        if (!meta || !meta.file_path) return;
        let paths = [meta.file_path];
        if (isFolder(meta.file_path)) {
          const prefix = meta.file_path.replace(/\/$/, '');
          const { data } = await sb.storage.from('shared').list(prefix, { limit: 200 });
          paths = (data || []).filter(f => f && f.name && f.id !== null).map(f => prefix + '/' + f.name).sort();
        }
        for (const p of paths) {
          const { data, error } = await sb.storage.from('shared').download(p);
          if (error || !data) continue;
          plans[slot].push({ data: await data.arrayBuffer(), name: (p.split('/').pop() || id).replace(/^\d+_/, '') });
        }
      };
      await pick('plan-promo-tv', 'tv');
      await pick('plan-promo-pem', 'pem');
      if (!plans.tv.length && !plans.pem.length) await pick('plan-promo', 'auto');
      planCache = { plans, token, count: plans.tv.length + plans.pem.length + plans.auto.length };
      return planCache;
    }

    /* ---------- Masques perso publiés ---------- */
    let maskCache = null;
    async function loadMasks() {
      if (maskCache) return maskCache;
      let manifest = [];
      try {
        const { data, error } = await sb.storage.from('shared').download('masks/manifest.json');
        if (!error && data) {
          const j = JSON.parse(await data.text());
          manifest = Array.isArray(j.masks) ? j.masks : [];
        }
      } catch (e) {}
      const out = [];
      for (const m of manifest) {
        try {
          const a4 = m.a4 ? await sb.storage.from('shared').download(m.a4) : null;
          const a5 = m.a5 ? await sb.storage.from('shared').download(m.a5) : null;
          const d4 = a4 && !a4.error && a4.data ? await blobToDataURL(a4.data) : null;
          if (!d4) continue;
          out.push({
            id: m.id, name: m.name, calage: m.calage || 'promo', a4: d4,
            a5: a5 && !a5.error && a5.data ? await blobToDataURL(a5.data) : null,
          });
        } catch (e) {}
      }
      maskCache = out;
      return out;
    }
    function resetCaches() { planCache = null; maskCache = null; }

    /* ---------- Le générateur : etiquette.html, hors écran ---------- */
    let genFrameP = null;
    function genWin() {
      if (!genFrameP) {
        genFrameP = new Promise((res, rej) => {
          const fr = document.createElement('iframe');
          fr.id = 'genFrame';
          fr.title = "Générateur d'affiches";
          fr.setAttribute('aria-hidden', 'true');
          fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:1600px;border:0;z-index:-1';
          fr.addEventListener('load', () => res(fr));
          fr.addEventListener('error', () => rej(new Error("générateur d'affiches introuvable")));
          fr.src = 'etiquette.html?export=1';
          host.appendChild(fr);
          setTimeout(() => rej(new Error("le générateur d'affiches n'a pas démarré")), 90000);
        }).catch(e => { genFrameP = null; throw e; });
      }
      return genFrameP.then(fr => {
        const w = fr.contentWindow;
        if (!w || typeof w.gefecBuildAuto !== 'function') throw new Error("générateur d'affiches indisponible");
        return w;
      });
    }

    /* ---------- Calendrier des offres (sans magasin) ---------- */
    async function planOffers() {
      const [plans, masks] = await Promise.all([planFiles(), loadMasks()]);
      if (!plans.count) return [];
      const w = await genWin();
      const r = await w.gefecPlanOffers({ plans: plans.plans, plansToken: plans.token, masks });
      return r.offers || [];
    }

    /* ---------- Historique des affiches envoyées ---------- */
    async function sentKeys(storeId) {
      const keys = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('auto_sent').select('sent_key')
          .eq('store_id', storeId).range(from, from + 999);
        if (error) throw new Error('historique des envois : ' + error.message);
        (data || []).forEach(r => keys.push(r.sent_key));
        if (!data || data.length < 1000) break;
      }
      return keys;
    }

    /* ---------- Les affiches d'UN magasin pour UN jour ---------- */
    async function buildStore(store, date, o) {
      o = o || {};
      if (store.valo === 'never') throw new Error("ce magasin n'a pas déposé de valorisation");
      const [plans, masks, ops, settings] = await Promise.all([
        planFiles(), loadMasks(), o.operations || loadOperations(), o.settings || loadSettings(),
      ]);
      if (!plans.count) throw new Error('aucun plan promo TV ou PEM publié');
      const { data, error } = await sb.storage.from('valorisations').download(`${store.id}/valorisation.pdf`);
      if (error || !data) throw new Error('valorisation introuvable dans le stockage');
      const sent = o.ignoreSent ? [] : await sentKeys(store.id);
      const prefs = store.mail_prefs || {};
      const w = await genWin();
      return w.gefecBuildAuto({
        valo: await data.arrayBuffer(), valoName: `valorisation-${store.id}.pdf`,
        plans: plans.plans, plansToken: plans.token, masks,
        date, since: settings.since, operations: ops, sent,
        fmtTV: prefs.tv || 'a4', fmtPEM: prefs.pem || 'a4',
        printBg: settings.print_bg, onProgress: o.onStep, catchUp: !!o.catchUp,
        onlyPlans: o.onlyPlans || null, onlyEans: o.onlyEans || null,
      });
    }

    /* PDF d'un AUTRE realm (cadre générateur) : reconstruits ici */
    async function localBlobs(res) {
      for (const f of res.files) f.blob = new Blob([await f.blob.arrayBuffer()], { type: 'application/pdf' });
      return res;
    }

    async function sendMail(payload) {
      const { data, error } = await sb.functions.invoke('send-campagne-mail', { body: payload });
      if (error) throw new Error(await fnErrorMessage(error));
      if (data && (data.ok === false || data.error)) throw new Error(data.error || 'envoi non configuré');
      return data || {};
    }

    /* ---------- Dépôt + mail + mémorisation ---------- */
    async function deliver(store, date, res, o) {
      o = o || {};
      const recipients = (o.to ? [o.to] : (store.recipients || [])).filter(isMail);
      if (!recipients.length) throw new Error('adresse e-mail du magasin manquante');
      if (!o.to && store.mail_enabled === false) throw new Error('le magasin a désactivé la réception des mails');
      const settings = o.settings || await loadSettings();
      await localBlobs(res);
      const files = [];
      for (const f of res.files) {
        const path = `${store.id}/campagne/${f.id}.pdf`;
        const { error } = await sb.storage.from(AFF_BUCKET).upload(path, f.blob, { upsert: true, contentType: 'application/pdf' });
        if (error) throw new Error('dépôt du PDF : ' + error.message);
        files.push({
          path, label: f.label, pages: f.pages, products: f.products, bytes: f.blob.size,
          filename: `affiches-${f.plan}-${slugify(store.name || store.id)}-${date}.pdf`,
        });
      }
      const opsLabel = res.operations.length ? res.operations.join(' + ') : 'offres du plan promo';
      const plansLabel = res.files.map(f => f.label).join(' + ');
      const vars = {
        magasin: store.name || store.id, code: store.id, plans: plansLabel, operations: opsLabel,
        affiches: res.products, pages: res.pages, date: frDate(date),
      };
      const subject = fill(settings.subject, vars);
      // un mail par adresse : la fonction d'envoi n'accepte qu'un destinataire
      const sentTo = [], failed = [];
      let out = {};
      for (const to of recipients) {
        try {
          out = await sendMail({
            to, store_id: store.id, store_name: store.name || store.id,
            subject, message: fill(settings.message, vars),
            files: files.map(f => ({ path: f.path, filename: f.filename, label: f.label, pages: f.pages, products: f.products })),
          });
          sentTo.push(to);
        } catch (e) { failed.push(`${to} : ${(e && e.message) || e}`); }
      }
      if (!sentTo.length) throw new Error(failed.join(' · '));
      if (failed.length) log(`⚠️ ${store.id} : envoi refusé pour ${failed.join(' · ')}`);

      // le mail est parti : les affiches ne repartiront plus
      const rows = res.items.map(i => ({
        store_id: store.id, plan: i.plan, ean: i.ean, date_from: i.from, date_to: i.to,
        price: i.price, sent_key: i.key, mask: i.mask, operation_id: i.operation_id,
      }));
      for (let k = 0; k < rows.length; k += 500) {
        const { error } = await sb.from('auto_sent')
          .upsert(rows.slice(k, k + 500), { onConflict: 'store_id,sent_key', ignoreDuplicates: true });
        if (error) log(`⚠️ ${store.id} : historique non mémorisé — ${error.message}`);
      }
      // une ligne d'historique par adresse servie (lue par l'espace magasin)
      try {
        await sb.from('campagne_mails').insert(sentTo.map(to => ({
          store_id: store.id, email: to, subject, plans: plansLabel, files,
          pages: res.pages, products: res.products, valo_days: store.ageDays,
          provider: out.provider || null, sent_by: env.userId || null,
          auto: true, operations: opsLabel,
        })));
      } catch (e) {}
      return { to: sentTo.join(', '), files, subject, provider: out.provider, failed };
    }

    /* ---------- Fraîcheur de la base NOSICA ---------- */
    async function baseAgeHours() {
      try {
        const txt = await (await fetch('base-checked.js?t=' + Date.now(), { cache: 'no-store' })).text();
        const m = txt.match(/"(\d{4}-\d{2}-\d{2}T[^"]+)"/);
        return m ? Math.round((Date.now() - new Date(m[1]).getTime()) / 36e5) : null;
      } catch (e) { return null; }
    }
    /* âge (jours) des données de la base Excel NOSICA — seule source des
       éco-participations : la base peut être téléchargée chaque nuit sans
       que le site source ne la rafraîchisse (colonne DT_PHOTO) */
    async function basePhotoDays() {
      try {
        const txt = await (await fetch('base-checked.js?t=' + Date.now(), { cache: 'no-store' })).text();
        const m = txt.match(/BASE_PHOTO\s*=\s*"(\d{4}-\d{2}-\d{2})"/);
        return m ? Math.floor((Date.now() - new Date(m[1] + 'T00:00:00Z').getTime()) / 864e5) : null;
      } catch (e) { return null; }
    }

    /* ---------- Libellé des alertes ---------- */
    function alertText(a) {
      switch (a.type) {
        case 'valo_perimee': return `${a.store} : valorisation de ${a.days} jours (plus de ${VALO_MAX_DAYS}) — rien envoyé.`;
        case 'sans_valo': return `${a.store} : aucune valorisation déposée — rien envoyé.`;
        case 'echec': return `${a.store} : échec — ${a.error}`;
        case 'sans_operation': return `Offres démarrant le ${a.dates.map(frDate).join(', ')} sans opération commerciale : masques PROMO DU MOMENT / BON PLAN utilisés.`;
        case 'masque_introuvable': return `Masque(s) introuvable(s) : ${a.masks.join(', ')} — masque standard utilisé à la place.`;
        case 'offres_sans_dates': return `${a.n} offre(s) du plan sans dates lisibles : jamais envoyées automatiquement.`;
        case 'base_nosica': return `Base NOSICA non vérifiée depuis ${a.hours} h : la mise à jour quotidienne est en panne.`;
        case 'sans_plan': return 'Aucun plan promo TV ou PEM publié.';
        case 'offres_non_envoyees': return `${a.store ? a.store + ' : ' : ''}${a.n} offre(s) déjà commencée(s) jamais envoyée(s) (plan publié après leur date de début) : non envoyées automatiquement — utilisez « Envoyer maintenant » si besoin (${(a.items || []).slice(0, 5).map(i => i.ean + ' ' + (i.name || '') + ' du ' + frDate(i.from)).join(', ')}${a.n > 5 ? '…' : ''}).`;
        case 'eco_absente': return `${a.store ? a.store + ' : ' : ''}${a.n} affiche(s) envoyée(s) sans éco-participation (produit absent de la base NOSICA ou sans montant) : ${(a.items || []).slice(0, 6).map(i => i.ean + ' ' + (i.name || '')).join(', ')}${a.n > 6 ? '…' : ''}.`;
        case 'base_eco_ancienne': return `Base Excel NOSICA (éco-participations) datée de ${a.days} jours : le site source ne la rafraîchit plus — les produits récents n'ont pas d'éco-participation.`;
        case 'offres_a_verifier': return `${a.n} offre(s) au prix illisible ou incohérent avec la base NOSICA : non envoyées — à corriger dans le plan publié (${(a.items || []).slice(0, 5).map(i => i.ean + ' ' + (i.name || '')).join(', ')}${a.n > 5 ? '…' : ''}).`;
        default: return a.text || a.type;
      }
    }

    /* ──────────────────────────────────────────────────────────────
       LA TOURNÉE D'UN JOUR
       o = { date, trigger:'cron'|'manuel', force, onStore(store, état) }
       ────────────────────────────────────────────────────────────── */
    /* ---------- Rappel « valorisation à mettre à jour » ----------
       Valorisation de plus de 30 jours -> un mail à chaque adresse du
       magasin, renouvelé toutes les 72 h tant qu'elle n'est pas remplacée.
       Indépendant de l'envoi des affiches : il part même si l'envoi
       automatique est désactivé dans les réglages. Le magasin qui a coupé la
       réception des mails ne reçoit rien. La tournée passant une fois par jour
       à 6 h, une marge d'une heure évite de glisser au 4e jour. */
    async function sendValoReminders() {
      const now = Date.now();
      const out = { sent: 0, failed: [] };
      const stores = (await loadStores()).filter(s =>
        s.mail_enabled !== false && s.recipients.length &&
        s.ageDays != null && s.ageDays > VALO_REMIND_DAYS &&
        (!s.valo_reminded_at || now - new Date(s.valo_reminded_at).getTime() >= (VALO_REMIND_EVERY_H - 1) * 36e5));
      for (const s of stores) {
        const subject = `Rappel — votre valorisation a ${s.ageDays} jours — ${s.name || s.id}`;
        const message = [
          'Bonjour,', '',
          `La valorisation du magasin ${s.name || s.id} date du ${s.dt.toLocaleDateString('fr-FR')}, soit ${s.ageDays} jours.`,
          "Tant qu'elle n'est pas mise à jour, les affiches ne peuvent plus être préparées pour votre magasin.", '',
          `Connectez-vous à la Boîte à Outils GEFEC (${SITE_URL}) et déposez votre nouvelle valorisation PDF issue de NOSICA.`, '',
          `Ce rappel vous sera renvoyé toutes les ${VALO_REMIND_EVERY_H} heures jusqu'à la mise à jour.`,
        ].join('\n');
        const sentTo = [];
        for (const to of s.recipients) {
          try {
            await sendMail({ to, store_id: s.id, store_name: s.name || s.id, subject, message, files: [], no_attachment: true });
            sentTo.push(to);
          } catch (e) { out.failed.push(`${s.id} / ${to} : ${(e && e.message) || e}`); }
        }
        if (!sentTo.length) continue;
        out.sent++;
        log(`${s.id} : rappel valorisation (${s.ageDays} j) envoyé à ${sentTo.join(', ')}.`);
        try { await sb.from('stores').update({ valo_reminded_at: new Date().toISOString() }).eq('id', s.id); } catch (e) {}
        // visible dans l'historique de l'espace magasin
        try {
          await sb.from('campagne_mails').insert(sentTo.map(to => ({
            store_id: s.id, email: to, subject, plans: 'Rappel valorisation', operations: 'Rappel : valorisation à mettre à jour',
            products: 0, pages: 0, valo_days: s.ageDays, sent_by: env.userId || null, auto: true,
          })));
        } catch (e) {}
      }
      return out;
    }

    async function runDay(o) {
      o = o || {};
      const date = o.date || parisDate();
      const trigger = o.trigger || 'manuel';
      const onStore = typeof o.onStore === 'function' ? o.onStore : function () {};
      const settings = await loadSettings();

      // rappels de valorisation : avant tout le reste, quel que soit l'état de l'envoi auto
      try {
        const r = await sendValoReminders();
        if (r.sent) log(`Rappels de valorisation : ${r.sent} magasin(s).`);
        r.failed.forEach(f => log('⚠️ rappel non envoyé — ' + f));
      } catch (e) { log('⚠️ rappels de valorisation — ' + ((e && e.message) || e)); }

      if (trigger === 'cron' && !settings.enabled) {
        log('Envoi automatique désactivé dans les réglages : rien à faire.');
        return { skipped: 'inactif' };
      }
      if (trigger === 'cron' && !o.force) {
        // une seule tournée automatique réussie par jour (le planificateur
        // GitHub passe deux fois pour couvrir l'heure d'été et d'hiver)
        const { data } = await sb.from('auto_runs').select('id, status, started_at')
          .eq('run_date', date).eq('trigger', 'cron').neq('status', 'echec');
        const live = (data || []).filter(r => r.status !== 'en_cours' || Date.now() - new Date(r.started_at).getTime() < 2 * 36e5);
        if (live.length) { log(`Tournée du ${date} déjà faite : rien à faire.`); return { skipped: 'deja_faite' }; }
      }

      const { data: run, error: rerr } = await sb.from('auto_runs')
        .insert({ run_date: date, trigger, status: 'en_cours', run_by: env.userId || null })
        .select('id').single();
      if (rerr) throw new Error('journal des tournées : ' + rerr.message);

      const alerts = [];
      const seenAlert = new Set();
      const pushAlert = (a) => { const k = JSON.stringify(a); if (!seenAlert.has(k)) { seenAlert.add(k); alerts.push(a); } };
      const report = [];
      let storesSent = 0, affiches = 0, fatal = null;

      try {
        const hours = await baseAgeHours();
        if (hours != null && hours > BASE_MAX_HOURS) pushAlert({ type: 'base_nosica', hours });
        const photoDays = await basePhotoDays();
        if (photoDays != null && photoDays > BASE_PHOTO_MAX_DAYS) pushAlert({ type: 'base_eco_ancienne', days: photoDays });
        // offres déjà signalées comme « non envoyées » lors des tournées
        // précédentes : signalées une seule fois, pas tous les jours
        const alreadyMissed = new Set();
        try {
          const { data: past } = await sb.from('auto_runs').select('details').neq('id', run.id)
            .gte('run_date', addDays(date, -60));
          for (const r of (past || [])) for (const a of ((r.details && r.details.alerts) || []))
            if (a.type === 'offres_non_envoyees') for (const i of (a.items || [])) alreadyMissed.add((a.store || '') + '|' + i.ean + '|' + i.from);
        } catch (e) {}

        const plans = await planFiles();
        if (!plans.count) pushAlert({ type: 'sans_plan' });
        const ops = await loadOperations();
        const stores = (await loadStores()).filter(s => s.auto);
        log(`Tournée du ${date} — ${stores.length} magasin(s) inscrit(s) à l'envoi automatique.`);
        // un seul mail de tournée par magasin et par jour : un magasin déjà
        // servi par une tournée de ce jour (automatique ou manuelle) est passé
        const served = new Set();
        if (!o.force) {
          const { data: done } = await sb.from('auto_runs').select('id, details').eq('run_date', date).neq('id', run.id);
          for (const r of (done || [])) for (const st of ((r.details && r.details.stores) || [])) if (st.status === 'envoye') served.add(st.id);
        }

        for (const s of (plans.count ? stores : [])) {
          const name = s.name || s.id;
          if (served.has(s.id)) {
            log(`${s.id} : déjà servi aujourd'hui, un seul mail par jour.`);
            report.push({ id: s.id, name, status: 'deja_servi' }); onStore(s, 'deja_servi'); continue;
          }
          if (s.valo === 'never') {
            pushAlert({ type: 'sans_valo', store: name });
            report.push({ id: s.id, name, status: 'sans_valo' }); onStore(s, 'sans_valo'); continue;
          }
          if (s.valo === 'late') {
            pushAlert({ type: 'valo_perimee', store: name, days: s.ageDays });
            report.push({ id: s.id, name, status: 'valo_perimee', days: s.ageDays }); onStore(s, 'valo_perimee'); continue;
          }
          try {
            onStore(s, 'generation');
            const res = await buildStore(s, date, { operations: ops, settings });
            for (const a of res.alerts) {
              if (a.type === 'eco_absente') { a.store = name; pushAlert(a); continue; }
              if (a.type !== 'offres_non_envoyees') { pushAlert(a); continue; }
              const fresh = (a.items || []).filter(i => !alreadyMissed.has(name + '|' + i.ean + '|' + i.from));
              if (fresh.length) pushAlert({ type: 'offres_non_envoyees', store: name, n: fresh.length, items: fresh });
            }
            if (!res.files.length) {
              log(`${s.id} : rien à mettre en place.`);
              report.push({ id: s.id, name, status: 'rien' }); onStore(s, 'rien'); continue;
            }
            onStore(s, 'envoi');
            const d = await deliver(s, date, res, { settings });
            storesSent++; affiches += res.products;
            log(`${s.id} : ${res.products} affiche(s) envoyée(s) à ${d.to}.`);
            report.push({ id: s.id, name, status: 'envoye', affiches: res.products, pages: res.pages, to: d.to, operations: res.operations });
            onStore(s, 'envoye', res);
          } catch (e) {
            const msg = (e && e.message) || String(e);
            log(`${s.id} : ÉCHEC — ${msg}`);
            pushAlert({ type: 'echec', store: name, error: msg });
            report.push({ id: s.id, name, status: 'echec', error: msg }); onStore(s, 'echec', msg);
          }
        }
      } catch (e) {
        fatal = (e && e.message) || String(e);
        log('ÉCHEC de la tournée — ' + fatal);
      }

      const status = fatal ? 'echec' : (alerts.length ? 'alertes' : 'ok');
      const texts = alerts.map(alertText);
      if (fatal) texts.unshift('Tournée interrompue : ' + fatal);
      await sb.from('auto_runs').update({
        status, stores_sent: storesSent, affiches,
        details: { stores: report, alerts, texts }, finished_at: new Date().toISOString(),
      }).eq('id', run.id);

      // alerte administrateur : uniquement s'il y a quelque chose à signaler
      if (texts.length && isMail(settings.admin_email)) {
        try {
          await sendMail({
            to: settings.admin_email, store_id: '', store_name: 'Administration',
            subject: `⚠️ Envoi automatique des affiches du ${frDate(date)} — ${texts.length} alerte(s)`,
            message: [
              'Bonjour,', '',
              `Tournée du ${frDate(date)} : ${storesSent} magasin(s) servi(s), ${affiches} affiche(s) envoyée(s).`, '',
              'Points à vérifier :', ...texts.map(t => '• ' + t), '',
              'Le détail est dans l\'outil « Envoi Campagne Mail », onglet Historique.',
            ].join('\n'),
            files: [], no_attachment: true,
          });
        } catch (e) { log("⚠️ mail d'alerte non envoyé — " + ((e && e.message) || e)); }
      }
      if (fatal) throw new Error(fatal);
      return { runId: run.id, status, storesSent, affiches, alerts: texts, report };
    }

    return {
      parisDate, parisHour, addDays, frDate, isMail, slugify, alertText,
      loadSettings, saveSettings, loadOperations, saveOperation, deleteOperation,
      loadStores, planFiles, loadMasks, resetCaches, planOffers, sentKeys,
      buildStore, localBlobs, deliver, runDay, sendMail, genWin, sendValoReminders,
      VALO_MAX_DAYS, DEFAULT_SUBJECT, DEFAULT_MESSAGE, PLAN_LABEL,
    };
  }

  window.GefecAuto = { create };
})();
