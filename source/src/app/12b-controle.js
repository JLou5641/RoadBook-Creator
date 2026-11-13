/* ---------- Contrôle des notes : compare deux sources de réseau routier autour de chaque note ----------
   Une « source » = { id, name, load(box) } où box = [sud, ouest, nord, est] et load renvoie [{ c: classe, pts: [[lat, lon], …] }].
   Pour ajouter un pays ou un fond : CTL.add('id', 'Nom affiché', async box => lignes). Elle apparaît alors dans les deux listes. */
const CTL = { sources: {}, add(id, name, load, mode, used) { this.sources[id] = { id, name, load, mode, used }; } };      // mode / used (facultatifs) : réglage « data » et clé G.used qui permettent de dessiner des tulipes avec cette source
async function ctlTile(url, ms) {
  for (let t = 0; t < 4; t++) {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms || 20000);
    try {
      const r = await fetch(url, { signal: ac.signal });
      if (r.status === 204 || r.status === 404) return new Uint8Array(0);
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
    } catch (e) { /* on réessaie */ } finally { clearTimeout(to); }
    await sleep(600 * (t + 1));
  }
  throw new Error('tuile indisponible');
}
async function ctlMvt(tpl, z, box, layers, cls) {      // tuiles vectorielles (format MVT) → lignes
  const n = 2 ** z, tx = lon => Math.floor((lon + 180) / 360 * n), ty = lat => { const r = lat * D2R; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
  const jobs = []; for (let x = tx(box[1]); x <= tx(box[3]); x++) for (let y = ty(box[2]); y <= ty(box[0]); y++) jobs.push([x, y]);
  const out = [];
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, async (_, w) => {
    for (let i = w; i < jobs.length; i += Math.min(5, jobs.length)) {
      const [x, y] = jobs[i], d = await ctlTile(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      if (!d.length) continue;
      const L = decodeMVT(d);
      for (const ln of layers) for (const f of (L[ln] ? L[ln].features : [])) {
        if (f.type !== 2) continue; const c = cls(f.props, ln); if (c === null) continue;
        const ext = L[ln].extent || 4096;
        for (const ring of f.rings) if (ring.length > 1) out.push({ c, pts: ring.map(([cx, cy]) => { const yy = Math.PI - 2 * Math.PI * (y + cy / ext) / n; return [Math.atan(Math.sinh(yy)) / D2R, (x + cx / ext) / n * 360 - 180]; }) });
      }
    }
  }));
  return out;
}
CTL.add('bdtopo', 'BD TOPO (IGN)', async box => {
  const out = [];
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'BDTOPO_V3:troncon_de_route', OUTPUTFORMAT: 'application/json',
      BBOX: `${box[0].toFixed(5)},${box[1].toFixed(5)},${box[2].toFixed(5)},${box[3].toFixed(5)},urn:ogc:def:crs:EPSG::4326`, SORTBY: 'cleabs', COUNT: 5000, STARTINDEX: page * 5000 });
    let j = null; for (let t = 0; t < 4 && !j; t++) { try { j = await fetchJSON(IGN_WFS + '?' + q, {}, 90000); } catch (e) { if (t === 3) throw e; await sleep(800 * (t + 1)); } }
    for (const f of j.features || []) { const g = f.geometry; if (!g) continue; const ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const l of ls) if (l.length > 1) out.push({ c: f.properties.nature || '', pts: l.map(c => [c[1], c[0]]) }); }
    if ((j.features || []).length < 5000) break;
  }
  return out;
}, 'ign', 'bdtopo');
CTL.add('planign', 'Plan IGN vectoriel (BD TOPO)', box => ctlMvt('https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf', 15, box, ['routier_route', 'routier_chemin'], p => p.symbo || ''), 'ign', 'bdtopo');
CTL.add('ofm', 'OpenFreeMap (OSM)', box => ctlMvt('https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf', 14, box, ['transportation'],
  p => /^(rail|transit|ferry|aerialway|pier)$/.test(p.class || '') ? null : (p.class || '') + (p.subclass ? '/' + p.subclass : '')), 'vt', 'ofm');

