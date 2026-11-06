// Overpass simulé à partir d'un extrait OSM réel : applique les filtres et "around" de la requête
const D2R = Math.PI / 180, RE = 6371008.8;
function load(file) {
  const j = JSON.parse(require('fs').readFileSync(file, 'utf8'));
  const nodes = new Map(), ways = [];
  for (const e of j.elements) if (e.type === 'node') nodes.set(e.id, e); else ways.push(e);
  return { nodes, ways };
}
function parseFilters(s) {
  const out = []; const re = /\["([^"]+)"(?:(!?[=~])"([^"]*)")?\]/g; let m;
  while ((m = re.exec(s))) out.push({ k: m[1], op: m[2] || 'has', v: m[3] });
  return out;
}
function match(tags, f) {
  return f.every(c => {
    const v = tags[c.k];
    if (c.op === 'has') return v !== undefined;
    if (c.op === '=') return v === c.v;
    if (c.op === '!=') return v !== c.v;
    if (c.op === '~') return v !== undefined && new RegExp(c.v).test(v);
    if (c.op === '!~') return v === undefined || !new RegExp(c.v).test(v);
  });
}
function run(db, q) {
  if (!db.wbb) { db.wbb = new Map(); for (const w of db.ways) { let a = 90, b = 180, c = -90, d = -180; for (const id of w.nodes) { const n = db.nodes.get(id); if (!n) continue; a = Math.min(a, n.lat); b = Math.min(b, n.lon); c = Math.max(c, n.lat); d = Math.max(d, n.lon); } db.wbb.set(w, [a, b, c, d]); } }
  const parse = part => [...part.matchAll(/(node|way)((?:\[[^\]]+\])+)\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/g)].map(m => ({ t: m[1], f: parseFilters(m[2]), b: [+m[3], +m[4], +m[5], +m[6]] }));
  const iH = q.indexOf('->.h'), iG = q.indexOf('out geom'), iC = q.indexOf('out center');
  const hwSt = parse(q.slice(0, iH)), ftSt = iG > 0 ? parse(q.slice(iH, iG)) : [], poSt = iC > 0 ? parse(q.slice(iG, iC)) : [];
  const inBox = (w, b) => { const bb = db.wbb.get(w); if (bb[2] < b[0] || bb[0] > b[2] || bb[3] < b[1] || bb[1] > b[3]) return false;
    const pts = w.nodes.map(id => db.nodes.get(id)).filter(Boolean);
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p.lat >= b[0] && p.lat <= b[2] && p.lon >= b[1] && p.lon <= b[3]) return true;
      if (i) { const a = pts[i - 1]; for (let k = 1; k < 8; k++) { const la = a.lat + (p.lat - a.lat) * k / 8, lo = a.lon + (p.lon - a.lon) * k / 8; if (la >= b[0] && la <= b[2] && lo >= b[1] && lo <= b[3]) return true; } } }
    return false; };
  const pick = sts => { const ws = new Set(), ns = new Set(); for (const st of sts) { if (st.t === 'way') { for (const w of db.ways) if (match(w.tags || {}, st.f) && inBox(w, st.b)) ws.add(w); } else { for (const n of db.nodes.values()) if (n.tags && n.lat >= st.b[0] && n.lat <= st.b[2] && n.lon >= st.b[1] && n.lon <= st.b[3] && match(n.tags, st.f)) ns.add(n); } } return { ws, ns }; };
  const hw = pick(hwSt).ws, out = [...hw].map(w => ({ type: 'way', id: w.id, nodes: w.nodes, tags: w.tags }));
  const nids = new Set(); for (const w of hw) for (const id of w.nodes) nids.add(id);
  for (const id of nids) { const n = db.nodes.get(id); if (n) out.push(n.tags ? { type: 'node', id, lat: n.lat, lon: n.lon, tags: n.tags } : { type: 'node', id, lat: n.lat, lon: n.lon }); }
  for (const w of pick(ftSt).ws) out.push({ type: 'way', id: w.id, nodes: w.nodes, tags: w.tags, geometry: w.nodes.map(id => db.nodes.get(id)).filter(Boolean).map(n => ({ lat: n.lat, lon: n.lon })) });
  const po = pick(poSt);
  for (const n of po.ns) out.push({ type: 'node', id: n.id, lat: n.lat, lon: n.lon, tags: n.tags });
  for (const w of po.ws) { const pts = w.nodes.map(id => db.nodes.get(id)).filter(Boolean); const c = { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lon: pts.reduce((a, p) => a + p.lon, 0) / pts.length }; out.push({ type: 'way', id: w.id, tags: w.tags, center: c }); }
  return { elements: out };
}
module.exports = { load, run };
