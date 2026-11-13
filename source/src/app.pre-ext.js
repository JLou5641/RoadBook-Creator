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
const DEF_SETTINGS = { sv: 2, data: 'vt', tol: 40, merge: 30, tulipR: 50, straight: true, bends: true, bendAngle: 100, goudron: true, foot: false, showCap: true, water: true, bld: true, pois: true, landmarks: true };
const S = {
  name: 'Mon roadbook', src: '', ll: [], mm: null, ctrl: [], segs: [], notes: [], settings: { ...DEF_SETTINGS },
  stale: false, routeMode: 'trekking', nextId: 1, sel: null
};
let T = null;    // parcours dérivé : {xy, cum, L, grid}
let G = null;    // réseau OSM : {nodes, ways, key}
const LS_KEY = 'rbgen.v1';
let saveTimer = null, saveWarned = false;

function snapshot() {
  return { v: 2, name: S.name, src: S.src, ll: S.ll, mm: S.mm, ctrl: S.ctrl, segs: S.segs, notes: S.notes, settings: S.settings,
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
  if ((o.settings || {}).sv !== DEF_SETTINGS.sv) S.settings = { ...S.settings, sv: DEF_SETTINGS.sv, tol: DEF_SETTINGS.tol, water: true, bld: true };
  S.routeMode = o.routeMode || 'trekking'; S.nextId = o.nextId || (Math.max(0, ...S.notes.map(n => n.id)) + 1); S.sel = null;
  for (let i = 1; i < S.ctrl.length; i++) if (S.segs[i - 1]) routeCache.set(segKey(S.ctrl[i - 1], S.ctrl[i], S.ctrl[i][2]), S.segs[i - 1]);
  G = null;
  S.mm = o.mm || null;
  setTrack(o.ll || [], true, true);
}

/* ============================================================
   3. Parcours (trace)
   ============================================================ */
function setTrack(ll, silent, keepMM) {
  const f = [];
  for (const p of ll) {
    if (!isFinite(p[0]) || !isFinite(p[1])) continue;
    const q = [+(+p[0]).toFixed(6), +(+p[1]).toFixed(6)];
    if (!f.length || haversine(f[f.length - 1], q) >= 2) f.push(q);
  }
  const changed = trackSig(f) !== trackSig(S.ll);
  S.ll = f;
  if (changed && !keepMM) S.mm = null;
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
  const lat0 = (a + b) / 2, lon0 = (c + d) / 2;
  if (lat0 !== PL.lat0 || lon0 !== PL.lon0) { setPlane(lat0, lon0); G = null; }   // nouveau plan : le réseau sera recalculé
  const base = S.mm && S.mm.length > 1 ? S.mm : S.ll;     // trace recalée sur les chemins si disponible
  const xy = [], src = base.map(p => fwd(p[0], p[1]));
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
const tolEff = () => S.mm ? 5 : S.src === 'draw' ? Math.min(S.settings.tol, 12) : Math.min(S.settings.tol, 25);

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
  scan25: L.tileLayer('https://data.geopf.fr/private/wmts?Service=WMTS&apikey=ign_scan_ws&Version=1.0.0&Request=GetTile&Layer=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR&Style=normal&Format=image/jpeg&TileMatrixSet=PM&TileMatrix={z}&TileRow={y}&TileCol={x}', { minZoom: 6, maxNativeZoom: 16, maxZoom: 19, attribution: '© IGN – SCAN 25® Touristique' }),
  planign: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png', { maxNativeZoom: 19, maxZoom: 19, attribution: '© IGN – Plan IGN' }),
  cyclosm: L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 19, attribution: '© contributeurs OpenStreetMap | CyclOSM' }),
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© contributeurs OpenStreetMap' }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, maxZoom: 19, attribution: 'Imagerie © Esri' })
};
/* ---------- Fonds de carte personnels (adresse de tuiles {z}/{x}/{y}) ---------- */
let curLayer = LAYERS.topo.addTo(map), curLayerKey = 'topo';
let myLayers = [];
try { myLayers = JSON.parse(localStorage.getItem('rbgen.myLayers') || '[]'); } catch (_) {}
const myLayerObjs = new Map();
function normTileUrl(u) {
  return String(u || '').trim().replace(/&amp;/g, '&')
    .replace(/\{\$?z\}|\{zoom\}|\{\$zoom\}/gi, '{z}').replace(/\{\$?x\}/gi, '{x}').replace(/\{\$?y\}/gi, '{y}').replace(/\{\$?-y\}/gi, '{-y}');
}
function layerFor(key) {
  if (LAYERS[key]) return LAYERS[key];
  const c = myLayers.find(l => 'c:' + l.id === key); if (!c) return null;
  if (!myLayerObjs.has(c.id)) myLayerObjs.set(c.id, L.tileLayer(c.url, { maxNativeZoom: c.max || 18, maxZoom: Math.max(19, c.max || 18), attribution: esc(c.name) }));
  return myLayerObjs.get(c.id);
}
function setBaseLayer(key) {
  const lay = layerFor(key) || LAYERS.topo; if (!layerFor(key)) key = 'topo';
  if (curLayer !== lay) { map.removeLayer(curLayer); curLayer = lay.addTo(map); }
  curLayerKey = key; $('#layerSel').value = key;
  try { localStorage.setItem('rbgen.layer', key); } catch (_) {}
}
function rebuildLayerSelect() {
  const sel = $('#layerSel');
  sel.querySelectorAll('option[data-my]').forEach(o => o.remove());
  for (const l of myLayers) { const o = document.createElement('option'); o.value = 'c:' + l.id; o.textContent = '⭐ ' + l.name; o.dataset.my = 1; sel.appendChild(o); }
  const m = document.createElement('option'); m.value = '__my'; m.textContent = '➕ Ajouter / gérer mes fonds…'; m.dataset.my = 1; sel.appendChild(m);
  sel.value = curLayerKey;
}
function saveMyLayers() { try { localStorage.setItem('rbgen.myLayers', JSON.stringify(myLayers)); } catch (_) {} }
function openMyLayers(pre, err) {
  pre = pre || {};
  const list = myLayers.length ? myLayers.map(l => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #e6dfd1"><div style="flex:1;min-width:0"><b>${esc(l.name)}</b><div class="help" style="margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.url)}</div></div><button class="mbtn danger" data-del="${l.id}">Supprimer</button></div>`).join('')
    : '<div class="help" style="margin:0">Aucun fond personnel pour l’instant.</div>';
  const m = openModal('Mes fonds de carte', `${list}
    <h3 style="font-family:var(--cond);font-size:17px;margin:16px 0 8px">Ajouter un fond</h3>
    ${err ? `<div style="color:var(--err);font-weight:600;margin-bottom:8px">${esc(err)}</div>` : ''}
    <div class="fld"><label for="mlName">Nom</label><input id="mlName" type="text" value="${esc(pre.name || '')}" placeholder="ex. IGN SCAN 25"></div>
    <div class="fld"><label for="mlUrl">Adresse des tuiles</label><textarea id="mlUrl" rows="3" placeholder="https://…/{z}/{x}/{y}.png">${esc(pre.url || '')}</textarea></div>
    <div class="help">Colle l’adresse d’un service de tuiles contenant <b>{z}</b>, <b>{x}</b> et <b>{y}</b> (les formes {$z}, {$x}, {$y} sont aussi acceptées).</div>
    <div class="fld" style="max-width:170px"><label for="mlMax">Zoom maxi des tuiles</label><input id="mlMax" type="number" min="1" max="22" value="${pre.max || 18}"></div>`, [
    { label: 'Fermer' }, 'sp',
    { label: 'Ajouter et afficher', cls: 'primary', onClick: () => {
      const name = $('#mlName').value.trim(), url = normTileUrl($('#mlUrl').value), max = clamp(parseInt($('#mlMax').value, 10) || 18, 1, 22);
      const again = e => openMyLayers({ name, url: $('#mlUrl').value, max }, e);
      if (!/^https?:\/\//i.test(url)) return again('L’adresse doit commencer par http:// ou https://');
      if (!/\{z\}/.test(url) || !/\{x\}/.test(url) || !/\{-?y\}/.test(url)) return again('L’adresse doit contenir {z}, {x} et {y}.');
      const l = { id: Date.now().toString(36), name: name || 'Mon fond ' + (myLayers.length + 1), url, max };
      myLayers.push(l); saveMyLayers(); rebuildLayerSelect(); setBaseLayer('c:' + l.id);
      toast(`Fond « ${l.name} » ajouté. S’il reste gris, vérifie l’adresse (ou le zoom maxi).`, 'ok');
    } }]);
  m.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.del; myLayers = myLayers.filter(l => l.id !== id); saveMyLayers();
    const lay = myLayerObjs.get(id); myLayerObjs.delete(id);
    if (curLayerKey === 'c:' + id) setBaseLayer('topo'); else if (lay) map.removeLayer(lay);
    rebuildLayerSelect(); openMyLayers();
  }));
}
$('#layerSel').addEventListener('change', e => {
  const v = e.target.value;
  if (v === '__my') { e.target.value = curLayerKey; openMyLayers(); return; }
  setBaseLayer(v);
});
rebuildLayerSelect();
try { const l = localStorage.getItem('rbgen.layer'); if (l) setBaseLayer(l); } catch (_) {}

const casing = L.polyline([], { color: '#fff', weight: 8, opacity: 0.85, interactive: false }).addTo(map);
const line = L.polyline([], { color: '#e4572e', weight: 4.5, opacity: 0.95, interactive: false }).addTo(map);
const mmLine = L.polyline([], { color: '#1b1a17', weight: 2.2, opacity: 0.9, interactive: false }).addTo(map);
const hit = L.polyline([], { weight: 22, opacity: 0, bubblingMouseEvents: false }).addTo(map);
const noteLayer = L.layerGroup().addTo(map);
const ctrlLayer = L.layerGroup().addTo(map);
const markers = new Map();