/* Compare, autour d'une note, les voies de A et de B : longueur de voie de l'une absente de l'autre (tolérance 10 m, rayon 40 m) */
function ctlNear(lines, lat0, lon0, R) {
  const k = Math.cos(lat0 * D2R) * 111320, segs = [];
  for (const l of lines) {
    const p = l.pts; let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const q of p) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); }
    if (c < lat0 - R / 111320 || a > lat0 + R / 111320 || d < lon0 - R / k || b > lon0 + R / k) continue;
    for (let i = 0; i + 1 < p.length; i++) segs.push([(p[i][1] - lon0) * k, (p[i][0] - lat0) * 111320, (p[i + 1][1] - lon0) * k, (p[i + 1][0] - lat0) * 111320]);
  }
  return segs;
}
function ctlMissing(A, B, R, tol) {      // métrés de A (dans le rayon R) à plus de tol de B 
  let miss = 0;
  for (const s of A) {
    const L = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(1, Math.ceil(L / 4));
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, x = s[0] + (s[2] - s[0]) * t, y = s[1] + (s[3] - s[1]) * t;
      if (x * x + y * y > R * R) continue;
      let dmin = Infinity;
      for (const b of B) {
        const dx = b[2] - b[0], dy = b[3] - b[1], l2 = dx * dx + dy * dy, u = l2 ? clamp(((x - b[0]) * dx + (y - b[1]) * dy) / l2, 0, 1) : 0;
        const d = Math.hypot(x - b[0] - u * dx, y - b[1] - u * dy); if (d < dmin) dmin = d; if (dmin <= tol) break;
      }
      if (dmin > tol) { miss += L / n; }
    }
  }
  return { m: miss };
}
let ctlLayer = null;
function ctlClear() { if (ctlLayer) { map.removeLayer(ctlLayer); ctlLayer = null; } }
async function ctlRun(idA, idB, out, setP) {
  const A = CTL.sources[idA], B = CTL.sources[idB], notes = S.notes.filter(n => n.lat != null);
  const cells = new Map();      // cases de 0,02° contenant des notes (marge 0,003°)
  for (const n of notes) { const c = Math.floor(n.lat / .02) + ',' + Math.floor(n.lon / .02); if (!cells.has(c)) cells.set(c, [Math.floor(n.lat / .02) * .02 - .003, Math.floor(n.lon / .02) * .02 - .003, Math.floor(n.lat / .02) * .02 + .023, Math.floor(n.lon / .02) * .02 + .023]); }
  const la = [], lb = []; let done = 0; const tot = cells.size * 2, boxes = [...cells.values()];
  for (const box of boxes) {
    setP(`Chargement… ${done}/${tot}`);
    la.push(...await A.load(box)); done++; setP(`Chargement… ${done}/${tot}`);
    lb.push(...await B.load(box)); done++;
  }
  setP('Comparaison…'); await sleep(20);
  const R = 40, tol = 10, res = [];
  for (const n of notes) {
    const sa = ctlNear(la, n.lat, n.lon, R + tol + 5), sb = ctlNear(lb, n.lat, n.lon, R + tol + 5);
    const ma = ctlMissing(sa, sb, R, tol), mb = ctlMissing(sb, sa, R, tol);
    if (ma.m > 25 || mb.m > 25) res.push({ n, ma: Math.round(ma.m), mb: Math.round(mb.m), la: sa.length, lb: sb.length });
  }
  return { res, total: notes.length, na: la.length, nb: lb.length };
}

