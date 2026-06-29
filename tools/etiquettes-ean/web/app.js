/* Étiquettes EAN — interface premium.
   Toute la mise en scène + le dialogue avec Python (pywebview.api). */

'use strict';

/* ----------------------------------------------------------------------------
   Pont Python : pywebview expose ses méthodes sur window.pywebview.api une fois
   l'événement "pywebviewready" déclenché. On enveloppe les appels pour rester
   robuste même hors application (aperçu navigateur).
---------------------------------------------------------------------------- */
let API = null;
const apiReady = new Promise(res => {
  if (window.pywebview && window.pywebview.api) { API = window.pywebview.api; return res(); }
  window.addEventListener('pywebviewready', () => { API = window.pywebview.api; res(); });
  // Repli aperçu navigateur : au bout d'1 s, on continue sans backend.
  setTimeout(res, 1000);
});
async function call(method, ...args){
  if (!API || !API[method]) { console.warn('API indispo:', method); return null; }
  try { return await API[method](...args); } catch(e){ console.error(e); return null; }
}

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ============================================================================
   1. FOND ANIMÉ — shader WebGL (aurore) + particules canvas
============================================================================ */
function initGL(){
  const cv = $('#bg-gl');
  const gl = cv.getContext('webgl');
  if (!gl){ cv.style.background = 'radial-gradient(circle at 30% 20%,#1a1030,#0a0b10)'; return; }
  const vs = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
  const fs = `
    precision highp float;
    uniform vec2 r; uniform float t;
    // bruit simple
    float h(vec2 x){ return fract(sin(dot(x,vec2(12.9898,78.233)))*43758.5453); }
    float n(vec2 x){ vec2 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
    float fbm(vec2 x){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*n(x); x*=2.; a*=.5; } return v; }
    void main(){
      vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;
      float f=fbm(uv*2.5+vec2(t*.05,t*.03));
      f=fbm(uv*3.0+f*1.5+vec2(0.,t*.04));
      vec3 c1=vec3(.92,.05,.20);   // rouge BUT
      vec3 c2=vec3(1.,.84,.04);    // or
      vec3 c3=vec3(.04,.05,.07);   // fond
      vec3 col=mix(c3,c1,smoothstep(.35,.75,f));
      col=mix(col,c2,smoothstep(.62,.95,f)*.6);
      float vig=smoothstep(1.25,.2,length(uv));
      gl_FragColor=vec4(col*vig*.9,1.);
    }`;
  function sh(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return s; }
  const prog=gl.createProgram();
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,vs));
  gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(prog); gl.useProgram(prog);
  const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(prog,'p'); gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const uR=gl.getUniformLocation(prog,'r'), uT=gl.getUniformLocation(prog,'t');
  function resize(){ cv.width=innerWidth; cv.height=innerHeight; gl.viewport(0,0,cv.width,cv.height); }
  addEventListener('resize',resize); resize();
  const start=performance.now();
  (function loop(){ gl.uniform2f(uR,cv.width,cv.height);
    gl.uniform1f(uT,(performance.now()-start)/1000);
    gl.drawArrays(gl.TRIANGLES,0,3); requestAnimationFrame(loop); })();
}

function initParticles(){
  const cv=$('#bg-particles'), ctx=cv.getContext('2d');
  let pts=[];
  function resize(){ cv.width=innerWidth; cv.height=innerHeight;
    pts=Array.from({length:Math.min(90,Math.floor(innerWidth/16))},()=>({
      x:Math.random()*cv.width, y:Math.random()*cv.height,
      vx:(Math.random()-.5)*.25, vy:(Math.random()-.5)*.25,
      r:Math.random()*1.8+.4, a:Math.random()*.5+.2 })); }
  addEventListener('resize',resize); resize();
  (function loop(){ ctx.clearRect(0,0,cv.width,cv.height);
    for(const p of pts){ p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=cv.width; if(p.x>cv.width)p.x=0;
      if(p.y<0)p.y=cv.height; if(p.y>cv.height)p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7);
      ctx.fillStyle='rgba(255,255,255,'+p.a+')'; ctx.fill(); }
    requestAnimationFrame(loop); })();
}

