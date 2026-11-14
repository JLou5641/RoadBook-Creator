/* ============================================================
   14. Fichiers, boutons, démarrage
   ============================================================ */
async function readFileText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {                 // fichier compressé (gzip)
    if (!window.DecompressionStream) throw new Error('Ce navigateur ne sait pas lire ce fichier compressé : utilise Chrome, Edge ou Firefox récent.');
    return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return new TextDecoder().decode(buf);
}
async function loadFile(file) {
  try {
    const txt = await readFileText(file);
    if (/\.(json|rbosm)$/i.test(file.name) || txt.trim().startsWith('{')) {
      const o = JSON.parse(txt);
      if (o && o.type === 'rbgen-osm') { await importOsm(o); return; }
      if (!o || !o.ll) throw new Error('Projet illisible.');
      if (drawing) setDrawing(false);
      restore(o); $('#rbName').value = S.name; HIST.length = 0; renderAll(); renderTrack(true); setDirty(false);
      toast('Projet ouvert.', 'ok'); return;
    }
    if (txt.includes('rbgen:project')) {      // GPX exporté « avec projet » : on rouvre le roadbook complet
      try {
        const el = new DOMParser().parseFromString(txt, 'application/xml').getElementsByTagNameNS('*', 'project')[0];
        const bin = Uint8Array.from(atob(el.textContent.trim()), c => c.charCodeAt(0));
        const o = JSON.parse(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
        if (o && o.ll) { if (drawing) setDrawing(false); restore(o); $('#rbName').value = S.name; HIST.length = 0; renderAll(); renderTrack(true); setDirty(false); toast('Roadbook rouvert avec son projet.', 'ok'); return; }
      } catch (e) { console.warn('projet du GPX illisible', e); }
    }
    const g = parseGPX(txt);
    if (g.ll.length < 2) throw new Error(g.wpts ? 'Ce GPX ne contient que des waypoints, pas de trace (trk). Utilise un GPX avec la trace du parcours, ou dessine-le.' : 'Aucune trace trouvée dans ce fichier.');
    if (g.trks.length > 1) { const pk = await pickTrack(g); if (!pk) return; g.ll = pk.ll; if (pk.name) g.name = pk.name; }
    if (drawing) setDrawing(false);
    S.stages = []; S.ele = null; S.marks = []; if (S.timing) S.timing.ss = {}; renderMarks();
    S.src = 'gpx'; S.ctrl = []; S.segs = []; S.notes = []; S.stale = false; S.sel = null;
    S.name = g.name || file.name.replace(/\.gpx$/i, ''); $('#rbName').value = S.name;
    setTrack(g.ll, true); renderAll(); renderTrack(true);
    toast(`Trace chargée : ${kmFr(T.L)} km. Clique sur « Générer le roadbook ».`, 'ok');
  } catch (e) { openModal('Fichier non reconnu', esc(e.message || e), [{ label: 'OK', cls: 'primary' }]); }
}
/* ---------- Chemins OSM : copie dans un fichier (dossier au choix) et rechargement ---------- */
async function allTiles() {
  const m = new Map();
  for (const r of await TileDB.getAll()) m.set(r.k, r);
  for (const [k, r] of memTiles) m.set(k, r);
  return [...m.values()];
}
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
async function allIGN() {
  const m = new Map();
  for (const r of await TileDB.getAll('ign')) m.set(r.k, r);
  for (const [k, r] of memIGN) m.set(k, r);
  return [...m.values()];
}
async function allVT() {
  const m = new Map();
  for (const r of await TileDB.getAll('vt')) m.set(r.k, r.d);
  for (const [k, d] of memVT) m.set(k, d);
  return [...m].map(([k, d]) => ({ k, d: toB64(d) }));
}
async function saveOsm() {
  const recs = await allTiles(), vt = await allVT(), ign = await allIGN();
  if (!recs.length && !vt.length && !ign.length) { toast('Aucun chemin en mémoire : génère d’abord un roadbook (ou change de zone).', 'err'); return; }
  let blob = new Blob([JSON.stringify({ type: 'rbgen-osm', v: 2, date: new Date().toISOString(), tiles: recs, vt, ign })], { type: 'application/json' });
  if (window.CompressionStream) blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const name = 'chemins-osm-' + new Date().toISOString().slice(0, 10) + '.rbosm';
  const size = (blob.size / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  if (window.showSaveFilePicker) {          // Chrome / Edge : choix du dossier et du nom
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Chemins OpenStreetMap', accept: { 'application/octet-stream': ['.rbosm'] } }] });
      const w = await h.createWritable(); await w.write(blob); await w.close();
      toast(`Chemins enregistrés : ${osmCount(recs.length, vt.length, ign.length)} (${size}).`, 'ok'); return;
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  download(name, blob, 'application/octet-stream');
  toast(`Chemins enregistrés dans tes téléchargements : ${osmCount(recs.length, vt.length, ign.length)} (${size}).`, 'ok');
}
function osmCount(nz, nv, ni) { return [nz ? `${nz} zone${nz > 1 ? 's' : ''} détaillée${nz > 1 ? 's' : ''}` : '', nv ? `${nv} tuile${nv > 1 ? 's' : ''} du fond vectoriel` : '', ni ? `${ni} case${ni > 1 ? 's' : ''} BD TOPO` : ''].filter(Boolean).join(' + '); }
async function importOsm(o) {
  const recs = (o.tiles || []).filter(r => r && r.k && r.w && r.n && r.f);
  const vt = (o.vt || []).filter(r => r && /^\d+\/\d+\/\d+$/.test(r.k) && typeof r.d === 'string').map(r => ({ k: r.k, t: Date.now(), d: fromB64(r.d) }));
  const ign = (o.ign || []).filter(r => r && /^(x:)?-?\d+,-?\d+$/.test(r.k) && Array.isArray(r.f));
  if (!recs.length && !vt.length && !ign.length) throw new Error('Ce fichier ne contient aucun chemin.');
  for (const r of ign) memIGN.set(r.k, r);
  if (ign.length) await TileDB.putMany(ign, 'ign');
  for (const r of recs) memTiles.set(r.k, r);
  for (const r of vt) memVT.set(r.k, r.d);
  if (recs.length) await TileDB.putMany(recs);
  if (vt.length) await TileDB.putMany(vt, 'vt');
  G = null;
  toast(`Chemins chargés : ${osmCount(recs.length, vt.length, ign.length)}. Plus besoin de les télécharger.`, 'ok');
}
$('#bOpen').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = e => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; };
$('#bDraw').onclick = () => {
  if (drawing) { setDrawing(false); return; }
  if (S.src === 'gpx' && S.ll.length) {
    openModal('Modifier la trace chargée ?', 'Tu peux <b>modifier cette trace</b> (déplacer, ajouter, effacer des points ; tes notes sont gardées et à régénérer), ou <b>l’effacer</b> pour en dessiner une nouvelle (les notes sont alors supprimées).', [
      'sp', { label: 'Annuler' },
      { label: 'Effacer et dessiner', onClick: () => { S.ll = []; S.ctrl = []; S.segs = []; S.notes = []; S.stale = false; S.src = 'draw'; setTrack([], true); renderAll(); setDrawing(true); } },
      { label: 'Modifier cette trace', cls: 'primary', onClick: () => { ctrlFromTrack(); setDrawing(true); } }]);
    return;
  }
  setDrawing(true);
};
$('#bDrawEnd').onclick = () => setDrawing(false);
/* ---- étape 2 : couper / rogner / départ, inverser, fusionner, réduire les points, coller à la route ---- */
const gapM = (p, q) => haversine([p[0], p[1]], [q[0], q[1]]);
function cutAt(ll) {
  if (anyLock()) { toast('Une étape est verrouillée 🔒 : déverrouille-la (menu ⋯ › Étapes) pour utiliser cet outil.', 'err'); return; }
  if (S.ctrl.length < 2) return;
  const i = nearestSeg(ll); if (i < 1) return;
  const sg = S.segs[i - 1] || [S.ctrl[i - 1].slice(0, 2), S.ctrl[i].slice(0, 2)], cp = map.latLngToContainerPoint(ll);
  let bq = null, bd = 1e9;      // point de la trace le plus proche du clic
  for (let k = 1; k < sg.length; k++) {
    const p = map.latLngToContainerPoint(sg[k - 1]), q = map.latLngToContainerPoint(sg[k]), r = segProj([cp.x, cp.y], [p.x, p.y], [q.x, q.y]);
    if (r.d < bd) { bd = r.d; bq = map.containerPointToLatLng([r.q[0], r.q[1]]); }
  }
  const C = [+bq.lat.toFixed(6), +bq.lng.toFixed(6)], o = S.ctrl, n = o.length, md = o[i][2];
  const first = o[0], last = o[n - 1], isLoop = gapM(first, last) < 150;
  const apply = (arr) => { pushHist(); S.ctrl = arr; S.ctrl[0][2] = null; S.src = 'draw'; renderCtrl(); reroute(); };
  const btns = ['sp', { label: 'Annuler' },
    { label: 'Supprimer le début', onClick: () => apply([[C[0], C[1], null], ...o.slice(i)]) },
    { label: 'Supprimer la fin', onClick: () => apply([...o.slice(0, i), [C[0], C[1], md]]) }];
  if (isLoop) btns.push({ label: 'Départ ici (boucle)', cls: 'primary', onClick: () => apply([[C[0], C[1], null], ...o.slice(i, n - 1), ...o.slice(0, i).map((c, k) => k === 0 ? [c[0], c[1], o[1] ? o[1][2] : md] : c), [C[0], C[1], md]]) });
  openModal('Couper ici', `Que veux-tu faire à cet endroit de la trace ?${isLoop ? '' : '<br><span style="color:#8a8478">« Départ ici » n’est proposé que pour une boucle (début et fin à moins de 150 m).</span>'}`, btns);
}
function reverseCtrl() {
  if (anyLock()) { toast('Une étape est verrouillée 🔒 : déverrouille-la (menu ⋯ › Étapes) pour utiliser cet outil.', 'err'); return; }
  if (S.ctrl.length < 2) return;
  pushHist(); const o = S.ctrl, oldSegs = S.segs.slice(), N = o.length;
  S.ctrl = o.slice().reverse().map((c, j) => [c[0], c[1], j ? o[o.length - j][2] : null]);
  // on inverse simplement chaque tronçon déjà calculé (même trajet dans l'autre sens) au lieu de le recalculer : sinon l'itinéraire peut changer, ou se réduire à des lignes droites hors connexion
  for (let j = 1; j < N; j++) { const sg = oldSegs[N - j - 1], mode = S.ctrl[j][2]; if (mode && mode !== 'line' && sg && sg.length >= 2) routeCache.set(segKey(S.ctrl[j - 1], S.ctrl[j], mode), sg.slice().reverse()); }
  renderCtrl(); reroute(); toast('Sens du parcours inversé.', 'ok');
}
async function mergeFile(file) {
  if (anyLock()) { toast('Une étape est verrouillée 🔒 : déverrouille-la (menu ⋯ › Étapes) pour utiliser cet outil.', 'err'); return; }
  try {
    const g = parseGPX(await readFileText(file));
    if (g.ll.length < 2) throw new Error('Aucune trace trouvée dans ce fichier.');
    if (g.trks.length > 1) { const pk = await pickTrack(g); if (!pk) return; g.ll = pk.ll; }
    const add = llToCtrl(g.ll, 3, 500), o = S.ctrl;
    if (!o.length) { pushHist(); S.ctrl = add; S.src = 'draw'; renderCtrl(); reroute(); return; }
    const cF = o[0], cL = o[o.length - 1], A = add[0], Z = add[add.length - 1];
    const opts = [      // [écart, fonction qui construit la nouvelle liste, texte]
      [gapM(cL, A), () => o.concat(add.map((c, k) => k ? c : [c[0], c[1], 'line'])), 'à la suite'],
      [gapM(cL, Z), () => o.concat(add.slice().reverse().map((c, k) => [c[0], c[1], 'line'])), 'à la suite, sens inversé'],
      [gapM(Z, cF), () => add.concat(o.map((c, k) => k ? c : [c[0], c[1], 'line'])), 'avant'],
      [gapM(A, cF), () => add.slice().reverse().concat(o.map((c, k) => k ? c : [c[0], c[1], 'line'])), 'avant, sens inversé']];
    opts.sort((x, y) => x[0] - y[0]);
    const [gap, build, txt] = opts[0];
    pushHist(); S.ctrl = build(); S.ctrl[0][2] = null; S.src = 'draw'; renderCtrl(); reroute();
    toast(`Fichier ajouté ${txt} (écart entre les deux parcours : ${gap < 1000 ? Math.round(gap) + ' m' : (gap / 1000).toFixed(1).replace('.', ',') + ' km'}).`, 'ok');
  } catch (e) { openModal('Fichier non reconnu', esc(e.message || e), [{ label: 'OK', cls: 'primary' }]); }
}
let redLayer = null;
const clearRed = () => { if (redLayer) { map.removeLayer(redLayer); redLayer = null; } };
function reduceDialog() {
  if (anyLock()) { toast('Une étape est verrouillée 🔒 : déverrouille-la (menu ⋯ › Étapes) pour utiliser cet outil.', 'err'); return; }
  if (S.ll.length < 3) return;
  const n0 = S.ll.length;
  const show = tol => { const idx = simplifyLL(S.ll, tol, 0); if (redLayer) redLayer.setLatLngs(idx.map(k => S.ll[k])); else redLayer = L.polyline(idx.map(k => S.ll[k]), { color: '#d6001c', weight: 3, opacity: 0.95, interactive: false }).addTo(map); return idx; };
  let idx = show(5);
  const m = openModal('Réduire le nombre de points', `<div>Le tracé simplifié apparaît en <b style="color:#d6001c">rouge</b> sur la carte.</div>
    <div style="margin:10px 0"><input type="range" id="redTol" min="0.5" max="50" step="0.5" value="5" style="width:100%"></div>
    <div id="redTxt"></div>`, ['sp', { label: 'Annuler', onClick: clearRed }, { label: 'Appliquer', cls: 'primary', onClick: () => {
      clearRed(); pushHist(); S.ctrl = idx.map((k, j) => [S.ll[k][0], S.ll[k][1], j ? 'line' : null]); S.src = 'draw'; renderCtrl(); reroute(); toast(`${n0} → ${idx.length} points.`, 'ok'); } }], { onCancel: clearRed });
  const upd = () => { const t = +m.querySelector('#redTol').value; idx = show(t); m.querySelector('#redTxt').textContent = `Tolérance ${String(t).replace('.', ',')} m : ${n0} → ${idx.length} points`; };
  m.querySelector('#redTol').oninput = upd; upd();
}
function snapSel() {      // « Coller à la route » limité au point ou à la section choisie (le reste de la trace ne bouge pas)
  if (anyLock()) { toast('Une étape est verrouillée 🔒 : déverrouille-la (menu ⋯ › Étapes) pour utiliser cet outil.', 'err'); return; }
  if (S.routeMode === 'line') { toast('Choisis d’abord un mode « Tracé » qui suit les chemins (Suivre pistes & chemins…).', 'err'); return; }
  const single = selR.a === selR.b; let a = selR.a, b = selR.b; const pin = selR.a;
  if (single) { while (a > 0 && gapM(S.ctrl[a], S.ctrl[pin]) < 30) a--; while (b < S.ctrl.length - 1 && gapM(S.ctrl[b], S.ctrl[pin]) < 30) b++; }
  if (a === b) { toast('Le point est seul : rien à recalculer.', 'err'); return; }
  const P = [], off = [];
  for (let k = a; k < b; k++) { off.push(P.length); const sg = S.segs[k] || [S.ctrl[k].slice(0, 2), S.ctrl[k + 1].slice(0, 2)]; sg.forEach((p, j) => { if (P.length && !j) return; P.push([p[0], p[1]]); }); }
  off.push(P.length - 1);
  if (P.length < 2) return;
  let idx = simplifyLL(P, 20, 40); if (single) idx = [...new Set([...idx, off[pin - a]])].sort((x, y) => x - y);
  const n0 = b - a + 1, np = idx.map((k, j) => [P[k][0], P[k][1], j ? S.routeMode : S.ctrl[a][2]]);
  np[0] = [S.ctrl[a][0], S.ctrl[a][1], S.ctrl[a][2]]; np[np.length - 1] = [S.ctrl[b][0], S.ctrl[b][1], S.routeMode];
  pushHist(); S.ctrl.splice(a, n0, ...np); S.src = 'draw';
  const s0 = single ? a + idx.indexOf(off[pin - a]) : a; selR = { a: s0, b: single ? s0 : a + np.length - 1 }; selPend = false;
  renderCtrl(); reroute(); toast(`${single ? 'Point' : 'Section'} recollé${single ? '' : 'e'} à la route : ${n0} → ${np.length} points (annulable avec ↶).`, 'ok');
}
function snapDialog() {
  if (anyLock()) { toast('Une étape est verrouillée 🔒 : déverrouille-la (menu ⋯ › Étapes) pour utiliser cet outil.', 'err'); return; }
  if (S.ctrl.length < 2 && S.ll.length < 2) return;
  if (S.routeMode === 'line') { toast('Choisis d’abord un mode « Tracé » qui suit les chemins (Suivre pistes & chemins…).', 'err'); return; }
  const idx = simplifyLL(S.ll, 20, 60), name = ($('#routeMode').selectedOptions[0] || {}).textContent || S.routeMode;
  openModal('Coller à la route', `La trace est résumée en <b>${idx.length} points</b> puis recalculée sur les chemins avec le mode « ${esc(name)} ». Les tronçons sont recalculés un par un (internet nécessaire).`, ['sp', { label: 'Annuler' }, { label: 'Coller', cls: 'primary', onClick: () => {
    pushHist(); S.ctrl = idx.map((k, j) => [S.ll[k][0], S.ll[k][1], j ? S.routeMode : null]); S.src = 'draw'; renderCtrl(); reroute(); } }]);
}
/* ---- étape 3 : étapes, GPX multi-traces, marqueurs ---- */
const MARK_ICONS = [['refuge', '🏠', 'Refuge'], ['water', '💧', 'Eau'], ['fuel', '⛽', 'Carburant'], ['food', '🍴', 'Repas'], ['bed', '⛺', 'Bivouac'],
  ['danger', '⚠️', 'Danger'], ['photo', '📷', 'Photo'], ['parking', '🅿️', 'Parking'], ['view', '⛰️', 'Point de vue'], ['pin', '📍', 'Repère']];
const anyLock = () => (S.stages || []).some(g => g.lock);
let stagePick = false, markPick = false;
function pickClick(latlng) {
  if (measOn && !drawing) { measureAtLL(latlng); return true; }
  if (stagePick) { stagePick = false; if (!drawing) addStage(latlng); stagesDialog(); return true; }
  if (markPick) { markPick = false; markForm({ lat: latlng.lat, lon: latlng.lng, icon: 'pin' }, true); return true; }
  return false;
}
function stageList() {      // étapes dans l'ordre du parcours : {s0, s1, lock, i (indice dans S.stages)}
  if (!T) return [];
  if (!S.stages || !S.stages.length) return [{ s0: 0, s1: T.L, lock: false, i: 0 }];
  const st = [];
  S.stages.forEach((b, i) => {
    let s = 0;
    if (i) { const pr = projAll(fwd(b.lat, b.lon), 60); if (!pr.length) return; s = pr.reduce((x, y) => y.d < x.d ? y : x).s; }
    st.push({ s, lock: !!b.lock, i });
  });
  st.sort((x, y) => x.s - y.s);
  return st.map((x, k) => ({ s0: x.s, s1: k + 1 < st.length ? st[k + 1].s : T.L, lock: x.lock, i: x.i }));
}
function ensureStages() { if (!S.stages.length) S.stages = [{ lock: false }]; }
function addStage(ll) {
  if (!T) return;
  const pr = projAll(fwd(ll.lat, ll.lng), 80); if (!pr.length) { toast('Clique sur la trace.', 'err'); return; }
  const s = pr.reduce((x, y) => y.d < x.d ? y : x).s, L_ = stageList();
  if (s < 30 || s > T.L - 30 || L_.some(g => Math.abs(g.s0 - s) < 30)) { toast('Coupure trop proche d’une autre ou d’une extrémité.', 'err'); return; }
  const cur = L_.find(g => s >= g.s0 && s < g.s1), q = inv(...pointAt(s));
  ensureStages(); S.stages.push({ lat: +q[0].toFixed(6), lon: +q[1].toFixed(6), lock: !!(cur && cur.lock) });
  save(); renderStages();
}
function stageLL(s0, s1) {
  const out = [inv(...pointAt(s0))];
  for (let k = 0; k < T.xy.length; k++) if (T.cum[k] > s0 && T.cum[k] < s1) out.push(inv(T.xy[k][0], T.xy[k][1]));
  out.push(inv(...pointAt(s1))); return out;
}
function renderStages() {
  stageLayer.clearLayers(); lockLayer.clearLayers();
  if (!T) return;
  const L_ = stageList();
  L_.forEach((g, k) => {
    if (g.lock) L.polyline(stageLL(g.s0, g.s1), { color: '#2b6cb0', weight: 9, opacity: 0.35, interactive: false }).addTo(lockLayer);
    if (!k || !S.stages[g.i]) return;
    const b = S.stages[g.i];
    L.marker([b.lat, b.lon], { keyboard: false, icon: L.divIcon({ className: 'stflag', html: `<span>É${k + 1}</span>`, iconSize: [30, 20], iconAnchor: [15, 10] }) }).bindTooltip(`Début de l’étape ${k + 1} · ${km(g.s0)} km`).addTo(stageLayer);
  });
}
function eleAt(s) { const e = S.ele, f = s / e.step, k = Math.min(e.v.length - 2, Math.max(0, Math.floor(f))); return e.v[k] + (e.v[k + 1] - e.v[k]) * (f - k); }
function eleStats(s0, s1) {
  const e = S.ele; if (!e || e.sig !== trackSig(S.ll) || e.v.length < 2) return null;
  let up = 0, dn = 0, prev = eleAt(s0);
  const seq = []; for (let k = Math.ceil(s0 / e.step); k <= Math.floor(s1 / e.step) && k < e.v.length; k++) seq.push(e.v[k]);
  seq.push(eleAt(s1));
  for (const z of seq) { const d = z - prev; if (d > 0) up += d; else dn -= d; prev = z; }
  return { up, dn };
}
async function fetchEle() {
  const n = Math.min(400, Math.max(2, Math.ceil(T.L / 100))), step = T.L / (n - 1), pts = [];
  for (let k = 0; k < n; k++) pts.push(inv(...pointAt(k * step)));
  const v = [];
  for (let k = 0; k < n; k += 100) {
    const part = pts.slice(k, k + 100);
    const j = await fetchJSON('https://api.open-meteo.com/v1/elevation?latitude=' + part.map(p => p[0].toFixed(5)).join(',') + '&longitude=' + part.map(p => p[1].toFixed(5)).join(','), {}, 20000);
    if (!j.elevation || j.elevation.length !== part.length) throw new Error('Réponse altitude inattendue.');
    v.push(...j.elevation);
  }
  S.ele = { sig: trackSig(S.ll), step, v }; save();
}
function stageGPX(k) {
  const g = stageList()[k]; if (!g) return;
  const nm = `${S.name} - étape ${k + 1}`;
  const pts = stageLL(g.s0, g.s1).map(p => `      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"/>`).join('\n');
  download(nm.replace(/[\\/:*?"<>|]+/g, '_') + '.gpx', `<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="Generateur de Roadbook OSM" version="1.1">\n  <metadata><name>${xmlEsc(nm)}</name></metadata>\n  <trk>\n    <name>${xmlEsc(nm)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`, 'application/gpx+xml');
}
function stagesDialog() {
  if (!T) { toast('Charge ou dessine d’abord une trace.', 'err'); return; }
  const L_ = stageList(), hasEle = !!(S.ele && S.ele.sig === trackSig(S.ll));
  const rows = L_.map((g, k) => { const e = hasEle ? eleStats(g.s0, g.s1) : null; return `<tr><td><b>${k + 1}</b></td><td>${kmFr(g.s1 - g.s0)} km</td><td>${e ? '+' + Math.round(e.up) + ' / −' + Math.round(e.dn) + ' m' : '—'}</td>
    <td><label title="Verrouiller : les points de cette étape ne peuvent plus être modifiés en mode dessin"><input type="checkbox" class="stLock" data-i="${g.i}" ${g.lock ? 'checked' : ''}> 🔒</label></td>
    <td><button class="mbtn stGpx" data-k="${k}" title="Exporter cette étape en GPX">GPX</button>${g.i ? ` <button class="mbtn stDel" data-i="${g.i}" title="Supprimer cette coupure (fusionne avec l’étape précédente)">✖</button>` : ''}</td></tr>`; }).join('');
  const m = openModal('Étapes', `<table class="stTab"><tr><th>N°</th><th>Distance</th><th>Dénivelé</th><th></th><th></th></tr>${rows}</table>
    <div style="margin-top:8px;color:#8a8478;font-size:12px">Total : ${kmFr(T.L)} km${hasEle ? '' : ' · le dénivelé se calcule avec « Calculer le dénivelé » (internet nécessaire)'}.</div>`,
    ['sp', { label: 'Ajouter une coupure', onClick: () => { stagePick = true; toast('Clique sur la trace pour poser le début d’une étape.', 'ok'); } },
      ...(hasEle ? [] : [{ label: 'Calculer le dénivelé', onClick: async () => { toast('Calcul du dénivelé…'); try { await fetchEle(); } catch (e) { toast('Altitude indisponible : ' + (e.message || e), 'err'); return; } stagesDialog(); } }]),
      { label: 'Fermer', cls: 'primary' }]);
  m.querySelectorAll('.stLock').forEach(el => el.onchange = () => { ensureStages(); S.stages[+el.dataset.i].lock = el.checked; save(); renderStages(); if (drawing) renderCtrl(); });
  m.querySelectorAll('.stGpx').forEach(el => el.onclick = () => stageGPX(+el.dataset.k));
  m.querySelectorAll('.stDel').forEach(el => el.onclick = () => { S.stages.splice(+el.dataset.i, 1); save(); stagesDialog(); });
}
// --- GPX contenant plusieurs traces : on choisit laquelle charger
function pickTrack(g) {
  return new Promise(res => {
    const len = ll => { let d = 0; for (let i = 1; i < ll.length; i++) d += haversine(ll[i - 1], ll[i]); return d; };
    const body = `Ce fichier contient ${g.trks.length} traces. Laquelle veux-tu charger ?<div style="max-height:45vh;overflow:auto;margin-top:8px">${g.trks.map((t, i) => `<button class="mbtn trkPick" data-i="${i}" style="display:block;width:100%;text-align:left;margin:3px 0">${esc(t.name)} · ${kmFr(len(t.ll))} km</button>`).join('')}</div>`;
    const m = openModal('Plusieurs traces', body, ['sp', { label: 'Annuler', onClick: () => res(null) }, { label: 'Toutes à la suite', onClick: () => res({ ll: g.ll, name: '' }) }], { onCancel: () => res(null) });
    m.querySelectorAll('.trkPick').forEach(el => el.onclick = () => { const t = g.trks[+el.dataset.i]; modalOpts = null; closeModal(); res({ ll: t.ll, name: t.name }); });
  });
}
// --- marqueurs
const markIcon = k => (MARK_ICONS.find(x => x[0] === k) || MARK_ICONS[MARK_ICONS.length - 1]);
function renderMarks() {
  markLayer.clearLayers();
  for (const mk of S.marks || []) {
    const ic = markIcon(mk.icon);
    L.marker([mk.lat, mk.lon], { keyboard: false, icon: L.divIcon({ className: 'mkpin', html: `<span>${ic[1]}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindTooltip(`<b>${esc(mk.name || ic[2])}</b>${mk.desc ? '<br>' + esc(mk.desc).replace(/\n/g, '<br>') : ''}`).on('click', () => markForm(mk, false)).addTo(markLayer);
  }
}
function markForm(mk, isNew, cand) {
  const opts = MARK_ICONS.map(x => `<option value="${x[0]}" ${x[0] === mk.icon ? 'selected' : ''}>${x[1]} ${x[2]}</option>`).join('');
  const m = openModal(isNew ? 'Nouveau marqueur' : 'Marqueur', `<label>Icône <select id="mkIcon">${opts}</select></label>
    <label style="display:block;margin-top:8px">Nom <input id="mkName" type="text" value="${esc(mk.name || '')}" style="width:100%"></label>
    <label style="display:block;margin-top:8px">Description <textarea id="mkDesc" rows="3" style="width:100%">${esc(mk.desc || '')}</textarea></label>`,
    [...(isNew ? [] : [{ label: 'Supprimer', onClick: () => { S.marks = S.marks.filter(x => x !== mk); renderMarks(); save(); } }]), 'sp', { label: 'Annuler' },
      { label: 'Enregistrer', cls: 'primary', onClick: () => {
        mk.icon = m.querySelector('#mkIcon').value; mk.name = m.querySelector('#mkName').value.trim(); mk.desc = m.querySelector('#mkDesc').value.trim();
        if (isNew) { mk.id = Date.now(); S.marks.push(mk); if (cand) candLayer.removeLayer(cand); }
        renderMarks(); save(); marksDialog(); } }]);
}
async function searchOSMmarks() {
  if (map.getZoom() < 11) { toast('Zoome davantage (la zone visible est trop grande).', 'err'); return; }
  const b = map.getBounds(), bb = `${b.getSouth().toFixed(5)},${b.getWest().toFixed(5)},${b.getNorth().toFixed(5)},${b.getEast().toFixed(5)}`;
  const q = `[out:json][timeout:25];(node["amenity"="drinking_water"](${bb});node["natural"="spring"](${bb});node["tourism"="alpine_hut"](${bb});node["tourism"="wilderness_hut"](${bb});node["amenity"="shelter"](${bb});node["amenity"="fuel"](${bb}););out body 150;`;
  toast('Recherche sur OpenStreetMap…');
  try {
    const j = await overpass(q, () => false, 0);
    candLayer.clearLayers(); let n = 0;
    for (const e of j.elements || []) {
      const t = e.tags || {}, k = t.amenity === 'fuel' ? 'fuel' : (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut' || t.amenity === 'shelter') ? 'refuge' : 'water';
      const ic = markIcon(k), nm = t.name || '';
      const cm = L.marker([e.lat, e.lon], { keyboard: false, opacity: 0.8, icon: L.divIcon({ className: 'mkpin cand', html: `<span>${ic[1]}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindTooltip(`${esc(nm || ic[2])} (OSM) — clique pour ajouter`).on('click', () => markForm({ lat: e.lat, lon: e.lon, icon: k, name: nm, desc: t.description || '' }, true, cm)).addTo(candLayer); n++;
    }
    toast(n ? `${n} résultat${n > 1 ? 's' : ''} (en transparence) : clique sur un pour l’ajouter.` : 'Rien trouvé dans cette zone.', n ? 'ok' : 'err');
  } catch (e) { toast('Recherche impossible : ' + (e.message || e), 'err'); }
}
function marksDialog() {
  const rows = (S.marks || []).map((mk, i) => `<div style="display:flex;gap:8px;align-items:center;margin:3px 0"><span style="font-size:18px">${markIcon(mk.icon)[1]}</span><span style="flex:1">${esc(mk.name || markIcon(mk.icon)[2])}</span><button class="mbtn mkEd" data-i="${i}">✎</button></div>`).join('') || '<div style="color:#8a8478">Aucun marqueur pour l’instant.</div>';
  const m = openModal('Marqueurs', `<div style="max-height:40vh;overflow:auto">${rows}</div>
    <label style="display:block;margin-top:10px"><input type="checkbox" id="mkExp" ${S.settings.marksExport !== false ? 'checked' : ''}> Les ajouter au GPX exporté</label>`,
    ['sp', ...(candLayer.getLayers().length ? [{ label: 'Masquer les résultats OSM', onClick: () => candLayer.clearLayers() }] : []),
      { label: '🔎 Refuges, eau, carburant (zone visible)', onClick: searchOSMmarks }, { label: 'Ajouter sur la carte', onClick: () => { markPick = true; toast('Clique sur la carte pour placer le marqueur.', 'ok'); } }, { label: 'Fermer', cls: 'primary' }]);
  m.querySelector('#mkExp').onchange = e => { S.settings.marksExport = e.target.checked; save(); };
  m.querySelectorAll('.mkEd').forEach(el => el.onclick = () => { modalOpts = null; closeModal(); markForm(S.marks[+el.dataset.i], false); });
}
// positions des points de contrôle le long de la trace (pour le verrouillage)
function lockedSet() {
  if (!anyLock() || !T) return null;
  const ls = stageList().filter(g => g.lock); if (!ls.length) return null;
  const set = new Set(); let s = 0;
  S.ctrl.forEach((c, i) => {
    if (i) { const sg = S.segs[i - 1]; if (sg && sg.length > 1) for (let k = 1; k < sg.length; k++) s += haversine(sg[k - 1], sg[k]); else s += haversine(S.ctrl[i - 1], c); }
    if (ls.some(g => s >= g.s0 - 3 && s <= g.s1 + 3)) set.add(i);
  });
  return set;
}
/* ---- étape 4 : altitude, aperçu 3D, horodatage ---- */
const eleValid = () => !!(S.ele && S.ele.sig === trackSig(S.ll) && S.ele.v.length > 1);
function timingDef() { if (!S.timing) S.timing = { start: '', speed: 30, slope: true, exp: false, ss: {} }; if (!S.timing.ss) S.timing.ss = {}; return S.timing; }
function timeSeries() {      // temps cumulé (s) tous les 100 m ; allure par étape, corrigée par la pente (montée = plus lent, descente = plus vite)
  const t = timingDef(), L = T.L, step = 100, n = Math.max(1, Math.ceil(L / step)), stg = stageList(), ev = eleValid(), tc = [0];
  for (let k = 0; k < n; k++) {
    const s0 = k * step, s1 = Math.min(L, (k + 1) * step), d = Math.max(1, s1 - s0), sm = (s0 + s1) / 2;
    const g = ev && t.slope ? (eleAt(Math.min(s1, S.ele.step * (S.ele.v.length - 1))) - eleAt(Math.min(s0, S.ele.step * (S.ele.v.length - 1)))) / d : 0;
    const st = stg.find(x => sm >= x.s0 && sm < x.s1) || stg[stg.length - 1], base = +(t.ss[st.i] || t.speed) || 30;
    tc.push(tc[k] + d / (base * clamp(1 - 3 * g, 0.5, 1.3) / 3.6));
  }
  return { tc, step, L };
}
function timeAt(ts, s) {
  s = clamp(s, 0, ts.L); const k = Math.min(ts.tc.length - 2, Math.floor(s / ts.step)), a0 = k * ts.step, a1 = Math.min(ts.L, (k + 1) * ts.step);
  return ts.tc[k] + (ts.tc[k + 1] - ts.tc[k]) * (a1 > a0 ? clamp((s - a0) / (a1 - a0), 0, 1) : 0);
}
const hm = sec => { const m = Math.round(sec / 60); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); };
const clock = (t0, sec) => { const d = new Date(t0 + sec * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
function cleanEle() {      // valeurs aberrantes : un point qui s'écarte de plus de 30 m de la médiane de ses voisins est remplacé ; puis lissage léger
  const v = S.ele.v, n = v.length, out = v.slice(); let fixed = 0;
  for (let i = 0; i < n; i++) {
    const w = []; for (let j = -2; j <= 2; j++) if (i + j >= 0 && i + j < n) w.push(v[i + j]);
    w.sort((x, y) => x - y); const med = w[w.length >> 1];
    if (Math.abs(v[i] - med) > 30) { out[i] = med; fixed++; }
  }
  S.ele.v = out.map((x, i) => +((i && i < n - 1 ? (out[i - 1] + 2 * x + out[i + 1]) / 4 : x)).toFixed(1)); S.ele.clean = true; save();
  return fixed;
}
function eleChart(W, H) {
  const v = S.ele.v, mn = Math.min(...v), mx = Math.max(...v), r = Math.max(10, mx - mn), n = v.length;
  const X = k => (k / (n - 1) * W).toFixed(1), Y = z => (H - 8 - (z - mn) / r * (H - 22)).toFixed(1);
  let d = 'M0,' + H; v.forEach((z, k) => d += ` L${X(k)},${Y(z)}`); d += ` L${W},${H} Z`;
  const bars = stageList().slice(1).map(g => `<line x1="${(g.s0 / T.L * W).toFixed(1)}" x2="${(g.s0 / T.L * W).toFixed(1)}" y1="0" y2="${H}" stroke="#2b6cb0" stroke-dasharray="3 3"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;background:#f3efe4;border-radius:8px"><path d="${d}" fill="#d9c9a3" stroke="#b5651d" stroke-width="1.5"/>${bars}<text x="4" y="12" font-size="11" fill="#555">${Math.round(mx)} m</text><text x="4" y="${H - 2}" font-size="11" fill="#555">${Math.round(mn)} m</text></svg>`;
}
function altDialog() {
  if (!T) { toast('Charge ou dessine d’abord une trace.', 'err'); return; }
  const ev = eleValid(), t = timingDef(), ts = timeSeries(), stg = stageList(), t0 = t.start ? new Date(t.start).getTime() : null;
  const es = ev ? eleStats(0, T.L) : null;
  const rows = stg.map((g, k) => { const dur = timeAt(ts, g.s1) - timeAt(ts, g.s0);
    return `<tr><td><b>${k + 1}</b></td><td>${kmFr(g.s1 - g.s0)} km</td><td><input type="number" class="alSS" data-i="${g.i}" min="3" max="200" step="1" placeholder="${t.speed}" value="${t.ss[g.i] || ''}" style="width:62px"> km/h</td><td>${hm(dur)}</td><td>${t0 != null ? clock(t0, timeAt(ts, g.s1)) : '—'}</td></tr>`; }).join('');
  const tot = timeAt(ts, T.L);
  const m = openModal('Altitude et horaires', `${ev ? eleChart(560, 130) + `<div style="margin:6px 0;font-size:13px">D+ <b>${Math.round(es.up)} m</b> · D− <b>${Math.round(es.dn)} m</b> · mini ${Math.round(Math.min(...S.ele.v))} m · maxi ${Math.round(Math.max(...S.ele.v))} m${S.ele.clean ? ' · nettoyé' : ''}</div>` : '<div style="color:#8a8478;margin-bottom:8px">Pas encore d’altitude : « Calculer l’altitude » (internet nécessaire).</div>'}
    <div style="border-top:1px solid #ddd;margin:8px 0;padding-top:8px"><b>Horodatage</b>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:6px 0">
      <label>Départ <input type="datetime-local" id="alStart" value="${esc(t.start || '')}"></label>
      <label>Vitesse moyenne <input type="number" id="alSpeed" min="3" max="200" step="1" value="${t.speed}" style="width:62px"> km/h</label>
      <label title="Montée : plus lent, descente : plus rapide (nécessite l’altitude)"><input type="checkbox" id="alSlope" ${t.slope ? 'checked' : ''}> tenir compte de la pente</label></div>
    <table class="stTab"><tr><th>Étape</th><th>Distance</th><th>Vitesse</th><th>Durée</th><th>Arrivée</th></tr>${rows}</table>
    <div style="margin-top:6px">Total : <b>${hm(tot)}</b>${t0 != null ? ' · arrivée <b>' + clock(t0, tot) + '</b>' : ''}</div>
    <label style="display:block;margin-top:8px"><input type="checkbox" id="alExp" ${t.exp ? 'checked' : ''}> Ajouter les heures (et l’altitude) à la trace du GPX exporté${t.exp && !t.start ? ' — <span style="color:#c0392b">choisis une heure de départ</span>' : ''}</label></div>`,
    ['sp', { label: ev ? 'Recalculer l’altitude' : 'Calculer l’altitude', onClick: async () => { toast('Calcul de l’altitude…'); try { await fetchEle(); } catch (e) { toast('Altitude indisponible : ' + (e.message || e), 'err'); return; } altDialog(); } },
      ...(ev ? [{ label: 'Nettoyer', onClick: () => { const n = cleanEle(); toast(n ? `${n} valeur${n > 1 ? 's' : ''} aberrante${n > 1 ? 's' : ''} corrigée${n > 1 ? 's' : ''}, profil lissé.` : 'Aucune valeur aberrante, profil lissé.', 'ok'); altDialog(); } }, { label: 'Vue 3D', onClick: view3D }] : []),
      { label: 'Fermer', cls: 'primary' }]);
  const chg = () => { t.start = m.querySelector('#alStart').value; t.speed = Math.max(3, +m.querySelector('#alSpeed').value || 30); t.slope = m.querySelector('#alSlope').checked; t.exp = m.querySelector('#alExp').checked; save(); altDialog(); };
  ['#alStart', '#alSpeed', '#alSlope', '#alExp'].forEach(q => m.querySelector(q).onchange = chg);
  m.querySelectorAll('.alSS').forEach(el => el.onchange = () => { const v = +el.value; if (v > 0) t.ss[el.dataset.i] = v; else delete t.ss[el.dataset.i]; save(); altDialog(); });
}
function view3D() {
  if (!eleValid()) return;
  const m = openModal('Aperçu 3D', `<canvas id="c3" width="640" height="400" style="width:100%;background:#f3efe4;border-radius:8px;cursor:grab;touch-action:none"></canvas>
    <label style="display:block;margin-top:6px">Relief exagéré ×<input type="range" id="ex3" min="1" max="15" value="5" style="vertical-align:middle"> <span id="exv">5</span></label>
    <label style="display:block;margin-top:4px">Zoom <input type="range" id="zm3" min="0.5" max="12" step="0.1" value="1" style="vertical-align:middle"> <span id="zmv">1</span> × <button type="button" id="zr3" style="margin-left:6px">Recentrer</button></label>
    <div class="help" style="margin:4px 0 0">Glisse pour tourner · molette ou pincement pour zoomer · Maj + glisser (ou deux doigts) pour déplacer · double-clic : recentrer.</div>`, ['sp', { label: 'Fermer', cls: 'primary' }]);
  const cv = m.querySelector('#c3'), cx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const N = Math.min(500, Math.max(20, Math.round(T.L / 60))), P = [];
  for (let k = 0; k <= N; k++) { const s = T.L * k / N, p = pointAt(s); P.push([p[0], p[1], eleAt(Math.min(s, S.ele.step * (S.ele.v.length - 1)))]); }
  const mx = P.reduce((a, p) => a + p[0], 0) / P.length, my = P.reduce((a, p) => a + p[1], 0) / P.length, z0 = Math.min(...P.map(p => p[2])), z1 = Math.max(...P.map(p => p[2]));
  const ext = Math.max(1, ...P.map(p => Math.hypot(p[0] - mx, p[1] - my)));
  let yaw = 0.6, pitch = 0.9, ex = 5, zm = 1, panX = 0, panY = 0;
  const draw = () => {
    cx.clearRect(0, 0, W, H);
    const sc = Math.min(W, H) * 0.62 / ext * zm, cy_ = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp_ = Math.sin(pitch);
    const proj = (x, y, z) => { const a = (x - mx) * cy_ - (y - my) * sy, b = (x - mx) * sy + (y - my) * cy_; return [W / 2 + panX + a * sc, H * 0.55 + panY + (-b * sp_ + -(z - z0) * ex * cp + (z1 - z0) * ex * cp / 2) * sc]; };
    cx.lineWidth = 2; cx.strokeStyle = 'rgba(0,0,0,.18)'; cx.beginPath();
    P.forEach((p, i) => { const q = proj(p[0], p[1], z0); i ? cx.lineTo(q[0], q[1]) : cx.moveTo(q[0], q[1]); }); cx.stroke();
    cx.strokeStyle = 'rgba(0,0,0,.08)'; cx.beginPath(); P.forEach((p, i) => { if (i % 6) return; const a = proj(p[0], p[1], z0), b = proj(p[0], p[1], p[2]); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); }); cx.stroke();
    cx.lineWidth = 3.5; cx.lineCap = 'round';
    for (let i = 1; i < P.length; i++) { const a = proj(P[i - 1][0], P[i - 1][1], P[i - 1][2]), b = proj(P[i][0], P[i][1], P[i][2]), t = z1 > z0 ? (P[i][2] - z0) / (z1 - z0) : 0; cx.strokeStyle = `hsl(${Math.round(210 - 210 * t)} 75% 45%)`; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); }
    const s0 = proj(P[0][0], P[0][1], P[0][2]), e0 = proj(P[P.length - 1][0], P[P.length - 1][1], P[P.length - 1][2]);
    cx.fillStyle = '#2f9e44'; cx.beginPath(); cx.arc(s0[0], s0[1], 6, 0, 7); cx.fill(); cx.fillStyle = '#c0392b'; cx.beginPath(); cx.arc(e0[0], e0[1], 6, 0, 7); cx.fill();
  };
  const ptr = new Map(); let last = null, pinch = null;
  const setZoom = (z, fx, fy) => {      // zoom centré sur le point (fx, fy) du canevas (par défaut le centre)
    z = clamp(z, 0.5, 12); fx = fx == null ? W / 2 : fx; fy = fy == null ? H * 0.55 : fy;
    const r = z / zm; panX = fx - W / 2 - (fx - W / 2 - panX) * r; panY = fy - H * 0.55 - (fy - H * 0.55 - panY) * r;
    zm = z; m.querySelector('#zm3').value = z; m.querySelector('#zmv').textContent = z.toFixed(1); draw();
  };
  const reset3 = () => { panX = panY = 0; setZoom(1); };
  const cpos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  cv.onpointerdown = e => { ptr.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; if (ptr.size === 2) { const [p1, p2] = [...ptr.values()]; pinch = { d: Math.hypot(p1[0] - p2[0], p1[1] - p2[1]), c: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] }; } };
  cv.onpointermove = e => {
    if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size >= 2 && pinch) {
      const [p1, p2] = [...ptr.values()], d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]), c = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], r = cv.getBoundingClientRect(), k = W / r.width;
      panX += (c[0] - pinch.c[0]) * k; panY += (c[1] - pinch.c[1]) * k;
      setZoom(zm * d / (pinch.d || d), (c[0] - r.left) * k, (c[1] - r.top) * (H / r.height)); pinch = { d, c }; return;
    }
    if (!last) return; const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY];
    if (e.shiftKey || e.buttons === 2 || e.buttons === 4) { const r = cv.getBoundingClientRect(); panX += dx * W / r.width; panY += dy * H / r.height; }
    else { yaw += dx * 0.01; pitch = clamp(pitch + dy * 0.01, 0.1, 1.45); }
    draw();
  };
  cv.onpointerup = cv.onpointercancel = e => { ptr.delete(e.pointerId); pinch = null; last = ptr.size ? [...ptr.values()][0] : null; if (!ptr.size) cv.style.cursor = 'grab'; };
  cv.addEventListener('wheel', e => { e.preventDefault(); const q = cpos(e); setZoom(zm * Math.exp(-e.deltaY * 0.0015), q[0], q[1]); }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.ondblclick = reset3; m.querySelector('#zr3').onclick = reset3;
  m.querySelector('#zm3').oninput = e => setZoom(+e.target.value);
  m.querySelector('#ex3').oninput = e => { ex = +e.target.value; m.querySelector('#exv').textContent = ex; draw(); };
  draw();
}
/* ---- mesure des caps (depuis le nord) et liste des virages ---- */
let measOn = false, measRes = null, measCache = null, measBack = false;
const measLayer = L.layerGroup().addTo(map);
const cap3 = x => String(Math.round(norm360(x)) % 360).padStart(3, '0') + '°';
const measWi = () => +$('#measWi').value || 30, measWo = () => +$('#measWo').value || 30, measThr = () => +$('#measThr').value || 30;
function bendAt(s, wi, wo) {      // cap d'arrivée : de s−wi à s−3 m ; cap de sortie : de s+3 m à s+wo (3 m de marge autour du coude)
  const g = Math.min(3, wi / 4, wo / 4);
  const a = trackBearing(Math.max(0, s - wi), Math.max(0, s - g)), b = trackBearing(Math.min(T.L, s + g), Math.min(T.L, s + wo));
  // l'angle du virage (information et seuil de la liste) est toujours mesuré sur 30 m de chaque côté : la liste ne change pas quand on règle les distances des caps
  const a2 = trackBearing(Math.max(0, s - 30), Math.max(0, s - g)), b2 = trackBearing(Math.min(T.L, s + g), Math.min(T.L, s + 30));
  return { s, inn: a, out: b, ang: angDiff(a2, b2) };
}
function bendList(wi, wo, thr) {      // repérage des coudes sur 30 m de chaque côté (une sortie longue noierait le coude) ; les caps affichés utilisent les distances réglées
  const di = 30, dO = 30, key = trackSig(S.ll) + '|' + wi + '|' + wo + '|' + thr;
  if (measCache && measCache.key === key) return measCache.list;
  const list = []; let run = null;
  for (let s = di; s <= T.L - dO; s += 4) {
    const b = bendAt(s, di, dO);
    if (Math.abs(b.ang) >= thr) { if (!run || Math.abs(b.ang) > Math.abs(run.ang)) run = b; }
    else if (run) { list.push(run); run = null; }
  }
  if (run) list.push(run);
  for (let i = 0; i < list.length; i++) {
    let best = list[i];
    for (let t = Math.max(di, list[i].s - 4); t <= Math.min(T.L - dO, list[i].s + 4); t += 1) { const b = bendAt(t, di, dO); if (Math.abs(b.ang) > Math.abs(best.ang)) best = b; }
    list[i] = bendAt(best.s, wi, wo);
  }
  measCache = { key, list }; return list;
}
function renderMeasList() {
  if (!T || T.L < 130) { $('#measList').innerHTML = ''; return; }
  const noOnly = $('#measNo').checked, lst = bendList(measWi(), measWo(), measThr());
  const rows = lst.map(b => ({ b, note: S.notes.findIndex(n => Math.abs(n.s - b.s) < 40) })).filter(r => !noOnly || r.note < 0);
  const nNo = lst.filter(b => !S.notes.some(n => Math.abs(n.s - b.s) < 40)).length;
  $('#measList').innerHTML = `<div style="margin:6px 0 3px"><b>${lst.length}</b> virage${lst.length > 1 ? 's' : ''} · <b style="color:#c0392b">${nNo}</b> sans note</div>
    <div style="max-height:34vh;overflow:auto"><table class="stTab" style="font-size:12px"><tr><th>km</th><th>arrivée → sortie</th><th>virage</th><th></th></tr>${rows.map(r => `<tr class="measRow" data-s="${r.b.s.toFixed(1)}" style="cursor:pointer"><td>${km(r.b.s)}</td><td>${cap3(r.b.inn)} → <b>${cap3(r.b.out)}</b></td><td>${Math.round(Math.abs(r.b.ang))}° ${r.b.ang > 0 ? '↱' : '↰'}</td><td>${r.note >= 0 ? '<span title="Note ' + (r.note + 1) + '" style="color:#2f9e44">● ' + (r.note + 1) + '</span>' : '<span style="color:#c0392b" title="Pas de note">○</span>'}</td></tr>`).join('') || '<tr><td colspan="4" style="color:#8a8478">Aucun virage.</td></tr>'}</table></div>`;
  $('#measList').querySelectorAll('.measRow').forEach(el => el.onclick = () => { const s = +el.dataset.s, p = inv(...pointAt(s)); map.setView(p, Math.max(map.getZoom(), measWo() > 100 ? 15 : 16)); showMeasure(s); });
}
function showMeasure(s, target) {
  const wi = measWi(), wo = measWo(); measLayer.clearLayers();
  const r = measRes = bendAt(s, wi, wo); r.target = target || null; const p = pointAt(s), P = q => inv(q[0], q[1]);
  const far = (deg, d) => [p[0] + Math.sin(deg * D2R) * d, p[1] + Math.cos(deg * D2R) * d], ext = Math.max(wo, wi) * 1.2;
  L.polyline([P(far(0, ext)), P(p)], { color: '#555', weight: 2, dashArray: '4 4', interactive: false }).addTo(measLayer);
  L.polyline([P(pointAt(Math.max(0, s - wi))), P(p)], { color: '#1f6feb', weight: 5, opacity: 0.9, interactive: false }).addTo(measLayer);
  L.polyline([P(pointAt(Math.min(T.L, s + 3))), P(pointAt(Math.min(T.L, s + wo)))], { color: '#d6001c', weight: 5, opacity: 0.9, interactive: false }).addTo(measLayer);
  L.polyline([P(p), P(far(r.out, ext))], { color: '#d6001c', weight: 2, dashArray: '5 5', interactive: false }).addTo(measLayer);
  const lbl = (q, txt, col) => L.marker(P(q), { interactive: false, icon: L.divIcon({ className: 'measlbl', html: `<span style="color:${col}">${txt}</span>`, iconSize: [60, 18], iconAnchor: [30, 9] }) }).addTo(measLayer);
  lbl(far(0, ext * 1.08), 'N 000°', '#555'); lbl(far(r.out, ext * 1.08), cap3(r.out), '#d6001c');
  const a0 = pointAt(Math.max(0, s - wi)); lbl([a0[0] - Math.sin(r.inn * D2R) * 0.15 * wi, a0[1] - Math.cos(r.inn * D2R) * 0.15 * wi], cap3(r.inn), '#1f6feb');
  L.circleMarker(P(p), { radius: 5, color: '#1b1a17', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(measLayer);
  const ni = target ? S.notes.indexOf(target) : S.notes.findIndex(n => Math.abs(n.s - s) < 40);
  $('#measRes').innerHTML = `<div style="margin:6px 0"><div>Cap à suivre (sortie du coude) : <b style="font-size:26px;color:#d6001c">${cap3(r.out)}</b></div>
    <div>Cap d’arrivée : <b style="color:#1f6feb">${cap3(r.inn)}</b> · km ${km(s)}</div>
    <div style="color:#8a8478;font-size:12px">Virage de ${Math.round(Math.abs(r.ang))}° ${r.ang > 0 ? 'à droite' : 'à gauche'} (information)</div>
    <div class="row2"><button id="measApply">${ni >= 0 ? 'Mettre ' + cap3(r.out) + ' sur la note ' + (ni + 1) : 'Créer une note ici avec ' + cap3(r.out)}</button></div></div>`;
  $('#measApply').onclick = () => {
    if (ni >= 0) {
      const n = S.notes[ni], back = measBack; n.cap = Math.round(norm360(r.out)) % 360; n.showCap = true; n.edited = true; renderAll(); toast(`Note ${ni + 1} : cap ${cap3(n.cap)}.`, 'ok');
      if (target) { closeMeasure(); if (back) editNote(n.id); } else showMeasure(s);
    }
    else { const q = inv(...pointAt(s)); closeMeasure(); addManualNote({ lat: q[0], lng: q[1] }, Math.round(norm360(r.out)) % 360); }
  };
}
function measureAtLL(ll) {
  if (!T) return;
  const pr = projAll(fwd(ll.lat, ll.lng), 60); if (!pr.length) { toast('Clique plus près de la trace.', 'err'); return; }
  let s = pr.reduce((x, y) => y.d < x.d ? y : x).s, best = null;
  const di = 30, dO = 30;
  for (let t = Math.max(di, s - 15); t <= Math.min(T.L - dO, s + 15); t += 1) { const b = bendAt(t, di, dO); if (!best || Math.abs(b.ang) > Math.abs(best.ang)) best = b; }
  if (best && Math.abs(best.ang) >= 15) s = best.s;      // on se cale sur le coude le plus marqué à ±15 m du clic
  showMeasure(s);
}
function snapBend(s) {      // coude le plus marqué à ±15 m de s (si ≥ 15°)
  let best = null; const di = 30, dO = 30;
  for (let t = Math.max(di, s - 15); t <= Math.min(T.L - dO, s + 15); t += 1) { const b = bendAt(t, di, dO); if (!best || Math.abs(b.ang) > Math.abs(best.ang)) best = b; }
  return best && Math.abs(best.ang) >= 15 ? best.s : s;
}
function measureForNote(n, back) {      // clic sur la case CAP d'une note, ou bouton 📐 de l'éditeur : mesure au coude de la note et mise à jour de son cap
  if (!T) return;
  openMeasure(); measBack = !!back;
  const s = snapBend(clamp(n.s, 0, T.L)); map.setView(inv(...pointAt(s)), Math.max(map.getZoom(), 16));
  showMeasure(s, n);
}
function openMeasure() {
  if (!T) { toast('Charge ou dessine d’abord une trace.', 'err'); return; }
  if (drawing) setDrawing(false);
  measOn = true; $('#measBox').classList.add('show'); map.getContainer().classList.add('cutting'); $('#measRes').innerHTML = ''; renderMeasList();
}
function closeMeasure() { measOn = false; measBack = false; $('#measBox').classList.remove('show'); map.getContainer().classList.remove('cutting'); measLayer.clearLayers(); }
$('#measX').onclick = closeMeasure;
['#measWi', '#measWo', '#measThr', '#measNo'].forEach(q => $(q).onchange = () => { renderMeasList(); if (measRes) showMeasure(measRes.s, measRes.target); });
$('#layerTog').onclick = () => $('#layerBox').classList.toggle('open');
map.on('click', () => $('#layerBox').classList.remove('open'));
$('#bUndo').onclick = undo;
$('#bCut').onclick = () => setTool('cut');
$('#bRev').onclick = reverseCtrl;
$('#bMerge').onclick = () => $('#mergeIn').click();
$('#mergeIn').onchange = e => { const f = e.target.files[0]; if (f) mergeFile(f); e.target.value = ''; };
$('#bReduce').onclick = reduceDialog;
$('#bSel').onclick = () => setTool('sel');
$('#bSnap').onclick = () => { if (selR) snapSel(); else toast('Choisis d’abord un point de départ et un point d’arrivée avec « 👆 Sélectionner ».', 'err'); };
$('#bSnapMode').onclick = toggleSnap;
$('#bRedo').onclick = redo;
$('#bFree').onclick = () => setTool('free');
$('#bErase').onclick = () => setTool('erase');
$('#magMax').onchange = e => { S.magMax = +e.target.value; updSnapBtn(); save(); toast(S.magMax ? 'Aimant : ' + S.magMax + ' m maximum entre ton clic et la route.' : 'Aimant coupé : les points sont posés tels quels (le routage reste actif).', 'ok'); };
$('#routeMode').onchange = e => { S.routeMode = e.target.value; if (S.routeMode !== 'line') { S.prevRoute = S.routeMode; S.snapOn = true; } updSnapBtn(); save(); if (/^ors:/.test(S.routeMode) && !orsKey()) orsDialog(); };
$('#orsBtn').onclick = orsDialog;
$('#bGen').onclick = generate;
$('#bSave').onclick = saveProject;
$('#bUndo').onclick = () => { if (drawing) undo(); else undoAll(); };
$('#bExport').onclick = exportGPX;
$('#bPrint').onclick = printRB;
$('#rbName').addEventListener('input', e => { S.name = e.target.value; save(); });
$('#rb').addEventListener('input', e => { if (e.target.id === 'rbDesc') { S.desc = e.target.value; save(); } });
$('#bMore').onclick = e => {
  e.stopPropagation(); const m = $('#moreMenu'); m.classList.toggle('open');
  m.style.right = m.style.left = '';      // le menu s'aligne à droite du bouton ; si le bouton passe à la ligne et se retrouve à gauche, on le recale dans l'écran
  if (m.classList.contains('open')) { let r = m.getBoundingClientRect(); if (r.left < 8) { m.style.right = 'auto'; m.style.left = '0px'; r = m.getBoundingClientRect(); if (r.right > innerWidth - 8) m.style.left = -(r.left - 8) + 'px'; } }
};
document.addEventListener('click', () => $('#moreMenu').classList.remove('open'));
$('#moreMenu').addEventListener('click', e => {
  const hd = e.target.closest('.mhd');      // titre de section : replie / déplie (une seule ouverte), sans fermer le menu
  if (hd) { e.stopPropagation(); const body = $('#g-' + hd.dataset.g), was = body.classList.contains('open');
    document.querySelectorAll('#moreMenu .mbody').forEach(x => x.classList.remove('open')); document.querySelectorAll('#moreMenu .car').forEach(x => { x.textContent = '▸'; });
    if (!was) { body.classList.add('open'); hd.querySelector('.car').textContent = '▾'; } return; }
  const a = e.target.closest('button[data-act]'); if (!a) return;
  $('#moreMenu').classList.remove('open');
  const act = a.dataset.act;
  if (act === 'settings') openSettings();
  else if (act === 'stages') stagesDialog();
  else if (act === 'marks') marksDialog();
  else if (act === 'ctl') controlDialog();
  else if (act === 'alt') altDialog();
  else if (act === 'meas') openMeasure();
  else if (act === 'saveProject') saveProject();
  else if (act === 'saveOsm') saveOsm();
  else if (act === 'loadOsm') $('#fileIn').click();
  else if (act === 'theme') cycleTheme();
  else if (act === 'help') openHelp();
  else if (act === 'report') { let r = null; try { r = JSON.parse(localStorage.getItem('rbgen.report')); } catch (_) { } if (r && r.html) showReport(r.title, r.html); else toast('Aucun rapport : génère d’abord le roadbook.'); }
  else if (act === 'manual') window.open((location.protocol === 'file:' ? 'https://roadbookreader.github.io/RoadBook-Creator/manuel/' : 'manuel/') + (I18N.lang === 'en' ? 'en.html' : ''), '_blank');
  else if (act === 'new') ask('Nouveau roadbook ?', 'Le parcours et les notes en cours seront effacés (pense à exporter ou enregistrer le projet avant).', 'Tout effacer', () => {
    if (drawing) setDrawing(false);
    S.stages = []; S.ele = null; S.marks = []; renderMarks(); candLayer.clearLayers();
    S.name = 'Mon roadbook'; S.desc = ''; S.dataSrc = ''; S.dataSrcN = ''; S.src = ''; S.ctrl = []; S.segs = []; S.notes = []; S.stale = false; S.sel = null;
    $('#rbName').value = S.name; setTrack([], true); renderAll();
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#modalBg').classList.contains('show')) cancelModal(); else if (drawing) setDrawing(false); }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName) || (e.target && e.target.isContentEditable);
  if (!drawing && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && !$('#modalBg').classList.contains('show')) { e.preventDefault(); undoAll(); }
  if (drawing && (e.ctrlKey || e.metaKey) && !typing && !$('#modalBg').classList.contains('show')) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  }
  if (drawing && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'r' && !$('#modalBg').classList.contains('show')) { e.preventDefault(); toggleSnap(); }
  if (drawing && e.code === 'Space' && !typing && !$('#modalBg').classList.contains('show')) { e.preventDefault(); if (!spaceDown) { spaceDown = true; setCursorCls(); } }
});
document.addEventListener('keyup', e => { if (e.code === 'Space' && spaceDown) { spaceDown = false; setCursorCls(); } });
// glisser-déposer
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#dropHint').classList.add('show'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropHint').classList.remove('show'); });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#dropHint').classList.remove('show'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

// démarrage : reprise du dernier travail
(function init() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { restore(JSON.parse(raw)); $('#rbName').value = S.name; } } catch (e) { console.warn(e); }
  if (!(S.notes.length || S.ll.length)) ProjDB.get().then(raw => { if (!raw || S.notes.length || S.ll.length) return; try { restore(JSON.parse(raw)); ProjDB.has = true; $('#rbName').value = S.name; $('#routeMode').value = S.routeMode; histPush(raw); renderRoadbook(); renderMarkers(); renderTrack(true); renderInfo(); } catch (e) { console.warn(e); } });      // reprise d'un gros projet gardé dans IndexedDB
  $('#routeMode').value = S.routeMode; updSnapBtn();
  try { setDirty(localStorage.getItem('rbgen.dirty') === '1'); } catch (e) { }
  if (S.notes.length || S.ll.length) histPush(JSON.stringify(snapshot()));
  renderRoadbook(); renderMarkers(); renderTrack(true); renderInfo();
})();

// accès pour les tests automatisés
window.__rb = { trNote, noteView, svgToPNG, tulipSVG, pointAt, inv, tulipEditor, measureForNote, openMeasure, measureAtLL, bendList, bendAt, editNote, altDialog, view3D, cleanEle, timeSeries, timeAt, buildGPX, stagesDialog, stageList, addStage, marksDialog, markForm, pickTrack, parseGPX, cutAt, reverseCtrl, mergeFile, reduceDialog, snapDialog, cleanEnds, rebuildFromSegs, S, map, get T() { return T; }, get G() { return G; }, generate: runGenerate, buildGPX, loadText: (txt, name) => loadFile(new File([txt], name || 'test.gpx')), tulipSVG, openSettings, followRoad, ringCircle, dxy, allIGN, importOsm, noteView, addManualNote, notesSVG, renderAll, renderRadii, noteRadii };
I18N.onSet(() => { applyNoteLang(); if (S.notes && S.notes.length) { renderRoadbook(); save(); } });      // la langue des notes suit celle de l'interface
})();

// Version installable (PWA) : actif seulement quand la page est servie en https (pas en fichier local)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- thème de l'interface (Dakar jour / Bivouac nuit) ----------
const THEMES = [['day', 'Dakar jour'], ['night', 'Bivouac nuit']];
function applyTheme(t) {
  if (!THEMES.some(x => x[0] === t)) t = 'day';
  document.body.dataset.theme = t;
  const el = document.getElementById('themeName'); if (el) el.textContent = THEMES.find(x => x[0] === t)[1];
}
function cycleTheme() {
  const cur = document.body.dataset.theme || 'day';
  const nt = cur === 'day' ? 'night' : 'day';
  try { localStorage.setItem('rbgen.theme', nt); } catch (e) {}
  applyTheme(nt);
}
try { applyTheme(localStorage.getItem('rbgen.theme') || 'day'); } catch (e) { applyTheme('day'); }
