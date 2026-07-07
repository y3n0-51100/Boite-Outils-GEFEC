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
  .gbtn.danger{background:var(--surface,#fff);color:#b91c1c;border:1.5px solid #f3c2c2}
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
  .gpromo{background:#f1f5ff;border:1px solid var(--border,#dde3ec);border-radius:12px;padding:14px 16px;margin-bottom:6px}
  .gpromo-title{font-weight:800;font-size:14px;color:var(--text,#172033)}
  .gpromo-sub{font-size:12px;color:var(--text-3,#8a93a3);font-weight:600;margin:3px 0 9px}
  .gpromo-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
  .gpromo-name{font-size:12px;color:var(--text-2,#5a6678);font-weight:600}
  .gsep{border:none;border-top:1px solid var(--border,#dde3ec);margin:16px 0}
  .stsum{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}
  .stsum .pill{padding:7px 13px;border-radius:10px;background:var(--surface-2,#f5f7fb);font-size:12.5px;font-weight:700;color:var(--text-2,#5a6678)}
  .stsum .pill b{font-size:15px;margin-left:3px}
  .stsum .pill.ok b{color:#0f8a45}
  .stsum .pill.late b{color:#b25e00}
  .stsum .pill.never b{color:#b91c1c}
  .stbadge{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;white-space:nowrap;flex-shrink:0}
  .stbadge.ok{background:#e6f7ee;color:#0f8a45}
  .stbadge.late{background:#fff3e0;color:#b25e00}
  .stbadge.never{background:#fdeaea;color:#b91c1c}
  /* prep-status supprimé — intégré dans .status-ribbon (index.html) */
  .promo-body{font-size:13.5px;color:var(--text-2,#5a6678)}
  .promo-ok{font-size:15px;font-weight:800;color:#0f8a45;margin-bottom:10px}
  .promo-warn{font-size:15px;font-weight:800;color:#b25e00;margin-bottom:10px}
  .promo-info{margin:4px 0}
  .promo-info b{color:var(--text,#172033)}
  .promo-age{color:var(--text-3,#8a93a3);font-weight:600}
  .promo-note{margin-top:12px;padding:11px 13px;background:var(--surface-2,#f5f7fb);border-radius:10px;font-size:12.5px;line-height:1.5}
  .help-row{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--border,#eceff5)}
  .help-row:first-child{border-top:none}
  .help-ic{font-size:24px;flex-shrink:0;line-height:1}
  .help-row b{font-size:14px;color:var(--text,#172033)}
  .help-sub{font-size:12.5px;color:var(--text-2,#5a6678);margin:3px 0 9px;line-height:1.45}
  .help-link{display:inline-block;text-decoration:none;font-size:12.5px;padding:8px 14px}
  @media(max-width:560px){.gform{grid-template-columns:1fr}}
  .gmask-name{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--text-2,#5a6678);margin:8px 0}
  .gmask-name input{padding:9px 11px;border:1px solid var(--border,#dde3ec);border-radius:9px;font-size:14px;font-weight:600;text-transform:uppercase}
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
        <button id="acHelp" title="Aide et support">❔ Aide</button>
        <button id="acLogout">Déconnexion</button>`;
      right.appendChild(chip);
      el('acLogout').addEventListener('click', doLogout);
      el('acAdmin').addEventListener('click', openAdmin);
      el('acStores').addEventListener('click', openStores);
      el('acHelp').addEventListener('click', openHelp);
    }

    // modale admin
    const admin = document.createElement('div'); admin.className = 'gmodal'; admin.id = 'adminModal';
    admin.innerHTML = `
      <div class="gmodal-card">
        <div class="gmodal-head"><h2>⚙️ Réglages</h2><button class="gmodal-close" data-close>✕</button></div>

        <div class="gpromo-sub" style="margin-top:0">Documents communs (centrale) — publiés une fois, chargés automatiquement chez tous les magasins :</div>
        ${Object.keys(SHARED).filter(id => !SHARED[id].legacy).map(id => `
        <div class="gpromo">
          <div class="gpromo-title">${esc(SHARED[id].name)}${SHARED[id].multi ? ' <span style="font-weight:600;font-size:11px;opacity:.7">· plusieurs fichiers possibles</span>' : ''}</div>
          <div class="gmsg" id="ds-status-${id}">Chargement…</div>
          <input type="file" id="ds-file-${id}" accept="${SHARED[id].accept}"${SHARED[id].multi ? ' multiple' : ''} style="display:none">
          <div class="gpromo-actions">
            <button class="gbtn alt" data-pick="${id}">${SHARED[id].multi ? 'Choisir les fichiers' : 'Choisir le fichier'}</button>
            <button class="gbtn" data-upload="${id}">Téléverser</button>
            <button class="gbtn danger" data-delshared="${id}">Retirer</button>
            <span class="gpromo-name" id="ds-name-${id}"></span>
          </div>
        </div>`).join('')}

        <hr class="gsep">
        <div class="gpromo-sub" style="margin-top:0">Masques personnalisés (Étiquettes) — opérations spéciales (SOLDES, VENTES PRIVÉES…), au format A4, disponibles chez tous les magasins. Déposez le PDF du masque : sa première page devient le fond. Le contenu produit se cale automatiquement comme « PROMO DU MOMENT ».</div>
        <div class="gpromo">
          <div class="glist" id="masksList"><div class="gempty">Chargement…</div></div>
          <div class="gpromo-title" style="margin-top:12px">Ajouter un masque</div>
          <label class="gmask-name">Nom affiché<input id="maskName" autocapitalize="characters" placeholder="ex : SOLDES"></label>
          <div class="gpromo-actions">
            <button class="gbtn alt" id="maskPickPdf">Choisir le PDF…</button>
            <span class="gpromo-name" id="maskNamePdf"></span>
          </div>
          <input type="file" id="maskFilePdf" accept="application/pdf,.pdf" style="display:none">
          <div class="gpromo-actions"><button class="gbtn" id="maskAdd">＋ Publier le masque</button></div>
          <div class="gmsg" id="maskMsg"></div>
        </div>

        <hr class="gsep">

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
    admin.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => el('ds-file-' + b.dataset.pick).click()));
    admin.querySelectorAll('[data-upload]').forEach(b => b.addEventListener('click', () => onUploadShared(b.dataset.upload)));
    admin.querySelectorAll('[data-delshared]').forEach(b => b.addEventListener('click', () => onDeleteShared(b.dataset.delshared)));
    Object.keys(SHARED).forEach(id => {
      const fi = el('ds-file-' + id);
      if (fi) fi.addEventListener('change', () => {
        const n = fi.files ? fi.files.length : 0;
        const nm = el('ds-name-' + id);
        if (nm) nm.textContent = n === 0 ? '' : (n === 1 ? fi.files[0].name : n + ' fichiers sélectionnés');
      });
    });

    // masques personnalisés (admin)
    el('maskPickPdf').addEventListener('click', () => el('maskFilePdf').click());
    el('maskFilePdf').addEventListener('change', () => { const f = el('maskFilePdf').files[0]; el('maskNamePdf').textContent = f ? f.name : ''; });
    el('maskAdd').addEventListener('click', onAddMask);

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

    // pop-up générique affiché à l'ouverture d'un outil (plan promo / affiches / médias)
    const mod = document.createElement('div'); mod.className = 'gmodal'; mod.id = 'modModal';
    mod.innerHTML = `
      <div class="gmodal-card" style="max-width:480px">
        <div class="gmodal-head"><h2 id="modTitle"></h2></div>
        <div id="modBody" class="promo-body"><div class="gempty">Chargement…</div></div>
        <div style="text-align:right;margin-top:18px"><button class="gbtn" id="modOk">Compris</button></div>
      </div>`;
    document.body.appendChild(mod);
    mod.addEventListener('click', e => { if (e.target === mod) mod.classList.remove('show'); });
    el('modOk').addEventListener('click', () => {
      mod.classList.remove('show');
      const a = modOkAction; modOkAction = null;
      if (a) a();
    });

    // modale Aide & support
    const help = document.createElement('div'); help.className = 'gmodal'; help.id = 'helpModal';
    help.innerHTML = `
      <div class="gmodal-card" style="max-width:500px">
        <div class="gmodal-head"><h2>❔ Aide & support</h2><button class="gmodal-close" data-close>✕</button></div>
        <div class="promo-body">
          <div class="help-row">
            <div class="help-ic">📘</div>
            <div><b>Guide d'utilisation</b><div class="help-sub">Tout l'outil en 2 pages (connexion, croisement, impression…).</div>
              <a class="gbtn alt help-link" href="docs/Guide-Outil-Promo-GEFEC.pdf" target="_blank" rel="noopener">Ouvrir le guide PDF</a></div>
          </div>
          <div class="help-row">
            <div class="help-ic">🛟</div>
            <div><b>Un souci, un bug, une question ?</b><div class="help-sub">Rémi SCHAFFHAUSER vous répond. Le message est pré-rempli avec les infos techniques utiles au diagnostic.</div>
              <button class="gbtn help-link" id="helpReport">✉️ Signaler un problème</button></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(help);
    help.querySelector('[data-close]').addEventListener('click', () => help.classList.remove('show'));
    help.addEventListener('click', e => { if (e.target === help) help.classList.remove('show'); });
    el('helpReport').addEventListener('click', reportProblem);

    // pop-up d'ancienneté de la valorisation (> 10 jours)
    const valo = document.createElement('div'); valo.className = 'gmodal'; valo.id = 'valoModal';
    valo.innerHTML = `
      <div class="gmodal-card" style="max-width:480px">
        <div class="gmodal-head"><h2>📦 Valorisation de votre magasin</h2></div>
        <div id="valoPopupBody" class="promo-body"></div>
        <div style="text-align:right;margin-top:18px"><button class="gbtn" id="valoOk">Compris</button></div>
      </div>`;
    document.body.appendChild(valo);
    el('valoOk').addEventListener('click', () => valo.classList.remove('show'));
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

    // horodatage de connexion (tableau de bord) — sans bloquer si la migration SQL n'est pas faite
    try { sb.rpc('mark_seen'); } catch (e) {}

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
    // tout le monde : charger les documents partagés publiés par l'admin
    await loadAllSharedDocs();
    // masques personnalisés (SOLDES, etc.) → injectés dans Étiquettes
    await loadCustomMasks();
    // panneau "état de préparation" sur l'accueil
    renderHomeStatus();
    // magasin : alerter si la valorisation a plus de 10 jours
    if (CURRENT.role === 'store' && CURRENT.storeId) {
      await checkValoAge(CURRENT.storeId);
    }
  }

  // Ruban de statut : valorisation + documents partagés (chips inline)
  async function renderHomeStatus() {
    const slot = el('srDocs');
    const ribbon = el('statusRibbon');
    if (!slot || !CURRENT) return;
    const chips = [];

    if (CURRENT.role === 'store' && CURRENT.storeId) {
      let upd = null, ean = null;
      try {
        const { data } = await sb.from('valorisations').select('updated_at, ean_count').eq('store_id', CURRENT.storeId).maybeSingle();
        if (data) { upd = data.updated_at ? new Date(data.updated_at) : null; ean = data.ean_count; }
      } catch (e) {}
      if (!upd) upd = await getValoUpdatedAt(CURRENT.storeId);
      const st = !upd ? 'never' : (Math.floor((Date.now() - upd.getTime()) / 86400000) > 10 ? 'late' : 'ok');
      const val = upd
        ? upd.toLocaleDateString('fr-FR') + (st === 'late' ? ' — à actualiser' : '')
        : 'non déposée';
      chips.push({ st, name: 'Valorisation', val });
    }

    const labels = { 'plan-promo-tv': 'Plan promo TV', 'plan-promo-pem': 'Plan promo PEM', 'affiches-cetelem': 'CETELEM', 'medias-soldes': 'Soldes' };
    for (const id of Object.keys(SHARED)) {
      if (!labels[id]) continue; // document hérité : pas de pastille dédiée
      const meta = await fetchSharedMeta(id);
      if (meta && meta.file_path && meta.updated_at) chips.push({ st: 'ok', name: labels[id], val: new Date(meta.updated_at).toLocaleDateString('fr-FR') });
      else chips.push({ st: 'none', name: labels[id], val: 'non publié' });
    }

    slot.innerHTML = chips.map(c =>
      `<div class="sr-chip"><span class="sr-dot ${c.st}"></span><span class="sr-name">${esc(c.name)}</span><span class="sr-sep">·</span><span>${esc(c.val)}</span></div>`
    ).join('');
    if (ribbon) ribbon.hidden = false;
  }

  function showGate() { const g = el('authGate'); if (g) g.classList.remove('hide'); }
  function hideGate() { const g = el('authGate'); if (g) g.classList.add('hide'); }

  /* ---------- Aide & support ---------- */
  const SUPPORT_EMAIL = 'remi.schaff@gmail.com';
  let lastError = '';
  window.addEventListener('error', e => { lastError = (e && e.message ? e.message : String(e)) + (e && e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''); });
  window.addEventListener('unhandledrejection', e => { try { lastError = 'Promesse rejetée : ' + (e.reason && e.reason.message ? e.reason.message : e.reason); } catch (x) {} });

  function openHelp() { el('helpModal').classList.add('show'); }
  function reportProblem() {
    const who = CURRENT ? `${CURRENT.display_name || CURRENT.username || '?'} (${ROLE_LABEL[CURRENT.role] || CURRENT.role}${CURRENT.storeId ? ', magasin ' + CURRENT.storeId : ''})` : 'non connecté';
    let base = 'inconnue';
    try { const b = window.BASE_ECO; if (b && b.data) base = (b.count || Object.keys(b.data).length) + ' réf., données du ' + (b.updated ? new Date(b.updated).toLocaleDateString('fr-FR') : '?'); } catch (e) {}
    const lines = [
      'Bonjour Rémi,', '',
      'Je rencontre le problème suivant :', '', '(décrivez ici ce qui se passe)', '',
      '-------------------------------------------',
      'Infos techniques (ne pas effacer) :',
      '• Utilisateur : ' + who,
      '• Date : ' + new Date().toLocaleString('fr-FR'),
      '• Page : ' + location.href,
      '• Base NOSICA : ' + base,
      '• Navigateur : ' + navigator.userAgent,
      '• Dernière erreur technique : ' + (lastError || 'aucune'),
    ];
    const subject = 'Outil Promo GEFEC — signalement' + (CURRENT && CURRENT.storeId ? ' (magasin ' + CURRENT.storeId + ')' : '');
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

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

  // date de dernier dépôt de la valorisation d'un magasin (métadonnées, sinon Storage)
  async function getValoUpdatedAt(storeId) {
    try {
      const { data } = await sb.from('valorisations').select('updated_at').eq('store_id', storeId).maybeSingle();
      if (data && data.updated_at) return new Date(data.updated_at);
    } catch (e) {}
    try {
      const { data: files } = await sb.storage.from('valorisations').list(String(storeId), { limit: 100 });
      const f = (files || []).find(x => x.name === 'valorisation.pdf');
      if (f) return new Date(f.updated_at || f.created_at);
    } catch (e) {}
    return null;
  }
  // pop-up d'alerte si la valorisation a plus de 10 jours
  async function checkValoAge(storeId) {
    const upd = await getValoUpdatedAt(storeId);
    if (!upd || isNaN(upd.getTime())) return;
    const days = Math.floor((Date.now() - upd.getTime()) / 86400000);
    if (days <= 10) return;
    const body = el('valoPopupBody');
    if (!body) return;
    body.innerHTML = `
      <div class="promo-warn">⚠️ Votre valorisation date de ${days} jours</div>
      <div class="promo-info"><b>Dernier dépôt :</b> ${esc(upd.toLocaleDateString('fr-FR', { dateStyle: 'long' }))}</div>
      <div class="promo-note">De nouveaux produits sont peut-être désormais en stock et disponibles. Pensez à <b>redéposer une valorisation à jour</b> depuis la page d'accueil, afin que vos affiches et étiquettes soient complètes.</div>`;
    el('valoModal').classList.add('show');
  }

  // appelé par le moteur quand un utilisateur dépose une valorisation
  window.onValoLocallySet = async function (file, eanCount) {
    if (!CURRENT || CURRENT.role !== 'store' || !CURRENT.storeId) return; // seuls les magasins sauvegardent
    // 1) le fichier (essentiel)
    try {
      const { error } = await sb.storage.from('valorisations')
        .upload(valoPath(CURRENT.storeId), file, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;
    } catch (e) {
      toast('Sauvegarde cloud impossible : ' + (e.message || e), true);
      return;
    }
    // 2) les métadonnées (best-effort : n'empêche pas la sauvegarde du fichier)
    try {
      await sb.from('valorisations').upsert({
        store_id: CURRENT.storeId, file_path: valoPath(CURRENT.storeId),
        file_name: file.name, ean_count: eanCount,
        updated_at: new Date().toISOString(), updated_by: CURRENT.userId,
      });
    } catch (e) { /* métadonnées facultatives */ }
    toast('Valorisation enregistrée dans le cloud ✓');
  };

  /* ---------- Documents partagés publiés par l'admin ----------
     Même bucket "shared" + table "shared_docs" pour les documents communs :
     plans promo TV et PEM (Étiquettes), affiches CETELEM, fichiers Média
     Centrale (Soldes). L'ancien document unique 'plan-promo' (avant la
     séparation TV/PEM) est conservé en lecture seule pour la transition :
     il n'apparaît plus dans le panneau admin et n'est chargé que si aucun
     des deux nouveaux plans n'est publié (l'outil Étiquettes reconnaît
     alors lui-même le type TV/PEM de chaque PDF). */
  const SHARED = {
    'plan-promo-tv':    { name: 'Plan promo TV',           accept: 'application/pdf,.pdf', frameSel: '.tool-frame[data-src="etiquette.html"]', input: 'filePromoTv', multi: true },
    'plan-promo-pem':   { name: 'Plan promo PEM',          accept: 'application/pdf,.pdf', frameSel: '.tool-frame[data-src="etiquette.html"]', input: 'filePromoPem', multi: true },
    'plan-promo':       { name: 'Plan promo (ancien format unique)', accept: 'application/pdf,.pdf', frameSel: '.tool-frame[data-src="etiquette.html"]', input: 'filePromo', multi: true, legacy: true },
    'affiches-cetelem': { name: 'Affiches CETELEM',        accept: '.zip,application/zip', frameSel: '.tool-frame[data-tpl="tool-match"]',     input: 'file2', multi: true },
    'medias-soldes':    { name: 'Fichiers Média Centrale', accept: '.pdf,.zip',           frameSel: '.tool-frame[data-tpl="tool-solde"]',    input: 'mc-input', multi: true },
  };
  const MODULE_DOC = { etiquette: ['plan-promo-tv', 'plan-promo-pem'], match: 'affiches-cetelem', solde: 'medias-soldes' };
  const sharedFiles = {};      // id -> [File, ...] chargés (1 pour les docs simples, N pour multi)
  const sharedLoadedAt = {};   // id -> updated_at injecté
  let modOkAction = null;

  function extOf(name) { const m = String(name || '').match(/\.([a-z0-9]+)$/i); return m ? '.' + m[1].toLowerCase() : ''; }
  function pathFor(id, fileName) { return id + (extOf(fileName) || (id === 'affiches-cetelem' ? '.zip' : '.pdf')); }
  function folderFor(id) { return id + '/'; } // documents multi-fichiers : un dossier par id
  const isFolder = p => typeof p === 'string' && p.endsWith('/');
  const safeName = n => String(n || 'fichier').replace(/[^\w.\-]+/g, '_');
  // liste les fichiers d'un dossier du bucket "shared"
  async function listShared(prefix) {
    try {
      const { data } = await sb.storage.from('shared').list(prefix.replace(/\/$/, ''), { limit: 200 });
      return (data || []).filter(f => f && f.name && f.id !== null).map(f => prefix.replace(/\/$/, '') + '/' + f.name);
    } catch (e) { return []; }
  }

  async function fetchSharedMeta(id) {
    try {
      const { data } = await sb.from('shared_docs').select('file_path, file_name, updated_at').eq('id', id).maybeSingle();
      return data || null;
    } catch (e) { return null; }
  }
  async function injectSharedInto(id, frame) {
    const files = sharedFiles[id], cfg = SHARED[id];
    if (!files || !files.length || !cfg || !frame || frame['__inj_' + id]) return;
    let win, doc;
    try { win = frame.contentWindow; doc = frame.contentDocument; } catch (e) { return; }
    if (!win || !doc) return;
    const input = doc.getElementById(cfg.input);
    if (!input) return;
    frame['__inj_' + id] = true; // marquer tôt (injection async) pour éviter les doublons
    try {
      const dt = new win.DataTransfer();
      // Reconstruire CHAQUE fichier DANS le realm de l'iframe : sinon JSZip échoue
      // (instanceof Blob/ArrayBuffer faux d'un contexte JS à l'autre).
      for (const f of files) {
        const buf = await f.arrayBuffer();
        const ab = new win.ArrayBuffer(buf.byteLength);
        new win.Uint8Array(ab).set(new Uint8Array(buf));
        dt.items.add(new win.File([ab], f.name || cfg.input, { type: f.type || '' }));
      }
      input.files = dt.files;
      input.dispatchEvent(new win.Event('change', { bubbles: true }));
    } catch (e) { frame['__inj_' + id] = false; }
  }
  function tryInjectShared(id) {
    const cfg = SHARED[id]; if (!cfg) return;
    const frame = document.querySelector(cfg.frameSel);
    if (!frame) return;
    injectSharedInto(id, frame);                              // si déjà chargée
    frame.addEventListener('load', () => injectSharedInto(id, frame)); // au prochain chargement
  }
  async function ensureSharedLoaded(id, meta) {
    if (!meta || !meta.file_path) return;
    if (sharedFiles[id] && sharedFiles[id].length && sharedLoadedAt[id] === meta.updated_at) return; // déjà à jour
    try {
      // chemins à télécharger : dossier (multi) -> tous les fichiers (ordre stable) ; sinon le fichier unique
      const paths = isFolder(meta.file_path) ? (await listShared(meta.file_path)).sort() : [meta.file_path];
      if (!paths.length) return;
      const out = [];
      for (const p of paths) {
        const { data, error } = await sb.storage.from('shared').download(p);
        if (error || !data) continue;
        // nom d'affichage : on retire le préfixe d'ordre "NN_" ajouté au stockage
        const nm = (p.split('/').pop() || id).replace(/^\d+_/, '');
        out.push(new File([data], nm || id, { type: data.type || '' }));
      }
      if (!out.length) return;
      sharedFiles[id] = out;
      sharedLoadedAt[id] = meta.updated_at;
      document.querySelectorAll('.tool-frame').forEach(fr => { fr['__inj_' + id] = false; });
      tryInjectShared(id);
    } catch (e) {}
  }
  async function loadAllSharedDocs() {
    const metas = {};
    for (const id of Object.keys(SHARED)) metas[id] = await fetchSharedMeta(id);
    // migration : l'ancien plan promo unique n'est chargé que si NI le plan TV
    // NI le plan PEM n'est publié — sinon il ferait doublon dans l'outil
    const hasNewPlans = ['plan-promo-tv', 'plan-promo-pem'].some(id => metas[id] && metas[id].file_path);
    for (const id of Object.keys(SHARED)) {
      if (SHARED[id].legacy && hasNewPlans) continue;
      if (metas[id]) await ensureSharedLoaded(id, metas[id]);
    }
  }

  function relAge(dt) {
    const days = Math.floor((Date.now() - dt.getTime()) / 86400000);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return 'il y a 1 jour';
    if (days < 7) return `il y a ${days} jours`;
    const w = Math.floor(days / 7);
    return w === 1 ? 'il y a 1 semaine' : `il y a ${w} semaines`;
  }
  const MODULE_TITLE = {
    etiquette: '🏷️ Plans Promo TV & PEM',
    match: '📄 Affiches CETELEM',
    solde: '🧮 Soldes — Média Centrale',
  };
  const MODULE_NOTE = {
    etiquette: "Chaque plan publié est déjà chargé dans son onglet (TV / PEM) avec la valorisation de votre magasin : vous pouvez croiser et imprimer directement. Si vous avez une version plus récente, déposez-la dans l'étape « Chargez vos fichiers » : elle sera reconnue et rangée dans le bon onglet.",
    match: "Les affiches publiées par la centrale sont déjà chargées dans l'outil : vous pouvez générer vos affiches directement. Déposez votre propre ZIP si vous en avez un plus récent.",
    solde: "Les fichiers Média Centrale sont déjà chargés. Ajoutez vos fichiers de regroupement magasin, puis lancez « Analyser et générer ».",
  };
  const MODULE_NOTE_EMPTY = {
    etiquette: "Aucun plan promo publié pour le moment. Vous pouvez déposer vos propres plans promo TV et PEM dans l'outil.",
    match: "Aucune affiche publiée par l'administrateur. Vous pouvez déposer votre propre ZIP d'affiches dans l'outil.",
    solde: "Aucun fichier Média Centrale publié. Vous pouvez déposer vos propres fichiers dans l'outil.",
  };

  // Pop-up affiché UNE fois (par session, par module) à l'ouverture d'un outil
  let moduleSeen = {};
  async function showModulePopup(name, ids) {
    ids = [].concat(ids);
    el('modTitle').textContent = MODULE_TITLE[name] || SHARED[ids[0]].name;
    el('modBody').innerHTML = '<div class="gempty">Vérification…</div>';
    modOkAction = () => { moduleSeen[name] = true; if (window.switchView) window.switchView(name); };
    el('modModal').classList.add('show');
    const lines = [];
    let published = 0;
    for (const id of ids) {
      const meta = await fetchSharedMeta(id);
      if (meta) await ensureSharedLoaded(id, meta); // récupère la dernière version éventuelle
      if (meta && meta.file_path && meta.updated_at) {
        published++;
        const dt = new Date(meta.updated_at);
        const dateStr = dt.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
        lines.push(`<div class="promo-ok">✅ ${esc(SHARED[id].name)} — chargé</div>
          <div class="promo-info"><b>Mis en ligne le :</b> ${esc(dateStr)} <span class="promo-age">(${esc(relAge(dt))})</span></div>`);
      } else {
        lines.push(`<div class="promo-warn">⚠️ ${esc(SHARED[id].name)} — non publié par l'administrateur</div>`);
      }
    }
    // transition : ancien plan promo unique encore publié à la place des deux nouveaux
    if (name === 'etiquette' && !published) {
      const legacy = await fetchSharedMeta('plan-promo');
      if (legacy && legacy.file_path) {
        published++;
        lines.push(`<div class="promo-info">ℹ️ L'ancien plan promo (format unique) est chargé : chaque PDF est reconnu (TV ou PEM) et rangé dans son onglet.</div>`);
      }
    }
    el('modBody').innerHTML = lines.join('') +
      `<div class="promo-note">${(published ? MODULE_NOTE[name] : MODULE_NOTE_EMPTY[name]) || ''}</div>`;
  }
  // Portail consulté par le moteur avant d'ouvrir un outil
  window.moduleGate = function (name) {
    const ids = MODULE_DOC[name];
    if (!ids) return true;                // module sans document partagé
    if (moduleSeen[name]) return true;    // déjà vu cette session
    showModulePopup(name, ids);
    return false;
  };

  /* ---------- Publication des documents partagés (admin) ---------- */
  async function refreshSharedStatus(id) {
    const s = el('ds-status-' + id); if (!s) return;
    const meta = await fetchSharedMeta(id);
    if (meta && meta.file_path && meta.updated_at) {
      s.className = 'gmsg ok';
      s.textContent = `Publié : ${meta.file_name || ''} — ${new Date(meta.updated_at).toLocaleString('fr-FR')}`;
    } else { s.className = 'gmsg'; s.textContent = 'Aucun fichier publié pour le moment.'; }
  }
  function refreshAllSharedStatus() { Object.keys(SHARED).forEach(refreshSharedStatus); }
  async function onUploadShared(id) {
    const cfg = SHARED[id];
    const input = el('ds-file-' + id);
    const files = input && input.files ? [...input.files] : [];
    if (!files.length) { toast('Choisissez d’abord un fichier', true); return; }
    const btn = document.querySelector(`[data-upload="${id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Téléversement…'; }
    try {
      if (cfg.multi) {
        // document multi-fichiers : un dossier par id. On remplace tout le jeu.
        const old = await listShared(folderFor(id));
        if (old.length) { try { await sb.storage.from('shared').remove(old); } catch (e) {} }
        let i = 0;
        for (const f of files) {
          const p = folderFor(id) + String(i++).padStart(2, '0') + '_' + safeName(f.name);
          const { error } = await sb.storage.from('shared').upload(p, f, { upsert: true, contentType: f.type || undefined });
          if (error) throw error;
        }
        await sb.from('shared_docs').upsert({
          id, file_path: folderFor(id), file_name: files.length + ' fichier(s)',
          updated_at: new Date().toISOString(), updated_by: CURRENT.userId,
        });
        sharedFiles[id] = files;
      } else {
        const f = files[0];
        const path = pathFor(id, f.name);
        const { error } = await sb.storage.from('shared').upload(path, f, { upsert: true, contentType: f.type || undefined });
        if (error) throw error;
        await sb.from('shared_docs').upsert({
          id, file_path: path, file_name: f.name,
          updated_at: new Date().toISOString(), updated_by: CURRENT.userId,
        });
        sharedFiles[id] = [f];
      }
      sharedLoadedAt[id] = null;
      document.querySelectorAll('.tool-frame').forEach(fr => { fr['__inj_' + id] = false; });
      tryInjectShared(id);
      toast(cfg.name + (files.length > 1 ? ` (${files.length} fichiers)` : '') + ' publié pour tous les magasins ✓');
      input.value = ''; const nm = el('ds-name-' + id); if (nm) nm.textContent = '';
      refreshSharedStatus(id);
    } catch (e) {
      toast('Échec de la publication : ' + (e.message || e), true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Téléverser'; }
    }
  }

  async function onDeleteShared(id) {
    const cfg = SHARED[id];
    const meta = await fetchSharedMeta(id);
    if (!meta || !meta.file_path) { toast('Aucun document à retirer pour ' + cfg.name + '.'); return; }
    if (!confirm(`Retirer « ${cfg.name} » pour tous les magasins ?\nLe document ne sera plus disponible dans l'outil.`)) return;
    const btn = document.querySelector(`[data-delshared="${id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Retrait…'; }
    try {
      // supprime le(s) fichier(s) : dossier complet (multi) ou fichier unique
      const toRemove = isFolder(meta.file_path) ? await listShared(meta.file_path) : [meta.file_path];
      if (toRemove.length) { try { await sb.storage.from('shared').remove(toRemove); } catch (e) {} }
      // On "vide" la fiche (file_path = '') plutôt que de la supprimer : l'UPDATE
      // est autorisé par les policies existantes, aucune migration SQL requise.
      // Un document à file_path vide est traité partout comme « non publié ».
      const { data, error } = await sb.from('shared_docs')
        .update({ file_path: '', file_name: '', updated_at: new Date().toISOString(), updated_by: CURRENT.userId })
        .eq('id', id).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('retrait refusé par la base (droits administrateur requis)');
      delete sharedFiles[id]; delete sharedLoadedAt[id];
      document.querySelectorAll('.tool-frame').forEach(fr => { fr['__inj_' + id] = false; });
      toast(cfg.name + ' retiré pour tous les magasins.');
      refreshSharedStatus(id);
    } catch (e) {
      toast('Échec du retrait : ' + (e.message || e), true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Retirer'; }
    }
  }

  /* ---------- Masques personnalisés partagés (admin) ----------
     Stockés dans le bucket "shared" : images masks/<id>/a4|a5.<ext>,
     index masks/manifest.json. Aucune table SQL supplémentaire requise. */
  const MASK_MANIFEST = 'masks/manifest.json';
  let customMasksData = null; // [{id,name,calage,a4:dataURL,a5:dataURL}] côté client

  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'masque';
  }
  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }
  async function loadMaskManifest() {
    try {
      const { data, error } = await sb.storage.from('shared').download(MASK_MANIFEST);
      if (error || !data) return [];
      const arr = JSON.parse(await data.text());
      return Array.isArray(arr.masks) ? arr.masks : [];
    } catch (e) { return []; }
  }
  async function saveMaskManifest(masks) {
    const blob = new Blob([JSON.stringify({ masks })], { type: 'application/json' });
    const { error } = await sb.storage.from('shared').upload(MASK_MANIFEST, blob, { upsert: true, contentType: 'application/json', cacheControl: '0' });
    if (error) throw error;
  }

  async function refreshMasksList() {
    const host = el('masksList'); if (!host) return;
    const masks = await loadMaskManifest();
    if (!masks.length) { host.innerHTML = '<div class="gempty">Aucun masque personnalisé publié.</div>'; return; }
    host.innerHTML = masks.map(m => `
      <div class="grow">
        <span class="tagrole">Masque</span>
        <div class="gr-main"><b>${esc(m.name)}</b>
          <div class="gr-sub">A4${m.a5 ? ' + A5' : ''} · publié le ${m.updated_at ? new Date(m.updated_at).toLocaleDateString('fr-FR') : '—'}</div></div>
        <button class="danger" data-delmask="${esc(m.id)}" data-name="${esc(m.name)}">Supprimer</button>
      </div>`).join('');
    host.querySelectorAll('[data-delmask]').forEach(b => b.addEventListener('click', () => onDeleteMask(b.dataset.delmask, b.dataset.name)));
  }

  // 1re page d'un PDF → image JPEG (≈150 dpi A4) pour servir de fond
  async function pdfFirstPageToBlob(file, targetW) {
    if (!window.pdfjsLib) throw new Error('pdf.js indisponible');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc)
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (targetW || 1240) / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('rendu impossible')), 'image/jpeg', 0.92));
  }

  async function onAddMask() {
    const name = (el('maskName').value || '').trim();
    const fpdf = el('maskFilePdf').files[0];
    const msg = el('maskMsg');
    if (!name) { msg.className = 'gmsg err'; msg.textContent = 'Indiquez un nom.'; return; }
    if (!fpdf) { msg.className = 'gmsg err'; msg.textContent = 'Choisissez le PDF du masque.'; return; }
    const btn = el('maskAdd'); btn.disabled = true; btn.textContent = 'Conversion…';
    try {
      const img = await pdfFirstPageToBlob(fpdf, 1240); // page 1 → fond A4
      btn.textContent = 'Publication…';
      const masks = await loadMaskManifest();
      let id = slugify(name);
      if (['bonplan', 'promo'].includes(id) || masks.some(m => m.id === id)) id += '-' + Date.now().toString(36).slice(-4);
      const p4 = `masks/${id}/a4.jpg`;
      const r = await sb.storage.from('shared').upload(p4, img, { upsert: true, contentType: 'image/jpeg' });
      if (r.error) throw r.error;
      masks.push({ id, name, calage: 'promo', a4: p4, a5: null, updated_at: new Date().toISOString(), updated_by: CURRENT.userId });
      await saveMaskManifest(masks);
      el('maskName').value = ''; el('maskFilePdf').value = ''; el('maskNamePdf').textContent = '';
      msg.className = 'gmsg ok'; msg.textContent = `Masque « ${name} » publié pour tous les magasins ✓`;
      refreshMasksList();
      await loadCustomMasks(); // rafraîchit l'injection dans l'outil
    } catch (e) {
      msg.className = 'gmsg err'; msg.textContent = 'Échec : ' + (e.message || e);
    } finally { btn.disabled = false; btn.textContent = '＋ Publier le masque'; }
  }

  async function onDeleteMask(id, name) {
    if (!confirm(`Supprimer le masque « ${name} » pour tous les magasins ?`)) return;
    try {
      const masks = await loadMaskManifest();
      const m = masks.find(x => x.id === id);
      const keep = masks.filter(x => x.id !== id);
      await saveMaskManifest(keep);
      if (m) { try { await sb.storage.from('shared').remove([m.a4, m.a5].filter(Boolean)); } catch (e) {} }
      refreshMasksList();
      await loadCustomMasks();
      toast('Masque supprimé.');
    } catch (e) { toast('Échec de la suppression : ' + (e.message || e), true); }
  }

  // Client : télécharge les masques et les injecte dans l'outil Étiquettes
  async function loadCustomMasks() {
    const manifest = await loadMaskManifest();
    const out = [];
    for (const m of manifest) {
      try {
        const a4 = m.a4 ? await sb.storage.from('shared').download(m.a4) : null;
        const a5 = m.a5 ? await sb.storage.from('shared').download(m.a5) : null;
        out.push({
          id: m.id, name: m.name, calage: m.calage || 'promo',
          a4: a4 && !a4.error && a4.data ? await blobToDataURL(a4.data) : null,
          a5: a5 && !a5.error && a5.data ? await blobToDataURL(a5.data) : null,
        });
      } catch (e) {}
    }
    customMasksData = out;
    document.querySelectorAll('.tool-frame').forEach(fr => { fr.__masksInj = false; });
    tryInjectMasks();
  }
  function injectMasksInto(frame) {
    if (!customMasksData || !frame || frame.__masksInj) return;
    let win; try { win = frame.contentWindow; } catch (e) { return; }
    if (!win || typeof win.applyCustomMasks !== 'function') return;
    try { win.applyCustomMasks(customMasksData); frame.__masksInj = true; } catch (e) {}
  }
  function tryInjectMasks() {
    const frame = document.querySelector('.tool-frame[data-src="etiquette.html"]');
    if (!frame) return;
    injectMasksInto(frame);
    frame.addEventListener('load', () => { frame.__masksInj = false; injectMasksInto(frame); });
  }

  /* ---------- Modale admin : comptes ---------- */
  async function openAdmin() {
    syncStoreFields();
    el('adminModal').classList.add('show');
    refreshAllSharedStatus();
    refreshMasksList();
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
    list.innerHTML = '<div class="gempty">Chargement…</div>';
    try {
      // 1) magasins (noms) + 2) métadonnées éventuelles
      const { data: stores, error: serr } = await sb.from('stores').select('id, name, region').order('id');
      if (serr) throw serr;
      let metaBy = {};
      try {
        const { data: metas } = await sb.from('valorisations').select('store_id, ean_count, updated_at');
        (metas || []).forEach(m => { metaBy[m.store_id] = m; });
      } catch (e) {}
      // dernière connexion par magasin (si la migration last_seen est en place)
      let seenBy = {};
      try {
        const { data: profs } = await sb.from('profiles').select('store_id, last_seen');
        (profs || []).forEach(p => {
          if (!p.store_id || !p.last_seen) return;
          if (!seenBy[p.store_id] || new Date(p.last_seen) > new Date(seenBy[p.store_id])) seenBy[p.store_id] = p.last_seen;
        });
      } catch (e) {}
      if (!stores || !stores.length) { list.innerHTML = '<div class="gempty">Aucun magasin enregistré.</div>'; return; }
      // 3) vérité = fichiers réellement présents dans le Storage (par magasin)
      const rows = await Promise.all(stores.map(async s => {
        let file = null;
        try {
          const { data: files } = await sb.storage.from('valorisations').list(String(s.id), { limit: 100 });
          file = (files || []).find(f => f.name === 'valorisation.pdf') || null;
        } catch (e) {}
        return { s, file, meta: metaBy[s.id] };
      }));
      // statut par magasin : à jour (<=10 j), en retard (>10 j), jamais déposée
      const enriched = rows.map(({ s, file, meta }) => {
        const has = !!file;
        const when = (meta && meta.updated_at) || (file && (file.updated_at || file.created_at));
        const dt = when ? new Date(when) : null;
        const ageDays = (has && dt && !isNaN(dt.getTime())) ? Math.floor((Date.now() - dt.getTime()) / 86400000) : null;
        const status = !has ? 'never' : (ageDays != null && ageDays > 10 ? 'late' : 'ok');
        const seen = seenBy[s.id] ? new Date(seenBy[s.id]) : null;
        return { s, has, meta, dt, ageDays, status, seen };
      });
      const nOk = enriched.filter(e => e.status === 'ok').length;
      const nLate = enriched.filter(e => e.status === 'late').length;
      const nNever = enriched.filter(e => e.status === 'never').length;
      const nActive = enriched.filter(e => e.seen && (Date.now() - e.seen.getTime()) / 86400000 <= 7).length;
      // tri : le plus urgent d'abord (jamais déposée, puis le plus ancien)
      enriched.sort((a, b) => (b.status === 'never' ? 1e9 : (b.ageDays || 0)) - (a.status === 'never' ? 1e9 : (a.ageDays || 0)));

      const summary = `<div class="stsum">
        <span class="pill ok">À jour<b>${nOk}</b></span>
        <span class="pill late">En retard<b>${nLate}</b></span>
        <span class="pill never">Jamais<b>${nNever}</b></span>
        <span class="pill">Actifs 7 j<b>${nActive}</b></span>
        <span class="pill">Total<b>${enriched.length}</b></span>
      </div>`;
      const rowsHtml = enriched.map(e => {
        const badge = e.status === 'ok' ? '<span class="stbadge ok">À jour</span>'
          : e.status === 'late' ? `<span class="stbadge late">En retard${e.ageDays != null ? ' · ' + e.ageDays + ' j' : ''}</span>`
          : '<span class="stbadge never">Jamais déposée</span>';
        const sub = e.has
          ? `${e.meta && e.meta.ean_count != null ? e.meta.ean_count + ' EAN · ' : ''}maj ${e.dt ? e.dt.toLocaleDateString('fr-FR') : '?'}`
          : 'aucune valorisation déposée';
        const seenTxt = e.seen ? `connexion ${relAge(e.seen)}` : 'jamais connecté';
        return `<div class="grow">
          ${badge}
          <div class="gr-main"><b>${esc(e.s.name || e.s.id)}</b>
            <div class="gr-sub">${esc(e.s.id)}${e.s.region ? ' · ' + esc(e.s.region) : ''} — ${esc(sub)} · ${esc(seenTxt)}</div></div>
          ${e.has ? `<button data-load="${esc(e.s.id)}">Charger dans les outils</button>
                     <button data-dl="${esc(e.s.id)}">Télécharger</button>` : ''}
        </div>`;
      }).join('');
      list.innerHTML = summary + rowsHtml;
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
