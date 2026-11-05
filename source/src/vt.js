/* ============================================================
   Tuiles vectorielles (schéma OpenMapTiles, ex. OpenFreeMap) : décodage MVT
   ============================================================ */
function decodeMVT(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const td = new TextDecoder();
  const rd = (s, e) => {                                // lecteur protobuf minimal
    let p = s;
    const varint = () => {
      let r = 0, m = 1, c;
      do { c = b[p++]; r += (c & 0x7f) * m; m *= 128; } while (c & 0x80);
      return r;
    };
    const skip = t => { if (t === 0) varint(); else if (t === 1) p += 8; else if (t === 2) p += varint(); else if (t === 5) p += 4; else throw new Error('MVT : type ' + t); };
    const fields = cb => { while (p < e) { const k = varint(), f = Math.floor(k / 8), t = k & 7; if (!cb(f, t)) skip(t); } };
    const sub = () => { const l = varint(), s0 = p; p += l; return [s0, s0 + l]; };
    const packed = () => { const [s0, e0] = sub(), out = [], keep = p; p = s0; while (p < e0) out.push(varint()); p = keep; return out; };
    return { varint, fields, sub, packed, get p() { return p; }, set p(v) { p = v; } };
  };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const value = (s, e) => {
    const r = rd(s, e); let v = null;
    r.fields((f, t) => {
      if (f === 1 && t === 2) { const [a, z] = r.sub(); v = td.decode(b.subarray(a, z)); return true; }
      if (f === 2 && t === 5) { v = dv.getFloat32(r.p, true); r.p += 4; return true; }
      if (f === 3 && t === 1) { v = dv.getFloat64(r.p, true); r.p += 8; return true; }
      if ((f === 4 || f === 5) && t === 0) { v = r.varint(); return true; }
      if (f === 6 && t === 0) { const u = r.varint(); v = u % 2 ? -(u + 1) / 2 : u / 2; return true; }
      if (f === 7 && t === 0) { v = !!r.varint(); return true; }
      return false;
    });
    return v;
  };
  const geometry = (cmds, type) => {
    const rings = []; let x = 0, y = 0, cur = null;
    for (let i = 0; i < cmds.length;) {
      const c = cmds[i++], id = c & 7, n = c >> 3;
      if (id === 7) { if (cur && cur.length) cur.push(cur[0].slice()); continue; }
      for (let k = 0; k < n; k++) {
        const dx = cmds[i++], dy = cmds[i++];
        x += dx % 2 ? -(dx + 1) / 2 : dx / 2; y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
        if (id === 1) { cur = [[x, y]]; rings.push(cur); } else cur.push([x, y]);
      }
    }
    return rings;
  };
  const layers = {}, r = rd(0, b.length);
  r.fields((f, t) => {
    if (f !== 3 || t !== 2) return false;
    const [s, e] = r.sub(), L = rd(s, e), keys = [], vals = [], feats = [];
    let name = '', extent = 4096;
    L.fields((g, u) => {
      if (g === 1 && u === 2) { const [a, z] = L.sub(); name = td.decode(b.subarray(a, z)); return true; }
      if (g === 3 && u === 2) { const [a, z] = L.sub(); keys.push(td.decode(b.subarray(a, z))); return true; }
      if (g === 4 && u === 2) { const [a, z] = L.sub(); vals.push(value(a, z)); return true; }
      if (g === 5 && u === 0) { extent = L.varint(); return true; }
      if (g === 2 && u === 2) { feats.push(L.sub()); return true; }
      return false;
    });
    const features = feats.map(([a, z]) => {
      const F = rd(a, z); let tags = [], type = 0, geom = [];
      F.fields((g, u) => {
        if (g === 2 && u === 2) { tags = F.packed(); return true; }
        if (g === 3 && u === 0) { type = F.varint(); return true; }
        if (g === 4 && u === 2) { geom = F.packed(); return true; }
        return false;
      });
      const props = {};
      for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
      return { type, props, rings: geometry(geom, type) };
    });
    layers[name] = { extent, features };
    return true;
  });
  return layers;
}

