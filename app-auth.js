/* ════════════════════════════════════════════════════════════════
   GEFEC — Authentification multi-magasins + valorisations cloud (Supabase)
   Module autonome : écran de connexion, rôles, synchro de la valorisation
   par magasin, onglet Réglages admin, vue « toutes les valorisations »
   pour l'admin et les directeurs régionaux.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const cfg = window.GEFEC_CONFIG || {};
  const ROLE_LABEL = { admin: 'Administrateur', director: 'Directeur régional', store: 'Magasin' };
  let sb = null;
  let CURRENT = null; // { userId, role, storeId, name }

  /* ---------- Styles ---------- */
  const css = `
  #authGate{position:fixed;inset:0;z-index:9999;background:var(--bg,#eef1f6);
    display:flex;align-items:center;justify-content:center;padding:20px;font-family:var(--font,system-ui,sans-serif)}
  #authGate.hide{display:none}
  .agate-card{width:100%;max-width:380px;background:var(--surface,#fff);border:1px solid var(--border,#dde3ec);
    border-radius:18px;box-shadow:0 24px 60px rgba(23,32,51,.14);padding:34px 30px;text-align:center;animation:agFade .4s ease both}
  @keyframes agFade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  .agate-logo{width:54px;height:54px;border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:24px;color:#fff;background:linear-gradient(135deg,#3056d3,#1e3aa8)}
  .agate-title{font-size:19px;font-weight:800;letter-spacing:-.3px}
  .agate-sub{font-size:13px;color:var(--text-3,#8a93a3);margin-top:4px;margin-bottom:22px;font-weight:600}
  #authGate form{display:flex;flex-direction:column;gap:13px;text-align:left}
  #authGate label{font-size:12px;font-weight:700;color:var(--text-2,#5a6678);display:flex;flex-direction:column;gap:5px}
  #authGate input{border:1.5px solid var(--border,#dde3ec);border-radius:10px;padding:11px 13px;font-size:14px;font-family:inherit;outline:none}
  #authGate input:focus{border-color:var(--primary,#3056d3)}
  .agate-err{font-size:12.5px;color:#b91c1c;font-weight:600;min-height:0;display:none}
  .agate-err.show{display:block}
  .agate-btn{margin-top:6px;background:var(--primary,#3056d3);color:#fff;border:none;border-radius:10px;
    padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s}
  .agate-btn:hover{filter:brightness(1.08)} .agate-btn:disabled{opacity:.6;cursor:wait}

  .auth-chip{display:flex;align-items:center;gap:8px;margin-left:8px}
  .ac-info{display:flex;flex-direction:column;line-height:1.15;text-align:right;margin-right:2px}
  .ac-info b{font-size:12.5px;font-weight:800;color:var(--text,#172033)}
  .ac-info span{font-size:10.5px;color:var(--text-3,#8a93a3);font-weight:600}
  .auth-chip button{border:1px solid var(--border,#dde3ec);background:var(--surface,#fff);border-radius:9px;
    padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--text-2,#5a6678);transition:.15s;white-space:nowrap}
  .auth-chip button:hover{background:var(--surface-3,#eceff5);color:var(--text,#172033)}
  .auth-chip button.primary{background:var(--primary,#3056d3);color:#fff;border-color:transparent}

  .gmodal{position:fixed;inset:0;z-index:9998;background:rgba(20,28,45,.5);display:none;align-items:flex-start;
    justify-content:center;padding:40px 18px;overflow:auto}
  .gmodal.show{display:flex}
  .gmodal-card{width:100%;max-width:720px;background:var(--surface,#fff);border-radius:16px;box-shadow:0 24px 60px rgba(23,32,51,.22);
    padding:24px 26px;animation:agFade .3s ease both}
  .gmodal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
  .gmodal-head h2{font-size:18px;font-weight:800;margin:0}
  .gmodal-close{border:none;background:var(--surface-3,#eceff5);border-radius:9px;width:32px;height:32px;cursor:pointer;font-size:16px;color:var(--text-2,#5a6678)}
  .gmodal-sub{font-size:12.5px;color:var(--text-3,#8a93a3);font-weight:600;margin-bottom:18px}
  .gform{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:14px}
  .gform label{font-size:11.5px;font-weight:700;color:var(--text-2,#5a6678);display:flex;flex-direction:column;gap:4px}
  .gform input,.gform select{border:1.5px solid var(--border,#dde3ec);border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;outline:none}
  .gform input:focus,.gform select:focus{border-color:var(--primary,#3056d3)}
  .gform .full{grid-column:1/-1}
  .gbtn{background:var(--primary,#3056d3);color:#fff;border:none;border-radius:10px;padding:11px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .gbtn:hover{filter:brightness(1.08)} .gbtn:disabled{opacity:.6;cursor:wait}
  .gbtn.alt{background:var(--surface,#fff);color:var(--primary,#3056d3);border:1.5px solid var(--primary,#3056d3)}
  .gmsg{font-size:12.5px;font-weight:600;margin:8px 0;min-height:0}
  .gmsg.err{color:#b91c1c} .gmsg.ok{color:#0f8a45}
  .glist{margin-top:18px;border-top:1px solid var(--border,#dde3ec);padding-top:14px}
  .grow{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--border-2,#eef1f6);font-size:13px}
  .grow .gr-main{flex:1;min-width:0}
  .grow .gr-main b{font-weight:800} .grow .gr-sub{font-size:11.5px;color:var(--text-3,#8a93a3);font-weight:600}
  .grow .tagrole{font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:999px;background:var(--surface-3,#eceff5);color:var(--text-2,#5a6678)}
  .grow button{border:1px solid var(--border,#dde3ec);background:var(--surface,#fff);border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--text-2,#5a6678)}
  .grow button:hover{background:var(--surface-3,#eceff5)}
  .grow button.danger{color:#b91c1c;border-color:#f3c2c2}
  .gempty{font-size:12.5px;color:var(--text-3,#8a93a3);font-weight:600;padding:10px 2px}
  @media(max-width:560px){.gform{grid-template-columns:1fr}}
  `;

  /* ---------- petits utilitaires ---------- */
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg, err) { if (window.showToast) window.showToast(msg, !!err); }

  /* ---------- DOM : écran de connexion + chip + modales ---------- */
  function buildDom() {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

    let gate = el('authGate');
    if (!gate) { gate = document.createElement('div'); gate.id = 'authGate'; document.body.appendChild(gate); }
    gate.innerHTML = `
      <div class="agate-card">
        <div class="agate-logo">G</div>
        <div class="agate-title">Boîte à Outils GEFEC</div>
        <div class="agate-sub">Connexion magasin</div>
        <form id="agForm">
          <label>Identifiant<input id="agUser" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
          <label>Mot de passe<input id="agPass" type="password" autocomplete="current-password" required></label>
          <div class="agate-err" id="agErr"></div>
          <button class="agate-btn" type="submit" id="agSubmit">Se connecter</button>
        </form>
      </div>`;
    el('agForm').addEventListener('submit', onLoginSubmit);

    // chip dans l'en-tête
    const right = document.querySelector('.hero-right') || document.querySelector('header');
    if (right) {
      const chip = document.createElement('div');
      chip.className = 'auth-chip'; chip.id = 'authChip'; chip.hidden = true;
      chip.innerHTML = `
        <span class="ac-info"><b id="acName"></b><span id="acRole"></span></span>
        <button id="acStores" hidden>📂 Valorisations</button>
        <button id="acAdmin" class="primary" hidden>⚙️ Réglages</button>
        <button id="acLogout">Déconnexion</button>`;
      right.appendChild(chip);
      el('acLogout').addEventListener('click', doLogout);
      el('acAdmin').addEventListener('click', openAdmin);
      el('acStores').addEventListener('click', openStores);
    }

    // modale admin
    const admin = document.createElement('div'); admin.className = 'gmodal'; admin.id = 'adminModal';
    admin.innerHTML = `
      <div class="gmodal-card">
        <div class="gmodal-head"><h2>⚙️ Réglages — comptes</h2><button class="gmodal-close" data-close>✕</button></div>
        <div class="gmodal-sub">Créez les accès magasins (16) et directeurs régionaux (2). Identifiant + mot de passe.</div>
        <div class="gform">
          <label>Identifiant<input id="naUser" autocapitalize="none" spellcheck="false" placeholder="ex : reims"></label>
          <label>Mot de passe<input id="naPass" placeholder="mot de passe"></label>
          <label>Rôle<select id="naRole">
            <option value="store">Magasin</option>
            <option value="director">Directeur régional</option>
            <option value="admin">Administrateur</option>
          </select></label>
          <label>Nom affiché<input id="naName" placeholder="ex : BUT Reims"></label>
          <label class="naStoreField">Code magasin<input id="naStoreId" placeholder="ex : 51100"></label>
          <label class="naStoreField">Région<input id="naRegion" placeholder="ex : Grand Est"></label>
        </div>
        <button class="gbtn" id="naCreate">＋ Créer le compte</button>
        <div class="gmsg" id="naMsg"></div>
        <div class="glist" id="naList"><div class="gempty">Chargement…</div></div>
      </div>`;
    document.body.appendChild(admin);
    admin.querySelector('[data-close]').addEventListener('click', () => admin.classList.remove('show'));
    admin.addEventListener('click', e => { if (e.target === admin) admin.classList.remove('show'); });
    el('naRole').addEventListener('change', syncStoreFields);
    el('naCreate').addEventListener('click', onCreateAccount);

    // modale valorisations (admin + directeurs)
    const stores = document.createElement('div'); stores.className = 'gmodal'; stores.id = 'storesModal';
    stores.innerHTML = `
      <div class="gmodal-card">
        <div class="gmodal-head"><h2>📂 Valorisations des magasins</h2><button class="gmodal-close" data-close>✕</button></div>
        <div class="gmodal-sub">Consultez et chargez la valorisation de n'importe quel magasin.</div>
        <div class="glist" id="stList"><div class="gempty">Chargement…</div></div>
      </div>`;
    document.body.appendChild(stores);
    stores.querySelector('[data-close]').addEventListener('click', () => stores.classList.remove('show'));
    stores.addEventListener('click', e => { if (e.target === stores) stores.classList.remove('show'); });
  }

  function syncStoreFields() {
    const isStore = el('naRole').value === 'store';
    document.querySelectorAll('.naStoreField').forEach(f => f.style.display = isStore ? '' : 'none');
  }

  /* ---------- Connexion ---------- */
  async function onLoginSubmit(e) {
    e.preventDefault();
    const err = el('agErr'), btn = el('agSubmit');
    err.classList.remove('show'); btn.disabled = true; btn.textContent = 'Connexion…';
    const id = (el('agUser').value || '').trim().toLowerCase();
    const pass = el('agPass').value || '';
    const email = id.includes('@') ? id : `${id}@${cfg.EMAIL_DOMAIN || 'gefec.local'}`;
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      await onAuthed();
    } catch (ex) {
      err.textContent = 'Identifiant ou mot de passe incorrect.';
      err.classList.add('show');
    } finally {
      btn.disabled = false; btn.textContent = 'Se connecter';
    }
  }

  async function doLogout() {
    try { await sb.auth.signOut(); } catch (e) {}
    location.reload();
  }

  /* ---------- Après authentification ---------- */
  async function onAuthed() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { showGate(); return; }
    // profil (rôle + magasin)
    let prof = null;
    try {
      const { data } = await sb.from('profiles').select('role, store_id, display_name').eq('user_id', user.id).single();
      prof = data;
    } catch (e) {}
    if (!prof) {
      el('agErr').textContent = "Compte sans profil — contactez l'administrateur.";
      el('agErr').classList.add('show');
      await sb.auth.signOut(); showGate(); return;
    }
    CURRENT = { userId: user.id, role: prof.role, storeId: prof.store_id, name: prof.display_name || user.email };

    // en-tête
    el('authChip').hidden = false;
    el('acName').textContent = CURRENT.name;
    el('acRole').textContent = CURRENT.role === 'store'
      ? `Magasin ${CURRENT.storeId || ''}`.trim()
      : (ROLE_LABEL[CURRENT.role] || CURRENT.role);
    el('acAdmin').hidden = CURRENT.role !== 'admin';
    el('acStores').hidden = !(CURRENT.role === 'admin' || CURRENT.role === 'director');

    hideGate();

    // magasin : charger sa valorisation depuis le cloud
    if (CURRENT.role === 'store' && CURRENT.storeId) {
      await loadStoreValo(CURRENT.storeId, true);
    }
  }

  function showGate() { const g = el('authGate'); if (g) g.classList.remove('hide'); }
  function hideGate() { const g = el('authGate'); if (g) g.classList.add('hide'); }

  /* ---------- Valorisation : cloud <-> outils ---------- */
  function valoPath(storeId) { return `${storeId}/valorisation.pdf`; }

  async function loadStoreValo(storeId, silent) {
    try {
      const { data, error } = await sb.storage.from('valorisations').download(valoPath(storeId));
      if (error || !data) { if (!silent) toast('Aucune valorisation enregistrée pour ce magasin.'); return false; }
      const file = new File([data], `valorisation-${storeId}.pdf`, { type: 'application/pdf' });
      if (window.setValoFile) await window.setValoFile(file, { fromCloud: true });
      toast('Valorisation chargée depuis le cloud ✓');
      return true;
    } catch (e) { if (!silent) toast('Échec du chargement : ' + e.message, true); return false; }
  }

  // appelé par le moteur quand un utilisateur dépose une valorisation
  window.onValoLocallySet = async function (file, eanCount) {
    if (!CURRENT || CURRENT.role !== 'store' || !CURRENT.storeId) return; // seuls les magasins sauvegardent
    try {
      const { error } = await sb.storage.from('valorisations')
        .upload(valoPath(CURRENT.storeId), file, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;
      await sb.from('valorisations').upsert({
        store_id: CURRENT.storeId, file_path: valoPath(CURRENT.storeId),
        file_name: file.name, ean_count: eanCount,
        updated_at: new Date().toISOString(), updated_by: CURRENT.userId,
      });
      toast('Valorisation enregistrée dans le cloud ✓');
    } catch (e) {
      toast('Sauvegarde cloud impossible : ' + (e.message || e), true);
    }
  };

  /* ---------- Modale admin : comptes ---------- */
  async function openAdmin() {
    syncStoreFields();
    el('adminModal').classList.add('show');
    refreshAccounts();
  }
  async function callFn(body) {
    const { data, error } = await sb.functions.invoke('admin-create-user', { body });
    if (error) {
      let msg = error.message || 'Erreur';
      try { const ctx = await error.context?.json?.(); if (ctx && ctx.error) msg = ctx.error; } catch (e) {}
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  async function refreshAccounts() {
    const list = el('naList');
    try {
      const data = await callFn({ action: 'list' });
      const users = (data && data.users) || [];
      if (!users.length) { list.innerHTML = '<div class="gempty">Aucun compte pour le moment.</div>'; return; }
      list.innerHTML = users.map(u => `
        <div class="grow">
          <span class="tagrole">${esc(ROLE_LABEL[u.role] || u.role)}</span>
          <div class="gr-main"><b>${esc(u.display_name || u.username)}</b>
            <div class="gr-sub">${esc(u.username)}${u.store_id ? ' · magasin ' + esc(u.store_id) : ''}</div></div>
          <button data-reset="${esc(u.user_id)}">Mot de passe</button>
          <button class="danger" data-del="${esc(u.user_id)}" data-name="${esc(u.username)}">Supprimer</button>
        </div>`).join('');
      list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => onDeleteAccount(b.dataset.del, b.dataset.name)));
      list.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => onResetPassword(b.dataset.reset)));
    } catch (e) {
      list.innerHTML = `<div class="gempty">Impossible de lister les comptes : ${esc(e.message)}<br><br>
        Si l'erreur mentionne la fonction, c'est que la fonction <b>admin-create-user</b> n'est pas encore déployée (voir supabase/SETUP.md, étape 4).</div>`;
    }
  }
  async function onCreateAccount() {
    const msg = el('naMsg'), btn = el('naCreate');
    const role = el('naRole').value;
    const body = {
      action: 'create',
      username: (el('naUser').value || '').trim().toLowerCase(),
      password: el('naPass').value || '',
      role,
      display_name: (el('naName').value || '').trim() || null,
      store_id: role === 'store' ? (el('naStoreId').value || '').trim() : null,
      store_name: role === 'store' ? ((el('naName').value || '').trim() || (el('naStoreId').value || '').trim()) : null,
      region: role === 'store' ? ((el('naRegion').value || '').trim() || null) : null,
    };
    msg.className = 'gmsg'; msg.textContent = '';
    if (!body.username || !body.password) { msg.className = 'gmsg err'; msg.textContent = 'Identifiant et mot de passe requis.'; return; }
    if (role === 'store' && !body.store_id) { msg.className = 'gmsg err'; msg.textContent = 'Code magasin requis.'; return; }
    btn.disabled = true; btn.textContent = 'Création…';
    try {
      await callFn(body);
      msg.className = 'gmsg ok'; msg.textContent = `Compte « ${body.username} » créé ✓`;
      ['naUser', 'naPass', 'naName', 'naStoreId', 'naRegion'].forEach(id => el(id).value = '');
      refreshAccounts();
    } catch (e) {
      msg.className = 'gmsg err'; msg.textContent = 'Échec : ' + e.message;
    } finally {
      btn.disabled = false; btn.textContent = '＋ Créer le compte';
    }
  }
  async function onDeleteAccount(userId, username) {
    if (!confirm(`Supprimer définitivement le compte « ${username} » ?`)) return;
    try { await callFn({ action: 'delete', user_id: userId }); toast('Compte supprimé'); refreshAccounts(); }
    catch (e) { toast('Échec : ' + e.message, true); }
  }
  async function onResetPassword(userId) {
    const pass = prompt('Nouveau mot de passe pour ce compte :');
    if (!pass) return;
    try { await callFn({ action: 'reset_password', user_id: userId, password: pass }); toast('Mot de passe modifié ✓'); }
    catch (e) { toast('Échec : ' + e.message, true); }
  }

  /* ---------- Modale valorisations (admin + directeurs) ---------- */
  async function openStores() {
    el('storesModal').classList.add('show');
    const list = el('stList');
    try {
      const { data, error } = await sb.from('stores')
        .select('id, name, region, valorisations(file_path, file_name, ean_count, updated_at)')
        .order('id');
      if (error) throw error;
      if (!data || !data.length) { list.innerHTML = '<div class="gempty">Aucun magasin enregistré.</div>'; return; }
      list.innerHTML = data.map(s => {
        const v = (s.valorisations && s.valorisations[0]) || null;
        const sub = v
          ? `${v.ean_count != null ? v.ean_count + ' EAN · ' : ''}maj ${v.updated_at ? new Date(v.updated_at).toLocaleDateString('fr-FR') : '?'}`
          : 'aucune valorisation déposée';
        return `<div class="grow">
          <div class="gr-main"><b>${esc(s.name || s.id)}</b>
            <div class="gr-sub">${esc(s.id)}${s.region ? ' · ' + esc(s.region) : ''} — ${esc(sub)}</div></div>
          ${v ? `<button data-load="${esc(s.id)}">Charger dans les outils</button>
                 <button data-dl="${esc(s.id)}">Télécharger</button>` : ''}
        </div>`;
      }).join('');
      list.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', async () => {
        await loadStoreValo(b.dataset.load, false); el('storesModal').classList.remove('show');
      }));
      list.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => downloadStoreValo(b.dataset.dl)));
    } catch (e) {
      list.innerHTML = `<div class="gempty">Erreur : ${esc(e.message)}</div>`;
    }
  }
  async function downloadStoreValo(storeId) {
    try {
      const { data, error } = await sb.storage.from('valorisations').download(valoPath(storeId));
      if (error || !data) throw error || new Error('introuvable');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = `valorisation-${storeId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast('Téléchargement impossible : ' + (e.message || e), true); }
  }

  /* ---------- Démarrage ---------- */
  async function init() {
    buildDom();
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_KEY || !window.supabase) {
      el('agErr').textContent = "Configuration Supabase manquante (app-config.js) ou bibliothèque non chargée.";
      el('agErr').classList.add('show');
      el('agSubmit').disabled = true;
      return;
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
    window.GEFEC_SB = sb; // utile pour debug
    // session existante ?
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) { await onAuthed(); return; }
    } catch (e) {}
    showGate();
    setTimeout(() => { const u = el('agUser'); if (u) u.focus(); }, 80);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