/* ============================================================================
   2. NAVIGATION ENTRE ÉTAPES
============================================================================ */
const state = { step:0, codes:[], mode:'enter', captured:false };
function goStep(n){
  state.step=Math.max(0,Math.min(3,n));
  $('#track').style.transform=`translateX(-${state.step*25}%)`;
  $$('.step').forEach(s=>s.classList.toggle('is-active',+s.dataset.step===state.step));
  $$('.steps-dots .dot').forEach(d=>{
    const i=+d.dataset.dot;
    d.classList.toggle('active',i===state.step);
    d.classList.toggle('done',i<state.step);
  });
}
$('#go-start').addEventListener('click',()=>goStep(1));
$$('[data-back]').forEach(b=>b.addEventListener('click',()=>goStep(state.step-1)));
$('#to-settings').addEventListener('click',()=>goStep(2));
$('#to-run').addEventListener('click',()=>goStep(3));

/* ============================================================================
   3. ÉTAPE 1 — chargement + extraction
============================================================================ */
let loadedFiles=[];
$('#drop').addEventListener('click',pickFiles);
async function pickFiles(){
  const res=await call('choose_pdfs');
  if(!res || !res.files || !res.files.length) return;
  loadedFiles=res.files;
  renderFiles();
  await runExtract();
}
function renderFiles(){
  $('#files').innerHTML=loadedFiles.map(f=>{
    const name=f.split(/[\\/]/).pop();
    return `<div class="file-chip"><span class="fx">✓</span><span>${name}</span></div>`;
  }).join('');
}
async function runExtract(){
  if(!loadedFiles.length) return;
  const res=await call('extract',loadedFiles,$('#opt-checksum').checked,$('#opt-dedupe').checked);
  if(!res){ toast('Lecture impossible (backend indisponible).',true); return; }
  state.codes=res.codes||[];
  $('#codes').value=state.codes.join('\n');
  showResult(res);
}
function showResult(res){
  $('#result').hidden=false;
  animateCounter($('#counter'),res.count);
  const st=[`<div class="stat"><b>${res.pages}</b> page(s)</div>`,
            `<div class="stat"><b>${res.count}</b> codes EAN-13</div>`];
  if(res.empty) st.push(`<div class="stat warn">⚠ ${res.empty} page(s) sans texte (scan ?)</div>`);
  if(res.errors && res.errors.length) st.push(`<div class="stat warn">⚠ ${res.errors.length} fichier(s) illisible(s)</div>`);
  $('#stats').innerHTML=st.join('');
  $('#to-settings').disabled = res.count===0;
  if(res.count) confettiBurst(.4);
}
function animateCounter(el,target){
  const dur=900, t0=performance.now();
  (function tick(now){ const k=Math.min(1,(now-t0)/dur);
    const e=1-Math.pow(1-k,3);
    el.textContent=Math.round(target*e).toLocaleString('fr-FR');
    if(k<1) requestAnimationFrame(tick); })(t0);
}
$('#opt-checksum').addEventListener('change',runExtract);
$('#opt-dedupe').addEventListener('change',runExtract);
$('#toggle-list').addEventListener('click',()=>{
  const ta=$('#codes'); ta.hidden=!ta.hidden;
});
$('#codes').addEventListener('input',async ()=>{
  const codes=$('#codes').value.split('\n').map(s=>s.replace(/\D/g,'')).filter(Boolean);
  state.codes=codes;
  await call('set_codes',codes);
  animateCounter($('#counter'),codes.length);
  $('#to-settings').disabled=codes.length===0;
});

