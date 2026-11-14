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
  // un rond-point = une seule note : les « TD », « Serrer à D/G » et « Lég. à D/G » collés à lui (à 45 m ou moins avant l'entrée ou après la sortie) en font partie
  // (c'est presque toujours la route qui se sépare en deux sens juste avant l'anneau, ou qui se rejoint juste après)
  const rbs = notes.filter(n => n.src && n.src.t === 'rb'), W = 45;
  if (!rbs.length) return notes;
  return notes.filter(n => !(n.src && n.src.t === 'j' && n.span && /^(TD|Serrer à |Lég\. à )/.test(n.text) && !/goudron/.test(n.text)
    && rbs.some(r => n.span[0] <= r.span[1] + W && n.span[1] >= r.span[0] - W)));
}
function walkLimits(first, last, mainS, prevS, nextS) {    // longueur du parcours dessiné avant / après le carrefour
  const R = S.settings.tulipR, span = Math.max(0, last.s - first.s);
  let back = R * 1.4 + Math.max(0, mainS - first.s), fwd = span + R * 1.4;
  if (prevS != null) back = Math.min(back, Math.max(12, first.s - prevS));
  if (nextS != null) fwd = Math.min(fwd, Math.max(span + 15, nextS - first.s));
  return [back, fwd];
}
function ringCircle(g, seeds) {        // centre et rayon d'un rond-point : toutes les voies « rond-point » reliées au carrefour d'entrée
  const seenW = new Set(), seenN = new Set(), stack = [], pts = [], o = seeds.find(Boolean);
  if (!o) return null;
  const take = n => { for (const b of n.br) if (isRb(b.way) && !seenW.has(b.way)) { seenW.add(b.way); stack.push(b.way); } };
  for (const n of seeds) if (n) take(n);
  while (stack.length && seenW.size < 40) {
    const w = stack.pop();
    for (const id of w.nodes) {
      const n = g.nodes.get(id); if (!n || seenN.has(id) || dxy(n.xy, o.xy) > 90) continue;
      seenN.add(id); pts.push(n.xy); take(n);
    }
  }
  if (pts.length < 3) return null;
  const N = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / N, my = pts.reduce((s, p) => s + p[1], 0) / N;
  let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (const p of pts) { const u = p[0] - mx, v = p[1] - my; Suu += u * u; Suv += u * v; Svv += v * v; Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u; }
  const det = Suu * Svv - Suv * Suv;
  if (Math.abs(det) > 1e-6) {
    const b1 = (Suuu + Suvv) / 2, b2 = (Svvv + Svuu) / 2, uc = (b1 * Svv - b2 * Suv) / det, vc = (b2 * Suu - b1 * Suv) / det;
    const c = [mx + uc, my + vc], r = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / N);
    const rms = Math.sqrt(pts.reduce((s, p) => s + (dxy(p, c) - r) ** 2, 0) / N);
    if (r >= 3 && r <= 80 && rms < 0.2 * r) return { c, r, n: N, ways: seenW.size };
  }
  return { c: [mx, my], r: null, n: N, ways: seenW.size };
}
function roundaboutNote(g, grp, prevS, nextS) {
  const first = grp[0], last = grp[grp.length - 1], R = S.settings.tulipR;
  let exits = 0;
  for (const x of grp.slice(1, -1)) for (const b of x.brs) {
    if (b === x.entry || b === x.exit || isRb(b.b.way) || isEntryOnly(b.b)) continue;
    exits++;
  }
  const no = exits + 1;
  // centre = milieu de l'anneau (tous les tronçons « rond-point » reliés, cercle ajusté sur leurs sommets)
  const ringC = ringCircle(g, grp.map(x => x.J));
  let c = ringC && ringC.c;
  if (!c) { const pts = grp.map(x => x.J.xy); c = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]; }
  const [bl, fl] = walkLimits(first, last, first.s, prevS, nextS);
  const back = guidedWalk(g, first.J, first.entry.b, first.s, -1, bl);
  const fwdw = guidedWalk(g, first.J, first.exit.b, first.s, +1, Math.max(fl, last.s - first.s + 15));
  const tulip = buildTulip(c, first.hIn, reverseChain(back).concat(fwdw.slice(1)), collectOthers(g, c, grp.map(x => x.J), R), 'junction', true);
  const text = ['Rond-point', (no === 1 ? '1re' : no + 'e') + ' sortie', 'sur ' + wayLabel(last.exit.b.way)].join('\n');
  const n = mkNote({ s: (first.s + last.s) / 2, xy: c, text, cap: Math.round(last.hOut) % 360, kind: 'junction', tulip });      // la note est prise au milieu du rond-point
  n.span = [Math.round(first.s), Math.round(last.s)];
  n.why = 'Rond-point : ' + grp.length + ' branches de la trace regroupées, sortie n°' + no + ' · données ' + dataLbl();
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
  let fork = null, arms = [];
  const myRel = angDiff(main.hIn, main.hOut);
  if (Math.abs(a) <= 50 && Math.abs(myRel) <= 50) {
    let best = null;
    for (const x of main.brs) {
      if (x === main.entry || x === main.exit) continue;
      const r = angDiff(main.hIn, x.bear);
      if (Math.abs(r) <= 55 && Math.abs(r - myRel) < 80) arms.push(x);      // branches de la fourche
      if (Math.abs(r) <= 55 && Math.abs(r - myRel) < 80 && (best === null || Math.abs(r - myRel) < Math.abs(best - myRel))) best = r;
    }
    if (best !== null && Math.abs(best - myRel) > 8) fork = myRel > best ? 'D' : 'G';
  }
  const entryCat = first.entry.b.way.cat, exitWay = last.exit.b.way, exitCat = exitWay.cat;
  const t1 = dirPhrase(a, fork);
  const surf = (entryCat === 'road') !== (exitCat === 'road');
  if (!jn.length && !surf) return null;
  // fourche : pas de note si ses branches ne sont pas toutes du même type (toutes goudronnées ou toutes non goudronnées) : route + chemin / sentier = pas de note
  if (fork && !surf && !S.settings.mixY && arms.some(x => (x.b.way.cat === 'road') !== (entryCat === 'road'))) return null;
  // T / croisement : si ma voie est la seule de son type (les autres branches sont d'un autre type), pas de note quand l'option est décochée
  if (!fork && !surf && jn.length && !S.settings.mixT && Math.abs(a) > 50) { const oth = main.brs.filter(x => x !== main.entry && x !== main.exit); if (oth.length && oth.every(x => (x.b.way.cat === 'road') !== (entryCat === 'road'))) return null; }
  if (t1 === 'TD' && !surf && exitCat === entryCat && !S.settings.straight) return null;
  const lines = [t1];
  if (t1 !== 'TD' || exitCat !== entryCat) lines.push('sur ' + wayLabel(exitWay));
  if (surf) lines.push(exitCat === 'road' ? 'Début goudron' : 'Fin goudron');
  const exN = tName(exitWay.tags), enN = tName(first.entry.b.way.tags);
  const trackName = S.settings.landmarks && lmOn('trackname') && exN && exN !== enN ? (exN.length > 30 ? exN.slice(0, 29) + '…' : exN) : null;
  const R = S.settings.tulipR;
  const [bl, fl] = walkLimits(first, last, main.s, prevS, nextS);
  const back = guidedWalk(g, first.J, first.entry.b, first.s, -1, bl);
  const fwdw = guidedWalk(g, first.J, first.exit.b, first.s, +1, fl);
  const chain = reverseChain(back).concat(fwdw.slice(1));
  const tulip = buildTulip(main.J.xy, hIn, chain, collectOthers(g, main.J.xy, gr.map(x => x.J), R), 'junction');
  const note = mkNote({ s: main.s, xy: main.J.xy, text: lines.join('\n'), cap: Math.round(hOut) % 360, kind: 'junction', tulip });
  note.span = [Math.round(first.s), Math.round(last.s)];
  if (trackName) note.trackName = trackName;
  { const rid = w => ({ ref: ((w.tags && w.tags.ref) || '').split(';')[0].replace(/\s+/g, '').toUpperCase(), name: tName(w.tags).toLowerCase() });
    note.rd = { a: rid(first.entry.b.way), b: rid(exitWay), road: entryCat === 'road' && exitCat === 'road' && !surf, cat: entryCat === exitCat && /^(road|track)$/.test(entryCat) ? entryCat : '' }; }      // route avant / après le carrefour (pour le regroupement « suivre la route »)
  { const bits = [];
    if (fork) bits.push('fourche à ' + (arms.length + 2) + ' branches, toutes du même type de voie (' + (entryCat === 'road' ? 'goudron' : 'non goudronné') + ')');
    else if (jn.length) bits.push('intersection à ' + main.brs.length + ' branches : ' + ({ 'TD': 'tout droit', 'Lég. à D': 'légèrement à droite', 'Lég. à G': 'légèrement à gauche', 'À D': 'tourner à droite', 'À G': 'tourner à gauche', 'Serrer à D': 'serrer à droite', 'Serrer à G': 'serrer à gauche' }[t1] || t1));
    if (surf) bits.push('changement de revêtement (' + (exitCat === 'road' ? 'début' : 'fin') + ' de goudron)');
    if (gr.length > 1) bits.push(gr.length + ' embranchements proches regroupés en une note');
    note.why = bits.join(' ; ').replace(/^./, c => c.toUpperCase()) + ' · données ' + dataLbl(); }
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
function trackChain(s1, s2, cat, off, fb) {     // morceau de trace lissé (le bruit GPS est moyenné)
  const out = []; s1 = clamp(s1, 0, T.L); s2 = clamp(s2, 0, T.L);
  const add = s => {
    let x = 0, y = 0, n = 0;
    for (let o = -8; o <= 8; o += 4) { const p = pointAt(clamp(s + o, s1, s2)); x += p[0]; y += p[1]; n++; }
    if (s === s1 || s === s2) { const p = pointAt(s); x = p[0] * n; y = p[1] * n; }
    const pp = off ? [x / n + off[0], y / n + off[1]] : [x / n, y / n];
    out.push({ p: pp, c: typeof cat === 'function' ? (cat(pp, s) || fb) : cat });
  };
  for (let s = s1; s < s2; s += 4) add(s);
  add(s2);
  return out;
}
function trackTulip(s, kind, catFn, noSnap) {          // tulipe dessinée depuis la trace (départ, arrivée, virage, note manuelle)
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
  let chain = trackChain(s1, s2, catFn || ((p) => G && G.ways.length && !nearestWaySeg(G, p, 18) ? 'trail' : null), null, near.cat);
  if (G && !noSnap) {
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
    bn.why = (uturn ? 'Demi-tour' : At >= 130 ? 'Épingle' : 'Virage serré') + ' : la trace tourne de ' + Math.round(At) + '° en quelques mètres (seuil réglé à ' + st.bendAngle + '°)'; bn.src = { t: 'trk', kind: 'bend' }; out.push(bn);
  }
  return out;
}
/* ---------- Trace hors des chemins : une note « Hors piste » à la sortie des chemins et à chaque changement de cap, flèche pointillée + CAP ---------- */
function detectOffroad(known) {
  const out = [];
  if (!S.settings.offroad || !G || !G.ways.length || T.L < 150) return out;
  const STEP = 10, onNet = p => !!nearestWaySeg(G, p, 18);
  const offAt = []; for (let s = 0; s <= T.L; s += STEP) offAt.push(!onNet(pointAt(s)));
  const raw = []; let a = -1;
  for (let i = 0; i <= offAt.length; i++) {
    if (i < offAt.length && offAt[i]) { if (a < 0) a = i; }
    else if (a >= 0) { raw.push([a, i - 1]); a = -1; }
  }
  const runs = [];      // deux parties hors piste séparées de moins de 100 m (la trace traverse ou longe juste une route ou un chemin) n'en font qu'une
  for (const r of raw) { const l = runs[runs.length - 1]; if (l && r[0] - l[1] <= 10) l[1] = r[1]; else runs.push([r[0], r[1]]); }
  for (let i = runs.length - 1; i >= 0; i--) { runs[i][0] *= STEP; runs[i][1] *= STEP; if (runs[i][1] - runs[i][0] < 60) runs.splice(i, 1); }
  const busy = s => known.some(n => Math.abs(n.s - s) < 40 || (n.span && s > n.span[0] - 40 && s < n.span[1] + 40)) || out.some(n => Math.abs(n.s - s) < 40);
  const mk = (s, ang) => {
    const catFn = (p, q) => q > s + 4 || !onNet(p) ? 'trail' : 'track';      // pointillés : tout ce qui suit la note (hors piste) et ce qui précède s'il est hors des chemins
    const tt = trackTulip(s, 'bend', catFn, true);
    const n = mkNote({ s, xy: tt.xy, text: dirPhrase(ang) + '\nHors piste', cap: Math.round(trackBearing(s, s + 30)) % 360, kind: 'bend', tulip: tt.tulip });
    n.why = 'Trace hors des chemins connus (' + dataLbl() + ') : sortie ou changement de cap'; n.src = { t: 'trk', kind: 'bend' }; out.push(n);
  };
  for (const [r0, r1] of runs) {
    if (r0 > 30) {      // la note est posée sur le coude (plus fort changement de cap juste avant / après la sortie des chemins), à défaut à la sortie
      const turn = q => angDiff(trackBearing(q - 25, q - 3), trackBearing(q + 3, q + 25));
      let bs = r0, bd = turn(r0);
      for (let q = Math.max(30, r0 - 60); q <= Math.min(T.L - 30, r0 + 20); q += 5) { const d = turn(q); if (Math.abs(d) > Math.abs(bd) + 1) { bs = q; bd = d; } }
      if (Math.abs(bd) < 25) { bs = r0; bd = turn(r0); }
      if (!busy(bs)) mk(bs, bd);
    }
    for (let s = r0 + 30; s <= r1 - 30; s += 5) {      // changements de cap au milieu de la partie hors piste
      const d = angDiff(trackBearing(s - 30, s - 3), trackBearing(s + 3, s + 30)), A = Math.abs(d);
      if (A < 35 || onNet(pointAt(s)) || onNet(pointAt(s - 30)) || onNet(pointAt(s + 30))) continue;      // pas au passage d'une route que la trace traverse
      let top = true; for (let q = s - 40; q <= s + 40; q += 5) if (q > r0 + 30 && q <= r1 - 30 && Math.abs(angDiff(trackBearing(q - 30, q - 3), trackBearing(q + 3, q + 30))) > A) { top = false; break; }
      if (top && !busy(s)) mk(s, d);
    }
  }
  return out;
}
const dataLbl = () => ({ osm: 'OSM', vt: 'OSM', ign: 'IGN', ignd: 'IGN détaillé' }[S.settings.data] || 'OSM');
const srcLbl = g => ({ bdtopo: 'IGN BD TOPO', ofm: 'OpenFreeMap (OSM)', osm: 'OSM' }[g && g.used] || dataLbl());      // source réellement lue pour les repères
// raison d'une note ; pour une note sans raison enregistrée, on explique pourquoi (gardée à la main, ou générée avant cette version)
const whyOf = n => n.why || (n.auto === false || n.edited || n.manual ? 'Note modifiée ou ajoutée à la main : elle est conservée telle quelle quand on régénère le roadbook.' : 'Note générée avec une ancienne version : relance « Générer » pour connaître la raison (tes notes modifiées à la main sont conservées).');
// CAP affiché : sur toutes les notes, seulement sur les notes hors piste (HP), ou jamais
const capModeOf = s => s.capMode || (s.showCap ? 'all' : 'off');
const dottedExit = n => { const r = n.tulip && n.tulip.route; return !!(r && r.length && r[r.length - 1].c === 'trail'); };      // sortie de la tulipe en pointillés (sentier, hors piste)
const isHPNote = n => dottedExit(n) || /hors[ -]piste|off[ -]piste|(^|\n|\s)HP(\s|$)/i.test(n.text || '') || (n.syms || []).some(y => /^HP/.test(y.k || y.key || ''));
const capRule = n => { const m = capModeOf(S.settings); return m === 'all' ? true : m === 'hp' ? isHPNote(n) : false; };
function applyNoteLang() { const L = S.settings.noteLang; for (const n of S.notes) if (n.fr != null && !n.edited && n.auto !== false) n.text = trNote(n.fr, L); }
function applyCapMode() { for (const n of S.notes) if (n.kind !== 'end' && !n.edited && !n.capSet && n.auto !== false) n.showCap = capRule(n) && n.cap != null; }
/* ---- langue du texte des notes générées (réglage noteLang, indépendant de la langue de l'interface) ---- */
const NOTE_EN = [
  [/^TD$/, 'Keep Straight'], [/^Lég\. à ([DG])$/, 'Slight $1'], [/^À ([DG])$/, 'Turn $1'], [/^Épingle à ([DG])$/, 'Hairpin $1'],
  [/^Serrer à ([DG])$/, 'Keep $1'], [/^Virage serré à ([DG])$/, 'Tight bend $1'], [/^Demi-tour$/, 'U-turn'],
  [/^Rond-point$/, 'Roundabout'], [/^1re sortie$/, '1st exit'], [/^2e sortie$/, '2nd exit'], [/^3e sortie$/, '3rd exit'], [/^(\d+)e sortie$/, '$1th exit'],
  [/^sur petite piste$/, 'on small track'], [/^sur piste$/, 'on track'], [/^sur sentier$/, 'on trail'], [/^sur rue$/, 'on street'], [/^sur route(.*)$/, 'on road$1'],
  [/^Hors piste$/, 'Off piste'], [/^Début goudron$/, 'Tarmac starts'], [/^Fin goudron$/, 'Tarmac ends'], [/^Départ$/, 'Start'], [/^Arrivée$/, 'Finish'],
  [/^Gué$/, 'Ford'], [/^Passage à niveau$/, 'Level crossing'], [/^Cédez le passage$/, 'Give way'], [/^Passage piéton$/, 'Pedestrian crossing'],
  [/^Feux tricolores \(passage piéton\)$/, 'Traffic lights (pedestrian crossing)'], [/^Feux tricolores$/, 'Traffic lights'],
  [/^Ralentisseur$/, 'Speed bump'], [/^Bandes sonores$/, 'Rumble strips'], [/^Pont$/, 'Bridge'], [/^Sous pont$/, 'Under bridge'],
  [/^Passage sous bâtiment$/, 'Passage under building'], [/^Marches$/, 'Steps'],
  [/^Sable$/, 'Sand'], [/^Boue$/, 'Mud'], [/^Cailloux$/, 'Rocks'], [/^Neige$/, 'Snow'], [/^Glace$/, 'Ice'],
  [/^Piste dégradée$/, 'Poor track'], [/^Piste très dégradée$/, 'Very poor track'], [/^Piste impraticable$/, 'Impassable track'],
  [/^Montée raide/, 'Steep climb'], [/^Descente raide/, 'Steep descent'],
  [/^Longer clôture à ([DG])$/, 'Follow fence on $1'], [/^Longer mur à ([DG])$/, 'Follow wall on $1'], [/^Longer haie à ([DG])$/, 'Follow hedge on $1'],
  [/^Entrée agglomération$/, 'Entering town'], [/^Sortie agglomération$/, 'Leaving town'], [/^Entrée /, 'Entering '], [/^Sortie /, 'Leaving '],
  [/^Danger : /, 'Danger: '],
  [/^Portail coulissant/, 'Sliding gate'], [/^Portail/, 'Gate'], [/^Barrière pivotante/, 'Swing gate'], [/^Barrière anti-moto/, 'Anti-motorcycle barrier'], [/^Barrière/, 'Barrier'],
  [/^Grille à bétail/, 'Cattle grid'], [/^Chaîne/, 'Chain'], [/^Plots/, 'Bollards'], [/^Blocs/, 'Blocks'], [/^Passage étroit/, 'Narrow passage'],
  [/^Chicane/, 'Chicane'], [/^Péage/, 'Toll'], [/^Douane/, 'Customs'], [/^Muret/, 'Low wall'], [/^Tronc en travers/, 'Fallen log'], [/^Débris/, 'Debris'], [/^Corde/, 'Rope'],
  [/^Château d'eau$/, 'Water tower'], [/^Antenne$/, 'Mast'], [/^Tour$/, 'Tower'], [/^Cheminée$/, 'Chimney'], [/^Moulin$/, 'Windmill'], [/^Phare$/, 'Lighthouse'],
  [/^Éolienne$/, 'Wind turbine'], [/^Église$/, 'Church'], [/^Lieu de culte$/, 'Place of worship'], [/^Station-service/, 'Fuel station'],
  [/^Sommet /, 'Summit '], [/^Hameau /, 'Hamlet '], [/^Lieu-dit /, 'Locality '], [/^Col$/, 'Pass'], [/^Col( \(|$)/, 'Pass$1'],
  [/\(privé\)/, '(private)'],
];
const NOTE_EN_HZ = { 'chute de pierres': 'falling rocks', glissant: 'slippery', animaux: 'animals', verglas: 'ice', 'glissement de terrain': 'landslide', 'zone inondable': 'flood zone',
  'carrefour dangereux': 'dangerous junction', virage: 'bend', virages: 'bends', bosse: 'bump', cassis: 'dip', école: 'school', enfants: 'children', cyclistes: 'cyclists',
  cavaliers: 'horse riders', 'vent latéral': 'side wind', 'route abîmée': 'damaged road' };
function trNote(text, lang) {
  if (lang !== 'en' || !text) return text;
  return String(text).split('\n').map(l => {
    let o = l;
    for (const [re, to] of NOTE_EN) if (re.test(l)) { o = l.replace(re, to); break; }
    o = o.replace(/\(privé\)/, '(private)').replace(/^(Danger: )(.+)$/, (m, a, b) => a + (NOTE_EN_HZ[b] || b)).replace(/^(.+?) à ([DG])$/, '$1 on $2').replace(/^((?:Slight|Turn|Hairpin|Keep|Tight bend|Follow \w+ on) )([DG])$/, (m, a, c) => a + (c === 'D' ? 'R' : 'L'));
    return o;
  }).join('\n');
}
function mkNote(o) {
  const ll = inv(o.xy[0], o.xy[1]);
  return { id: S.nextId++, s: Math.round(o.s * 10) / 10, lat: +ll[0].toFixed(6), lon: +ll[1].toFixed(6), text: trNote(o.text || '', (S.settings || {}).noteLang), fr: o.text || '',
    cap: o.cap == null ? null : o.cap, showCap: o.showCap != null ? o.showCap : capRule({ text: o.text, kind: o.kind, tulip: o.tulip }), danger: 0, wp: null,
    auto: o.auto !== false, edited: false, kind: o.kind, tulip: o.tulip };
}
function startNote() { const t = trackTulip(0, 'start'), n = mkNote({ s: 0, xy: t.xy, text: 'Départ', cap: Math.round(trackBearing(0, 50)) % 360, kind: 'start', tulip: t.tulip }); n.src = { t: 'trk', kind: 'start' }; return n; }
function endNote() { const t = trackTulip(T.L, 'end'), n = mkNote({ s: T.L, xy: t.xy, text: 'Arrivée', showCap: false, kind: 'end', tulip: t.tulip }); n.src = { t: 'trk', kind: 'end' }; return n; }

/* ============================================================
   8c. Repères OpenStreetMap ajoutés aux notes
   gués, passages à niveau, stops, portails, ponts, tunnels, voies ferrées,
   revêtements, pentes, clôtures, villages, cols, stations-service, repères visuels, lieux-dits
   ============================================================ */
const BARRIER_TXT = { gate: 'Portail', lift_gate: 'Barrière', swing_gate: 'Barrière pivotante', sliding_gate: 'Portail coulissant', cattle_grid: 'Grille à bétail',
  chain: 'Chaîne', bollard: 'Plots', block: 'Blocs', stile: 'Passage étroit', kissing_gate: 'Passage étroit', cycle_barrier: 'Chicane', toll_booth: 'Péage',
  border_control: 'Douane', jersey_barrier: 'Muret', log: 'Tronc en travers', debris: 'Débris', rope: 'Corde', motorcycle_barrier: 'Barrière anti-moto' };
const HAZARD_TXT = { falling_rocks: 'chute de pierres', slippery: 'glissant', animal_crossing: 'animaux', ice: 'verglas', landslide: 'glissement de terrain',
  flooding: 'zone inondable', dangerous_junction: 'carrefour dangereux', curve: 'virage', curves: 'virages', bump: 'bosse', dip: 'cassis',
  school_zone: 'école', children: 'enfants', cyclists: 'cyclistes', horse_riders: 'cavaliers', side_winds: 'vent latéral', damaged_road: 'route abîmée' };
const SURF_TXT = { sand: 'Sable', mud: 'Boue', rock: 'Cailloux', rocks: 'Cailloux', stone: 'Cailloux', pebblestone: 'Cailloux', snow: 'Neige', ice: 'Glace' };
const SMOOTH_TXT = { very_bad: ['Piste dégradée', 1], horrible: ['Piste très dégradée', 2], very_horrible: ['Piste très dégradée', 2], impassable: ['Piste impraticable', 3] };      // danger 1, 2, 3 = nombre de « ! »
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
  for (const n of notes) if (n.trackName) { const l = (n.text || '').split('\n').filter(Boolean); if (!l.includes(n.trackName)) l.push(n.trackName); n.text = l.join('\n'); n.roadNames = [n.trackName]; delete n.trackName; }      // roadNames : la ligne du nom de rue, pour pouvoir la masquer (réglage « Afficher les noms de route »)
}
/* « Suivre la route / la piste » : des carrefours qui s'enchaînent sur une même route (ou piste), sans vrai changement, ne font plus qu'une note : la première, avec le symbole FRO (FPP).
   Niveau de regroupement (réglage followLvl) : 0 aucun · 1 prudent (notes réduites à « direction + sur route ») · 2 normal (+ le nom de la rue ne compte plus) · 3 large (+ les repères secondaires — haie, antenne, clôture… — ne coupent plus la série) */
const SECOND_RE = /^(?:Longer (?:haie|clôture|mur) à [DG]|Antenne(?: à [DG])?|Château d'eau(?: à [DG])?|Cheminée(?: à [DG])?|Éolienne(?: à [DG])?|Moulin(?: à [DG])?|Phare(?: à [DG])?|Tour(?: à [DG])?|(?:Église|Lieu de culte)(?: à [DG])?|Station-service(?: à [DG])?|Lieu-dit .+|Hameau .+|Sommet(?: .+)?)$/;
function followRoad(notes, lvl) {
  if (lvl === undefined) lvl = S.settings.followLvl === undefined ? (S.settings.followRoad === false ? 0 : 3) : S.settings.followLvl;
  if (lvl < 1) return { notes, removed: 0 };
  const okDir = /^(?:TD|Lég\. à [DG]|À [DG]|Serrer à [DG])$/;
  const kind = n => (n.rd.cat === 'track' ? 'track' : 'road');
  const extra = n => { const l = (n.text || '').split('\n').filter(Boolean), names = n.roadNames || []; return l.slice(2).map(x => names.includes(x) ? { x, name: 1 } : { x, name: 0 }); };
  const simple = n => {      // direction + « sur route [n°] » (ou « sur piste ») ; niveau 2 : + nom de rue ; niveau 3 : + repères secondaires
    if (n.kind !== 'junction' || n.auto === false || !n.rd || !(n.rd.road || n.rd.cat) || n.edited || n.wp || n.danger || (n.sym && n.sym.length) || (n.lex && n.lex.length)) return false;
    const l = (n.text || '').split('\n').filter(Boolean);
    return l.length >= 2 && okDir.test(l[0]) && (n.rd.cat === 'track' ? /^sur piste$/ : /^sur route(?: .+)?$/).test(l[1])
      && extra(n).every(e => (e.name && lvl >= 2) || (lvl >= 3 && SECOND_RE.test(e.x)));
  };
  const secInfo = n => lvl >= 3 && n.kind === 'info' && !n.wp && !n.danger && (n.text || '').split('\n').filter(Boolean).every(x => SECOND_RE.test(x));
  // même route : même numéro (les noms de rue peuvent changer le long d'une départementale), sinon même nom ; ce qui est inconnu ne gêne pas
  const ok = (acc, x) => acc.ref && x.ref ? acc.ref === x.ref : acc.name && x.name ? acc.name === x.name : !acc.name === !x.name;      // deux numéros différents = autre route ; un numéro qui manque d'un côté ne coupe pas à lui seul : on compare alors les noms (nom différent, ou qui apparaît / disparaît = on a quitté la route) ; ni numéro ni nom des deux côtés : même route
  const add = (acc, x) => ({ ref: acc.ref || x.ref, name: acc.name || x.name });
  const out = []; let removed = 0;
  for (let i = 0; i < notes.length; i++) {
    const a = notes[i]; out.push(a);
    if (!simple(a) || !ok(a.rd.a, a.rd.b)) continue;
    let acc = add(a.rd.a, a.rd.b), last = a, n = 0; const kd = kind(a), refs = [], sec = [];
    for (let j = i + 1; j < notes.length; j++) {
      const b = notes[j];
      if (secInfo(b)) continue;      // un repère secondaire entre deux carrefours garde sa note et ne coupe pas la série
      if (!simple(b) || kind(b) !== kd || !ok(acc, b.rd.a) || !ok(acc, b.rd.b) || !ok(b.rd.a, b.rd.b)) break;
      acc = add(acc, add(b.rd.a, b.rd.b)); for (let k = i + 1; k < j; k++) out.push(notes[k]);      // les repères sautés restent, dans l'ordre
      const m = b.text.split('\n')[1].match(/^sur route (.+)$/); if (m) refs.push(m[1]);
      extra(b).forEach(e => { if (!e.name) sec.push(e.x); });
      last = b; i = j; n++; removed++;
    }
    if (n) {
      const L = a.text.split('\n'), m = L[1].match(/^sur route (.+)$/), ref = (m && m[1]) || refs[0];
      const mine = extra(a), keep = L.slice(2).filter(x => !mine.some(e => e.x === x && e.name));      // le nom de la 1re rue ne vaut plus pour toute la série
      for (const x of sec) if (!keep.includes(x)) keep.push(x);
      a.text = [L[0], kd === 'track' ? 'Suivre la piste' : 'Suivre la route' + (ref ? ' ' + ref : ''), ...keep].join('\n');
      a.roadNames = [];
      a.follow = true; a.why = (n + 1) + ' carrefours regroupés : la trace reste sur la même ' + (kd === 'track' ? 'piste' : 'route' + (ref ? ' ' + ref : '')) + ' (niveau de regroupement ' + lvl + ')';
      if (a.span && last.span) a.span = [a.span[0], last.span[1]];
    }
  }
  return { notes: out, removed };
}
/* Repères que l'on peut activer ou désactiver un par un (⚙️ Réglages › « Choisir les repères un par un ») ; réglage lmOff = liste des repères désactivés */
const LM_TYPES = [      // [id, libellé, groupe : p = « Notes de repères », v = « Repères visuels »]
  ['ford', 'Gué', 'p'], ['level', 'Passage à niveau', 'p'], ['railway', 'Voie ferrée (croisement, pont sur / sous voie ferrée)', 'p'], ['stop', 'STOP', 'p'], ['giveway', 'Cédez le passage', 'p'],
  ['barrier', 'Portail, barrière, grille à bétail, chaîne, plots, chicane', 'p'], ['bridge', 'Pont', 'p'], ['under', 'Sous pont', 'p'], ['tunnel', 'Tunnel, passage sous bâtiment', 'p'],
  ['steps', 'Marches', 'p'], ['surf', 'Sable, boue, cailloux…', 'p'], ['smooth', 'Piste dégradée, très dégradée, impraticable', 'p'], ['incline', 'Montée / descente raide', 'p'],
  ['fence', 'Longer une clôture', 'p'], ['wall', 'Longer un mur', 'p'], ['hedge', 'Longer une haie', 'p'], ['village', 'Entrée / sortie de village', 'p'], ['col', 'Col', 'p'], ['fuel', 'Station-service', 'p'], ['hazard', 'Danger (panneau)', 'p'], ['signals', 'Feux tricolores', 'p'], ['peds', 'Passage piéton', 'p'], ['calm', 'Ralentisseur, bandes sonores', 'p'],
  ['watertower', 'Château d’eau', 'v'], ['antenna', 'Antenne', 'v'], ['tower', 'Tour', 'v'], ['chimney', 'Cheminée', 'v'], ['mill', 'Moulin', 'v'], ['lighthouse', 'Phare', 'v'], ['wind', 'Éolienne', 'v'],
  ['church', 'Église, lieu de culte', 'v'], ['peak', 'Sommet', 'v'], ['place', 'Lieu-dit, hameau', 'v'], ['trackname', 'Nom de la rue ou de la piste prise au carrefour', 'v']];
const lmOn = id => !id || !(S.settings.lmOff || []).includes(id);
function lmId(e) {
  const t = e.text || '', k = e.key || '';
  if (k === 'ford' || k === 'barrier' || k === 'col' || k === 'hazard' || k === 'bridge' || k === 'tunnel' || k === 'steps' || k === 'surf' || k === 'smooth' || k === 'incline' || k === 'fuel' || k === 'under' || k === 'signals' || k === 'peds' || k === 'calm') return k;
  if (k === 'rail') return /^Passage à niveau/.test(t) ? 'level' : 'railway';
  if (k === 'stop') return t === 'STOP' ? 'stop' : 'giveway';
  if (k === 'par') return /clôture/.test(t) ? 'fence' : /mur/.test(t) ? 'wall' : 'hedge';
  if (k === 'village-in' || k === 'village-out') return 'village';
  if (/^place:/.test(k)) return 'place';
  if (/^land:/.test(k)) { const m = [[/^Château d'eau/, 'watertower'], [/^Antenne/, 'antenna'], [/^Tour/, 'tower'], [/^Cheminée/, 'chimney'], [/^Moulin/, 'mill'], [/^Phare/, 'lighthouse'], [/^Éolienne/, 'wind'], [/^(?:Église|Lieu de culte)/, 'church'], [/^Sommet/, 'peak']].find(x => x[0].test(t)); return m ? m[1] : null; }
  return null;
}
function osmExtras(g, notes) {
  const st = S.settings, ev = [], STEP = 5;
  const smp = routeSamples(g, STEP), wayAtS = s => smp[clamp(Math.round(s / STEP), 0, smp.length - 1)].w;
  const jS = notes.filter(n => n.kind === 'junction').map(n => n.s).sort((a, b) => a - b);
  /* STOP / Cédez le passage : OSM ne dit pas toujours sur quelle route est le panneau. On garde celui qui nous concerne :
     – nœud absent du chemin que l'on emprunte en arrivant → panneau de la route croisée, ignoré ;
     – balise direction=forward/backward contraire à notre sens de parcours → ignoré ;
     – nœud partagé au carrefour : ignoré si notre route est plus importante que celles qui la croisent (la route prioritaire n'a pas de stop). */
  const HWR = { motorway: 9, motorway_link: 9, trunk: 8, trunk_link: 8, primary: 7, primary_link: 7, secondary: 6, secondary_link: 6, tertiary: 5, tertiary_link: 5, unclassified: 4, residential: 4, living_street: 3, service: 3, track: 2, path: 1, footway: 1, cycleway: 1, bridleway: 1 };
  const hwr = w => HWR[(w.tags || {}).highway] || 2;
  const skipped = [];      // panneaux / obstacles repérés mais écartés (affichés dans le rapport)
  let nodeWays = null, stopDbg = '';
  const ensureNW = () => { if (!nodeWays) { nodeWays = new Map(); for (const w of g.ways) for (const id of w.nodes || []) { let a = nodeWays.get(id); if (!a) nodeWays.set(id, a = []); a.push(w); } } };
  /* Portail, gué, passage à niveau, danger : seulement s'ils sont sur la route que l'on suit (nœud du chemin emprunté).
     Un portail posé sur l'entrée d'une propriété ou à la sortie d'un chemin croisé est sur une autre voie : ignoré. */
  const onMyWay = (n, sPass) => {
    ensureNW(); if (n.id == null || !nodeWays.size) return true;
    const run = []; for (let d = -10; d <= 10; d += 5) { const q = smp[clamp(Math.round((sPass + d) / STEP), 0, smp.length - 1)]; if (q && q.w) run.push(q.w); }
    if (!run.length) return true;
    return run.some(w => (w.nodes || []).includes(n.id));
  };
  const wrongDir = (n, sPass) => {      // balise direction=forward/backward contraire à notre sens de parcours
    const d = (n.tags['traffic_signals:direction'] || n.tags.direction || '').toLowerCase(); if (d !== 'forward' && d !== 'backward') return false;
    const qd = smp[clamp(Math.round((sPass - 4) / STEP), 0, smp.length - 1)];
    return !!(qd && qd.dir && ((d === 'forward' && qd.dir < 0) || (d === 'backward' && qd.dir > 0)));
  };
  let skipWhy = '';
  const stopIsMine = (n, sPass) => {
    ensureNW();
    const mine = []; for (let d = -12; d <= 3; d += 3) { const q0 = smp[clamp(Math.round((sPass + d) / STEP), 0, smp.length - 1)]; if (q0 && q0.w && !mine.includes(q0.w)) mine.push(q0.w); }      // chemins parcourus juste avant le panneau
    const q = smp[clamp(Math.round((sPass - 8) / STEP), 0, smp.length - 1)];
    const ws = n.id != null ? nodeWays.get(n.id) : null;
    const my = (ws && mine.find(w => ws.includes(w))) || (q && q.w) || wayAtS(sPass);
    const nm = w => (w.tags.highway || '?') + (w.tags.ref ? ' ' + w.tags.ref : w.tags.name ? ' ' + w.tags.name : '') + ' #' + w.id;
    stopDbg = `nœud OSM ${n.id}, direction=${n.tags.direction || '—'} ; notre route : ${my ? nm(my) : '?'} ; ways au nœud : ${ws ? ws.map(nm).join(', ') : 'inconnus'}`;
    if (!my) return true;                                 // données incomplètes : on garde le panneau
    if (!ws) { if (n.id == null || !nodeWays.size) return true; skipWhy = 'point hors de tous les chemins connus (route croisée non chargée)'; return false; }
    if (!ws.includes(my)) { skipWhy = 'point d\'une autre route que la nôtre'; return false; }
    const d = (n.tags.direction || '').toLowerCase(), qd = smp[clamp(Math.round((sPass - 4) / STEP), 0, smp.length - 1)];
    if (qd && qd.w === my && qd.dir && ((d === 'forward' && qd.dir < 0) || (d === 'backward' && qd.dir > 0))) { skipWhy = 'direction=' + d + ' contraire à notre sens'; return false; }
    const hdg = trackBearing(sPass - 14, sPass - 2), at = id => { const q2 = g.nodes.get(id); return q2 && q2.xy; };
    const straight = w => { const i = w.nodes.indexOf(n.id); return [w.nodes[i - 1], w.nodes[i + 1]].some(id => id != null && at(id) && Math.abs(angDiff(bxy(n.xy, at(id)), hdg)) < 30); };      // suite de notre route (voie coupée au carrefour)
    const others = ws.filter(w => w !== my && !straight(w));
    if (others.length && hwr(my) > Math.max(...others.map(hwr))) { skipWhy = 'notre route est prioritaire sur celle qui la croise'; return false; }
    return true;
  };
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
      if (t.highway === 'traffic_signals' || t.crossing === 'traffic_signals') it.push({ text: t.highway === 'crossing' ? 'Feux tricolores (passage piéton)' : 'Feux tricolores', key: 'signals' });
      else if (t.highway === 'crossing' && !t.railway) it.push({ text: 'Passage piéton', key: 'peds' });
      if (/^(bump|hump|table|cushion)$/.test(t.traffic_calming || '')) it.push({ text: 'Ralentisseur', danger: 1, key: 'calm' });
      else if (t.traffic_calming === 'rumble_strip') it.push({ text: 'Bandes sonores', key: 'calm' });
      if (t.hazard) it.push({ text: 'Danger : ' + (HAZARD_TXT[t.hazard] || t.hazard.replace(/_/g, ' ')), danger: 2, key: 'hazard' });
      if (!it.length) continue;
      if (it.some(e => /^(stop|barrier|hazard|signals|peds|calm)$/.test(e.key))) for (const ps of passes(n.xy, 25)) if (ps.d > 6) skipped.push({ s: ps.s, lat: n.lat, lon: n.lon, text: it[0].text, why: 'à ' + Math.round(ps.d) + ' m de la trace (limite : 6 m)' });
      for (const ps of passes(n.xy, 6)) for (const e of it) {
        if (e.stop && !stopIsMine(n, ps.s)) { skipped.push({ s: ps.s, lat: n.lat, lon: n.lon, text: e.text, why: skipWhy }); continue; }      // panneau de la route que l'on croise : pas pour nous
        if (/^(hazard|signals|calm)$/.test(e.key) && wrongDir(n, ps.s)) { skipped.push({ s: ps.s, lat: n.lat, lon: n.lon, text: e.text, why: 'direction=' + (n.tags['traffic_signals:direction'] || n.tags.direction) + ' contraire à notre sens' }); continue; }
        if (e.key === 'peds') { const mw = wayAtS(ps.s); if (!mw || hwr(mw) < 3) continue; }      // pas de passage piéton noté sur un sentier
        if (!e.stop && /^(barrier|ford|rail|hazard|signals|peds|calm)$/.test(e.key) && !onMyWay(n, ps.s)) { skipped.push({ s: ps.s, lat: n.lat, lon: n.lon, text: e.text, why: 'posé sur une autre voie que la nôtre' }); continue; }      // objet posé à côté de la route (entrée de propriété, chemin croisé)
        if (e.stop) {               // le panneau ne compte que si l'on arrive au carrefour
          const ahead = jS.find(js => js >= ps.s - 2 && js - ps.s <= 45);
          if (ahead == null && jS.some(js => js < ps.s - 2 && ps.s - js <= 30)) { skipped.push({ s: ps.s, lat: n.lat, lon: n.lon, text: e.text, why: 'après le carrefour (on l\'a déjà passé)' }); continue; }
          ev.push({ ...e, s: ahead != null ? ahead : ps.s, own: true, dbg: stopDbg });
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
    // 3. croisements : voies ferrées, ponts au-dessus du parcours (les lignes électriques ne sont plus notées, à la demande de l'utilisateur)
    for (const L of g.lines) {
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
      /* panneaux d'agglomération (traffic_sign=city_limit) : s'il y en a un près d'une entrée / sortie, on y cale la note (position fiable) */
      const cl = [...g.pois, ...[...g.nodes.values()].filter(q => q.tags && q.tags.traffic_sign)].filter(q => q.tags.traffic_sign === 'city_limit');
      const clAt = s0 => { let b = null; for (const q of cl) { const pr = nearestPass(q.xy, 30); if (pr && Math.abs(pr.s - s0) <= 150 && (!b || Math.abs(pr.s - s0) < Math.abs(b - s0))) b = pr.s; } return b; };
      for (const sg of segs) {
        if (sg.s1 - sg.s0 < 80) continue;
        if (cl.length) { const a = clAt(sg.s0), z = clAt(sg.s1); if (a != null) sg.s0 = a; if (z != null) sg.s1 = z; }
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
    if (kind === 'hazard') {      // panneau isolé (hors de tout chemin) : il doit être au bord de notre route, pas sur la voisine
      if (pr.d > 15) { skipped.push({ s: pr.s, lat: P.lat, lon: P.lon, text: txt, why: 'à ' + Math.round(pr.d) + ' m de la trace (limite : 15 m pour un danger isolé)' }); continue; }
      if (wrongDir(P, pr.s)) { skipped.push({ s: pr.s, lat: P.lat, lon: P.lon, text: txt, why: 'direction=' + t.direction + ' contraire à notre sens' }); continue; }
    }
    const side = pr.d > 8 ? ' à ' + sideOf(pr.s, P.xy) : '';
    if (kind === 'col' || kind === 'hazard') ev.push({ s: pr.s, text: txt, key: kind, own: true, danger });
    else if (kind === 'fuel') ev.push({ s: pr.s, text: txt + side, key: 'fuel', attach: 40, own: true });
    else if (kind === 'place') ev.push({ s: pr.s, text: txt, key: 'place:' + tName(t), attach: 150, own: pr.d < 80 });
    else ev.push({ s: pr.s, text: txt + side, key: 'land:' + P.id, attach: 150, own: pr.d <= 40 });
  }
  // 7. regroupement : ajouté à la note la plus proche, ou nouvelle note
  if ((st.lmOff || []).length) for (let i = ev.length - 1; i >= 0; i--) if (!lmOn(lmId(ev[i]))) ev.splice(i, 1);      // repères désactivés un par un
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
    for (const n of notes) { const d = n.src && n.src.t === 'rb' && n.span ? Math.max(0, n.span[0] - e.s, e.s - n.span[1]) : Math.abs(n.s - e.s); if (!best || d < best.d) best = { n, d }; }      // un rond-point : toute son étendue compte
    if (best && best.d <= (e.attach || 25)) {
      const lines = (best.n.text || '').split('\n').filter(Boolean);
      if (!lines.includes(e.text)) { if (e.danger) lines.splice(Math.min(1, lines.length), 0, e.text); else lines.push(e.text); }
      best.n.text = lines.join('\n');
      if (e.danger) best.n.danger = Math.max(best.n.danger || 0, e.danger);
    } else if (e.own) {
      const tt = trackTulip(e.s, 'info');
      const nn = mkNote({ s: e.s, xy: tt.xy, text: e.text, cap: Math.round(trackBearing(e.s, e.s + 30)) % 360, kind: 'info', tulip: tt.tulip });
      nn.why = 'Repère trouvé dans les données ' + srcLbl(g) + ' le long de la trace' + (e.dbg ? ' · ' + e.dbg : ''); nn.src = { t: 'trk', kind: 'info' }; nn.danger = e.danger || 0;
      notes.push(nn); notes.sort((a, b) => a.s - b.s); added++;
    }
  }
  skipped.sort((a, b) => a.s - b.s);
  return { events: kept.length, added, skipped };
}