function renderTrack(fit) {
  casing.setLatLngs(S.ll); line.setLatLngs(S.ll); hit.setLatLngs(S.ll); mmLine.setLatLngs(S.mm || []);
  if (fit && S.ll.length > 1) map.fitBounds(line.getBounds(), { padding: [40, 40] });
}
function noteIcon(n, i) {
  const cls = 'nmk' + (n.id === S.sel ? ' sel' : n.wp || n.zone || n.fuel ? ' wp' : (n.kind === 'start' || n.kind === 'end') ? ' se' : '');
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
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
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
  if (w.cat === 'road') { const r0 = (t.ref || '').split(';')[0].trim(), ref = /\d/.test(r0) && r0.length <= 12 ? ' ' + r0 : ''; return (/^(residential|living_street|pedestrian)$/.test(hw) && !ref ? 'rue' : 'route') + ref; }
  if (w.cat === 'track') return 'piste';
  return hw === 'track' ? 'petite piste' : 'sentier';
}
let liveCache = null;
function liveServers() {               // serveurs qui répondent (on n'attend pas les plus lents), vérifié toutes les 10 min
  if (liveCache && Date.now() - liveCache.t < 600000) return Promise.resolve(liveCache.list);
  return new Promise(resolve => {
    const ok = []; let settled = 0, done = false;
    const finish = () => {
      if (done) return; done = true;
      const list = ok.sort((a, b) => a.ms - b.ms).map(r => r.ep);
      liveCache = { t: Date.now(), list: list.length ? list : OVERPASS.slice() };
      resolve(liveCache.list);
    };
    for (const ep of OVERPASS) {
      const t0 = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 6000);
      fetch(ep.replace(/interpreter$/, 'status'), { mode: 'no-cors', cache: 'no-store', signal: ac.signal })
        .then(() => ok.push({ ep, ms: performance.now() - t0 }), () => {})
        .finally(() => { clearTimeout(to); settled++; if (ok.length >= 2 || settled === OVERPASS.length) finish(); });
    }
    setTimeout(() => { if (ok.length) finish(); }, 2500);
    setTimeout(finish, 6500);
  });
}
async function overpass(q, isCancelled, first, servers) {
  const list = servers && servers.length ? servers : OVERPASS;
  let lastErr = null;
  for (let round = 0; round < 2; round++) for (let k = 0; k < list.length; k++) {
    const ep = list[(k + (first || 0)) % list.length];
    if (isCancelled()) throw new Error('annulé');
    try {
      const j = await fetchJSON(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 180000);
      if (j.remark && /error|timed out|out of memory|rate_limited/i.test(j.remark)) { lastErr = new Error(j.remark); await sleep(1000); continue; }
      j.__ep = ep.replace(/^https:\/\/([^/]+).*$/, '$1');
      return j;
    } catch (e) {
      lastErr = e;
      if (e.status === 429 || e.status === 504) await sleep(1500);
    }
  }
  throw lastErr || new Error('Serveur OSM indisponible');
}
const osmMargin = () => Math.round(Math.max(90, S.settings.tol + 15, S.settings.tulipR * 1.7));
const extraTiles = new Set();      // zones ajoutées pour les tulipes agrandies
function graphKey() { const s = S.settings; return trackSig(S.ll) + '|' + (s.data === 'osm' || s.data === 'ign' ? s.data : 'vt') + '|' + osmMargin() + '|' + s.foot + '|' + s.water + '|' + s.bld + '|' + extraTiles.size + '|v5'; }
// Petits rectangles (≈ 250 m de parcours chacun) qui couvrent le couloir autour de la trace.
// Requêtes Overpass volontairement simples (rectangles + filtre "highway"), le tri se fait ici.
function routeBoxes(margin) {
  const idx = simplifyDP(T.xy, 5), pts = idx.map(i => T.xy[i]), boxes = [];
  const flush = cur => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of cur) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    const sw = inv(a - margin, b - margin), ne = inv(c + margin, d + margin);
    boxes.push([sw[0], sw[1], ne[0], ne[1]]);
  };
  let cur = [pts[0]], acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(dxy(a, b) / 250));
    for (let k = 1; k <= n; k++) {
      const p = lerp(a, b, k / n); acc += dxy(cur[cur.length - 1], p); cur.push(p);
      if (acc >= 250) { flush(cur); cur = [p]; acc = 0; }
    }
  }
  if (cur.length > 1 || !boxes.length) flush(cur);
  return boxes;
}
/* ---------- Mémoire des chemins : carreaux de 0,0025° gardés dans le navigateur (sans limite de durée) ---------- */
const TS = 0.0025, TILE_V = 2, memTiles = new Map();   // TILE_V : version du contenu des carreaux (2 = avec repères)
const tkey = (la, lo) => Math.floor(lo / TS) + ',' + Math.floor(la / TS);
const tileBox = k => { const [tx, ty] = k.split(',').map(Number); return [ty * TS, tx * TS, (ty + 1) * TS, (tx + 1) * TS]; };
const TileDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise(res => {
    try {                                   // « tiles » : zones Overpass (mode détaillé) · « vt » : tuiles vectorielles (mode rapide) · « ign » : BD TOPO
      const r = indexedDB.open('rbgen-osm', 3);
      r.onupgradeneeded = () => { const db = r.result; for (const n of ['tiles', 'vt', 'ign']) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'k' }); };
      r.onsuccess = () => res(r.result); r.onerror = r.onblocked = () => res(null);
    } catch (e) { res(null); }
  }));
  const run = (mode, fn, store) => open().then(db => new Promise(res => {
    if (!db) return res(null);
    try { const tx = db.transaction(store, mode), out = fn(tx.objectStore(store)); tx.oncomplete = () => res(out); tx.onerror = tx.onabort = () => res(out); }
    catch (e) { res(null); }
  }));
  return {
    getMany: (keys, store = 'tiles') => run('readonly', st => { const out = new Map(); for (const k of keys) { const r = st.get(k); r.onsuccess = () => { if (r.result) out.set(k, r.result); }; } return out; }, store).then(m => m || new Map()),
    putMany: (recs, store = 'tiles') => run('readwrite', st => { for (const r of recs) st.put(r); }, store),
    clear: () => Promise.all(['tiles', 'vt', 'ign'].map(n => run('readwrite', st => { st.clear(); }, n))),
    getAll: (store = 'tiles') => run('readonly', st => { const out = []; const r = st.getAll(); r.onsuccess = () => out.push(...r.result); return out; }, store).then(a => a || [])
  };
})();
function corridorTiles(margin) {
  const keys = new Set();
  for (const b of routeBoxes(margin))
    for (let ty = Math.floor(b[0] / TS); ty <= Math.floor(b[2] / TS); ty++)
      for (let tx = Math.floor(b[1] / TS); tx <= Math.floor(b[3] / TS); tx++) keys.add(tx + ',' + ty);
  return [...keys];
}
function tilesOf(pts) {
  const set = new Set();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; set.add(tkey(p[0], p[1]));
    if (i) { const a = pts[i - 1], n = Math.ceil(Math.max(Math.abs(p[0] - a[0]), Math.abs(p[1] - a[1])) / (TS / 8)); for (let k = 1; k < n; k++) set.add(tkey(a[0] + (p[0] - a[0]) * k / n, a[1] + (p[1] - a[1]) * k / n)); }
  }
  return set;
}
function mergeTiles(keys) {            // carreaux voisins → rectangles (moins d'instructions dans la requête)
  const rows = new Map();
  for (const k of keys) { const [tx, ty] = k.split(',').map(Number); if (!rows.has(ty)) rows.set(ty, []); rows.get(ty).push(tx); }
  const rects = []; let open = new Map();
  for (const ty of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = rows.get(ty).sort((a, b) => a - b), runs = [];
    for (const x of xs) { const r = runs[runs.length - 1]; if (r && x === r[1] + 1) r[1] = x; else runs.push([x, x]); }
    const next = new Map();
    for (const [x0, x1] of runs) {
      const key = x0 + ':' + x1, o = open.get(key);
      if (o && o.y1 === ty - 1) { o.y1 = ty; open.delete(key); next.set(key, o); } else next.set(key, { x0, x1, y0: ty, y1: ty });
    }
    for (const o of open.values()) rects.push(o);
    open = next;
  }
  for (const o of open.values()) rects.push(o);
  return rects.map(r => [r.y0 * TS, r.x0 * TS, (r.y1 + 1) * TS, (r.x1 + 1) * TS]);
}
function osmQuery(keys) {
  const boxes = mergeTiles(keys).map(b => b.map(v => v.toFixed(5)).join(','));
  const hw = boxes.map(b => `way["highway"](${b});`).join('');
  const ft = boxes.map(b => `way["waterway"](${b});way["natural"="water"](${b});way["building"](${b});way["power"~"^(line|minor_line)$"](${b});`
    + `way["railway"~"^(rail|light_rail|narrow_gauge|tram|preserved|disused)$"](${b});way["barrier"~"^(fence|wall|hedge)$"](${b});way["landuse"="residential"](${b});`).join('');
  const po = boxes.map(b => `node["amenity"~"^(place_of_worship|fuel)$"](${b});way["amenity"~"^(place_of_worship|fuel)$"](${b});`
    + `node["man_made"~"^(water_tower|mast|tower|communications_tower|chimney|windmill|lighthouse)$"](${b});way["man_made"~"^(water_tower|tower|chimney|windmill|lighthouse)$"](${b});`
    + `node["power"="generator"]["generator:source"="wind"](${b});node["natural"~"^(peak|saddle)$"](${b});node["mountain_pass"="yes"](${b});`
    + `node["place"~"^(city|town|village|hamlet|locality|isolated_dwelling)$"](${b});node["hazard"](${b});`).join('');
  return `[out:json][timeout:180];(${hw})->.h;.h out body;.h >;out qt;(${ft});out geom qt;(${po});out center qt;`;
}
function attribute(j, keys) {          // répartit la réponse Overpass dans les carreaux demandés
  const set = new Set(keys), now = Date.now();
  const recs = new Map(keys.map(k => [k, { k, v: TILE_V, t: now, w: [], n: [], f: [], p: [], ns: new Set() }]));
  const nodes = new Map(), hwNodes = new Set();
  for (const e of j.elements || []) { if (e.type === 'node') { const o = nodes.get(e.id); if (!o || (e.tags && !o.tags)) nodes.set(e.id, e); } else if (e.type === 'way' && !e.geometry && !e.center && e.nodes) e.nodes.forEach(id => hwNodes.add(id)); }
  const place = (pts, add) => {
    let hit = false; for (const k of tilesOf(pts)) if (set.has(k)) { add(recs.get(k)); hit = true; }
    if (!hit && pts.length) add(recs.get(keys[0]));
  };
  for (const e of j.elements || []) {
    if (e.type === 'node') {                    // repère isolé (château d'eau, église, col, lieu-dit…)
      if (e.tags && !hwNodes.has(e.id)) place([[e.lat, e.lon]], r => r.p.push(['n', e.id, e.lat, e.lon, e.tags]));
      continue;
    }
    if (e.type !== 'way') continue;
    if (e.center) { place([[e.center.lat, e.center.lon]], r => r.p.push(['w', e.id, e.center.lat, e.center.lon, e.tags || {}])); continue; }
    if (e.geometry) {
      const pts = e.geometry.filter(Boolean).map(g => [g.lat, g.lon]), flat = [];
      for (const p of pts) flat.push(p[0], p[1]);
      place(pts, r => r.f.push([e.id, e.tags || {}, flat]));
    } else if (e.nodes) {
      const pts = e.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => [n.lat, n.lon]);
      place(pts, r => { r.w.push([e.id, e.nodes, e.tags || {}]); for (const id of e.nodes) r.ns.add(id); });
    }
  }
  for (const r of recs.values()) { for (const id of r.ns) { const n = nodes.get(id); if (n) r.n.push(n.tags ? [id, n.lat, n.lon, n.tags] : [id, n.lat, n.lon]); } delete r.ns; }
  return [...recs.values()];
}
function tilesToElements(recs) {
  const nodes = new Map(), ways = new Map(), feats = new Map(), pois = new Map();
  for (const r of recs) { if (!r) continue; for (const n of r.n) nodes.set(n[0], n); for (const w of r.w) ways.set(w[0], w); for (const f of r.f) feats.set(f[0], f); for (const q of r.p || []) pois.set(q[0] + q[1], q); }
  const els = [];
  for (const n of nodes.values()) els.push({ type: 'node', id: n[0], lat: n[1], lon: n[2], tags: n[3] || null });
  for (const [k, q] of pois) els.push({ type: 'poi', id: k, lat: q[2], lon: q[3], tags: q[4] || {} });
  for (const w of ways.values()) els.push({ type: 'way', id: w[0], nodes: w[1], tags: w[2] });
  for (const f of feats.values()) { const g = []; for (let i = 0; i < f[2].length; i += 2) g.push({ lat: f[2][i], lon: f[2][i + 1] }); els.push({ type: 'way', id: f[0], tags: f[1], geometry: g }); }
  return els;
}
let lastFail = '';
function failReason(e) {                 // raison courte et lisible d'un échec de téléchargement
  const m = String((e && e.message) || e || '');
  if (e && e.name === 'AbortError') return 'délai dépassé';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'pas de réponse du serveur (réseau, blocage ou refus du navigateur)';
  if (/^HTTP (\d+)/.test(m)) return 'le serveur répond ' + m;
  return m.slice(0, 90);
}
async function fetchOSM(progress, isCancelled) {      // mode rapide (fond vectoriel) par défaut ; IGN ou détaillé au choix ; les autres en secours
  const want = S.settings.data === 'osm' || S.settings.data === 'ign' ? S.settings.data : 'vt';
  const order = want === 'ign' ? ['ign', 'vt', 'osm'] : want === 'vt' ? ['vt', 'osm'] : ['osm'];
  const NAME = { ign: 'BD TOPO de l’IGN', vt: 'Fond vectoriel', osm: 'OpenStreetMap détaillé' }, FN = { ign: fetchIGN, vt: fetchVT, osm: fetchOverpass };
  for (let i = 0; i < order.length; i++) {
    try { return await FN[order[i]](progress, isCancelled); }
    catch (e) {
      if (isCancelled() || /annulé/.test(e.message || '') || i === order.length - 1) throw e;
      console.warn(NAME[order[i]] + ' indisponible', e);
      const why = failReason(e);
      toast(`${NAME[order[i]]} ${/hors de France/.test(e.message || '') ? 'absente ici (hors de France ?)' : 'indisponible'}${why ? ' — ' + why : ''} : passage au mode ${order[i + 1] === 'vt' ? 'rapide' : 'détaillé (plus lent)'}.`, 'err');
      lastFail = `${NAME[order[i]]} : ${why || e.message || e}`;
    }
  }
}
function corridorFilter(els, zones) {    // on garde le couloir autour de la trace, comme en mode détaillé
  const zs = new Set(zones), ll = new Map();
  for (const e of els) if (e.type === 'node') ll.set(e.id, [e.lat, e.lon]);
  const hit = pts => { for (const k of tilesOf(pts)) if (zs.has(k)) return true; return false; };
  const around = pts => {                  // grande surface (zone habitée, lac) qui englobe le couloir
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    const y0 = Math.floor(a / TS), y1 = Math.floor(c / TS), x0 = Math.floor(b / TS), x1 = Math.floor(d / TS);
    if ((y1 - y0 + 1) * (x1 - x0 + 1) > 2000) return true;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (zs.has(x + ',' + y)) return true;
    return false;
  };
  els = els.filter(e => {
    if (e.type === 'node') return true;
    if (e.type === 'poi') return zs.has(tkey(e.lat, e.lon));
    if (e.nodes) return hit(e.nodes.map(id => ll.get(id)));
    const pts = e.geometry.map(g => [g.lat, g.lon]);
    return hit(pts) || (e.tags.natural === 'water' || e.tags.landuse === 'residential' ? around(pts) : false);
  });
  const used = new Set(); for (const e of els) if (e.nodes) for (const id of e.nodes) used.add(id);
  return els.filter(e => e.type !== 'node' || used.has(e.id));
}
/* ---------- Mode IGN : BD TOPO par le service WFS de la Géoplateforme (France), cases de 0,01° gardées dans le navigateur ---------- */
let skippedLayers = new Set();
const IGN_WFS = 'https://data.geopf.fr/wfs/ows', IGN_TS = 0.01, IGN_PAGE = 5000, memIGN = new Map();
async function ignQuery(layer, box, isCancelled) {      // toutes les pages d'une couche sur un rectangle
  const out = [], PG = /batiment/.test(layer) ? 1500 : IGN_PAGE;      // pages plus petites pour les bâtiments (réponses lourdes)
  for (let page = 0; page < 60; page++) {
    if (isCancelled()) throw new Error('annulé');
    const q = new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: layer, OUTPUTFORMAT: 'application/json',
      BBOX: `${box[0].toFixed(5)},${box[1].toFixed(5)},${box[2].toFixed(5)},${box[3].toFixed(5)},urn:ogc:def:crs:EPSG::4326`, SORTBY: 'cleabs', COUNT: PG, STARTINDEX: page * PG });
    let j = null, err = null;
    for (let t = 0; t < 4 && !j; t++) {                       // le service répond parfois 503 : on réessaie en attendant de plus en plus
      try { j = await fetchJSON(IGN_WFS + '?' + q, {}, 90000); } catch (e) { err = e; if (isCancelled()) throw new Error('annulé'); await sleep(1000 * 2 ** t); }
    }
    if (!j) throw err || new Error('Service IGN indisponible');
    if (!Array.isArray(j.features)) throw new Error('Réponse IGN inattendue');
    out.push(...j.features);
    if (j.features.length < PG) break;
  }
  return out;
}
function ignSlim(l, f) {                 // on ne garde que ce qui sert (géométrie en lon, lat arrondis)
  const P = f.properties || {}, p = {};
  for (const k of l === 'r' ? IGN_ROAD_KEYS : ['nature', 'position_par_rapport_au_sol']) if (P[k] != null) p[k] = P[k];
  const r = c => c.map(q => [Math.round(q[0] * 1e7) / 1e7, Math.round(q[1] * 1e7) / 1e7]);
  const g = f.geometry; if (!g) return null;
  const G = { type: g.type, coordinates: g.type === 'LineString' ? r(g.coordinates) : g.type === 'MultiLineString' || g.type === 'Polygon' ? g.coordinates.map(r) : g.type === 'MultiPolygon' ? g.coordinates.map(p => p.map(r)) : null };
  return G.coordinates ? { l, id: f.id || P.cleabs, p, g: G } : null;
}
async function fetchIGN(progress, isCancelled) {
  const key = graphKey();
  if (G && G.key === key) { progress(1, 'Chemins déjà en mémoire'); return G; }
  const zones = [...new Set([...corridorTiles(osmMargin()), ...extraTiles])];
  const cellOfZone = k => { const [tx, ty] = k.split(',').map(Number); return Math.floor(tx * TS / IGN_TS + 1e-9) + ',' + Math.floor(ty * TS / IGN_TS + 1e-9); };
  const cells = [...new Set(zones.map(cellOfZone))], recs = new Map();
  for (const k of cells) if (memIGN.has(k)) recs.set(k, memIGN.get(k));
  const need = cells.filter(k => !recs.has(k));
  if (need.length) for (const [k, r] of await TileDB.getMany(need, 'ign')) { recs.set(k, r); memIGN.set(k, r); }
  const missing = cells.filter(k => !recs.has(k)), cached = cells.length - missing.length, got = [];
  const memo = cached ? ` · ${cached} déjà en mémoire` : '';
  if (missing.length) {
    // rectangles de cases voisines (une ligne de cases à la fois), découpés à 6 cases pour garder des réponses raisonnables
    const rows = new Map(); for (const k of missing) { const [x, y] = k.split(',').map(Number); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
    const rects = [];
    for (const [y, xs] of rows) { xs.sort((a, b) => a - b); let r = null; for (const x of xs) { if (r && x === r[1] + 1 && x - r[0] < 6) r[1] = x; else rects.push(r = [x, x, y]); } }
    const layers = Object.entries(IGN_LAYERS).filter(([l]) => l === 'r' || (l === 'b' ? S.settings.bld : S.settings.water));
    const jobs = []; for (const r of rects) for (const [l, name] of layers) jobs.push({ r, l, name });
    const byCell = new Map(missing.map(k => [k, { k, t: Date.now(), f: [] }]));
    let next = 0, done = 0, fail = null; const skipped = new Set(); skippedLayers = skipped;
    progress(0, `Téléchargement de la BD TOPO (IGN)… 0/${jobs.length}${memo}`);
    const worker = async () => {
      while (!fail && next < jobs.length) {
        const j = jobs[next++], box = [j.r[2] * IGN_TS, j.r[0] * IGN_TS, (j.r[2] + 1) * IGN_TS, (j.r[1] + 1) * IGN_TS];
        try {
          let feats;
          const lab = j.l === 'b' ? 'bâtiments' : 'eau';
          if (j.l !== 'r' && skipped.has(lab)) feats = [];                       // cette couche a déjà échoué : on ne perd pas de temps
          else try { feats = await ignQuery(j.name, box, () => isCancelled() || !!fail); }
          catch (e) { if (j.l === 'r' || /annulé/.test(e.message || '')) throw e; skipped.add(lab); console.warn('Couche IGN ignorée', j.name, e); feats = []; }     // eau et bâtiments sont facultatifs : seules les routes comptent
          for (const f of feats) {
            const s = ignSlim(j.l, f); if (!s) continue;
            const pts = ignLines(s.g); const hit = new Set();
            for (const line of pts) for (const p of line) hit.add(Math.floor(p[1] / IGN_TS) + ',' + Math.floor(p[0] / IGN_TS));
            let placed = false; for (const k of hit) { const c = byCell.get(k); if (c) { c.f.push(s); placed = true; } }
            if (!placed) byCell.get(j.r[0] + ',' + j.r[2]).f.push(s);
          }
        } catch (e) { fail = fail || e; }
        done++; progress(done / jobs.length, `Téléchargement de la BD TOPO (IGN)… ${done}/${jobs.length}${memo}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
    if (fail) throw fail;
    for (const c of byCell.values()) { recs.set(c.k, c); got.push(c); }
  }
  const all = new Map(); for (const r of recs.values()) for (const f of r.f) all.set(f.l + f.id, f);
  if (![...all.values()].some(f => f.l === 'r')) throw new Error('Aucun tronçon BD TOPO ici (hors de France ?)');
  progress(1, 'Lecture des chemins…'); await sleep(20);
  G = buildGraph(corridorFilter(ignToElements([...all.values()]), zones));
  if (got.length) { for (const r of got) memIGN.set(r.k, r); TileDB.putMany(got, 'ign'); }
  G.key = key;
  G.diag = `mode IGN : BD TOPO® (© IGN, Licence Ouverte) · ${cells.length} cases (${cached} en mémoire) · ${G.ways.length} chemins retenus` + (skippedLayers.size ? ` · non chargés : ${[...skippedLayers].join(', ')}` : '');
  if (skippedLayers.size) toast(`BD TOPO : ${[...skippedLayers].join(' et ')} non chargés (le service ne répond pas), les routes sont bien là.`, 'err');
  return G;
}
/* ---------- Mode rapide : tuiles vectorielles OpenFreeMap (schéma OpenMapTiles), gardées dans le navigateur ---------- */
const VT_URLS = ['https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf', 'https://openmaptiles.data.gouv.fr/data/planet-vector/{z}/{x}/{y}.pbf'];
const memVT = new Map(), vtOk = new Set();      // vtOk : serveurs qui ont déjà fourni une vraie tuile
let vtFirst = 0;
function vtTilesFor(zones) {             // tuiles z14 qui couvrent les zones du couloir
  const n = 2 ** VT_Z, set = new Set();
  const tx = lon => Math.floor((lon + 180) / 360 * n), ty = lat => { const r = lat * D2R; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
  for (const k of zones) { const b = tileBox(k); for (let x = tx(b[1]); x <= tx(b[3] - 1e-9); x++) for (let y = ty(b[2] - 1e-9); y <= ty(b[0]); y++) set.add(VT_Z + '/' + x + '/' + y); }
  return [...set];
}
async function getVTile(k, isCancelled) {
  const [z, x, y] = k.split('/'); let lastErr = null;
  for (let round = 0; round < 2; round++) for (let i = 0; i < VT_URLS.length; i++) {
    const si = (vtFirst + i) % VT_URLS.length;
    if (isCancelled()) throw new Error('annulé');
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 15000); let r;
      try { r = await fetch(VT_URLS[si].replace('{z}', z).replace('{x}', x).replace('{y}', y), { signal: ac.signal }); } finally { clearTimeout(to); }
      if ((r.status === 204 || r.status === 404) && vtOk.has(si)) return new Uint8Array(0);      // tuile vide (mer, aucune donnée)
      if (r.status === 204 || r.status === 404) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      let b = new Uint8Array(await r.arrayBuffer());
      if (b[0] === 0x1f && b[1] === 0x8b) b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      vtFirst = si; vtOk.add(si); return b;
    } catch (e) { lastErr = e; if (e.status === 429) await sleep(1000); }
  }
  throw lastErr || new Error('Fond vectoriel indisponible');
}
async function fetchVT(progress, isCancelled) {
  const key = graphKey();
  if (G && G.key === key) { progress(1, 'Chemins déjà en mémoire'); return G; }
  const zones = [...new Set([...corridorTiles(osmMargin()), ...extraTiles])], keys = vtTilesFor(zones), data = new Map();
  for (const k of keys) if (memVT.has(k)) data.set(k, memVT.get(k));
  const need = keys.filter(k => !data.has(k));
  if (need.length) for (const [k, r] of await TileDB.getMany(need, 'vt')) { data.set(k, r.d); memVT.set(k, r.d); }
  const missing = keys.filter(k => !data.has(k)), cached = keys.length - missing.length, got = [];
  const memo = cached ? ` · ${cached} déjà en mémoire` : '';
  let next = 0, done = 0, fail = null;
  if (missing.length) progress(0, `Chargement du fond vectoriel… 0/${missing.length}${memo}`);
  const worker = async () => {
    while (!fail && next < missing.length) {
      const k = missing[next++];
      try { const d = await getVTile(k, () => isCancelled() || !!fail); data.set(k, d); got.push({ k, t: Date.now(), d }); } catch (e) { fail = fail || e; }
      done++; progress(done / missing.length, `Chargement du fond vectoriel… ${done}/${missing.length}${memo}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, missing.length) }, worker));
  if (fail) throw fail;
  if (!keys.some(k => data.get(k) && data.get(k).length)) throw new Error('Fond vectoriel vide');
  progress(1, 'Lecture des chemins…'); await sleep(20);
  const tiles = keys.map(k => { const [, x, y] = k.split('/').map(Number), d = data.get(k); return { x, y, layers: d && d.length ? decodeMVT(d) : {} }; });
  if (!tiles.some(t => t.layers.transportation)) throw new Error('Format du fond vectoriel inconnu');     // schéma changé : mode détaillé en secours
  G = buildGraph(corridorFilter(vtToElements(tiles, { barriers: new Set(Object.keys(BARRIER_TXT)) }), zones));
  if (got.length) { for (const r of got) memVT.set(r.k, r.d); TileDB.putMany(got, 'vt'); }
  G.key = key;
  G.diag = `mode rapide : fond vectoriel OpenFreeMap (© OpenMapTiles, données © OpenStreetMap) · ${keys.length} tuiles (${cached} en mémoire) · ${G.ways.length} chemins retenus`;
  return G;
}
/* ---------- Mode détaillé : Overpass ---------- */
async function fetchOverpass(progress, isCancelled) {
  const key = graphKey();
  if (G && G.key === key) { progress(1, 'Chemins déjà en mémoire'); return G; }
  const keys = [...new Set([...corridorTiles(osmMargin()), ...extraTiles])], now = Date.now(), recs = new Map();
  for (const k of keys) { const r = memTiles.get(k); if (r && r.v === TILE_V) recs.set(k, r); }
  const need = keys.filter(k => !recs.has(k));
  if (need.length) for (const [k, r] of await TileDB.getMany(need)) if (r.v === TILE_V) { recs.set(k, r); memTiles.set(k, r); }
  const missing = keys.filter(k => !recs.has(k)), cached = keys.length - missing.length;
  const memo = cached ? ` · ${cached} zone${cached > 1 ? 's' : ''} déjà en mémoire` : '';
  const eps = new Set(); let fetched = [];
  const servers = missing.length ? await liveServers() : [];
  for (let pass = 0; pass < 2 && missing.length; pass++) {
    // peu de requêtes (le serveur principal n'en accepte qu'environ 2 par minute) : ≤ 400 zones chacune, 2 en parallèle si utile
    const nb = Math.max(missing.length > 120 && servers.length > 1 ? 2 : 1, Math.ceil(missing.length / 400)), B = Math.ceil(missing.length / nb), batches = [];
    for (let i = 0; i < missing.length; i += B) batches.push(missing.slice(i, i + B));
    let next = 0, done = 0, fail = null; fetched = [];
    progress(0, `Téléchargement des chemins OpenStreetMap… 0/${batches.length}${memo}`);
    const worker = async w => {            // jusqu'à 3 téléchargements en parallèle, un par serveur
      while (!fail && next < batches.length) {
        const b = batches[next++];
        try {
          const j = await overpass(osmQuery(b), () => isCancelled() || !!fail, w + pass, servers);
          eps.add(j.__ep);
          for (const r of attribute(j, b)) { recs.set(r.k, r); fetched.push(r); }
        } catch (e) { fail = fail || e; }
        done++; progress(done / batches.length, `Téléchargement des chemins OpenStreetMap… ${done}/${batches.length}${memo}`);
      }
    };
    await Promise.all([0, 1].slice(0, Math.min(2, batches.length, servers.length || 1)).map(worker));
    if (fail) throw fail;
    if (fetched.some(r => r.w.length) || cached) break;    // réponse vide : on réessaie une fois avec d'autres serveurs
  }
  if (!missing.length) progress(1, `Chemins déjà en mémoire (${cached} zones)`);
  G = buildGraph(tilesToElements(keys.map(k => recs.get(k))));
  if (G.ways.length && fetched.length) { for (const r of fetched) memTiles.set(r.k, r); TileDB.putMany(fetched); }
  G.key = key;
  G.diag = `mode détaillé : serveur ${[...eps].join(', ') || '—'} · ${keys.length} zones (${cached} en mémoire) · ${G.ways.length} chemins retenus`;
  return G;
}
function lineKind(t) {
  if (t.power === 'line') return 'ht';
  if (t.power === 'minor_line') return 'elec';
  if (/^(rail|light_rail|narrow_gauge|tram|preserved|disused)$/.test(t.railway || '')) return 'rail';
  if (/^(fence|wall|hedge)$/.test(t.barrier || '')) return t.barrier;
  if (t.landuse === 'residential') return 'resid';
  return null;
}
function featOf(t) {
  const ww = t.waterway;
  if (ww) { if (/^(river|canal)$/.test(ww)) return 'river'; if (/^(stream|brook|tidal_channel|rapids)$/.test(ww)) return 'stream'; if (/^(ditch|drain)$/.test(ww)) return 'ditch'; if (ww === 'riverbank') return 'warea'; return null; }
  if (t.natural === 'water' || t.landuse === 'reservoir') return 'warea';
  if (t.building && t.building !== 'no') return 'bld';
  return null;
}
function buildGraph(els) {
  const nodes = new Map(), ways = [], feats = [];
  for (const e of els) if (e.type === 'node') nodes.set(e.id, { id: e.id, lat: e.lat, lon: e.lon, xy: fwd(e.lat, e.lon), br: [], tags: e.tags || null });
  const pois = [], lines = [];
  for (const e of els) if (e.type === 'poi') pois.push({ id: e.id, xy: fwd(e.lat, e.lon), tags: e.tags || {} });
  for (const e of els) if (e.type === 'way' && e.geometry) {          // cours d'eau, plans d'eau, bâtiments, lignes
    const lk = lineKind(e.tags || {});
    if (lk) {
      const lp = e.geometry.filter(Boolean).map(g => fwd(g.lat, g.lon));
      if (lp.length > 1 && (lk !== 'resid' || dxy(lp[0], lp[lp.length - 1]) < 0.5)) {
        let lb = [Infinity, Infinity, -Infinity, -Infinity];
        for (const p of lp) lb = [Math.min(lb[0], p[0]), Math.min(lb[1], p[1]), Math.max(lb[2], p[0]), Math.max(lb[3], p[1])];
        lines.push({ k: lk, pts: lp, bb: lb, tags: e.tags || {} });
      }
    }
    const k = featOf(e.tags || {}); if (!k || (k === 'bld' ? !S.settings.bld : !S.settings.water)) continue;
    const pts = e.geometry.filter(Boolean).map(g => fwd(g.lat, g.lon)); if (pts.length < 2) continue;
    const area = k === 'warea' || k === 'bld';
    if (area && dxy(pts[0], pts[pts.length - 1]) > 0.5) continue;      // polygone non fermé : ignoré
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of pts) bb = [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.max(bb[2], p[0]), Math.max(bb[3], p[1])];
    feats.push({ k, pts, bb, area });
  }
  const excl = new RegExp('^(corridor|elevator|platform|proposed|construction|abandoned|disused|razed|bus_stop|raceway|via_ferrata|escape|bus_guideway|emergency_bay|rest_area|services|traffic_island'
    + (S.settings.foot ? '' : '|footway|steps|cycleway|pedestrian') + ')$');
  for (const e of els) {
    if (e.type !== 'way' || e.geometry || !e.nodes || e.nodes.length < 2) continue;
    const tags = e.tags || {}, hw = tags.highway;
    if (!hw || excl.test(hw) || tags.area === 'yes' || /^(parking_aisle|driveway|drive-through|emergency_access)$/.test(tags.service || '')) continue;
    ways.push({ id: e.id, nodes: e.nodes, tags, cat: catOf(tags) });
  }
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
  const fgrid = new Map(), big = [];
  for (const f of feats) {
    const x0 = Math.floor(f.bb[0] / CELL), x1 = Math.floor(f.bb[2] / CELL), y0 = Math.floor(f.bb[1] / CELL), y1 = Math.floor(f.bb[3] / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) { big.push(f); continue; }
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = cellKey(i, j); let a = fgrid.get(k); if (!a) fgrid.set(k, a = []); a.push(f); }
  }
  return { nodes, ways, feats, fgrid, big, pois, lines };
}
function featuresNear(g, c, R) {
  if (!g || !g.fgrid) return [];
  const set = new Set(g.big);
  const x0 = Math.floor((c[0] - R) / CELL), x1 = Math.floor((c[0] + R) / CELL), y0 = Math.floor((c[1] - R) / CELL), y1 = Math.floor((c[1] + R) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const a = g.fgrid.get(cellKey(i, j)); if (a) for (const f of a) set.add(f); }
  return [...set].filter(f => f.bb[0] <= c[0] + R && f.bb[2] >= c[0] - R && f.bb[1] <= c[1] + R && f.bb[3] >= c[1] - R);
}
function buildSegGrid(g) {
  const grid = new Map();
  for (const w of g.ways) for (let i = 0; i < w.nodes.length - 1; i++) {
    const a = g.nodes.get(w.nodes[i]), b = g.nodes.get(w.nodes[i + 1]); if (!a || !b) continue;
    const n = Math.max(1, Math.ceil(dxy(a.xy, b.xy) / 20)), cells = new Set();
    for (let k = 0; k <= n; k++) { const c = cellOf(lerp(a.xy, b.xy, k / n)); cells.add(cellKey(c[0], c[1])); }
    const sg = [w, i];
    for (const ck of cells) { let arr = grid.get(ck); if (!arr) grid.set(ck, arr = []); arr.push(sg); }
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
   7b. Recalage de la trace sur les chemins (map-matching Viterbi)
   La trace (GPS bruité, dessin à main levée…) est ramenée sur les
   chemins OSM les plus probables ; les intersections sont ensuite
   repérées exactement sur ce chemin recalé.
   ============================================================ */
function prepAdj(g) {
  if (g.adjReady) return;
  for (const n of g.nodes.values()) {
    n.adj = [];
    for (const b of n.br) { const m = g.nodes.get(b.way.nodes[b.i + b.dir]); if (m) n.adj.push([m, dxy(n.xy, m.xy)]); }
  }
  g.adjReady = true;
}
function dijkstra(src, maxD) {           // distances depuis src (bornées à maxD)
  const D = new Map([[src.id, { d: 0, prev: null, n: src }]]);
  const h = [[0, src]];
  const up = i => { while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const down = i => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } };
  while (h.length) {
    const top = h[0], last = h.pop(); if (h.length) { h[0] = last; down(0); }
    const [d, n] = top; if (d > D.get(n.id).d) continue;
    for (const [m, L] of n.adj) {
      const nd = d + L; if (nd > maxD) continue;
      const cur = D.get(m.id);
      if (!cur || nd < cur.d) { D.set(m.id, { d: nd, prev: n, n: m }); h.push([nd, m]); up(h.length - 1); }
    }
  }
  return D;
}
function mmCandidates(g, p, tol) {
  const r = Math.ceil(tol / CELL), [cx, cy] = cellOf(p), seen = new Set(), list = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const arr = g.segGrid.get(cellKey(cx + i, cy + j)); if (!arr) continue;
    for (const sg of arr) {
      if (seen.has(sg)) continue; seen.add(sg);
      const [w, k] = sg, a = g.nodes.get(w.nodes[k]), b = g.nodes.get(w.nodes[k + 1]);
      if (!a || !b) continue;
      const pr = segProj(p, a.xy, b.xy);
      if (pr.d <= tol) list.push({ a, b, t: pr.t, q: pr.q, d: pr.d, len: dxy(a.xy, b.xy) });
    }
  }
  list.sort((x, y) => x.d - y.d);
  const out = [];
  for (const c of list) { if (out.some(o => dxy(o.q, c.q) < 4)) continue; out.push(c); if (out.length >= 7) break; }
  return out;
}
function netDist(a, b, getD) {
  if (a.a === b.a && a.b === b.b) return { d: Math.abs(b.t - a.t) * a.len };
  if (a.a === b.b && a.b === b.a) return { d: Math.abs(1 - b.t - a.t) * a.len };
  let best = Infinity, bx = null, by = null;
  const ea = [[a.a, a.t * a.len], [a.b, (1 - a.t) * a.len]], eb = [[b.a, b.t * b.len], [b.b, (1 - b.t) * b.len]];
  for (const [x, dx] of ea) {
    const D = getD(x);
    for (const [y, dy] of eb) { const e = D.get(y.id); if (!e) continue; const v = dx + e.d + dy; if (v < best) { best = v; bx = x; by = y; } }
  }
  return { d: best, x: bx, y: by };
}
async function mapMatch(g, prog, isCancelled) {
  prepAdj(g); if (!g.segGrid) buildSegGrid(g);
  const tol = S.settings.tol, sigma = Math.max(5, tol / 3), beta = 12, STEP = 20;
  const maxD = STEP * 3 + 2 * tol + 40;
  const cache = new Map();
  const getD = n => { let d = cache.get(n.id); if (!d) { if (cache.size > 3000) cache.clear(); d = dijkstra(n, maxD); cache.set(n.id, d); } return d; };
  const ss = []; for (let s = 0; s < T.L; s += STEP) ss.push(s); ss.push(T.L);
  const P = ss.map(pointAt);
  const chains = []; let cur = null;
  for (let k = 0; k < ss.length; k++) {
    if (k % 250 === 0) { prog(k / ss.length); await sleep(0); if (isCancelled()) throw new Error('annulé'); }
    const cs = mmCandidates(g, P[k], tol);
    if (!cs.length) { if (cur) chains.push(cur); cur = null; continue; }
    const em = cs.map(c => -0.5 * (c.d / sigma) ** 2);
    if (!cur) { cur = { k0: k, st: [{ cs, sc: em, bk: cs.map(() => -1) }] }; continue; }
    const pv = cur.st[cur.st.length - 1], ds = dxy(P[k - 1], P[k]);
    const sc = [], bk = []; let any = false;
    for (let j = 0; j < cs.length; j++) {
      let best = -Infinity, bi = -1;
      for (let i = 0; i < pv.cs.length; i++) {
        if (pv.sc[i] === -Infinity) continue;
        const nd = netDist(pv.cs[i], cs[j], getD).d; if (!isFinite(nd)) continue;
        const v = pv.sc[i] - Math.abs(nd - ds) / beta;
        if (v > best) { best = v; bi = i; }
      }
      sc.push(bi >= 0 ? best + em[j] : -Infinity); bk.push(bi); if (bi >= 0) any = true;
    }
    if (!any) { chains.push(cur); cur = { k0: k, st: [{ cs, sc: em, bk: cs.map(() => -1) }] }; continue; }
    const mx = Math.max(...sc);
    cur.st.push({ cs, sc: sc.map(v => v - mx), bk });
  }
  if (cur) chains.push(cur);
  // reconstruction du chemin le plus probable, tronçon par tronçon
  const pieces = [];
  for (const ch of chains) {
    const n = ch.st.length; if (n < 3) continue;          // tronçon trop court : on garde la trace brute
    const last = ch.st[n - 1].sc; let j = last.indexOf(Math.max(...last));
    const seq = new Array(n);
    for (let t = n - 1; t >= 0; t--) { seq[t] = ch.st[t].cs[j]; j = ch.st[t].bk[j]; }
    const pts = [seq[0].q];
    for (let t = 1; t < n; t++) {
      const a = seq[t - 1], b = seq[t], r = netDist(a, b, getD);
      if (r.x) {
        const D = getD(r.x), path = []; let e = D.get(r.y.id), guard = 0;
        while (e && guard++ < 10000) { path.push(e.n.xy); e = e.prev ? D.get(e.prev.id) : null; }
        for (let q = path.length - 1; q >= 0; q--) pts.push(path[q]);
      }
      pts.push(b.q);
    }
    pieces.push({ s0: ss[ch.k0], s1: ss[ch.k0 + n - 1], pts });
  }
  if (!pieces.length) return null;
  const out = []; let sPrev = 0, matched = 0;
  const raw = (s0, s1) => { for (let s = s0; s < s1; s += 10) out.push(pointAt(s)); };
  for (const pc of pieces) { raw(sPrev, pc.s0); for (const p of pc.pts) out.push(p); matched += polyLen(pc.pts); sPrev = pc.s1; }
  if (sPrev < T.L - 1) { raw(sPrev, T.L); out.push(pointAt(T.L)); }
  const xy = out.filter((p, i) => i === 0 || dxy(p, out[i - 1]) > 0.3);
  let total = 0; for (let i = 1; i < xy.length; i++) total += dxy(xy[i - 1], xy[i]);
  return { ll: xy.map(p => { const q = inv(p[0], p[1]); return [+q[0].toFixed(6), +q[1].toFixed(6)]; }), ratio: total ? matched / total : 0 };
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
    out.push({ rb: true, gr: grp });
  }
  const merge = S.settings.merge, groups = [];
  for (const a of A) {
    if (used.has(a)) continue;
    const gr = groups[groups.length - 1];
    if (gr && a.s - gr[gr.length - 1].s < merge && a.s - gr[0].s < merge * 1.8) gr.push(a); else groups.push([a]);
  }
  for (const gr of groups) out.push({ rb: false, gr });
  out.sort((a, b) => a.gr[0].s - b.gr[0].s);
  const notes = [];
  out.forEach((o, i) => {
    const prevS = i > 0 ? out[i - 1].gr[out[i - 1].gr.length - 1].s : null, nextS = i < out.length - 1 ? out[i + 1].gr[0].s : null;
    const n = o.rb ? roundaboutNote(g, o.gr, prevS, nextS) : noteFromGroup(g, o.gr, prevS, nextS);
    if (n) notes.push(n);
  });
  return notes;
}
function walkLimits(first, last, mainS, prevS, nextS) {    // longueur du parcours dessiné avant / après le carrefour
  const R = S.settings.tulipR, span = Math.max(0, last.s - first.s);
  let back = R * 1.4 + Math.max(0, mainS - first.s), fwd = span + R * 1.4;
  if (prevS != null) back = Math.min(back, Math.max(12, first.s - prevS));
  if (nextS != null) fwd = Math.min(fwd, Math.max(span + 15, nextS - first.s));
  return [back, fwd];
}
function roundaboutNote(g, grp, prevS, nextS) {
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
  const [bl, fl] = walkLimits(first, last, first.s, prevS, nextS);
  const back = guidedWalk(g, first.J, first.entry.b, first.s, -1, bl);
  const fwdw = guidedWalk(g, first.J, first.exit.b, first.s, +1, Math.max(fl, last.s - first.s + 15));
  const tulip = buildTulip(c, first.hIn, reverseChain(back).concat(fwdw.slice(1)), collectOthers(g, c, grp.map(x => x.J), R), 'junction');
  const text = ['Rond-point', (no === 1 ? '1re' : no + 'e') + ' sortie', 'sur ' + wayLabel(last.exit.b.way)].join('\n');
  const n = mkNote({ s: first.s, xy: c, text, cap: Math.round(last.hOut) % 360, kind: 'junction', tulip });
  n.span = [Math.round(first.s), Math.round(last.s)];
  n.src = { t: 'rb', ids: grp.map(x => x.J.id), ss: grp.map(x => Math.round(x.s * 10) / 10), k: grp.map(x => x.ev.kind) };
  return n;
}
function noteFromGroup(g, gr, prevS, nextS) {
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
  const exN = tName(exitWay.tags), enN = tName(first.entry.b.way.tags);
  const trackName = S.settings.landmarks && exN && exN !== enN ? (exN.length > 30 ? exN.slice(0, 29) + '…' : exN) : null;
  const R = S.settings.tulipR;
  const [bl, fl] = walkLimits(first, last, main.s, prevS, nextS);
  const back = guidedWalk(g, first.J, first.entry.b, first.s, -1, bl);
  const fwdw = guidedWalk(g, first.J, first.exit.b, first.s, +1, fl);
  const chain = reverseChain(back).concat(fwdw.slice(1));
  const tulip = buildTulip(main.J.xy, hIn, chain, collectOthers(g, main.J.xy, gr.map(x => x.J), R), 'junction');
  const note = mkNote({ s: main.s, xy: main.J.xy, text: lines.join('\n'), cap: Math.round(hOut) % 360, kind: 'junction', tulip });
  note.span = [Math.round(first.s), Math.round(last.s)];
  if (trackName) note.trackName = trackName;
  note.src = { t: 'j', ids: gr.map(x => x.J.id), ss: gr.map(x => Math.round(x.s * 10) / 10), k: gr.map(x => x.ev.kind) };
  return note;
}
function reverseChain(ch) { const r = ch.slice().reverse(); return r.map((q, k) => ({ p: q.p, c: k > 0 ? r[k - 1].c : q.c })); }
function collectOthers(g, c, seeds, R) {      // toutes les voies reliées à l'intersection, dans le rayon
  const lim = R * 1.75, seen = new Set(), segs = new Map(), q = [];
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
    let d3 = angDiff(trackBearing(s - 60, s), trackBearing(s, s + 60));      // grande épingle
    if (Math.abs(d3) < Math.max(118, st.bendAngle)) d3 = 0;
    let d4 = angDiff(trackBearing(s - 80, s - 40), trackBearing(s + 40, s + 80));   // demi-tour large entre deux lignes droites
    if (Math.abs(d4) < Math.max(140, st.bendAngle)) d4 = 0;
    const d = [d1, d2, d3, d4].reduce((m, x) => Math.abs(x) > Math.abs(m) ? x : m, 0);
    vals.push({ s, d });
  }
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i], A = Math.abs(v.d);
    if (A < st.bendAngle || v.s < 40 || v.s > T.L - 40) continue;
    let isMax = true;
    for (let j = Math.max(0, i - 8); j <= Math.min(vals.length - 1, i + 8); j++) { const B = Math.abs(vals[j].d); if (B > A || (B === A && j < i)) { isMax = false; break; } }
    if (!isMax) continue;
    if (jNotes.some(n => v.s > (n.span ? n.span[0] : n.s) - 50 && v.s < (n.span ? n.span[1] : n.s) + 50) || out.some(n => Math.abs(n.s - v.s) < 50)) continue;
    // sens du virage : rotation cumulée pas à pas (un écart de cap proche de 180° ne dit pas de quel côté on a tourné)
    let sum = 0, h = trackBearing(Math.max(0, v.s - 70), Math.max(0, v.s - 70) + 5);
    for (let q = Math.max(0, v.s - 65); q + 5 <= Math.min(T.L, v.s + 70); q += 5) { const h2 = trackBearing(q, q + 5); sum += angDiff(h, h2); h = h2; }
    const sg = Math.abs(sum) > 30 ? Math.sign(sum) : Math.sign(v.d), sd = sg > 0 ? 'D' : 'G';
    const uturn = dxy(pointAt(v.s - 30), pointAt(v.s + 30)) < 10;
    const tot = angDiff(trackBearing(v.s - 75, v.s - 35), trackBearing(v.s + 35, v.s + 75));   // virage complet
    const At = Math.sign(tot) === sg ? Math.max(A, Math.abs(tot)) : A;
    const text = uturn ? 'Demi-tour' : (At >= 130 ? 'Épingle à ' : 'Virage serré à ') + sd;
    const tt = trackTulip(v.s, 'bend');
    const bn = mkNote({ s: v.s, xy: tt.xy, text, cap: Math.round(trackBearing(v.s, v.s + 30)) % 360, kind: 'bend', tulip: tt.tulip });
    bn.src = { t: 'trk', kind: 'bend' }; out.push(bn);
  }
  return out;
}
function mkNote(o) {
  const ll = inv(o.xy[0], o.xy[1]);
  return { id: S.nextId++, s: Math.round(o.s * 10) / 10, lat: +ll[0].toFixed(6), lon: +ll[1].toFixed(6), text: o.text || '',
    cap: o.cap == null ? null : o.cap, showCap: o.showCap != null ? o.showCap : S.settings.showCap, danger: 0, wp: null,
    auto: o.auto !== false, edited: false, kind: o.kind, tulip: o.tulip };
}
function startNote() { const t = trackTulip(0, 'start'), n = mkNote({ s: 0, xy: t.xy, text: 'Départ', cap: Math.round(trackBearing(0, 50)) % 360, kind: 'start', tulip: t.tulip }); n.src = { t: 'trk', kind: 'start' }; return n; }
function endNote() { const t = trackTulip(T.L, 'end'), n = mkNote({ s: T.L, xy: t.xy, text: 'Arrivée', showCap: false, kind: 'end', tulip: t.tulip }); n.src = { t: 'trk', kind: 'end' }; return n; }

