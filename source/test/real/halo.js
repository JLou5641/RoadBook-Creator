const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
  await p.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await p.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await p.waitForTimeout(300);
  await p.evaluate(() => window.__rb.generate());
  await p.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  // 1) quelques vraies tulipes en grand ; 2) trois types de trait avec la même route dessinée en noir dessous (cas de la capture)
  const html = await p.evaluate(() => {
    const N = window.__rb.S.notes, pick = [50, 54, 56, 57];
    let h = pick.map(i => `<div style="display:inline-block;margin:4px;border:1px solid #000">${window.__rb.tulipSVG(N[i].tulip, 360)}</div>`).join('');
    const mk = c => ({ R: 50, kind: 'junction', route: [{ p: [0, -45], c }, { p: [0, 0], c }, { p: [3, 25], c }, { p: [0, 48], c }], others: [{ c: c, p: [[0, -50], [0, 0], [3, 25], [0, 50]] }, { c: 'road', p: [[0, 10], [50, 10]] }], wl: [], bld: [], wa: [] });
    h += '<br>' + ['road', 'track', 'trail'].map(c => `<div style="display:inline-block;margin:4px;border:1px solid #000">${window.__rb.tulipSVG(mk(c), 360)}</div>`).join('');
    return h;
  });
  await p.setContent(`<body style="margin:0;background:#ddd">${html}</body>`); await p.screenshot({ path: '/home/claude/out/apercu-halo-zoom.png', fullPage: true });
  await b.close();
})();
