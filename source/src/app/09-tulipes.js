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
function buildTulip(c, H, chain, others, kind, keepEntry) {
  // L'entrée de la tulipe est TOUJOURS verticale, quelle que soit la situation : on oriente sur la ligne droite « début de l'entrée → centre »
  // et on remplace l'entrée (courbe ou non) par ce segment droit ; les tracés noirs qu'elle recouvrait sont retirés (voir plus bas).
  let origEntry = null;
  if (kind !== 'start' && !keepEntry && chain.length >= 2) {
    let c0 = 0, bd = Infinity; chain.forEach((q, i) => { const d = dxy(q.p, c); if (d < bd) { bd = d; c0 = i; } });
    let acc = 0, k = c0; const LIM = S.settings.tulipR * 0.95;
    while (k > 0 && acc < LIM) { acc += dxy(chain[k].p, chain[k - 1].p); k--; }
    if (k < c0 && dxy(chain[k].p, c) > 4) {
      H = bxy(chain[k].p, c);
      origEntry = chain.slice(k, c0 + 1).map(q => q.p);
      chain = [{ p: chain[k].p, c: chain[c0].c }, { p: c, c: chain[c0].c }, ...chain.slice(c0 + 1)];
    }
  }
  const R = S.settings.tulipR, co = Math.cos(H * D2R), si = Math.sin(H * D2R), B = tulipBoxes(R);
  const tr = p => { const x = p[0] - c[0], y = p[1] - c[1]; return [x * co - y * si, x * si + y * co]; };
  let rt = chain.map(q => ({ p: tr(q.p), c: q.c }));
  if (kind === 'start' || kind === 'end') rt = rt.filter((q, i) => i === 0 || dxy(q.p, rt[i - 1].p) > 0.01);
  let ci = 0, bd = Infinity;
  rt.forEach((q, i) => { const d = q.p[0] * q.p[0] + q.p[1] * q.p[1]; if (d < bd) { bd = d; ci = i; } });
  rt = clipChain(rt, ci, B.route);
  const oth = [];
  const oe = origEntry ? origEntry.map(tr) : null;
  let oeLen = null, oeTot = 0;
  if (oe) { oeLen = [0]; for (let i = 0; i + 1 < oe.length; i++) oeLen.push(oeLen[i] + dxy(oe[i], oe[i + 1])); oeTot = oeLen[oeLen.length - 1]; }
  // les routes rattachées à l'ancienne entrée suivent son redressement (déplacement de l'entrée, atténué avec la distance)
  const warp = q => {
    let bd = Infinity, bt = 0;
    for (let i = 0; i + 1 < oe.length; i++) { const sp = segProj(q, oe[i], oe[i + 1]); if (sp.d < bd) { bd = sp.d; bt = oeLen[i] + dxy(oe[i], sp.q) ; } }
    if (bd < 0.5) return null;                                                    // superposé à l'entrée : retiré
    const w = Math.max(0, 1 - bd / 30), u = bt / oeTot;
    let old = oe[0]; for (let i = 0; i + 1 < oe.length; i++) if (bt <= oeLen[i + 1]) { old = lerp(oe[i], oe[i + 1], (bt - oeLen[i]) / Math.max(1e-9, oeLen[i + 1] - oeLen[i])); break; }
    const nw = lerp(oe[0], oe[oe.length - 1], u);
    return [q[0] + (nw[0] - old[0]) * w, q[1] + (nw[1] - old[1]) * w];
  };
  for (const o of others) for (const piece of clipPolyBox(o.pts.map(tr), B.full)) {
    if (!oe) { if (polyLen(piece) > 1.5) oth.push({ c: o.c, p: piece.map(rnd) }); continue; }
    let run = [];
    const flush = () => { if (run.length > 1 && polyLen(run) > 1.5) oth.push({ c: o.c, p: run.map(rnd) }); run = []; };
    for (let i = 0; i < piece.length; i++) {
      const a = piece[i], bq = piece[i + 1], n = bq ? Math.max(1, Math.ceil(dxy(a, bq) / 1)) : 1;
      for (let m = 0; m < n; m++) { const w = warp(m ? lerp(a, bq, m / n) : a); if (w) run.push(w); else flush(); }
    }
    flush();
  }
  const wa = [], wl = [], bld = [];
  for (const f of featuresNear(G, c, R * 1.7)) {
    const pts = f.pts.map(tr);
    if (f.area) { const poly = clipPolygonBox(pts, B.full); if (poly.length >= 3) (f.k === 'bld' ? bld : wa).push(poly.map(rnd)); }
    else for (const piece of clipPolyBox(pts, B.full)) if (polyLen(piece) > 1.5) wl.push({ k: f.k, p: piece.map(rnd) });
  }
  const t = { R, sq: 1, kind, route: rt.map(q => ({ p: rnd(q.p), c: q.c })), others: oth };
  if (wa.length) t.wa = wa; if (wl.length) t.wl = wl; if (bld.length) t.bld = bld;
  if (kind !== 'start' && kind !== 'end' && !keepEntry && t.route.length >= 3) {      // trait-point (remise à 0 du trip) posé par défaut au centre de la tulipe
    let bi = 1, bdd = Infinity;
    for (let i = 1; i <= t.route.length - 2; i++) { const d = t.route[i].p[0] ** 2 + t.route[i].p[1] ** 2; if (d < bdd) { bdd = d; bi = i; } }
    if (bdd < 9) { t.sp = bi; t.reset = true; }
  }
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
const ROUTE_C = '#0000FF';            // parcours à suivre : bleu pur (distinct du bleu ciel des cours d'eau), le reste en noir
function freeSyms(list, c, W, H) {       // symboles posés librement : x, y = centre en % de la case, h = hauteur en % de la case
  let o = '';
  for (const q of list || []) { if (q.c === c && q.tx != null) { o += ftSVG(q, W, H); continue; } const S = FIA_LEX[q.k]; if (!S || q.c !== c) continue; const h = q.h / 100 * H, w = h * S.w / S.h; o += `<image x="${f1(q.x / 100 * W - w / 2)}" y="${f1(q.y / 100 * H - h / 2)}" width="${f1(w)}" height="${f1(h)}" href="${S.d}" xlink:href="${S.d}"/>`; }
  return o;
}
function freeLayer(list, c) {            // même chose en HTML, pour le roadbook à l'écran et à l'impression
  const a = (list || []).filter(q => q.c === c && (FIA_LEX[q.k] || q.tx != null));
  return a.map(q => q.tx != null ? `<div class="fs ft" style="left:${q.x}%;top:${q.y}%;font-size:calc(var(--u) * ${q.h})">${ftInner(q)}</div>`
    : `<img class="fs" src="${FIA_LEX[q.k].d}" alt="" style="left:${q.x}%;top:${q.y}%;height:${q.h}%">`).join('');
}
// textes libres : { tx, c, x, y, h } — h = hauteur des lettres en % de la case ; le texte principal déplacé (n.tpos) en est un aussi : 1re ligne en gros, les autres plus petites
const txLines = q => String(q.tx).split('\n');
const ftSize = (q, i) => q.main ? (i ? .62 : 1) : 1;
function ftInner(q) {
  return txLines(q).map((l, i) => q.main ? (i ? `<i>${esc(l)}</i>` : `<b>${esc(l)}</b>`) : `<b>${esc(l)}</b>`).join('');
}
function ftSVG(q, W, H) {
  const FF = 'Arial Narrow, Roboto Condensed, Arial, sans-serif', L = txLines(q), base = q.h / 100 * H;
  const sz = L.map((_, i) => base * ftSize(q, i)), tot = sz.reduce((t, v) => t + v * 1.1, 0);
  let y = q.y / 100 * H - tot / 2, o = '';
  L.forEach((l, i) => { if (l.trim()) o += `<text x="${f1(q.x / 100 * W)}" y="${f1(y + sz[i] * 0.88)}" text-anchor="middle" font-family="${FF}" font-weight="${q.main && i ? 400 : 700}" font-size="${f1(sz[i])}" fill="#000">${esc(l)}</text>`; y += sz[i] * 1.1; });
  return o;
}
// « trait-point » (remise à zéro du trip) entre l'entrée et la sortie : toujours orienté pareil, à environ 135° du sens de marche (vers le bas),
// à droite ou à gauche du parcours selon la place libre (réglage manuel possible : t.resetSide = 'r' | 'l')
function resetMark(t, sc, oth) {
  const R = t && t.route;
  if (!t || !t.reset || !R || !Number.isInteger(t.sp) || t.sp < 1 || t.sp > R.length - 2) return '';
  const c = sc(R[t.sp].p), a = sc(R[t.sp - 1].p), b = sc(R[t.sp + 1].p);
  const nrm = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const u1 = nrm([a[0] - c[0], a[1] - c[1]]), u2 = nrm([b[0] - c[0], b[1] - c[1]]);
  const fw = nrm([-u1[0], -u1[1]]);                                                 // sens de marche à l'ENTRÉE de la tulipe (l'entrée est verticale)
  const rn = [-fw[1], fw[0]];                                                       // « droite » de la marche à l'écran
  const rot = th => [u1[0] * Math.cos(th) - u1[1] * Math.sin(th), u1[0] * Math.sin(th) + u1[1] * Math.cos(th)];
  const LEN = 9, A = 45 * Math.PI / 180, c1 = rot(A), c2 = rot(-A);                 // le trait-point est à 45° de la ligne d'entrée, à droite ou à gauche
  const dr = v => v[0] * rn[0] + v[1] * rn[1], vr = dr(c1) >= dr(c2) ? c1 : c2, vl = vr === c1 ? c2 : c1;
  const tip = v => [c[0] + v[0] * LEN, c[1] + v[1] * LEN];
  const free = v => {                                                              // distance du bout du trait au tracé le plus proche
    const e = tip(v), mid = [c[0] + v[0] * LEN / 2, c[1] + v[1] * LEN / 2]; let d = Infinity;
    const poly = [...(oth || []).map(o => o.p), (R || []).map(q => sc(q.p))];
    for (const pl of poly) for (let i = 0; i + 1 < pl.length; i++) d = Math.min(d, segProj(e, pl[i], pl[i + 1]).d, segProj(mid, pl[i], pl[i + 1]).d);
    return d;
  };
  let v = vr;
  if (t.resetSide === 'l') v = vl; else if (t.resetSide !== 'r' && free(vl) > free(vr) + 1) v = vl;
  const e = tip(v);
  return `<path d="M${f1(c[0])} ${f1(c[1])}L${f1(e[0])} ${f1(e[1])}" stroke="#000" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="${f1(e[0])}" cy="${f1(e[1])}" r="2.5" fill="#000"/>`;
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
  let oth = (t.others || []).map(o => ({ c: o.c, p: o.p.map(sc) }));
  if ((t.route || []).length >= 2) {
    // le parcours est dessiné en bleu : on ne trace PAS en noir le chemin qui lui est superposé (entre son début et sa fin).
    // Ce qui continue avant le point de départ et après la pointe de la flèche reste en noir ; réglage « Montrer la route d'où l'on vient et où l'on va » désactivé : on le retire aussi.
    const rp = t.route.map(q => sc(q.p)), r0 = rp[0], r1 = rp[rp.length - 1], ON = 3.2, last = rp.length - 2;
    const onRoute = p => {            // le point est-il sur le parcours (pas au-delà de son début ni de sa fin) ?
      for (let i = 0; i <= last; i++) {
        const a = rp[i], b = rp[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        let u = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
        if ((i === 0 && u < 0) || (i === last && u > 1)) continue;
        u = clamp(u, 0, 1);
        if (Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy)) < ON) return true;
      }
      return false;
    };
    let out = [];
    for (const o of oth) {
      const pts = o.p; let run = [], lastOk = null;
      const flush = () => { if (lastOk && run[run.length - 1] !== lastOk) run.push(lastOk); if (run.length > 1 && polyLen(run) >= 3) out.push({ c: o.c, p: run }); run = []; lastOk = null; };
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], n = b ? Math.max(1, Math.ceil(dxy(a, b) / 0.5)) : 1;
        for (let k = 0; k < n; k++) {
          const m = k ? lerp(a, b, k / n) : a;
          if (onRoute(m)) { flush(); continue; }
          if (!k || !run.length) run.push(m);
          lastOk = m;
        }
      }
      flush();
    }
    if (S.settings.routeExt === false) {
      const dPoly = (p, poly) => { let d = Infinity; for (let i = 0; i + 1 < poly.length; i++) d = Math.min(d, segProj(p, poly[i], poly[i + 1]).d); return d; };
      const ends = r => [r.p[0], r.p[r.p.length - 1]];
      let gone = out.filter(r => ends(r).some(e => dxy(e, r0) < 5 || dxy(e, r1) < 5));      // le prolongement de la route
      out = out.filter(r => !gone.includes(r));
      for (let again = true; again && gone.length;) {                                       // et les bouts de chemins qui n'y tenaient plus qu'à lui
        again = false;
        const more = out.filter(r => ends(r).some(e => gone.some(g => dPoly(e, g.p) < 4)) && !ends(r).some(e => dPoly(e, rp) < 4.5));
        if (more.length) { again = true; out = out.filter(r => !more.includes(r)); gone = gone.concat(more); }
      }
    }
    oth = out;
  }
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
  s += resetMark(t, sc, oth);
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
  const NV = noteView(n), lines = n.tpos ? [] : NV.lines, lk = NV.keys, info = n.kind === 'info';      // lk : symboles du lexique FIA (automatiques et posés à la main)
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  let y = 10;
  const head = lines[0] ? wrapText(lines[0], 12).slice(0, 2) : [];
  const fs = Math.max(34, Math.min(64, Math.floor(372 / (0.55 * Math.max(1, ...head.join(' ').split(' ').map(w => w.length))))));      // un long nom d'un seul mot est réduit pour tenir dans l'image
  const title = () => { for (const l of head) { y += 66; s += `<text x="16" y="${y}" font-family="${FF}" font-weight="bold" font-size="${fs}" fill="#000">${esc(l)}</text>`; } y += 8; };
  const symbols = () => {                // symboles en rangées : sous la direction, ou avant le nom pour une note « info »
    if (!lk.length) return;
    const GAP = 10, MAXW = W - 32, rowsAt = ih => { let r = 1, x = 16; for (const k of lk) { const w = Math.min(MAXW, ih * FIA_LEX[k].w / FIA_LEX[k].h); if (x > 16 && x + w > 16 + MAXW) { r++; x = 16; } x += w + GAP; } return r; };
    const keep = 44 * Math.min(2, lines.slice(1).filter(l => l.trim()).length) + (info ? head.length * 66 : 0);           // place gardée pour le texte
    let IH = lines.length ? 66 : 110; if (!lines.length && rowsAt(IH) > 1) for (let h = 106; h >= 60; h -= 4) if (rowsAt(h) === 1) { IH = h; break; }
    while (IH > 30 && y + 4 + rowsAt(IH) * (IH + GAP) + keep > H - 6) IH -= 4;     // réduits si besoin pour tenir dans l'image
    let x = 16, row = 0;
    for (const k of lk) {
      const sy = FIA_LEX[k], w = Math.min(MAXW, IH * sy.w / sy.h), h = w * sy.h / sy.w;
      if (x > 16 && x + w > 16 + MAXW) { row++; x = 16; }
      if (y + 4 + (row + 1) * (IH + GAP) > H) break;
      s += `<image x="${f1(x)}" y="${f1(y + 4 + row * (IH + GAP) + (IH - h) / 2)}" width="${f1(w)}" height="${f1(h)}" href="${sy.d}" xlink:href="${sy.d}"/>`;
      x += w + GAP;
    }
    y += 4 + (row + 1) * (IH + GAP);
  };
  if (info) { symbols(); title(); } else { title(); symbols(); }
  outer: for (const l0 of lines.slice(1)) for (const l of wrapText(l0, 21)) {
    if (y + 44 > H - 8) break outer;
    y += 44; s += `<text x="16" y="${y}" font-family="${FF}" font-size="40" fill="#000">${esc(l)}</text>`;
  }
  if (n.wp && /^(dss|dt|ch)$/.test(n.wp.type) && n.wp.limit > 0) s += `<text x="${W - 14}" y="40" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="42" fill="#E00000">T:${n.wp.limit}</text>`;      // temps limite en rouge (le lecteur ne le connaît pas)
  return s + freeSyms((n.sym || []).concat(n.tpos && NV.lines.some(Boolean) ? [{ ...n.tpos, tx: NV.lines.join('\n'), main: 1, c: 'd' }] : []), 'd', W, H) + '</svg>';
}
const WP_TYPES = [
  ['', 'Aucun'], ['wpv', 'WPV — visible'], ['wpm', 'WPM — masqué'], ['wps', 'WPS — sécurité'], ['wpe', 'WPE — éclipse'],
  ['wpc', 'WPC — contrôle'], ['wpn', 'WPN — navigation'], ['wpp', 'WPP — passage'], ['cp', 'CP — contrôle de passage'], ['ch', 'CH — contrôle horaire (liaison)'], ['dss', 'DSS — départ spéciale'], ['ass', 'ASS — arrivée spéciale'],
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
const SYM_ALT = { dnv: 'DN', dtv: 'DT', ch: 'CH', fuel: 'Carburant' };
// CH (contrôle horaire) : symbole du lexique FIM (chronomètre, image fournie par l'utilisateur)
FIM_SYM.ch = { w: 128, h: 128, d: 'data:image/png;base64,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' };
const symImg = k => ({ a: FIM_SYM[k].w / FIM_SYM[k].h, h: `<img class="sym" src="${FIM_SYM[k].d}" alt="${SYM_ALT[k] || k.toUpperCase()}">` });
const symSign = (sp, barred) => ({ a: 1, h: speedSign(sp, barred) });
function noteSymbols(n, f) {     // ordre du lexique : waypoint, FZ + panneau barré, DZ + panneau, carburant
  const t = n.wp && n.wp.type, zt = n.zone && n.zone.type, out = [];
  if (t && FIM_SYM[t]) {
    const lim = /^(dn|dt|dss)$/.test(t) && n.wp.speed;      // DN / DT / DSS avec limitation : panneau (DN / DT : rond orange)
    out.push(symImg(lim && t !== 'dss' ? t + 'v' : t));
  }
  if (zt === 'fz' || zt === 'fzdz') out.push(symImg('fz'));
  if (zt === 'dz' || zt === 'fzdz') out.push(symImg('dz'));
  if (n.fuel) out.push(symImg('fuel'));
  return out;
}
function noteSigns(n, f) {       // panneaux de limitation de vitesse : en bas à droite de la 3e case (et non plus dans la 1re)
  const t = n.wp && n.wp.type, zt = n.zone && n.zone.type, out = [];
  if (/^(dn|dt|dss|ch)$/.test(t || '') && n.wp.speed && !zt) out.push(speedSign(n.wp.speed));
  if ((zt === 'fz' || zt === 'fzdz') && f.endSp) out.push(speedSign(f.endSp, true));
  if ((zt === 'dz' || zt === 'fzdz') && n.zone.speed) out.push(speedSign(n.zone.speed));
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
  renderStages(); if (measOn) renderMeasList();
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
  const fl = notes.map((n, i) => {
    normNote(n);
    const t = n.wp && n.wp.type, zt = n.zone && n.zone.type;
    const endSp = zt === 'fz' || zt === 'fzdz' ? zsp : null;      // vitesse de la zone qui se termine (panneau barré)
    if (zt === 'dz' || zt === 'fzdz') zsp = n.zone.speed || null; else if (/^(dn|dt|dss)$/.test(t || '') && n.wp.speed) zsp = n.wp.speed;
    const starts = zt === 'dz' || zt === 'fzdz';      // seul un DZ colore la zone en orange (une limite saisie sur DN / DT / DSS ne colore rien)
    if (starts) zone = true;
    const z = zone, ends = zt === 'fz' || zt === 'fzdz' || t === 'fn' || t === 'ft' || t === 'ass';
    if (zt === 'fz' || t === 'fn' || t === 'ft' || t === 'ass') zone = false;
    const nx = notes[i + 1], pv = notes[i - 1];
    return { zone: z, zStart: z && starts, zEnd: z && ends, endSp, close: !!nx && nx.s - n.s <= 300, green: !!pv && n.s - pv.s <= 300, red: t === 'wps' || n.danger === 3 };
  });
  fl.forEach((f, i) => { if (f.zone) { f.zTop = f.zStart || !fl[i - 1] || !fl[i - 1].zone || fl[i - 1].zEnd; f.zBot = f.zEnd || !fl[i + 1] || !fl[i + 1].zone || fl[i + 1].zStart; } });      // un seul cadre orange autour de toutes les notes de la zone
  return fl;
}
/* ---------- Symboles du lexique FIA ajoutés à une note (case description) ---------- */
const lexKeys = n => (n.lex || []).filter(k => FIA_LEX[k]);
/* ---------- Remplacement automatique : certaines lignes de texte des notes automatiques deviennent le symbole du lexique ---------- */
const sideSym = d => d === 'D' ? ['onR'] : d === 'G' ? ['onL'] : [];      // « à D / à G » → « sur la droite / gauche » du lexique
const AUTO_SYM = [      // [ligne de texte, () → { keys: symboles, text: texte gardé à côté (nom, vitesse…), dir: c'est la direction (1re ligne) }]
  [/^TD$/, () => ({ keys: ['kpS'], dir: 1, grp: 'nav' })],                 // tout droit → « kpS » (garder tout droit)
  [/^Serrer à D$/, () => ({ keys: ['kpR'], dir: 1, grp: 'nav' })],         // serrer à droite → « kpR » (garder la droite)
  [/^Serrer à G$/, () => ({ keys: ['kpL'], dir: 1, grp: 'nav' })],
  [/^Suivre la piste$/, () => ({ keys: ['FPP'], grp: 'nav' })],      // plusieurs carrefours sur la même piste → FPP (suivre la piste principale)
  [/^Suivre la route(?: (.+))?$/, m => ({ keys: ['FRO'], text: m[1] || '', grp: 'nav' })],      // plusieurs carrefours sur la même route → FRO (suivre la route)
  [/^sur (?:route|rue)(?: (.+))?$/, m => ({ keys: ['RO'], text: m[1] || '', grp: 'nav' })],      // « sur route D 976 » → RO + « D 976 »
  [/^sur (?:petite )?piste$/, () => ({ keys: ['P'], grp: 'nav' })],
  [/^sur sentier$/, () => ({ keys: ['T'], grp: 'nav' })],      // piste et sentier : même symbole « P »         // serrer à gauche → « kpL » (garder la gauche)
  [/^Rond-point$/, () => ({ keys: ['roundabout'], grp: 'nav' })],
  [/^Pont$/, () => ({ keys: ['onbridge'] })],
  [/^Pont sur voie ferrée$/, () => ({ keys: ['onbridge', 'rail'], et: 1 })],
  [/^Sous pont$/, () => ({ keys: ['underbridge'] })],
  [/^Sous voie ferrée$/, () => ({ keys: ['underbridge', 'rail'], et: 1 })],
  [/^Tunnel$/, () => ({ keys: ['tunnel'] })],
  [/^Gué$/, () => ({ keys: ['wading'] })],
  [/^(?:Voie ferrée|Passage à niveau)$/, () => ({ keys: ['rail'] })],
  [/^Grille à bétail(?: \(privé\))?$/, () => ({ keys: ['cattlegate'] })],
  [/^(?:Portail|Barrière|Portail coulissant|Barrière pivotante)( \(privé\))?$/, m => ({ keys: ['fencegate'], text: m[1] ? 'privé' : '' })],
  [/^STOP$/, () => ({ keys: ['stoproad'] })],      // STOP routier relevé dans OSM / IGN → panneau octogonal (le « stop » rond du lexique FIA reste pour les liaisons, CH… posé à la main)
  [/^Début goudron$/, () => ({ keys: ['tarmac'], grp: 'nav' })],
  [/^Fin goudron$/, () => ({ keys: ['track'], grp: 'nav' })],
  [/^Antenne(?: à ([DG]))?$/, m => ({ keys: ['antenna', ...sideSym(m[1])] })],
  [/^Station-service(?: à ([DG]))?$/, m => ({ keys: ['petrol_1', ...sideSym(m[1])] })],
  [/^(?:Église|Lieu de culte)(?: à ([DG]))?$/, m => ({ keys: ['church_1', ...sideSym(m[1])] })],
  [/^Château d'eau(?: à ([DG]))?$/, m => ({ keys: ['tanks_1', ...sideSym(m[1])] })],
  [/^Longer clôture à ([DG])$/, m => ({ keys: ['fence', ...sideSym(m[1])] })],
  [/^Longer mur à ([DG])$/, m => ({ keys: ['wall_1', ...sideSym(m[1])] })],
  [/^(Entrée|Sortie) (.+)$/, m => ({ keys: [m[1] === 'Entrée' ? 'IN' : 'QT', 'village'], text: m[2] })],      // « IN » = dans, « QT » = quitter
  [/^Sommet$/, () => ({ keys: ['mountain_1'] })],
  [/^Sommet (.+)$/, m => ({ keys: ['mountain_1'], text: m[1] })],
  [/^Col(?: .*)?$/, m => ({ keys: ['mountain_1'], text: m[0] })],
  [/^(?:Montée|Descente) raide.*$/, m => ({ keys: ['updown'], text: m[0] })],
  [/^Sable$/, () => ({ keys: ['SA'] })],
  [/^Cailloux$/, () => ({ keys: ['CX'] })],
  [/^Passage sous bâtiment$/, () => ({ keys: ['tunnel'] })],
  [/^Longer haie à ([DG])$/, m => ({ keys: ['VG', ...sideSym(m[1])] })],
  [/^Marches$/, () => ({ keys: ['stepup'] })],
  [/^Piste (?:dégradée|très dégradée|impraticable)$/, () => ({ keys: ['BAD'] })],      // le niveau est donné par les « ! » (danger 1, 2, 3)
  [/^Cédez le passage$/, () => ({ keys: ['yield'] })],
  [/^Boue$/, () => ({ keys: ['mud'] })],
  [/^Péage$/, () => ({ keys: ['toll'] })],
  [/^Lieu-dit (.+)$/, m => ({ keys: ['locality'], text: m[1] })],
  [/^Moulin(?: à ([DG]))?$/, m => ({ keys: ['windmill', ...sideSym(m[1])] })],
  [/^Phare(?: à ([DG]))?$/, m => ({ keys: ['lighthouse', ...sideSym(m[1])] })],
  [/^Tour(?: à ([DG]))?$/, m => ({ keys: ['tower', ...sideSym(m[1])] })],
  [/^Neige$/, () => ({ keys: ['snow'] })],
  [/^Glace$/, () => ({ keys: ['ice'] })],
  [/^Chaîne$/, () => ({ keys: ['chain'] })],
  [/^Blocs$/, () => ({ keys: ['blocks'] })],
  [/^Chicane$/, () => ({ keys: ['chicane'] })],
  [/^Douane$/, () => ({ keys: ['customs'] })],
  [/^Tronc en travers$/, () => ({ keys: ['log'] })],
  [/^Débris$/, () => ({ keys: ['debris'] })],
  [/^Corde$/, () => ({ keys: ['rope'] })],
  [/^Barrière anti-moto$/, () => ({ keys: ['motobar'] })],
  [/^Passage étroit$/, () => ({ keys: ['E3'] })],
  [/^Muret$/, () => ({ keys: ['lowwall'] })],
  [/^Hors piste$/, () => ({ keys: ['HP'] })],
  [/^Plots$/, () => ({ keys: ['bollard'] })],
  [/^Éolienne(?: à ([DG]))?$/, m => ({ keys: ['wind', ...sideSym(m[1])] })],
  [/^Cheminée(?: à ([DG]))?$/, m => ({ keys: ['chimney', ...sideSym(m[1])] })],
  [/^Hameau (.+)$/, m => ({ keys: ['houses_1'], text: m[1] })]
];
const DIR_RE = /^(?:TD|Lég\. à [DG]|À [DG]|Épingle à [DG]|Serrer à [DG]|Virage serré à [DG]|Demi-tour)$/;      // les directions : 1re ligne d'une note de carrefour ou de virage
function noteView(n) {      // lignes de texte restantes et symboles à afficher sous la direction (automatiques, puis ceux posés à la main sur l'ancienne ligne)
  const raw = (n.text || '').split('\n');
  if (n.auto !== false && !n.symLocked && S.settings.showRoad === false) {      // réglage « Afficher les noms de route » décoché : on retire le nom de la rue / de la piste (dernière ligne) et le numéro de la route (« sur route D 976 » → « sur route »)
    const names = n.roadNames || [];
    for (let i = raw.length - 1; i > 0; i--) if (names.includes(raw[i].trim())) raw.splice(i, 1);
    for (let i = 0; i < raw.length; i++) raw[i] = raw[i].replace(/^(sur route|Suivre la route) .+$/, '$1');
  }
  if (n.auto !== false && !n.symLocked && S.settings.showDir === false && DIR_RE.test((raw[0] || '').trim())) raw[0] = '';      // réglage « Afficher les directions » décoché : la place de la direction reste vide
  const OFF = { RO: S.settings.showRO === false, P: S.settings.showPI === false, T: S.settings.showTR === false };      // « sur route » / « sur piste » / « sur sentier » masqués (le regroupement FRO / FPP se fait à la génération : il n'est pas touché)
  if (n.auto !== false && !n.symLocked && S.settings.symAuto === false && (OFF.RO || OFF.P || OFF.T)) {
    for (let i = raw.length - 1; i >= 0; i--) { const l = raw[i].trim(); if ((OFF.RO && /^sur (?:route|rue)(?: .+)?$/.test(l)) || (OFF.P && /^sur (?:petite )?piste$/.test(l)) || (OFF.T && /^sur sentier$/.test(l))) raw.splice(i, 1); }
  }
  if (n.auto === false || n.symLocked || S.settings.symAuto === false) { if (!raw.some(Boolean)) raw.length = 0; return { lines: raw, keys: lexKeys(n) }; }
  const items = [], lines = [];
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i]; let r = null;
    for (const [re, fn] of AUTO_SYM) { const m = re.exec(l.trim()); if (m) { r = fn(m); break; } }
    if (!r) { lines.push(l); continue; }
    items.push(r);
    if (r.keys.length === 1 && OFF[r.keys[0]]) { r.off = true; continue; }      // ligne masquée par le réglage (ni symbole ni texte), mais elle compte encore pour éviter « Début / Fin goudron » en doublon
    if (r.text) lines.push(r.text); else if (r.dir && i === 0) lines.push('');      // la direction devient un symbole : sa place reste vide, le reste du texte ne monte pas en gros
  }
  if (!lines.some(Boolean)) lines.length = 0;
  for (let i = items.length - 1; i >= 0; i--) { const x = items[i]; if (items.some(y => y !== x && y.et && y.keys.length > x.keys.length && x.keys.every(k => y.keys.includes(k)))) items.splice(i, 1); }      // « Sous pont » + « Sous voie ferrée » = un seul « sous un pont ET voie ferrée »
  // « sur route » / « sur piste » disent déjà ce que « Début goudron » / « Fin goudron » ajouteraient : pas de doublon
  const has = k => items.some(it => it.keys.includes(k));
  const keys = []; let prev = null;
  for (const it of items) {
    if (it.off) continue;
    const ks = it.keys.filter(k => FIA_LEX[k] && !keys.includes(k) && !(k === 'tarmac' && (has('RO') || has('FRO'))) && !(k === 'track' && (has('P') || has('FPP') || has('T'))));
    if (!ks.length) continue;
    if (prev && it.grp && prev.grp === it.grp && keys.length) keys.push('ET');      // symboles de la même phrase (direction, type de chemin…) : reliés par « ET »
    ks.forEach((k, j) => { if (j && it.et) keys.push('ET'); keys.push(k); });          // deux symboles d'une même ligne qui se combinent (pont + voie ferrée)
    prev = it;
  }
  for (const k of lexKeys(n)) if (!keys.includes(k)) keys.push(k);
  return { lines, keys };
}
function lexRows(keys, H, W, gap) {      // nombre de rangées quand les symboles (hauteur H) passent à la ligne dans une largeur W
  let rows = keys.length ? 1 : 0, x = 0;
  for (const k of keys) { const s = FIA_LEX[k], w = Math.min(W, H * s.w / s.h); if (x && x + w > W) { rows++; x = 0; } x += w + gap; }
  return rows;
}
const textRows = l => {         // nombre de lignes qu'occupe un texte de la 3e case (≈ 17 caractères par ligne, coupure aux espaces)
  let r = 1, cur = 0;
  for (const w of String(l).split(/\s+/).filter(Boolean)) { if (cur && cur + 1 + w.length > 17) { r++; cur = w.length; } else cur += (cur ? 1 : 0) + w.length; while (cur > 17) { r++; cur -= 17; } }
  return r;
};
function fitLines(lines, dg, cap, symH, bot) {  // lignes secondaires qui tiennent dans la 3e case (le texte complet reste dans la note) ; symH : hauteur des symboles (cqw)
  const extra = lines.slice(1), long = (lines[0] || '').length > 13;
  const max = symH || !lines[0]
    ? Math.floor((33.3 - 1.4 - (bot || (cap ? 6.6 : 1.4)) - (dg ? 5.7 : 0) - (lines[0] ? 5.6 * (long ? 2 : 1) : 0) - (symH ? symH + 0.7 : 0) - 0.6) / 3.96 + 0.05)      // mesure exacte quand il y a des symboles
    : 4 - (dg ? 1 : 0) + (cap ? 0 : 1) - (long ? 1 : 0);
  const rows = extra.map(textRows);
  if (rows.reduce((t, r) => t + r, 0) <= max) return extra;
  if (rows.every(r => r === 1)) return [...extra.slice(0, Math.max(0, max - 1)), '…'];      // lignes courtes : « … » sur sa propre ligne
  const out = []; let used = 0;                                                         // lignes qui passent à la ligne (noms) : on garde le plus possible, « … » en fin de la dernière
  for (let i = 0; i < extra.length; i++) { if (used + rows[i] > max) break; out.push(extra[i]); used += rows[i]; }
  if (used < max) out.push('…'); else if (out.length) out[out.length - 1] += ' …'; else out.push('…');
  return out;
}
function rowInner(n, i, par, f, screen) {
  const t = n.wp && n.wp.type, zt = n.zone && n.zone.type, NV = noteView(n), lines = n.tpos ? [] : NV.lines;      // texte principal déplacé : il est dessiné à part, comme un symbole
  const mainFree = n.tpos && !n.noMain && NV.lines.some(Boolean) ? [{ ...n.tpos, tx: NV.lines.join('\n'), main: 1, c: 'd' }] : [];
  const bg = (t && WP_BG[t]) || (zt === 'fz' ? WP_BG.fz : zt ? WP_BG.dz : null)
    || (/^(dn|fn|dt|ft)$/.test(t || '') ? '#D8D8D8' : null)      // seul un DZ colore la case en orange : une limite saisie sur DN / DT / DSS ne change pas le fond
    || (f.green ? '#A0D080' : '#fff');
  const sym = symsHTML(noteSymbols(n, f), f.close), signs = noteSigns(n, f);
  const sg = signs.length ? `<div class="sg" style="--h:${signs.length > 1 ? 8 : 10.5}cqw">${signs.join('')}</div>` : '';
  const dg = n.danger && t !== 'wps' ? `<div class="dg">${'!'.repeat(n.danger)}</div>` : '';
  const big = /^(dss|ass)$/.test(t || '') ? `<div class="wpbig">${t.toUpperCase()}</div>` : '';      // DSS / ASS : le sigle en grand au milieu de la 3e case (le symbole de la 1re case n'a plus le mot)
  const tl = /^(dss|dt|ch)$/.test(t || '') && n.wp.limit > 0 ? `<div class="tl">T:${n.wp.limit}</div>` : '';      // temps limite : texte rouge en haut de la 3e case
  const top = dg || tl ? `<div class="k3top">${dg}${tl}</div>` : '';
  const cap = n.showCap && n.cap != null ? `<div class="cap">${Math.round(n.cap) % 360}°</div>` : '';
  // symboles du lexique : on les réduit si besoin pour qu'ils tiennent entre la direction et l'encadré du CAP
  const lk = NV.keys, avail = 33.3 - 1.4 - (signs.length ? 12.4 : cap ? 6.6 : 1.4) - (dg || tl ? 5.7 : 0) - (lines[0] ? 5.6 * (lines[0].length > 13 ? 2 : 1) : 0) - 0.7;
  let lh = lines.length ? 7.5 : 11, lr = lexRows(lk, lh, 29.6, 0.6);
  if (!lines.length && lr > 1) for (let h = 10.5; h >= 6; h -= 0.5) if (lexRows(lk, h, 29.6, 0.6) === 1) { lh = h; lr = 1; break; }      // sans texte : plutôt une seule rangée, un peu plus petite
  const need = 3.96 * Math.min(3, lines.slice(1).filter(Boolean).slice(0, 2).reduce((t, l) => t + textRows(l), 0));      // on garde la place des 2 premières lignes de texte (nom de rue, de village…), même si elles passent à la ligne
  while (lk.length && lh > 3.5 && lr * (lh + 0.6) + need > avail) { lh -= 0.5; lr = lexRows(lk, lh, 29.6, 0.6); }
  const lx = lk.length ? `<div class="lx" style="--lh:${lh}cqw">${lk.map(k => `<img src="${FIA_LEX[k].d}" alt="${esc(FIA_LEX[k].l)}" title="${esc(FIA_LEX[k].l)}">`).join('')}</div>` : '';
  return `<div class="k k1" style="background:${bg}"><div class="tot">${kmFr(n.s)}</div><div class="bl"><div class="par">${kmFr(par)}</div>${f.close ? ARROW_SVG : ''}</div>${sym}<div class="br"><div class="num">${i + 1}</div></div></div>`
    + `<div class="k k2">${tulipSVG(n.tulip, 200)}${freeLayer(n.sym, 't')}${t === 'cp' ? '<div class="cpf"></div>' : ''}</div>`
    + `<div class="k k3${signs.length ? ' hs' : cap ? ' hc' : ''}">${big}${top}${n.kind === 'info' ? lx : ''}<div class="t1">${esc(lines[0] || '')}</div>${n.kind === 'info' ? '' : lx}${freeLayer((n.sym || []).concat(mainFree), 'd')}<div class="t2">${esc(fitLines(lines, !!(dg || tl), !!(cap || signs.length), lk.length ? lr * (lh + 0.6) - 0.6 : 0, signs.length ? 12.4 : 0).join('\n'))}</div>${cap}${sg}`
    + (screen && (!n.auto || n.moved) ? '<div class="man">manuelle</div>' : '')
    + (screen ? `<div class="acts"><button data-a="edit" title="Modifier la note">✎</button><button data-a="del" title="Supprimer la note">🗑</button></div>` : '') + `</div>`
    + (f.zone ? `<div class="fr zone${f.zTop ? ' zt' : ''}${f.zBot ? ' zb' : ''}"></div>` : '') + (f.red ? '<div class="fr red"></div>' : '');
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
  const descBox = `<div class="rbr dbox"><textarea id="rbDesc" spellcheck="true" placeholder="Description du roadbook : rallye, étape, date, départ, consignes, rappels…">${esc(S.desc || '')}</textarea></div>`;
  rb.innerHTML = descBox + S.notes.map((n, i) => { const par = n.s - prev; prev = n.s; return `<div class="rbr row${n.id === S.sel ? ' sel' : ''}" data-id="${n.id}">${rowInner(n, i, par, fl[i], true)}</div>`; }).join('');
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
$('#rb').addEventListener('click', e => { const c = e.target.closest('.cap'); if (!c) return; const row = e.target.closest('.row'); const n = row && S.notes.find(x => x.id === +row.dataset.id); if (n) measureForNote(n, false); });
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
// symboles importés par l'utilisateur : catégorie « Mes symboles », mémorisés dans le navigateur (bibliothèque) ET dans le fichier projet
const MYS = {};
function regMySyms(o) {
  for (const [k, v] of Object.entries(o || {})) if (v && v.d) { MYS[k] = v; FIA_LEX[k] = { c: 'Mes symboles', l: v.l, en: v.l, w: v.w, h: v.h, d: v.d }; }
  if (Object.keys(MYS).length && !FIA_CATS.includes('Mes symboles')) FIA_CATS.push('Mes symboles');
}
try { regMySyms(JSON.parse(localStorage.getItem('rbgen.mySyms') || '{}')); } catch (e) { }
function saveMySyms() { try { localStorage.setItem('rbgen.mySyms', JSON.stringify(MYS)); } catch (e) { toast('Bibliothèque de symboles pleine : le symbole reste dans le projet seulement.'); } }
async function importSymbol(file) {      // image → PNG de 160 px max, fond blanc uni retiré (à partir des bords)
  const url = URL.createObjectURL(file), im = new Image();
  await new Promise((ok, ko) => { im.onload = ok; im.onerror = () => ko(new Error('Image illisible')); im.src = url; });
  const sc = Math.min(1, 160 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * sc)), h = Math.max(1, Math.round(im.naturalHeight * sc));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, w, h); URL.revokeObjectURL(url);
  const img = cx.getImageData(0, 0, w, h), D = img.data, white = i => D[i + 3] > 200 && D[i] > 235 && D[i + 1] > 235 && D[i + 2] > 235;
  const seen = new Uint8Array(w * h), q = [];
  for (let x = 0; x < w; x++) q.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) q.push(y * w, y * w + w - 1);
  while (q.length) { const p = q.pop(); if (seen[p] || !white(p * 4)) continue; seen[p] = 1; D[p * 4 + 3] = 0; const x = p % w; if (x > 0) q.push(p - 1); if (x < w - 1) q.push(p + 1); if (p >= w) q.push(p - w); if (p < w * (h - 1)) q.push(p + w); }
  cx.putImageData(img, 0, 0);
  const k = 'my_' + Date.now().toString(36), l = (file.name || 'Mon symbole').replace(/\.[^.]+$/, '').slice(0, 40) || 'Mon symbole';
  regMySyms({ [k]: { l, w, h, d: cv.toDataURL('image/png') } }); saveMySyms(); save();
  return k;
}
function editNote(id, isNew) {
  const n = S.notes.find(x => x.id === id); if (!n) return;
  normNote(n);
  const wp = n.wp || {}, zone = n.zone || {};
  // symboles posés automatiquement : à l'ouverture ils deviennent des symboles « comme posés à la main » (retirables, déplaçables, on peut en ajouter) et le texte qu'ils remplaçaient disparaît
  const pre = n.auto !== false && !n.symLocked && S.settings.symAuto !== false ? noteView(n) : null, conv = !!(pre && pre.keys.length > lexKeys(n).length);
  const lockTxt = v => conv || n.symLocked ? v.replace(/\s+$/, '') : v.trim();      // note verrouillée : la 1re ligne peut rester vide (place de la direction)
  const body = `
    <div class="fld"><label for="eText">Texte de la note (1re ligne en gros)</label><textarea id="eText" rows="3">${esc(conv ? pre.lines.join('\n') : n.text)}</textarea></div>
    <div class="fld"><label>Symboles du lexique FIA <span style="font-weight:400;color:#8a8478">— sous la direction, dans la case description</span></label>
      <div class="stagehelp">Pose les symboles où tu veux : <b>glisse</b> un symbole dans la tulipe ou la case description, règle sa <b>taille</b> avec le curseur (ou la molette).</div>
      <div class="stlabels"><span>Tulipe</span><span>Description</span></div><div class="stage"><div class="stcase" id="stT" data-c="t"><div class="stm" id="stTm"></div><div class="stin" id="stTin"></div></div><div class="stcase" id="stD" data-c="d"><div class="stm" id="stDm"></div><div class="stin" id="stDin"></div></div></div>
      <div class="strow"><label>Taille <input type="range" id="stSize" min="4" max="60" value="16" disabled></label><button type="button" class="mbtn" id="stDel" disabled>Retirer ce symbole</button></div>
      <div class="strow"><button type="button" class="mbtn" id="stFront" disabled>Mettre en avant-plan</button><button type="button" class="mbtn" id="stBack" disabled>Mettre en arrière-plan</button></div>
      <div class="strow"><button type="button" class="mbtn" id="stAddTx">＋ Texte</button><input id="stTxt" type="text" placeholder="Texte sélectionné" disabled style="flex:1;min-width:0"></div>
      <div class="strow"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="eTpos"${n.tpos ? ' checked' : ''}> Texte principal déplaçable et redimensionnable</label></div>
      <div id="eLexSel" class="lexsel"></div>
      <button type="button" id="eLexOpen" class="mbtn lexadd">＋ Ajouter des symboles</button>
      <button type="button" id="eSymImp" class="mbtn lexadd" title="Importer une image (PNG, JPG, SVG) : le fond blanc est retiré">📥 Importer mon symbole</button><input type="file" id="eSymFile" accept="image/*" hidden>
      <div id="eLexPal" class="lexpal" hidden>
        <input id="eLexQ" type="search" placeholder="Chercher : pont, trou, clôture, kpL…" autocomplete="off">
        <div id="eLexTabs" class="lextabs">${FIA_CATS.map((c, i) => `<button type="button" data-c="${esc(c)}"${i ? '' : ' class="on"'}>${esc(c)}</button>`).join('')}</div>
        <div id="eLexGrid" class="lexgrid"></div>
      </div>
    </div>
    <div class="fgrid">
      <div class="fld"><label for="eCap">CAP (°)</label><input id="eCap" type="number" min="0" max="359" value="${n.cap == null ? '' : n.cap}"><button type="button" class="mbtn" id="eCapMeas" title="Enregistre la note puis mesure le cap sur la trace" style="margin-top:4px">📐 Mesurer</button></div>
      <div class="fld"><label for="eDanger">Danger</label><select id="eDanger">${[0, 1, 2, 3].map(d => `<option value="${d}"${n.danger === d ? ' selected' : ''}>${d ? '!'.repeat(d) + ' (niveau ' + d + ')' : 'Aucun'}</option>`).join('')}</select></div>
      <div class="fld"><label for="eDist">Distance (km)</label><input id="eDist" type="number" step="0.01" min="0" value="${km(n.s)}"></div>
    </div>
    <label class="chk"><input type="checkbox" id="eShowCap"${n.showCap ? ' checked' : ''}> Afficher le CAP sur cette note</label>
    <div class="fld" style="max-width:260px"><label for="eR">Rayon dessiné dans la tulipe (m)</label><input id="eR" type="number" min="20" max="150" step="5" value="${Math.round(n.tulip && n.tulip.R || S.settings.tulipR)}"></div>
    <div class="help">Plus grand = la tulipe montre une zone plus large autour du carrefour.</div>
    <button type="button" class="mbtn" id="eTulEdit" style="margin:0 0 8px">✏️ Modifier la tulipe (traits, points)</button>
    <div class="fld"><label for="eWp">Point de passage / waypoint</label><select id="eWp">${WP_TYPES.map(([v, l]) => `<option value="${v}"${(wp.type || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="fgrid" id="eWpRad">
      <div class="fld"><label for="eName">Nom / n°</label><input id="eName" type="text" value="${esc(wp.name || '')}" placeholder="auto"></div>
      <div class="fld"><label for="eOpen">Ouverture (m)</label><input id="eOpen" type="number" min="1" value="${wp.open || ''}"></div>
      <div class="fld"><label for="eClear">Validation (m)</label><input id="eClear" type="number" min="1" value="${wp.clear || ''}"></div>
    </div>
    <div class="fgrid" id="eWpX" style="grid-template-columns:1fr 1fr">
      <div class="fld" id="eLimF"><label for="eLim">Temps limite (min, facultatif)</label><input id="eLim" type="number" min="1" value="${wp.limit || ''}"></div>
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
      n.text = lockTxt($('#eText').value); if (conv) n.symLocked = true;
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
        if (/^(dss|dt|ch)$/.test(t)) { const v = parseInt($('#eLim').value, 10); if (v > 0) n.wp.limit = v; }
        if (t === 'dn' || t === 'dt' || t === 'dss' || t === 'ch') { const v = parseInt($('#eWpSp').value, 10); if (v > 0) n.wp.speed = v; }
      }
      const zt = $('#eZone').value;
      n.zone = zt ? { type: zt } : null;
      if (n.zone && zt !== 'fz') { const v = parseInt($('#eSpeed').value, 10); if (v > 0) n.zone.speed = v; }
      n.fuel = $('#eFuel').checked;
      n.lex = lexSel.slice(); if (!n.lex.length) delete n.lex;
      n.sym = symList.filter(q => q.tx == null || String(q.tx).trim()).map(q => { const o = { ...q }; delete o.sized; return o; }); if (!n.sym.length) delete n.sym;
      if (tp) n.tpos = { x: tp.x, y: tp.y, h: tp.h }; else delete n.tpos;
      n.edited = true; renderAll();
      const R = clamp(parseFloat($('#eR').value) || 0, 20, 150), curR = n.tulip && n.tulip.R || S.settings.tulipR;
      if (Math.abs(R - curR) >= 1) {
        toast('Tulipe en cours de redessin…');
        redrawTulip(n, R).then(() => { n.tulipEdited = false; renderAll(); toast(`Tulipe redessinée avec un rayon de ${Math.round(R)} m.`, 'ok'); })
          .catch(e => { console.error(e); toast('Impossible de redessiner la tulipe (' + (e.message || e) + ').', 'err'); });
      }
    } }
  ], { onCancel: () => { if (isNew) { S.notes = S.notes.filter(x => x.id !== n.id); renderAll(); } } });
  const upd = () => {
    const t = $('#eWp').value;
    $('#eWpRad').style.display = isRadiusWP(t) ? '' : 'none';
    $('#eOpen').parentElement.style.display = $('#eClear').parentElement.style.display = isRadiusWP(t) ? '' : 'none';
    $('#eDurF').style.display = t === 'dn' ? '' : 'none';
    $('#eWpSpF').style.display = /^(dn|dt|dss|ch)$/.test(t) ? '' : 'none';
    $('#eLimF').style.display = /^(dss|dt|ch)$/.test(t) ? '' : 'none';
    $('#eWpX').style.display = /^(dn|dt|dss|ch)$/.test(t) ? '' : 'none';
    $('#eSpeedF').style.display = $('#eZone').value && $('#eZone').value !== 'fz' ? '' : 'none';
    if (isRadiusWP(t) && !$('#eOpen').value && !$('#eClear').value) { $('#eOpen').value = WP_DEF[t][0] || ''; $('#eClear').value = WP_DEF[t][1] || ''; }
  };
  // symboles du lexique : sélection (clic = retirer) et palette (clic = ajouter / retirer)
  const lexSel = lexKeys(n), symList = (n.sym || []).filter(q => FIA_LEX[q.k] || q.tx != null).map(q => ({ ...q }));
  let tp = n.tpos ? { ...n.tpos, main: 1, c: 'd' } : null;
  if (conv) {      // symboles automatiques → symboles libres de la case description, rangés comme dans le roadbook (rangée sous le texte), que l'on peut ensuite déplacer, agrandir ou rétrécir
    const man = lexKeys(n), auto = pre.keys.filter(k => !man.includes(k) && FIA_LEX[k]), L0 = pre.lines[0] || '';
    const h = pre.lines.length ? 22 : 30, extra = pre.lines.slice(1).reduce((t, l) => t + textRows(l), 0);
    let x = 3, row = 0; const top = (L0 ? (1.4 + 5.6 * (L0.length > 13 ? 2 : 1) + 0.7) / 33.3 * 100 : 3) + extra * 3.96 / 33.3 * 100;
    for (const k of auto) {
      const S = FIA_LEX[k], w = Math.min(94, h * S.w / S.h);
      if (x > 3 && x + w > 97) { x = 3; row++; }
      symList.push({ k, c: 'd', x: +(x + w / 2).toFixed(1), y: +Math.min(94 - h / 2, top + h / 2 + row * (h + 2)).toFixed(1), h }); x += w + 1.8;
    }
  }
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
  $('#eSymImp').onclick = () => $('#eSymFile').click();
  $('#eSymFile').onchange = async () => {
    const f = $('#eSymFile').files[0]; $('#eSymFile').value = ''; if (!f) return;
    try {
      const k = await importSymbol(f);
      symSel = { k, c: lastCase, x: 50, y: 50, h: 16 }; symList.push(symSel);      // posé tout de suite au centre ; il reste dans l'onglet « Mes symboles »
      $('#eLexTabs').innerHTML = FIA_CATS.map((c, i) => `<button type="button" data-c="${esc(c)}"${c === lexCat ? ' class="on"' : ''}>${esc(c)}</button>`).join('');
      renderLex(); renderStage(); toast('Symbole importé : « ' + FIA_LEX[k].l + ' ».');
    } catch (e) { toast('Import impossible : ' + e.message); }
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
  const syncCtl = () => {
    $('#stSize').disabled = !symSel; $('#stDel').disabled = $('#stFront').disabled = $('#stBack').disabled = !symSel || !!symSel.main;
    const isTx = !!symSel && symSel.tx != null && !symSel.main; $('#stTxt').disabled = !isTx; if (document.activeElement !== $('#stTxt')) $('#stTxt').value = isTx ? symSel.tx : '';
    if (symSel) $('#stSize').value = symSel.h;
  };
  const placeEl = (el, q) => { el.style.left = q.x + '%'; el.style.top = q.y + '%'; if (q.tx != null) el.style.fontSize = `calc(var(--u) * ${q.h})`; else el.style.height = q.h + '%'; };
  function renderStage() {
    // fond des deux cases = le vrai rendu du roadbook (même fonction que la ligne de la note), avec les valeurs en cours de saisie ;
    // les symboles libres sont dessinés par-dessus, à part, pour pouvoir être déplacés
    const cv = $('#eCap').value, cap = cv === '' ? null : norm360(Math.round(+cv)) % 360, wt = $('#eWp').value;
    const tmp = { ...n, symLocked: conv || n.symLocked, text: lockTxt($('#eText').value), cap, showCap: $('#eShowCap').checked && cap != null, danger: +$('#eDanger').value, wp: wt ? { type: wt } : null, lex: lexSel.slice(), sym: [], tpos: tp, noMain: true };
    if (tp) tp.tx = noteView(tmp).lines.join('\n');
    const real = `<div class="rbr">${rowInner(tmp, 0, 0, { zone: false, endSp: null, close: false, green: false, red: false }, false)}</div>`;
    $('#stTm').innerHTML = real; $('#stDm').innerHTML = real; $('#stTin').innerHTML = ''; $('#stDin').innerHTML = '';
    (tp && tp.tx.trim() ? symList.concat([tp]) : symList).forEach((q, i) => {
      let im;
      if (q.tx != null) { im = document.createElement('div'); im.className = 'fs ft' + (q === symSel ? ' sel' : ''); im.innerHTML = ftInner(q); im.title = q.main ? 'Texte principal' : 'Texte'; }
      else { im = document.createElement('img'); im.src = FIA_LEX[q.k].d; im.className = 'fs' + (q === symSel ? ' sel' : ''); im.draggable = false; im.title = FIA_LEX[q.k].l; }
      placeEl(im, q);
      im.addEventListener('pointerdown', e => {
        e.preventDefault(); symSel = q; im.setPointerCapture(e.pointerId); syncCtl();
        document.querySelectorAll('#stTin .fs, #stDin .fs').forEach(x => x.classList.toggle('sel', x === im));
        const move = ev => {
          const rt = $('#stT').getBoundingClientRect(), rd = $('#stD').getBoundingClientRect();
          const inside = r => ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
          const c = q.main ? 'd' : inside(rt) ? 't' : inside(rd) ? 'd' : q.c, r = c === 't' ? rt : rd;
          if (c !== q.c) { q.c = c; caseEl(c).appendChild(im); }
          q.x = Math.round(clamp((ev.clientX - r.left) / r.width * 100, 0, 100) * 10) / 10; q.y = Math.round(clamp((ev.clientY - r.top) / r.height * 100, 0, 100) * 10) / 10; placeEl(im, q);
        };
        const c0 = q.c, up = () => { im.removeEventListener('pointermove', move); im.removeEventListener('pointerup', up); lastCase = q.c; if (q.c !== c0) renderStage(); };
        im.addEventListener('pointermove', move); im.addEventListener('pointerup', up);
      });
      im.addEventListener('wheel', e => { e.preventDefault(); q.h = clamp(Math.round(q.h * (e.deltaY < 0 ? 1.08 : 0.93) * 10) / 10, 4, 90); q.sized = 1; placeEl(im, q); symSel = q; syncCtl(); }, { passive: false });
      caseEl(q.c).appendChild(im);
    });
    syncCtl();
  }
  $('#stSize').oninput = () => { if (!symSel) return; symSel.h = +$('#stSize').value; symSel.sized = 1; renderStage(); };
  $('#stFront').onclick = () => { if (!symSel) return; symList.splice(symList.indexOf(symSel), 1); symList.push(symSel); renderStage(); };     // l'ordre de la liste = ordre de superposition
  $('#stBack').onclick = () => { if (!symSel) return; symList.splice(symList.indexOf(symSel), 1); symList.unshift(symSel); renderStage(); };
  $('#stAddTx').onclick = () => { symSel = { tx: 'Texte', c: lastCase, x: 50, y: 50, h: 14 }; symList.push(symSel); renderStage(); $('#stTxt').focus(); $('#stTxt').select(); };
  $('#stTxt').oninput = () => { if (symSel && symSel.tx != null && !symSel.main) { symSel.tx = $('#stTxt').value; if (!symSel.sized) symSel.h = Math.min(14, Math.max(5, Math.floor(176 / Math.max(4, ...symSel.tx.split('\n').map(l => l.length))))); renderStage(); } };
  $('#eTpos').onchange = () => { if ($('#eTpos').checked) { const L = noteView({ ...n, symLocked: conv || n.symLocked, text: lockTxt($('#eText').value), tpos: null }).lines, mx = Math.max(4, ...L.map((l, i) => l.length * (i ? .62 : 1)));
    tp = { main: 1, c: 'd', x: 50, y: 28, h: Math.min(16, Math.max(5, Math.floor(176 / mx))) }; symSel = tp; } else { if (symSel === tp) symSel = null; tp = null; } renderStage(); };
  $('#stDel').onclick = () => { if (!symSel) return; symList.splice(symList.indexOf(symSel), 1); symSel = null; renderStage(); };
  $('#stT').onclick = $('#stD').onclick = e => { if (!e.target.classList.contains('fs')) { symSel = null; renderStage(); } };
  $('#eCapMeas').onclick = () => { m.querySelector('.mbtn.primary').click(); measureForNote(n, true); };
  $('#eTulEdit').onclick = () => { m.querySelector('.mbtn.primary').click(); tulipEditor(n); };
  for (const id of ['#eText', '#eCap', '#eShowCap', '#eDanger', '#eWp']) $(id).addEventListener(id === '#eText' || id === '#eCap' ? 'input' : 'change', () => renderStage());
  $('#eLexSel').onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; lexSel.splice(lexSel.indexOf(b.dataset.k), 1); renderLex(); renderStage(); };
  renderLex(); renderStage();
  $('#eZone').addEventListener('change', () => upd());
  $('#eWp').addEventListener('change', () => { const t = $('#eWp').value; if (isRadiusWP(t)) { $('#eOpen').value = WP_DEF[t][0] || ''; $('#eClear').value = WP_DEF[t][1] || ''; } upd(); });
  upd();
  setTimeout(() => { const ta = m.querySelector('#eText'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
}
function makeNoteAt(latlng) {
  if (!T) return null;
  const p = fwd(latlng.lat, latlng.lng);
  const pr = projAll(p, 80); if (!pr.length) return null;
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
  return note;
}
async function addManualNote(latlng, capOv) {
  if (!T) return;
  const p = fwd(latlng.lat, latlng.lng), pr = projAll(p, 80); if (!pr.length) return;
  const s0 = pr.reduce((a, b) => b.d < a.d ? b : a).s;
  let note = null;
  try { const r = await regenNoteAt(latlng, s0); note = r && r.note; } catch (e) { console.error(e); }       // même analyse qu'à la génération
  if (!note) { note = makeNoteAt(latlng); if (!note) return; note.auto = true; note.moved = true; toast('Chemins OSM indisponibles : note simple.', 'err'); }
  if (capOv != null) { note.cap = capOv; note.showCap = true; }
  S.notes.push(note); renderAll(); selectNote(note.id, 'map');
  editNote(note.id, true);
}