/* ---------- Tuiles vectorielles → éléments au format de l'appli (nœuds, voies, surfaces, repères) ----------
   Les tuiles ne gardent pas les numéros des nœuds OSM et la simplification efface des sommets :
   les carrefours sont reconstruits par la géométrie (points confondus, bouts posés sur une voie, croisements au même niveau). */
const VT_Z = 14, VT_E = 4096;
function vtClipLine(pts, b) {          // morceaux de la ligne dans la tuile ; c0/c1 = bout coupé au bord (pas une vraie extrémité)
  const out = []; let cur = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], z = pts[i + 1], dx = z[0] - a[0], dy = z[1] - a[1];
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, a[0] - b[0]], [dx, b[2] - a[0]], [-dy, a[1] - b[1]], [dy, b[3] - a[1]]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok || t0 > t1) { if (cur) { cur.c1 = true; cur = null; } continue; }
    const A = t0 > 0 ? [a[0] + dx * t0, a[1] + dy * t0] : a, B = t1 < 1 ? [a[0] + dx * t1, a[1] + dy * t1] : z;
    if (!cur || t0 > 0) { if (cur) cur.c1 = true; cur = { pts: [A], c0: !(i === 0 && t0 === 0), c1: false }; out.push(cur); }
    cur.pts.push(B);
    if (t1 < 1) { cur.c1 = true; cur = null; }
  }
  return out.filter(c => c.pts.length > 1);
}
function vtClipRing(ring, b) {          // Sutherland-Hodgman sur le carré de la tuile
  let pts = ring.slice(0, ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? -1 : undefined);
  const edges = [[p => p[0] >= b[0], (p, q) => [b[0], p[1] + (q[1] - p[1]) * (b[0] - p[0]) / (q[0] - p[0])]],
    [p => p[0] <= b[2], (p, q) => [b[2], p[1] + (q[1] - p[1]) * (b[2] - p[0]) / (q[0] - p[0])]],
    [p => p[1] >= b[1], (p, q) => [p[0] + (q[0] - p[0]) * (b[1] - p[1]) / (q[1] - p[1]), b[1]]],
    [p => p[1] <= b[3], (p, q) => [p[0] + (q[0] - p[0]) * (b[3] - p[1]) / (q[1] - p[1]), b[3]]]];
  for (const [inside, cut] of edges) {
    if (!pts.length) break;
    const o = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], pi = inside(p), qi = inside(q);
      if (pi) o.push(p);
      if (pi !== qi) o.push(cut(p, q));
    }
    pts = o;
  }
  return pts.length >= 3 ? [...pts, pts[0]] : [];
}
const vtArea = r => { let a = 0; for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
function vtHighway(p) {
  const c = p.class || '';
  const hw = { motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', minor: 'unclassified', service: 'service', track: 'track', path: p.subclass || 'path' }[c];
  if (!hw) return null;
  const t = { highway: p.ramp == 1 && /^(motorway|trunk|primary|secondary|tertiary)$/.test(hw) ? hw + '_link' : hw };
  if (p.surface === 'paved' || p.surface === 'unpaved') t.surface = p.surface;
  if (p.brunnel === 'bridge') t.bridge = 'yes'; else if (p.brunnel === 'tunnel') t.tunnel = 'yes'; else if (p.brunnel === 'ford') t.ford = 'yes';
  if (p.service) t.service = p.service;
  if (p.oneway == 1) t.oneway = 'yes'; else if (p.oneway == -1) t.oneway = '-1';
  if (p.access === 'no') t.access = 'no';
  if (p.layer) t.layer = String(p.layer);
  return t;
}
const vtLevel = p => { const l = +p.layer || 0; return p.brunnel === 'bridge' ? Math.max(1, l) : p.brunnel === 'tunnel' ? Math.min(-1, l) : l; };
function vtPointTags(ln, p, opt) {
  const nm = p.name ? { name: p.name } : {}, ele = p.ele != null ? { ele: String(Math.round(p.ele)) } : {};
  if (ln === 'mountain_peak') return p.class === 'saddle' ? { natural: 'saddle', ...nm, ...ele } : /^(peak|volcano)$/.test(p.class || '') ? { natural: 'peak', ...nm, ...ele } : null;
  if (ln === 'place') return /^(city|town|village|hamlet|isolated_dwelling|locality)$/.test(p.class || '') ? { place: p.class, ...nm } : null;
  if (ln === 'poi') {
    if (p.class === 'fuel') return { amenity: 'fuel', ...nm };
    if (p.class === 'place_of_worship') return { amenity: 'place_of_worship', ...(p.subclass && p.subclass !== 'place_of_worship' ? { religion: p.subclass } : {}), ...nm };
    if (opt.barriers && opt.barriers.has(p.subclass)) return { barrier: p.subclass };
  }
  return null;
}
function vtToElements(tiles, opt) {
  opt = opt || {};
  if (!tiles.length) return [];
  const W = VT_E * 2 ** VT_Z, R2D = 180 / Math.PI;
  const toLL = (X, Y) => [Math.atan(Math.sinh(Math.PI * (1 - 2 * Y / W))) * R2D, X / W * 360 - 180];
  const mpu = 40075016.686 * Math.cos(toLL(0, (tiles[0].y + 0.5) * VT_E)[0] / R2D) / W, U = m => m / mpu;
  const MERGE = U(0.5), SNAP_END = U(2), SNAP_MID = U(0.8), GS = U(25);
  const raw = [], polys = [], pois = [], marks = [], names = [];
  for (const t of tiles) {
    const x0 = t.x * VT_E, y0 = t.y * VT_E, box = [x0, y0, x0 + VT_E, y0 + VT_E];
    for (const [ln, L] of Object.entries(t.layers || {})) {
      const sc = VT_E / (L.extent || 4096);
      for (const f of L.features) {
        const p = f.props || {}, rings = f.rings.map(r => r.map(q => [x0 + q[0] * sc, y0 + q[1] * sc]));
        if (f.type === 1) {
          const tg = vtPointTags(ln, p, opt); if (!tg) continue;
          for (const r of rings) for (const [X, Y] of r) if (X >= box[0] && X < box[2] && Y >= box[1] && Y < box[3]) (tg.barrier ? marks : pois).push({ X, Y, tags: tg });
        } else if (f.type === 2) {
          if (ln === 'transportation') {
            const tg = vtHighway(p);
            if (tg) { const lv = vtLevel(p); for (const r of rings) for (const pc of vtClipLine(r, box)) raw.push({ ...pc, tags: tg, lvl: lv }); }
            else if (p.class === 'rail') {
              const rt = { railway: p.subclass || 'rail' }; if (p.brunnel === 'bridge') rt.bridge = 'yes'; else if (p.brunnel === 'tunnel') rt.tunnel = 'yes';
              for (const r of rings) for (const pc of vtClipLine(r, box)) polys.push({ pts: pc.pts, tags: rt });
            }
          } else if (ln === 'transportation_name') { if (p.name || p.ref) for (const r of rings) names.push({ pts: r, name: p.name, ref: p.ref }); }
          else if (ln === 'waterway') {
            const tg = { waterway: p.class || 'stream' }; if (p.brunnel === 'tunnel') tg.tunnel = 'culvert';
            for (const r of rings) for (const pc of vtClipLine(r, box)) polys.push({ pts: pc.pts, tags: tg });
          }
        } else if (f.type === 3) {
          const tg = ln === 'water' ? { natural: 'water' } : ln === 'building' ? { building: 'yes' } : ln === 'landuse' && p.class === 'residential' ? { landuse: 'residential' } : null;
          if (!tg) continue;
          let s0 = 0;
          for (const r of rings) {                   // anneaux extérieurs seulement (les trous sont ignorés)
            const a = vtArea(r); if (!a) continue;
            if (!s0) s0 = Math.sign(a); else if (Math.sign(a) !== s0) continue;
            const c = vtClipRing(r, box); if (c.length >= 4) polys.push({ pts: c, tags: tg, area: true });
          }
        }
      }
    }
  }
  // 1. nœuds : points confondus (même sommet vu depuis deux tuiles, bord de tuile)
  const NX = [], NY = [], ngrid = new Map(), par = [];
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) par[Math.max(a, b)] = Math.min(a, b); };
  const nodeAt = (X, Y) => {
    const i = Math.floor(X / MERGE), j = Math.floor(Y / MERGE);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const a = ngrid.get((i + di) + ',' + (j + dj)); if (a) for (const id of a) if (Math.hypot(NX[id] - X, NY[id] - Y) <= MERGE) return id; }
    const id = NX.length; NX.push(X); NY.push(Y); par.push(id);
    const k = i + ',' + j; let a = ngrid.get(k); if (!a) ngrid.set(k, a = []); a.push(id); return id;
  };
  const lines = [], seen = new Set();
  for (const r of raw) {
    const ids = []; for (const q of r.pts) { const id = nodeAt(q[0], q[1]); if (ids[ids.length - 1] !== id) ids.push(id); }
    let run = [ids[0]], k0 = 0;
    const flush = k1 => { if (run.length > 1) lines.push({ ids: run, tags: r.tags, lvl: r.lvl, c0: k0 === 0 ? r.c0 : true, c1: k1 === ids.length - 1 ? r.c1 : true }); };
    for (let k = 1; k < ids.length; k++) {         // segment déjà présent (voie le long d'un bord de tuile) : pas de doublon
      const a = ids[k - 1], b = ids[k], sk = a < b ? a + '|' + b : b + '|' + a;
      if (seen.has(sk)) { flush(k - 1); run = [b]; k0 = k; continue; }
      seen.add(sk); run.push(b);
    }
    flush(ids.length - 1);
  }
  const sgrid = new Map();
  const cellsOf = (x0, y0, x1, y1, fn) => { for (let i = Math.floor(x0 / GS); i <= Math.floor(x1 / GS); i++) for (let j = Math.floor(y0 / GS); j <= Math.floor(y1 / GS); j++) fn(i + ',' + j); };
  lines.forEach((L, li) => { for (let j = 0; j + 1 < L.ids.length; j++) { const a = L.ids[j], b = L.ids[j + 1];
    cellsOf(Math.min(NX[a], NX[b]), Math.min(NY[a], NY[b]), Math.max(NX[a], NX[b]), Math.max(NY[a], NY[b]), k => { let c = sgrid.get(k); if (!c) sgrid.set(k, c = []); c.push(li, j); }); } });
  const proj = (X, Y, a, b) => { const dx = NX[b] - NX[a], dy = NY[b] - NY[a], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((X - NX[a]) * dx + (Y - NY[a]) * dy) / l2)) : 0; return { t, d: Math.hypot(X - NX[a] - dx * t, Y - NY[a] - dy * t) }; };
  const ins = lines.map(() => new Map());
  const addIns = (li, j, t, id) => { let a = ins[li].get(j); if (!a) ins[li].set(j, a = []); a.push({ t, id }); };
  // 2. sommet posé sur une autre voie (bout de chemin en T, carrefour dont le sommet a été simplifié sur l'une des voies)
  lines.forEach((L, li) => {
    const n = L.ids.length;
    for (let k = 0; k < n; k++) {
      const end = k === 0 || k === n - 1;
      if (end && (k === 0 ? L.c0 : L.c1)) continue;
      const id = L.ids[k], X = NX[id], Y = NY[id], tol = end ? SNAP_END : SNAP_MID, best = new Map();
      cellsOf(X - tol, Y - tol, X + tol, Y + tol, key => {
        const c = sgrid.get(key); if (!c) return;
        for (let q = 0; q < c.length; q += 2) {
          const l2 = c[q], j = c[q + 1], M = lines[l2];
          if ((M.lvl !== L.lvl && !(end && L.lvl)) || (l2 === li && (j === k || j === k - 1))) continue;   // un bout de pont / tunnel rejoint le sol
          const a = M.ids[j], b = M.ids[j + 1]; if (a === id || b === id) continue;
          const pr = proj(X, Y, a, b); if (pr.d > tol) continue;
          const o = best.get(l2); if (!o || pr.d < o.d) best.set(l2, { j, t: pr.t, d: pr.d, a, b });
        }
      });
      for (const [l2, h] of best) {
        const da = Math.hypot(NX[h.a] - X, NY[h.a] - Y), db = Math.hypot(NX[h.b] - X, NY[h.b] - Y);
        if (Math.min(da, db) <= Math.max(MERGE * 2, h.d + MERGE)) union(id, da <= db ? h.a : h.b); else addIns(l2, h.j, h.t, id);
      }
    }
  });
  // 3. croisements au même niveau sans sommet commun (sommet simplifié sur les deux voies)
  const done = new Set();
  for (const c of sgrid.values()) for (let u = 0; u < c.length; u += 2) for (let v = u + 2; v < c.length; v += 2) {
    const l1 = c[u], j1 = c[u + 1], l2 = c[v], j2 = c[v + 1];
    if (lines[l1].lvl !== lines[l2].lvl || (l1 === l2 && Math.abs(j1 - j2) <= 1)) continue;
    const key = l1 < l2 || (l1 === l2 && j1 < j2) ? l1 + ':' + j1 + ':' + l2 + ':' + j2 : l2 + ':' + j2 + ':' + l1 + ':' + j1;
    if (done.has(key)) continue; done.add(key);
    const A = lines[l1].ids, B = lines[l2].ids, a1 = A[j1], b1 = A[j1 + 1], a2 = B[j2], b2 = B[j2 + 1];
    if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
    const rx = NX[b1] - NX[a1], ry = NY[b1] - NY[a1], sx = NX[b2] - NX[a2], sy = NY[b2] - NY[a2], den = rx * sy - ry * sx;
    if (!den) continue;
    const qx = NX[a2] - NX[a1], qy = NY[a2] - NY[a1], t = (qx * sy - qy * sx) / den, w = (qx * ry - qy * rx) / den;
    const l1n = Math.hypot(rx, ry), l2n = Math.hypot(sx, sy);
    if (t * l1n <= MERGE || (1 - t) * l1n <= MERGE || w * l2n <= MERGE || (1 - w) * l2n <= MERGE) continue;
    const id = nodeAt(NX[a1] + rx * t, NY[a1] + ry * t);
    addIns(l1, j1, t, id); addIns(l2, j2, w, id);
  }
  for (let li = 0; li < lines.length; li++) {
    const L = lines[li], o = [];
    for (let j = 0; j < L.ids.length; j++) {
      o.push(L.ids[j]);
      const a = ins[li].get(j); if (a) { a.sort((p, q) => p.t - q.t); for (const z of a) o.push(z.id); }
    }
    const f = []; for (const id of o) { const r = find(id); if (f[f.length - 1] !== r) f.push(r); }
    L.ids = f;
  }
  // 4. ronds-points (absents du schéma) : petite boucle presque ronde, sans angle vif, qu'on parcourt dans un seul sens
  const ROADS = /^(trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$/;
  const outE = new Map(), rbSeg = new Set(), inRb = new Set(), MAXP = U(420);
  lines.forEach((L, li) => {
    const ow = L.tags.oneway; if (!ROADS.test(L.tags.highway)) return;
    for (let j = 0; j + 1 < L.ids.length; j++) {
      const dirs = ow === 'yes' ? [[L.ids[j], L.ids[j + 1]]] : ow === '-1' ? [[L.ids[j + 1], L.ids[j]]] : [[L.ids[j], L.ids[j + 1]], [L.ids[j + 1], L.ids[j]]];
      for (const [a, b] of dirs) {
        const len = Math.hypot(NX[b] - NX[a], NY[b] - NY[a]); if (!len) continue;
        let e = outE.get(a); if (!e) outE.set(a, e = []); e.push({ a, b, li, j, len, hd: Math.atan2(NY[b] - NY[a], NX[b] - NX[a]), ow: !!ow });
      }
    }
  });
  const turn = (h1, h2) => { let d = (h2 - h1) * R2D; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  const roundish = path => {              // forme : périmètre court, quotient isopérimétrique élevé, virages réguliers dans le même sens
    if (path.length < 4) return false;
    let A = 0, P = 0, sum = 0, mx = 0;
    for (let i = 0; i < path.length; i++) {
      const e = path[i], nx = path[(i + 1) % path.length], t = turn(e.hd, nx.hd);
      mx = Math.max(mx, Math.abs(t)); sum += t; A += NX[e.a] * NY[e.b] - NX[e.b] * NY[e.a]; P += e.len;
    }
    if (P < U(70) ? mx > 95 : (mx > 70 || path.length < 5)) return false;     // mini rond-point : peu de sommets, angles plus marqués
    return P <= MAXP && Math.abs(Math.abs(sum) - 360) < 40 && 4 * Math.PI * Math.abs(A / 2) / (P * P) >= 0.75;
  };
  const mark = path => { for (const e of path) { rbSeg.add(e.li + ':' + e.j); inRb.add(e.a); } };
  for (const [s, list] of outE) {
    if (inRb.has(s) || list.length < 2) continue;
    for (const e0 of list) {                // on suit la continuation la plus douce jusqu'à revenir au départ
      const path = [e0]; let cur = e0, P = e0.len, ok = false;
      while (P <= MAXP && path.length < 80) {
        if (cur.b === s) { ok = true; break; }
        let best = null;                     // la suite de la même voie d'abord (l'anneau est en général d'un seul tenant), sinon la plus douce
        for (const e of outE.get(cur.b) || []) {
          if (e.b === cur.a) continue;
          const t = Math.abs(turn(cur.hd, e.hd)), same = e.li === cur.li && Math.abs(e.j - cur.j) === 1;
          if (t <= (P < U(70) ? 95 : 70) && (!best || (same && !best.same) || (same === best.same && t < best.t))) best = { e, t, same };
        }
        if (!best) break;
        cur = best.e; path.push(cur); P += cur.len;
      }
      if (ok && roundish(path) && path.some(e => e.ow) === path.every(e => e.ow)) { mark(path); break; }
    }
    if (inRb.has(s) || !list.some(e => e.ow)) continue;
    // anneau à sens unique dont une bretelle part en douceur : plus court circuit à sens unique (Dijkstra borné)
    const dist = new Map([[s, 0]]), via = new Map(), open = [s], fin = new Set(); let found = null;
    while (open.length && !found) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
      const u = open.splice(bi, 1)[0]; if (fin.has(u)) continue; fin.add(u);
      for (const e of outE.get(u) || []) {
        if (!e.ow) continue;
        const d = dist.get(u) + e.len; if (d > MAXP) continue;
        if (e.b === s) { const path = [e]; for (let n = u; n !== s; n = via.get(n).a) path.unshift(via.get(n).e); found = path; break; }
        if (!dist.has(e.b) || d < dist.get(e.b)) { dist.set(e.b, d); via.set(e.b, { a: u, e }); open.push(e.b); }
      }
    }
    if (found && roundish(found)) mark(found);
  }
  // 5. voies finales (coupées en entrée / sortie de rond-point), noms et numéros, « rue » dans les zones habitées
  const ngr = new Map(), resid = polys.filter(q => q.tags.landuse === 'residential');
  names.forEach((nm, ni) => { for (let j = 0; j + 1 < nm.pts.length; j++) { const a = nm.pts[j], b = nm.pts[j + 1];
    cellsOf(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), k => { let c = ngr.get(k); if (!c) ngr.set(k, c = []); c.push(ni, j); }); } });
  const nameAt = (X, Y, hd) => {
    let best = null;
    cellsOf(X - U(4), Y - U(4), X + U(4), Y + U(4), key => {
      const c = ngr.get(key); if (!c) return;
      for (let q = 0; q < c.length; q += 2) {
        const nm = names[c[q]], a = nm.pts[c[q + 1]], b = nm.pts[c[q + 1] + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; if (!l2) continue;
        const t = Math.max(0, Math.min(1, ((X - a[0]) * dx + (Y - a[1]) * dy) / l2)), d = Math.hypot(X - a[0] - dx * t, Y - a[1] - dy * t);
        const an = Math.abs(((Math.atan2(dy, dx) - hd) * R2D % 180 + 270) % 180 - 90);
        if (d <= U(4) && an <= 30 && (!best || d < best.d)) best = { d, nm };
      }
    });
    return best && best.nm;
  };
  const inPoly = (X, Y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > Y) !== (b[1] > Y) && X < (b[0] - a[0]) * (Y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const ways = [];
  lines.forEach((L, li) => {
    let run = null;
    for (let j = 0; j + 1 < L.ids.length; j++) {
      const rb = rbSeg.has(li + ':' + j);
      if (!run || run.rb !== rb) { run = { rb, ids: [L.ids[j]], L }; ways.push(run); }
      run.ids.push(L.ids[j + 1]);
    }
  });
  const els = [], ntags = new Map(), used = new Set();
  // 6. portails, barrières, plots : posés sur le sommet le plus proche du chemin (ajouté si besoin)
  if (marks.length) {
    const wg = new Map();
    ways.forEach((w, wi) => { for (let j = 0; j + 1 < w.ids.length; j++) { const a = w.ids[j], b = w.ids[j + 1];
      cellsOf(Math.min(NX[a], NX[b]), Math.min(NY[a], NY[b]), Math.max(NX[a], NX[b]), Math.max(NY[a], NY[b]), k => { let c = wg.get(k); if (!c) wg.set(k, c = []); c.push(wi, j); }); } });
    for (const m of marks) {
      let best = null;
      cellsOf(m.X - U(3), m.Y - U(3), m.X + U(3), m.Y + U(3), key => { const c = wg.get(key); if (!c) return;
        for (let q = 0; q < c.length; q += 2) { const w = ways[c[q]], j = c[q + 1], pr = proj(m.X, m.Y, w.ids[j], w.ids[j + 1]); if (pr.d <= U(3) && (!best || pr.d < best.d)) best = { w, j, ...pr }; } });
      if (!best) continue;
      const a = best.w.ids[best.j], b = best.w.ids[best.j + 1], len = Math.hypot(NX[b] - NX[a], NY[b] - NY[a]);
      let id = best.t * len <= U(1.5) ? a : (1 - best.t) * len <= U(1.5) ? b : -1;
      if (id < 0) { id = NX.length; NX.push(NX[a] + (NX[b] - NX[a]) * best.t); NY.push(NY[a] + (NY[b] - NY[a]) * best.t); par.push(id); best.w.ids.splice(best.j + 1, 0, id); }
      ntags.set(id, { ...(ntags.get(id) || {}), ...m.tags });
    }
  }
  ways.forEach((w, wi) => {
    const L = w.L, mid = Math.floor((w.ids.length - 1) / 2), a = w.ids[mid], b = w.ids[mid + 1];
    const X = (NX[a] + NX[b]) / 2, Y = (NY[a] + NY[b]) / 2, tags = { ...L.tags };
    if (w.rb) tags.junction = 'roundabout';
    const nm = nameAt(X, Y, Math.atan2(NY[b] - NY[a], NX[b] - NX[a])); if (nm) { if (nm.name) tags.name = nm.name; if (nm.ref) tags.ref = nm.ref; }
    if (tags.highway === 'unclassified' && resid.some(q => inPoly(X, Y, q.pts))) tags.highway = 'residential';
    for (const id of w.ids) used.add(id);
    els.push({ type: 'way', id: wi + 1, nodes: w.ids.map(i => i + 1), tags });
  });
  for (const id of used) { const [lat, lon] = toLL(NX[id], NY[id]); els.push({ type: 'node', id: id + 1, lat, lon, tags: ntags.get(id) || null }); }
  polys.forEach((q, i) => els.push({ type: 'way', id: 1e9 + i, tags: q.tags, geometry: q.pts.map(([X, Y]) => { const [lat, lon] = toLL(X, Y); return { lat, lon }; }) }));
  pois.forEach((q, i) => { const [lat, lon] = toLL(q.X, q.Y); els.push({ type: 'poi', id: 'v' + i, lat, lon, tags: q.tags }); });
  return els;
}
if (typeof module !== 'undefined') module.exports = { decodeMVT, vtToElements, VT_Z };
