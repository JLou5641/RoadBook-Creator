const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  await page.evaluate(() => window.__rb.openMeasure()); await page.waitForTimeout(300);
  const n = await page.$$eval('.measRow', e => e.length); console.log('virages', n);
  await page.click('.measRow:nth-child(6)'); await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/igntest/meas2.png' });
  // clic direct sur la carte, près de la trace
  const p = await page.evaluate(() => { const q = window.__rb.map.latLngToContainerPoint(window.__rb.S.ll[900]); return [q.x, q.y]; });
  const box = await page.locator('#map').boundingBox(); await page.mouse.click(box.x + p[0] + 3, box.y + p[1] + 2); await page.waitForTimeout(300);
  console.log((await page.innerText('#measRes')).replace(/\s+/g, ' ').slice(0, 140));
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
