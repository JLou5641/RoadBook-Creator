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
  const mkT = (el, tag, i) => { const n1 = el.getElementsByTagNameNS('*', 'name')[0]; return { name: n1 ? n1.textContent.trim() : 'Trace ' + (i + 1), ll: get(el, tag).map(e => [parseFloat(e.getAttribute('lat')), parseFloat(e.getAttribute('lon'))]).filter(p => isFinite(p[0]) && isFinite(p[1])) }; };
  let trks = get(doc, 'trk').map((e, i) => mkT(e, 'trkpt', i)).filter(t => t.ll.length > 1);
  if (!trks.length) trks = get(doc, 'rte').map((e, i) => mkT(e, 'rtept', i)).filter(t => t.ll.length > 1);
  return { ll, name: nm ? nm.textContent.trim() : '', wpts: get(doc, 'wpt').length, trks };
}

