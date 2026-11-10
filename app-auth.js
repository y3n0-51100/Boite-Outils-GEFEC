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
  #authGate{position:fixed;inset:0;z-index:9999;background:var(--bg,#0b0e14);
    display:flex;align-items:center;justify-content:center;padding:20px;font-family:var(--font,system-ui,sans-serif)}
  #authGate.hide{display:none}
  .agate-card{width:100%;max-width:380px;background:var(--surface,#11151e);border:1px solid var(--border,#2a334a);
    border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.5);padding:34px 30px;text-align:center;animation:agFade .4s ease both}
  @keyframes agFade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  .agate-logo{width:54px;height:54px;border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:24px;color:#fff;background:linear-gradient(135deg,var(--primary-2,#8fb0ff),var(--primary,#5b8cff))}
  .agate-title{font-size:19px;font-weight:800;letter-spacing:-.3px;color:var(--text,#e6e9f0)}
  .agate-sub{font-size:13px;color:var(--text-3,#5c6478);margin-top:4px;margin-bottom:22px;font-weight:600}
  #authGate form{display:flex;flex-direction:column;gap:13px;text-align:left}
  #authGate label{font-size:12px;font-weight:700;color:var(--text-2,#8a93a6);display:flex;flex-direction:column;gap:5px}
  #authGate input{border:1.5px solid var(--border,#2a334a);border-radius:10px;padding:11px 13px;font-size:14px;font-family:inherit;outline:none;background:var(--surface-2,#1a2030);color:var(--text,#e6e9f0)}
  #authGate input:focus{border-color:var(--primary,#5b8cff)}
  .agate-err{font-size:12.5px;color:#f87171;font-weight:600;min-height:0;display:none}
  .agate-err.show{display:block}
  .agate-btn{margin-top:6px;background:var(--primary,#5b8cff);color:#fff;border:none;border-radius:10px;
    padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s}
  .agate-btn:hover{filter:brightness(1.12)} .agate-btn:disabled{opacity:.6;cursor:wait}

  .auth-chip{display:flex;align-items:center;gap:8px;margin-left:8px}
  .ac-info{display:flex;flex-direction:column;line-height:1.15;text-align:right;margin-right:2px}
  .ac-info b{font-size:12.5px;font-weight:800;color:var(--text,#e6e9f0)}
  .ac-info span{font-size:10.5px;color:var(--text-3,#5c6478);font-weight:600}
  .auth-chip button{border:1px solid var(--border,#2a334a);background:var(--surface,#11151e);border-radius:9px;
    padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--text-2,#8a93a6);transition:.15s;white-space:nowrap}
  .auth-chip button:hover{background:var(--surface-3,#232b3d);color:var(--text,#e6e9f0)}
  .auth-chip button.primary{background:var(--primary,#5b8cff);color:#fff;border-color:transparent}

  .gmodal{position:fixed;inset:0;z-index:9998;background:rgba(3,5,10,.7);display:none;align-items:flex-start;
    justify-content:center;padding:40px 18px;overflow:auto}
  .gmodal.show{display:flex}
  .gmodal-card{width:100%;max-width:720px;background:var(--surface,#11151e);border:1px solid var(--border,#2a334a);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.6);
    padding:24px 26px;animation:agFade .3s ease both;color:var(--text,#e6e9f0)}
  .gmodal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
  .gmodal-head h2{font-size:18px;font-weight:800;margin:0}
  .gmodal-close{border:none;background:var(--surface-3,#232b3d);border-radius:9px;width:32px;height:32px;cursor:pointer;font-size:16px;color:var(--text-2,#8a93a6)}
  .gmodal-sub{font-size:12.5px;color:var(--text-3,#5c6478);font-weight:600;margin-bottom:18px}
  .gform{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:14px}
  .gform label{font-size:11.5px;font-weight:700;color:var(--text-2,#8a93a6);display:flex;flex-direction:column;gap:4px}
  .gform input,.gform select{border:1.5px solid var(--border,#2a334a);border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;outline:none;background:var(--surface-2,#1a2030);color:var(--text,#e6e9f0)}
  .gform input:focus,.gform select:focus{border-color:var(--primary,#5b8cff)}
  .gform .full{grid-column:1/-1}
  .gbtn{background:var(--primary,#5b8cff);color:#fff;border:none;border-radius:10px;padding:11px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .gbtn:hover{filter:brightness(1.12)} .gbtn:disabled{opacity:.6;cursor:wait}
  .gbtn.alt{background:transparent;color:var(--primary,#5b8cff);border:1.5px solid var(--primary,#5b8cff)}
  .gbtn.danger{background:transparent;color:#f87171;border:1.5px solid rgba(248,113,113,.4)}
  .gmsg{font-size:12.5px;font-weight:600;margin:8px 0;min-height:0;color:var(--text-2,#8a93a6)}
  .gmsg.err{color:#f87171} .gmsg.ok{color:#4ade80}
  .glist{margin-top:18px;border-top:1px solid var(--border,#2a334a);padding-top:14px}
  .grow{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--border-2,#1f2638);font-size:13px;color:var(--text,#e6e9f0)}
  .grow .gr-main{flex:1;min-width:0}
  .grow .gr-main b{font-weight:800} .grow .gr-sub{font-size:11.5px;color:var(--text-3,#5c6478);font-weight:600}
  .grow .tagrole{font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:999px;background:var(--surface-3,#232b3d);color:var(--text-2,#8a93a6)}
  .grow button{border:1px solid var(--border,#2a334a);background:var(--surface,#11151e);border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--text-2,#8a93a6)}
  .grow button:hover{background:var(--surface-3,#232b3d)}
  .grow button.danger{color:#f87171;border-color:rgba(248,113,113,.35)}
  .gempty{font-size:12.5px;color:var(--text-3,#5c6478);font-weight:600;padding:10px 2px}
  .gpromo{background:var(--surface-2,#1a2030);border:1px solid var(--border,#2a334a);border-radius:12px;padding:14px 16px;margin-bottom:6px}
  .gpromo-title{font-weight:800;font-size:14px;color:var(--text,#e6e9f0)}
  .gpromo-sub{font-size:12px;color:var(--text-3,#5c6478);font-weight:600;margin:3px 0 9px}
  .gpromo-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
  .gpromo-name{font-size:12px;color:var(--text-2,#8a93a6);font-weight:600}
  .gsep{border:none;border-top:1px solid var(--border,#2a334a);margin:16px 0}
  .stsum{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}
  .stsum .pill{padding:7px 13px;border-radius:10px;background:var(--surface-2,#1a2030);font-size:12.5px;font-weight:700;color:var(--text-2,#8a93a6)}
  .stsum .pill b{font-size:15px;margin-left:3px}
  .stsum .pill.ok b{color:#4ade80}
  .stsum .pill.late b{color:#fbbf24}
  .stsum .pill.never b{color:#f87171}
  .stbadge{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;white-space:nowrap;flex-shrink:0}
  .stbadge.ok{background:rgba(74,222,128,.14);color:#4ade80}
  .stbadge.late{background:rgba(251,191,36,.14);color:#fbbf24}
  .stbadge.never{background:rgba(248,113,113,.14);color:#f87171}
  /* prep-status supprimé — intégré dans .status-ribbon (index.html) */
  .promo-body{font-size:13.5px;color:var(--text-2,#8a93a6)}
  .promo-ok{font-size:15px;font-weight:800;color:#4ade80;margin-bottom:10px}
  .promo-warn{font-size:15px;font-weight:800;color:#fbbf24;margin-bottom:10px}
  .promo-info{margin:4px 0}
  .promo-info b{color:var(--text,#e6e9f0)}
  .promo-age{color:var(--text-3,#5c6478);font-weight:600}
  .promo-note{margin-top:12px;padding:11px 13px;background:var(--surface-2,#1a2030);border-radius:10px;font-size:12.5px;line-height:1.5}
  .help-row{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--border,#1f2638)}
  .help-row:first-child{border-top:none}
  .help-ic{font-size:24px;flex-shrink:0;line-height:1}
  .help-row b{font-size:14px;color:var(--text,#e6e9f0)}
  .help-sub{font-size:12.5px;color:var(--text-2,#8a93a6);margin:3px 0 9px;line-height:1.45}
  .help-link{display:inline-block;text-decoration:none;font-size:12.5px;padding:8px 14px}
  @media(max-width:560px){.gform{grid-template-columns:1fr}}
  .gmask-name{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--text-2,#8a93a6);margin:8px 0}
  .gmask-name input{padding:9px 11px;border:1px solid var(--border,#2a334a);border-radius:9px;font-size:14px;font-weight:600;text-transform:uppercase;background:var(--surface-2,#1a2030);color:var(--text,#e6e9f0)}
  .gate-input{width:100%;box-sizing:border-box;border:1.5px solid var(--border,#2a334a);border-radius:10px;
    padding:11px 13px;font-size:14px;font-family:inherit;outline:none;
    background:var(--surface-2,#1a2030);color:var(--text,#e6e9f0)}
  .gate-input:focus{border-color:var(--primary,#5b8cff)}
  .gate-fmt{display:flex;gap:18px;align-items:center;margin-bottom:12px;font-size:13px;color:var(--text-2,#8a93a6);font-weight:600}
  .gate-fmt b{color:var(--text,#e6e9f0);font-weight:700;min-width:74px}
  .gate-fmt label{display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--text,#e6e9f0)}
  .gate-lbl{display:block;font-size:12px;font-weight:700;color:var(--text-2,#8a93a6);margin-bottom:6px}
  .gmask-name textarea{padding:10px 12px;border:1px solid var(--border,#2a334a);border-radius:9px;font-size:13px;
    font-family:inherit;line-height:1.55;background:var(--surface-2,#1a2030);color:var(--text,#e6e9f0);resize:vertical;outline:none}
  .gmask-name textarea:focus{border-color:var(--primary,#5b8cff)}
  .gmail-test{flex:1;min-width:180px;border:1.5px solid var(--border,#2a334a);border-radius:9px;padding:9px 11px;
    font-size:13px;font-family:inherit;background:var(--surface-2,#1a2030);color:var(--text,#e6e9f0);outline:none}
  .gmail-test:focus{border-color:var(--primary,#5b8cff)}

  /* Générateur d'affiches : l'outil Étiquettes chargé hors écran, sans
     interface, pour fabriquer le PDF envoyé au directeur. */
  #gefecExportFrame{position:fixed;left:-20000px;top:0;width:1200px;height:1600px;border:0;z-index:-1}
  .affrow{display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border-2,#1f2638);font-size:12.5px}
  .affrow .gr-main{flex:1;min-width:0}
  .affrow .st{font-weight:700;white-space:nowrap}
  .affrow .st.wait{color:var(--text-3,#5c6478)} .affrow .st.run{color:#fbbf24}
  .affrow .st.ok{color:#4ade80} .affrow .st.ko{color:#f87171}
  .affbar{height:5px;border-radius:999px;background:var(--surface-3,#232b3d);overflow:hidden;margin-top:8px}
  .affbar i{display:block;height:100%;background:var(--primary,#5b8cff);width:0;transition:width .2s}
  .stmail{font-size:11px;font-weight:700;color:var(--text-3,#5c6478)}

  /* Création de compte (écran de connexion) */
  #authGate{overflow:auto}
  #authGate form[hidden]{display:none}
  .agate-card{margin:auto}
  .agate-link{background:none;border:none;color:var(--text-2,#8a93a6);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;padding:6px;margin-top:2px}
  .agate-link b{color:var(--primary,#5b8cff)}
  .agate-group{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3,#5c6478);margin-top:6px;border-top:1px solid var(--border,#2a334a);padding-top:12px}
  .agate-drop{border:2px dashed var(--border,#2a334a);border-radius:12px;padding:16px;text-align:center;cursor:pointer;background:var(--surface-2,#1a2030);display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:700;color:var(--text,#e6e9f0);outline:none}
  .agate-drop small{font-size:11.5px;font-weight:600;color:var(--text-3,#5c6478)}
  .agate-drop:hover,.agate-drop:focus,.agate-drop.over{border-color:var(--primary,#5b8cff)}
  .agate-drop.loaded{border-style:solid;border-color:#4ade80}
  .agate-dl{font-size:12.5px;font-weight:700;color:var(--primary,#5b8cff);text-decoration:none;text-align:center}
  .agate-dl:hover{text-decoration:underline}

  /* Espace magasin : seul écran d'un compte magasin, par-dessus la coque */
  #storePortal{position:fixed;inset:0;z-index:9990;background:var(--bg,#0b0e14);display:none;overflow:auto;
    padding:28px 16px;font-family:var(--font,system-ui,sans-serif);color:var(--text,#e6e9f0)}
  #storePortal.show{display:block}
  body.is-portal .shell{display:none}
  .sp-wrap{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
  .sp-head{display:flex;align-items:center;gap:14px}
  .sp-title{flex:1;min-width:0;display:flex;flex-direction:column}
  .sp-title b{font-size:18px;font-weight:800}
  .sp-title span{font-size:12px;color:var(--text-3,#5c6478);font-weight:600}
  #storePortal .sp-card{max-width:none;width:100%;box-sizing:border-box}
  .sp-mails{display:flex;flex-direction:column;gap:12px;margin-top:16px}
  .sp-mails .gate-lbl{display:flex;flex-direction:column;gap:6px;margin:0}
  .sp-switch{display:flex;align-items:center;gap:10px;margin-top:16px;font-size:14px;font-weight:700;cursor:pointer}
  .sp-switch input{width:18px;height:18px;accent-color:var(--primary,#5b8cff)}
  .sp-actions{margin-top:16px}
  .sp-drop{margin-top:16px}
  .sp-dl{display:inline-block;margin-top:10px}
  .sp-hist{margin-top:14px;overflow-x:auto}
  .sp-table{width:100%;border-collapse:collapse;font-size:12.5px}
  .sp-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-3,#5c6478);padding:8px 6px;border-bottom:1px solid var(--border,#2a334a)}
  .sp-table td{padding:9px 6px;border-bottom:1px solid var(--border-2,#1f2638);vertical-align:top}
  @media(max-width:560px){.sp-head{flex-wrap:wrap}.vgate-card{padding:24px 18px}}
  .vgate-card{width:100%;max-width:560px;background:var(--surface,#11151e);border:1px solid var(--border,#2a334a);
    border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.5);padding:34px 32px;animation:agFade .4s ease both;color:var(--text,#e6e9f0)}
  .vgate-badge{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;
    padding:5px 11px;border-radius:999px;background:rgba(251,191,36,.14);color:#fbbf24;margin-bottom:14px}
  .vgate-title{font-size:21px;font-weight:800;letter-spacing:-.3px;margin-bottom:8px}
  .vgate-sub{font-size:13.5px;line-height:1.55;color:var(--text-2,#8a93a6);font-weight:600}
  .vgate-sub b{color:var(--text,#e6e9f0)}
  .vgate-drop{margin-top:20px;border:2px dashed var(--border,#2a334a);border-radius:14px;padding:26px 20px;text-align:center;
    cursor:pointer;transition:.15s;background:var(--surface-2,#1a2030)}
  .vgate-drop:hover,.vgate-drop.over{border-color:var(--primary,#5b8cff);background:var(--surface-3,#232b3d)}
  .vgate-drop .ic{font-size:30px;line-height:1;margin-bottom:8px}
  .vgate-drop .t{font-size:14.5px;font-weight:800}
  .vgate-drop .d{font-size:12px;color:var(--text-3,#5c6478);font-weight:600;margin-top:4px}
  .vgate-msg{font-size:13px;font-weight:700;margin-top:14px;min-height:18px}
  .vgate-msg.err{color:#f87171} .vgate-msg.ok{color:#4ade80} .vgate-msg.wait{color:var(--text-2,#8a93a6)}
  .vgate-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;
    border-top:1px solid var(--border,#2a334a);padding-top:16px}
  .vgate-help{font-size:12px;color:var(--text-3,#5c6478);font-weight:600}
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
        <div class="agate-sub" id="agSubTitle">Connexion</div>
        <form id="agForm">
          <label>Nom du magasin<input id="agUser" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
          <label>Mot de passe<input id="agPass" type="password" autocomplete="current-password" required></label>
          <div class="agate-err" id="agErr"></div>
          <button class="agate-btn" type="submit" id="agSubmit">Se connecter</button>
          <button class="agate-link" type="button" id="agToSignup">Pas encore de compte ? <b>Créer un compte</b></button>
        </form>
        <form id="suForm" hidden novalidate>
          <label>Nom du magasin<input id="suName" autocomplete="organization" placeholder="ex : BUT Reims" required></label>
          <label>Mot de passe<input id="suPass" type="password" autocomplete="new-password" placeholder="8 caractères minimum" required></label>
          <label>Confirmer le mot de passe<input id="suPass2" type="password" autocomplete="new-password" required></label>
          <div class="agate-group">Adresses de réception des affiches</div>
          <label>Adresse 1 (obligatoire)<input id="suMail1" type="email" autocapitalize="none" spellcheck="false" placeholder="magasin@but.fr" required></label>
          <label>Adresse 2 (facultatif)<input id="suMail2" type="email" autocapitalize="none" spellcheck="false"></label>
          <label>Adresse 3 (facultatif)<input id="suMail3" type="email" autocapitalize="none" spellcheck="false"></label>
          <div class="agate-group">Valorisation du stock</div>
          <div class="agate-drop" id="suDrop" tabindex="0" role="button">
            <span id="suDropT">Déposez votre valorisation (PDF)</span>
            <small>ou cliquez pour la choisir · .pdf</small>
            <input type="file" id="suFile" accept="application/pdf,.pdf" hidden>
          </div>
          <a class="agate-dl" href="docs/Comment-ajouter-sa-valorisation.pdf" download>⬇️ Comment ajouter sa valorisation (PDF)</a>
          <div class="agate-err" id="suErr"></div>
          <button class="agate-btn" type="submit" id="suSubmit">Créer mon compte</button>
          <button class="agate-link" type="button" id="suToLogin">Déjà un compte ? <b>Se connecter</b></button>
        </form>
      </div>`;
    el('agForm').addEventListener('submit', onLoginSubmit);
    el('suForm').addEventListener('submit', onSignupSubmit);
    el('agToSignup').addEventListener('click', () => showSignup(true));
    el('suToLogin').addEventListener('click', () => showSignup(false));
    const suDrop = el('suDrop');
    suDrop.addEventListener('click', () => el('suFile').click());
    suDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el('suFile').click(); } });
    el('suFile').addEventListener('change', e => { if (e.target.files[0]) suPick(e.target.files[0]); });
    suDrop.addEventListener('dragover', e => { e.preventDefault(); suDrop.classList.add('over'); });
    suDrop.addEventListener('dragleave', () => suDrop.classList.remove('over'));
    suDrop.addEventListener('drop', e => {
      e.preventDefault(); suDrop.classList.remove('over');
      if (e.dataTransfer.files.length) suPick(e.dataTransfer.files[0]);
    });

    // chip dans l'en-tête
    const right = document.querySelector('.hero-right') || document.querySelector('header');
    if (right) {
      const chip = document.createElement('div');
      chip.className = 'auth-chip'; chip.id = 'authChip'; chip.hidden = true;
      chip.innerHTML = `
        <span class="ac-info"><b id="acName"></b><span id="acRole"></span></span>
        <button id="acStores" hidden>📂 Valorisations</button>
        <button id="acHelp" title="Aide et support">❔ Aide</button>
        <button id="acLogout">Déconnexion</button>`;
      right.appendChild(chip);
      el('acLogout').addEventListener('click', doLogout);
      el('acStores').addEventListener('click', openStores);
      el('acHelp').addEventListener('click', openHelp);
    }

    // modale admin
    const admin = document.createElement('div'); admin.className = 'gmodal'; admin.id = 'adminModal';
    admin.innerHTML = `
      <div class="gmodal-card">
        <div class="gmodal-head"><h2 id="admTitle">⚙️ Réglages</h2><button class="gmodal-close" data-close>✕</button></div>

        <div data-adm="docs">
        <div class="gpromo-sub" style="margin-top:0">Documents communs (centrale) — publiés une fois, chargés automatiquement chez tous les magasins :</div>
        ${Object.keys(SHARED).filter(id => !SHARED[id].legacy).map(id => `
        <div class="gpromo">
          <div class="gpromo-title">${esc(SHARED[id].name)}${SHARED[id].multi ? ' <span style="font-weight:600;font-size:11px;opacity:.7">· plusieurs fichiers possibles</span>' : ''}</div>
          ${SHARED[id].hint ? `<div class="gpromo-sub">${esc(SHARED[id].hint)}</div>` : ''}
          ${SHARED[id].hasMediaNum ? `
          <div style="margin:8px 0 6px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <label for="ds-medianum-${id}" style="font-size:12px;font-weight:600;opacity:.9;color:#ff9e4a">Numéro de média / dépliant :</label>
            <input type="text" id="ds-medianum-${id}" placeholder="ex : 888" style="padding:4px 8px;font-size:12px;font-family:inherit;font-weight:600;border-radius:6px;border:1px solid rgba(255,107,0,0.4);background:rgba(255,107,0,0.1);color:#fff;width:130px;outline:none">
          </div>` : ''}
          <div class="gmsg" id="ds-status-${id}">Chargement…</div>
          <input type="file" id="ds-file-${id}" accept="${SHARED[id].accept}"${SHARED[id].multi ? ' multiple' : ''} style="display:none">
          <div class="gpromo-actions">
            <button class="gbtn alt" data-pick="${id}">${SHARED[id].multi ? 'Choisir les fichiers' : 'Choisir le fichier'}</button>
            <button class="gbtn" data-upload="${id}">Téléverser</button>
            <button class="gbtn danger" data-delshared="${id}">Retirer</button>
            <span class="gpromo-name" id="ds-name-${id}"></span>
          </div>
        </div>`).join('')}

        </div>

        <div data-adm="masks">
        <div class="gpromo-sub" style="margin-top:0">Masques personnalisés (Étiquettes) — opérations spéciales (SOLDES, VENTES PRIVÉES…), disponibles chez tous les magasins. Déposez le PDF A4 du masque (obligatoire) : sa première page devient le fond. Vous pouvez aussi déposer un PDF A5 (optionnel — planche A4 paysage avec les 2 étiquettes A5 côte à côte) pour activer le format A5 pour ce masque ; sans lui, le choix A5 reste grisé dans l'outil. Le contenu produit se cale automatiquement comme « PROMO DU MOMENT ».</div>
        <div class="gpromo">
          <div class="glist" id="masksList"><div class="gempty">Chargement…</div></div>
          <div class="gpromo-title" style="margin-top:12px">Ajouter un masque</div>
          <label class="gmask-name">Nom affiché<input id="maskName" autocapitalize="characters" placeholder="ex : SOLDES"></label>
          <div class="gpromo-actions">
            <button class="gbtn alt" id="maskPickPdf">Choisir le PDF A4…</button>
            <span class="gpromo-name" id="maskNamePdf"></span>
          </div>
          <input type="file" id="maskFilePdf" accept="application/pdf,.pdf" style="display:none">
          <div class="gpromo-actions">
            <button class="gbtn alt" id="maskPickPdfA5">Choisir le PDF A5 (optionnel)…</button>
            <span class="gpromo-name" id="maskNamePdfA5"></span>
          </div>
          <input type="file" id="maskFilePdfA5" accept="application/pdf,.pdf" style="display:none">
          <div class="gpromo-actions"><button class="gbtn" id="maskAdd">＋ Publier le masque</button></div>
          <div class="gmsg" id="maskMsg"></div>
        </div>

        </div>

        <div data-adm="mail">
        <div class="gpromo-sub" style="margin-top:0">Envoi des campagnes mail — l'adresse depuis laquelle part chaque mail de l'outil « ✉️ Envoi Campagne Mail », ainsi que l'objet et le message proposés par défaut. Ces réglages sont lus par la fonction d'envoi : les changer ici suffit, il n'y a rien à redéployer. Avec une voie SMTP, l'adresse d'expédition doit être celle du compte SMTP configuré (sinon le serveur refuse l'envoi).</div>
        <div class="gpromo">
          <div class="gform">
            <label>Nom de l'expéditeur<input id="mailFromName" placeholder="ex : Boîte à Outils GEFEC"></label>
            <label>Adresse d'expédition<input id="mailFromEmail" type="email" autocapitalize="none" spellcheck="false" placeholder="ex : promo@mondomaine.fr" style="text-transform:none"></label>
            <label>Adresse de réponse (facultatif)<input id="mailReplyTo" type="email" autocapitalize="none" spellcheck="false" placeholder="ex : remi.schaff@but.fr" style="text-transform:none"></label>
            <label>Objet par défaut<input id="mailSubject" placeholder="Votre plan promo — {plans} — {magasin}"></label>
          </div>
          <label class="gmask-name">Message par défaut
            <textarea id="mailMessage" rows="8" placeholder="Bonjour,&#10;&#10;Voici la campagne promo à mettre en place…"></textarea>
          </label>
          <div class="gpromo-sub">Champs remplacés à l'envoi : <b>{magasin}</b> <b>{code}</b> <b>{plans}</b> <b>{affiches}</b> <b>{pages}</b> <b>{date}</b>.</div>
          <div class="gpromo-actions">
            <button class="gbtn" id="mailSave">💾 Enregistrer</button>
            <input class="gmail-test" id="mailTestTo" type="email" autocapitalize="none" spellcheck="false" placeholder="adresse pour un mail de test">
            <button class="gbtn alt" id="mailTest">✉️ Envoyer un test</button>
          </div>
          <div class="gmsg" id="mailMsg"></div>
        </div>

        </div>

        <div data-adm="comptes">
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
        </div>
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
    el('maskPickPdfA5').addEventListener('click', () => el('maskFilePdfA5').click());
    el('maskFilePdfA5').addEventListener('change', () => { const f = el('maskFilePdfA5').files[0]; el('maskNamePdfA5').textContent = f ? f.name : ''; });
    el('maskAdd').addEventListener('click', onAddMask);

    // réglages d'envoi des campagnes mail (expéditeur + modèle de message)
    el('mailSave').addEventListener('click', onSaveMailSettings);
    el('mailTest').addEventListener('click', onTestMailSettings);

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

    // modale « envoyer les affiches par mail » (admin)
    const aff = document.createElement('div'); aff.className = 'gmodal'; aff.id = 'affModal';
    aff.innerHTML = `
      <div class="gmodal-card" style="max-width:660px">
        <div class="gmodal-head"><h2>✉️ Envoyer les affiches</h2><button class="gmodal-close" data-close>✕</button></div>
        <div class="gmodal-sub" id="affWho"></div>

        <div class="gpromo">
          <div class="gpromo-title">Destinataire</div>
          <div class="gpromo-sub" id="affToHint">Adresse du directeur du magasin — elle est mémorisée pour les prochains envois.</div>
          <label class="gmask-name" id="affToRow">Adresse e-mail
            <input id="affTo" type="email" autocapitalize="none" spellcheck="false" placeholder="prenom.nom@but.fr" style="text-transform:none">
          </label>
          <div class="gmsg" id="affPlans">Vérification des plans promo publiés…</div>
        </div>

        <div class="gform">
          <label>Type d'affiche<select id="affTpl">
            <option value="bonplan">BON PLAN</option>
            <option value="promo">PROMO DU MOMENT</option>
          </select></label>
          <label>Format<select id="affFmt">
            <option value="a4">A4 — une affiche par page</option>
            <option value="a5">A5 — deux affiches par page</option>
          </select></label>
          <label>Papier<select id="affBg">
            <option value="1">Papier blanc — fond imprimé</option>
            <option value="0">Papier pré-imprimé — contenu seul</option>
          </select></label>
          <label>Lien valable<select id="affDays">
            <option value="30">30 jours</option>
            <option value="60" selected>60 jours</option>
            <option value="90">90 jours</option>
          </select></label>
        </div>

        <div class="gpromo-actions">
          <button class="gbtn" id="affSend">✉️ Générer et envoyer</button>
          <button class="gbtn alt" id="affLink">🔗 Générer et copier le lien</button>
        </div>
        <div class="gmsg" id="affMsg"></div>
        <div class="affbar" id="affBarWrap" hidden><i id="affBar"></i></div>
        <div class="glist" id="affLog" hidden></div>
      </div>`;
    document.body.appendChild(aff);
    aff.querySelector('[data-close]').addEventListener('click', () => aff.classList.remove('show'));
    aff.addEventListener('click', e => { if (e.target === aff) aff.classList.remove('show'); });
    el('affSend').addEventListener('click', () => runAffiches(true));
    el('affLink').addEventListener('click', () => runAffiches(false));

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

    // Espace magasin : l'unique écran d'un compte magasin. Pas d'outil, pas
    // de dépôt : l'historique des mails reçus, les adresses de réception et
    // l'interrupteur des envois — rien d'autre.
    const sp = document.createElement('div'); sp.id = 'storePortal';
    sp.innerHTML = `
      <div class="sp-wrap">
        <div class="sp-head">
          <div class="agate-logo" style="margin:0">G</div>
          <div class="sp-title"><b id="spName"></b><span>Espace magasin · Boîte à Outils GEFEC</span></div>
          <button class="gbtn alt" id="spLogout" type="button">Déconnexion</button>
        </div>

        <section class="vgate-card sp-card">
          <div class="vgate-title">Adresses de réception</div>
          <div class="vgate-sub">Les affiches de votre magasin sont envoyées à ces adresses (3 au maximum).</div>
          <div class="sp-mails">
            <label class="gate-lbl">Adresse 1 (obligatoire)<input class="gate-input" id="spMail1" type="email" autocapitalize="none" spellcheck="false" placeholder="magasin@but.fr"></label>
            <label class="gate-lbl">Adresse 2 (facultatif)<input class="gate-input" id="spMail2" type="email" autocapitalize="none" spellcheck="false"></label>
            <label class="gate-lbl">Adresse 3 (facultatif)<input class="gate-input" id="spMail3" type="email" autocapitalize="none" spellcheck="false"></label>
          </div>
          <label class="sp-switch"><input type="checkbox" id="spEnabled"> <span>Recevoir les affiches par mail</span></label>
          <div class="sp-actions"><button class="gbtn" id="spSave" type="button">Enregistrer</button></div>
          <div class="vgate-msg" id="spMsg"></div>
        </section>

        <section class="vgate-card sp-card">
          <div class="vgate-title">Ma valorisation</div>
          <div class="vgate-sub" id="spValoInfo">Chargement…</div>
          <div class="agate-drop sp-drop" id="spDrop" tabindex="0" role="button">
            <span>Déposez votre nouvelle valorisation (PDF)</span>
            <small>ou cliquez pour la choisir · .pdf</small>
            <input type="file" id="spFile" accept="application/pdf,.pdf" hidden>
          </div>
          <a class="agate-dl sp-dl" href="docs/Comment-ajouter-sa-valorisation.pdf" download>⬇️ Comment ajouter sa valorisation (PDF)</a>
          <div class="vgate-msg" id="spValoMsg"></div>
        </section>

        <section class="vgate-card sp-card">
          <div class="vgate-title">Historique des mails envoyés</div>
          <div class="sp-hist" id="spHist"><div class="gempty">Chargement…</div></div>
        </section>
      </div>`;
    document.body.appendChild(sp);
    el('spLogout').addEventListener('click', doLogout);
    el('spSave').addEventListener('click', onPortalSave);
    const spDrop = el('spDrop');
    spDrop.addEventListener('click', () => el('spFile').click());
    spDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el('spFile').click(); } });
    el('spFile').addEventListener('change', e => { if (e.target.files[0]) onPortalValo(e.target.files[0]); e.target.value = ''; });
    spDrop.addEventListener('dragover', e => { e.preventDefault(); spDrop.classList.add('over'); });
    spDrop.addEventListener('dragleave', () => spDrop.classList.remove('over'));
    spDrop.addEventListener('drop', e => {
      e.preventDefault(); spDrop.classList.remove('over');
      if (e.dataTransfer.files.length) onPortalValo(e.dataTransfer.files[0]);
    });
  }

  function syncStoreFields() {
    const isStore = el('naRole').value === 'store';
    document.querySelectorAll('.naStoreField').forEach(f => f.style.display = isStore ? '' : 'none');
  }

  /* ---------- Connexion ----------
     L'identifiant est le nom du magasin, normalisé de la même façon qu'à la
     création du compte (fonction « store-signup ») : « BUT Reims » -> but-reims. */
  function loginSlug(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  async function onLoginSubmit(e) {
    e.preventDefault();
    const err = el('agErr'), btn = el('agSubmit');
    err.classList.remove('show'); btn.disabled = true; btn.textContent = 'Connexion…';
    const raw = (el('agUser').value || '').trim().toLowerCase();
    const pass = el('agPass').value || '';
    const email = raw.includes('@') ? raw : `${loginSlug(raw)}@${cfg.EMAIL_DOMAIN || 'gefec.local'}`;
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      await onAuthed();
    } catch (ex) {
      err.textContent = 'Nom du magasin ou mot de passe incorrect.';
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

    // Magasin : aucun accès à l'outil. Aucune coque, aucun cadre d'outil
    // chargé — uniquement son espace (historique, adresses, réception).
    if (CURRENT.role === 'store') {
      if (!CURRENT.storeId) {
        el('agErr').textContent = "Compte magasin incomplet — contactez l'administrateur.";
        el('agErr').classList.add('show');
        await sb.auth.signOut(); showGate(); return;
      }
      await loadStoreRow();
      hideGate();
      await openStorePortal();
      return;
    }

    // en-tête
    el('authChip').hidden = false;
    el('acName').textContent = CURRENT.name;
    el('acRole').textContent = ROLE_LABEL[CURRENT.role] || CURRENT.role;
    el('acStores').hidden = !(CURRENT.role === 'admin' || CURRENT.role === 'director');

    // profil d'accès : la coque n'ouvre aucun outil avant de savoir QUI se connecte
    if (window.applyUserMode) window.applyUserMode({
      role: CURRENT.role, storeId: CURRENT.storeId, name: CURRENT.name,
    });

    hideGate();

    // tout le monde : charger les documents partagés publiés par l'admin
    await loadAllSharedDocs();
    // masques personnalisés (SOLDES, etc.) → injectés dans Étiquettes
    await loadCustomMasks();
    // panneau "état de préparation" sur l'accueil
    renderHomeStatus();
  }

  /* ---------- Espace magasin ----------
     Un compte magasin ne voit jamais la coque : ni outil, ni dépôt. Il
     consulte l'historique des mails envoyés à ses adresses, modifie ces
     adresses (1 à 3) et peut couper la réception. L'enregistrement passe par
     la fonction SQL set_my_mail_settings(), qui ne touche que ces deux champs. */
  let STORE_ROW = null;
  const isStoreUser = () => !!(CURRENT && CURRENT.role === 'store' && CURRENT.storeId);

  async function loadStoreRow() {
    try {
      const { data } = await sb.from('stores')
        .select('id, name, emails, mail_enabled').eq('id', CURRENT.storeId).maybeSingle();
      STORE_ROW = data || null;
    } catch (e) { STORE_ROW = null; }
    return STORE_ROW;
  }

  function spMsg(text, cls) {
    const m = el('spMsg'); if (m) { m.className = 'vgate-msg ' + (cls || ''); m.textContent = text; }
  }

  async function openStorePortal() {
    document.body.classList.add('is-portal');
    el('storePortal').classList.add('show');
    el('spName').textContent = (STORE_ROW && STORE_ROW.name) || CURRENT.name;
    const mails = (STORE_ROW && STORE_ROW.emails) || [];
    ['spMail1', 'spMail2', 'spMail3'].forEach((id, i) => { el(id).value = mails[i] || ''; });
    el('spEnabled').checked = !STORE_ROW || STORE_ROW.mail_enabled !== false;
    spMsg('');
    await Promise.all([renderPortalValo(), renderPortalHistory()]);
  }

  /* Valorisation : le magasin la met à jour lui-même. Au-delà de 30 jours,
     la tournée quotidienne lui envoie un rappel toutes les 72 h. */
  const VALO_REMIND_DAYS = 30;
  function spValoMsg(text, cls) {
    const m = el('spValoMsg'); if (m) { m.className = 'vgate-msg ' + (cls || ''); m.textContent = text; }
  }
  async function renderPortalValo() {
    const info = el('spValoInfo');
    const upd = await getValoUpdatedAt(CURRENT.storeId);
    if (!upd || isNaN(upd.getTime())) { info.innerHTML = 'Aucune valorisation enregistrée.'; return; }
    const age = Math.floor((Date.now() - upd.getTime()) / 86400000);
    const late = age > VALO_REMIND_DAYS;
    info.innerHTML = `Dernier dépôt le <b>${esc(upd.toLocaleDateString('fr-FR', { dateStyle: 'long' }))}</b> (${age} jour${age > 1 ? 's' : ''}).`
      + (late ? ` <span style="color:#f87171;font-weight:700">Plus de ${VALO_REMIND_DAYS} jours : mettez-la à jour.</span>` : '');
  }
  async function onPortalValo(file) {
    const isPdf = (file.type === 'application/pdf') || /\.pdf$/i.test(file.name || '');
    if (!isPdf) { spValoMsg('Format invalide — un PDF est attendu.', 'err'); return; }
    spValoMsg('Vérification de la valorisation…', 'wait');
    try {
      let n = null;
      try { n = await countPdfEans(file); } catch (x) { throw new Error('ce PDF est illisible'); }
      if (n === 0) throw new Error("ce PDF ne contient aucun code EAN : ce n'est pas une valorisation du stock");
      spValoMsg('Envoi…', 'wait');
      const path = `${CURRENT.storeId}/valorisation.pdf`;
      const { error } = await sb.storage.from('valorisations').upload(path, file, { upsert: true, contentType: 'application/pdf' });
      if (error) throw new Error(error.message);
      const { error: merr } = await sb.from('valorisations').upsert({
        store_id: CURRENT.storeId, file_path: path, file_name: file.name, ean_count: n,
        updated_at: new Date().toISOString(), updated_by: CURRENT.userId,
      });
      if (merr) throw new Error(merr.message);
      spValoMsg(`Valorisation enregistrée ✓${n != null ? ` — ${n} EAN` : ''}`, 'ok');
      await renderPortalValo();
    } catch (e) { spValoMsg('Échec : ' + (e.message || e), 'err'); }
  }

  async function onPortalSave() {
    const emails = ['spMail1', 'spMail2', 'spMail3'].map(id => el(id).value.trim().toLowerCase()).filter(Boolean);
    if (!emails.length) { spMsg('Au moins une adresse e-mail est requise.', 'err'); return; }
    if (emails.some(e => !isMail(e))) { spMsg('Adresse e-mail invalide.', 'err'); return; }
    if (new Set(emails).size !== emails.length) { spMsg('Une même adresse est saisie deux fois.', 'err'); return; }
    const enabled = el('spEnabled').checked;
    const btn = el('spSave'); btn.disabled = true;
    spMsg('Enregistrement…', 'wait');
    try {
      const { error } = await sb.rpc('set_my_mail_settings', { p_emails: emails, p_enabled: enabled });
      if (error) throw new Error(error.message);
      STORE_ROW = Object.assign({}, STORE_ROW || {}, { emails, mail_enabled: enabled });
      spMsg(enabled ? 'Enregistré ✓' : 'Enregistré ✓ — la réception des mails est désactivée.', 'ok');
    } catch (e) { spMsg('Erreur : ' + (e.message || e), 'err'); }
    finally { btn.disabled = false; }
  }

  async function renderPortalHistory() {
    const host = el('spHist');
    try {
      const { data, error } = await sb.from('campagne_mails')
        .select('email, subject, plans, operations, products, pages, sent_at')
        .eq('store_id', CURRENT.storeId).order('sent_at', { ascending: false }).limit(200);
      if (error) throw error;
      if (!data || !data.length) { host.innerHTML = '<div class="gempty">Aucun mail envoyé pour le moment.</div>'; return; }
      host.innerHTML = `<table class="sp-table"><thead><tr><th>Date</th><th>Destinataire</th><th>Contenu</th><th>Affiches</th></tr></thead><tbody>${
        data.map(m => `<tr>
          <td>${esc(new Date(m.sent_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</td>
          <td>${esc(m.email)}</td>
          <td>${esc(m.operations || m.plans || m.subject || '')}</td>
          <td>${m.products != null ? esc(m.products) : '—'}</td></tr>`).join('')
      }</tbody></table>`;
    } catch (e) {
      host.innerHTML = `<div class="gempty">Historique indisponible : ${esc(e.message || e)}</div>`;
    }
  }

  /* ---------- Création de compte magasin (sans session) ----------
     Nom du magasin, mot de passe, 1 à 3 adresses, valorisation PDF : tout est
     obligatoire. Le PDF est relu ici pour vérifier qu'il contient bien des
     codes EAN (une valorisation), puis tout part à la fonction Edge
     « store-signup », qui crée le compte en une seule fois. */
  let suFile = null;
  function showSignup(on) {
    el('agForm').hidden = !!on;
    el('suForm').hidden = !on;
    el('agSubTitle').textContent = on ? 'Créer le compte de votre magasin' : 'Connexion';
    el('agErr').classList.remove('show'); el('suErr').classList.remove('show');
  }
  function suError(t) { const e = el('suErr'); e.textContent = t; e.classList.add('show'); }
  function suPick(file) {
    const ok = file && ((file.type === 'application/pdf') || /\.pdf$/i.test(file.name || ''));
    if (!ok) { suFile = null; el('suDropT').textContent = 'Déposez votre valorisation (PDF)'; suError('Format invalide — un PDF est attendu.'); return; }
    suFile = file;
    el('suErr').classList.remove('show');
    el('suDropT').textContent = '📄 ' + file.name;
    el('suDrop').classList.add('loaded');
  }
  async function countPdfEans(file) {
    const lib = window.pdfjsLib;
    if (!lib) return null;                    // pas de lecteur : la fonction vérifiera le format
    try { lib.GlobalWorkerOptions.workerSrc = lib.GlobalWorkerOptions.workerSrc || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch (e) {}
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const set = new Set();
    for (let i = 1; i <= pdf.numPages; i++) {
      const text = (await (await pdf.getPage(i)).getTextContent()).items.map(t => t.str).join(' ');
      (text.match(/\b\d{13}\b/g) || []).forEach(e => set.add(e));
    }
    return set.size;
  }
  async function onSignupSubmit(e) {
    e.preventDefault();
    el('suErr').classList.remove('show');
    const name = el('suName').value.trim().replace(/\s+/g, ' ');
    const pass = el('suPass').value, pass2 = el('suPass2').value;
    const emails = ['suMail1', 'suMail2', 'suMail3'].map(id => el(id).value.trim().toLowerCase()).filter(Boolean);
    if (loginSlug(name).length < 2) return suError('Indiquez le nom de votre magasin.');
    if (pass.length < 8) return suError('Le mot de passe doit faire au moins 8 caractères.');
    if (pass !== pass2) return suError('Les deux mots de passe ne correspondent pas.');
    if (!emails.length) return suError('Au moins une adresse e-mail est requise.');
    if (emails.some(m => !isMail(m))) return suError('Adresse e-mail invalide.');
    if (new Set(emails).size !== emails.length) return suError('Une même adresse est saisie deux fois.');
    if (!suFile) return suError('La valorisation PDF est obligatoire.');

    const btn = el('suSubmit'); btn.disabled = true; btn.textContent = 'Vérification de la valorisation…';
    try {
      let n = null;
      try { n = await countPdfEans(suFile); } catch (x) { throw new Error('Ce PDF est illisible.'); }
      if (n === 0) throw new Error("Ce PDF ne contient aucun code EAN : ce n'est pas une valorisation du stock.");

      btn.textContent = 'Création du compte…';
      const fd = new FormData();
      fd.append('store_name', name);
      fd.append('password', pass);
      fd.append('emails', JSON.stringify(emails));
      if (n != null) fd.append('ean_count', String(n));
      fd.append('file', suFile, suFile.name || 'valorisation.pdf');
      const res = await fetch(`${cfg.SUPABASE_URL}/functions/v1/store-signup`, {
        method: 'POST', headers: { apikey: cfg.SUPABASE_KEY, Authorization: `Bearer ${cfg.SUPABASE_KEY}` }, body: fd,
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || `Création impossible (HTTP ${res.status}).`);

      btn.textContent = 'Connexion…';
      const { error } = await sb.auth.signInWithPassword({ email: `${out.login}@${cfg.EMAIL_DOMAIN || 'gefec.local'}`, password: pass });
      if (error) throw new Error('Compte créé — connectez-vous avec le nom du magasin.');
      await onAuthed();
    } catch (ex) {
      suError(ex.message || String(ex));
    } finally {
      btn.disabled = false; btn.textContent = 'Créer mon compte';
    }
  }

  // Ruban de statut : valorisation + documents partagés (chips inline)
  async function renderHomeStatus() {
    const slot = el('srDocs');
    const ribbon = el('statusRibbon');
    if (!slot || !CURRENT) return;
    // Le ruban est un outil de pilotage : il n'a d'intérêt que pour
    // l'administrateur. La boucle des documents partagés, elle, tourne pour
    // tout le monde — c'est elle qui diffuse le numéro de média aux outils.
    const pourAdmin = CURRENT.role === 'admin';
    const chips = [];

    // (la pastille « Valorisation » ne concernait que le magasin, qui ne voit
    //  plus le ruban : son état lui est rappelé par le portail de dépôt)

    const labels = { 'plan-promo-tv': 'Plan promo TV', 'plan-promo-pem': 'Plan promo PEM', 'plan-promo-star': 'Produits Star', 'affiches-cetelem': 'CETELEM', 'medias-soldes': 'Soldes' };
    for (const id of Object.keys(SHARED)) {
      if (!labels[id]) continue; // document hérité : pas de pastille dédiée
      const meta = await fetchSharedMeta(id);
      if (meta && meta.file_path && meta.updated_at) {
        let labelName = labels[id];
        if (id === 'affiches-cetelem' && meta.mediaNum) {
          labelName = `CETELEM (Média ${meta.mediaNum})`;
          window.CETELEM_MEDIA_NUM = meta.mediaNum;
          broadcastMediaNum(meta.mediaNum);
        }
        chips.push({ st: 'ok', name: labelName, val: new Date(meta.updated_at).toLocaleDateString('fr-FR') });
      } else {
        chips.push({ st: 'none', name: labels[id], val: 'non publié' });
      }
    }

    slot.innerHTML = chips.map(c =>
      `<div class="sr-chip"><span class="sr-dot ${c.st}"></span><span class="sr-name">${esc(c.name)}</span><span class="sr-sep">·</span><span>${esc(c.val)}</span></div>`
    ).join('');
    if (ribbon) ribbon.hidden = !pourAdmin;
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
    try {
      const b = window.BASE_ECO;
      if (b && b.data) {
        const eco = Object.keys(b.data).length;
        const refs = b.info ? Object.keys(b.info).length : eco;
        base = refs + ' réf. (dont ' + eco + ' avec éco-participation), données du '
             + (b.updated ? new Date(b.updated).toLocaleDateString('fr-FR') : '?')
             + (window.BASE_CHECKED ? ', source vérifiée le ' + new Date(window.BASE_CHECKED).toLocaleDateString('fr-FR') : '');
      }
    } catch (e) {}
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
      document.dispatchEvent(new CustomEvent('gefec:valo-error', { detail: { message: e.message || String(e) } }));
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
    // le portail « valorisation à jour » attend ce signal pour s'effacer
    document.dispatchEvent(new CustomEvent('gefec:valo-saved'));
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
    // Produits Star : fichier EXCEL (pas PDF), un seul fichier — la sélection
    // nationale de produits star, croisée avec la valorisation du magasin ;
    // n'imprime que le masque officiel PROMO DU MOMENT (repère ★ sur l'affiche).
    'plan-promo-star':  { name: 'Plan Produits Star (fichier Excel)', accept: '.xlsx,.xls,.csv', frameSel: '.tool-frame[data-src="etiquette.html"]', input: 'filePromoStar' },
    'plan-promo':       { name: 'Plan promo (ancien format unique)', accept: 'application/pdf,.pdf', frameSel: '.tool-frame[data-src="etiquette.html"]', input: 'filePromo', multi: true, legacy: true },
    'affiches-cetelem': { name: 'Affiches CETELEM (dépliant PDF ou ZIP)', accept: '.pdf,application/pdf,.zip,application/zip', frameSel: '.tool-frame[data-tpl="tool-match"]', input: 'file2', multi: true, hasMediaNum: true },
    'medias-soldes':    { name: 'Fichiers Média Centrale', accept: '.pdf,.zip',           frameSel: '.tool-frame[data-tpl="tool-solde"]',    input: 'mc-input', multi: true },
    // Base article NOSICA déposée à la main : le classeur est injecté dans les
    // deux outils d'étiquettes (Plan Promo et Promo Perso), qui le relisent et
    // remplacent la base automatique (éco-participations, libellés, prix).
    'base-nosica':      { name: 'Base article NOSICA (fichier Excel)', accept: '.xlsx,.xls,.csv', frameSel: '.tool-frame[data-src^="etiquette.html"]', input: 'adminBaseFile',
                          hint: "À utiliser quand la mise à jour automatique de nuit est en panne ou en retard : déposez le fichier Excel NOSICA téléchargé depuis le portail. Il remplace la base article (éco-participations, libellés, prix de vente) chez tous les magasins, dès leur prochaine connexion." },
  };
  const MODULE_DOC = { etiquette: ['plan-promo-tv', 'plan-promo-pem', 'plan-promo-star'], match: 'affiches-cetelem', solde: 'medias-soldes' };
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

  function broadcastMediaNum(mediaNum) {
    const num = String(mediaNum || '').trim();
    window.CETELEM_MEDIA_NUM = num;
    try {
      const matchCard = document.querySelector('.tool-card[data-tool="match"]');
      if (matchCard) {
        const sub = matchCard.querySelector('.tc-sub');
        if (sub) sub.textContent = num ? `Dépliant Média ${num} · A5 / A4` : 'Dépliant PDF · A5 / A4';
      }
      const matchTab = document.querySelector('.tab[data-tab="match"]');
      if (matchTab) {
        matchTab.innerHTML = `<span class="dot"></span>Affiches CETELEM${num ? ` <span style="font-size:10.5px;opacity:.9;font-weight:700">(${esc(num)})</span>` : ''}`;
      }
    } catch (e) {}
    document.querySelectorAll('.tool-frame').forEach(frame => {
      try {
        if (frame.contentWindow) {
          if (typeof frame.contentWindow.setMediaNum === 'function') {
            frame.contentWindow.setMediaNum(num);
          }
          frame.contentWindow.postMessage({ type: 'gefec:medianum', mediaNum: num }, '*');
        }
      } catch (e) {}
    });
  }

  async function fetchSharedMeta(id) {
    try {
      const { data } = await sb.from('shared_docs').select('file_path, file_name, updated_at').eq('id', id).maybeSingle();
      if (!data) return null;
      let mediaNum = '';
      const m = String(data.file_name || '').match(/^[mM][ée]dia\s*([0-9a-zA-Z_-]+)\s*[·–—:\-]/i);
      if (m) mediaNum = m[1];
      if (id === 'affiches-cetelem') {
        try {
          const { data: bData } = await sb.storage.from('shared').download('affiches-cetelem_meta.json');
          if (bData) {
            const txt = await bData.text();
            const j = JSON.parse(txt);
            if (j && j.mediaNum) mediaNum = String(j.mediaNum).trim();
          }
        } catch (ex) {}
      }
      return { ...data, mediaNum };
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
      try { if (typeof win.syncUserRole === 'function') win.syncUserRole(); } catch (e) {}
      if (id === 'affiches-cetelem' && window.CETELEM_MEDIA_NUM) {
        try { if (typeof win.setMediaNum === 'function') win.setMediaNum(window.CETELEM_MEDIA_NUM); } catch (e) {}
      }
    } catch (e) { frame['__inj_' + id] = false; }
  }
  // un document partagé peut concerner plusieurs outils (ex. la base article,
  // utilisée par Plan Promo ET par Promo Perso) : on injecte dans chaque cadre
  function tryInjectShared(id) {
    const cfg = SHARED[id]; if (!cfg) return;
    document.querySelectorAll(cfg.frameSel).forEach(frame => {
      injectSharedInto(id, frame);                            // si déjà chargé
      if (frame['__lis_' + id]) return;                       // un seul écouteur par cadre
      frame['__lis_' + id] = true;
      frame.addEventListener('load', () => injectSharedInto(id, frame)); // au prochain chargement
    });
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
    // ruban d'accueil : signaler une base article déposée à la main
    const nb = metas['base-nosica'];
    if (window.setSharedBaseInfo) window.setSharedBaseInfo(nb && nb.file_path ? nb : null);
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
    etiquette: '🏷️ Plans Promo TV, PEM & Star',
    match: '📄 Affiches CETELEM',
    solde: '🧮 Soldes — Média Centrale',
  };
  const MODULE_NOTE = {
    etiquette: "Chaque plan publié est déjà chargé dans son onglet (TV / PEM / Star) avec la valorisation de votre magasin : vous pouvez croiser et imprimer directement. Si vous avez une version plus récente, déposez-la dans l'étape « Chargez vos fichiers » : elle sera reconnue et rangée dans le bon onglet.",
    match: "Le dépliant CETELEM publié par la centrale est déjà chargé dans l'outil : vous pouvez générer vos affiches directement. Déposez votre propre dépliant (PDF ou ZIP) si vous en avez un plus récent.",
    solde: "Les fichiers Média Centrale sont déjà chargés. Ajoutez vos fichiers de regroupement magasin, puis lancez « Analyser et générer ».",
  };
  const MODULE_NOTE_EMPTY = {
    etiquette: "Aucun plan promo publié pour le moment. Vous pouvez déposer vos propres plans promo TV et PEM dans l'outil (le plan Produits Star est un fichier Excel, à déposer dans son propre onglet).",
    match: "Aucun dépliant CETELEM publié par l'administrateur. Vous pouvez déposer votre propre dépliant (PDF de la centrale ou ZIP) dans l'outil.",
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
    if (isStoreUser()) return true;       // magasin : aucun outil, aucun pop-up
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
      const mBadge = meta.mediaNum ? `[Média ${meta.mediaNum}] ` : '';
      s.textContent = `Publié : ${mBadge}${meta.file_name || ''} — ${new Date(meta.updated_at).toLocaleString('fr-FR')}`;
      if (id === 'affiches-cetelem') {
        const minput = el('ds-medianum-' + id);
        if (minput && meta.mediaNum && !minput.value) minput.value = meta.mediaNum;
        window.CETELEM_MEDIA_NUM = meta.mediaNum || '';
        broadcastMediaNum(meta.mediaNum || '');
      }
    } else {
      s.className = 'gmsg';
      s.textContent = 'Aucun fichier publié pour le moment.';
      if (id === 'affiches-cetelem') {
        const minput = el('ds-medianum-' + id);
        if (minput && !minput.value) minput.value = '';
      }
    }
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
      let mediaNum = '';
      if (cfg.hasMediaNum) {
        const minput = el('ds-medianum-' + id);
        if (minput) mediaNum = minput.value.trim().replace(/^[mM][ée]dia\s*/i, '').trim();
      }
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
        const displayName = (mediaNum ? `Média ${mediaNum} · ` : '') + (files.length + ' fichier(s)');
        await sb.from('shared_docs').upsert({
          id, file_path: folderFor(id), file_name: displayName,
          updated_at: new Date().toISOString(), updated_by: CURRENT.userId,
        });
        sharedFiles[id] = files;
      } else {
        const f = files[0];
        const path = pathFor(id, f.name);
        const { error } = await sb.storage.from('shared').upload(path, f, { upsert: true, contentType: f.type || undefined });
        if (error) throw error;
        const displayName = (mediaNum ? `Média ${mediaNum} · ` : '') + f.name;
        await sb.from('shared_docs').upsert({
          id, file_path: path, file_name: displayName,
          updated_at: new Date().toISOString(), updated_by: CURRENT.userId,
        });
        sharedFiles[id] = [f];
      }
      if (id === 'affiches-cetelem') {
        try {
          const metaPayload = JSON.stringify({ mediaNum, updatedAt: new Date().toISOString() });
          await sb.storage.from('shared').upload('affiches-cetelem_meta.json', new Blob([metaPayload], { type: 'application/json' }), { upsert: true });
        } catch (e) {}
        window.CETELEM_MEDIA_NUM = mediaNum;
        broadcastMediaNum(mediaNum);
      }
      sharedLoadedAt[id] = null;
      document.querySelectorAll('.tool-frame').forEach(fr => { fr['__inj_' + id] = false; });
      tryInjectShared(id);
      const mediaLabel = mediaNum ? ` (Média ${mediaNum})` : '';
      toast(cfg.name + mediaLabel + (files.length > 1 ? ` (${files.length} fichiers)` : '') + ' publié pour tous les magasins ✓');
      input.value = ''; const nm = el('ds-name-' + id); if (nm) nm.textContent = '';
      refreshSharedStatus(id);
      if (id === 'base-nosica' && window.setSharedBaseInfo) window.setSharedBaseInfo(await fetchSharedMeta(id));
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
      if (id === 'affiches-cetelem') {
        try { await sb.storage.from('shared').remove(['affiches-cetelem_meta.json']); } catch(e) {}
        window.CETELEM_MEDIA_NUM = '';
        broadcastMediaNum('');
        const minput = el('ds-medianum-affiches-cetelem');
        if (minput) minput.value = '';
      }
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
      if (id === 'base-nosica' && window.setSharedBaseInfo) window.setSharedBaseInfo(null);
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
    const fpdfA5 = el('maskFilePdfA5').files[0]; // optionnel : active le format A5 pour ce masque
    const msg = el('maskMsg');
    if (!name) { msg.className = 'gmsg err'; msg.textContent = 'Indiquez un nom.'; return; }
    if (!fpdf) { msg.className = 'gmsg err'; msg.textContent = 'Choisissez le PDF A4 du masque.'; return; }
    const btn = el('maskAdd'); btn.disabled = true; btn.textContent = 'Conversion…';
    try {
      const img = await pdfFirstPageToBlob(fpdf, 1240); // page 1 → fond A4
      const imgA5 = fpdfA5 ? await pdfFirstPageToBlob(fpdfA5, 1754) : null; // page 1 → fond A5 (planche A4 paysage, ≈150 dpi)
      btn.textContent = 'Publication…';
      const masks = await loadMaskManifest();
      let id = slugify(name);
      if (['bonplan', 'promo'].includes(id) || masks.some(m => m.id === id)) id += '-' + Date.now().toString(36).slice(-4);
      const p4 = `masks/${id}/a4.jpg`;
      const r = await sb.storage.from('shared').upload(p4, img, { upsert: true, contentType: 'image/jpeg' });
      if (r.error) throw r.error;
      let p5 = null;
      if (imgA5) {
        p5 = `masks/${id}/a5.jpg`;
        const r5 = await sb.storage.from('shared').upload(p5, imgA5, { upsert: true, contentType: 'image/jpeg' });
        if (r5.error) throw r5.error;
      }
      masks.push({ id, name, calage: 'promo', a4: p4, a5: p5, updated_at: new Date().toISOString(), updated_by: CURRENT.userId });
      await saveMaskManifest(masks);
      el('maskName').value = ''; el('maskFilePdf').value = ''; el('maskNamePdf').textContent = '';
      el('maskFilePdfA5').value = ''; el('maskNamePdfA5').textContent = '';
      msg.className = 'gmsg ok'; msg.textContent = `Masque « ${name} » publié pour tous les magasins${p5 ? ' (A4 + A5)' : ' (A4 seul)'} ✓`;
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
  // les masques concernent les deux outils d'étiquettes : Plan Promo TV & PEM
  // (etiquette.html) ET Promo Perso (etiquette.html?plan=perso)
  const ETIQ_FRAMES = '.tool-frame[data-src^="etiquette.html"]';
  function tryInjectMasks() {
    document.querySelectorAll(ETIQ_FRAMES).forEach(frame => {
      injectMasksInto(frame);
      if (frame.__masksLis) return;                 // un seul écouteur par cadre
      frame.__masksLis = true;
      frame.addEventListener('load', () => { frame.__masksInj = false; injectMasksInto(frame); });
    });
  }

  /* ---------- Modale admin : comptes ---------- */
  /* Une seule modale, quatre sections : chaque case de l'accueil administrateur
     ouvre la sienne. Rien n'est rechargé inutilement — on ne rafraîchit que la
     section demandée. */
  const ADM_SECTIONS = {
    docs:    { titre: '📤 Plans promo & documents partagés', charge: refreshAllSharedStatus },
    masks:   { titre: '🎭 Masques personnalisés',            charge: refreshMasksList },
    mail:    { titre: "✉️ Réglages d'envoi des campagnes",   charge: refreshMailSettings },
    comptes: { titre: '👥 Comptes utilisateurs',             charge: () => { syncStoreFields(); refreshAccounts(); } },
  };
  async function openAdmin(section) {
    const cle = ADM_SECTIONS[section] ? section : 'docs';
    const conf = ADM_SECTIONS[cle];
    el('admTitle').textContent = conf.titre;
    document.querySelectorAll('#adminModal [data-adm]').forEach(bloc => {
      bloc.style.display = bloc.dataset.adm === cle ? '' : 'none';
    });
    el('adminModal').classList.add('show');
    try { await conf.charge(); } catch (e) { /* la section reste ouverte */ }
  }
  // ouvertes depuis les cases de l'accueil administrateur (coque)
  window.openAdminSection = openAdmin;
  window.openStoresModal = () => openStores();

  /* ---------- Réglages d'envoi des campagnes mail (admin) ----------
     Stockés dans la table « app_settings », clé « mail » :
       { from_name, from_email, reply_to, subject, message }
     La fonction Edge « send-campagne-mail » les relit en service_role, ce qui
     permet de changer l'adresse d'expédition sans redéployer la fonction.
     Sans adresse ici, la fonction retombe sur son secret MAIL_FROM. */
  const MAIL_SETTINGS_KEY = 'mail';
  const MAIL_DEFAULT_SUBJECT = 'Votre plan promo — {plans} — {magasin}';
  const MAIL_DEFAULT_MESSAGE = [
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

  async function refreshMailSettings() {
    const msg = el('mailMsg'); if (!msg) return;
    msg.className = 'gmsg'; msg.textContent = '';
    let v = {};
    try {
      const { data, error } = await sb.from('app_settings')
        .select('value').eq('key', MAIL_SETTINGS_KEY).maybeSingle();
      if (error) throw error;
      v = (data && data.value) || {};
    } catch (e) {
      msg.className = 'gmsg err';
      msg.textContent = "Réglages d'envoi illisibles — la migration « add-campagne-mail.sql » a-t-elle été exécutée ? (" + (e.message || e) + ')';
    }
    el('mailFromName').value = v.from_name || '';
    el('mailFromEmail').value = v.from_email || '';
    el('mailReplyTo').value = v.reply_to || '';
    el('mailSubject').value = v.subject || MAIL_DEFAULT_SUBJECT;
    el('mailMessage').value = v.message || MAIL_DEFAULT_MESSAGE;
  }

  function readMailSettings() {
    return {
      from_name: el('mailFromName').value.trim(),
      from_email: el('mailFromEmail').value.trim(),
      reply_to: el('mailReplyTo').value.trim(),
      subject: el('mailSubject').value.trim() || MAIL_DEFAULT_SUBJECT,
      message: el('mailMessage').value.trim() || MAIL_DEFAULT_MESSAGE,
    };
  }

  async function onSaveMailSettings() {
    const msg = el('mailMsg'), btn = el('mailSave');
    const v = readMailSettings();
    if (!isMail(v.from_email)) {
      msg.className = 'gmsg err';
      msg.textContent = "Renseignez une adresse d'expédition valide.";
      return;
    }
    if (v.reply_to && !isMail(v.reply_to)) {
      msg.className = 'gmsg err';
      msg.textContent = 'Adresse de réponse invalide.';
      return;
    }
    btn.disabled = true;
    msg.className = 'gmsg'; msg.textContent = 'Enregistrement…';
    try {
      const { error } = await sb.from('app_settings').upsert({
        key: MAIL_SETTINGS_KEY, value: v,
        updated_at: new Date().toISOString(), updated_by: CURRENT.userId,
      }, { onConflict: 'key' });
      if (error) throw error;
      msg.className = 'gmsg ok';
      msg.textContent = `Expéditeur enregistré : ${v.from_name ? v.from_name + ' <' + v.from_email + '>' : v.from_email} ✓`;
      toast('Réglages d\'envoi enregistrés ✓');
    } catch (e) {
      msg.className = 'gmsg err';
      msg.textContent = 'Échec : ' + (e.message || e);
    } finally { btn.disabled = false; }
  }

  // Un vrai mail, sans pièce jointe, pour vérifier la voie d'envoi et
  // l'expéditeur avant de lancer une campagne sur les 16 magasins.
  async function onTestMailSettings() {
    const msg = el('mailMsg'), btn = el('mailTest');
    const to = el('mailTestTo').value.trim();
    if (!isMail(to)) {
      msg.className = 'gmsg err';
      msg.textContent = 'Indiquez une adresse valide pour le test.';
      return;
    }
    const v = readMailSettings();
    btn.disabled = true;
    msg.className = 'gmsg'; msg.textContent = 'Envoi du test…';
    try {
      const { data, error } = await sb.functions.invoke('send-campagne-mail', {
        body: {
          test: true, to, store_id: '', store_name: 'Test de configuration',
          subject: 'Test — Boîte à Outils GEFEC',
          message: 'Ceci est un test de configuration envoyé depuis ⚙️ Réglages.\n\n'
            + 'Si vous lisez ce message, l\'envoi automatique des campagnes fonctionne : '
            + 'expéditeur ' + (v.from_email || '(secret MAIL_FROM)') + '.',
          files: [],
        },
      });
      if (error) {
        // le motif réel est dans le corps de la réponse : supabase-js n'en
        // remonte qu'un message générique
        let m = error.message || 'Erreur';
        try {
          const raw = (await error.context?.text?.() || '').trim();
          if (raw) {
            try { const j = JSON.parse(raw); m = j.error || j.message || (j.code ? 'code ' + j.code : m); }
            catch (x) { m = raw.slice(0, 300); }
          }
        } catch (x) {}
        const st = error.context && error.context.status;
        throw new Error(m + (st ? ` (HTTP ${st})` : ''));
      }
      if (data && data.ok === false) throw new Error(data.error || 'envoi non configuré');
      if (data && data.error) throw new Error(data.error);
      msg.className = 'gmsg ok';
      msg.textContent = `Test envoyé à ${to} via ${(data && data.provider) || 'la voie configurée'} ✓`;
    } catch (e) {
      msg.className = 'gmsg err';
      msg.textContent = 'Échec du test : ' + (e.message || e);
    } finally { btn.disabled = false; }
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
      // adresses de réception (1 à 3) et interrupteur : migration comptes-autonomes.sql
      const { data: stores, error: serr } = await sb.from('stores').select('id, name, region, emails, mail_enabled').order('id');
      if (serr) throw serr;
      // s.email = adresse principale, seulement si le magasin reçoit ses mails
      (stores || []).forEach(s => {
        s.emails = s.emails || [];
        s.email = s.mail_enabled !== false && s.emails.length ? s.emails[0] : null;
      });
      let metaBy = {};
      try {
        const { data: metas } = await sb.from('valorisations').select('store_id, ean_count, updated_at');
        (metas || []).forEach(m => { metaBy[m.store_id] = m; });
      } catch (e) {}
      // dernier envoi d'affiches par magasin (si la migration affiches est en place)
      let mailBy = {};
      try {
        const { data: mails } = await sb.from('affiches_mails')
          .select('store_id, email, sent_at, products, sent_via').order('sent_at', { ascending: false });
        (mails || []).forEach(m => { if (!mailBy[m.store_id]) mailBy[m.store_id] = m; });
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
        return { s, has, meta, dt, ageDays, status, seen, mail: mailBy[s.id] || null };
      });
      const nOk = enriched.filter(e => e.status === 'ok').length;
      const nLate = enriched.filter(e => e.status === 'late').length;
      const nNever = enriched.filter(e => e.status === 'never').length;
      const nActive = enriched.filter(e => e.seen && (Date.now() - e.seen.getTime()) / 86400000 <= 7).length;
      // tri : le plus urgent d'abord (jamais déposée, puis le plus ancien)
      enriched.sort((a, b) => (b.status === 'never' ? 1e9 : (b.ageDays || 0)) - (a.status === 'never' ? 1e9 : (a.ageDays || 0)));

      // envoi groupé : réservé à l'administrateur, sur les magasins dont la
      // valorisation est déposée ET dont l'adresse du directeur est connue
      const sendable = enriched.filter(e => e.has && e.s.email);
      const bulk = (CURRENT && CURRENT.role === 'admin')
        ? `<div class="gpromo-actions" style="margin:0 0 14px">
             <button class="gbtn" id="stMailAll"${sendable.length ? '' : ' disabled'}>✉️ Envoyer les affiches aux ${sendable.length} magasin(s) prêt(s)</button>
             <span class="gpromo-name">Valorisation déposée + adresse e-mail de réception renseignée</span>
           </div>` : '';
      const summary = bulk + `<div class="stsum">
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
        const mailTxt = e.mail
          ? `✉️ affiches envoyées ${relAge(new Date(e.mail.sent_at))} à ${esc(e.mail.email)}`
          : (e.s.mail_enabled === false ? `<span style="color:#f87171">Réception des mails désactivée</span>` : (e.s.emails.length ? `✉️ ${esc(e.s.emails.join(', '))}` : ''));
        const isAdmin = CURRENT && CURRENT.role === 'admin';
        return `<div class="grow">
          ${badge}
          <div class="gr-main"><b>${esc(e.s.name || e.s.id)}</b>
            <div class="gr-sub">${esc(e.s.id)}${e.s.region ? ' · ' + esc(e.s.region) : ''} — ${esc(sub)} · ${esc(seenTxt)}</div>
            ${mailTxt ? `<div class="stmail">${mailTxt}</div>` : ''}</div>
          ${e.has ? `<button data-load="${esc(e.s.id)}">Charger dans les outils</button>
                     <button data-dl="${esc(e.s.id)}">Télécharger</button>` : ''}
          ${e.has && isAdmin && e.s.mail_enabled !== false ? `<button data-mail="${esc(e.s.id)}">✉️ Affiches</button>` : ''}
        </div>`;
      }).join('');
      list.innerHTML = summary + rowsHtml;
      list.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', async () => {
        await loadStoreValo(b.dataset.load, false); el('storesModal').classList.remove('show');
      }));
      list.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => downloadStoreValo(b.dataset.dl)));
      list.querySelectorAll('[data-mail]').forEach(b => b.addEventListener('click', () => {
        const e = enriched.find(x => String(x.s.id) === b.dataset.mail);
        if (e) openAffiches('one', [e.s]);
      }));
      const all = el('stMailAll');
      if (all) all.addEventListener('click', () => openAffiches('all', sendable.map(e => e.s)));
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

  /* ---------- Affiches prêtes à imprimer : le mail de téléchargement ----------
     Quand un magasin a déposé sa valorisation et que les plans promo TV et PEM
     sont publiés, l'administrateur envoie au directeur du magasin un mail qui
     ne contient qu'une chose : un lien. Un clic, et tout le jeu d'affiches de
     SON magasin arrive en PDF, prêt à imprimer.

     Le PDF est fabriqué ici, dans le navigateur de l'administrateur : la coque
     charge `etiquette.html?export=1` dans un cadre invisible — le moteur
     d'étiquettes, sans écran — lui passe les plans publiés et la valorisation
     du magasin, et récupère toutes les planches en un seul PDF. Ce PDF est
     déposé dans le bucket privé « affiches », puis signé pour la durée choisie :
     c'est cette URL signée que le mail transporte. Le directeur n'a ni compte à
     saisir ni fichier à croiser. */
  const AFF_BUCKET = 'affiches';
  const affPath = (storeId) => `${storeId}/affiches.pdf`;
  const isMail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim());
  let affTargets = [], affMode = 'one', affBusy = false;

  // le générateur : l'outil Étiquettes, chargé une seule fois, hors écran
  let exportFrameP = null;
  function getExportFrame() {
    if (exportFrameP) return exportFrameP;
    exportFrameP = new Promise((res, rej) => {
      const fr = document.createElement('iframe');
      fr.id = 'gefecExportFrame';
      fr.title = "Générateur d'affiches";
      fr.setAttribute('aria-hidden', 'true');
      fr.addEventListener('load', () => res(fr));
      fr.addEventListener('error', () => rej(new Error("générateur d'affiches introuvable")));
      fr.src = 'etiquette.html?export=1';
      document.body.appendChild(fr);
      setTimeout(() => rej(new Error("le générateur d'affiches n'a pas démarré")), 90000);
    }).catch(e => { exportFrameP = null; throw e; });
    return exportFrameP;
  }

  // Plans promo publiés, prêts à être passés au générateur. Le résultat est
  // gardé tant que la publication n'a pas changé (jeton = dates de publication) :
  // un envoi groupé ne relit pas les mêmes PDF magasin après magasin.
  let planCache = null;
  async function planFilesForExport() {
    const ids = ['plan-promo-tv', 'plan-promo-pem', 'plan-promo-star', 'plan-promo'];
    const metas = {};
    for (const id of ids) metas[id] = await fetchSharedMeta(id);
    const token = ids.map(id => (metas[id] && metas[id].file_path ? metas[id].updated_at : '-')).join('|');
    if (planCache && planCache.token === token) return planCache;
    const plans = { tv: [], pem: [], star: [], auto: [] }, labels = [];
    const hasNew = ['plan-promo-tv', 'plan-promo-pem'].some(id => metas[id] && metas[id].file_path);
    const pick = async (id, slot, label) => {
      const m = metas[id];
      if (!m || !m.file_path) return;
      await ensureSharedLoaded(id, m);
      const files = sharedFiles[id] || [];
      if (!files.length) return;
      for (const f of files) plans[slot].push({ data: await f.arrayBuffer(), name: f.name });
      labels.push(label);
    };
    await pick('plan-promo-tv', 'tv', 'Plan Promo TV');
    await pick('plan-promo-pem', 'pem', 'Plan Promo PEM');
    await pick('plan-promo-star', 'star', 'Produits Star');
    // transition : l'ancien plan unique ne sert que si aucun des deux nouveaux
    // n'est publié (le moteur reconnaît alors lui-même le type de chaque PDF)
    if (!hasNew) await pick('plan-promo', 'auto', 'Plan promo (format unique)');
    planCache = { plans, labels, token, count: plans.tv.length + plans.pem.length + plans.star.length + plans.auto.length };
    return planCache;
  }

  // Le PDF de TOUTES les affiches d'un magasin
  async function buildAffichesPdf(store, plans, opts, onStep) {
    const win = (await getExportFrame()).contentWindow;
    if (!win || typeof win.gefecBuildAffiches !== 'function')
      throw new Error("générateur d'affiches indisponible");
    const { data, error } = await sb.storage.from('valorisations').download(valoPath(store.id));
    if (error || !data) throw new Error('aucune valorisation déposée pour ce magasin');
    return await win.gefecBuildAffiches({
      valo: await data.arrayBuffer(), valoName: `valorisation-${store.id}.pdf`,
      plans: plans.plans, plansToken: plans.token,
      masks: customMasksData || [],
      tpl: opts.tpl, fmt: opts.fmt, printBg: opts.printBg,
      onProgress: onStep,
    });
  }

  // Dépôt + lien signé. Un seul fichier par magasin, remplacé à chaque envoi :
  // les liens déjà partis restent valides et servent la dernière version.
  async function publishAffiches(store, blob, days) {
    const path = affPath(store.id);
    const up = await sb.storage.from(AFF_BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
    if (up.error) throw new Error('dépôt du PDF : ' + up.error.message);
    const name = `affiches-${slugify(store.name || store.id)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const { data, error } = await sb.storage.from(AFF_BUCKET)
      .createSignedUrl(path, days * 86400, { download: name });
    if (error || !data || !data.signedUrl)
      throw new Error('lien de téléchargement : ' + ((error && error.message) || 'échec'));
    return { path, url: data.signedUrl, expires: new Date(Date.now() + days * 86400000) };
  }

  // Envoi par la fonction Edge.
  //   · fonction injoignable, ou aucune voie d'envoi configurée -> repli sur la
  //     messagerie de l'administrateur (err.fallback) : c'est le seul recours.
  //   · fournisseur qui refuse (clé invalide, domaine non vérifié, SMTP qui
  //     rejette) -> on affiche l'erreur telle quelle. Détourner la messagerie
  //     ne ferait que masquer une panne parfaitement réparable.
  async function mailAffiches(store, to, link, info) {
    const { data, error } = await sb.functions.invoke('send-affiches-mail', {
      body: {
        to, store_id: store.id, store_name: store.name || store.id, url: link.url,
        pages: info.pages, products: info.products, plans: info.plansLabel,
        expires: link.expires.toLocaleDateString('fr-FR'),
      },
    });
    if (error) {
      let m = error.message || 'Erreur';
      try { const ctx = await error.context?.json?.(); if (ctx && ctx.error) m = ctx.error; } catch (e) {}
      const err = new Error(m); err.fallback = true; throw err;
    }
    if (data && data.ok === false) {
      const err = new Error(data.error || 'envoi automatique non configuré');
      err.fallback = data.code === 'mail_not_configured';
      throw err;
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  // Repli : le message est préparé dans la messagerie de l'administrateur.
  function mailtoAffiches(store, to, link, info) {
    const lines = [
      'Bonjour,', '',
      `Les affiches prix de votre magasin (${store.name || store.id} — ${store.id}) sont prêtes :`,
      'elles croisent les plans promo de la centrale avec la valorisation que vous avez déposée.',
      '',
      `• ${info.products} affiche(s) — ${info.plansLabel}`,
      `• ${info.pages} page(s) à imprimer`,
      `• Lien valable jusqu'au ${link.expires.toLocaleDateString('fr-FR')}`,
      '', 'Télécharger le PDF :', link.url, '',
      '— Boîte à Outils GEFEC',
    ];
    const subject = `Vos affiches promo sont prêtes — ${store.name || store.id}`;
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

  async function logAffichesMail(store, to, link, info, via) {
    try {
      await sb.from('affiches_mails').insert({
        store_id: store.id, email: to, file_path: link.path,
        link_expires_at: link.expires.toISOString(),
        pages: info.pages, products: info.products, plans: info.plansLabel,
        sent_via: via, sent_by: CURRENT.userId,
      });
    } catch (e) { /* journal facultatif : l'envoi, lui, a bien eu lieu */ }
  }

  // l'adresse saisie par l'admin devient l'adresse principale (3 au maximum)
  async function saveStoreEmail(store, to) {
    to = String(to || '').trim().toLowerCase();
    const cur = store.emails || [];
    if (!to || cur[0] === to) return;
    const emails = [to, ...cur.filter(m => m !== to)].slice(0, 3);
    const { error } = await sb.from('stores').update({ emails }).eq('id', store.id);
    if (error) { toast('Adresse non mémorisée : ' + error.message, true); return; }
    store.emails = emails; store.email = to;
  }

  /* ---------- Modale d'envoi ---------- */
  function fillAffTpl() {
    const sel = el('affTpl'); if (!sel) return;
    const cur = sel.value || 'bonplan';
    const opts = [['bonplan', 'BON PLAN'], ['promo', 'PROMO DU MOMENT']];
    sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    sel.value = opts.some(o => o[0] === cur) ? cur : 'bonplan';
  }
  async function openAffiches(mode, stores) {
    affMode = mode; affTargets = (stores || []).slice(); affBusy = false;
    const one = affMode === 'one' ? affTargets[0] : null;
    el('affWho').innerHTML = one
      ? `Magasin <b>${esc(one.name || one.id)}</b> (${esc(one.id)}) — les affiches sont fabriquées à partir des plans promo publiés et de la valorisation déposée par ce magasin.`
      : `<b>${affTargets.length} magasin(s)</b> — un PDF par magasin, envoyé à l'adresse enregistrée pour son directeur.`;
    el('affToRow').style.display = one ? '' : 'none';
    el('affToHint').style.display = one ? '' : 'none';
    el('affTo').value = (one && one.email) || '';
    el('affMsg').className = 'gmsg'; el('affMsg').textContent = '';
    el('affLog').hidden = true; el('affLog').innerHTML = '';
    el('affBarWrap').hidden = true; el('affBar').style.width = '0';
    el('affLink').hidden = !one;          // un lien à copier : un magasin à la fois
    fillAffTpl();
    el('affModal').classList.add('show');
    const st = el('affPlans');
    st.className = 'gmsg'; st.textContent = 'Vérification des plans promo publiés…';
    try {
      const plans = await planFilesForExport();
      if (!plans.count) {
        st.className = 'gmsg err';
        st.textContent = "Aucun plan promo publié : déposez d'abord les plans TV, PEM et/ou Star dans ⚙️ Réglages.";
      } else {
        st.className = 'gmsg ok';
        st.textContent = `Plans pris en compte : ${plans.labels.join(' + ')} — ${plans.count} fichier(s).`;
      }
    } catch (e) { st.className = 'gmsg err'; st.textContent = 'Plans promo : ' + (e.message || e); }
  }

  const AFF_PHASE = {
    libs: 'préparation du générateur…', valo: 'lecture de la valorisation…',
    plans: 'lecture des plans promo…', match: 'croisement plan × valorisation…',
  };
  async function runAffiches(send) {
    if (affBusy) return;
    const msg = el('affMsg'), log = el('affLog'), bar = el('affBar');
    const opts = {
      tpl: el('affTpl').value, fmt: el('affFmt').value,
      printBg: el('affBg').value === '1', days: parseInt(el('affDays').value, 10) || 60,
    };
    // destinataires
    const jobs = [];
    if (affMode === 'one') {
      const store = affTargets[0];
      if (!store) return;
      const to = (el('affTo').value || '').trim();
      if (send && !isMail(to)) { msg.className = 'gmsg err'; msg.textContent = "Indiquez l'adresse e-mail du directeur du magasin."; return; }
      jobs.push({ store, to });
    } else {
      for (const store of affTargets) if (isMail(store.email)) jobs.push({ store, to: store.email }); // adresse principale
      if (!jobs.length) { msg.className = 'gmsg err'; msg.textContent = "Aucun magasin prêt : il faut une valorisation déposée et l'adresse de son directeur."; return; }
      if (send && !confirm(`Envoyer les affiches à ${jobs.length} magasin(s) ?\nChaque directeur recevra le PDF de SON magasin.`)) return;
    }

    affBusy = true;
    const btnS = el('affSend'), btnL = el('affLink');
    btnS.disabled = btnL.disabled = true;
    const oldS = btnS.textContent; btnS.textContent = 'En cours…';
    msg.className = 'gmsg'; msg.textContent = '';
    log.hidden = false;
    log.innerHTML = jobs.map(j => `<div class="affrow" id="aff-st-${esc(j.store.id)}">
        <div class="gr-main"><b>${esc(j.store.name || j.store.id)}</b>
          <div class="gr-sub">${esc(j.to || 'lien seulement')}</div></div>
        <span class="st wait">en attente</span></div>`).join('');
    const setSt = (id, cls, txt) => {
      const row = el('aff-st-' + id); if (!row) return;
      const sp = row.querySelector('.st'); sp.className = 'st ' + cls; sp.textContent = txt;
    };
    el('affBarWrap').hidden = false;

    let done = 0, failed = 0, manual = 0, stop = '', lastError = '';
    try {
      const plans = await planFilesForExport();
      if (!plans.count) throw new Error("aucun plan promo publié : déposez les plans TV, PEM et/ou Star dans ⚙️ Réglages");
      const plansLabel = plans.labels.join(' + ');

      for (const job of jobs) {
        const { store, to } = job;
        try {
          setSt(store.id, 'run', 'génération…');
          bar.style.width = '0';
          const res = await buildAffichesPdf(store, plans, opts, (phase, i, n) => {
            if (phase === 'pdf') {
              setSt(store.id, 'run', n ? `affiche ${i}/${n}` : 'mise en page…');
              bar.style.width = n ? Math.round(i / n * 100) + '%' : '0';
            } else setSt(store.id, 'run', AFF_PHASE[phase] || 'en cours…');
          });
          const info = { pages: res.pages, products: res.products, plansLabel: (res.plans || []).map(p => p.label).join(' + ') || plansLabel };
          setSt(store.id, 'run', 'dépôt du PDF…');
          const link = await publishAffiches(store, res.blob, opts.days);
          if (to) await saveStoreEmail(store, to);

          if (!send) {
            try { await navigator.clipboard.writeText(link.url); } catch (e) {}
            setSt(store.id, 'ok', `${info.products} affiche(s) — lien copié`);
            msg.className = 'gmsg ok';
            msg.textContent = `Lien de téléchargement copié dans le presse-papiers — valable ${opts.days} jours.`;
            done++;
            continue;
          }
          setSt(store.id, 'run', 'envoi du mail…');
          try {
            await mailAffiches(store, to, link, info);
            setSt(store.id, 'ok', `${info.products} affiche(s) envoyée(s)`);
            await logAffichesMail(store, to, link, info, 'auto');
            done++;
          } catch (e) {
            if (!e.fallback) throw e;
            // pas d'envoi automatique : on passe la main à la messagerie de l'admin
            if (affMode === 'all') {
              setSt(store.id, 'ko', 'envoi automatique indisponible');
              stop = e.message || 'envoi automatique indisponible';
              break;
            }
            mailtoAffiches(store, to, link, info);
            try { await navigator.clipboard.writeText(link.url); } catch (x) {}
            setSt(store.id, 'ok', `${info.products} affiche(s) — message préparé`);
            await logAffichesMail(store, to, link, info, 'manuel');
            manual++;
          }
        } catch (e) {
          lastError = (e && e.message) || String(e);
          setSt(store.id, 'ko', 'échec');
          // le motif complet sous le nom du magasin : « .st » reste court
          const row = el('aff-st-' + store.id);
          const sub = row && row.querySelector('.gr-sub');
          if (sub) sub.textContent = lastError;
          failed++;
        }
      }
    } catch (e) {
      msg.className = 'gmsg err'; msg.textContent = 'Échec : ' + ((e && e.message) || e);
    } finally {
      affBusy = false;
      btnS.disabled = btnL.disabled = false; btnS.textContent = oldS;
      el('affBarWrap').hidden = true;
    }

    if (stop) {
      msg.className = 'gmsg err';
      msg.textContent = `Envoi groupé interrompu — ${stop}. Tant que la fonction « send-affiches-mail » n'est pas configurée (voir supabase/SETUP.md), envoyez magasin par magasin : le message est alors préparé dans votre messagerie.`;
    } else if (failed && !done && !manual) {
      msg.className = 'gmsg err';
      msg.textContent = 'Échec : ' + lastError;
    } else if (manual) {
      msg.className = 'gmsg';
      msg.textContent = "Envoi automatique non configuré : le message vient de s'ouvrir dans votre messagerie, lien inclus (également copié dans le presse-papiers).";
    } else if (send && done) {
      msg.className = 'gmsg ok';
      msg.textContent = `${done} mail(s) envoyé(s)${failed ? ` · ${failed} échec(s)` : ''}.`;
      toast(`Affiches envoyées à ${done} magasin(s) ✓`);
    }
    if (done || manual) { try { await openStores(); } catch (e) {} }
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
