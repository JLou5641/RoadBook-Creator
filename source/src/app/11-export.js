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
  o.push(`  <metadata>\n    <name>${xmlEsc(S.name)}</name>${(S.desc || '').trim() ? `\n    <desc>${xmlEsc(S.desc.trim())}</desc>` : ''}\n    <time>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</time>\n    <extensions>\n      <openrally:units>metric</openrally:units>\n      <openrally:distance>${km(T.L)}</openrally:distance>\n    </extensions>\n  </metadata>`);
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
      if ((t === 'dn' || t === 'dt' || t === 'dss') && n.wp.speed) speed = n.wp.speed;
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
  if (S.settings.marksExport !== false) for (const m of S.marks || []) {
    const ic = MARK_ICONS.find(x => x[0] === m.icon) || MARK_ICONS[MARK_ICONS.length - 1];
    o.push(`  <wpt lat="${m.lat.toFixed(6)}" lon="${m.lon.toFixed(6)}">\n    <name>${xmlEsc(m.name || ic[2])}</name>${(m.desc || '').trim() ? `\n    <desc>${xmlEsc(m.desc.trim())}</desc>` : ''}\n    <sym>${xmlEsc(ic[2])}</sym>\n    <type>Marqueur</type>\n  </wpt>`);
  }
  o.push(`  <trk>\n    <name>${xmlEsc(S.name)}</name>\n    <trkseg>`);
  {
    const pts = S.mm && S.mm.length > 1 ? S.mm : S.ll, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
    const sc = T && cum[cum.length - 1] ? T.L / cum[cum.length - 1] : 1, ev = eleValid(), tm = S.timing;
    const ts = tm && tm.exp && tm.start && T ? timeSeries() : null, t0 = ts ? new Date(tm.start).getTime() : 0;
    pts.forEach((p, i) => {
      const s = cum[i] * sc;
      const ex = (ev ? `<ele>${eleAt(Math.min(s, S.ele.step * (S.ele.v.length - 1))).toFixed(1)}</ele>` : '') + (ts ? `<time>${new Date(t0 + timeAt(ts, s) * 1000).toISOString().replace(/\.\d+Z$/, 'Z')}</time>` : '');
      o.push(ex ? `      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}">${ex}</trkpt>` : `      <trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"/>`);
    });
  }
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
  const fl = rbFlags(S.notes), rows = [], P = 5; let prev = 0;       // une page = 5 places ; la description en prend 2
  if ((S.desc || '').trim()) rows.push({ w: 2, h: `<div class="rbr prow dbox"><div class="dtxt">${esc(S.desc.trim())}</div></div>` });
  S.notes.forEach((n, i) => { const par = n.s - prev; prev = n.s; rows.push({ w: 1, h: `<div class="rbr prow">${rowInner(n, i, par, fl[i], false)}</div>` }); });
  const pages = []; let cur = [], used = 0;
  for (const r of rows) { if (used + r.w > P) { pages.push(cur); cur = []; used = 0; } cur.push(r.h); used += r.w; }
  if (cur.length) pages.push(cur);
  let html = '';
  pages.forEach((pg, p) => { html += `<div class="ppage"><div class="ph"><span class="l">${esc(S.name)}</span><span class="c">Page ${p + 1} / ${pages.length}</span><span class="r">Total ${kmFr(T.L)} km</span></div>${pg.join('')}</div>`; });
  $('#print').innerHTML = html;
  setTimeout(() => window.print(), 50);
}
function saveProject() {
  if (!S.ll.length && !S.notes.length) { toast('Rien à enregistrer pour l’instant.'); return; }
  download(fileName('.roadbook.json'), JSON.stringify(snapshot()), 'application/json');
}

