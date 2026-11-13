// Langue de l'interface : français (par défaut) ou anglais. Traduction au vol du texte affiché (DOM) à partir du dictionnaire I18N_EN.
// Le texte des notes du roadbook (cases .k3) n'est PAS traduit ici : sa langue sera un réglage séparé (étape 2).
const I18N = (() => {
  const KEY = 'rbLang', SKIP = 'script,style,textarea,[data-i18n-skip],.k3', SKIPEL = 'script,style,[data-i18n-skip],.k3';
  let lang = 'fr';
  try { lang = localStorage.getItem(KEY) || ((navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'fr'); } catch (e) { }
  if (lang !== 'en') lang = 'fr';
  const norm = s => s.replace(/\s+/g, ' ').replace(/[’‘]/g, "'").trim();
  const EX = new Map(), PART = [];
  for (const [k, v] of Object.entries(I18N_EN)) {
    const nk = norm(k); EX.set(nk, v);
    if (/ /.test(nk) && nk.length >= 6) PART.push([nk, v]);
  }
  PART.sort((a, b) => b[0].length - a[0].length);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const PMAP = new Map(PART), RX = new RegExp(PART.map(p => esc(p[0])).join('|'), 'g');
  const cache = new Map();
  function trStr(raw) {
    if (lang !== 'en' || !raw) return raw;
    const t0 = norm(raw); if (!t0) return raw;
    let r = cache.get(t0);
    if (r === undefined) {
      r = EX.get(t0);
      if (r === undefined) { r = t0.replace(RX, m => PMAP.get(m)); if (r === t0) r = null; }
      if (cache.size > 6000) cache.clear();
      cache.set(t0, r);
    }
    if (r === null) return raw;
    const lead = /^\s*/.exec(raw)[0], trail = /\s*$/.exec(raw)[0];
    return lead + r + trail;
  }
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'label'];
  const tNodes = new Map(), aEls = new Map();     // nœud → {o: original, t: traduit}
  let busy = false;
  function doText(n) {
    if (!n.parentElement || n.parentElement.closest(SKIP)) return;
    const rec = tNodes.get(n);
    if (rec && rec.t === n.data) return;
    const o = n.data, t = trStr(o);
    if (t !== o) { n.data = t; tNodes.set(n, { o, t }); } else if (rec) tNodes.delete(n);
  }
  function doAttrs(el) {
    if (!el.getAttribute || el.closest('[data-i18n-skip],.k3')) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      let m = aEls.get(el); const cur = el.getAttribute(a);
      if (m && m[a] && m[a].t === cur) continue;
      const t = trStr(cur);
      if (t !== cur) { el.setAttribute(a, t); if (!m) aEls.set(el, m = {}); m[a] = { o: cur, t }; } else if (m && m[a]) delete m[a];
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    if (root.closest && root.closest(SKIPEL)) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.nodeType === 1 && n.matches(SKIPEL) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  let pending = new Set(), raf = 0;
  const obs = new MutationObserver(recs => {
    if (busy || lang !== 'en') return;
    for (const r of recs) {
      if (r.type === 'childList') r.addedNodes.forEach(n => pending.add(n));
      else if (r.type === 'characterData') pending.add(r.target);
      else if (r.type === 'attributes') pending.add(r.target);
    }
    if (!raf) raf = requestAnimationFrame(flush);
  });
  function flush() {
    raf = 0; busy = true;
    try { for (const n of pending) if (n.isConnected) walk(n); } finally { pending = new Set(); obs.takeRecords(); busy = false; }
  }
  function applyAll() {
    busy = true;
    try {
      if (lang === 'en') { walk(document.body); document.title = trStr(document.title); }
      else {
        for (const [n, r] of tNodes) if (n.data === r.t) n.data = r.o;
        for (const [el, m] of aEls) for (const a in m) if (el.getAttribute(a) === m[a].t) el.setAttribute(a, m[a].o);
        tNodes.clear(); aEls.clear();
        if (document.documentElement.dataset.titleFr) document.title = document.documentElement.dataset.titleFr;
      }
      document.documentElement.lang = lang;
    } finally { obs.takeRecords(); busy = false; }
  }
  function set(l) {
    l = l === 'en' ? 'en' : 'fr'; if (l === lang) return;
    // retour au français : on restaure d'abord, puis on change
    lang = l; try { localStorage.setItem(KEY, l); } catch (e) { }
    if (l === 'fr') { lang = 'fr'; applyAll(); } else applyAll();
    const nm = document.getElementById('langName'); if (nm) nm.textContent = l === 'en' ? 'English' : 'Français';
    if (typeof renderAll === 'function' && typeof S !== 'undefined' && S.notes && S.notes.length) { try { renderRoadbook(); } catch (e) { } }
    if (typeof toast === 'function') toast(l === 'en' ? 'Interface language: English.' : 'Langue de l’interface : français.', 'ok');
  }
  // fenêtres natives
  for (const f of ['alert', 'confirm', 'prompt']) { const o = window[f].bind(window); window[f] = (m, ...r) => o(trStr(String(m)), ...r); }
  function init() {
    document.documentElement.dataset.titleFr = document.title;
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const nm = document.getElementById('langName'); if (nm) nm.textContent = lang === 'en' ? 'English' : 'Français';
    const b = document.querySelector('#moreMenu [data-act="lang"]');
    if (b) b.addEventListener('click', () => set(lang === 'en' ? 'fr' : 'en'));
    if (lang === 'en') applyAll(); else document.documentElement.lang = 'fr';
  }
  // utilitaire de test : textes encore en français dans la page
  function missing() {
    const out = new Set(), fr = /[àâçéèêëîïôûùüœ]|\b(le|la|les|une|des|pas|sur|pour|avec|sans|dans|ton|tes|ici|plus|trop|déjà|clique|choisis|ajouter|supprimer)\b/i;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) { const p = n.parentElement; if (!p || p.closest(SKIP)) continue; const s = norm(n.data); if (s && fr.test(s)) out.add(s); }
    document.querySelectorAll('[title],[placeholder],[aria-label]').forEach(e => ATTRS.forEach(a => { const s = e.getAttribute(a); if (s && fr.test(s) && !e.closest('.k3')) out.add('@' + a + ': ' + norm(s)); }));
    return [...out];
  }
  return { get lang() { return lang; }, set, tr: trStr, init, missing };
})();
