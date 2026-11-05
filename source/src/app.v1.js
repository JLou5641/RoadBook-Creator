/* Générateur de Roadbook — tulipes automatiques depuis les chemins OpenStreetMap
   Export GPX OpenRally v1.0.3 (tulipes et notes en PNG base64, cap, waypoints). */
(function () {
'use strict';

/* ============================================================
   1. Outils & géométrie
   ============================================================ */
const $ = s => document.querySelector(s);
const R_EARTH = 6371008.8, D2R = Math.PI / 180;
const CELL = 50;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => ((b - a) % 360 + 540) % 360 - 180;   // b - a dans [-180,180)
const norm360 = a => ((a % 360) + 360) % 360;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const km = m => (Math.max(0, m) / 1000).toFixed(2);
const kmFr = m => km(m).replace('.', ',');
const pad3 = n => String(Math.round(n) % 360).padStart(3, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dxy = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const bxy = (a, b) => norm360(Math.atan2(b[0] - a[0], b[1] - a[1]) / D2R);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const cellKey = (ix, iy) => ix * 1e6 + iy;
const cellOf = p => [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)];

function haversine(a, b) {
  const p1 = a[0] * D2R, p2 = b[0] * D2R, dp = p2 - p1, dl = (b[1] - a[1]) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}
// Plan local (équirectangulaire centré sur le parcours) : x = est, y = nord, en mètres
let PL = { lat0: 46, lon0: 2, kx: Math.cos(46 * D2R) * D2R * R_EARTH, ky: D2R * R_EARTH };
function setPlane(lat0, lon0) { const ky = D2R * R_EARTH; PL = { lat0, lon0, ky, kx: Math.cos(lat0 * D2R) * ky }; }
const fwd = (lat, lon) => [(lon - PL.lon0) * PL.kx, (lat - PL.lat0) * PL.ky];
const inv = (x, y) => [PL.lat0 + y / PL.ky, PL.lon0 + x / PL.kx];

function segProj(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  return { t, d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), q: [a[0] + t * dx, a[1] + t * dy] };
}
function clipSeg(a, b, R) {             // portion du segment [a,b] dans le cercle (0,0,R)
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const A = dx * dx + dy * dy, B = 2 * (a[0] * dx + a[1] * dy), C = a[0] * a[0] + a[1] * a[1] - R * R;
  if (A < 1e-12) return C <= 0 ? [a, b] : null;
  const disc = B * B - 4 * A * C; if (disc <= 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - sq) / (2 * A)), t1 = Math.min(1, (-B + sq) / (2 * A));
  if (t0 >= t1) return null;
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}
function clipPoly(pts, R) {
  const out = []; let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const c = clipSeg(pts[i], pts[i + 1], R);
    if (!c) { if (cur) { out.push(cur); cur = null; } continue; }
    if (cur && dxy(cur[cur.length - 1], c[0]) < 1e-6) cur.push(c[1]);
    else { if (cur) out.push(cur); cur = [c[0], c[1]]; }
  }
  if (cur) out.push(cur);
  return out;
}
const polyLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += dxy(pts[i - 1], pts[i]); return L; };
function simplifyDP(pts, tol) {         // Douglas-Peucker, renvoie les indices gardés
  const n = pts.length; if (n < 3) return pts.map((_, i) => i);
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = segProj(pts[i], pts[a], pts[b]).d; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

/* ============================================================
   2. État & sauvegarde
   ============================================================ */
const DEF_SETTINGS = { tol: 20, merge: 30, tulipR: 50, straight: true, bends: true, bendAngle: 100, goudron: true, foot: false, showCap: true };
const S = {
  name: 'Mon roadbook', src: '', ll: [], ctrl: [], segs: [], notes: [], settings: { ...DEF_SETTINGS },
  stale: false, routeMode: 'trekking', nextId: 1, sel: null
};
let T = null;    // parcours dérivé : {xy, cum, L, grid}
let G = null;    // réseau OSM : {nodes, ways, key}
const LS_KEY = 'rbgen.v1';
let saveTimer = null, saveWarned = false;

function snapshot() {
  return { v: 1, name: S.name, src: S.src, ll: S.ll, ctrl: S.ctrl, segs: S.segs, notes: S.notes, settings: S.settings,
    stale: S.stale, routeMode: S.routeMode, nextId: S.nextId };
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot())); }
    catch (e) { if (!saveWarned) { saveWarned = true; toast('Sauvegarde auto impossible (projet trop gros) : utilise « Enregistrer le projet ».'); } }
  }, 500);
}
function restore(o) {
  S.name = o.name || 'Mon roadbook'; S.src = o.src || ''; S.ctrl = o.ctrl || []; S.segs = o.segs || [];
  S.notes = o.notes || []; S.settings = { ...DEF_SETTINGS, ...(o.settings || {}) }; S.stale = !!o.stale;
  S.routeMode = o.routeMode || 'trekking'; S.nextId = o.nextId || (Math.max(0, ...S.notes.map(n => n.id)) + 1); S.sel = null;
  for (let i = 1; i < S.ctrl.length; i++) if (S.segs[i - 1]) routeCache.set(segKey(S.ctrl[i - 1], S.ctrl[i], S.ctrl[i][2]), S.segs[i - 1]);
  G = null;
  setTrack(o.ll || [], true);
}

/* ============================================================
   3. Parcours (trace)
   ============================================================ */
function setTrack(ll, silent) {
  const f = [];
  for (const p of ll) {
    if (!isFinite(p[0]) || !isFinite(p[1])) continue;
    const q = [+(+p[0]).toFixed(6), +(+p[1]).toFixed(6)];
    if (!f.length || haversine(f[f.length - 1], q) >= 2) f.push(q);
  }
  const changed = trackSig(f) !== trackSig(S.ll);
  S.ll = f;
  buildDerived();
  if (changed && !silent && S.notes.length) S.stale = true;
  renderTrack();
  renderInfo();
  if (!silent) save();
}
function trackSig(ll) {
  if (!ll.length) return '0';
  let h = 0; for (let i = 0; i < ll.length; i += Math.max(1, ll.length >> 6)) h = (h * 31 + Math.round(ll[i][0] * 1e5) + Math.round(ll[i][1] * 1e5)) | 0;
  return ll.length + ':' + h + ':' + ll[ll.length - 1].join(',');
}
function buildDerived() {
  if (S.ll.length < 2) { T = null; return; }
  let a = 90, b = -90, c = 180, d = -180;
  for (const p of S.ll) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }
  setPlane((a + b) / 2, (c + d) / 2);
  G = null;   // le plan a changé : le réseau sera recalculé
  const xy = [], src = S.ll.map(p => fwd(p[0], p[1]));
  xy.push(src[0]);
  for (let i = 1; i < src.length; i++) {
    const p = src[i - 1], q = src[i], L = dxy(p, q), n = Math.ceil(L / 15);
    for (let k = 1; k < n; k++) xy.push(lerp(p, q, k / n));
    xy.push(q);
  }
  const cum = new Float64Array(xy.length);
  for (let i = 1; i < xy.length; i++) cum[i] = cum[i - 1] + dxy(xy[i - 1], xy[i]);
  const grid = new Map();
  for (let i = 0; i < xy.length - 1; i++) {
    const c1 = cellOf(xy[i]), c2 = cellOf(xy[i + 1]);
    for (let ix = Math.min(c1[0], c2[0]); ix <= Math.max(c1[0], c2[0]); ix++)
      for (let iy = Math.min(c1[1], c2[1]); iy <= Math.max(c1[1], c2[1]); iy++) {
        const k = cellKey(ix, iy); let arr = grid.get(k); if (!arr) grid.set(k, arr = []); arr.push(i);
      }
  }
  T = { xy, cum, L: cum[cum.length - 1], grid };
}
function pointAt(s) {
  const { xy, cum } = T; s = clamp(s, 0, T.L);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const L = cum[hi] - cum[lo];
  return L > 0 ? lerp(xy[lo], xy[hi], (s - cum[lo]) / L) : xy[lo].slice();
}
function trackBearing(s1, s2) {
  s1 = clamp(s1, 0, T.L); s2 = clamp(s2, 0, T.L);
  if (Math.abs(s2 - s1) < 1) { const m = clamp(s1, 1, T.L - 1); return bxy(pointAt(m - 1), pointAt(m + 1)) + (s2 < s1 ? 180 : 0); }
  return bxy(pointAt(s1), pointAt(s2));
}
function projAll(p, maxD) {      // toutes les projections de p sur la trace à moins de maxD
  const r = Math.ceil(maxD / CELL), [cx, cy] = cellOf(p), seen = new Set(), out = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const arr = T.grid.get(cellKey(cx + i, cy + j)); if (!arr) continue;
    for (const k of arr) {
      if (seen.has(k)) continue; seen.add(k);
      const pr = segProj(p, T.xy[k], T.xy[k + 1]);
      if (pr.d <= maxD) out.push({ s: T.cum[k] + pr.t * (T.cum[k + 1] - T.cum[k]), d: pr.d });
    }
  }
  out.sort((a, b) => a.s - b.s);
  return out;
}
function passes(p, maxD) {        // passages distincts de la trace près de p
  const out = []; let cur = null;
  for (const x of projAll(p, maxD)) {
    if (cur && x.s - cur.last < 60) { if (x.d < cur.d) { cur.d = x.d; cur.s = x.s; } cur.last = x.s; }
    else { if (cur) out.push(cur); cur = { s: x.s, d: x.d, last: x.s }; }
  }
  if (cur) out.push(cur);
  return out;
}
function nearestS(p, sExp, win, maxD) {
  let best = null;
  for (const c of projAll(p, maxD)) { if (Math.abs(c.s - sExp) > win) continue; if (!best || c.d < best.d) best = c; }
  return best ? best.s : null;
}
const tolEff = () => S.src === 'draw' ? Math.min(S.settings.tol, 12) : S.settings.tol;

/* ============================================================
   4. Lecture GPX
   ============================================================ */