/* ============================================================
   8c. Repères OpenStreetMap ajoutés aux notes
   gués, passages à niveau, stops, portails, ponts, tunnels, lignes électriques, voies ferrées,
   revêtements, pentes, clôtures, villages, cols, stations-service, repères visuels, lieux-dits
   ============================================================ */
const BARRIER_TXT = { gate: 'Portail', lift_gate: 'Barrière', swing_gate: 'Barrière pivotante', sliding_gate: 'Portail coulissant', cattle_grid: 'Grille à bétail',
  chain: 'Chaîne', bollard: 'Plots', block: 'Blocs', stile: 'Passage étroit', kissing_gate: 'Passage étroit', cycle_barrier: 'Chicane', toll_booth: 'Péage',
  border_control: 'Douane', jersey_barrier: 'Muret', log: 'Tronc en travers', debris: 'Débris', rope: 'Corde', motorcycle_barrier: 'Barrière anti-moto' };
const HAZARD_TXT = { falling_rocks: 'chute de pierres', slippery: 'glissant', animal_crossing: 'animaux', ice: 'verglas', landslide: 'glissement de terrain',
  flooding: 'zone inondable', dangerous_junction: 'carrefour dangereux', curve: 'virage', curves: 'virages', bump: 'bosse', dip: 'cassis',
  school_zone: 'école', children: 'enfants', cyclists: 'cyclistes', horse_riders: 'cavaliers', side_winds: 'vent latéral', damaged_road: 'route abîmée' };
