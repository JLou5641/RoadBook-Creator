const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  await page.evaluate(() => window.__rb.openMeasure()); await page.waitForTimeout(300);
  await page.click('.measRow:nth-child(6)'); await page.waitForTimeout(500);
  const r = () => page.innerText('#measRes').then(t => t.replace(/\s+/g, ' ').slice(0, 90));
  console.log('30/30', await r(), await page.$$eval('.measRow', e => e.length));
  await page.selectOption('#measWo', '200'); await page.waitForTimeout(400); console.log('30/200', await r(), await page.$$eval('.measRow', e => e.length));
  await page.selectOption('#measWi', '15'); await page.waitForTimeout(400); console.log('15/200', await r());
  await page.screenshot({ path: '/tmp/igntest/meas3.png' });
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
