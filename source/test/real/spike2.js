const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  const r = await page.evaluate(() => {
    const k = 1 / 111320, c = Math.cos(47 * Math.PI / 180);
    const P = (x, y) => [47 + y * k, 2 + x * k / c];
    // route le long d'un chemin vers le sud-est ; le chemin s'arrête en (60,-100), le clic est en (52,-103), puis ligne droite vers l'est
    const A = P(0, 0), S1 = P(60, -100), C = P(52, -103), B = P(600, -110);
    const R = window.__rb; R.S.ctrl = [[...A, 'x'], [...C, 'line'], [...B, 'line']];
    R.S.segs = [[A, P(30, -50), S1, C], [C, B]];
    R.rebuildFromSegs();
    const n = R.S.ll.length;
    return { n, hasClick: R.S.ll.some(p => Math.abs(p[0] - C[0]) < 1e-9 && Math.abs(p[1] - C[1]) < 1e-9) };
  });
  console.log(JSON.stringify(r), errs.join('') || 'aucune erreur JS'); await b.close();
})();