/* ---------- Comparer les deux tulipes d'une note signalée et choisir celle à garder ---------- */
let CTLR = null;      // dernier contrôle : { a, b, res } (la liste reste disponible quand on revient de la comparaison)
const ctlGraphs = {};
async function ctlTulip(n, id) {      // tulipe de la note n dessinée avec le réseau de la source id (réseau du roadbook inchangé)
  const src = CTL.sources[id]; if (!src || !src.mode) throw new Error('cette source ne sait pas dessiner de tulipe');
  const g0 = G, d0 = S.settings.data;
  try {
    S.settings.data = src.mode;
    const gk = ctlGraphs[src.mode];
    if (gk && gk.key === graphKey()) G = gk;
    else if (g0 && g0.key === graphKey()) G = g0;
    else { G = null; await fetchOSM(() => {}, () => false); }
    if (!G || G.used !== src.used) throw new Error('« ' + src.name + ' » indisponible pour le moment');
    ctlGraphs[src.mode] = G;
    const tmp = { ...n, src: null, tulip: null };
    await redrawTulip(tmp, n.tulip && n.tulip.R || S.settings.tulipR);
    return tmp.tulip;
  } finally { S.settings.data = d0; G = g0; }
}
async function ctlCompare(i) {
  const R = CTLR, x = R.res[i], n = x.n, A = CTL.sources[R.a], B = CTL.sources[R.b], idx = S.notes.indexOf(n) + 1;
  map.setView([n.lat, n.lon], Math.max(map.getZoom(), 17)); selectNote(n.id, 'map');
  const nav = [{ label: '← Liste', onClick: () => controlDialog() }, 'sp',
    ...(i > 0 ? [{ label: '‹', onClick: () => ctlCompare(i - 1) }] : []), ...(i < R.res.length - 1 ? [{ label: '›', onClick: () => ctlCompare(i + 1) }] : [])];
  const m = openModal(`Note ${idx} · km ${(n.s / 1000).toFixed(2)}`, `<div style="font-size:12px;color:#6b6558;margin-bottom:8px">${i + 1} sur ${R.res.length} · ${R.res.filter(r => r.pick).length} choisie${R.res.filter(r => r.pick).length > 1 ? 's' : ''}</div><div id="ctlCmp" style="font-size:13px;color:#8a8478">Dessin des deux tulipes…</div>`, nav, { top: true, free: true });
  const box = m.querySelector('#ctlCmp');
  try {
    if (!x.ta) x.ta = await ctlTulip(n, R.a);
    if (!x.tb) x.tb = await ctlTulip(n, R.b);
  } catch (e) { box.textContent = 'Impossible de dessiner : ' + (e.message || e); return; }
  if (!document.body.contains(box)) return;
  const col = (id, S_, t, k) => `<div style="border:1px solid #e3dccb;border-radius:10px;padding:6px;text-align:center;${x.pick === k ? 'outline:3px solid #2e7d32;' : ''}"><div class="ctltul">${tulipSVG(t, 150)}</div><div style="font-size:13px;font-weight:600">${k === 'a' ? 'A' : 'B'} · ${esc(S_.name)}</div><div style="font-size:11px;color:#8a8478">${(k === 'a' ? x.ma : x.mb) > 25 ? Math.round(k === 'a' ? x.ma : x.mb) + ' m de voie en plus' : '&nbsp;'}</div><button class="mbtn primary" data-k="${k}" style="width:100%;margin-top:6px">Garder ${k === 'a' ? 'A' : 'B'}</button></div>`;
  box.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${col(R.a, A, x.ta, 'a')}${col(R.b, B, x.tb, 'b')}</div>` + (x.pick ? `<div style="font-size:12px;color:#2e7d32;margin-top:6px">Tulipe ${x.pick === 'a' ? 'A' : 'B'} appliquée à la note.</div>` : '');
  box.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k, t = JSON.parse(JSON.stringify(k === 'a' ? x.ta : x.tb));
    n.tulip = t; n.tulipEdited = true; n.edited = true; n.tsrc = CTL.sources[k === 'a' ? R.a : R.b].used || ''; x.pick = k;
    renderAll(); selectNote(n.id, 'map'); save();
    if (i < R.res.length - 1) ctlCompare(i + 1); else ctlCompare(i);
  });
}
function controlDialog() {
  if (!S.notes.length) { toast('Génère d’abord le roadbook : le contrôle porte sur les notes.', 'err'); return; }
  const ids = Object.keys(CTL.sources), cur = CTL.sources[S.dataSrc] ? S.dataSrc : (/^(ign|ignd)$/.test(S.settings.data) ? 'bdtopo' : 'ofm'), opt = sel => ids.map(i => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(CTL.sources[i].name)}</option>`).join('');
  openModal('Contrôler les notes', `<div style="font-size:13px;color:#6b6558;margin-bottom:8px">Compare, autour de chaque note (40 m), les voies connues par deux sources. Une note est signalée quand l’une montre au moins 25 m de voie que l’autre ne montre pas. Rien n’est modifié.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label style="font-size:12px">Source de données<select id="ctlA" style="width:100%">${opt(cur)}</select></label>
    <label style="font-size:12px">Fond à comparer<select id="ctlB" style="width:100%">${opt(cur === 'ofm' ? 'planign' : 'ofm')}</select></label></div>
    <button class="mbtn primary" id="ctlGo" style="width:100%;margin:10px 0">Lancer le contrôle</button><div id="ctlP" style="font-size:12px;color:#8a8478"></div><div id="ctlOut" style="max-height:38vh;overflow:auto"></div>`,
    [{ label: 'Effacer les ⚠', onClick: ctlClear }, 'sp', { label: 'Fermer', cls: 'primary' }], { top: true });
  const go = $('#ctlGo'), P = $('#ctlP'), O = $('#ctlOut');
  const showList = () => {
    const { a, b, res } = CTLR, nm = i => CTL.sources[i].name;
    P.textContent = CTLR.msg; ctlClear(); ctlLayer = L.layerGroup().addTo(map);
    O.innerHTML = res.map((x, i) => `<div class="ctlrow" data-i="${i}" style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid #e3dccb;cursor:pointer"><span style="color:${x.pick ? '#2e7d32' : '#c25400'}">${x.pick ? '✓' : '⚠'}</span><div><b>Note ${S.notes.indexOf(x.n) + 1} · km ${(x.n.s / 1000).toFixed(2)}</b>${x.pick ? ' <span style="font-size:12px;color:#2e7d32">tulipe ' + (x.pick === 'a' ? 'A' : 'B') + ' gardée</span>' : ''}<div style="font-size:12px;color:#6b6558">${x.ma > 25 ? `« ${esc(nm(a))} » montre ${x.ma} m de voie absente de « ${esc(nm(b))} ». ` : ''}${x.mb > 25 ? `« ${esc(nm(b))} » montre ${x.mb} m de voie absente de « ${esc(nm(a))} ».` : ''}</div></div></div>`).join('') || '<div style="padding:10px 0">Aucune différence : les deux sources montrent les mêmes voies autour des notes.</div>';
    res.forEach(x => L.marker([x.n.lat, x.n.lon], { icon: L.divIcon({ className: 'ctlw', html: x.pick ? '✓' : '⚠', iconSize: [22, 22] }), interactive: false }).addTo(ctlLayer));
    O.querySelectorAll('.ctlrow').forEach(el => el.onclick = () => ctlCompare(+el.dataset.i));
    if (res.length) O.insertAdjacentHTML('afterbegin', '<div style="font-size:12px;color:#6b6558;padding:2px 0 6px">Touche une ligne pour voir les deux tulipes et choisir celle à garder.</div>');
  };
  if (CTLR && CTLR.res.every(x => S.notes.includes(x.n))) { $('#ctlA').value = CTLR.a; $('#ctlB').value = CTLR.b; showList(); }
  go.onclick = async () => {
    const a = $('#ctlA').value, b = $('#ctlB').value;
    if (a === b) { P.textContent = 'Choisis deux sources différentes.'; return; }
    go.disabled = true; O.innerHTML = ''; ctlClear();
    try {
      const r = await ctlRun(a, b, O, t => P.textContent = t), nm = i => CTL.sources[i].name;
      P.textContent = `${r.total} notes contrôlées · ${r.res.length} à revérifier (${r.na} tronçons « ${nm(a)} », ${r.nb} « ${nm(b)} »).`;
      CTLR = { a, b, res: r.res, msg: P.textContent }; showList();
    } catch (e) { P.textContent = 'Contrôle impossible : ' + (e.message || e); }
    go.disabled = false;
  };
}

