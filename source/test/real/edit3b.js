const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'l.gpx'), fs.readFileSync('/tmp/igntest/loop.gpx', 'utf8')); await page.waitForTimeout(500);
  await page.click('#bDraw'); await page.click('button.mbtn.primary'); await page.waitForTimeout(500);
  await page.selectOption('#routeMode', 'line').catch(()=>{});
  const f = () => page.evaluate(() => ({ c: window.__rb.S.ctrl.length, a: window.__rb.S.ctrl[0].slice(0,2).map(x=>+x.toFixed(4)), z: window.__rb.S.ctrl.slice(-1)[0].slice(0,2).map(x=>+x.toFixed(4)), km: document.querySelector('#sumKm').textContent }));
  console.log(JSON.stringify(await f()));
  await page.click('#bCut');
  const p = await page.evaluate(() => { const c = window.__rb.S.ctrl[Math.floor(window.__rb.S.ctrl.length*0.6)]; const q = window.__rb.map.latLngToContainerPoint(c); return [q.x, q.y]; });
  const box = await page.locator('#map').boundingBox(); await page.mouse.click(box.x + p[0], box.y + p[1]); await page.waitForTimeout(300);
  console.log(await page.$$eval('.mbtn', e => e.map(x => x.textContent)));
  await page.click('text=Départ ici'); await page.waitForTimeout(600); console.log(JSON.stringify(await f()));
  console.log(errs.join('\n') || 'ok'); await b.close();
})();
