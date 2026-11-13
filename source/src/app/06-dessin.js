/* ============================================================
   6. Mode dessin & itinéraire
   ============================================================ */
let drawing = false;
const routeCache = new Map();
let routeGen = 0, routing = 0;
const segKey = (a, b, mode) => (mode || 'line') + '|' + a[0].toFixed(6) + ',' + a[1].toFixed(6) + '|' + b[0].toFixed(6) + ',' + b[1].toFixed(6);

/* une trace GPX devient modifiable : on la résume par quelques points de contrôle (tolérance 3 m, 500 points au plus) reliés en ligne droite */
function simplifyLL(ll, tol, maxN) {      // indices gardés (Douglas-Peucker), tolérance en mètres, tolérance relevée jusqu'à maxN points au plus
  const k0 = Math.cos(ll[0][0] * Math.PI / 180) * 111320, xy = ll.map(p => [(p[1] - ll[0][1]) * k0, (p[0] - ll[0][0]) * 110540]);
  let idx = simplifyDP(xy, tol);
  while (maxN && idx.length > maxN) { tol *= 1.5; idx = simplifyDP(xy, tol); }
  return idx;
}
const llToCtrl = (ll, tol, maxN, mode) => {
  const idx = simplifyLL(ll, tol, maxN), c = idx.map((k, j) => [ll[k][0], ll[k][1], j ? (mode || 'line') : null]);
  // mode 'trace' : chaque tronçon garde exactement les points d'origine de la trace (pas de corde entre deux points de contrôle) ; si on déplace un point, ses voisins suivent le mode « Tracé » choisi
  if (mode === 'trace') for (let j = 1; j < idx.length; j++) routeCache.set(segKey(c[j - 1], c[j], 'trace'), ll.slice(idx[j - 1], idx[j] + 1));
  return c;
};
function ctrlFromTrack() {
  const ll = S.ll;
  S.ctrl = llToCtrl(ll, 3, 500, 'trace');
  S.segs = []; for (let i = 1; i < S.ctrl.length; i++) S.segs[i - 1] = routeCache.get(segKey(S.ctrl[i - 1], S.ctrl[i], 'trace'));
  S.src = 'draw'; S.mm = null; rebuildFromSegs();
}
function setDrawing(on) {
  if (on && measOn) closeMeasure();
  drawing = on;
  $('#bDraw').classList.toggle('on', on);
  $('#drawBox').classList.toggle('show', on);
  map.getContainer().classList.toggle('drawing', on);
  $('#routeMode').value = S.routeMode; updSnapBtn();
  clearSel(); if (on) resetHist(); else { tool = null; $('#bSel').classList.remove('on'); spaceDown = false; $('#bFree').classList.remove('on'); $('#bErase').classList.remove('on'); $('#bCut').classList.remove('on'); }
  setCursorCls(); renderCtrl(); renderInfo();
}
/* ---- historique annuler / rétablir (points de contrôle) ---- */
const hist = { undo: [], redo: [] };
const snap = () => JSON.stringify(S.ctrl);
function updHist() { const u = $('#bUndo'), r = $('#bRedo'); if (u) u.disabled = !hist.undo.length; if (r) r.disabled = !hist.redo.length; }
function pushHist(s) { hist.undo.push(s || snap()); if (hist.undo.length > 300) hist.undo.shift(); hist.redo.length = 0; updHist(); }
function resetHist() { hist.undo.length = 0; hist.redo.length = 0; updHist(); }
function undo() { if (!hist.undo.length) return; hist.redo.push(snap()); S.ctrl = JSON.parse(hist.undo.pop()); S.src = 'draw'; renderCtrl(); reroute(); updHist(); }
function redo() { if (!hist.redo.length) return; hist.undo.push(snap()); S.ctrl = JSON.parse(hist.redo.pop()); S.src = 'draw'; renderCtrl(); reroute(); updHist(); }

