const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(500);
  const n0 = await page.evaluate(() => window.__rb.S.ll.length);
  await page.click('#bDraw'); await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/igntest/edit_modal.png' });
  await page.click('button.mbtn.primary'); await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ ctrl: window.__rb.S.ctrl.length, ll: window.__rb.S.ll.length, src: window.__rb.S.src, km: document.querySelector('#sumKm').textContent }));
  console.log('trace', n0, 'points →', JSON.stringify(r));
  // gomme : balayage au-dessus de quelques points
  const pts = await page.evaluate(() => window.__rb.S.ctrl.slice(10, 40).map(c => { const p = window.__rb.map.latLngToContainerPoint(c); return [p.x, p.y]; }));
  const box = await page.locator('#map').boundingBox();
  await page.screenshot({ path: '/tmp/igntest/edit_gpx.png' });
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
