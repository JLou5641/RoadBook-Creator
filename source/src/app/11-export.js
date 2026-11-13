/* ============================================================
   12. Export GPX OpenRally, impression, projet
   ============================================================ */
/* PNG à palette (64 couleurs) : les tulipes et notes sont des dessins à aplats, ~4 fois plus légers qu'un PNG en millions de couleurs (GPX de 700 notes : ~28 Mo → ~7 Mo) */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function pngPalette(cv, maxCol) {
  const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const cnt = new Map();      // couleurs regroupées sur 5 bits par canal, comptées
  for (let i = 0; i < d.length; i += 4) { const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const pal = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxCol).map(e => e[0]);
  const rgb = k => [((k >> 10) & 31) * 255 / 31 | 0, ((k >> 5) & 31) * 255 / 31 | 0, (k & 31) * 255 / 31 | 0];
  const P = pal.map(rgb), idx = new Map(), raw = new Uint8Array((w + 1) * h);
  const near = k => { let r = idx.get(k); if (r !== undefined) return r; const [R, G, B] = rgb(k); let best = 0, bd = 1e9; for (let j = 0; j < P.length; j++) { const dd = (P[j][0] - R) ** 2 + (P[j][1] - G) ** 2 + (P[j][2] - B) ** 2; if (dd < bd) { bd = dd; best = j; } } idx.set(k, best); return best; };
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; raw[y * (w + 1) + 1 + x] = near(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)); } }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const chunk = (type, data) => { const o = new Uint8Array(12 + data.length), v = new DataView(o.buffer); v.setUint32(0, data.length); for (let i = 0; i < 4; i++) o[4 + i] = type.charCodeAt(i); o.set(data, 8); v.setUint32(8 + data.length, crc32(o.subarray(4, 8 + data.length))); return o; };
  const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer); hv.setUint32(0, w); hv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 3;
  const plte = new Uint8Array(P.length * 3); P.forEach((c, i) => plte.set(c, i * 3));
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); n = 0; for (const p of parts) { out.set(p, n); n += p.length; }
  let b = ''; for (let i = 0; i < out.length; i += 0x8000) b += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(b);
}
function svgToPNG(svg, w, h) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); pngPalette(c, 64).then(res, () => res(c.toDataURL('image/png'))); };
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
async function gzipB64(txt) {      // texte -> gzip -> base64 (projet enregistré dans le GPX)
  const buf = new Uint8Array(await new Response(new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let b = ''; for (let i = 0; i < buf.length; i += 0x8000) b += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(b);
}
async function buildGPX(onProg, withProject) {
  const NS = 'http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3';
  const proj = withProject ? await gzipB64(JSON.stringify(snapshot())) : '';      // projet complet : le GPX rouvert dans le générateur redonne le roadbook modifiable
  const o = [];
  o.push('<?xml version="1.0" encoding="UTF-8"?>');
  o.push(`<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="Generateur de Roadbook OSM" version="1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:openrally="${NS}" xmlns:rbgen="https://jlou5641.github.io/RoadBook-Creator/ns" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd ${NS} http://www.openrally.org/xmlschemas/GpxExtensions/v1.0.3/openrally.xsd">`);
  o.push(`  <metadata>\n    <name>${xmlEsc(S.name)}</name>${(S.desc || '').trim() || srcNote() ? `\n    <desc>${xmlEsc([(S.desc || '').trim(), srcNote()].filter(Boolean).join('\n'))}</desc>` : ''}\n    <time>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</time>\n    <extensions>\n      <openrally:units>metric</openrally:units>\n      <openrally:distance>${km(T.L)}</openrally:distance>${proj ? `\n      <rbgen:project encoding="gzip+base64">${proj}</rbgen:project>` : ''}\n    </extensions>\n  </metadata>`);
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
      if (t === 'dn') ex.push(`<openrally:dn${attrs(n.wp.open || 1000, n.wp.clear || 90)}/>`, `<openrally:neutralization>${Math.max(0, Math.round((n.wp.dur || 0) * 60))}</openrally:neutralization>`);
      else if (isRadiusWP(t)) {
        if (isNumberedWP(t)) wpCount++;
        ex.push(`<openrally:${t === 'cp' ? 'checkpoint' : t}${attrs(n.wp.open || WP_DEF[t][0], n.wp.clear || WP_DEF[t][1], n.wp.name || (isNumberedWP(t) ? String(wpCount) : ''))}/>`);
      }
      if (t === 'ch') {      // CH : marqueur « checkpoint » vide (aucun rayon) ; le temps limite de la liaison part de ce CH jusqu'au contrôle horaire suivant
        ex.push('<openrally:checkpoint/>');
        if (n.wp.limit > 0) ex.push(`<openrally:timecontrol allowed="${Math.round(n.wp.limit)}"/>`);
      }
      if ((t === 'dt' || t === 'dss') && n.wp.limit > 0) ex.push(`<openrally:timecontrol allowed="${Math.round(n.wp.limit)}"/>`);      // temps limite (minutes) d'un DT / DSS, à côté de <openrally:dt/> ou <openrally:dss/>
      if ((t === 'dn' || t === 'dt' || t === 'dss' || t === 'ch') && n.wp.speed) speed = n.wp.speed;
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
  let pk = 0; try { pk = Math.round((await gzipB64(JSON.stringify(snapshot()))).length / 1024); } catch (e) { }
  const opt = (v, t, d, w, on) => `<label class="xopt${on ? ' on' : ''}"><input type="radio" name="xgpx" value="${v}"${on ? ' checked' : ''}><div><b>${t}</b><div class="xd">${d}</div>${w ? `<div class="xw">${w}</div>` : ''}</div></label>`;
  const m = openModal('Exporter le GPX', `<div style="font-size:13px;color:#6b6558;margin-bottom:10px">Que veux-tu mettre dans le fichier ?</div>` +
    opt('0', 'GPX roadbook seul', 'Pour ton lecteur et pour les pilotes. Fichier léger.', 'Aucune possibilité de reprendre et modifier le roadbook.', true) +
    opt('1', 'GPX roadbook + projet', 'Pour le rouvrir plus tard dans l’éditeur et le modifier. Le lecteur ignore le projet.' + (pk ? ` Ajoute environ ${pk >= 1024 ? (pk / 1024).toFixed(1).replace('.', ',') + ' Mo' : pk + ' Ko'}.` : ''), '', false),
    [{ label: 'Annuler' }, { label: 'Exporter', cls: 'primary', onClick: mm => runExport(+(mm.querySelector('input[name=xgpx]:checked') || {}).value === 1) }], { noEsc: false });
  m.querySelectorAll('input[name=xgpx]').forEach(r => r.onchange = () => m.querySelectorAll('.xopt').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
}
async function runExport(withProject) {
  const m = openModal('Export GPX OpenRally', `<div id="pTxt">Dessin des tulipes…</div><div class="prog"><div id="pBar"></div></div>`, [], { noEsc: true });
  try {
    const gpx = await buildGPX((i, n) => { const b = m.querySelector('#pBar'); if (b) b.style.width = Math.round(100 * i / n) + '%'; }, withProject);
    closeModal();
    download(fileName('.gpx'), gpx, 'application/gpx+xml');
    toast(withProject ? 'GPX exporté avec le projet : rouvre-le ici pour modifier le roadbook.' : 'GPX OpenRally exporté : ouvre-le dans ton lecteur de roadbook.', 'ok');
  } catch (e) { closeModal(); console.error(e); openModal('Export impossible', esc(e.message || e), [{ label: 'OK', cls: 'primary' }]); }
}
function printRB() {
  if (!S.notes.length) { toast('Génère d’abord le roadbook.', 'err'); return; }
  const fl = rbFlags(S.notes), rows = [], P = 5; let prev = 0;       // une page = 5 places ; la description en prend 2
  if ((S.desc || '').trim()) rows.push({ w: 2, h: `<div class="rbr prow dbox"><div class="dtxt">${esc(S.desc.trim())}</div>${srcNote() ? `<div class="dsrc">${esc(srcNote())}</div>` : ''}</div>` });
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
  download(fileName('.roadbook.json'), JSON.stringify(snapshot()), 'application/json'); setDirty(false);
}