function parseGPX(txt) {
  const doc = new DOMParser().parseFromString(txt, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Fichier GPX illisible.');
  const get = (root, n) => Array.from(root.getElementsByTagNameNS('*', n));
  let pts = get(doc, 'trkpt'); if (!pts.length) pts = get(doc, 'rtept');
  const ll = pts.map(e => [parseFloat(e.getAttribute('lat')), parseFloat(e.getAttribute('lon'))]).filter(p => isFinite(p[0]) && isFinite(p[1]));
  const md = get(doc, 'metadata')[0], trk = get(doc, 'trk')[0] || get(doc, 'rte')[0];
  const nm = (md && md.getElementsByTagNameNS('*', 'name')[0]) || (trk && trk.getElementsByTagNameNS('*', 'name')[0]);
  return { ll, name: nm ? nm.textContent.trim() : '', wpts: get(doc, 'wpt').length };
}

/* ============================================================
   5. Carte
   ============================================================ */
const map = L.map('map', { preferCanvas: true, zoomControl: true, maxZoom: 19 }).setView([46.6, 2.4], 6);
const LAYERS = {
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxNativeZoom: 17, maxZoom: 19, attribution: '© contributeurs OpenStreetMap, SRTM | style © OpenTopoMap (CC-BY-SA)' }),
  cyclosm: L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 19, attribution: '© contributeurs OpenStreetMap | CyclOSM' }),
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© contributeurs OpenStreetMap' }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, maxZoom: 19, attribution: 'Imagerie © Esri' })
};
let curLayer = LAYERS.topo.addTo(map);
$('#layerSel').addEventListener('change', e => { map.removeLayer(curLayer); curLayer = LAYERS[e.target.value].addTo(map); try { localStorage.setItem('rbgen.layer', e.target.value); } catch (_) {} });
try { const l = localStorage.getItem('rbgen.layer'); if (l && LAYERS[l]) { $('#layerSel').value = l; map.removeLayer(curLayer); curLayer = LAYERS[l].addTo(map); } } catch (_) {}

const casing = L.polyline([], { color: '#fff', weight: 8, opacity: 0.85, interactive: false }).addTo(map);
const line = L.polyline([], { color: '#e4572e', weight: 4.5, opacity: 0.95, interactive: false }).addTo(map);
const hit = L.polyline([], { weight: 22, opacity: 0, bubblingMouseEvents: false }).addTo(map);
const noteLayer = L.layerGroup().addTo(map);
const ctrlLayer = L.layerGroup().addTo(map);
const markers = new Map();

function renderTrack(fit) {
  casing.setLatLngs(S.ll); line.setLatLngs(S.ll); hit.setLatLngs(S.ll);
  if (fit && S.ll.length > 1) map.fitBounds(line.getBounds(), { padding: [40, 40] });
}
function noteIcon(n, i) {
  const cls = 'nmk' + (n.id === S.sel ? ' sel' : n.wp ? ' wp' : (n.kind === 'start' || n.kind === 'end') ? ' se' : '');
  return L.divIcon({ className: cls, html: String(i + 1), iconSize: [24, 24] });
}
function renderMarkers() {
  noteLayer.clearLayers(); markers.clear();
  S.notes.forEach((n, i) => {
    const m = L.marker([n.lat, n.lon], { icon: noteIcon(n, i), keyboard: false, riseOnHover: true });
    m.bindTooltip(() => `<div style="display:flex;gap:8px;align-items:center">${tulipSVG(n.tulip, 86)}<div><b>${i + 1} · ${km(n.s)} km</b><br>${esc(n.text).replace(/\n/g, '<br>')}</div></div>`, { direction: 'top', offset: [0, -12], opacity: 1 });
    m.on('click', () => selectNote(n.id, 'map'));
    m.addTo(noteLayer); markers.set(n.id, m);
  });
}
function refreshMarkerIcons() { S.notes.forEach((n, i) => { const m = markers.get(n.id); if (m) m.setIcon(noteIcon(n, i)); }); }

hit.on('click', e => {
  if (drawing) addCtrl([e.latlng.lat, e.latlng.lng]);
  else addManualNote(e.latlng);
});
map.on('click', e => { if (drawing) addCtrl([e.latlng.lat, e.latlng.lng]); });

/* ============================================================
   6. Mode dessin & itinéraire
   ============================================================ */
let drawing = false;
const routeCache = new Map();
let routeGen = 0, routing = 0;
const segKey = (a, b, mode) => (mode || 'line') + '|' + a[0].toFixed(6) + ',' + a[1].toFixed(6) + '|' + b[0].toFixed(6) + ',' + b[1].toFixed(6);