/* ============================================================================
   4. ÉTAPE 2 — réglages
============================================================================ */
$$('.mode').forEach(m=>m.addEventListener('click',()=>{
  $$('.mode').forEach(x=>x.classList.remove('active'));
  m.classList.add('active');
  state.mode=m.dataset.mode;
  $('#capture').hidden = state.mode!=='button';
}));
$('#btn-capture').addEventListener('click',async ()=>{
  await overlayCountdown(5,'Place la souris SUR le bouton « Ajouter dans la liste » de NOSICA…');
  const r=await call('capture_button');
  if(r){ state.captured=true;
    $('#capture-state').textContent=`Enregistrée (x=${r.x}, y=${r.y})`;
    $('#capture-state').classList.add('ok');
    toast('Position du bouton enregistrée ✓');
  }
});
function bindSlider(id,labelId,fmt){
  const el=$('#'+id), lab=$('#'+labelId);
  const upd=()=>lab.textContent=fmt(el.value); el.addEventListener('input',upd); upd();
}
bindSlider('delay','v-delay',v=>v+' ms');
bindSlider('keyint','v-key',v=>v+' ms/car.');
bindSlider('countdown','v-cd',v=>v+' s');

/* ============================================================================
   5. ÉTAPE 3 — lancement
============================================================================ */
const RING_LEN=603;
function setRing(pct){
  $('#ring-fg').style.strokeDashoffset = RING_LEN*(1-pct/100);
  $('#ring-big').textContent=Math.round(pct)+'%';
}
$('#btn-start').addEventListener('click',startRun);
$('#btn-restart').addEventListener('click',()=>{ resetRun(); goStep(1); });

async function startRun(){
  if(!state.codes.length){ toast('Aucun code à saisir.',true); return; }
  if(state.mode==='button' && !state.captured){
    toast('Enregistre d’abord la position du bouton.',true); goStep(2); return;
  }
  const cd=+$('#countdown').value;
  await overlayCountdown(cd,'Clique dans la case « code » de NOSICA ! Saisie imminente…');
  const opts={ mode:state.mode,
    delay_ms:+$('#delay').value, key_int_ms:+$('#keyint').value,
    secure:$('#opt-secure').checked };
  const r=await call('start',opts);
  if(!r || !r.ok){ toast((r&&r.msg)||'Démarrage impossible.',true); return; }
  $('#btn-start').hidden=true; $('#btn-pause').hidden=false; $('#btn-stop').hidden=false;
  $('#run-back').hidden=true;
  $('#run-title').textContent='Saisie en cours…';
  pollLoop();
}
$('#btn-pause').addEventListener('click',async ()=>{
  const r=await call('pause');
  $('#btn-pause').textContent = (r&&r.paused)?'Reprendre':'Pause';
});
$('#btn-stop').addEventListener('click',()=>call('stop'));

