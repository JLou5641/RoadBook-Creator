const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  const r = await page.evaluate(() => {
    const k = 1 / 111320; // 1 m en degrés de latitude
    const P = (x, y) => [47 + y * k, 2 + x * k / Math.cos(47 * Math.PI / 180)];
    // route qui descend le long d'un chemin, dépasse de 12 m le point voulu, puis le clic est en retrait : pointe en bout
    const spikeEnd = [P(0, 100), P(0, 50), P(0, 0), P(0, -12), P(10, -4)];
    const spikeStart = [P(0, 0), P(0, 12), P(0, 0.5), P(40, -20)];
    const normal = [P(0, 100), P(0, 50), P(0, 0), P(50, -10)];
    const hairpinLong = [P(0, 0), P(0, 80), P(0, 20), P(40, 0)];
    return [spikeEnd, spikeStart, normal, hairpinLong].map(p => [p.length, window.__rb.cleanEnds(p).length]);
  });
  console.log(JSON.stringify(r), errs.join('') || 'aucune erreur JS'); await b.close();
})();
