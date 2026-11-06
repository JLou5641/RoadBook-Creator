// Itinéraire réaliste (Dijkstra sur les chemins, pistes favorisées) + trace GPS bruitée
const fs = require('fs'); const { load } = require('./mock');
const [file, la1, lo1, la2, lo2, out, noise, spacing, offset] = process.argv.slice(2);
const SP = +(spacing || 9), OFF = +(offset || 0);
const db = load(file); const D2R = Math.PI / 180;
const dist = (a, b) => { const x = (b.lon - a.lon) * Math.cos(a.lat * D2R) * 111320, y = (b.lat - a.lat) * 110540; return Math.hypot(x, y); };
const cost = { track: 1, path: 1.6, unclassified: 1.3, residential: 1.6, service: 1.8, tertiary: 1.5, secondary: 2.5, primary: 4, bridleway: 1.5 };
const adj = new Map();
for (const w of db.ways) { const h = w.tags && w.tags.highway; if (!h || !cost[h]) continue;
  for (let i = 0; i < w.nodes.length - 1; i++) { const a = db.nodes.get(w.nodes[i]), b = db.nodes.get(w.nodes[i + 1]); if (!a || !b) continue; const c = dist(a, b) * cost[h];
    (adj.get(a.id) || adj.set(a.id, []).get(a.id)).push([b.id, c]); (adj.get(b.id) || adj.set(b.id, []).get(b.id)).push([a.id, c]); } }
const nearest = (la, lo) => { let best = null, bd = Infinity; for (const id of adj.keys()) { const n = db.nodes.get(id), d = dist(n, { lat: la, lon: lo }); if (d < bd) { bd = d; best = id; } } return best; };
let comp = null; { // plus grande composante connexe
  const seen = new Set(); for (const id of adj.keys()) { if (seen.has(id)) continue; const c = []; const st = [id]; seen.add(id); while (st.length) { const u = st.pop(); c.push(u); for (const [v] of adj.get(u) || []) if (!seen.has(v)) { seen.add(v); st.push(v); } } if (!comp || c.length > comp.size) comp = new Set(c); } }
for (const id of [...adj.keys()]) if (!comp.has(id)) adj.delete(id);
const s = nearest(+la1, +lo1), t = nearest(+la2, +lo2);
const D = new Map([[s, 0]]), prev = new Map(), done = new Set(); const pq = [[0, s]];
while (pq.length) { let bi = 0; for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i; const [d, u] = pq.splice(bi, 1)[0]; if (done.has(u)) continue; done.add(u); if (u === t) break;
  for (const [v, c] of adj.get(u) || []) { const nd = d + c; if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); prev.set(v, u); pq.push([nd, v]); } } }
const path = []; for (let u = t; u !== undefined; u = prev.get(u)) path.unshift(db.nodes.get(u));
let L = 0; for (let i = 1; i < path.length; i++) L += dist(path[i - 1], path[i]);
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const sig = +(noise || 0); const pts = [];
for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], n = Math.max(1, Math.ceil(dist(a, b) / 9));
  const keepEvery = Math.max(1, Math.round(SP / 9));
  for (let k = 0; k < n; k++) { if ((pts.cnt = (pts.cnt || 0) + 1) % keepEvery) continue; const la = a.lat + (b.lat - a.lat) * k / n + g() * sig / 110540 + OFF / 110540, lo = a.lon + (b.lon - a.lon) * k / n + g() * sig / (111320 * Math.cos(a.lat * D2R)); pts.push([la, lo]); } }
pts.push([path[path.length - 1].lat, path[path.length - 1].lon]);
// vérité terrain : carrefours (degré >= 3, toutes voies 'highway') traversés et angle de virage
{ const deg = new Map(); for (const w of db.ways) { if (!w.tags || !w.tags.highway) continue; for (let i = 0; i < w.nodes.length; i++) { const id = w.nodes[i]; deg.set(id, (deg.get(id) || 0) + (i > 0 ? 1 : 0) + (i < w.nodes.length - 1 ? 1 : 0)); } }
  const brg = (a, b) => (Math.atan2((b.lon - a.lon) * Math.cos(a.lat * D2R), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
  const at = (i, dirn, m) => { let acc = 0, j = i; while (j + dirn >= 0 && j + dirn < path.length && acc < m) { acc += dist(path[j], path[j + dirn]); j += dirn; } return path[j]; };
  let cum = 0; const gt = [];
  for (let i = 0; i < path.length; i++) { if (i) cum += dist(path[i - 1], path[i]); if (i === 0 || i === path.length - 1 || (deg.get(path[i].id) || 0) < 3) continue;
    const hin = brg(at(i, -1, 20), path[i]), hout = brg(path[i], at(i, 1, 20)); let a = ((hout - hin) % 360 + 540) % 360 - 180;
    gt.push((cum / 1000).toFixed(2) + ' ' + (Math.abs(a) < 20 ? 'TD' : (a > 0 ? 'D' : 'G') + ' ' + Math.round(a))); }
  fs.writeFileSync(out + '.truth.txt', gt.join('\n')); }
fs.writeFileSync(out, `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Test réel</name><trkseg>${pts.map(p => `<trkpt lat="${p[0].toFixed(7)}" lon="${p[1].toFixed(7)}"/>`).join('')}</trkseg></trk></gpx>`);
console.log('route', (L / 1000).toFixed(2), 'km', path.length, 'noeuds', pts.length, 'points');