async function pollLoop(){
  const p=await call('poll');
  if(p){
    const pct = p.total? (p.index/p.total*100):0;
    setRing(pct);
    $('#ring-small').textContent = `${p.index} / ${p.total}`;
    $('#run-current').textContent = p.current||'';
    if(!p.running && (p.done||p.aborted)){ finishRun(p); return; }
  }
  setTimeout(pollLoop,120);
}
function finishRun(p){
  $('#btn-pause').hidden=true; $('#btn-stop').hidden=true; $('#btn-restart').hidden=false;
  const ok=p.ok_count||0, skipped=p.skipped||0;
  if(p.aborted){
    $('#run-title').textContent='Saisie arrêtée';
    $('#ring-small').textContent=`${ok} ajouté(s) · arrêté`;
    toast('Saisie arrêtée.',true);
  }else if(skipped>0){
    setRing(100);
    $('#run-title').textContent='Terminé — avec des codes ignorés';
    $('#ring-small').textContent=`${ok} ajouté(s) · ${skipped} ignoré(s)`;
    $('#run-current').textContent='';
    showSkipReport(p);
    confettiBurst(.5);
  }else{
    setRing(100);
    $('#run-title').textContent='Terminé 🎉';
    $('#ring-small').textContent=`${ok} / ${p.total}`;
    $('#run-current').textContent='Tous les codes ont été ajoutés et vérifiés !';
    confettiBurst(1);
  }
}
function showSkipReport(p){
  const list=(p.skipped_list||[]);
  const box=document.createElement('div');
  box.className='skip-report';
  box.innerHTML=`<div class="skip-h">⚠ ${p.skipped} code(s) non confirmé(s) — donc <b>volontairement non saisis</b>
    pour ne rien envoyer de faux à NOSICA :</div>
    <textarea readonly class="skip-codes">${list.join('\n')}</textarea>
    <div class="skip-note">Causes possibles : NOSICA a ouvert un message d'erreur qui a pris le focus,
    ou le champ « code » a perdu le focus. Reprends ces codes manuellement, ou relance l'outil sur eux.</div>`;
  const host=$('#run-current').parentElement;
  const old=host.querySelector('.skip-report'); if(old) old.remove();
  host.insertBefore(box,$('.run-actions'));
}
function resetRun(){
  setRing(0); $('#ring-small').textContent='—'; $('#run-current').textContent='';
  $('#btn-start').hidden=false; $('#btn-pause').hidden=true; $('#btn-stop').hidden=true;
  $('#btn-restart').hidden=true; $('#run-back').hidden=false;
  $('#btn-pause').textContent='Pause';
  $('#run-title').textContent='Prêt à saisir dans NOSICA';
}

/* ============================================================================
   6. Overlay compte à rebours
============================================================================ */
function overlayCountdown(seconds,text){
  return new Promise(res=>{
    const ov=$('#overlay'), num=$('#overlay-num'), txt=$('#overlay-txt');
    txt.textContent=text; ov.hidden=false;
    let n=seconds;
    if(n<=0){ ov.hidden=true; return res(); }
    num.textContent=n;
    const it=setInterval(()=>{
      n--;
      if(n<=0){ clearInterval(it); ov.hidden=true; return res(); }
      num.textContent=n;
      num.style.animation='none'; void num.offsetWidth; num.style.animation='';
    },1000);
  });
}

/* ============================================================================
   7. Confettis
============================================================================ */
function confettiBurst(intensity){
  const cv=$('#confetti'), ctx=cv.getContext('2d');
  cv.width=innerWidth; cv.height=innerHeight;
  const colors=['#ff2d55','#ffd60a','#ffffff','#22c55e','#e6071a'];
  const N=Math.floor(140*intensity);
  const parts=Array.from({length:N},()=>({
    x:cv.width/2+(Math.random()-.5)*200, y:cv.height/2,
    vx:(Math.random()-.5)*14, vy:Math.random()*-15-4,
    r:Math.random()*7+3, c:colors[Math.floor(Math.random()*colors.length)],
    rot:Math.random()*7, vr:(Math.random()-.5)*.4, life:0 }));
  let frame=0;
  (function loop(){ ctx.clearRect(0,0,cv.width,cv.height); frame++;
    let alive=false;
    for(const p of parts){ p.life++; p.vy+=.35; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
      if(p.y<cv.height+20) alive=true;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.fillStyle=p.c; ctx.globalAlpha=Math.max(0,1-p.life/120);
      ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*.6); ctx.restore(); }
    if(alive && frame<160) requestAnimationFrame(loop);
    else ctx.clearRect(0,0,cv.width,cv.height);
  })();
}

/* ============================================================================
   8. Toast
============================================================================ */
let toastT=null;
function toast(msg,err){
  const t=$('#toast'); t.textContent=msg; t.classList.toggle('err',!!err);
  t.hidden=false; requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(toastT); toastT=setTimeout(()=>{ t.classList.remove('show');
    setTimeout(()=>t.hidden=true,400); },3200);
}

/* ============================================================================
   Démarrage
============================================================================ */
initGL(); initParticles(); goStep(0);
apiReady.then(()=>{ /* backend prêt */ });