function renderCtrl() {
  ctrlLayer.clearLayers();
  if (!drawing) return;
  const ls = lockedSet();
  if (selR && selR.b >= S.ctrl.length) clearSel();
  if (selR && selR.b > selR.a) {      // la section choisie est surlignée
    const pts = []; for (let k = selR.a; k < selR.b; k++) { const sg = S.segs[k] || [S.ctrl[k].slice(0, 2), S.ctrl[k + 1].slice(0, 2)]; sg.forEach(p => pts.push([p[0], p[1]])); }
    L.polyline(pts, { color: '#ff8c00', weight: 9, opacity: 0.55, interactive: false }).addTo(ctrlLayer);
  }
  const si = $('#selInfo'), bs = $('#bSnap');
  if (si) {
    si.style.display = drawing && tool === 'sel' ? '' : 'none';
    si.textContent = !selR ? 'Touche un point pour le choisir. Touche ensuite le dernier point d’une section pour la choisir en entier.'
      : selPend ? 'Point n° ' + (selR.a + 1) + ' choisi. Touche le dernier point de la section, ou colle ce point avec le bouton « Coller ce point à la route » pour ce seul point.'
      : selR.a === selR.b ? 'Point n° ' + (selR.a + 1) + ' sélectionné : le bouton ci-dessous ne traitera que lui (et ses abords).'
      : 'Section du point ' + (selR.a + 1) + ' au point ' + (selR.b + 1) + ' (' + (selR.b - selR.a + 1) + ' points) : le bouton ci-dessous ne traitera qu’elle.';
  }
  if (bs) { bs.textContent = selR ? (selR.a === selR.b ? '🛣 Coller ce point à la route' : '🛣 Coller cette section à la route') : '🛣 Coller à la route : choisis d’abord un départ et une arrivée'; bs.disabled = !selR; }
  S.ctrl.forEach((c, i) => {
    const lk = !!(ls && ls.has(i));
    const inSel = !!selR && i >= selR.a && i <= selR.b;
    const m = L.marker([c[0], c[1]], { draggable: !lk, keyboard: false, icon: L.divIcon({ className: 'cpt' + (i === 0 ? ' first' : '') + (lk ? ' locked' : '') + (inSel ? ' sel' : ''), iconSize: [16, 16] }) });
    let pre = null;
    m.on('dragstart', () => { pre = snap(); });
    m.on('dragend', () => { const p = m.getLatLng(); pushHist(pre); S.ctrl[i] = [p.lat, p.lng, i > 0 && !snapIsOn() ? 'line' : S.ctrl[i][2]]; reroute(); });
    m.on('click', () => { if (tool === 'sel') { selClick(i); return; } if (lk) { toast('Étape verrouillée 🔒', 'err'); return; } pushHist(); S.ctrl.splice(i, 1); if (i === 0 && S.ctrl.length) S.ctrl[0][2] = null; renderCtrl(); reroute(); });
    m.addTo(ctrlLayer);
  });
  updHist();
}
/* « 🧲 Route » : activé, les points posés suivent les chemins (menu « Tracé ») ; désactivé, ils sont reliés en ligne droite (hors-piste). Réglage changeable à tout moment, chaque tronçon garde celui de sa pose. */
const snapIsOn = () => S.snapOn !== false && S.routeMode !== 'line';
const curMode = () => snapIsOn() ? S.routeMode : 'line';
function updSnapBtn() {
  const b = $('#bSnapMode'); if (!b) return; const on = snapIsOn();
  b.textContent = on ? '🧲 Route : activée' : '🧲 Route : désactivée'; b.classList.toggle('on', on);
  b.title = on ? 'Les points suivants suivent les chemins. Cliquer (ou touche R) pour les relier en ligne droite (hors-piste).' : 'Les points suivants sont reliés en ligne droite. Cliquer (ou touche R) pour qu’ils suivent de nouveau les chemins.';
}
function toggleSnap() {
  if (snapIsOn()) S.snapOn = false;
  else { S.snapOn = true; if (S.routeMode === 'line') { S.routeMode = S.prevRoute && S.prevRoute !== 'line' ? S.prevRoute : 'trekking'; $('#routeMode').value = S.routeMode; } }
  updSnapBtn(); save(); toast(snapIsOn() ? 'Route activée : les points suivent les chemins.' : 'Route désactivée : lignes droites.', 'ok');
}
function addCtrl(p) {
  pushHist();
  S.ctrl.push([+p[0].toFixed(6), +p[1].toFixed(6), S.ctrl.length ? curMode() : null]);
  S.src = 'draw';
  renderCtrl(); reroute();
}