/* ---------- Fonds vectoriels dessinés par l'appli : tuiles vectorielles téléchargées, décodées (decodeMVT) et peintes sur un canvas ----------
   kind : 'ign' (Plan IGN), 'bdtopo' (BD TOPO brute), 'ofm' (OpenFreeMap / OpenMapTiles) ; tint : '' | 'gris' | 'sombre' (filtre appliqué à la tuile) */
function VEC() {
  const _u = { ign: 'https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf', bdtopo: 'https://data.geopf.fr/tms/1.0.0/BDTOPO/{z}/{x}/{y}.pbf', ofm: 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf' };
  const _a = { ign: '© IGN – Plan IGN (tuiles vectorielles)', bdtopo: '© IGN – BD TOPO®', ofm: '© OpenMapTiles, © contributeurs OpenStreetMap' };
  const _f = { gris: 'grayscale(1) contrast(.85) brightness(1.08)', sombre: 'invert(1) hue-rotate(180deg) brightness(.85) contrast(.92)' };
  return { url: _u, attr: _a, filter: _f };
}
function vecLayer(kind, tint) {
  const VEC_URL = VEC().url, VEC_ATTR = VEC().attr, VEC_FILTER = VEC().filter;
  const ZR = { ign: [0, 18], bdtopo: [15, 18], ofm: [0, 14] };      // zooms où le serveur a des données ; au-delà on redessine la tuile agrandie (vraiment vectoriel), en dessous on assemble des tuiles plus fines
  const Layer = L.GridLayer.extend({
    createTile(c, done) {
      const cv = document.createElement('canvas'), S2 = 2, N = 256; cv.width = cv.height = N * S2; const g = cv.getContext('2d'); g.scale(S2, S2);
      if (tint) cv.style.filter = VEC_FILTER[tint];
      g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, N, N);
      const [zmin, zmax] = ZR[kind], jobs = [];
      if (c.z > zmax) { const d = c.z - zmax, f = 2 ** d, px = Math.floor(c.x / f), py = Math.floor(c.y / f); jobs.push({ z: zmax, x: px, y: py, ox: -(c.x - px * f) * N, oy: -(c.y - py * f) * N, s: f }); }
      else if (c.z < zmin) { const n = 2 ** (zmin - c.z); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) jobs.push({ z: zmin, x: c.x * n + i, y: c.y * n + j, ox: i * N / n, oy: j * N / n, s: 1 / n }); }
      else jobs.push({ z: c.z, x: c.x, y: c.y, ox: 0, oy: 0, s: 1 });
      Promise.all(jobs.map(j => ctlTile(VEC_URL[kind].replace('{z}', j.z).replace('{x}', j.x).replace('{y}', j.y)).then(d => ({ j, d })).catch(() => null))).then(res => {
        for (const r of res) {
          if (!r || !r.d.length) continue; const j = r.j;
          g.save(); if (j.s < 1) { g.beginPath(); g.rect(j.ox, j.oy, N * j.s, N * j.s); g.clip(); }
          g.translate(j.ox, j.oy); g.scale(j.s, j.s); vecDraw(kind, g, decodeMVT(r.d), c.z, N, j.s); g.restore();
        }
        done(null, cv);
      });
      return cv;
    } });
  return new Layer({ minZoom: kind === 'bdtopo' ? 14 : 6, maxZoom: 19, tileSize: 256, attribution: VEC_ATTR[kind] });
}
function planIgnVector() { return vecLayer('ign', ''); }
var VROAD = { // classe → [largeur, remplissage, contour]
  REGIONALE_1: [4.4, '#f4a259', '#a8651f'], REGIONALE_2: [3.8, '#f8c471', '#b08b3a'], REGIONALE_3: [3.4, '#fbe29a', '#b8a35a'], LOCALE_1: [3, '#fff6cc', '#a39a73'], LOCALE_2: [2.8, '#fff', '#9a958a'],
  NON_CLASSEE: [2.2, '#fff', '#9a958a'], NON_CLASSEE_RESTREINT: [2, '#f3f0e6', '#a8a396'], NON_REVETUE_CARRO: [1.8, '#e8c9a0', '#9a7440'], NON_REVETUE_CARRO_RESTREINT: [1.6, '#eddcc2', '#a8896a'] };