const SURF_TXT = { sand: 'Sable', mud: 'Boue', rock: 'Cailloux', rocks: 'Cailloux', stone: 'Cailloux', pebblestone: 'Cailloux', snow: 'Neige', ice: 'Glace' };
const SMOOTH_TXT = { very_bad: ['Piste dégradée', 0], horrible: ['Piste très dégradée', 1], very_horrible: ['Piste très dégradée', 1], impassable: ['Piste impraticable', 2] };
const tName = t => (t && t.name || '').trim();
const tEle = t => { const e = parseFloat(t && t.ele); return isFinite(e) ? ` (${Math.round(e)} m)` : ''; };
const isBridge = t => !!t && !!t.bridge && t.bridge !== 'no';
function sideOf(s, p) { return angDiff(trackBearing(s - 15, s + 15), bxy(pointAt(s), p)) > 0 ? 'D' : 'G'; }
function nearestPass(p, maxD) { const c = projAll(p, maxD); return c.length ? c.reduce((a, b) => b.d < a.d ? b : a) : null; }
function routeSamples(g, step) {          // chemin OSM emprunté tous les `step` mètres, et sens de parcours
  const out = [];
  for (let s = 0; s <= T.L; s += step) {
    const p = pointAt(s), ws = nearestWaySeg(g, p, 4);
    let dir = 0;
    if (ws) dir = Math.abs(angDiff(bxy(ws.a.xy, ws.b.xy), trackBearing(s - 3, s + 3))) < 90 ? 1 : -1;
    out.push({ s, w: ws ? ws.w : null, dir });
  }
  return out;
}
function segCross(a, b, c, d) {           // intersection stricte des segments [a,b] et [c,d] → position sur [a,b]
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1], t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999 ? t : null;
}
function trackCrossings(pts) {            // distances (s) où la ligne `pts` coupe le parcours
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(dxy(a, b) / 25)), seen = new Set();
    for (let k = 0; k <= n; k++) {
      const [cx, cy] = cellOf(lerp(a, b, k / n));
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = T.grid.get(cellKey(cx + dx, cy + dy)); if (!arr) continue;
        for (const j of arr) {
          if (seen.has(j)) continue; seen.add(j);
          const t = segCross(T.xy[j], T.xy[j + 1], a, b);
          if (t != null) out.push(T.cum[j] + t * (T.cum[j + 1] - T.cum[j]));
        }
      }
    }
  }
  out.sort((x, y) => x - y);
  return out.filter((v, i) => i === 0 || v - out[i - 1] > 15);
}
function lineGrid(list, sampled) {
  const grid = new Map();
  list.forEach(L => {
    const cells = new Set();
    if (sampled) for (let i = 0; i < L.pts.length - 1; i++) { const n = Math.max(1, Math.ceil(dxy(L.pts[i], L.pts[i + 1]) / 20)); for (let k = 0; k <= n; k++) { const c = cellOf(lerp(L.pts[i], L.pts[i + 1], k / n)); cells.add(cellKey(c[0], c[1]) + '|' + i); } }
    else for (let x = Math.floor(L.bb[0] / CELL); x <= Math.floor(L.bb[2] / CELL); x++) for (let y = Math.floor(L.bb[1] / CELL); y <= Math.floor(L.bb[3] / CELL); y++) cells.add(cellKey(x, y) + '|-1');
    for (const c of cells) { const [ck, i] = c.split('|'); let a = grid.get(+ck); if (!a) grid.set(+ck, a = []); a.push([L, +i]); }
  });
  return grid;
}
function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function addTrackNames(notes) {       // nom de la piste / rue prise au carrefour, en dernière ligne
  for (const n of notes) if (n.trackName) { const l = (n.text || '').split('\n').filter(Boolean); if (!l.includes(n.trackName)) l.push(n.trackName); n.text = l.join('\n'); delete n.trackName; }
}
function osmExtras(g, notes) {
  const st = S.settings, ev = [], STEP = 5;
  const smp = routeSamples(g, STEP), wayAtS = s => smp[clamp(Math.round(s / STEP), 0, smp.length - 1)].w;
  const jS = notes.filter(n => n.kind === 'junction').map(n => n.s).sort((a, b) => a - b);
  if (st.pois) {
    // 1. nœuds du chemin : gués, passages à niveau, stops, barrières, cols, dangers
    for (const n of g.nodes.values()) {
      const t = n.tags; if (!t) continue;
      const it = [];
      if (/^(yes|stepping_stones)$/.test(t.ford || '')) it.push({ text: 'Gué', danger: 1, key: 'ford' });
      if (/^(level_crossing|crossing)$/.test(t.railway || '')) it.push({ text: 'Passage à niveau', danger: 1, key: 'rail', prio: 2 });
      if (t.highway === 'stop') it.push({ text: 'STOP', key: 'stop', stop: true });
      if (t.highway === 'give_way') it.push({ text: 'Cédez le passage', key: 'stop', stop: true });
      if (BARRIER_TXT[t.barrier]) it.push({ text: BARRIER_TXT[t.barrier] + (/^(private|no)$/.test(t.access || '') ? ' (privé)' : ''), key: 'barrier' });
      if (t.mountain_pass === 'yes' || t.natural === 'saddle') it.push({ text: (tName(t) || 'Col') + tEle(t), key: 'col' });
      if (t.hazard) it.push({ text: 'Danger : ' + (HAZARD_TXT[t.hazard] || t.hazard.replace(/_/g, ' ')), danger: 2, key: 'hazard' });
      if (!it.length) continue;
      for (const ps of passes(n.xy, 6)) for (const e of it) {
        if (e.stop) {               // le panneau ne compte que si l'on arrive au carrefour
          const ahead = jS.find(js => js >= ps.s - 2 && js - ps.s <= 45);
          if (ahead == null && jS.some(js => js < ps.s - 2 && ps.s - js <= 30)) continue;
          ev.push({ ...e, s: ahead != null ? ahead : ps.s, own: true });
        } else ev.push({ ...e, s: ps.s, own: true });
      }
    }
    // 2. attributs des chemins parcourus : ponts, tunnels, gués, marches, revêtement, état, pente
    const runs = []; let cur = null;
    for (const q of smp) { if (!cur || cur.w !== q.w) { cur = { w: q.w, s0: q.s, s1: q.s, dir: q.dir }; runs.push(cur); } else cur.s1 = q.s; }
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i]; if (!r.w) continue;
      const t = r.w.tags, pt = i > 0 && runs[i - 1].w ? runs[i - 1].w.tags : {}, len = r.s1 - r.s0 + STEP;
      const enter = (k, re) => re.test(t[k] || '') && !re.test(pt[k] || '');
      if (isBridge(t) && !isBridge(pt) && len >= 6) ev.push({ s: r.s0, text: 'Pont', key: 'bridge', own: true });
      if (enter('tunnel', /^(yes|building_passage|avalanche_protector)$/)) ev.push({ s: r.s0, text: t.tunnel === 'building_passage' ? 'Passage sous bâtiment' : 'Tunnel', key: 'tunnel', own: true });
      if (enter('ford', /^(yes|stepping_stones)$/)) ev.push({ s: r.s0, text: 'Gué', danger: 1, key: 'ford', own: true });
      if (t.highway === 'steps' && pt.highway !== 'steps') ev.push({ s: r.s0, text: 'Marches', danger: 2, key: 'steps', own: true });
      const sf = SURF_TXT[(t.surface || '').split(';')[0]], psf = SURF_TXT[(pt.surface || '').split(';')[0]];
      if (sf && sf !== psf && len >= 20) ev.push({ s: r.s0, text: sf, key: 'surf', own: true });
      const sm = SMOOTH_TXT[t.smoothness], psm = SMOOTH_TXT[pt.smoothness];
      if (sm && (!psm || psm[0] !== sm[0]) && len >= 30) ev.push({ s: r.s0, text: sm[0], danger: sm[1], key: 'smooth', own: true });
      const m = /^(-?\d+(?:[.,]\d+)?)\s*%$/.exec(t.incline || '');
      if (m && len >= 20) {
        const v = parseFloat(m[1].replace(',', '.')) * (r.dir || 1), pm = /^(-?\d+(?:[.,]\d+)?)\s*%$/.exec(pt.incline || '');
        if (Math.abs(v) >= 12 && !pm) ev.push({ s: r.s0, text: (v > 0 ? 'Montée raide' : 'Descente raide') + ` (${Math.round(Math.abs(v))} %)`, danger: Math.abs(v) >= 20 ? 1 : 0, key: 'incline', own: true });
      }
    }
    // 3. croisements : lignes électriques, voies ferrées, ponts au-dessus du parcours
    for (const L of g.lines) {
      if (L.k === 'ht' || L.k === 'elec') for (const s of trackCrossings(L.pts)) ev.push({ s, text: L.k === 'ht' ? 'Sous ligne HT' : 'Sous ligne électrique', key: 'power', own: true, attach: 40 });
      if (L.k === 'rail') for (const s of trackCrossings(L.pts)) {
        if (L.tags.tunnel && L.tags.tunnel !== 'no') continue;
        const myW = wayAtS(s), mine = myW && isBridge(myW.tags);
        const text = mine ? 'Pont sur voie ferrée' : isBridge(L.tags) ? 'Sous voie ferrée' : (myW && myW.tags.tunnel === 'yes') ? null : 'Voie ferrée';
        if (text) ev.push({ s, text, danger: text === 'Voie ferrée' ? 1 : 0, key: 'rail', prio: text === 'Voie ferrée' ? 1 : 3, own: true });
      }
    }
    for (const w of g.ways) {
      if (!isBridge(w.tags)) continue;
      const pts = w.nodes.map(id => g.nodes.get(id)).filter(Boolean).map(n => n.xy);
      for (const s of trackCrossings(pts)) { const myW = wayAtS(s); if (myW === w || (myW && isBridge(myW.tags))) continue; ev.push({ s, text: 'Sous pont', key: 'under', own: true }); }
    }
    // 4. clôtures, murs et haies le long du parcours
    const par = g.lines.filter(L => L.k === 'fence' || L.k === 'wall' || L.k === 'hedge');
    if (par.length) {
      const grid = lineGrid(par, true), fl = [];
      for (let s = 0; s <= T.L; s += 10) {
        const p = pointAt(s), H = trackBearing(s - 10, s + 10), [cx, cy] = cellOf(p); let best = null;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [L, i] of grid.get(cellKey(cx + dx, cy + dy)) || []) {
          const a = L.pts[i], b = L.pts[i + 1]; if (!b) continue;
          const pr = segProj(p, a, b); if (pr.d > 12 || pr.d < 0.5) continue;
          const an = Math.abs(angDiff(H, bxy(a, b))); if (Math.min(an, 180 - an) > 25) continue;
          if (!best || pr.d < best.d) best = { k: L.k, d: pr.d, side: angDiff(H, bxy(p, pr.q)) > 0 ? 'D' : 'G' };
        }
        fl.push({ s, id: best ? best.k + best.side : null, b: best });
      }
      for (let i = 0; i < fl.length;) {
        let j = i; while (j + 1 < fl.length && fl[j + 1].id === fl[i].id) j++;
        if (fl[i].id && fl[j].s - fl[i].s >= 60) { const b = fl[i].b; ev.push({ s: fl[i].s, text: `Longer ${b.k === 'fence' ? 'clôture' : b.k === 'wall' ? 'mur' : 'haie'} à ${b.side}`, key: 'par', attach: 60, own: true }); }
        i = j + 1;
      }
    }
    // 5. entrée et sortie des villages (zones habitées)
    const res = g.lines.filter(L => L.k === 'resid');
    if (res.length) {
      const grid = lineGrid(res, false), inn = [];
      for (let s = 0; s <= T.L; s += 20) {
        const p = pointAt(s), [cx, cy] = cellOf(p); let P = null;
        for (const [L] of grid.get(cellKey(cx, cy)) || []) if (p[0] >= L.bb[0] && p[0] <= L.bb[2] && p[1] >= L.bb[1] && p[1] <= L.bb[3] && pointInPoly(p, L.pts)) { P = L; break; }
        inn.push({ s, P });
      }
      // segments « dans le village », en ignorant les petits trous (< 120 m) et les petites zones (< 80 m)
      const segs = []; let cs = null;
      for (const q of inn) { if (q.P) { if (cs && q.s - cs.s1 <= 120) { cs.s1 = q.s; } else { cs = { s0: q.s, s1: q.s, P: q.P }; segs.push(cs); } } }
      const places = g.pois.filter(q => /^(city|town|village|hamlet)$/.test(q.tags.place || '') && tName(q.tags));
      const nameAt = (s, P) => { if (tName(P.tags)) return tName(P.tags); const p = pointAt(s); let b = null; for (const q of places) { const d = dxy(q.xy, p); if (d < 2500 && (!b || d < b.d)) b = { d, n: tName(q.tags) }; } return b ? b.n : ''; };
      for (const sg of segs) {
        if (sg.s1 - sg.s0 < 80) continue;
        const name = nameAt((sg.s0 + sg.s1) / 2, sg.P);
        if (sg.s0 > 30) ev.push({ s: sg.s0, text: 'Entrée ' + (name || 'agglomération'), key: 'village-in', own: true });
        if (sg.s1 < T.L - 30) ev.push({ s: sg.s1, text: 'Sortie ' + (name || 'agglomération'), key: 'village-out', own: true });
      }
    }
  }
  // 6. repères isolés : châteaux d'eau, antennes, églises, éoliennes, stations-service, cols, sommets, lieux-dits, dangers
  for (const P of g.pois) {
    const t = P.tags; let txt = null, kind = 'land', maxD = 150, danger = 0;
    if (t.man_made === 'water_tower') txt = "Château d'eau";
    else if (/^(mast|communications_tower)$/.test(t.man_made || '') || (t.man_made === 'tower' && /communication/.test(t['tower:type'] || ''))) txt = 'Antenne';
    else if (t.man_made === 'tower') txt = 'Tour';
    else if (t.man_made === 'chimney') txt = 'Cheminée';
    else if (t.man_made === 'windmill') txt = 'Moulin';
    else if (t.man_made === 'lighthouse') txt = 'Phare';
    else if (t.power === 'generator') txt = 'Éolienne';
    else if (t.amenity === 'place_of_worship') txt = !t.religion || t.religion === 'christian' ? 'Église' : 'Lieu de culte';
    else if (t.amenity === 'fuel') { txt = 'Station-service'; kind = 'fuel'; maxD = 60; }
    else if (t.natural === 'peak') { txt = 'Sommet' + (tName(t) ? ' ' + tName(t) : '') + tEle(t); maxD = 250; }
    else if (t.natural === 'saddle' || t.mountain_pass === 'yes') { txt = (tName(t) || 'Col') + tEle(t); kind = 'col'; maxD = 80; }
    else if (/^(locality|isolated_dwelling|hamlet)$/.test(t.place || '') && tName(t)) { txt = (t.place === 'hamlet' ? 'Hameau ' : 'Lieu-dit ') + tName(t); kind = 'place'; }
    else if (t.hazard) { txt = 'Danger : ' + (HAZARD_TXT[t.hazard] || t.hazard.replace(/_/g, ' ')); kind = 'hazard'; maxD = 40; danger = 2; }
    if (!txt) continue;
    if ((kind === 'land' || kind === 'place') ? !st.landmarks : !st.pois) continue;
    const pr = nearestPass(P.xy, maxD); if (!pr) continue;
    const side = pr.d > 8 ? ' à ' + sideOf(pr.s, P.xy) : '';
    if (kind === 'col' || kind === 'hazard') ev.push({ s: pr.s, text: txt, key: kind, own: true, danger });
    else if (kind === 'fuel') ev.push({ s: pr.s, text: txt + side, key: 'fuel', attach: 40, own: true });
    else if (kind === 'place') ev.push({ s: pr.s, text: txt, key: 'place:' + tName(t), attach: 150, own: pr.d < 80 });
    else ev.push({ s: pr.s, text: txt + side, key: 'land:' + P.id, attach: 150, own: pr.d <= 40 });
  }
  // 7. regroupement : ajouté à la note la plus proche, ou nouvelle note
  ev.sort((a, b) => a.s - b.s);
  const kept = [];
  for (const e of ev) {
    const d = kept.find(k => k.key === e.key && Math.abs(k.s - e.s) < 30);
    if (d) { if ((e.prio || 0) > (d.prio || 0)) Object.assign(d, e); continue; }
    kept.push(e);
  }
  let added = 0;
  for (const e of kept) {
    let best = null;
    for (const n of notes) { const d = Math.abs(n.s - e.s); if (!best || d < best.d) best = { n, d }; }
    if (best && best.d <= (e.attach || 25)) {
      const lines = (best.n.text || '').split('\n').filter(Boolean);
      if (!lines.includes(e.text)) { if (e.danger) lines.splice(Math.min(1, lines.length), 0, e.text); else lines.push(e.text); }
      best.n.text = lines.join('\n');
      if (e.danger) best.n.danger = Math.max(best.n.danger || 0, e.danger);
    } else if (e.own) {
      const tt = trackTulip(e.s, 'info');
      const nn = mkNote({ s: e.s, xy: tt.xy, text: e.text, cap: Math.round(trackBearing(e.s, e.s + 30)) % 360, kind: 'info', tulip: tt.tulip });
      nn.src = { t: 'trk', kind: 'info' }; nn.danger = e.danger || 0;
      notes.push(nn); notes.sort((a, b) => a.s - b.s); added++;
    }
  }
  return { events: kept.length, added };
}