/* ---- aperçu immédiat pendant un geste (les tronçons touchés sont en ligne droite, les autres gardent leur itinéraire) ---- */
function liveRebuild(dirty) {
  S.segs = [];
  for (let i = 1; i < S.ctrl.length; i++) {
    const a = S.ctrl[i - 1], b = S.ctrl[i], k = segKey(a, b, b[2]);
    S.segs[i - 1] = !dirty.has(i) && !dirty.has(i - 1) && routeCache.has(k) ? routeCache.get(k) : [a.slice(0, 2), b.slice(0, 2)];
  }
  rebuildFromSegs();
}
/* ---- outils : main levée, gomme, ajout d'un point en tirant sur la trace ---- */
let tool = null, spaceDown = false, stroke = null, pendingIns = null, justDragged = false;
const freeOn = () => drawing && (tool === 'free' || spaceDown);
/* ---- sélection d'un point ou d'une section (outil 👆) : 1er clic = un point, 2e clic = dernier point de la section ---- */
let selR = null, selPend = false;
function clearSel() { selR = null; selPend = false; }
function selClick(i) {
  if (!selR || !selPend) { selR = { a: i, b: i }; selPend = true; }
  else { selR = { a: Math.min(selR.a, i), b: Math.max(selR.a, i) }; selPend = false; }
  renderCtrl();
}
function setTool(t) {
  tool = tool === t ? null : t;
  $('#bSel').classList.toggle('on', tool === 'sel'); if (tool !== 'sel') { clearSel(); renderCtrl(); }
  $('#bFree').classList.toggle('on', tool === 'free'); $('#bErase').classList.toggle('on', tool === 'erase'); $('#bCut').classList.toggle('on', tool === 'cut'); setCursorCls();
}
function setCursorCls() { const c = map.getContainer(); c.classList.toggle('freedraw', freeOn()); c.classList.toggle('erasing', drawing && tool === 'erase'); c.classList.toggle('cutting', drawing && tool === 'cut'); }
const lenPx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function strokeStart(cp, ll) {
  if (!drawing || stroke) return false;
  if (freeOn()) {
    pushHist(); map.dragging.disable();
    stroke = { kind: 'free', last: cp, from: S.ctrl.length };
    S.ctrl.push([+ll.lat.toFixed(6), +ll.lng.toFixed(6), S.ctrl.length ? 'line' : null]); S.src = 'draw';
    liveRebuild(new Set([S.ctrl.length - 1])); return true;
  }
  if (tool === 'erase') { pushHist(); map.dragging.disable(); stroke = { kind: 'erase', dirty: false }; eraseAt(cp); return true; }
  return false;
}
function strokeMove(cp, ll) {
  if (pendingIns && !stroke && lenPx(cp, pendingIns.p0) > 4) {      // ajout d'un point en tirant sur la trace
    pushHist(); S.ctrl.splice(pendingIns.i, 0, [ll.lat, ll.lng, S.ctrl[pendingIns.i][2]]);
    stroke = { kind: 'ins', i: pendingIns.i }; pendingIns = null; ctrlLayer.clearLayers();
  }
  if (!stroke) return;
  if (stroke.kind === 'free') {
    if (lenPx(cp, stroke.last) < 7) return;
    stroke.last = cp; S.ctrl.push([+ll.lat.toFixed(6), +ll.lng.toFixed(6), 'line']); liveRebuild(new Set([S.ctrl.length - 1]));
  } else if (stroke.kind === 'erase') eraseAt(cp);
  else if (stroke.kind === 'ins') { S.ctrl[stroke.i] = [ll.lat, ll.lng, S.ctrl[stroke.i][2]]; liveRebuild(new Set([stroke.i, stroke.i + 1])); }
}
function strokeEnd() {
  pendingIns = null;
  if (!stroke) return;
  const s = stroke; stroke = null; map.dragging.enable(); justDragged = true; setTimeout(() => { justDragged = false; }, 80);
  if (s.kind === 'free' && S.ctrl.length - s.from > 2) {      // allège le trait : on retire les points qui ne changent pas la forme (tolérance 2 m)
    const seg = S.ctrl.slice(Math.max(0, s.from - 1)), k0 = Math.cos(seg[0][0] * Math.PI / 180) * 111320;
    const keep = simplifyDP(seg.map(p => [(p[1] - seg[0][1]) * k0, (p[0] - seg[0][0]) * 110540]), 2);
    S.ctrl = S.ctrl.slice(0, Math.max(0, s.from - 1)).concat(keep.map(i => seg[i]));
  }
  if (s.kind === 'erase' && S.ctrl.length && S.ctrl[0][2]) S.ctrl[0][2] = null;
  renderCtrl(); reroute();
}
function eraseAt(cp) {
  let changed = false; const ls = lockedSet();
  for (let i = S.ctrl.length - 1; i >= 0; i--) if (!(ls && ls.has(i)) && lenPx(map.latLngToContainerPoint(S.ctrl[i]), cp) <= 14) { S.ctrl.splice(i, 1); changed = true; }
  if (!changed) for (let i = 1; i < S.ctrl.length && !changed; i++) {      // survol d'un tronçon : on retire son point d'arrivée
    const sg = S.segs[i - 1]; if (!sg || sg.length < 2 || (ls && ls.has(i))) continue;
    for (let k = 1; k < sg.length; k++) {
      const p = map.latLngToContainerPoint(sg[k - 1]), q = map.latLngToContainerPoint(sg[k]);
      if (segProj([cp.x, cp.y], [p.x, p.y], [q.x, q.y]).d <= 9) { S.ctrl.splice(i, 1); changed = true; break; }
    }
  }
  if (changed) { stroke.dirty = true; liveRebuild(new Set()); }
}
function nearestSeg(ll) {      // tronçon le plus proche d'un point (indice du point d'arrivée)
  const cp = map.latLngToContainerPoint(ll); let best = -1, bd = 1e9;
  for (let i = 1; i < S.ctrl.length; i++) {
    const sg = S.segs[i - 1] || [S.ctrl[i - 1].slice(0, 2), S.ctrl[i].slice(0, 2)];
    for (let k = 1; k < sg.length; k++) {
      const p = map.latLngToContainerPoint(sg[k - 1]), q = map.latLngToContainerPoint(sg[k]), d = segProj([cp.x, cp.y], [p.x, p.y], [q.x, q.y]).d;
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}
async function reroute() {
  const gen = ++routeGen, pending = [];
  S.segs = [];
  for (let i = 1; i < S.ctrl.length; i++) {
    const k = segKey(S.ctrl[i - 1], S.ctrl[i], S.ctrl[i][2]);
    if (!S.ctrl[i][2] || S.ctrl[i][2] === 'line') S.segs[i - 1] = [S.ctrl[i - 1].slice(0, 2), S.ctrl[i].slice(0, 2)];
    else if (routeCache.has(k)) S.segs[i - 1] = routeCache.get(k);
    else { S.segs[i - 1] = null; pending.push(i); }
  }
  rebuildFromSegs();
  for (const i of pending) {
    if (gen !== routeGen) return;
    const a = S.ctrl[i - 1], b = S.ctrl[i], mode = b[2];
    routing++; renderInfo();
    let pts;
    try { pts = await routeSeg(a, b, mode); } finally { routing--; }
    routeCache.set(segKey(a, b, mode), pts);
    if (gen !== routeGen) { renderInfo(); return; }
    S.segs[i - 1] = pts; rebuildFromSegs();
  }
  renderInfo();
}
function rebuildFromSegs() {
  const ll = [], prot = new Set();
  if (S.ctrl.length === 1) ll.push(S.ctrl[0].slice(0, 2));
  for (let i = 1; i < S.ctrl.length; i++) {
    const keep = S.ctrl[i][2] === 'trace', seg0 = S.segs[i - 1] || [S.ctrl[i - 1].slice(0, 2), S.ctrl[i].slice(0, 2)], seg = seg0.length >= 3 && !keep ? cleanEnds(seg0) : seg0;      // retire aussi les petites pointes des parcours déjà dessinés (jamais sur une trace chargée : ses épingles restent intactes)
    for (let k = ll.length ? 1 : 0; k < seg.length; k++) { ll.push(seg[k]); if (keep) prot.add(ll.length - 1); }
    if (keep && ll.length > seg.length) prot.add(ll.length - seg.length);
  }
  // petite pointe au point de contrôle : l'itinéraire s'arrête au chemin le plus proche du clic, puis revient au clic avant de repartir → on retire le clic
  const cl = [ll[0]];
  for (let i = 1; i < ll.length - 1; i++) {
    const A = cl[cl.length - 1], B = ll[i], C = ll[i + 1], k = Math.cos(A[0] * Math.PI / 180);
    const u = [(B[1] - A[1]) * k * 111320, (B[0] - A[0]) * 110540], w = [(C[1] - B[1]) * k * 111320, (C[0] - B[0]) * 110540], lu = Math.hypot(u[0], u[1]), lw = Math.hypot(w[0], w[1]);
    if (!prot.has(i) && lu > 0.01 && lw > 0.01 && Math.min(lu, lw) <= 15 && (u[0] * w[0] + u[1] * w[1]) / (lu * lw) < -0.5) continue;
    cl.push(B);
  }
  if (ll.length > 1) cl.push(ll[ll.length - 1]);
  setTrack(ll.length > 2 ? cl : ll);
}
async function fetchJSON(url, opts, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 30000);
  try {
    const r = await fetch(url, { ...(opts || {}), signal: ac.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}
/* Un itinéraire calculé commence et finit au point de chemin le plus proche du clic, pas au clic lui-même : si ce point est un peu avant / après, on obtient un petit aller-retour
   (zigzag) au lieu d'un coude net. On retire ces pointes de moins de 30 m aux deux bouts. */
function cleanEnds(pts) {
  const v = (p, q) => [(q[1] - p[1]) * Math.cos(p[0] * Math.PI / 180) * 111320, (q[0] - p[0]) * 110540], len = u => Math.hypot(u[0], u[1]);
  const spike = (A, B, C) => { const u = v(A, B), w = v(B, C), lu = len(u), lw = len(w); return lu > 0.01 && lw > 0.01 && Math.min(lu, lw) <= 30 && (u[0] * w[0] + u[1] * w[1]) / (lu * lw) < -0.5; };
  const p = pts.slice();
  while (p.length >= 3 && spike(p[p.length - 3], p[p.length - 2], p[p.length - 1]) && len(v(p[p.length - 2], p[p.length - 1])) <= 30) p.splice(p.length - 2, 1);
  while (p.length >= 3 && spike(p[0], p[1], p[2]) && len(v(p[0], p[1])) <= 30) p.splice(1, 1);
  return p;
}
let routeWarned = 0;
const orsKey = () => { try { return (localStorage.getItem('rbgen.orsKey') || '').trim(); } catch (_) { return ''; } };
function orsDialog() {
  const m = openModal('🔑 Clé OpenRouteService', `<p style="margin:0 0 8px">Pour utiliser les profils <b>rando, VTT, vélo de route et marche</b> (comme les profils premium de VisuGPX), colle ici ta clé gratuite OpenRouteService.</p>
    <ol style="margin:0 0 8px 18px;padding:0"><li>Crée un compte gratuit sur <b>openrouteservice.org</b> (« Sign up »).</li><li>Menu « Dashboard » › « Request a token » › type « Free ».</li><li>Copie la clé et colle-la ci-dessous.</li></ol>
    <input id="orsK" type="password" placeholder="Clé OpenRouteService" value="${esc(orsKey())}" style="width:100%;box-sizing:border-box;padding:8px">
    <div class="help" style="margin-top:6px">La clé reste uniquement dans ce navigateur (jamais dans le GPX ni le projet). Quota gratuit : environ 2 000 itinéraires par jour.</div>`,
    [{ label: 'Effacer la clé', onClick: () => { try { localStorage.removeItem('rbgen.orsKey'); } catch (_) {} toast('Clé effacée.', 'ok'); } }, 'sp', { label: 'Annuler' },
     { label: 'Enregistrer', cls: 'primary', onClick: mm => { const v = mm.querySelector('#orsK').value.trim(); try { localStorage.setItem('rbgen.orsKey', v); } catch (_) {} toast(v ? 'Clé enregistrée.' : 'Clé effacée.', 'ok'); } }]);
}
async function routeSeg(a, b, mode) {
  if (mode === 'trace') mode = S.routeMode;      // tronçon d'une trace chargée dont un point a bougé : on suit le mode « Tracé » du menu
  if (!mode || mode === 'line') return [a.slice(0, 2), b.slice(0, 2)];
  if (/^ors:/.test(mode)) {
    const key = orsKey();
    if (!key) { if (Date.now() - routeWarned > 8000) { routeWarned = Date.now(); toast('Clé OpenRouteService manquante (bouton 🔑 à côté du menu « Tracé ») : calcul avec BRouter.', 'err'); } mode = 'trekking'; }
    else {
      try {
        const j = await fetchJSON(`https://api.openrouteservice.org/v2/directions/${mode.slice(4)}/geojson`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: key },
          body: JSON.stringify({ coordinates: [[a[1], a[0]], [b[1], b[0]]], radiuses: [1000, 1000] }) }, 25000);
        const c = j.features[0].geometry.coordinates;
        if (c.length >= 2) return cleanEnds([a.slice(0, 2), ...c.map(q => [+q[1].toFixed(6), +q[0].toFixed(6)]), b.slice(0, 2)]);
      } catch (e) { if (Date.now() - routeWarned > 8000) { routeWarned = Date.now(); toast('OpenRouteService : ' + (e.status === 401 || e.status === 403 ? 'clé refusée' : e.status === 429 ? 'quota du jour atteint' : 'indisponible') + ' : calcul avec BRouter.', 'err'); } mode = 'trekking'; }
    }
  }
  try {
    const url = `https://brouter.de/brouter?lonlats=${a[1].toFixed(6)},${a[0].toFixed(6)}|${b[1].toFixed(6)},${b[0].toFixed(6)}&profile=${encodeURIComponent(mode)}&alternativeidx=0&format=geojson`;
    const j = await fetchJSON(url, null, 25000);
    const c = j.features[0].geometry.coordinates;
    if (c.length >= 2) return cleanEnds([a.slice(0, 2), ...c.map(q => [+q[1].toFixed(6), +q[0].toFixed(6)]), b.slice(0, 2)]);
  } catch (e) { /* on essaie le serveur de secours */ }
  try {
    const prof = mode === 'car-fast' ? 'routed-car' : mode === 'shortest' ? 'routed-foot' : 'routed-bike';
    const url = `https://routing.openstreetmap.de/${prof}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const j = await fetchJSON(url, null, 25000);
    const c = j.routes[0].geometry.coordinates;
    if (c.length >= 2) return cleanEnds([a.slice(0, 2), ...c.map(q => [+q[1].toFixed(6), +q[0].toFixed(6)]), b.slice(0, 2)]);
  } catch (e) { /* ligne droite */ }
  if (Date.now() - routeWarned > 8000) { routeWarned = Date.now(); toast('Itinéraire indisponible (pas d’internet ?) : tracé en ligne droite.', 'err'); }
  return [a.slice(0, 2), b.slice(0, 2)];
}