function setDrawing(on) {
  drawing = on;
  $('#bDraw').classList.toggle('on', on);
  $('#drawBox').classList.toggle('show', on);
  map.getContainer().classList.toggle('drawing', on);
  $('#routeMode').value = S.routeMode;
  renderCtrl(); renderInfo();
}
function renderCtrl() {
  ctrlLayer.clearLayers();
  if (!drawing) return;
  S.ctrl.forEach((c, i) => {
    const m = L.marker([c[0], c[1]], { draggable: true, keyboard: false, icon: L.divIcon({ className: 'cpt' + (i === 0 ? ' first' : ''), iconSize: [16, 16] }) });
    m.on('dragend', () => { const p = m.getLatLng(); S.ctrl[i] = [p.lat, p.lng, S.ctrl[i][2]]; reroute(); });
    m.on('click', () => { S.ctrl.splice(i, 1); if (i === 0 && S.ctrl.length) S.ctrl[0][2] = null; renderCtrl(); reroute(); });
    m.addTo(ctrlLayer);
  });
}
function addCtrl(p) {
  S.ctrl.push([+p[0].toFixed(6), +p[1].toFixed(6), S.ctrl.length ? S.routeMode : null]);
  S.src = 'draw';
  renderCtrl(); reroute();
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
  const ll = [];
  if (S.ctrl.length === 1) ll.push(S.ctrl[0].slice(0, 2));
  for (let i = 1; i < S.ctrl.length; i++) {
    const seg = S.segs[i - 1] || [S.ctrl[i - 1].slice(0, 2), S.ctrl[i].slice(0, 2)];
    for (let k = ll.length ? 1 : 0; k < seg.length; k++) ll.push(seg[k]);
  }
  setTrack(ll);
}
async function fetchJSON(url, opts, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 30000);
  try {
    const r = await fetch(url, { ...(opts || {}), signal: ac.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}
let routeWarned = 0;
async function routeSeg(a, b, mode) {
  if (!mode || mode === 'line') return [a.slice(0, 2), b.slice(0, 2)];
  try {
    const url = `https://brouter.de/brouter?lonlats=${a[1].toFixed(6)},${a[0].toFixed(6)}|${b[1].toFixed(6)},${b[0].toFixed(6)}&profile=${encodeURIComponent(mode)}&alternativeidx=0&format=geojson`;
    const j = await fetchJSON(url, null, 25000);
    const c = j.features[0].geometry.coordinates;
    if (c.length >= 2) return [a.slice(0, 2), ...c.map(q => [+q[1].toFixed(6), +q[0].toFixed(6)]), b.slice(0, 2)];
  } catch (e) { /* on essaie le serveur de secours */ }
  try {
    const prof = mode === 'car-fast' ? 'routed-car' : mode === 'shortest' ? 'routed-foot' : 'routed-bike';
    const url = `https://routing.openstreetmap.de/${prof}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const j = await fetchJSON(url, null, 25000);
    const c = j.routes[0].geometry.coordinates;
    if (c.length >= 2) return [a.slice(0, 2), ...c.map(q => [+q[1].toFixed(6), +q[0].toFixed(6)]), b.slice(0, 2)];
  } catch (e) { /* ligne droite */ }
  if (Date.now() - routeWarned > 8000) { routeWarned = Date.now(); toast('Itinéraire indisponible (pas d’internet ?) : tracé en ligne droite.', 'err'); }
  return [a.slice(0, 2), b.slice(0, 2)];
}

/* ============================================================
   7. Réseau de chemins OSM (Overpass)
   ============================================================ */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const PAVED_SURF = /^(paved|asphalt|concrete|concrete:plates|concrete:lanes|paving_stones|sett|cobblestone|unhewn_cobblestone|chipseal|metal|bricks)$/;
const UNPAVED_SURF = /^(unpaved|gravel|fine_gravel|dirt|ground|grass|compacted|sand|earth|mud|pebblestone|rock|rocks|wood|woodchips|clay|stone|grass_paver|salt|snow|ice|shells)$/;
function catOf(t) {
  const hw = t.highway || '', sf = (t.surface || '').split(';')[0];
  if (hw === 'track') { if (PAVED_SURF.test(sf)) return 'road'; return /^grade[45]$/.test(t.tracktype || '') ? 'trail' : 'track'; }
  if (/^(path|footway|bridleway|cycleway|steps|pedestrian)$/.test(hw)) return 'trail';
  return UNPAVED_SURF.test(sf) ? 'track' : 'road';
}
function wayLabel(w) {
  const t = w.tags, hw = t.highway || '';
  if (w.cat === 'road') { const ref = t.ref ? ' ' + t.ref.split(';')[0] : ''; return (/^(residential|living_street|pedestrian)$/.test(hw) && !ref ? 'rue' : 'route') + ref; }
  if (w.cat === 'track') return 'piste';
  return hw === 'track' ? 'petite piste' : 'sentier';
}
async function overpass(q, isCancelled) {
  let lastErr = null;
  for (let round = 0; round < 2; round++) for (const ep of OVERPASS) {
    if (isCancelled()) throw new Error('annulé');
    try {
      const j = await fetchJSON(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 120000);
      if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) { lastErr = new Error(j.remark); continue; }
      return j;
    } catch (e) {
      lastErr = e;
      if (e.status === 429 || e.status === 504) await sleep(1500);
    }
  }
  throw lastErr || new Error('Serveur OSM indisponible');
}
function graphKey() { const s = S.settings; return trackSig(S.ll) + '|' + s.foot + '|' + tolEff() + '|' + s.tulipR; }
async function fetchOSM(progress, isCancelled) {
  const key = graphKey();
  if (G && G.key === key) return G;
  const idx = simplifyDP(T.xy, 6), pts = idx.map(i => inv(T.xy[i][0], T.xy[i][1]));
  const radius = Math.round(Math.max(tolEff() + 12, S.settings.tulipR * 0.75));
  const base = 'corridor|elevator|platform|proposed|construction|abandoned|disused|razed|bus_stop|raceway|via_ferrata|escape|bus_guideway|emergency_bay|rest_area|services';
  const excl = S.settings.foot ? base : base + '|footway|steps|cycleway|pedestrian';
  const chunks = [], CH = 160;
  for (let i = 0; i < pts.length - 1; i += CH) chunks.push(pts.slice(i, Math.min(pts.length, i + CH + 1)));
  const els = new Map();
  for (let c = 0; c < chunks.length; c++) {
    progress(c, chunks.length);
    const coords = chunks[c].map(p => p[0].toFixed(6) + ',' + p[1].toFixed(6)).join(',');
    const q = `[out:json][timeout:110];way["highway"]["highway"!~"^(${excl})$"]["area"!="yes"]["service"!~"^(parking_aisle|driveway|drive-through|emergency_access)$"](around:${radius},${coords});out body;>;out skel qt;`;
    const j = await overpass(q, isCancelled);
    for (const e of j.elements || []) els.set(e.type[0] + e.id, e);
  }
  progress(chunks.length, chunks.length);
  G = buildGraph([...els.values()]); G.key = key;
  return G;
}
function buildGraph(els) {
  const nodes = new Map(), ways = [];
  for (const e of els) if (e.type === 'node') nodes.set(e.id, { id: e.id, lat: e.lat, lon: e.lon, xy: fwd(e.lat, e.lon), br: [] });
  for (const e of els) if (e.type === 'way' && e.nodes && e.nodes.length > 1) { const tags = e.tags || {}; ways.push({ id: e.id, nodes: e.nodes, tags, cat: catOf(tags) }); }
  for (const w of ways) {
    const n = w.nodes.length, closed = n > 2 && w.nodes[0] === w.nodes[n - 1];
    for (let i = 0; i < n; i++) {
      if (closed && i === n - 1) continue;
      const nd = nodes.get(w.nodes[i]); if (!nd) continue;
      if (i + 1 < n && w.nodes[i + 1] !== w.nodes[i]) nd.br.push({ way: w, i, dir: 1 });
      if (i - 1 >= 0 && w.nodes[i - 1] !== w.nodes[i]) nd.br.push({ way: w, i, dir: -1 });
      else if (i === 0 && closed) nd.br.push({ way: w, i: n - 1, dir: -1 });
    }
  }
  return { nodes, ways };
}
function buildSegGrid(g) {
  const grid = new Map();
  for (const w of g.ways) for (let i = 0; i < w.nodes.length - 1; i++) {
    const a = g.nodes.get(w.nodes[i]), b = g.nodes.get(w.nodes[i + 1]); if (!a || !b) continue;
    const n = Math.max(1, Math.ceil(dxy(a.xy, b.xy) / 20)), cells = new Set();
    for (let k = 0; k <= n; k++) { const c = cellOf(lerp(a.xy, b.xy, k / n)); cells.add(cellKey(c[0], c[1])); }
    for (const ck of cells) { let arr = grid.get(ck); if (!arr) grid.set(ck, arr = []); arr.push([w, i]); }
  }
  g.segGrid = grid;
}
function nearestWaySeg(g, p, maxD) {
  if (!g.segGrid) buildSegGrid(g);
  const r = Math.ceil(maxD / CELL), [cx, cy] = cellOf(p); let best = null;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const arr = g.segGrid.get(cellKey(cx + i, cy + j)); if (!arr) continue;
    for (const [w, k] of arr) {
      const a = g.nodes.get(w.nodes[k]), b = g.nodes.get(w.nodes[k + 1]);
      const pr = segProj(p, a.xy, b.xy);
      if (pr.d <= maxD && (!best || pr.d < best.d)) best = { w, k, d: pr.d, q: pr.q, a, b };
    }
  }
  return best;
}

/* ============================================================
   8. Analyse du parcours : intersections, virages, notes
   ============================================================ */
function walkSimple(g, n0, br, D) {      // suit une branche (traverse les nœuds simples) sur D mètres
  let cur = br, a = n0.xy, acc = 0, guard = 0;
  while (cur && guard++ < 300) {
    const w = cur.way, m = g.nodes.get(w.nodes[cur.i + cur.dir]); if (!m) break;
    const L = dxy(a, m.xy);
    if (acc + L >= D) return L ? lerp(a, m.xy, (D - acc) / L) : a;
    acc += L; a = m.xy;
    if (m.br.length !== 2) break;
    const fromId = w.nodes[cur.i];
    cur = m.br.find(b => !(b.way === w && b.way.nodes[b.i + b.dir] === fromId)) || null;
  }
  return acc > 0.5 ? a : null;
}
function guidedWalk(g, J, br, s0, sign, D) {   // suit le réseau dans le sens de la trace
  const out = [{ p: J.xy, c: br.way.cat }]; let cur = br, acc = 0, guard = 0;
  while (cur && acc < D && guard++ < 400) {
    const w = cur.way, n = g.nodes.get(w.nodes[cur.i + cur.dir]); if (!n) break;
    const a = out[out.length - 1].p, L = dxy(a, n.xy);
    if (acc + L >= D) { out.push({ p: lerp(a, n.xy, L ? (D - acc) / L : 0), c: w.cat }); break; }
    out.push({ p: n.xy, c: w.cat }); acc += L;
    const fromId = w.nodes[cur.i];
    const cands = n.br.filter(b => !(b.way === w && b.way.nodes[b.i + b.dir] === fromId));
    if (!cands.length) break;
    if (cands.length === 1) { cur = cands[0]; continue; }
    const sN = nearestS(n.xy, s0 + sign * acc, 80, tolEff() + 10);
    if (sN == null) break;
    const H = trackBearing(sN, sN + sign * 25);
    let best = null, bd = 999;
    for (const b of cands) { const e = walkSimple(g, n, b, 20); if (!e) continue; const d = Math.abs(angDiff(H, bxy(n.xy, e))); if (d < bd) { bd = d; best = b; } }
    if (!best || bd > 60) break;
    cur = best;
  }
  return out;
}
function detectEvents(g) {
  const tol = tolEff(), out = [];
  for (const n of g.nodes.values()) {
    const deg = n.br.length; let kind = null;
    if (deg >= 3) kind = 'junction';
    else if (deg === 2 && S.settings.goudron) {
      const w1 = n.br[0].way, w2 = n.br[1].way;
      if (w1 !== w2 && ((w1.cat === 'road') !== (w2.cat === 'road'))) kind = 'surface';
    }
    if (!kind) continue;
    for (const p of passes(n.xy, tol)) out.push({ node: n, s: p.s, d: p.d, kind });
  }
  return out;
}
function analyzeEvent(g, ev) {
  const J = ev.node, s = ev.s, tol = tolEff();
  const hInT = trackBearing(s - 30, s), hOutT = trackBearing(s, s + 30);
  const brs = [];
  for (const b of J.br) { const e = walkSimple(g, J, b, 20); if (!e || dxy(e, J.xy) < 1) continue; brs.push({ b, bear: bxy(J.xy, e), far: e }); }
  if (brs.length < 2) return null;
  const back = norm360(hInT + 180);
  let entry = null, ed = 999, exit = null, xd = 999;
  for (const x of brs) { const d = Math.abs(angDiff(back, x.bear)); if (d < ed) { ed = d; entry = x; } }
  for (const x of brs) { if (x === entry) continue; const d = Math.abs(angDiff(hOutT, x.bear)); if (d < xd) { xd = d; exit = x; } }
  if (!entry || !exit || ed > 50 || xd > 50) return null;
  // la trace doit vraiment emprunter la branche d'entrée et la branche de sortie
  if (!projAll(entry.far, tol + 8).some(c => c.s < s + 5 && c.s > s - 70)) return null;
  if (!projAll(exit.far, tol + 8).some(c => c.s > s - 5 && c.s < s + 70)) return null;
  return { ev, J, s, brs, entry, exit, hIn: norm360(entry.bear + 180), hOut: exit.bear };
}
function dirPhrase(a, fork) {
  if (fork) return 'Serrer à ' + fork;
  const A = Math.abs(a), sd = a > 0 ? 'D' : 'G';
  if (A < 20) return 'TD';
  if (A < 50) return 'Lég. à ' + sd;
  if (A < 125) return 'À ' + sd;
  return 'Épingle à ' + sd;
}
const isRb = w => /^(roundabout|circular)$/.test(w.tags.junction || '');
function isEntryOnly(br) {         // branche à sens unique qui ne fait qu'entrer dans le nœud
  const ow = br.way.tags.oneway;
  if (ow === 'yes' || ow === 'true' || ow === '1') return br.dir < 0;
  if (ow === '-1' || ow === 'reverse') return br.dir > 0;
  return false;
}
function makeJunctionNotes(g, events) {
  const A = [];
  for (const ev of events) { if (ev.s < 15 || ev.s > T.L - 15) continue; const r = analyzeEvent(g, ev); if (r) A.push(r); }
  A.sort((a, b) => a.s - b.s);
  // ronds-points : de l'entrée sur l'anneau jusqu'à la sortie = une seule note
  const used = new Set(), out = [];
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    if (used.has(a) || !isRb(a.exit.b.way) || isRb(a.entry.b.way)) continue;
    const grp = [a]; let closed = false;
    for (let j = i + 1; j < A.length && A[j].s - a.s < 500; j++) {
      const b = A[j];
      if (!isRb(b.entry.b.way)) break;
      grp.push(b);
      if (!isRb(b.exit.b.way)) { closed = true; break; }
    }
    if (!closed) continue;
    grp.forEach(x => used.add(x));
    out.push(roundaboutNote(g, grp));
  }
  const merge = S.settings.merge, groups = [];
  for (const a of A) {
    if (used.has(a)) continue;
    const gr = groups[groups.length - 1];
    if (gr && a.s - gr[gr.length - 1].s < merge && a.s - gr[0].s < merge * 1.8) gr.push(a); else groups.push([a]);
  }
  for (const gr of groups) { const n = noteFromGroup(g, gr); if (n) out.push(n); }
  return out;
}
function roundaboutNote(g, grp) {
  const first = grp[0], last = grp[grp.length - 1], R = S.settings.tulipR;
  let exits = 0;
  for (const x of grp.slice(1, -1)) for (const b of x.brs) {
    if (b === x.entry || b === x.exit || isRb(b.b.way) || isEntryOnly(b.b)) continue;
    exits++;
  }
  const no = exits + 1;
  // centre = milieu de l'anneau
  const ring = first.exit.b.way, pts = [];
  if (ring.nodes[0] === ring.nodes[ring.nodes.length - 1]) for (const id of ring.nodes.slice(1)) { const n = g.nodes.get(id); if (n) pts.push(n.xy); }
  if (pts.length < 3) for (const x of grp) pts.push(x.J.xy);
  const c = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const back = guidedWalk(g, first.J, first.entry.b, first.s, -1, R * 1.4);
  const fwdw = guidedWalk(g, first.J, first.exit.b, first.s, +1, Math.max(0, last.s - first.s) + R * 1.4);
  const tulip = buildTulip(c, first.hIn, reverseChain(back).concat(fwdw.slice(1)), collectOthers(g, c, grp.map(x => x.J), R), 'junction');
  const text = ['Rond-point', (no === 1 ? '1re' : no + 'e') + ' sortie', 'sur ' + wayLabel(last.exit.b.way)].join('\n');
  const n = mkNote({ s: first.s, xy: c, text, cap: Math.round(last.hOut) % 360, kind: 'junction', tulip });
  n.span = [Math.round(first.s), Math.round(last.s)];
  return n;
}
function noteFromGroup(g, gr) {
  const first = gr[0], last = gr[gr.length - 1];
  const jn = gr.filter(x => x.ev.kind === 'junction');
  const turn = x => Math.abs(angDiff(x.hIn, x.hOut));
  const main = (jn.length ? jn : gr).reduce((m, x) => turn(x) > turn(m) ? x : m);
  const hIn = first.hIn, hOut = last.hOut, a = angDiff(hIn, hOut);
  // fourche : une autre branche part presque dans la même direction
  let fork = null;
  const myRel = angDiff(main.hIn, main.hOut);
  if (Math.abs(a) <= 50 && Math.abs(myRel) <= 50) {
    let best = null;
    for (const x of main.brs) {
      if (x === main.entry || x === main.exit) continue;
      const r = angDiff(main.hIn, x.bear);
      if (Math.abs(r) <= 55 && Math.abs(r - myRel) < 80 && (best === null || Math.abs(r - myRel) < Math.abs(best - myRel))) best = r;
    }
    if (best !== null && Math.abs(best - myRel) > 8) fork = myRel > best ? 'D' : 'G';
  }
  const entryCat = first.entry.b.way.cat, exitWay = last.exit.b.way, exitCat = exitWay.cat;
  const t1 = dirPhrase(a, fork);
  const surf = (entryCat === 'road') !== (exitCat === 'road');
  if (!jn.length && !surf) return null;
  if (t1 === 'TD' && !surf && exitCat === entryCat && !S.settings.straight) return null;
  const lines = [t1];
  if (t1 !== 'TD' || exitCat !== entryCat) lines.push('sur ' + wayLabel(exitWay));
  if (surf) lines.push(exitCat === 'road' ? 'Début goudron' : 'Fin goudron');
  const R = S.settings.tulipR;
  const back = guidedWalk(g, first.J, first.entry.b, first.s, -1, R * 1.4 + (main.s - first.s));
  const fwdw = guidedWalk(g, first.J, first.exit.b, first.s, +1, Math.max(0, last.s - first.s) + R * 1.4);
  const chain = reverseChain(back).concat(fwdw.slice(1));
  const tulip = buildTulip(main.J.xy, hIn, chain, collectOthers(g, main.J.xy, gr.map(x => x.J), R), 'junction');
  const note = mkNote({ s: main.s, xy: main.J.xy, text: lines.join('\n'), cap: Math.round(hOut) % 360, kind: 'junction', tulip });
  note.span = [Math.round(first.s), Math.round(last.s)];
  return note;
}
function reverseChain(ch) { const r = ch.slice().reverse(); return r.map((q, k) => ({ p: q.p, c: k > 0 ? r[k - 1].c : q.c })); }
function collectOthers(g, c, seeds, R) {      // toutes les voies reliées à l'intersection, dans le rayon
  const lim = R * 1.25, seen = new Set(), segs = new Map(), q = [];
  for (const n of seeds) if (n && !seen.has(n.id)) { seen.add(n.id); q.push(n); }
  while (q.length) {
    const n = q.pop();
    for (const b of n.br) {
      const j = b.i + b.dir, si = b.dir > 0 ? b.i : j;
      let set = segs.get(b.way); if (!set) segs.set(b.way, set = new Set()); set.add(si);
      const m = g.nodes.get(b.way.nodes[j]);
      if (m && !seen.has(m.id) && dxy(m.xy, c) <= lim) { seen.add(m.id); q.push(m); }
    }
  }
  const out = [];
  for (const [w, set] of segs) {
    const idx = [...set].sort((x, y) => x - y); let run = null;
    const flush = () => { if (!run) return; const pts = []; for (let k = run.a; k <= run.b + 1; k++) { const nd = g.nodes.get(w.nodes[k]); if (nd) pts.push(nd.xy); } if (pts.length > 1) out.push({ c: w.cat, pts }); };
    for (const i of idx) { if (run && i === run.b + 1) run.b = i; else { flush(); run = { a: i, b: i }; } }
    flush();
  }
  return out;
}
function collectNear(g, p) {
  if (!g) return { others: [], snap: null, cat: 'track' };
  const ws = nearestWaySeg(g, p, tolEff() + 6);
  if (!ws) return { others: [], snap: null, cat: 'track' };
  return { others: collectOthers(g, p, [ws.a, ws.b], S.settings.tulipR), snap: ws.q, cat: ws.w.cat };
}
function trackChain(s1, s2, cat, off) {     // morceau de trace lissé (le bruit GPS est moyenné)
  const out = []; s1 = clamp(s1, 0, T.L); s2 = clamp(s2, 0, T.L);
  const add = s => {
    let x = 0, y = 0, n = 0;
    for (let o = -8; o <= 8; o += 4) { const p = pointAt(clamp(s + o, s1, s2)); x += p[0]; y += p[1]; n++; }
    if (s === s1 || s === s2) { const p = pointAt(s); x = p[0] * n; y = p[1] * n; }
    out.push({ p: off ? [x / n + off[0], y / n + off[1]] : [x / n, y / n], c: cat });
  };
  for (let s = s1; s < s2; s += 4) add(s);
  add(s2);
  return out;
}
function trackTulip(s, kind) {          // tulipe dessinée depuis la trace (départ, arrivée, virage, note manuelle)
  const R = S.settings.tulipR;
  let sc = s, s1 = s - R * 1.4, s2 = s + R * 1.4, H;
  if (kind === 'start') { sc = Math.min(T.L / 2, R * 0.75); s1 = 0; s2 = sc + R * 1.4; H = trackBearing(0, Math.min(T.L, R * 1.5)); }
  else if (kind === 'end') { sc = Math.max(T.L / 2, T.L - R * 0.75); s1 = sc - R * 1.4; s2 = T.L; H = trackBearing(T.L - R * 1.5, T.L); }
  else H = trackBearing(s - 30, s - 3);
  const c = pointAt(sc), near = collectNear(G, c);
  const off = near.snap ? [near.snap[0] - c[0], near.snap[1] - c[1]] : null;
  const center = near.snap || c;
  const anchor = kind === 'start' ? pointAt(0) : kind === 'end' ? pointAt(T.L) : center;
  const xy = off && (kind === 'start' || kind === 'end') ? [anchor[0] + off[0], anchor[1] + off[1]] : anchor;
  // la trace est recalée point par point sur les chemins OSM (sinon : simple décalage)
  let chain = trackChain(s1, s2, near.cat, null);
  if (G) {
    let ok = 0;
    const sn = chain.map(q => { const ws = nearestWaySeg(G, q.p, tolEff() + 4); if (ws) { ok++; return { p: ws.q, c: ws.w.cat }; } return q; });
    if (ok >= chain.length * 0.6) chain = sn;
    else if (off) chain = chain.map(q => ({ p: [q.p[0] + off[0], q.p[1] + off[1]], c: q.c }));
  }
  return { tulip: buildTulip(center, H, chain, near.others, kind), xy };
}
function detectBends(jNotes) {
  const st = S.settings, out = [];
  if (!st.bends || T.L < 150) return out;
  const vals = [];
  for (let s = 20; s <= T.L - 20; s += 5) {      // deux échelles : virage sec et épingle plus large
    const d1 = angDiff(trackBearing(s - 20, s), trackBearing(s, s + 20));
    const d2 = angDiff(trackBearing(s - 38, s), trackBearing(s, s + 38));
    vals.push({ s, d: Math.abs(d2) > Math.abs(d1) ? d2 : d1 });
  }
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i], A = Math.abs(v.d);
    if (A < st.bendAngle || v.s < 40 || v.s > T.L - 40) continue;
    let isMax = true;
    for (let j = Math.max(0, i - 8); j <= Math.min(vals.length - 1, i + 8); j++) { const B = Math.abs(vals[j].d); if (B > A || (B === A && j < i)) { isMax = false; break; } }
    if (!isMax) continue;
    if (jNotes.some(n => v.s > (n.span ? n.span[0] : n.s) - 50 && v.s < (n.span ? n.span[1] : n.s) + 50) || out.some(n => Math.abs(n.s - v.s) < 50)) continue;
    const sd = v.d > 0 ? 'D' : 'G';
    const uturn = dxy(pointAt(v.s - 30), pointAt(v.s + 30)) < 10;
    const tot = angDiff(trackBearing(v.s - 75, v.s - 35), trackBearing(v.s + 35, v.s + 75));   // virage complet
    const At = Math.sign(tot) === Math.sign(v.d) ? Math.max(A, Math.abs(tot)) : A;
    const text = uturn ? 'Demi-tour' : (At >= 130 ? 'Épingle à ' : 'Virage serré à ') + sd;
    const tt = trackTulip(v.s, 'bend');
    out.push(mkNote({ s: v.s, xy: tt.xy, text, cap: Math.round(trackBearing(v.s, v.s + 30)) % 360, kind: 'bend', tulip: tt.tulip }));
  }
  return out;
}
function mkNote(o) {
  const ll = inv(o.xy[0], o.xy[1]);
  return { id: S.nextId++, s: Math.round(o.s * 10) / 10, lat: +ll[0].toFixed(6), lon: +ll[1].toFixed(6), text: o.text || '',
    cap: o.cap == null ? null : o.cap, showCap: o.showCap != null ? o.showCap : S.settings.showCap, danger: 0, wp: null,
    auto: o.auto !== false, edited: false, kind: o.kind, tulip: o.tulip };
}
function startNote() { const t = trackTulip(0, 'start'); return mkNote({ s: 0, xy: t.xy, text: 'Départ', cap: Math.round(trackBearing(0, 50)) % 360, kind: 'start', tulip: t.tulip }); }
function endNote() { const t = trackTulip(T.L, 'end'); return mkNote({ s: T.L, xy: t.xy, text: 'Arrivée', showCap: false, kind: 'end', tulip: t.tulip }); }

/* ============================================================
   9. Tulipes : géométrie & dessin
   ============================================================ */
const rnd = p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
function buildTulip(c, H, chain, others, kind) {
  const R = S.settings.tulipR, co = Math.cos(H * D2R), si = Math.sin(H * D2R);
  const tr = p => { const x = p[0] - c[0], y = p[1] - c[1]; return [x * co - y * si, x * si + y * co]; };
  let rt = chain.map(q => ({ p: tr(q.p), c: q.c }));
  if (kind === 'start' || kind === 'end') rt = rt.filter((q, i) => i === 0 || dxy(q.p, rt[i - 1].p) > 0.01);
  let ci = 0, bd = Infinity;
  rt.forEach((q, i) => { const d = q.p[0] * q.p[0] + q.p[1] * q.p[1]; if (d < bd) { bd = d; ci = i; } });
  rt = clipChain(rt, ci, R);
  const oth = [];
  for (const o of others) for (const piece of clipPoly(o.pts.map(tr), R)) if (polyLen(piece) > 1.5) oth.push({ c: o.c, p: piece.map(rnd) });
  return { R, kind, route: rt.map(q => ({ p: rnd(q.p), c: q.c })), others: oth };
}
function clipChain(rt, ci, R) {
  if (!rt.length) return rt;
  const inside = i => Math.hypot(rt[i].p[0], rt[i].p[1]) <= R;
  if (!inside(ci)) return [rt[ci]];
  let a = ci, b = ci;
  while (a > 0 && inside(a - 1)) a--;
  while (b < rt.length - 1 && inside(b + 1)) b++;
  const res = rt.slice(a, b + 1).map(q => ({ p: q.p, c: q.c }));
  if (a > 0) { const cc = clipSeg(rt[a - 1].p, rt[a].p, R); if (cc) res.unshift({ p: cc[0], c: rt[a].c }); }
  if (b < rt.length - 1) { const cc = clipSeg(rt[b].p, rt[b + 1].p, R); if (cc) res.push({ p: cc[1], c: rt[b + 1].c }); }
  return res;
}
function splitRuns(rt) {
  const runs = []; let cur = null;
  for (let k = 1; k < rt.length; k++) {
    const c = rt[k].c || 'track';
    if (!cur || cur.c !== c) { cur = { c, p: [rt[k - 1].p] }; runs.push(cur); }
    cur.p.push(rt[k].p);
  }
  return runs;
}
function trimEnd(rt, len) {
  const out = rt.map(q => ({ p: q.p, c: q.c }));
  let rem = len;
  while (out.length >= 2) {
    const a = out[out.length - 2].p, b = out[out.length - 1].p, L = dxy(a, b);
    if (L > rem) { out[out.length - 1] = { p: lerp(b, a, rem / L), c: out[out.length - 1].c }; return out; }
    rem -= L; out.pop();
  }
  return out;
}
const f1 = v => v.toFixed(1);
function tulipSVG(t, size) {
  size = size || 100;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}"><rect width="100" height="100" fill="#fff"/>`;
  if (!t) return s + '</svg>';
  const k = 42 / t.R, cx = 50, cy = 54;
  const sc = p => [cx + p[0] * k, cy - p[1] * k];
  const dd = pts => pts.length > 1 ? 'M' + pts.map(p => f1(p[0]) + ' ' + f1(p[1])).join('L') : '';
  const ln = (pts, attrs) => { const d = dd(pts); return d ? `<path d="${d}" fill="none" stroke-linejoin="round" ${attrs}/>` : ''; };
  const oth = (t.others || []).map(o => ({ c: o.c, p: o.p.map(sc) }));
  for (const o of oth) if (o.c === 'road') s += ln(o.p, 'stroke="#000" stroke-width="6.4"');
  for (const o of oth) if (o.c === 'road') s += ln(o.p, 'stroke="#fff" stroke-width="2.8" stroke-linecap="round"');
  for (const o of oth) if (o.c === 'track') s += ln(o.p, 'stroke="#000" stroke-width="2.6" stroke-linecap="round"');
  for (const o of oth) if (o.c === 'trail') s += ln(o.p, 'stroke="#000" stroke-width="2.4" stroke-dasharray="4.5 3.2"');
  let rt = (t.route || []).map(q => ({ p: sc(q.p), c: q.c }));
  if (rt.length >= 2) {
    const isEnd = t.kind === 'end';
    const end = rt[rt.length - 1].p;
    let dir = null;
    if (!isEnd) {
      rt = trimEnd(rt, 9);
      const e2 = rt[rt.length - 1].p, L = dxy(e2, end);
      dir = L > 0.01 ? [(end[0] - e2[0]) / L, (end[1] - e2[1]) / L] : [0, -1];
    } else {
      const a = rt[Math.max(0, rt.length - 3)].p, L = dxy(a, end);
      dir = L > 0.01 ? [(end[0] - a[0]) / L, (end[1] - a[1]) / L] : [0, -1];
    }
    const runs = rt.length >= 2 ? splitRuns(rt) : [];
    for (const r of runs) if (r.c === 'road') s += ln(r.p, 'stroke="#000" stroke-width="11"');
    for (const r of runs) if (r.c === 'road') s += ln(r.p, 'stroke="#fff" stroke-width="4.6" stroke-linecap="round"');
    for (const r of runs) if (r.c === 'track') s += ln(r.p, 'stroke="#000" stroke-width="7"');
    for (const r of runs) if (r.c === 'trail') s += ln(r.p, 'stroke="#000" stroke-width="6.5" stroke-dasharray="8 4.5"');
    const st = rt[0].p;
    s += `<circle cx="${f1(st[0])}" cy="${f1(st[1])}" r="5.4" fill="#000"/>`;
    const ux = dir[0], uy = dir[1];
    if (!isEnd) {
      const AL = 14, W = 8, bx = end[0] - ux * AL, by = end[1] - uy * AL;
      s += `<path d="M${f1(end[0])} ${f1(end[1])}L${f1(bx - uy * W)} ${f1(by + ux * W)}L${f1(bx + uy * W)} ${f1(by - ux * W)}Z" fill="#000"/>`;
    } else {
      const W = 11;
      s += `<path d="M${f1(end[0] - uy * W)} ${f1(end[1] + ux * W)}L${f1(end[0] + uy * W)} ${f1(end[1] - ux * W)}" stroke="#000" stroke-width="4.5"/>`;
      // drapeau à damier
      const fx = clamp(end[0] + 13, 4, 76), fy = clamp(end[1] - 16, 3, 80);
      s += `<path d="M${f1(fx)} ${f1(fy + 26)}V${f1(fy)}" stroke="#000" stroke-width="2.2"/>`;
      for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) s += `<rect x="${f1(fx + q * 5)}" y="${f1(fy + r * 4.5)}" width="5" height="4.5" fill="${(r + q) % 2 ? '#fff' : '#000'}"/>`;
      s += `<rect x="${f1(fx)}" y="${f1(fy)}" width="20" height="13.5" fill="none" stroke="#000" stroke-width="1"/>`;
    }
  }
  return s + '</svg>';
}
function wrapText(str, n) {
  const words = String(str).split(/\s+/).filter(Boolean), out = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
function notesSVG(n) {
  const W = 400, H = 300, FF = 'Arial Narrow, Roboto Condensed, Arial, sans-serif';
  const lines = (n.text || '').split('\n');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  let y = 8;
  if (n.danger) { y += 52; s += `<text x="16" y="${y}" font-family="${FF}" font-weight="900" font-size="54" fill="#d0021b">${'!'.repeat(n.danger)}</text>`; }
  for (const l of wrapText(lines[0] || '', 12).slice(0, 2)) { y += 64; s += `<text x="16" y="${y}" font-family="${FF}" font-weight="bold" font-size="62" fill="#000">${esc(l)}</text>`; }
  y += 6;
  const capOn = n.showCap && n.cap != null;
  outer: for (const l0 of lines.slice(1)) for (const l of wrapText(l0, 22)) {
    if (y + 40 > H - (capOn ? 66 : 10)) break outer;
    y += 40; s += `<text x="16" y="${y}" font-family="${FF}" font-size="36" fill="#000">${esc(l)}</text>`;
  }
  if (capOn) s += `<rect x="${W - 196}" y="${H - 64}" width="182" height="52" rx="6" fill="#fff" stroke="#000" stroke-width="4"/><text x="${W - 105}" y="${H - 25}" text-anchor="middle" font-family="${FF}" font-weight="bold" font-size="34" fill="#000">CAP ${pad3(n.cap)}</text>`;
  return s + '</svg>';
}

/* ============================================================
   10. Roadbook à l'écran, sélection, édition
   ============================================================ */
const WP_TYPES = [
  ['', 'Aucun'], ['wpv', 'WPV — visible'], ['wpm', 'WPM — masqué'], ['wps', 'WPS — sécurité'], ['wpe', 'WPE — éclipse'],
  ['wpc', 'WPC — contrôle'], ['wpn', 'WPN — navigation'], ['wpp', 'WPP — passage'], ['dss', 'DSS — départ spéciale'], ['ass', 'ASS — arrivée spéciale'],
  ['dz', 'DZ — début zone de vitesse'], ['fz', 'FZ — fin zone de vitesse'], ['fuel', 'Carburant']
];
const WP_DEF = { wpv: [1000, 200], wpm: [800, 200], wps: [800, 90], wpe: [800, 200], wpc: [1000, 200], wpn: [1000, 200], wpp: [1000, 200] };
const isRadiusWP = t => !!WP_DEF[t];

function renderInfo() {
  $('#sumKm').textContent = (T ? kmFr(T.L) : '0,00') + ' km';
  const n = S.notes.length;
  $('#sumNotes').textContent = n + (n > 1 ? ' notes' : ' note');
  $('#sumSrc').textContent = S.src === 'gpx' ? 'Trace GPX' : S.src === 'draw' ? 'Parcours dessiné' : '';
  $('#stale').classList.toggle('show', !!S.stale && n > 0);
  $('#bGen').classList.toggle('pulse', !!T && (!n || S.stale) && !drawing);
  let st;
  if (drawing) st = routing ? 'Calcul de l’itinéraire…' : `Mode dessin · ${S.ctrl.length} point${S.ctrl.length > 1 ? 's' : ''} · ${T ? kmFr(T.L) : '0,00'} km`;
  else if (!T) st = 'Charge une trace GPX (📂 ou glisser-déposer) ou dessine ton parcours (✏️).';
  else if (!n) st = `Parcours de ${kmFr(T.L)} km — clique sur « Générer le roadbook ».`;
  else st = 'Astuce : clique sur la trace pour ajouter une note à la main.';
  $('#status').textContent = st;
}
function badgesHTML(n) {
  let b = '';
  if (n.wp) {
    const t = n.wp.type;
    if (t === 'dz') b += `<span class="badge dz">${n.wp.speed ? esc(n.wp.speed) : 'DZ'}</span>`;
    else if (t === 'fz') b += `<span class="badge fz">FZ</span>`;
    else if (t === 'fuel') b += `<span class="badge">⛽ Carbu</span>`;
    else b += `<span class="badge wp">${t.toUpperCase()}${n.wp.name ? ' ' + esc(n.wp.name) : ''}</span>`;
  }
  if (!n.auto) b += `<span class="badge man">manuelle</span>`;
  return b ? `<div class="badges">${b}</div>` : '';
}
function rowInner(n, i, par, cls) {
  const lines = (n.text || '').split('\n');
  const cap = n.showCap && n.cap != null ? `<div class="cap">CAP ${pad3(n.cap)}</div>` : '';
  const danger = n.danger ? `<div class="danger">${'!'.repeat(n.danger)}</div>` : '';
  return `<div class="c1"><span class="num">${i + 1}</span><div class="tot">${km(n.s)}</div><div class="par">${km(par)}</div></div>`
    + `<div class="c2">${tulipSVG(n.tulip, 124)}</div>`
    + `<div class="c3">${danger}<div class="t1">${esc(lines[0] || '')}</div><div class="t2">${esc(lines.slice(1).join('\n'))}</div>${badgesHTML(n)}${cap}`
    + (cls === 'row' ? `<div class="acts"><button data-a="edit" title="Modifier la note">✎</button><button data-a="del" title="Supprimer la note">🗑</button></div>` : '') + `</div>`;
}
function renderRoadbook() {
  const rb = $('#rb');
  if (!S.notes.length) {
    rb.innerHTML = `<div class="empty"><h3>Créer un roadbook en 3 clics</h3><ol>
      <li><b>📂 Ouvrir GPX</b> : charge la trace de ton parcours<br>— ou <b>✏️ Dessiner</b> : pose des points sur la carte, le tracé suit les chemins.</li>
      <li><b>⚙️ Générer le roadbook</b> : les intersections sont repérées sur les chemins OpenStreetMap, les tulipes, distances et caps sont calculés.</li>
      <li><b>💾 Exporter GPX</b> (format OpenRally, pour ton lecteur de roadbook) ou <b>🖨️ Imprimer</b> en PDF.</li></ol>
      <div class="hint">Ensuite tu peux corriger une note (✎), en ajouter une en cliquant sur la trace, ou marquer un waypoint (WPV, WPM, DZ…).</div></div>`;
    renderInfo(); return;
  }
  let prev = 0;
  rb.innerHTML = S.notes.map((n, i) => { const par = n.s - prev; prev = n.s; return `<div class="row${n.id === S.sel ? ' sel' : ''}" data-id="${n.id}">${rowInner(n, i, par, 'row')}</div>`; }).join('');
  renderInfo();
}
function renderAll() { S.notes.sort((a, b) => a.s - b.s); renderRoadbook(); renderMarkers(); renderInfo(); save(); }
function selectNote(id, from) {
  S.sel = id;
  document.querySelectorAll('#rb .row').forEach(r => r.classList.toggle('sel', +r.dataset.id === id));
  refreshMarkerIcons();
  const n = S.notes.find(x => x.id === id); if (!n) return;
  if (from === 'map') { const el = document.querySelector(`#rb .row[data-id="${id}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else map.setView([n.lat, n.lon], Math.max(map.getZoom(), 16));
}
let lastDeleted = null;
function deleteNote(id) {
  const i = S.notes.findIndex(n => n.id === id); if (i < 0) return;
  lastDeleted = S.notes[i]; S.notes.splice(i, 1); renderAll();
  toast('Note supprimée.', '', { label: 'Annuler', fn: () => { if (lastDeleted) { S.notes.push(lastDeleted); lastDeleted = null; renderAll(); } } });
}
$('#rb').addEventListener('click', e => {
  const row = e.target.closest('.row'); if (!row) return;
  const id = +row.dataset.id, a = e.target.closest('button[data-a]');
  if (a && a.dataset.a === 'edit') { editNote(id); return; }
  if (a && a.dataset.a === 'del') { deleteNote(id); return; }
  selectNote(id, 'list');
});
$('#rb').addEventListener('dblclick', e => { const row = e.target.closest('.row'); if (row) editNote(+row.dataset.id); });

function editNote(id, isNew) {
  const n = S.notes.find(x => x.id === id); if (!n) return;
  const wp = n.wp || {};
  const body = `
    <div class="fld"><label for="eText">Texte de la note (1re ligne en gros)</label><textarea id="eText" rows="3">${esc(n.text)}</textarea></div>
    <div class="fgrid">
      <div class="fld"><label for="eCap">CAP (°)</label><input id="eCap" type="number" min="0" max="359" value="${n.cap == null ? '' : n.cap}"></div>
      <div class="fld"><label for="eDanger">Danger</label><select id="eDanger">${[0, 1, 2, 3].map(d => `<option value="${d}"${n.danger === d ? ' selected' : ''}>${d ? '!'.repeat(d) + ' (niveau ' + d + ')' : 'Aucun'}</option>`).join('')}</select></div>
      <div class="fld"><label for="eDist">Distance (km)</label><input id="eDist" type="number" step="0.01" min="0" value="${km(n.s)}"></div>
    </div>
    <label class="chk"><input type="checkbox" id="eShowCap"${n.showCap ? ' checked' : ''}> Afficher le CAP sur cette note</label>
    <div class="fld"><label for="eWp">Point de passage / waypoint</label><select id="eWp">${WP_TYPES.map(([v, l]) => `<option value="${v}"${(wp.type || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="fgrid" id="eWpRad">
      <div class="fld"><label for="eName">Nom / n°</label><input id="eName" type="text" value="${esc(wp.name || '')}" placeholder="auto"></div>
      <div class="fld"><label for="eOpen">Ouverture (m)</label><input id="eOpen" type="number" min="1" value="${wp.open || ''}"></div>
      <div class="fld"><label for="eClear">Validation (m)</label><input id="eClear" type="number" min="1" value="${wp.clear || ''}"></div>
    </div>
    <div class="fld" id="eSpeedF"><label for="eSpeed">Vitesse maxi (km/h)</label><input id="eSpeed" type="number" min="1" value="${wp.speed || ''}"></div>
    <div class="help">Rayons proposés par défaut, modifiables selon le règlement de ton épreuve.</div>`;
  const m = openModal(isNew ? 'Nouvelle note' : `Note ${S.notes.indexOf(n) + 1} · ${km(n.s)} km`, body, [
    { label: 'Supprimer', cls: 'danger', onClick: () => { deleteNote(n.id); } }, 'sp',
    { label: 'Annuler', onClick: () => { if (isNew) { S.notes = S.notes.filter(x => x.id !== n.id); renderAll(); } } },
    { label: 'Enregistrer', cls: 'primary', onClick: () => {
      n.text = $('#eText').value.trim();
      const cap = $('#eCap').value; n.cap = cap === '' ? null : norm360(Math.round(+cap)) % 360;
      n.showCap = $('#eShowCap').checked && n.cap != null;
      n.danger = +$('#eDanger').value;
      const d = parseFloat($('#eDist').value); if (isFinite(d) && T) n.s = clamp(Math.round(d * 1000 * 10) / 10, 0, T.L);
      const t = $('#eWp').value;
      if (!t) n.wp = null;
      else {
        n.wp = { type: t, name: $('#eName').value.trim() };
        if (isRadiusWP(t)) { const o = parseInt($('#eOpen').value, 10), c = parseInt($('#eClear').value, 10); if (o > 0) n.wp.open = o; if (c > 0) n.wp.clear = c; }
        if (t === 'dz') { const v = parseInt($('#eSpeed').value, 10); if (v > 0) n.wp.speed = v; }
      }
      n.edited = true; renderAll();
    } }
  ], { onCancel: () => { if (isNew) { S.notes = S.notes.filter(x => x.id !== n.id); renderAll(); } } });
  const upd = () => {
    const t = $('#eWp').value;
    $('#eWpRad').style.display = isRadiusWP(t) || t === 'dss' || t === 'ass' ? '' : 'none';
    $('#eOpen').parentElement.style.display = $('#eClear').parentElement.style.display = isRadiusWP(t) ? '' : 'none';
    $('#eSpeedF').style.display = t === 'dz' ? '' : 'none';
    if (isRadiusWP(t)) { if (!$('#eOpen').value) $('#eOpen').value = WP_DEF[t][0]; if (!$('#eClear').value) $('#eClear').value = WP_DEF[t][1]; }
  };
  $('#eWp').addEventListener('change', () => { const t = $('#eWp').value; if (isRadiusWP(t)) { $('#eOpen').value = WP_DEF[t][0]; $('#eClear').value = WP_DEF[t][1]; } upd(); });
  upd();
  setTimeout(() => { const ta = m.querySelector('#eText'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
}
function addManualNote(latlng) {
  if (!T) return;
  const p = fwd(latlng.lat, latlng.lng);
  const pr = projAll(p, 80); if (!pr.length) return;
  const best = pr.reduce((a, b) => b.d < a.d ? b : a);
  let note = null;
  if (G) {      // une intersection OSM tout près ? on l'analyse comme les autres
    const ws = nearestWaySeg(G, pointAt(best.s), tolEff() + 6);
    if (ws) {
      const cand = [ws.a, ws.b].filter(nd => nd.br.length >= 3 && dxy(nd.xy, p) < 25);
      for (const nd of cand) {
        const ps = passes(nd.xy, tolEff()).filter(x => Math.abs(x.s - best.s) < 40);
        if (!ps.length) continue;
        const r = analyzeEvent(G, { node: nd, s: ps[0].s, d: ps[0].d, kind: 'junction' });
        if (r) { note = noteFromGroup(G, [r]); break; }
      }
    }
  }
  if (!note) {
    const tt = trackTulip(best.s, 'manual');
    note = mkNote({ s: best.s, xy: tt.xy, text: '', cap: Math.round(trackBearing(best.s, best.s + 30)) % 360, kind: 'manual', tulip: tt.tulip });
  }
  note.auto = false;
  S.notes.push(note); renderAll(); selectNote(note.id, 'map');
  editNote(note.id, true);
}

/* ============================================================
   11. Génération
   ============================================================ */
let cancelGen = false;
async function generate() {
  if (drawing) setDrawing(false);
  if (!T) { toast('Charge une trace GPX ou dessine un parcours d’abord.', 'err'); return; }
  if (routing) { toast('Patiente, l’itinéraire est encore en calcul…'); return; }
  const edited = S.notes.filter(n => n.auto && n.edited).length;
  if (edited) {
    ask('Régénérer le roadbook ?', `Les notes automatiques vont être recalculées : <b>${edited} note${edited > 1 ? 's' : ''} modifiée${edited > 1 ? 's' : ''}</b> à la main ser${edited > 1 ? 'ont' : 'a'} remplacée${edited > 1 ? 's' : ''}. Les notes ajoutées à la main sont gardées.`, 'Régénérer', runGenerate);
  } else runGenerate();
}
async function runGenerate() {
  cancelGen = false;
  const m = openModal('Génération du roadbook', `<div id="pTxt">Préparation…</div><div class="prog"><div id="pBar"></div></div>`, [{ label: 'Annuler', onClick: () => { cancelGen = true; } }], { noEsc: true });
  const prog = (txt, f) => { const t = m.querySelector('#pTxt'), b = m.querySelector('#pBar'); if (t) t.textContent = txt; if (b) b.style.width = Math.round(f * 100) + '%'; };
  try {
    await fetchOSM((i, n) => prog(`Téléchargement des chemins OpenStreetMap… ${Math.min(i + 1, n)}/${n}`, 0.05 + 0.75 * i / n), () => cancelGen);
    if (cancelGen) throw new Error('annulé');
    prog('Repérage des intersections…', 0.85); await sleep(30);
    const ev = detectEvents(G);
    const jn = makeJunctionNotes(G, ev);
    prog('Dessin des tulipes…', 0.95); await sleep(10);
    const bends = detectBends(jn);
    const manual = S.notes.filter(n => !n.auto);
    S.notes = [startNote(), ...jn, ...bends, endNote(), ...manual];
    S.stale = false; S.sel = null;
    closeModal(); renderAll();
    if (S.notes.length > 1) map.fitBounds(line.getBounds(), { padding: [40, 40] });
    toast(`${S.notes.length} notes générées (${jn.length} intersections${bends.length ? ', ' + bends.length + (bends.length > 1 ? ' virages serrés' : ' virage serré') : ''}).`, 'ok');
  } catch (e) {
    closeModal();
    if (e.message === 'annulé') { toast('Génération annulée.'); return; }
    console.error(e);
    openModal('Chemins OSM indisponibles', `Impossible de télécharger les chemins OpenStreetMap (${esc(e.message || e)}).<br><br>Vérifie ta connexion internet et réessaie dans une minute : les serveurs gratuits sont parfois saturés.`, [{ label: 'OK', cls: 'primary' }]);
  }
}

/* ============================================================
   12. Export GPX OpenRally, impression, projet
   ============================================================ */
function svgToPNG(svg, w, h) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); res(c.toDataURL('image/png')); };
    img.onerror = () => rej(new Error('rendu de l’image impossible'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fileName = (ext) => (S.name || 'roadbook').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) + ext;
function download(name, content, mime) {
  const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}
async function buildGPX(onProg) {
  const NS = 'http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3';
  const o = [];
  o.push('<?xml version="1.0" encoding="UTF-8"?>');
  o.push(`<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="Generateur de Roadbook OSM" version="1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:openrally="${NS}" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd ${NS} http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3/openrally.xsd">`);
  o.push(`  <metadata>\n    <name>${xmlEsc(S.name)}</name>\n    <time>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</time>\n    <extensions>\n      <openrally:units>metric</openrally:units>\n      <openrally:distance>${km(T.L)}</openrally:distance>\n    </extensions>\n  </metadata>`);
  let wpCount = 0;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    onProg && onProg(i, S.notes.length);
    const tul = await svgToPNG(tulipSVG(n.tulip, 300), 300, 300);
    const nts = await svgToPNG(notesSVG(n), 400, 300);
    const ex = [];
    ex.push(`<openrally:distance>${km(n.s)}</openrally:distance>`);
    ex.push(`<openrally:tulip><![CDATA[${tul}]]></openrally:tulip>`);
    ex.push(`<openrally:notes><![CDATA[${nts}]]></openrally:notes>`);
    if (n.showCap && n.cap != null) ex.push(`<openrally:cap>${Math.round(n.cap) % 360}</openrally:cap>`);
    if (n.danger) ex.push(`<openrally:danger>${n.danger}</openrally:danger>`);
    if (n.wp) {
      const t = n.wp.type;
      if (isRadiusWP(t) || t === 'dss' || t === 'ass') {
        if (isRadiusWP(t)) wpCount++;
        const nm = n.wp.name || (isRadiusWP(t) ? String(wpCount) : '');
        ex.push(`<openrally:${t}${n.wp.open ? ` open="${n.wp.open}"` : ''}${n.wp.clear ? ` clear="${n.wp.clear}"` : ''}${nm ? ` name="${xmlEsc(nm)}"` : ''}/>`);
      } else if (t === 'dz') { ex.push('<openrally:dz/>'); if (n.wp.speed) ex.push(`<openrally:speed>${n.wp.speed}</openrally:speed>`); }
      else if (t === 'fz') ex.push('<openrally:fz/>');
      else if (t === 'fuel') ex.push('<openrally:fuel/>');
    }
    o.push(`  <wpt lat="${n.lat.toFixed(6)}" lon="${n.lon.toFixed(6)}">\n    <name>${i + 1}</name>\n    <desc>${xmlEsc((n.text || '').replace(/\n/g, ' / '))}</desc>\n    <extensions>\n      ${ex.join('\n      ')}\n    </extensions>\n  </wpt>`);
  }
  o.push(`  <trk>\n    <name>${xmlEsc(S.name)}</name>\n    <trkseg>`);
  for (const p of S.ll) o.push(`      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"/>`);
  o.push('    </trkseg>\n  </trk>\n</gpx>\n');
  return o.join('\n');
}
async function exportGPX() {
  if (!T || !S.notes.length) { toast('Génère d’abord le roadbook.', 'err'); return; }
  const m = openModal('Export GPX OpenRally', `<div id="pTxt">Dessin des tulipes…</div><div class="prog"><div id="pBar"></div></div>`, [], { noEsc: true });
  try {
    const gpx = await buildGPX((i, n) => { const b = m.querySelector('#pBar'); if (b) b.style.width = Math.round(100 * i / n) + '%'; });
    closeModal();
    download(fileName('.gpx'), gpx, 'application/gpx+xml');
    toast('GPX OpenRally exporté : ouvre-le dans ton lecteur de roadbook.', 'ok');
  } catch (e) { closeModal(); console.error(e); openModal('Export impossible', esc(e.message || e), [{ label: 'OK', cls: 'primary' }]); }
}
function printRB() {
  if (!S.notes.length) { toast('Génère d’abord le roadbook.', 'err'); return; }
  let prev = 0;
  const head = `<div class="ph"><b>${esc(S.name)}</b><span>${kmFr(T.L)} km · ${S.notes.length} notes · ${new Date().toLocaleDateString('fr-FR')}</span></div>`;
  $('#print').innerHTML = head + S.notes.map((n, i) => { const par = n.s - prev; prev = n.s; return `<div class="prow">${rowInner(n, i, par, 'prow')}</div>`; }).join('');
  setTimeout(() => window.print(), 50);
}
function saveProject() {
  if (!S.ll.length && !S.notes.length) { toast('Rien à enregistrer pour l’instant.'); return; }
  download(fileName('.roadbook.json'), JSON.stringify(snapshot()), 'application/json');
}

/* ============================================================
   13. Fenêtres, messages, réglages, aide
   ============================================================ */
let modalOpts = null;
function openModal(title, body, buttons, opts) {
  const m = $('#modal'); modalOpts = opts || {};
  m.innerHTML = `<h2>${esc(title)}</h2><div class="mb">${body}</div><div class="mf"></div>`;
  const mf = m.querySelector('.mf');
  for (const b of buttons || []) {
    if (b === 'sp') { const sp = document.createElement('span'); sp.className = 'sp'; mf.appendChild(sp); continue; }
    const el = document.createElement('button'); el.className = 'mbtn ' + (b.cls || ''); el.textContent = b.label;
    el.onclick = () => { modalOpts = null; closeModal(); if (b.onClick) b.onClick(m); };
    mf.appendChild(el);
  }
  if (!buttons || !buttons.length) mf.style.display = 'none';
  $('#modalBg').classList.add('show');
  return m;
}
function closeModal() { $('#modalBg').classList.remove('show'); }
function cancelModal() { if (!$('#modalBg').classList.contains('show') || (modalOpts && modalOpts.noEsc)) return; const o = modalOpts; modalOpts = null; closeModal(); if (o && o.onCancel) o.onCancel(); }
$('#modalBg').addEventListener('mousedown', e => { if (e.target.id === 'modalBg') cancelModal(); });
function ask(title, html, okLabel, onOk) { openModal(title, html, ['sp', { label: 'Annuler' }, { label: okLabel, cls: 'primary', onClick: onOk }]); }
function toast(msg, cls, action) {
  const d = document.createElement('div'); d.className = cls || ''; d.textContent = msg;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.style.cssText = 'margin-left:12px;pointer-events:auto;border:0;border-radius:5px;padding:3px 9px;font-weight:700;background:#e39b2d;cursor:pointer'; b.onclick = () => { action.fn(); d.remove(); }; d.appendChild(b); }
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), action ? 7000 : 4200);
}
function openSettings() {
  const s = S.settings;
  const num = (id, label, v, min, max, help) => `<div class="fld"><label for="${id}">${label}</label><input id="${id}" type="number" min="${min}" max="${max}" value="${v}">${help ? `<div class="help" style="margin:2px 0 0">${help}</div>` : ''}</div>`;
  const chk = (id, label, v) => `<label class="chk"><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${label}</label>`;
  openModal('Réglages de génération', `
    ${num('sTol', 'Tolérance trace ↔ chemins (m)', s.tol, 5, 50, 'Distance maxi entre ta trace GPS et une intersection pour qu’elle soit notée.')}
    <div class="fgrid" style="grid-template-columns:1fr 1fr">
      ${num('sMerge', 'Regrouper les notes à moins de (m)', s.merge, 5, 100)}
      ${num('sR', 'Rayon dessiné dans la tulipe (m)', s.tulipR, 25, 120)}
    </div>
    ${chk('sStraight', 'Noter aussi les intersections où l’on continue tout droit', s.straight)}
    ${chk('sGoudron', 'Noter les changements « fin / début goudron »', s.goudron)}
    ${chk('sBends', 'Noter les virages serrés hors intersection', s.bends)}
    ${num('sBendA', 'Angle mini d’un virage serré (°)', s.bendAngle, 60, 170)}
    ${chk('sFoot', 'Inclure les voies piétonnes et cyclables (footway, cycleway, escaliers)', s.foot)}
    ${chk('sCap', 'Afficher le CAP sur les nouvelles notes', s.showCap)}`, [
    { label: 'Valeurs par défaut', onClick: () => { S.settings = { ...DEF_SETTINGS }; afterSettings(); } }, 'sp',
    { label: 'Annuler' },
    { label: 'Enregistrer', cls: 'primary', onClick: () => {
      const g = (id, d, a, b) => { const v = parseFloat($('#' + id).value); return isFinite(v) ? clamp(v, a, b) : d; };
      S.settings = { tol: g('sTol', 20, 5, 50), merge: g('sMerge', 30, 5, 100), tulipR: g('sR', 50, 25, 120), straight: $('#sStraight').checked,
        goudron: $('#sGoudron').checked, bends: $('#sBends').checked, bendAngle: g('sBendA', 100, 60, 170), foot: $('#sFoot').checked, showCap: $('#sCap').checked };
      afterSettings();
    } }]);
}
function afterSettings() { if (S.notes.length) { S.stale = true; toast('Réglages enregistrés : clique sur « Générer le roadbook » pour les appliquer.'); } renderInfo(); save(); }
function openHelp() {
  const demo = { R: 50, kind: 'junction', route: [{ p: [0, -50], c: 'track' }, { p: [0, 0], c: 'track' }, { p: [35, 35], c: 'track' }], others: [{ c: 'road', p: [[-50, 5], [50, -5]] }, { c: 'trail', p: [[0, 0], [-30, 40]] }] };
  openModal('Aide', `
    <div style="display:flex;gap:14px;align-items:center">${tulipSVG(demo, 110)}<div>
    <b>Lire une tulipe</b><br>● point = tu arrives ici · ▲ flèche = direction à prendre<br>
    trait épais = ton parcours · double trait = route goudronnée<br>trait plein = piste · pointillés = sentier / petite piste</div></div>
    <p><b>Trace GPS</b> : si des intersections manquent, augmente la « tolérance » dans les réglages ; s’il y a trop de notes, décoche « tout droit ».</p>
    <p><b>Modifier</b> : ✎ sur une note (texte, CAP, danger, waypoint WPV/WPM/WPS, zone de vitesse DZ/FZ). Clique sur la trace pour ajouter une note.</p>
    <p><b>Internet</b> est nécessaire pour la carte, le calcul d’itinéraire et les chemins (OpenStreetMap via Overpass). Ton travail est gardé automatiquement dans ce navigateur.</p>
    <p style="color:#8a8478;font-size:12px">Données © contributeurs OpenStreetMap (ODbL). Itinéraires BRouter / OSRM. Fonds OpenTopoMap, CyclOSM, Esri.</p>`, [{ label: 'OK', cls: 'primary' }]);
}

/* ============================================================
   14. Fichiers, boutons, démarrage
   ============================================================ */
function loadFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    const txt = String(rd.result);
    try {
      if (/\.json$/i.test(file.name) || txt.trim().startsWith('{')) {
        const o = JSON.parse(txt); if (!o || !o.ll) throw new Error('Projet illisible.');
        if (drawing) setDrawing(false);
        restore(o); $('#rbName').value = S.name; renderAll(); renderTrack(true);
        toast('Projet ouvert.', 'ok'); return;
      }
      const g = parseGPX(txt);
      if (g.ll.length < 2) throw new Error(g.wpts ? 'Ce GPX ne contient que des waypoints, pas de trace (trk). Utilise un GPX avec la trace du parcours, ou dessine-le.' : 'Aucune trace trouvée dans ce fichier.');
      if (drawing) setDrawing(false);
      S.src = 'gpx'; S.ctrl = []; S.segs = []; S.notes = []; S.stale = false; S.sel = null;
      S.name = g.name || file.name.replace(/\.gpx$/i, ''); $('#rbName').value = S.name;
      setTrack(g.ll, true); renderAll(); renderTrack(true);
      toast(`Trace chargée : ${kmFr(T.L)} km. Clique sur « Générer le roadbook ».`, 'ok');
    } catch (e) { openModal('Fichier non reconnu', esc(e.message || e), [{ label: 'OK', cls: 'primary' }]); }
  };
  rd.readAsText(file);
}
$('#bOpen').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = e => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; };
$('#bDraw').onclick = () => {
  if (drawing) { setDrawing(false); return; }
  if (S.src === 'gpx' && S.ll.length) {
    ask('Dessiner un nouveau parcours ?', 'La trace GPX chargée et ses notes seront effacées.', 'Effacer et dessiner', () => {
      S.ll = []; S.ctrl = []; S.segs = []; S.notes = []; S.stale = false; S.src = 'draw';
      setTrack([], true); renderAll(); setDrawing(true);
    });
    return;
  }
  setDrawing(true);
};
$('#bDrawEnd').onclick = () => setDrawing(false);
$('#bUndo').onclick = () => { if (S.ctrl.length) { S.ctrl.pop(); renderCtrl(); reroute(); } };
$('#routeMode').onchange = e => { S.routeMode = e.target.value; save(); };
$('#bGen').onclick = generate;
$('#bExport').onclick = exportGPX;
$('#bPrint').onclick = printRB;
$('#rbName').addEventListener('input', e => { S.name = e.target.value; save(); });
$('#bMore').onclick = e => { e.stopPropagation(); $('#moreMenu').classList.toggle('open'); };
document.addEventListener('click', () => $('#moreMenu').classList.remove('open'));
$('#moreMenu').addEventListener('click', e => {
  const a = e.target.closest('button[data-act]'); if (!a) return;
  $('#moreMenu').classList.remove('open');
  const act = a.dataset.act;
  if (act === 'settings') openSettings();
  else if (act === 'saveProject') saveProject();
  else if (act === 'help') openHelp();
  else if (act === 'new') ask('Nouveau roadbook ?', 'Le parcours et les notes en cours seront effacés (pense à exporter ou enregistrer le projet avant).', 'Tout effacer', () => {
    if (drawing) setDrawing(false);
    S.name = 'Mon roadbook'; S.src = ''; S.ctrl = []; S.segs = []; S.notes = []; S.stale = false; S.sel = null;
    $('#rbName').value = S.name; setTrack([], true); renderAll();
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#modalBg').classList.contains('show')) cancelModal(); else if (drawing) setDrawing(false); }
  if (drawing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !$('#modalBg').classList.contains('show')) { e.preventDefault(); $('#bUndo').click(); }
});
// glisser-déposer
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#dropHint').classList.add('show'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropHint').classList.remove('show'); });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#dropHint').classList.remove('show'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

// démarrage : reprise du dernier travail
(function init() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { restore(JSON.parse(raw)); $('#rbName').value = S.name; } } catch (e) { console.warn(e); }
  $('#routeMode').value = S.routeMode;
  renderRoadbook(); renderMarkers(); renderTrack(true); renderInfo();
})();

// accès pour les tests automatisés
window.__rb = { S, map, get T() { return T; }, get G() { return G; }, generate: runGenerate, buildGPX, loadText: (txt, name) => loadFile(new File([txt], name || 'test.gpx')), tulipSVG };
})();
