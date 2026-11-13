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
const tolEff = () => S.mm ? 5 : S.src === 'draw' ? Math.min(S.settings.tol || 10, 12) : Math.min(S.settings.tol || 10, 25);      // écart 0 = pas de recalage : on garde la trace telle quelle, repérage à 10 m