var VPATH = { CHEMIN: [1.5, '#6b4a1e', [5, 3]], SENTIER: [1.3, '#b5412c', [2.5, 2.5]], PISTE_CYCLABLE: [1.4, '#2a7ab5', [5, 3]], ESCALIER: [1.3, '#555', [1.5, 1.5]], RUE_PIETONNE: [1.6, '#b0aa9a', null] };
function vecDraw(kind, g, T, z, N, sc) {
  sc = sc || 1; const k = clamp(0.55 + (z - 12) * 0.2, 0.45, 1.7) / sc;      // sc : échelle appliquée au dessin (tuile agrandie ou réduite), les épaisseurs et textes la compensent
  const pth = (f, ext, close) => { g.beginPath(); for (const r of f.rings) { r.forEach(([x, y], i) => { x = x / ext * N; y = y / ext * N; i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (close) g.closePath(); } };
  const polys = (name, col, stroke) => { const Ly = T[name]; if (!Ly) return; for (const f of Ly.features) { if (f.type !== 3) continue; const c = typeof col === 'function' ? col(f.props) : col; if (!c) continue; pth(f, Ly.extent, true); g.fillStyle = c; g.fill('evenodd'); if (stroke) { g.strokeStyle = stroke; g.lineWidth = .6 / sc; g.stroke(); } } };
  const lines = (name, fn) => { const Ly = T[name]; if (!Ly) return; for (const f of Ly.features) { if (f.type !== 2) continue; const st = fn(f.props); if (!st) continue; pth(f, Ly.extent, false); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = st[1]; g.lineWidth = st[0] * k; g.setLineDash(st[2] ? st[2].map(v => v * k) : []); g.stroke(); g.setLineDash([]); } };
  const roads = (name, fn) => { const Ly = T[name]; if (!Ly) return; for (const pass of [0, 1]) for (const f of Ly.features) { if (f.type !== 2) continue; const st = fn(f.props); if (!st) continue; pth(f, Ly.extent, false); g.lineCap = 'round'; g.lineJoin = 'round';
      if (pass === 0) { g.strokeStyle = st[2]; g.lineWidth = (st[0] + 1.4) * k; g.setLineDash([]); } else { g.strokeStyle = st[1]; g.lineWidth = st[0] * k; g.setLineDash(st[3] ? [6 * k, 3 * k] : []); } g.stroke(); g.setLineDash([]); } };
  const label = (txt, px, py, size) => { g.font = `600 ${size / sc}px sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3 / sc; g.strokeText(txt, px, py); g.fillStyle = '#333'; g.fillText(txt, px, py); };
  const points = (name, keyF, minZ, size) => { const Ly = T[name]; if (!Ly || z < minZ) return; for (const f of Ly.features) { const t = keyF(f.props); if (!t || f.type !== 1 || !f.rings[0]) continue; const [x, y] = f.rings[0][0]; label(t, x / Ly.extent * N, y / Ly.extent * N, size); } };
  const lbl = Math.round(10 + clamp(z - 12, 0, 3));
  if (kind === 'ign') {
    polys('ocs_nature_sol_surf', '#efe9d6'); polys('ocs_vegetation_surf', p => /BOISEE|FORET/.test(p.symbo || '') ? '#cfe3b8' : /VIGNE|VERGER/.test(p.symbo || '') ? '#e3e8bd' : '#e0ecc8');
    polys('hydro_surf', '#a9d3f0'); lines('oro_courbe', p => [/MAITRESSE/.test(p.symbo || '') ? 1 : .5, '#dcc3a4']); lines('hydro_reseau', () => [1.6, '#6fb2e0']);
    polys('bati_surf', '#cdc7ba', '#a8a294'); lines('ferre', () => [1.4, '#666']); lines('limite_lin', () => [.8 / k / sc, '#b07ac0', [6, 3]]);
    lines('routier_chemin', p => { const s = VPATH[p.symbo] || VPATH.CHEMIN; return [s[0], s[1], s[2]]; });
    roads('routier_route', p => { const s = VROAD[p.symbo] || VROAD.NON_CLASSEE; return [s[0], s[1], s[2], /NON_REVETUE/.test(p.symbo || '')]; });
    points('toponyme_localite_ponc', p => p.texte, 12, lbl); points('toponyme_ocs_ponc', p => p.texte, 14, lbl);
  } else if (kind === 'bdtopo') {
    polys('zone_de_vegetation', p => /Vigne|Verger/.test(p.nature || '') ? '#e3e8bd' : /Forêt|Bois|Peupleraie/.test(p.nature || '') ? '#cfe3b8' : '#e0ecc8');
    polys('surface_hydrographique', '#a9d3f0'); polys('plan_d_eau', '#a9d3f0'); polys('zone_d_habitation', '#ece5d6'); polys('batiment', '#cdc7ba', '#a8a294');
    lines('troncon_hydrographique', () => [1.6, '#6fb2e0']); lines('haie', () => [1.1, '#5c8a3a']); lines('ligne_electrique', () => [.7, '#8a7aa8', [4, 3]]); lines('troncon_de_voie_ferree', () => [1.4, '#666']);
    const RN = { 'Route à 2 chaussées': [3.8, '#f4a259', '#a8651f'], 'Route à 1 chaussée': [2.6, '#fff', '#9a958a'], 'Route empierrée': [1.8, '#e8c9a0', '#9a7440', true], 'Rond-point': [2.6, '#fff', '#9a958a'], 'Bretelle': [3, '#f8c471', '#b08b3a'], 'Type autoroutier': [4.4, '#f4a259', '#a8651f'] };
    lines('troncon_de_route', p => /^(Chemin|Sentier|Escalier|Piste cyclable)$/.test(p.nature || '') ? (p.nature === 'Sentier' ? [1.3, '#b5412c', [2.5, 2.5]] : p.nature === 'Piste cyclable' ? [1.4, '#2a7ab5', [5, 3]] : p.nature === 'Escalier' ? [1.3, '#555', [1.5, 1.5]] : [1.5, '#6b4a1e', [5, 3]]) : null);
    roads('troncon_de_route', p => RN[p.nature] || (/^(Chemin|Sentier|Escalier|Piste cyclable)$/.test(p.nature || '') ? null : RN['Route à 1 chaussée']));
    points('lieu_dit_non_habite', p => p.toponyme, 14, lbl);
    const Z = T.zone_d_habitation; if (Z && z >= 12) for (const f of Z.features) { if (f.type !== 3 || !f.props.toponyme || !f.rings[0]) continue; let a = 1e9, b = 1e9, c2 = -1e9, d = -1e9; for (const [x, y] of f.rings[0]) { a = Math.min(a, x); b = Math.min(b, y); c2 = Math.max(c2, x); d = Math.max(d, y); } label(f.props.toponyme, (a + c2) / 2 / Z.extent * N, (b + d) / 2 / Z.extent * N, lbl); }
  } else {      // OpenFreeMap : schéma OpenMapTiles
    polys('landcover', p => p.class === 'wood' ? '#cfe3b8' : p.class === 'grass' ? '#e0ecc8' : p.class === 'farmland' ? '#eef0d4' : p.class === 'wetland' ? '#d6e8d4' : p.class === 'sand' ? '#f2e8c8' : p.class === 'ice' ? '#f4fafd' : '#e8eed8');
    polys('landuse', p => /residential|suburb|neighbourhood/.test(p.class || '') ? '#ece5d6' : /cemetery|park|pitch|playground/.test(p.class || '') ? '#dbe9c3' : /industrial|retail|commercial/.test(p.class || '') ? '#e6dfe8' : null);
    polys('park', '#d9e8c4'); polys('water', '#a9d3f0');
    lines('waterway', p => [p.class === 'river' ? 2 : 1.2, '#6fb2e0']); polys('building', '#cdc7ba', '#a8a294');
    const OR = { motorway: [4.4, '#f4a259', '#a8651f'], trunk: [4.2, '#f4a259', '#a8651f'], primary: [3.8, '#f8c471', '#b08b3a'], secondary: [3.4, '#fbe29a', '#b8a35a'], tertiary: [3, '#fff6cc', '#a39a73'], minor: [2.4, '#fff', '#9a958a'], service: [1.8, '#fff', '#a8a396'] };
    lines('transportation', p => p.class === 'rail' ? [1.4, '#666'] : p.class === 'track' ? [1.6, '#9a7440', [6, 3]] : p.class === 'path' ? (p.subclass === 'cycleway' ? [1.4, '#2a7ab5', [5, 3]] : p.subclass === 'steps' ? [1.3, '#555', [1.5, 1.5]] : p.subclass === 'footway' || p.subclass === 'pedestrian' ? [1.3, '#b5412c', [2.5, 2.5]] : [1.4, '#6b4a1e', [5, 3]]) : null);
    roads('transportation', p => OR[p.class] || null);
    points('place', p => p.name, 10, lbl); points('mountain_peak', p => p.name, 13, lbl - 1);
  }
}