/* ============================================================
   9. Tulipes : géométrie & dessin
   ============================================================ */
const rnd = p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
// Tulipe carrée : échelle et centre (unités SVG 0..100) ; le carrefour est un peu au-dessus du milieu
const TK = 44, TCX = 50, TCY = 52;
function tulipBoxes(R) {        // [x0, y0, x1, y1] en mètres (y vers le haut)
  const k = TK / R;
  return { full: [-TCX / k, -(100 - TCY) / k, (100 - TCX) / k, TCY / k],     // toute la case
           route: [-(TCX - 7) / k, -(94 - TCY) / k, (93 - TCX) / k, (TCY - 6) / k] };  // parcours : marge pour le point et la flèche
}
function clipSegBox(a, b, bx) {      // Liang-Barsky
  const dx = b[0] - a[0], dy = b[1] - a[1], p = [-dx, dx, -dy, dy], q = [a[0] - bx[0], bx[2] - a[0], a[1] - bx[1], bx[3] - a[1]];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  if (t0 > t1) return null;
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}
function clipPolyBox(pts, bx) {
  const out = []; let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const c = clipSegBox(pts[i], pts[i + 1], bx);
    if (!c) { if (cur) { out.push(cur); cur = null; } continue; }
    if (cur && dxy(cur[cur.length - 1], c[0]) < 1e-6) cur.push(c[1]);
    else { if (cur) out.push(cur); cur = [c[0], c[1]]; }
  }
  if (cur) out.push(cur);
  return out;
}
function clipPolygonBox(pts, bx) {     // Sutherland-Hodgman sur un rectangle
  let poly = dxy(pts[0], pts[pts.length - 1]) < 0.01 ? pts.slice(0, -1) : pts.slice();
  const ix = (a, b, x) => [x, a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1])];
  const iy = (a, b, y) => [a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), y];
  const edges = [[p => p[0] >= bx[0], (a, b) => ix(a, b, bx[0])], [p => p[0] <= bx[2], (a, b) => ix(a, b, bx[2])], [p => p[1] >= bx[1], (a, b) => iy(a, b, bx[1])], [p => p[1] <= bx[3], (a, b) => iy(a, b, bx[3])]];
  for (const [inside, cut] of edges) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length], ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(cut(prev, cur)); out.push(cur); } else if (pi) out.push(cut(prev, cur));
    }
    poly = out; if (!poly.length) break;
  }
  return poly;
}
function buildTulip(c, H, chain, others, kind) {
  const R = S.settings.tulipR, co = Math.cos(H * D2R), si = Math.sin(H * D2R), B = tulipBoxes(R);
  const tr = p => { const x = p[0] - c[0], y = p[1] - c[1]; return [x * co - y * si, x * si + y * co]; };
  let rt = chain.map(q => ({ p: tr(q.p), c: q.c }));
  if (kind === 'start' || kind === 'end') rt = rt.filter((q, i) => i === 0 || dxy(q.p, rt[i - 1].p) > 0.01);
  let ci = 0, bd = Infinity;
  rt.forEach((q, i) => { const d = q.p[0] * q.p[0] + q.p[1] * q.p[1]; if (d < bd) { bd = d; ci = i; } });
  rt = clipChain(rt, ci, B.route);
  const oth = [];
  for (const o of others) for (const piece of clipPolyBox(o.pts.map(tr), B.full)) if (polyLen(piece) > 1.5) oth.push({ c: o.c, p: piece.map(rnd) });
  const wa = [], wl = [], bld = [];
  for (const f of featuresNear(G, c, R * 1.7)) {
    const pts = f.pts.map(tr);
    if (f.area) { const poly = clipPolygonBox(pts, B.full); if (poly.length >= 3) (f.k === 'bld' ? bld : wa).push(poly.map(rnd)); }
    else for (const piece of clipPolyBox(pts, B.full)) if (polyLen(piece) > 1.5) wl.push({ k: f.k, p: piece.map(rnd) });
  }
  const t = { R, sq: 1, kind, route: rt.map(q => ({ p: rnd(q.p), c: q.c })), others: oth };
  if (wa.length) t.wa = wa; if (wl.length) t.wl = wl; if (bld.length) t.bld = bld;
  return t;
}
function clipChain(rt, ci, bx) {
  if (!rt.length) return rt;
  const inside = i => rt[i].p[0] >= bx[0] && rt[i].p[0] <= bx[2] && rt[i].p[1] >= bx[1] && rt[i].p[1] <= bx[3];
  if (!inside(ci)) return [rt[ci]];
  let a = ci, b = ci;
  while (a > 0 && inside(a - 1)) a--;
  while (b < rt.length - 1 && inside(b + 1)) b++;
  const res = rt.slice(a, b + 1).map(q => ({ p: q.p, c: q.c }));
  if (a > 0) { const cc = clipSegBox(rt[a - 1].p, rt[a].p, bx); if (cc) res.unshift({ p: cc[0], c: rt[a].c }); }
  if (b < rt.length - 1) { const cc = clipSegBox(rt[b].p, rt[b + 1].p, bx); if (cc) res.push({ p: cc[1], c: rt[b + 1].c }); }
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
const HALO = 8.2;                      // largeur du liseré blanc (la route noire fait 6,4)
const ROUTE_C = '#0000FF';            // parcours à suivre : bleu pur (distinct du bleu ciel des cours d'eau), le reste en noir
function freeSyms(list, c, W, H) {       // symboles posés librement : x, y = centre en % de la case, h = hauteur en % de la case
  let o = '';
  for (const q of list || []) { const S = FIA_LEX[q.k]; if (!S || q.c !== c) continue; const h = q.h / 100 * H, w = h * S.w / S.h; o += `<image x="${f1(q.x / 100 * W - w / 2)}" y="${f1(q.y / 100 * H - h / 2)}" width="${f1(w)}" height="${f1(h)}" href="${S.d}" xlink:href="${S.d}"/>`; }
  return o;
}
function freeLayer(list, c) {            // même chose en HTML, pour le roadbook à l'écran et à l'impression
  const a = (list || []).filter(q => q.c === c && FIA_LEX[q.k]);
  return a.map(q => `<img class="fs" src="${FIA_LEX[q.k].d}" alt="" style="left:${q.x}%;top:${q.y}%;height:${q.h}%">`).join('');
}
function tulipSVG(t, size, syms) {
  size = size || 100;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" width="${size}" height="${size}"><rect width="100" height="100" fill="#fff"/>`;
  if (!t) return s + '</svg>';
  const k = TK / t.R, cx = TCX, cy = TCY;
  const sc = p => [cx + p[0] * k, cy - p[1] * k];
  const dd = pts => pts.length > 1 ? 'M' + pts.map(p => f1(p[0]) + ' ' + f1(p[1])).join('L') : '';
  const ln = (pts, attrs) => { const d = dd(pts); return d ? `<path d="${d}" fill="none" stroke-linejoin="round" ${attrs}/>` : ''; };
  // cours d'eau (bleu ciel), plans d'eau, bâtiments — découpés au cercle de la tulipe
  let bg = '';
  for (const a of t.wa || []) bg += `<path d="${dd(a.map(sc))}Z" fill="#cdeefb" stroke="#5bc0eb" stroke-width="0.9"/>`;
  for (const l of t.wl || []) bg += ln(l.p.map(sc), `stroke="#5bc0eb" stroke-width="${l.k === 'river' ? 5 : l.k === 'stream' ? 2.6 : 1.7}" stroke-linecap="round"`);
  for (const b of t.bld || []) bg += `<path d="${dd(b.map(sc))}Z" fill="#e2e2e2" stroke="#222" stroke-width="1"/>`;
  s += bg;
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
    // épaisseurs prises sur les flèches du lexique (tige = 30 % de la largeur de la tête) : route = double trait fin, piste = trait plein, hors piste = pointillés
    // liseré blanc sous la flèche : il cache le dessin noir de la même route (6,4 de large), qui dépassait de chaque côté
    for (const r of runs) s += ln(r.p, `stroke="#fff" stroke-width="${HALO}" stroke-linecap="round"`);
    for (const r of runs) if (r.c === 'road') s += ln(r.p, `stroke="${ROUTE_C}" stroke-width="5.2"`);
    for (const r of runs) if (r.c === 'road') s += ln(r.p, 'stroke="#fff" stroke-width="1.7"');
    for (const r of runs) if (r.c === 'track') s += ln(r.p, `stroke="${ROUTE_C}" stroke-width="4.8"`);
    for (const r of runs) if (r.c === 'trail') s += ln(r.p, `stroke="${ROUTE_C}" stroke-width="4.6" stroke-dasharray="4.6 3.8"`);
    const st = rt[0].p;
    s += `<circle cx="${f1(st[0])}" cy="${f1(st[1])}" r="4.6" fill="${ROUTE_C}"/>`;
    const ux = dir[0], uy = dir[1];
    if (!isEnd) {
      const AL = 12, W = 8, bx = end[0] - ux * AL, by = end[1] - uy * AL;
      s += `<path d="M${f1(end[0])} ${f1(end[1])}L${f1(bx - uy * W)} ${f1(by + ux * W)}L${f1(bx + uy * W)} ${f1(by - ux * W)}Z" fill="${ROUTE_C}"/>`;
    } else {
      const W = 11;
      s += `<path d="M${f1(end[0] - uy * W)} ${f1(end[1] + ux * W)}L${f1(end[0] + uy * W)} ${f1(end[1] - ux * W)}" stroke="${ROUTE_C}" stroke-width="4"/>`;
      // drapeau à damier
      const fx = clamp(end[0] + 13, 4, 76), fy = clamp(end[1] - 16, 3, 80);
      s += `<path d="M${f1(fx)} ${f1(fy + 26)}V${f1(fy)}" stroke="#000" stroke-width="2.2"/>`;
      for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) s += `<rect x="${f1(fx + q * 5)}" y="${f1(fy + r * 4.5)}" width="5" height="4.5" fill="${(r + q) % 2 ? '#fff' : '#000'}"/>`;
      s += `<rect x="${f1(fx)}" y="${f1(fy)}" width="20" height="13.5" fill="none" stroke="#000" stroke-width="1"/>`;
    }
  }
  return s + freeSyms(syms, 't', 100, 100) + '</svg>';
}
function wrapText(str, n) {
  const words = String(str).split(/\s+/).filter(Boolean), out = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
function notesSVG(n) {
  // Texte seul : le lecteur de roadbook ajoute lui-même le CAP (encadré jaune), les dangers et les cadres FIM.
  const W = 400, H = 300, FF = 'Arial Narrow, Roboto Condensed, Arial, sans-serif';
  const lines = (n.text || '').split('\n');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  let y = 10;
  for (const l of wrapText(lines[0] || '', 12).slice(0, 2)) { y += 66; s += `<text x="16" y="${y}" font-family="${FF}" font-weight="bold" font-size="64" fill="#000">${esc(l)}</text>`; }
  y += 8;
  const lk = lexKeys(n);                 // symboles du lexique FIA, sous la direction, en rangées
  if (lk.length) {
    const GAP = 10, MAXW = W - 32, rowsAt = ih => { let r = 1, x = 16; for (const k of lk) { const w = Math.min(MAXW, ih * FIA_LEX[k].w / FIA_LEX[k].h); if (x > 16 && x + w > 16 + MAXW) { r++; x = 16; } x += w + GAP; } return r; };
    const keep = 44 * Math.min(2, lines.slice(1).filter(l => l.trim()).length);           // place gardée pour 2 lignes de texte
    let IH = 66; while (IH > 30 && y + 4 + rowsAt(IH) * (IH + GAP) + keep > H - 6) IH -= 4;     // réduits si besoin pour tenir dans l'image
    let x = 16, row = 0;
    for (const k of lk) {
      const sy = FIA_LEX[k], w = Math.min(MAXW, IH * sy.w / sy.h), h = w * sy.h / sy.w;
      if (x > 16 && x + w > 16 + MAXW) { row++; x = 16; }
      if (y + 4 + (row + 1) * (IH + GAP) > H) break;
      s += `<image x="${f1(x)}" y="${f1(y + 4 + row * (IH + GAP) + (IH - h) / 2)}" width="${f1(w)}" height="${f1(h)}" href="${sy.d}" xlink:href="${sy.d}"/>`;
      x += w + GAP;
    }
    y += 4 + (row + 1) * (IH + GAP);
  }
  outer: for (const l0 of lines.slice(1)) for (const l of wrapText(l0, 21)) {
    if (y + 44 > H - 8) break outer;
    y += 44; s += `<text x="16" y="${y}" font-family="${FF}" font-size="40" fill="#000">${esc(l)}</text>`;
  }
  return s + freeSyms(n.sym, 'd', W, H) + '</svg>';
}
const WP_TYPES = [
  ['', 'Aucun'], ['wpv', 'WPV — visible'], ['wpm', 'WPM — masqué'], ['wps', 'WPS — sécurité'], ['wpe', 'WPE — éclipse'],
  ['wpc', 'WPC — contrôle'], ['wpn', 'WPN — navigation'], ['wpp', 'WPP — passage'], ['cp', 'CP — contrôle de passage'], ['dss', 'DSS — départ spéciale'], ['ass', 'ASS — arrivée spéciale'],
  ['dn', 'DN — début neutralisation'], ['fn', 'FN — fin neutralisation'], ['dt', 'DT — début liaison'], ['ft', 'FT — fin liaison']
];
const ZONE_TYPES = [['', 'Aucune'], ['dz', 'DZ — début de zone'], ['fz', 'FZ — fin de zone'], ['fzdz', 'FZ + DZ — fin d’une zone et début de la suivante']];
// anciennes notes : DZ / FZ / carburant étaient choisis comme waypoint principal
function normNote(n) {
  if (n.wp && /^(dz|fz)$/.test(n.wp.type)) { n.zone = { type: n.wp.type, speed: n.wp.speed }; n.wp = null; }
  else if (n.wp && n.wp.type === 'fuel') { n.fuel = true; n.wp = null; }
  return n;
}
// Rayons d'ouverture / validation du tableau FIM (null = pas d'ouverture : WPV toujours visible, WPC jamais)
const WP_DEF = { wpm: [800, 90], wpc: [null, 300], wps: [1000, 30], wpn: [800, 200], wpp: [100, 20], wpv: [null, 200], wpe: [1000, 90],
  cp: [1000, 90], dss: [1000, 200], ass: [800, 90], dz: [1000, 90], fz: [1000, 90], fn: [1000, 90], dt: [1000, 90], ft: [1000, 90] };
const isRadiusWP = t => !!WP_DEF[t];          // DN : OpenRally ne lui donne pas de rayons (balise « neutralization » = durée)
const isNumberedWP = t => /^wp[a-z]$/.test(t || '');
// Présentation FIM (page 91 du règlement) : fond de la case distance et symbole de chaque type
const WP_BG = { wpm: '#D8F0F4', wpc: '#FCFCB4', wps: '#EAB49C', wpn: '#F0AEF2', dz: '#E8A058', fz: '#88E050' };
// Symboles : images officielles du lexique FIM (FIM_SYM) + panneau de vitesse dessiné (le chiffre change)
const SPEED_RING = '#FF7E00';
function speedSign(sp, barred) {
  const s = esc(String(sp || '')), n = s.length, fs = n > 2 ? 48 : 62;
  const fit = n > 1 ? ` textLength="${n > 2 ? 72 : 58}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<svg class="sym" viewBox="0 0 100 100" style="width:var(--h)"><circle cx="50" cy="50" r="44" fill="#fff" stroke="${SPEED_RING}" stroke-width="9"/>`
    + (s ? `<text x="50" y="${(50 + fs * 0.36).toFixed(1)}" font-family="Arial,Helvetica,sans-serif" font-weight="700" text-anchor="middle" font-size="${fs}" fill="#000"${fit}>${s}</text>` : '')
    + (barred ? `<path d="M81 19L19 81" stroke="${SPEED_RING}" stroke-width="8" stroke-linecap="round"/>` : '') + '</svg>';
}
const SYM_ALT = { dnv: 'DN', dtv: 'DT', fuel: 'Carburant' };
const symImg = k => ({ a: FIM_SYM[k].w / FIM_SYM[k].h, h: `<img class="sym" src="${FIM_SYM[k].d}" alt="${SYM_ALT[k] || k.toUpperCase()}">` });
const symSign = (sp, barred) => ({ a: 1, h: speedSign(sp, barred) });
function noteSymbols(n, f) {     // ordre du lexique : waypoint, FZ + panneau barré, DZ + panneau, carburant
  const t = n.wp && n.wp.type, zt = n.zone && n.zone.type, out = [];
  if (t && FIM_SYM[t]) {
    const lim = (t === 'dn' || t === 'dt') && n.wp.speed;      // DN / DT avec limitation : rond orange + panneau
    out.push(symImg(lim ? t + 'v' : t));
    if (lim && !zt) out.push(symSign(n.wp.speed));
  }
  if (zt === 'fz' || zt === 'fzdz') { out.push(symImg('fz')); if (f.endSp) out.push(symSign(f.endSp, true)); }
  if (zt === 'dz' || zt === 'fzdz') { out.push(symImg('dz')); if (n.zone.speed) out.push(symSign(n.zone.speed)); }
  if (n.fuel) out.push(symImg('fuel'));
  return out;
}
function symsHTML(syms, close) {  // taille et place calculées pour ne jamais toucher la distance partielle ni la flèche 300 m
  if (!syms.length) return '';
  const gaps = 0.4 * (syms.length - 1), A = syms.reduce((s, x) => s + x.a, 0);
  let h = Math.min(11.5, (14.8 - gaps) / A), hi = false;
  if (h < 8.5) { hi = true; h = Math.min(close ? 8.6 : 11.5, (31 - gaps) / A); }
  return `<div class="syms${hi ? ' hi' : ''}${hi && close ? ' ar' : ''}" style="--h:${h.toFixed(2)}cqw">${syms.map(x => x.h).join('')}</div>`;
}
const ARROW_SVG = '<svg class="arr" viewBox="0 0 20 100" preserveAspectRatio="none"><path d="M10 0V76" stroke="#000" stroke-width="5"/><path d="M1 72L10 100L19 72Z" fill="#000"/></svg>';

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
  else st = S.mm ? 'Trait noir = chemins reconnus · clique sur la trace pour ajouter une note.' : 'Astuce : clique sur la trace pour ajouter une note à la main.';
  $('#status').textContent = st;
}
function rbFlags(notes) {       // zone de vitesse DZ→FZ (et DN/DT avec limite → FN/FT), note suivante à 300 m ou moins, cadre rouge
  let zone = false, zsp = null;
  return notes.map((n, i) => {
    normNote(n);
    const t = n.wp && n.wp.type, zt = n.zone && n.zone.type;
    const endSp = zt === 'fz' || zt === 'fzdz' ? zsp : null;      // vitesse de la zone qui se termine (panneau barré)
    if (zt === 'dz' || zt === 'fzdz') zsp = n.zone.speed || null; else if ((t === 'dn' || t === 'dt') && n.wp.speed) zsp = n.wp.speed;
    if (zt === 'dz' || zt === 'fzdz' || ((t === 'dn' || t === 'dt') && n.wp.speed)) zone = true;
    const z = zone; if (zt === 'fz' || t === 'fn' || t === 'ft') zone = false;
    const nx = notes[i + 1], pv = notes[i - 1];
    return { zone: z, endSp, close: !!nx && nx.s - n.s <= 300, green: !!pv && n.s - pv.s <= 300, red: t === 'wps' || n.danger === 3 };
  });
}
/* ---------- Symboles du lexique FIA ajoutés à une note (case description) ---------- */
const lexKeys = n => (n.lex || []).filter(k => FIA_LEX[k]);
function lexRows(keys, H, W, gap) {      // nombre de rangées quand les symboles (hauteur H) passent à la ligne dans une largeur W
  let rows = keys.length ? 1 : 0, x = 0;
  for (const k of keys) { const s = FIA_LEX[k], w = Math.min(W, H * s.w / s.h); if (x && x + w > W) { rows++; x = 0; } x += w + gap; }
  return rows;
}
function fitLines(lines, dg, cap, lr) {  // lignes secondaires qui tiennent dans la 3e case (le texte complet reste dans la note)
  const extra = lines.slice(1), max = 4 - (dg ? 1 : 0) + (cap ? 0 : 1) - ((lines[0] || '').length > 13 ? 1 : 0) - (lr || 0);
  return extra.length > max ? [...extra.slice(0, Math.max(0, max - 1)), '…'] : extra;
}
function rowInner(n, i, par, f, screen) {
  const t = n.wp && n.wp.type, zt = n.zone && n.zone.type, lines = (n.text || '').split('\n');
  const bg = (t && WP_BG[t]) || (zt === 'fz' ? WP_BG.fz : zt ? WP_BG.dz : null)
    || ((t === 'dn' || t === 'dt') && n.wp.speed ? WP_BG.dz : /^(dn|fn|dt|ft)$/.test(t || '') ? '#D8D8D8' : null) || (f.green ? '#A0D080' : '#fff');
  const sym = symsHTML(noteSymbols(n, f), f.close);
  const dg = n.danger && t !== 'wps' ? `<div class="dg">${'!'.repeat(n.danger)}</div>` : '';
  const cap = n.showCap && n.cap != null ? `<div class="cap">${Math.round(n.cap) % 360}°</div>` : '';
  // symboles du lexique : on les réduit si besoin pour qu'ils tiennent entre la direction et l'encadré du CAP
  const lk = lexKeys(n), avail = 33.3 - 1.4 - (cap ? 6.6 : 1.4) - (n.danger && t !== 'wps' ? 5.7 : 0) - 5.6 * ((lines[0] || '').length > 13 ? 2 : 1) - 0.7;
  let lh = 7.5, lr = lexRows(lk, lh, 29.6, 0.6);
  while (lk.length && lh > 3.5 && lr * (lh + 0.6) > avail) { lh -= 0.5; lr = lexRows(lk, lh, 29.6, 0.6); }
  const lx = lk.length ? `<div class="lx" style="--lh:${lh}cqw">${lk.map(k => `<img src="${FIA_LEX[k].d}" alt="${esc(FIA_LEX[k].l)}" title="${esc(FIA_LEX[k].l)}">`).join('')}</div>` : '';
  return `<div class="k k1" style="background:${bg}"><div class="tot">${kmFr(n.s)}</div><div class="bl"><div class="par">${kmFr(par)}</div>${f.close ? ARROW_SVG : ''}</div>${sym}<div class="br"><div class="num">${i + 1}</div></div></div>`
    + `<div class="k k2">${tulipSVG(n.tulip, 200)}${freeLayer(n.sym, 't')}${t === 'cp' ? '<div class="cpf"></div>' : ''}</div>`
    + `<div class="k k3${cap ? ' hc' : ''}">${dg}<div class="t1">${esc(lines[0] || '')}</div>${lx}${freeLayer(n.sym, 'd')}<div class="t2">${esc(fitLines(lines, !!dg, !!cap, lk.length ? Math.ceil(lr * (lh + 0.6) / 3.96) : 0).join('\n'))}</div>${cap}`
    + (screen && !n.auto ? '<div class="man">manuelle</div>' : '')
    + (screen ? `<div class="acts"><button data-a="edit" title="Modifier la note">✎</button><button data-a="del" title="Supprimer la note">🗑</button></div>` : '') + `</div>`
    + (f.zone ? '<div class="fr zone"></div>' : '') + (f.red ? '<div class="fr red"></div>' : '');
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
  let prev = 0; const fl = rbFlags(S.notes);
  rb.innerHTML = S.notes.map((n, i) => { const par = n.s - prev; prev = n.s; return `<div class="rbr row${n.id === S.sel ? ' sel' : ''}" data-id="${n.id}">${rowInner(n, i, par, fl[i], true)}</div>`; }).join('');
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

function noteNeighbors(n) {
  let p = null, q = null;
  for (const x of S.notes) { if (x === n) continue; if (x.s < n.s && (p === null || x.s > p)) p = x.s; if (x.s > n.s && (q === null || x.s < q)) q = x.s; }
  return [p, q];
}
async function redrawTulip(n, R) {
  if (!T) throw new Error('aucun parcours');
  const c = fwd(n.lat, n.lon), need = R * 1.7 + 10;
  if (need > osmMargin()) {                     // tulipe plus grande que la zone téléchargée : on complète autour de la note
    const sw = inv(c[0] - need, c[1] - need), ne = inv(c[0] + need, c[1] + need);
    for (let ty = Math.floor(sw[0] / TS); ty <= Math.floor(ne[0] / TS); ty++) for (let tx = Math.floor(sw[1] / TS); tx <= Math.floor(ne[1] / TS); tx++) extraTiles.add(tx + ',' + ty);
  }
  if (!G || G.key !== graphKey()) await fetchOSM(() => {}, () => false);
  const oldR = S.settings.tulipR; S.settings.tulipR = R;
  try {
    let src = n.src, t = null;
    if (!src && n.kind === 'junction') {         // note d'une ancienne version : on retrouve le carrefour le plus proche
      let best = null;
      for (const nd of G.nodes.values()) { if (nd.br.length < 3) continue; const d = dxy(nd.xy, c); if (d < 15 && (!best || d < best.d)) best = { nd, d }; }
      const ps = best ? passes(best.nd.xy, 8).filter(x => Math.abs(x.s - n.s) < 60) : [];
      if (ps.length) src = { t: 'j', ids: [best.nd.id], ss: [ps[0].s], k: ['junction'] };
    }
    if (src && (src.t === 'j' || src.t === 'rb')) {
      const gr = [];
      src.ids.forEach((id, i) => { const nd = G.nodes.get(id); if (!nd) return; const r = analyzeEvent(G, { node: nd, s: src.ss[i], d: 0, kind: src.k[i] }); if (r) gr.push(r); });
      if (gr.length) { const [pS, nS] = noteNeighbors(n); const tmp = src.t === 'rb' ? roundaboutNote(G, gr, pS, nS) : noteFromGroup(G, gr, pS, nS); if (tmp) t = tmp.tulip; }
    }
    if (!t) {
      const kind = src && src.kind || (n.kind === 'junction' ? 'manual' : n.kind);
      const pr = projAll(c, 60), sGeo = kind === 'start' ? 0 : kind === 'end' ? T.L : pr.length ? pr.reduce((a, b) => b.d < a.d ? b : a).s : n.s;
      t = trackTulip(sGeo, kind).tulip;
    }
    n.tulip = t;
  } finally { S.settings.tulipR = oldR; }
}
function editNote(id, isNew) {
  const n = S.notes.find(x => x.id === id); if (!n) return;
  normNote(n);
  const wp = n.wp || {}, zone = n.zone || {};
  const body = `
    <div class="fld"><label for="eText">Texte de la note (1re ligne en gros)</label><textarea id="eText" rows="3">${esc(n.text)}</textarea></div>
    <div class="fld"><label>Symboles du lexique FIA <span style="font-weight:400;color:#8a8478">— sous la direction, dans la case description</span></label>
      <div class="stagehelp">Pose les symboles où tu veux : <b>glisse</b> un symbole dans la tulipe ou la case description, règle sa <b>taille</b> avec le curseur (ou la molette).</div>
      <div class="stlabels"><span>Tulipe</span><span>Description</span></div><div class="stage"><div class="stcase" id="stT" data-c="t"><div class="stm" id="stTm"></div><div class="stin" id="stTin"></div></div><div class="stcase" id="stD" data-c="d"><div class="stm" id="stDm"></div><div class="stin" id="stDin"></div></div></div>
      <div class="strow"><label>Taille <input type="range" id="stSize" min="4" max="90" value="16" disabled></label><button type="button" class="mbtn" id="stDel" disabled>Retirer ce symbole</button></div>
      <div class="strow"><button type="button" class="mbtn" id="stFront" disabled>Mettre en avant-plan</button><button type="button" class="mbtn" id="stBack" disabled>Mettre en arrière-plan</button></div>
      <div id="eLexSel" class="lexsel"></div>
      <button type="button" id="eLexOpen" class="mbtn lexadd">＋ Ajouter des symboles</button>
      <div id="eLexPal" class="lexpal" hidden>
        <input id="eLexQ" type="search" placeholder="Chercher : pont, trou, clôture, kpL…" autocomplete="off">
        <div id="eLexTabs" class="lextabs">${FIA_CATS.map((c, i) => `<button type="button" data-c="${esc(c)}"${i ? '' : ' class="on"'}>${esc(c)}</button>`).join('')}</div>
        <div id="eLexGrid" class="lexgrid"></div>
      </div>
    </div>
    <div class="fgrid">
      <div class="fld"><label for="eCap">CAP (°)</label><input id="eCap" type="number" min="0" max="359" value="${n.cap == null ? '' : n.cap}"></div>
      <div class="fld"><label for="eDanger">Danger</label><select id="eDanger">${[0, 1, 2, 3].map(d => `<option value="${d}"${n.danger === d ? ' selected' : ''}>${d ? '!'.repeat(d) + ' (niveau ' + d + ')' : 'Aucun'}</option>`).join('')}</select></div>
      <div class="fld"><label for="eDist">Distance (km)</label><input id="eDist" type="number" step="0.01" min="0" value="${km(n.s)}"></div>
    </div>
    <label class="chk"><input type="checkbox" id="eShowCap"${n.showCap ? ' checked' : ''}> Afficher le CAP sur cette note</label>
    <div class="fld" style="max-width:260px"><label for="eR">Rayon dessiné dans la tulipe (m)</label><input id="eR" type="number" min="20" max="150" step="5" value="${Math.round(n.tulip && n.tulip.R || S.settings.tulipR)}"></div>
    <div class="help">Plus grand = la tulipe montre une zone plus large autour du carrefour.</div>
    <div class="fld"><label for="eWp">Point de passage / waypoint</label><select id="eWp">${WP_TYPES.map(([v, l]) => `<option value="${v}"${(wp.type || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="fgrid" id="eWpRad">
      <div class="fld"><label for="eName">Nom / n°</label><input id="eName" type="text" value="${esc(wp.name || '')}" placeholder="auto"></div>
      <div class="fld"><label for="eOpen">Ouverture (m)</label><input id="eOpen" type="number" min="1" value="${wp.open || ''}"></div>
      <div class="fld"><label for="eClear">Validation (m)</label><input id="eClear" type="number" min="1" value="${wp.clear || ''}"></div>
    </div>
    <div class="fgrid" id="eWpX" style="grid-template-columns:1fr 1fr">
      <div class="fld" id="eDurF"><label for="eDur">Durée de neutralisation (min)</label><input id="eDur" type="number" min="0" value="${wp.dur || ''}"></div>
      <div class="fld" id="eWpSpF"><label for="eWpSp">Vitesse maxi (km/h, facultatif)</label><input id="eWpSp" type="number" min="1" value="${wp.speed || ''}"></div>
    </div>
    <div class="fgrid" style="grid-template-columns:2fr 1fr">
      <div class="fld"><label for="eZone">Zone de vitesse</label><select id="eZone">${ZONE_TYPES.map(([v, l]) => `<option value="${v}"${(zone.type || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="fld" id="eSpeedF"><label for="eSpeed">Vitesse maxi (km/h)</label><input id="eSpeed" type="number" min="1" value="${zone.speed || ''}"></div>
    </div>
    <label class="chk"><input type="checkbox" id="eFuel"${n.fuel ? ' checked' : ''}> ⛽ Carburant (ravitaillement)</label>
    <div class="help">Rayons du tableau FIM proposés par défaut (ouverture vide = WP toujours visible ou jamais ouvert), modifiables selon le règlement de ton épreuve.</div>`;
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
        if (t === 'dn') { const d = parseInt($('#eDur').value, 10); if (d >= 0) n.wp.dur = d; }
        if (t === 'dn' || t === 'dt') { const v = parseInt($('#eWpSp').value, 10); if (v > 0) n.wp.speed = v; }
      }
      const zt = $('#eZone').value;
      n.zone = zt ? { type: zt } : null;
      if (n.zone && zt !== 'fz') { const v = parseInt($('#eSpeed').value, 10); if (v > 0) n.zone.speed = v; }
      n.fuel = $('#eFuel').checked;
      n.lex = lexSel.slice(); if (!n.lex.length) delete n.lex;
      n.sym = symList.map(q => ({ ...q })); if (!n.sym.length) delete n.sym;
      n.edited = true; renderAll();
      const R = clamp(parseFloat($('#eR').value) || 0, 20, 150), curR = n.tulip && n.tulip.R || S.settings.tulipR;
      if (Math.abs(R - curR) >= 1) {
        toast('Tulipe en cours de redessin…');
        redrawTulip(n, R).then(() => { renderAll(); toast(`Tulipe redessinée avec un rayon de ${Math.round(R)} m.`, 'ok'); })
          .catch(e => { console.error(e); toast('Impossible de redessiner la tulipe (' + (e.message || e) + ').', 'err'); });
      }
    } }
  ], { onCancel: () => { if (isNew) { S.notes = S.notes.filter(x => x.id !== n.id); renderAll(); } } });
  const upd = () => {
    const t = $('#eWp').value;
    $('#eWpRad').style.display = isRadiusWP(t) ? '' : 'none';
    $('#eOpen').parentElement.style.display = $('#eClear').parentElement.style.display = isRadiusWP(t) ? '' : 'none';
    $('#eDurF').style.display = t === 'dn' ? '' : 'none';
    $('#eWpSpF').style.display = t === 'dn' || t === 'dt' ? '' : 'none';
    $('#eWpX').style.display = t === 'dn' || t === 'dt' ? '' : 'none';
    $('#eSpeedF').style.display = $('#eZone').value && $('#eZone').value !== 'fz' ? '' : 'none';
    if (isRadiusWP(t) && !$('#eOpen').value && !$('#eClear').value) { $('#eOpen').value = WP_DEF[t][0] || ''; $('#eClear').value = WP_DEF[t][1] || ''; }
  };
  // symboles du lexique : sélection (clic = retirer) et palette (clic = ajouter / retirer)
  const lexSel = lexKeys(n), symList = (n.sym || []).filter(q => FIA_LEX[q.k]).map(q => ({ ...q }));
  let lexCat = FIA_CATS[0], symSel = null;
  const lexImg = k => `<img src="${FIA_LEX[k].d}" alt="">`;
  const renderLex = () => {
    $('#eLexSel').innerHTML = lexSel.length ? lexSel.map(k => `<button type="button" class="lexchip" data-k="${k}" title="Retirer : ${esc(FIA_LEX[k].l)}">${lexImg(k)}<span>×</span></button>`).join('')
      : '<span class="help" style="margin:0">Aucun symbole.</span>';
    const q = ($('#eLexQ').value || '').trim().toLowerCase();
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const keys = Object.keys(FIA_LEX).filter(k => !FIA_LEX[k].x).filter(k => q ? norm(FIA_LEX[k].l + ' ' + FIA_LEX[k].en + ' ' + k).includes(norm(q)) : FIA_LEX[k].c === lexCat);
    $('#eLexGrid').innerHTML = keys.length ? keys.map(k => `<button type="button" class="lextile${lexSel.includes(k) ? ' on' : ''}" data-k="${k}" title="${esc(FIA_LEX[k].l)} — ${esc(FIA_LEX[k].en)}">${lexImg(k)}<span>${esc(FIA_LEX[k].l)}</span></button>`).join('')
      : '<div class="help" style="margin:6px 0">Aucun symbole trouvé.</div>';
    $('#eLexTabs').classList.toggle('dim', !!q);
  };
  $('#eLexOpen').onclick = () => { const p = $('#eLexPal'); p.hidden = !p.hidden; $('#eLexOpen').textContent = p.hidden ? '＋ Ajouter des symboles' : 'Fermer la liste des symboles'; if (!p.hidden) $('#eLexQ').focus(); };
  $('#eLexTabs').onclick = e => { const b = e.target.closest('button[data-c]'); if (!b) return; lexCat = b.dataset.c; $('#eLexQ').value = ''; $('#eLexTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderLex(); };
  $('#eLexQ').oninput = renderLex;
  $('#eLexGrid').onclick = e => {
    const b = e.target.closest('button[data-k]'); if (!b) return; const k = b.dataset.k;
    symSel = { k, c: symSel ? symSel.c : lastCase, x: 50, y: 50, h: 16 }; symList.push(symSel); renderStage();       // nouveau symbole au centre, devant les autres
  };
  // zone de placement : deux cases carrées, les symboles se glissent (même d'une case à l'autre) et se redimensionnent
  const caseEl = c => c === 't' ? $('#stTin') : $('#stDin');
  let lastCase = 't';
  const syncCtl = () => { $('#stSize').disabled = $('#stDel').disabled = $('#stFront').disabled = $('#stBack').disabled = !symSel; if (symSel) $('#stSize').value = symSel.h; };
  const placeEl = (el, q) => { el.style.left = q.x + '%'; el.style.top = q.y + '%'; el.style.height = q.h + '%'; };
  function renderStage() {
    // fond des deux cases = le vrai rendu du roadbook (même fonction que la ligne de la note), avec les valeurs en cours de saisie ;
    // les symboles libres sont dessinés par-dessus, à part, pour pouvoir être déplacés
    const cv = $('#eCap').value, cap = cv === '' ? null : norm360(Math.round(+cv)) % 360, wt = $('#eWp').value;
    const tmp = { ...n, text: $('#eText').value.trim(), cap, showCap: $('#eShowCap').checked && cap != null, danger: +$('#eDanger').value, wp: wt ? { type: wt } : null, lex: lexSel.slice(), sym: [] };
    const real = `<div class="rbr">${rowInner(tmp, 0, 0, { zone: false, endSp: null, close: false, green: false, red: false }, false)}</div>`;
    $('#stTm').innerHTML = real; $('#stDm').innerHTML = real; $('#stTin').innerHTML = ''; $('#stDin').innerHTML = '';
    symList.forEach((q, i) => {
      const im = document.createElement('img'); im.src = FIA_LEX[q.k].d; im.className = 'fs' + (q === symSel ? ' sel' : ''); im.draggable = false; im.title = FIA_LEX[q.k].l; placeEl(im, q);
      im.addEventListener('pointerdown', e => {
        e.preventDefault(); symSel = q; im.setPointerCapture(e.pointerId); syncCtl();
        document.querySelectorAll('#stTin .fs, #stDin .fs').forEach(x => x.classList.toggle('sel', x === im));
        const move = ev => {
          const rt = $('#stT').getBoundingClientRect(), rd = $('#stD').getBoundingClientRect();
          const inside = r => ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
          const c = inside(rt) ? 't' : inside(rd) ? 'd' : q.c, r = c === 't' ? rt : rd;
          if (c !== q.c) { q.c = c; caseEl(c).appendChild(im); }
          q.x = Math.round(clamp((ev.clientX - r.left) / r.width * 100, 0, 100) * 10) / 10; q.y = Math.round(clamp((ev.clientY - r.top) / r.height * 100, 0, 100) * 10) / 10; placeEl(im, q);
        };
        const c0 = q.c, up = () => { im.removeEventListener('pointermove', move); im.removeEventListener('pointerup', up); lastCase = q.c; if (q.c !== c0) renderStage(); };
        im.addEventListener('pointermove', move); im.addEventListener('pointerup', up);
      });
      im.addEventListener('wheel', e => { e.preventDefault(); q.h = clamp(Math.round(q.h * (e.deltaY < 0 ? 1.08 : 0.93) * 10) / 10, 4, 90); placeEl(im, q); symSel = q; syncCtl(); }, { passive: false });
      caseEl(q.c).appendChild(im);
    });
    syncCtl();
  }
  $('#stSize').oninput = () => { if (!symSel) return; symSel.h = +$('#stSize').value; renderStage(); };
  $('#stFront').onclick = () => { if (!symSel) return; symList.splice(symList.indexOf(symSel), 1); symList.push(symSel); renderStage(); };     // l'ordre de la liste = ordre de superposition
  $('#stBack').onclick = () => { if (!symSel) return; symList.splice(symList.indexOf(symSel), 1); symList.unshift(symSel); renderStage(); };
  $('#stDel').onclick = () => { if (!symSel) return; symList.splice(symList.indexOf(symSel), 1); symSel = null; renderStage(); };
  $('#stT').onclick = $('#stD').onclick = e => { if (!e.target.classList.contains('fs')) { symSel = null; renderStage(); } };
  for (const id of ['#eText', '#eCap', '#eShowCap', '#eDanger', '#eWp']) $(id).addEventListener(id === '#eText' || id === '#eCap' ? 'input' : 'change', () => renderStage());
  $('#eLexSel').onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; lexSel.splice(lexSel.indexOf(b.dataset.k), 1); renderLex(); renderStage(); };
  renderLex(); renderStage();
  $('#eZone').addEventListener('change', () => upd());
  $('#eWp').addEventListener('change', () => { const t = $('#eWp').value; if (isRadiusWP(t)) { $('#eOpen').value = WP_DEF[t][0] || ''; $('#eClear').value = WP_DEF[t][1] || ''; } upd(); });
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
        if (r) { note = noteFromGroup(G, [r]); if (note) addTrackNames([note]); break; }
      }
    }
  }
  if (!note) {
    const tt = trackTulip(best.s, 'manual');
    note = mkNote({ s: best.s, xy: tt.xy, text: '', cap: Math.round(trackBearing(best.s, best.s + 30)) % 360, kind: 'manual', tulip: tt.tulip });
    note.src = { t: 'trk', kind: 'manual' };
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
  const t0 = Date.now(); let lastTxt = 'Préparation…';
  const show = () => { const t = m.querySelector('#pTxt'); if (t) t.textContent = lastTxt + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s'; };
  const prog = (txt, f) => { lastTxt = txt; show(); const b = m.querySelector('#pBar'); if (b) b.style.width = Math.round(f * 100) + '%'; };
  const ticker = setInterval(show, 1000);
  try {
    S.mm = null; buildDerived();                // on repart de la trace d'origine
    await fetchOSM((f, txt) => prog(txt, 0.05 + 0.6 * f), () => cancelGen);
    if (cancelGen) throw new Error('annulé');
    if (!G.ways.length) {
      closeModal(); renderAll();
      openModal('Aucun chemin trouvé', 'Aucun chemin OpenStreetMap n’a été trouvé autour de ta trace : impossible de repérer les intersections.<br><br>Vérifie sur la carte que la trace passe bien sur des chemins (fond CyclOSM pour mieux les voir).'
        + `<div class="help" style="margin-top:12px">Détail technique : ${esc(G.diag || '')}</div>`, [{ label: 'OK', cls: 'primary' }]);
      return;
    }
    prog('Recalage de la trace sur les chemins…', 0.68);
    const mm = await mapMatch(G, f => prog('Recalage de la trace sur les chemins…', 0.68 + 0.17 * f), () => cancelGen);
    S.mm = mm ? mm.ll : null; buildDerived();
    const ratio = mm ? mm.ratio : 0;
    prog('Repérage des intersections…', 0.87); await sleep(30);
    const ev = detectEvents(G);
    const jn = makeJunctionNotes(G, ev);
    prog('Dessin des tulipes…', 0.95); await sleep(10);
    const bends = detectBends(jn);
    const manual = S.notes.filter(n => !n.auto);
    const all = [startNote(), ...jn, ...bends, endNote()].sort((a, b) => a.s - b.s);
    let rep = null;
    if (S.settings.pois || S.settings.landmarks) { prog('Ajout des repères (gués, ponts, villages…)', 0.97); await sleep(10); rep = osmExtras(G, all); }
    addTrackNames(all);
    S.notes = [...all, ...manual];
    S.stale = false; S.sel = null;
    closeModal(); renderTrack(); renderAll();
    if (S.notes.length > 1) map.fitBounds(line.getBounds(), { padding: [40, 40] });
    const pc = Math.round(ratio * 100);
    toast(`${S.notes.length} notes : ${jn.length} intersection${jn.length > 1 ? 's' : ''}${bends.length ? ', ' + bends.length + (bends.length > 1 ? ' virages serrés' : ' virage serré') : ''}${rep && rep.events ? ', ' + rep.events + ' repères' : ''}. Parcours reconnu sur les chemins : ${pc} %.`, 'ok');
    if (pc < 60) openModal('Parcours peu reconnu', `Seulement <b>${pc} %</b> de ta trace a pu être recalée sur les chemins OpenStreetMap (trait noir sur la carte) : les intersections ne sont repérées que sur cette partie.<br><br>Si ta trace a été dessinée à main levée ou s’écarte des chemins, augmente <b>« Écart maxi trace ↔ chemins »</b> dans ⋯ › Réglages (par ex. 70 m), puis régénère. Les portions hors-piste ou absentes d’OpenStreetMap restent sans intersection.`, [{ label: 'OK', cls: 'primary' }]);
  } catch (e) {
    closeModal();
    if (e.message === 'annulé') { toast('Génération annulée.'); return; }
    console.error(e);
    const blocked = e instanceof TypeError || /fetch|network/i.test(e.message || '');
    openModal('Chemins OSM indisponibles', `Impossible de télécharger les chemins OpenStreetMap (${esc(e.message || e)}).<br><br>`
      + (blocked ? 'La connexion aux serveurs OpenStreetMap a été bloquée. Ouvre le fichier <b>directement dans Chrome, Edge ou Firefox</b> (double-clic sur le fichier enregistré sur ton ordinateur), pas dans un aperçu, et vérifie ta connexion internet.'
                 : 'Réessaie dans une minute : les serveurs gratuits sont parfois saturés.'), [{ label: 'OK', cls: 'primary' }]);
  } finally { clearInterval(ticker); }
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
    const tul = await svgToPNG(tulipSVG(n.tulip, 300, n.sym), 300, 300);
    const nts = await svgToPNG(notesSVG(n), 400, 300);
    const ex = [];
    ex.push(`<openrally:distance>${km(n.s)}</openrally:distance>`);
    ex.push(`<openrally:tulip><![CDATA[${tul}]]></openrally:tulip>`);
    ex.push(`<openrally:notes><![CDATA[${nts}]]></openrally:notes>`);
    if (n.showCap && n.cap != null) ex.push(`<openrally:cap>${Math.round(n.cap) % 360}</openrally:cap>`);
    if (n.danger) ex.push(`<openrally:danger>${n.danger}</openrally:danger>`);
    normNote(n);
    const attrs = (o, c, nm) => `${o ? ` open="${o}"` : ''}${c ? ` clear="${c}"` : ''}${nm ? ` name="${xmlEsc(nm)}"` : ''}`;
    let speed = null;
    if (n.wp) {
      const t = n.wp.type;
      if (t === 'dn') ex.push(`<openrally:neutralization>${Math.max(0, Math.round((n.wp.dur || 0) * 60))}</openrally:neutralization>`);
      else if (isRadiusWP(t)) {
        if (isNumberedWP(t)) wpCount++;
        ex.push(`<openrally:${t === 'cp' ? 'checkpoint' : t}${attrs(n.wp.open, n.wp.clear, n.wp.name || (isNumberedWP(t) ? String(wpCount) : ''))}/>`);
      }
      if ((t === 'dn' || t === 'dt') && n.wp.speed) speed = n.wp.speed;
    }
    if (n.zone) {
      const z = n.zone.type, [o, c] = WP_DEF.dz;
      if (z === 'fz' || z === 'fzdz') ex.push(`<openrally:fz${attrs(o, c)}/>`);
      if (z === 'dz' || z === 'fzdz') { ex.push(`<openrally:dz${attrs(o, c)}/>`); if (n.zone.speed) speed = n.zone.speed; }
    }
    if (speed) ex.push(`<openrally:speed>${speed}</openrally:speed>`);
    if (n.fuel) ex.push('<openrally:fuel/>');
    o.push(`  <wpt lat="${n.lat.toFixed(6)}" lon="${n.lon.toFixed(6)}">\n    <name>${i + 1}</name>\n    <desc>${xmlEsc((n.text || '').replace(/\n/g, ' / '))}</desc>\n    <extensions>\n      ${ex.join('\n      ')}\n    </extensions>\n  </wpt>`);
  }
  o.push(`  <trk>\n    <name>${xmlEsc(S.name)}</name>\n    <trkseg>`);
  for (const p of (S.mm && S.mm.length > 1 ? S.mm : S.ll)) o.push(`      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"/>`);
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
  const fl = rbFlags(S.notes), rows = [], P = 5; let prev = 0;
  S.notes.forEach((n, i) => { const par = n.s - prev; prev = n.s; rows.push(`<div class="rbr prow">${rowInner(n, i, par, fl[i], false)}</div>`); });
  const pages = Math.ceil(rows.length / P); let html = '';
  for (let p = 0; p < pages; p++) html += `<div class="ppage"><div class="ph"><span class="l">${esc(S.name)}</span><span class="c">Page ${p + 1} / ${pages}</span><span class="r">Total ${kmFr(T.L)} km</span></div>${rows.slice(p * P, p * P + P).join('')}</div>`;
  $('#print').innerHTML = html;
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
  setTimeout(() => d.remove(), action ? 7000 : cls === 'err' ? 10000 : 4200);
}
function openSettings() {
  const s = S.settings;
  const num = (id, label, v, min, max, help) => `<div class="fld"><label for="${id}">${label}</label><input id="${id}" type="number" min="${min}" max="${max}" value="${v}">${help ? `<div class="help" style="margin:2px 0 0">${help}</div>` : ''}</div>`;
  const chk = (id, label, v) => `<label class="chk"><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${label}</label>`;
  openModal('Réglages de génération', `
    <div class="fld"><label for="sData">Source des chemins</label><select id="sData">
      <option value="vt"${s.data !== 'osm' ? ' selected' : ''}>Rapide — fond vectoriel OpenFreeMap (par défaut)</option>
      <option value="ign"${s.data === 'ign' ? ' selected' : ''}>IGN — BD TOPO, France seulement (mêmes chemins que le SCAN 25)</option>
      <option value="osm"${s.data === 'osm' ? ' selected' : ''}>Détaillé — OpenStreetMap complet (Overpass, plus lent)</option></select>
      <div class="help" style="margin:2px 0 0">Rapide : chemins, carrefours, ronds-points, goudron / piste, eau, bâtiments, ponts, tunnels, gués, portails, villages, sommets, stations-service, églises.
      IGN : routes, routes empierrées, chemins, sentiers, ronds-points, ponts, noms de rues et numéros de routes de la BD TOPO, cours d’eau, plans d’eau, bâtiments ; France seulement.
      Détaillé : en plus lignes électriques, clôtures, STOP, sable / boue, état de la piste, pentes, châteaux d’eau, antennes… mais téléchargement bien plus long.</div></div>
    ${num('sTol', 'Écart maxi trace ↔ chemins (m)', s.tol, 10, 100, 'Ta trace est recalée sur les chemins situés à moins de cette distance. Augmente-la si ta trace est dessinée à main levée.')}
    <div class="fgrid" style="grid-template-columns:1fr 1fr">
      ${num('sMerge', 'Regrouper les notes à moins de (m)', s.merge, 5, 100)}
      ${num('sR', 'Rayon dessiné dans la tulipe (m)', s.tulipR, 25, 120)}
    </div>
    ${chk('sStraight', 'Noter aussi les intersections où l’on continue tout droit', s.straight)}
    ${chk('sGoudron', 'Noter les changements « fin / début goudron »', s.goudron)}
    ${chk('sBends', 'Noter les virages serrés hors intersection', s.bends)}
    ${num('sBendA', 'Angle mini d’un virage serré (°)', s.bendAngle, 60, 170)}
    ${chk('sPois', 'Notes de repères : gués, passages à niveau, stops, portails, ponts, tunnels, lignes électriques, sable, pentes, clôtures, villages, cols, stations-service', s.pois)}
    ${chk('sLand', 'Repères visuels : châteaux d’eau, antennes, églises, éoliennes, sommets, lieux-dits, noms des pistes', s.landmarks)}
    ${chk('sWater', 'Dessiner les cours d’eau et plans d’eau (bleu ciel)', s.water)}
    ${chk('sBld', 'Dessiner les bâtiments', s.bld)}
    ${chk('sFoot', 'Inclure les voies piétonnes et cyclables (footway, cycleway, escaliers)', s.foot)}
    ${chk('sCap', 'Afficher le CAP sur les nouvelles notes', s.showCap)}
    <div class="help" style="margin-top:6px">Les chemins téléchargés sont gardés dans ce navigateur pour aller plus vite (⋯ › « Enregistrer les chemins OSM » pour en faire une copie dans un dossier). <a href="#" id="sClear">Vider cette mémoire</a></div>`, [
    { label: 'Valeurs par défaut', onClick: () => { S.settings = { ...DEF_SETTINGS }; afterSettings(); } }, 'sp',
    { label: 'Annuler' },
    { label: 'Enregistrer', cls: 'primary', onClick: () => {
      const g = (id, d, a, b) => { const v = parseFloat($('#' + id).value); return isFinite(v) ? clamp(v, a, b) : d; };
      S.settings = { sv: DEF_SETTINGS.sv, data: /^(osm|ign)$/.test($('#sData').value) ? $('#sData').value : 'vt', tol: g('sTol', 40, 10, 100), water: $('#sWater').checked, bld: $('#sBld').checked, pois: $('#sPois').checked, landmarks: $('#sLand').checked, merge: g('sMerge', 30, 5, 100), tulipR: g('sR', 50, 25, 120), straight: $('#sStraight').checked,
        goudron: $('#sGoudron').checked, bends: $('#sBends').checked, bendAngle: g('sBendA', 100, 60, 170), foot: $('#sFoot').checked, showCap: $('#sCap').checked };
      afterSettings();
    } }]);
  const c = $('#sClear');
  if (c) c.onclick = async e => { e.preventDefault(); memTiles.clear(); memVT.clear(); memIGN.clear(); G = null; await TileDB.clear(); toast('Mémoire des chemins vidée.'); };
}
function afterSettings() { if (S.notes.length) { S.stale = true; toast('Réglages enregistrés : clique sur « Générer le roadbook » pour les appliquer.'); } renderInfo(); save(); }
function openHelp() {
  const demo = { R: 50, kind: 'junction', route: [{ p: [0, -50], c: 'track' }, { p: [0, 0], c: 'track' }, { p: [35, 35], c: 'track' }], others: [{ c: 'road', p: [[-50, 5], [50, -5]] }, { c: 'trail', p: [[0, 0], [-30, 40]] }],
    wl: [{ k: 'stream', p: [[-50, -25], [-10, -20], [20, -32], [50, -28]] }], bld: [[[-38, 12], [-22, 12], [-22, 24], [-38, 24], [-38, 12]], [[18, -12], [30, -12], [30, -4], [18, -4], [18, -12]]] };
  openModal('Aide', `
    <div style="display:flex;gap:14px;align-items:center">${tulipSVG(demo, 110)}<div>
    <b>Lire une tulipe</b><br>● point = tu arrives ici · ▲ flèche = direction à prendre<br>
    <span style="color:#0000FF;font-weight:700">bleu</span> = ton parcours · noir = les autres chemins<br>double trait = route goudronnée · trait plein = piste · pointillés = sentier / petite piste<br>bleu ciel = cours d’eau · rectangles = bâtiments</div></div>
    <p><b>Trait noir sur la carte</b> : la partie de ta trace recalée sur les chemins OpenStreetMap. Les intersections sont repérées sur ce trait.</p>
    <p><b>Intersections manquantes</b> : augmente « Écart maxi trace ↔ chemins » dans les réglages. Trop de notes : décoche « tout droit ».</p>
    <p><b>Modifier</b> : ✎ sur une note (texte, CAP, danger, symboles du lexique FIA, waypoint WPV/WPM/WPS, zone de vitesse DZ/FZ). Clique sur la trace pour ajouter une note.</p>
    <p><b>Internet</b> est nécessaire pour la carte, le calcul d’itinéraire et les chemins. Mode rapide (par défaut) : fond vectoriel OpenFreeMap. Mode IGN (⚙️ Réglages, France) : BD TOPO, la base des cartes IGN. Mode détaillé : OpenStreetMap complet via Overpass, plus lent mais avec tous les repères. Ton travail est gardé automatiquement dans ce navigateur.</p>
    <p style="color:#8a8478;font-size:12px">Données © contributeurs OpenStreetMap (ODbL). Chemins du mode rapide : OpenFreeMap © OpenMapTiles. Mode IGN : BD TOPO® © IGN (Licence Ouverte). Itinéraires BRouter / OSRM. Fonds OpenTopoMap, IGN, CyclOSM, Esri.</p>`, [{ label: 'OK', cls: 'primary' }]);
}

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
  const ign = (o.ign || []).filter(r => r && /^-?\d+,-?\d+$/.test(r.k) && Array.isArray(r.f));
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
  else if (act === 'saveOsm') saveOsm();
  else if (act === 'loadOsm') $('#fileIn').click();
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
