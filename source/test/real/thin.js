const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 700, height: 360 }, deviceScaleFactor: 2 });
  await p.route(/tile\.|geopf|arcgis|opentopomap|cyclosm|overpass|openfreemap/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  const html = await p.evaluate(() => {
    const mk = (c, kind) => ({ R: 50, kind: kind || 'junction', route: [{ p: [0, -45], c }, { p: [0, 0], c }, { p: [30, 30], c }], others: [{ c: 'road', p: [[-50, 5], [50, -5]] }, { c: 'track', p: [[0, 0], [-30, 40]] }, { c: 'trail', p: [[10, -30], [40, -10]] }], wl: [], bld: [], wa: [] });
    return ['road', 'track', 'trail'].map(c => `<div style="display:inline-block;margin:6px;border:1px solid #000">${window.__rb.tulipSVG(mk(c), 200)}</div>`).join('');
  });
  await p.setContent(`<body style="margin:0;background:#ddd">${html}</body>`); await p.screenshot({ path: '/tmp/thin3.png' });
  await b.close();
})();
