/* GEFEC — thème clair / sombre, commun à la coque et aux outils.
   Chargé dans le <head> de chaque page, AVANT l'affichage : le thème est posé
   sur <html data-theme> tout de suite, sans clignotement. Le choix est
   mémorisé dans le navigateur et suivi en direct par tous les cadres
   d'outils (même origine : évènement « storage » + rappel direct de la coque). */
(function () {
  'use strict';
  var KEY = 'GEFEC_THEME';
  var root = document.documentElement;
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function current() {
    var t = stored();
    if (t === 'dark' || t === 'light') return t;
    // dans un cadre : on suit la coque ; sinon thème clair par défaut
    try { if (window.parent !== window && parent.document.documentElement.dataset.theme) return parent.document.documentElement.dataset.theme; } catch (e) {}
    return 'light';
  }
  function apply(t) { root.dataset.theme = t === 'dark' ? 'dark' : 'light'; }
  apply(current());

  function set(t) {
    try { localStorage.setItem(KEY, t); } catch (e) {}
    apply(t);
    // les cadres d'outils (srcdoc compris) suivent immédiatement
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try { frames[i].contentDocument.documentElement.dataset.theme = root.dataset.theme; } catch (e) {}
    }
    try { window.dispatchEvent(new CustomEvent('gefec:theme', { detail: root.dataset.theme })); } catch (e) {}
  }
  window.addEventListener('storage', function (e) { if (!e.key || e.key === KEY) apply(current()); });

  var ICON = '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
    + '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  // dans un cadre de la coque, c'est la coque qui porte le bouton de thème
  var inFrame = false;
  try { inFrame = window.parent !== window && !!parent.document.querySelector('[data-theme-slot]'); } catch (e) {}
  function mountToggle() {
    if (inFrame) return;
    var slots = document.querySelectorAll('[data-theme-slot]');
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].firstChild) continue;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'g-theme';
      b.title = 'Thème clair / sombre'; b.setAttribute('aria-label', 'Basculer le thème clair ou sombre');
      b.innerHTML = ICON;
      b.addEventListener('click', function () { set(root.dataset.theme === 'dark' ? 'light' : 'dark'); });
      slots[i].appendChild(b);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountToggle);
  else mountToggle();

  window.GefecUI = { theme: function () { return root.dataset.theme; }, setTheme: set, mountToggle: mountToggle };
})();
