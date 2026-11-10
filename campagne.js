/* ════════════════════════════════════════════════════════════════
   ENVOI CAMPAGNE MAIL — outil administrateur
   ────────────────────────────────────────────────────────────────
   Trois onglets :
     · Opérations        — périodes commerciales (nom, du, au, masque PROMO,
                           masque BON PLAN) + réglages de l'envoi automatique ;
     · Envois programmés — calendrier des offres TV / PEM par jour de
                           démarrage, magasins (aperçu, envoi immédiat,
                           campagne complète « ancien mode ») ;
     · Historique        — tournées (auto_runs) et derniers mails.
   Le travail réel (génération, envoi, mémorisation) est fait par
   auto-engine.js, le même moteur que la tournée quotidienne de 6 h.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const cfg = window.GEFEC_CONFIG || {};
  const VALO_MAX_DAYS = 20;

  let sb = null, ME = null, E = null;   // client Supabase, utilisateur, moteur
  let SETTINGS = null, OPS = [], STORES = [], MASKS = [], OFFERS = [];
  let busy = false;

  /* ---------- Outils ---------- */
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim());
  const fmtPrice = (n) => n == null ? '–' : (+n).toFixed(2).replace('.', ',') + ' €';
  const dayName = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const frDate = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  const frDT = (ts) => ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  function relAge(dt) {
    const d = Math.floor((Date.now() - dt.getTime()) / 864e5);
    if (d <= 0) return "aujourd'hui";
    if (d === 1) return 'hier';
    if (d < 7) return `il y a ${d} jours`;
    const w = Math.floor(d / 7);
    return w === 1 ? 'il y a 1 semaine' : `il y a ${w} semaines`;
  }
  let toastTimer = null;
  function toast(msg, err) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.toggle('is-error', !!err);
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-show'), 3600);
  }
  function setMsg(id, cls, txt) { const m = el(id); m.className = 'msg' + (cls ? ' is-' + cls : ''); m.textContent = txt || ''; }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function guard(html) {
    const g = el('guard'); g.innerHTML = html; g.hidden = false;
    el('tabs').hidden = true;
    document.querySelectorAll('.tabs_pane').forEach(p => { p.hidden = true; });
  }

  /* La coque a déjà un client Supabase authentifié : on le réutilise. */
  function getSb() {
    try {
      if (window.parent && window.parent !== window && window.parent.GEFEC_SB) return window.parent.GEFEC_SB;
    } catch (e) {}
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_KEY) return null;
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: false },
    });
  }

  /* ---------- Onglets ---------- */
  function showTab(name) {
    document.querySelectorAll('.tabs_link').forEach(b => b.classList.toggle('is-active', b.dataset.tab === name));
    document.querySelectorAll('.tabs_pane').forEach(p => { p.hidden = p.dataset.pane !== name; });
    try { localStorage.setItem('gefec_campagne_tab', name); } catch (e) {}
    if (name === 'histo') loadHistory();
  }

  /* ---------- Masques (officiels + perso) ---------- */
  const maskName = (id) => id === 'promo' ? 'PROMO DU MOMENT' : id === 'bonplan' ? 'BON PLAN'
    : ((MASKS.find(m => m.id === id) || {}).name || id + ' (introuvable)');
  function fillMaskSelect(sel, def) {
    const prev = sel.value;
    sel.innerHTML = [['promo', 'PROMO DU MOMENT'], ['bonplan', 'BON PLAN'],
      ...MASKS.map(m => [m.id, m.name + (m.a5 ? '' : ' (A4 seul)')])]
      .map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === prev) ? prev : def;
  }

  /* ════════════════════════ OPÉRATIONS ════════════════════════ */
  async function loadOps() {
    try { OPS = await E.loadOperations(); }
    catch (e) { el('opList').innerHTML = `<div class="empty">Erreur : ${esc(e.message)}</div>`; return; }
    renderOps();
  }
  function opState(op, today) {
    if (op.date_to < today) return ['Terminée', ''];
    if (op.date_from <= today) return ['En cours', 'is-ok'];
    return ['À venir', 'is-info'];
  }
  function renderOps() {
    const today = E.parisDate();
    el('cntOps').textContent = OPS.filter(o => o.date_to >= today).length;
    renderTimeline(today);
    if (!OPS.length) {
      el('opList').innerHTML = '<div class="empty">Aucune opération : les offres partiront sur PROMO DU MOMENT / BON PLAN.</div>';
      return;
    }
    // à venir et en cours d'abord, terminées ensuite
    const list = [...OPS].sort((a, b) => (a.date_to < today) - (b.date_to < today) || a.date_from.localeCompare(b.date_from));
    el('opList').innerHTML = list.map(op => {
      const [st, cls] = opState(op, today);
      const overlap = OPS.some(o => o.id !== op.id && o.date_from <= op.date_to && op.date_from <= o.date_to);
      return `<div class="op_item" data-id="${op.id}">
        <div>
          <div class="op_name">${esc(op.name)}</div>
          <div class="op_dates">du ${frDate(op.date_from)} au ${frDate(op.date_to)}${overlap ? ' · <span style="color:var(--warn)">chevauche une autre opération</span>' : ''}</div>
        </div>
        <span class="tag ${cls}">${st}</span>
        <div class="op_masks">
          <span class="tag is-promo" title="Masque des offres PROMO">PROMO → ${esc(maskName(op.mask_promo))}</span>
          <span class="tag is-bonplan" title="Masque des offres BON PLAN">BON PLAN → ${esc(maskName(op.mask_bonplan))}</span>
        </div>
        <div class="op_actions">
          <button class="button is-small" data-edit type="button">Modifier</button>
          <button class="button is-small is-danger" data-del type="button" aria-label="Supprimer">🗑</button>
        </div>
      </div>`;
    }).join('');
    el('opList').querySelectorAll('.op_item').forEach(row => {
      const op = OPS.find(o => String(o.id) === row.dataset.id);
      row.querySelector('[data-edit]').addEventListener('click', () => editOp(op));
      row.querySelector('[data-del]').addEventListener('click', () => delOp(op));
    });
  }
  /* frise : de J-7 à J+60 */
  function renderTimeline(today) {
    const start = E.addDays(today, -7), span = 68;
    const pos = (iso) => {
      const d = (new Date(iso + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / 864e5;
      return Math.max(0, Math.min(100, d / span * 100));
    };
    const visible = OPS.filter(o => o.date_to >= start && o.date_from <= E.addDays(start, span));
    let ticks = '';
    for (let i = 0; i <= span; i += 7) {
      const d = E.addDays(start, i);
      ticks += `<span class="timeline_tick" style="left:${i / span * 100}%">${d.slice(8, 10)}/${d.slice(5, 7)}</span>`;
    }
    // une ligne par opération qui se chevauche avec la précédente
    const lanes = [];
    const bars = visible.map(op => {
      let lane = lanes.findIndex(end => end < op.date_from);
      if (lane < 0) { lane = lanes.length; lanes.push(op.date_to); } else lanes[lane] = op.date_to;
      const l = pos(op.date_from), r = pos(E.addDays(op.date_to, 1));
      return `<div class="timeline_bar ${op.date_to < today ? 'is-past' : ''}" data-id="${op.id}"
        style="left:${l}%;width:${Math.max(r - l, 1.2)}%;top:${7 + lane * 32}px"
        title="${esc(op.name)} — du ${frDate(op.date_from)} au ${frDate(op.date_to)}">${esc(op.name)}</div>`;
    }).join('');
    const h = Math.max(40, 14 + lanes.length * 32);
    el('timeline').innerHTML = `<div class="timeline_scale">${ticks}</div>
      <div class="timeline_track" style="height:${h}px">${bars}
        <div class="timeline_today" style="left:${pos(today)}%"><span class="timeline_today-label">Aujourd'hui</span></div>
      </div>`;
    el('timeline').querySelectorAll('.timeline_bar').forEach(b =>
      b.addEventListener('click', () => editOp(OPS.find(o => String(o.id) === b.dataset.id))));
  }
  function resetOpForm() {
    el('opId').value = ''; el('opName').value = '';
    el('opFrom').value = ''; el('opTo').value = '';
    el('opMaskPromo').value = 'promo'; el('opMaskBonplan').value = 'bonplan';
    el('opSave').textContent = "＋ Ajouter l'opération";
    el('opCancel').hidden = true;
  }
  function editOp(op) {
    if (!op) return;
    el('opId').value = op.id; el('opName').value = op.name;
    el('opFrom').value = op.date_from; el('opTo').value = op.date_to;
    el('opMaskPromo').value = op.mask_promo; el('opMaskBonplan').value = op.mask_bonplan;
    el('opSave').textContent = '✓ Enregistrer les modifications';
    el('opCancel').hidden = false;
    setMsg('opMsg', '', '');
    el('opName').focus();
    el('opForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function saveOp() {
    const op = {
      id: el('opId').value ? +el('opId').value : null,
      name: el('opName').value, date_from: el('opFrom').value, date_to: el('opTo').value,
      mask_promo: el('opMaskPromo').value, mask_bonplan: el('opMaskBonplan').value,
    };
    try {
      await E.saveOperation(op, ME.userId);
      setMsg('opMsg', 'ok', op.id ? 'Opération modifiée ✓' : 'Opération ajoutée ✓');
      resetOpForm();
      await loadOps();
      renderSchedule();
    } catch (e) { setMsg('opMsg', 'err', e.message); }
  }
  async function delOp(op) {
    if (!op || !confirm(`Supprimer l'opération « ${op.name} » ?`)) return;
    try { await E.deleteOperation(op.id); toast('Opération supprimée'); await loadOps(); renderSchedule(); }
    catch (e) { toast(e.message, true); }
  }

  /* ---------- Réglages de l'envoi automatique ---------- */
  function renderChip() {
    const on = SETTINGS && SETTINGS.enabled;
    el('autoChip').className = 'status-chip ' + (on ? 'is-on' : 'is-off');
    el('autoChipTxt').textContent = on ? 'Envoi automatique actif · 6 h' : 'Envoi automatique désactivé';
  }
  async function loadSettingsUI() {
    SETTINGS = await E.loadSettings();
    el('setEnabled').checked = SETTINGS.enabled;
    el('setSince').value = SETTINGS.since || '';
    el('setAdmin').value = SETTINGS.admin_email || '';
    el('setBg').value = SETTINGS.print_bg ? '1' : '0';
    el('setSubject').value = SETTINGS.subject;
    el('setMessage').value = SETTINGS.message;
    renderChip();
  }
  async function saveSettingsUI() {
    const admin = el('setAdmin').value.trim();
    if (admin && !isMail(admin)) { setMsg('setMsg', 'err', "Adresse d'alerte invalide."); return; }
    const enabled = el('setEnabled').checked;
    // première activation sans date : mise en service aujourd'hui, pour ne
    // pas inonder les magasins d'affiches déjà en place
    let since = el('setSince').value || null;
    if (enabled && !since) { since = E.parisDate(); el('setSince').value = since; }
    const v = {
      enabled, since, admin_email: admin, print_bg: el('setBg').value === '1',
      subject: el('setSubject').value.trim() || E.DEFAULT_SUBJECT,
      message: el('setMessage').value.trim() || E.DEFAULT_MESSAGE,
    };
    try {
      await E.saveSettings(v, ME.userId);
      SETTINGS = v; renderChip();
      setMsg('setMsg', 'ok', 'Réglages enregistrés ✓');
    } catch (e) { setMsg('setMsg', 'err', e.message); }
  }
  async function loadLastRun() {
    try {
      const { data } = await sb.from('auto_runs').select('run_date, trigger, status, stores_sent, affiches, finished_at, started_at')
        .order('started_at', { ascending: false }).limit(1);
      const r = data && data[0];
      el('lastRunTxt').textContent = r
        ? `Dernière tournée : ${frDT(r.finished_at || r.started_at)} (${r.trigger === 'cron' ? 'automatique' : 'manuelle'}) — ${RUN_STATUS[r.status] || r.status}, ${r.stores_sent} magasin(s), ${r.affiches} affiche(s)`
        : 'Dernière tournée : aucune pour le moment';
    } catch (e) {}
  }

  /* ════════════════════════ ENVOIS PROGRAMMÉS ════════════════════════ */
  async function loadOffers() {
    setMsg('planMsg', '', 'Lecture des plans promo publiés…');
    el('schedule').innerHTML = '<div class="empty">Lecture des plans promo…</div>';
    try {
      OFFERS = await E.planOffers();
      const tv = OFFERS.filter(o => o.plan === 'tv').length, pem = OFFERS.length - tv;
      if (!OFFERS.length) setMsg('planMsg', 'err', 'Aucun plan TV ou PEM publié.');
      else setMsg('planMsg', 'ok', `${tv} offre(s) TV · ${pem} offre(s) PEM`);
    } catch (e) {
      OFFERS = [];
      setMsg('planMsg', 'err', 'Plans promo : ' + e.message);
    }
    renderSchedule();
  }
  function renderSchedule() {
    const host = el('schedule');
    if (!E) return;
    const today = E.parisDate();
    const since = SETTINGS && SETTINGS.since;
    const horizon = E.addDays(today, 45);
    const byDay = new Map();
    let dated = 0;
    for (const o of OFFERS) {
      if (!o.from || !o.to) continue;
      dated++;
      // déjà commencée : elle part à la prochaine tournée si elle n'est pas
      // encore partie (et si elle a démarré après la mise en service)
      let day = o.from;
      if (o.to < today) continue;
      if (since && o.from < since) continue;
      if (day < today) day = today;
      if (day > horizon) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(o);
    }
    const days = [...byDay.keys()].sort();
    el('cntDays').textContent = days.length;
    if (!OFFERS.length) { host.innerHTML = '<div class="empty">Publiez les plans TV et PEM dans ⚙️ Réglages pour voir les envois à venir.</div>'; return; }
    if (!days.length) { host.innerHTML = `<div class="empty">Aucune offre ne démarre d'ici 45 jours${since ? ` (mise en service le ${frDate(since)})` : ''}.</div>`; return; }
    host.innerHTML = days.map(day => {
      const list = byDay.get(day).sort((a, b) => a.plan.localeCompare(b.plan) || (a.cat || '').localeCompare(b.cat || '') || (a.name || '').localeCompare(b.name || ''));
      const tv = list.filter(o => o.plan === 'tv').length, pem = list.length - tv;
      const nPromo = list.filter(o => o.kind === 'promo').length;
      const opNames = [...new Set(list.map(o => (opFor(o.from) || {}).name || '—'))];
      const rows = list.map(o => {
        const op = opFor(o.from);
        const mask = op ? (o.kind === 'promo' ? op.mask_promo : op.mask_bonplan) : o.kind;
        return `<tr>
          <td>${o.plan === 'tv' ? 'TV' : 'PEM'}</td>
          <td>${esc(o.cat)}<br><b>${esc(o.brand)} ${esc(o.name)}</b></td>
          <td>${esc(o.ean)}</td>
          <td class="is-num">${fmtPrice(o.price)}${o.kind === 'promo' ? `<br><s style="color:var(--text-3)">${fmtPrice(o.base)}</s>` : ''}</td>
          <td><span class="tag ${o.kind === 'promo' ? 'is-promo' : 'is-bonplan'}">${o.kind === 'promo' ? 'PROMO' : 'BON PLAN'}</span></td>
          <td>${esc(maskName(mask))}</td>
          <td>${frDate(o.from)} → ${frDate(o.to)}</td>
        </tr>`;
      }).join('');
      return `<details class="schedule_day ${day === today ? 'is-today' : ''}">
        <summary>
          <div class="schedule_date">${day === today ? "Aujourd'hui" : frDate(day)}<small>${esc(dayName(day))}</small></div>
          <div class="schedule_info">
            <span class="schedule_op">${esc(opNames.join(' + '))}</span>
            ${opNames.includes('—') ? '<span class="tag is-warn">sans opération → masques standard</span>' : ''}
            <span class="tag is-promo">${nPromo} promo</span><span class="tag is-bonplan">${list.length - nPromo} bon plan</span>
          </div>
          <div class="schedule_count">${tv ? tv + ' TV' : ''}${tv && pem ? ' · ' : ''}${pem ? pem + ' PEM' : ''}</div>
        </summary>
        <div class="schedule_body">
          <table class="table_component">
            <thead><tr><th>Plan</th><th>Produit</th><th>EAN</th><th class="is-num">Prix</th><th>Type</th><th>Masque</th><th>Période</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
    }).join('');
  }
  function opFor(iso) {
    const hits = OPS.filter(op => op.date_from <= iso && iso <= op.date_to);
    hits.sort((a, b) => b.date_from.localeCompare(a.date_from));
    return hits[0] || null;
  }

  /* ---------- Magasins ---------- */
  async function loadStores() {
    const host = el('stores');
    host.innerHTML = '<div class="empty">Chargement…</div>';
    try {
      STORES = await E.loadStores();
      const lastBy = {};
      try {
        const { data } = await sb.from('campagne_mails').select('store_id, email, sent_at, products, plans, auto, operations')
          .order('sent_at', { ascending: false }).limit(500);
        (data || []).forEach(m => { if (!lastBy[m.store_id]) lastBy[m.store_id] = m; });
      } catch (e) {}
      STORES.forEach(s => { s.last = lastBy[s.id] || null; });
      renderStores();
    } catch (e) {
      host.innerHTML = `<div class="empty">Erreur : ${esc(e.message || e)}</div>`;
    }
  }
  function renderPills() {
    const n = (f) => STORES.filter(f).length;
    el('pills').innerHTML = `
      <span class="pill is-ok">Inscrits à l'envoi auto<b>${n(s => s.auto)}</b></span>
      <span class="pill is-ok">Valorisation à jour<b>${n(s => s.valo === 'ok')}</b></span>
      <span class="pill is-warn">Périmée (&gt; ${VALO_MAX_DAYS} j)<b>${n(s => s.valo === 'late')}</b></span>
      <span class="pill is-ko">Jamais déposée<b>${n(s => s.valo === 'never')}</b></span>
      <span class="pill">Total<b>${STORES.length}</b></span>`;
  }
  function renderStores() {
    renderPills();
    if (!STORES.length) { el('stores').innerHTML = '<div class="empty">Aucun magasin enregistré.</div>'; return; }
    el('stores').innerHTML = STORES.map(s => {
      const badge = s.valo === 'ok'
        ? `<span class="tag is-ok">Valo ${s.ageDays === 0 ? 'du jour' : s.ageDays + ' j'}</span>`
        : s.valo === 'late' ? `<span class="tag is-warn">Périmée · ${s.ageDays} j</span>`
          : '<span class="tag is-ko">Sans valo</span>';
      const sub = [s.id, s.region, s.meta && s.meta.ean_count != null ? s.meta.ean_count + ' EAN' : '',
        s.email === 'REFUSE' ? 'ne souhaite pas de mails' : (!s.auto ? 'pas inscrit à l’envoi auto' : '')]
        .filter(Boolean).join(' · ');
      const last = s.last
        ? `✉️ ${s.last.auto ? 'envoi auto' : 'campagne'} ${relAge(new Date(s.last.sent_at))} — ${esc(s.last.operations || s.last.plans || '')} (${s.last.products || 0} affiche(s))`
        : '';
      const blocked = s.valo !== 'ok';
      return `<div class="store_item" data-id="${esc(s.id)}">
        ${badge}
        <div class="store_main">
          <div class="store_name">${esc(s.name || s.id)}</div>
          <div class="store_sub">${esc(sub)}</div>
          ${last ? `<div class="store_last">${last}</div>` : ''}
        </div>
        <input class="form_input" type="email" data-mail spellcheck="false" autocapitalize="none"
          placeholder="${s.email === 'REFUSE' ? 'Ne souhaite pas de mails' : 'adresse du magasin'}"
          value="${esc(s.email === 'REFUSE' ? '' : (s.email || ''))}" aria-label="Adresse e-mail du magasin">
        <div class="store_actions">
          ${s.valo !== 'ok' ? '<button class="button is-small" data-remind type="button">🔔 Relancer</button>' : ''}
          <button class="button is-small" data-preview type="button"${blocked ? ' disabled' : ''} title="Télécharger les affiches du jour choisi">👁 Aperçu</button>
          <button class="button is-small is-primary" data-send type="button"${blocked ? ' disabled' : ''}>✉️ Envoyer maintenant</button>
          <button class="button is-small" data-legacy type="button"${blocked ? ' disabled' : ''} title="Campagne complète (ancien mode)">📦</button>
        </div>
        <div class="progress_bar" hidden><i></i></div>
        <div class="store_status"></div>
      </div>`;
    }).join('');
    el('stores').querySelectorAll('.store_item').forEach(row => {
      const s = STORES.find(x => String(x.id) === row.dataset.id);
      row.querySelector('[data-preview]').addEventListener('click', () => preview(s));
      row.querySelector('[data-send]').addEventListener('click', () => sendNow(s));
      row.querySelector('[data-legacy]').addEventListener('click', () => legacyOne(s));
      const r = row.querySelector('[data-remind]');
      if (r) r.addEventListener('click', () => remind(s));
      const inp = row.querySelector('[data-mail]');
      inp.addEventListener('change', () => saveEmail(s, inp.value));
    });
    syncLegacyBulk();
  }
  const rowOf = (s) => el('stores').querySelector(`.store_item[data-id="${CSS.escape(String(s.id))}"]`);
  function setStatus(s, cls, txt) {
    const row = rowOf(s); if (!row) return;
    const st = row.querySelector('.store_status');
    st.className = 'store_status' + (cls ? ' is-' + cls : ''); st.textContent = txt || '';
  }
  function setBar(s, pct) {
    const row = rowOf(s); if (!row) return;
    const bar = row.querySelector('.progress_bar');
    bar.hidden = pct == null;
    bar.querySelector('i').style.width = (pct || 0) + '%';
  }
  const PHASE = { libs: 'préparation du générateur…', valo: 'lecture de la valorisation…', plans: 'lecture des plans promo…', match: 'croisement plan × valorisation…' };
  const stepper = (s) => (phase, i, n) => {
    if (phase === 'pdf') { setStatus(s, 'run', n ? `affiche ${i}/${n}` : 'mise en page…'); setBar(s, n ? Math.round(i / n * 100) : 0); }
    else setStatus(s, 'run', PHASE[phase] || 'en cours…');
  };
  function lock(on) {
    busy = on;
    el('btnRunNow').disabled = on;
    el('btnReload').disabled = on;
    el('stores').querySelectorAll('button').forEach(b => {
      const s = STORES.find(x => String(x.id) === b.closest('.store_item').dataset.id);
      b.disabled = on || (!b.hasAttribute('data-remind') && (!s || s.valo !== 'ok'));
    });
    syncLegacyBulk();
  }

  async function saveEmail(s, v) {
    v = String(v || '').trim();
    if (v && !isMail(v)) { setStatus(s, 'ko', 'Adresse e-mail invalide.'); return; }
    const val = v || null;
    if ((s.email || null) === val) return;
    const { error } = await sb.from('stores').update({ email: val }).eq('id', s.id);
    if (error) { setStatus(s, 'ko', 'Adresse non mémorisée : ' + error.message); return; }
    s.email = val; s.auto = isMail(val);
    setStatus(s, 'ok', val ? 'Adresse mémorisée ✓ — magasin inscrit à l’envoi automatique' : 'Adresse retirée.');
    renderPills();
  }

  /* Aperçu : les affiches que le magasin recevra le jour choisi (compte
     tenu de ce qui lui a déjà été envoyé), téléchargées sans rien envoyer */
  async function preview(s) {
    if (busy) return;
    const date = el('previewDate').value || E.parisDate();
    lock(true); setBar(s, 0);
    try {
      const res = await E.buildStore(s, date, { onStep: stepper(s), operations: OPS, settings: SETTINGS });
      setBar(s, null);
      if (!res.files.length) { setStatus(s, 'ok', `Rien à mettre en place le ${frDate(date)} pour ce magasin.`); return; }
      await E.localBlobs(res);
      for (const f of res.files) download(f.blob, `apercu-${f.plan}-${E.slugify(s.name || s.id)}-${date}.pdf`);
      setStatus(s, 'ok', `Aperçu du ${frDate(date)} : ${res.products} affiche(s), ${res.pages} page(s) — ${res.operations.join(' + ') || 'masques standard'}`);
    } catch (e) {
      setBar(s, null); setStatus(s, 'ko', 'Échec : ' + e.message);
    } finally { lock(false); }
  }

  async function sendNow(s) {
    if (busy) return;
    const row = rowOf(s);
    const to = (row.querySelector('[data-mail]').value || '').trim();
    if (!isMail(to)) { setStatus(s, 'ko', 'Adresse e-mail du magasin manquante ou invalide.'); return; }
    await saveEmail(s, to);
    const date = E.parisDate();
    lock(true); setBar(s, 0);
    try {
      const res = await E.buildStore(s, date, { onStep: stepper(s), operations: OPS, settings: SETTINGS });
      setBar(s, null);
      if (!res.files.length) { setStatus(s, 'ok', "Rien à mettre en place aujourd'hui qui ne soit déjà parti : aucun mail envoyé."); return; }
      setStatus(s, 'run', `envoi du mail à ${to}…`);
      const d = await E.deliver(s, date, res, { settings: SETTINGS });
      setStatus(s, 'ok', `Mail envoyé à ${d.to} — ${res.products} affiche(s), ${res.pages} page(s) · ${res.operations.join(' + ') || 'masques standard'}`);
      toast(`Affiches envoyées à ${s.name || s.id} ✓`);
    } catch (e) {
      setBar(s, null); setStatus(s, 'ko', 'Échec : ' + e.message); toast('Échec : ' + e.message, true);
    } finally { lock(false); }
  }

  async function runNow() {
    if (busy) return;
    const n = STORES.filter(s => s.auto).length;
    if (!confirm(`Lancer la tournée d'aujourd'hui maintenant ?\n${n} magasin(s) inscrit(s) recevront les affiches à mettre en place qui ne leur ont pas encore été envoyées.`)) return;
    lock(true);
    const LBL = { generation: ['run', 'génération des affiches…'], envoi: ['run', 'envoi du mail…'], rien: ['ok', 'rien à mettre en place'], envoye: ['ok', 'affiches envoyées ✓'], valo_perimee: ['ko', 'valorisation périmée — rien envoyé'], sans_valo: ['ko', 'pas de valorisation — rien envoyé'], echec: ['ko', 'échec'] };
    try {
      const out = await E.runDay({
        trigger: 'manuel',
        onStore: (s, st, extra) => {
          const [c, t] = LBL[st] || ['run', st];
          setStatus(s, c, st === 'echec' ? 'Échec : ' + extra : st === 'envoye' ? `${extra.products} affiche(s) envoyée(s) ✓` : t);
        },
      });
      toast(`Tournée terminée : ${out.storesSent} magasin(s) servi(s), ${out.affiches} affiche(s)${out.alerts.length ? ` · ${out.alerts.length} alerte(s)` : ''}`, out.status === 'echec');
      loadLastRun();
    } catch (e) { toast('Tournée interrompue : ' + e.message, true); }
    finally { lock(false); }
  }

  async function remind(s) {
    const to = ((rowOf(s).querySelector('[data-mail]').value) || s.email || '').trim();
    if (!isMail(to)) { setStatus(s, 'ko', 'Adresse e-mail manquante pour la relance.'); return; }
    setStatus(s, 'run', `envoi de la relance à ${to}…`);
    try {
      await E.sendMail({
        to, store_id: s.id, store_name: s.name || s.id,
        subject: 'Mise à jour de votre valorisation magasin nécessaire',
        message: `Bonjour,\n\nVotre valorisation magasin ${s.ageDays != null ? `date de ${s.ageDays} jours` : "n'a pas encore été déposée"}.\nPour recevoir automatiquement les affiches promo (TV, PEM) correspondant exactement à votre stock exposé, merci de vous connecter à l'outil et d'y déposer votre nouvelle valorisation PDF issue de NOSICA.\n\nCeci est un message automatique, merci de ne pas y répondre.`,
        files: [], no_attachment: true,
      });
      setStatus(s, 'ok', `Relance envoyée à ${to}.`);
    } catch (e) { setStatus(s, 'ko', 'Relance échouée : ' + e.message); }
  }

  /* ════════════════════════ CAMPAGNE COMPLÈTE (ancien mode) ════════════════════════
     Toutes les offres des plans cochés, sans tenir compte des dates ni des
     envois précédents — inchangé par rapport à l'outil historique. */
  const LEGACY_SUBJECT = 'Votre plan promo — {plans} — {magasin}';
  const LEGACY_MESSAGE = [
    'Bonjour,', '',
    'Voici la campagne promo à mettre en place dans votre magasin : {plans}.', '',
    'Vous trouverez en pièces jointes les affiches prix correspondant aux produits',
    'réellement présents chez vous ({affiches} affiche(s), {pages} page(s) à imprimer).', '',
    "Il n'y a plus qu'à imprimer et à poser en rayon.", '', 'Bonne vente,',
  ].join('\n');
  let legacyPlanCache = null;
  async function legacyPlans() {
    const ids = ['plan-promo-tv', 'plan-promo-pem', 'plan-promo-star', 'plan-promo', 'affiches-cetelem'];
    const metas = {};
    for (const id of ids) {
      try { const { data } = await sb.from('shared_docs').select('file_path, updated_at').eq('id', id).maybeSingle(); metas[id] = data; }
      catch (e) { metas[id] = null; }
    }
    const token = ids.map(id => (metas[id] && metas[id].file_path ? metas[id].updated_at : '-')).join('|');
    if (legacyPlanCache && legacyPlanCache.token === token) return legacyPlanCache;
    const plans = { tv: [], pem: [], star: [], auto: [], cet: [] };
    const pick = async (id, slot) => {
      const m = metas[id]; if (!m || !m.file_path) return;
      let paths = [m.file_path];
      if (m.file_path.endsWith('/')) {
        const prefix = m.file_path.replace(/\/$/, '');
        const { data } = await sb.storage.from('shared').list(prefix, { limit: 200 });
        paths = (data || []).filter(f => f && f.name && f.id !== null).map(f => prefix + '/' + f.name).sort();
      }
      for (const p of paths) {
        const { data, error } = await sb.storage.from('shared').download(p);
        if (!error && data) plans[slot].push({ data: await data.arrayBuffer(), name: (p.split('/').pop() || id).replace(/^\d+_/, '') });
      }
    };
    await pick('plan-promo-tv', 'tv'); await pick('plan-promo-pem', 'pem');
    await pick('plan-promo-star', 'star'); await pick('affiches-cetelem', 'cet');
    if (!plans.tv.length && !plans.pem.length) await pick('plan-promo', 'auto');
    legacyPlanCache = { plans, token, count: Object.values(plans).reduce((n, l) => n + l.length, 0) };
    return legacyPlanCache;
  }
  /* générateur CETELEM : gabarit de la coque rechargé dans un cadre caché */
  let cetFrameP = null;
  function cetelemWin() {
    if (!cetFrameP) {
      cetFrameP = new Promise((res, rej) => {
        let tpl = null;
        try { tpl = window.parent.document.getElementById('tool-match'); } catch (e) {}
        if (!tpl) { rej(new Error('générateur CETELEM introuvable dans la coque')); return; }
        const fr = document.createElement('iframe');
        fr.setAttribute('aria-hidden', 'true');
        fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:1600px;border:0;z-index:-1';
        fr.addEventListener('load', () => {
          const t0 = Date.now();
          (function wait() {
            const w = fr.contentWindow;
            if (w && typeof w.gefecBuildCetelem === 'function') return res(w);
            if (Date.now() - t0 > 60000) return rej(new Error("le générateur CETELEM n'a pas démarré"));
            setTimeout(wait, 100);
          })();
        });
        fr.srcdoc = tpl.textContent.replace(/<\\\/script/g, '</script');
        document.body.appendChild(fr);
      }).catch(e => { cetFrameP = null; throw e; });
    }
    return cetFrameP;
  }
  function legacyOpts() {
    return {
      tpl: el('optTpl').value, printBg: el('optBg').value === '1',
      subject: el('optSubject').value || LEGACY_SUBJECT, message: el('optMessage').value || LEGACY_MESSAGE,
      tv: el('chkTV').checked, pem: el('chkPEM').checked, star: el('chkStar').checked, cet: el('chkCET').checked,
    };
  }
  const legacyFill = (tpl, v) => String(tpl || '').replace(/\{(magasin|code|plans|affiches|pages|date)\}/g, (m, k) => v[k] != null ? String(v[k]) : m);
  async function legacyProcess(s, o, plans) {
    if (s.valo !== 'ok') throw new Error('valorisation absente ou périmée');
    const to = ((rowOf(s).querySelector('[data-mail]').value) || s.email || '').trim();
    if (!isMail(to)) throw new Error('adresse e-mail du magasin manquante ou invalide');
    const prefs = s.mail_prefs || {};
    const { data, error } = await sb.storage.from('valorisations').download(`${s.id}/valorisation.pdf`);
    if (error || !data) throw new Error('valorisation introuvable');
    const valo = await data.arrayBuffer();
    const files = []; let pages = 0, products = 0;
    const sel = { tv: o.tv ? plans.plans.tv : [], pem: o.pem ? plans.plans.pem : [], star: o.star ? plans.plans.star : [], auto: plans.plans.auto };
    if (sel.tv.length || sel.pem.length || sel.star.length || sel.auto.length) {
      const w = await E.genWin();
      const r = await w.gefecBuildCampagne({
        valo: valo.slice(0), valoName: `valorisation-${s.id}.pdf`, plans: sel, plansToken: plans.token,
        tpl: o.tpl, masks: MASKS, fmtTV: prefs.tv || 'a4', fmtPEM: prefs.pem || 'a4', fmtStar: prefs.star || 'a4',
        printBg: o.printBg, onProgress: stepper(s),
      });
      files.push(...r.files); pages += r.pages; products += r.products;
    }
    if (o.cet && plans.plans.cet.length) {
      try {
        const cw = await cetelemWin();
        const cr = await cw.gefecBuildCetelem({ valo: valo.slice(0), plans: plans.plans.cet, fmt: prefs.cetelem || 'a4', onProgress: stepper(s) });
        files.push(...cr); cr.forEach(c => { pages += c.pages; products += c.products; });
      } catch (e) { if (e.message !== 'aucune affiche CETELEM ne correspond à votre valorisation') throw e; }
    }
    if (!files.length) throw new Error('aucune affiche générée (aucun produit trouvé ou plans décochés)');
    setBar(s, null);
    for (const f of files) f.blob = new Blob([await f.blob.arrayBuffer()], { type: 'application/pdf' });
    const date = new Date().toISOString().slice(0, 10);
    const up = [];
    for (const f of files) {
      const path = `${s.id}/campagne/${f.id}.pdf`;
      const { error: ue } = await sb.storage.from('affiches').upload(path, f.blob, { upsert: true, contentType: 'application/pdf' });
      if (ue) throw new Error('dépôt du PDF : ' + ue.message);
      up.push({ path, filename: `affiches-${f.id}-${E.slugify(s.name || s.id)}-${date}.pdf`, label: f.label, pages: f.pages, products: f.products, bytes: f.blob.size });
    }
    const plansLabel = files.map(f => f.label).join(' + ');
    const vars = { magasin: s.name || s.id, code: s.id, plans: plansLabel, affiches: products, pages, date: new Date().toLocaleDateString('fr-FR') };
    const subject = legacyFill(o.subject, vars);
    setStatus(s, 'run', `envoi du mail à ${to}…`);
    const out = await E.sendMail({ to, store_id: s.id, store_name: s.name || s.id, subject, message: legacyFill(o.message, vars),
      files: up.map(f => ({ path: f.path, filename: f.filename, label: f.label, pages: f.pages, products: f.products })) });
    try {
      await sb.from('campagne_mails').insert({ store_id: s.id, email: to, subject, plans: plansLabel, files: up, pages, products,
        valo_days: s.ageDays, provider: out.provider || null, sent_by: ME.userId, auto: false });
    } catch (e) {}
    setStatus(s, 'ok', `Campagne complète envoyée à ${to} — ${products} affiche(s), ${pages} page(s) · ${plansLabel}`);
  }
  async function legacyOne(s) {
    if (busy) return;
    if (!confirm(`Envoyer la campagne complète (ancien mode) à ${s.name || s.id} ?`)) return;
    lock(true); setBar(s, 0);
    try { await legacyProcess(s, legacyOpts(), await legacyPlans()); }
    catch (e) { setBar(s, null); setStatus(s, 'ko', 'Échec : ' + e.message); }
    finally { lock(false); }
  }
  const legacyReady = () => STORES.filter(s => s.valo === 'ok' && s.auto);
  function syncLegacyBulk() {
    const n = legacyReady().length;
    el('btnAllLegacy').textContent = `📦 Campagne complète à tous les magasins prêts (${n})`;
    el('btnAllLegacy').disabled = busy || !n;
  }
  async function legacyAll() {
    const targets = legacyReady();
    if (busy || !targets.length) return;
    if (!confirm(`Envoyer la campagne complète à ${targets.length} magasin(s) ?`)) return;
    lock(true);
    let ok = 0, ko = 0;
    try {
      const plans = await legacyPlans(), o = legacyOpts();
      for (const s of targets) {
        try { await legacyProcess(s, o, plans); ok++; }
        catch (e) { ko++; setBar(s, null); setStatus(s, 'ko', 'Échec : ' + e.message); }
      }
    } catch (e) { toast('Échec : ' + e.message, true); }
    finally { lock(false); }
    toast(`${ok} campagne(s) envoyée(s)${ko ? ` · ${ko} échec(s)` : ''}`, !ok && ko);
  }
  async function loadLegacyFrom() {
    try {
      const { data } = await sb.from('app_settings').select('value').eq('key', 'mail').maybeSingle();
      const v = (data && data.value) || {};
      el('optSubject').value = v.subject || LEGACY_SUBJECT;
      el('optMessage').value = v.message || LEGACY_MESSAGE;
      if (isMail(v.from_email)) setMsg('fromMsg', 'ok', `Expéditeur : ${v.from_name ? v.from_name + ' <' + v.from_email + '>' : v.from_email}`);
      else setMsg('fromMsg', 'warn', "Aucune adresse d'expédition : renseignez-la dans ⚙️ Réglages → « Envoi des campagnes mail ».");
    } catch (e) {}
  }

  /* ════════════════════════ HISTORIQUE ════════════════════════ */
  const RUN_STATUS = { ok: 'réussie', alertes: 'avec alertes', echec: 'en échec', en_cours: 'en cours', inactif: 'inactive' };
  const RUN_TAG = { ok: 'is-ok', alertes: 'is-warn', echec: 'is-ko', en_cours: 'is-info' };
  async function loadHistory() {
    try {
      const { data, error } = await sb.from('auto_runs').select('*').order('started_at', { ascending: false }).limit(40);
      if (error) throw error;
      el('runs').innerHTML = !(data || []).length ? '<div class="empty">Aucune tournée pour le moment.</div>'
        : `<table class="table_component"><thead><tr><th>Jour</th><th>Lancement</th><th>Statut</th><th class="is-num">Magasins servis</th><th class="is-num">Affiches</th><th>Détail</th></tr></thead><tbody>${
          data.map(r => {
            const d = r.details || {};
            const texts = d.texts || [];
            const stores = (d.stores || []).filter(x => x.status === 'envoye').map(x => `${x.name} (${x.affiches})`);
            return `<tr>
              <td>${frDate(r.run_date)}</td>
              <td>${r.trigger === 'cron' ? 'Automatique' : 'Manuel'}<br><span style="color:var(--text-3)">${frDT(r.started_at)}</span></td>
              <td><span class="tag ${RUN_TAG[r.status] || ''}">${RUN_STATUS[r.status] || esc(r.status)}</span></td>
              <td class="is-num">${r.stores_sent || 0}</td>
              <td class="is-num">${r.affiches || 0}</td>
              <td>${stores.length ? esc(stores.join(', ')) : '<span style="color:var(--text-3)">aucun envoi</span>'}
                ${texts.length ? `<ul class="table_alerts">${texts.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</td>
            </tr>`;
          }).join('')}</tbody></table>`;
    } catch (e) { el('runs').innerHTML = `<div class="empty">Erreur : ${esc(e.message || e)}</div>`; }
    try {
      const { data, error } = await sb.from('campagne_mails').select('store_id, email, subject, plans, operations, products, pages, sent_at, auto')
        .order('sent_at', { ascending: false }).limit(60);
      if (error) throw error;
      const nameOf = (id) => (STORES.find(s => s.id === id) || {}).name || id;
      el('mails').innerHTML = !(data || []).length ? '<div class="empty">Aucun mail envoyé.</div>'
        : `<table class="table_component"><thead><tr><th>Date</th><th>Magasin</th><th>Type</th><th>Contenu</th><th class="is-num">Affiches</th></tr></thead><tbody>${
          data.map(m => `<tr>
            <td>${frDT(m.sent_at)}</td>
            <td><b>${esc(nameOf(m.store_id))}</b><br><span style="color:var(--text-3)">${esc(m.email)}</span></td>
            <td><span class="tag ${m.auto ? 'is-info' : ''}">${m.auto ? 'Envoi auto' : 'Campagne'}</span></td>
            <td>${esc(m.operations || m.plans || '')}</td>
            <td class="is-num">${m.products || 0}</td>
          </tr>`).join('')}</tbody></table>`;
    } catch (e) { el('mails').innerHTML = `<div class="empty">Erreur : ${esc(e.message || e)}</div>`; }
  }

  /* ════════════════════════ DÉMARRAGE ════════════════════════ */
  async function loadMasksUI() {
    try { MASKS = await E.loadMasks(); } catch (e) { MASKS = []; }
    fillMaskSelect(el('opMaskPromo'), 'promo');
    fillMaskSelect(el('opMaskBonplan'), 'bonplan');
    fillMaskSelect(el('optTpl'), 'bonplan');
  }
  async function reloadAll() {
    if (busy) return;
    E.resetCaches(); legacyPlanCache = null;
    await loadSettingsUI();
    await loadMasksUI();
    await loadOps();
    loadLastRun();
    await loadStores();
    await loadOffers();
    if (!el('tabs').querySelector('.is-active[data-tab="histo"]')) return;
    loadHistory();
  }

  async function init() {
    document.querySelectorAll('.tabs_link').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
    el('btnReload').addEventListener('click', reloadAll);
    el('opSave').addEventListener('click', saveOp);
    el('opCancel').addEventListener('click', () => { resetOpForm(); setMsg('opMsg', '', ''); });
    el('opForm').addEventListener('submit', (e) => { e.preventDefault(); saveOp(); });
    el('opFrom').addEventListener('change', () => { if (!el('opTo').value || el('opTo').value < el('opFrom').value) el('opTo').value = el('opFrom').value; });
    el('setSave').addEventListener('click', saveSettingsUI);
    el('btnRunNow').addEventListener('click', runNow);
    el('btnAllLegacy').addEventListener('click', legacyAll);

    sb = getSb();
    if (!sb) { guard('<b>Configuration Supabase manquante.</b><br>Vérifiez <code>app-config.js</code>.'); return; }
    let user = null;
    try { ({ data: { user } } = await sb.auth.getUser()); } catch (e) {}
    if (!user) { guard('<b>Session expirée.</b><br>Reconnectez-vous depuis la page d’accueil.'); return; }
    let prof = null;
    try { ({ data: prof } = await sb.from('profiles').select('role').eq('user_id', user.id).single()); } catch (e) {}
    if (!prof || prof.role !== 'admin') {
      guard("<b>Outil réservé à l'administrateur.</b><br>L'envoi des campagnes mail se pilote depuis le compte administrateur.");
      return;
    }
    ME = { userId: user.id };
    E = window.GefecAuto.create(sb, { userId: user.id, log: (m) => console.log('[envoi auto] ' + m) });

    el('tabs').hidden = false;
    let tab = 'ops';
    try { tab = localStorage.getItem('gefec_campagne_tab') || 'ops'; } catch (e) {}
    showTab(['ops', 'envois', 'histo'].includes(tab) ? tab : 'ops');
    el('previewDate').value = E.parisDate();
    resetOpForm();

    try { await loadSettingsUI(); }
    catch (e) {
      guard(`<b>Tables de l'envoi automatique introuvables.</b><br>Exécutez <code>supabase/add-envoi-auto.sql</code> dans Supabase. (${esc(e.message)})`);
      return;
    }
    await loadMasksUI();
    await loadOps();
    loadLastRun();
    loadLegacyFrom();
    await loadStores();
    await loadOffers();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
