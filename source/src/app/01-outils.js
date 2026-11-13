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

