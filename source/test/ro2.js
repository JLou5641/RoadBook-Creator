const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  const open = async (set, f) => {
    await page.evaluate(s => { Object.assign(window.__rb.S.settings, { showRO: true, showPI: true, showTR: true }, s); const S = window.__rb.S; S.notes = [{ id: 5, s: 3000, lat: S.ll[200][0], lon: S.ll[200][1], text: 'TD\nsur route D 976\nDébut goudron', cap: 120, showCap: true, kind: 'junction', tulip: { arms: [], R: 50 }, danger: 0, auto: true }]; window.__rb.editNote(5); }, set);
    await page.waitForTimeout(300); await (await page.$('#stDm')).screenshot({ path: f }); await page.click('.mbtn:has-text("Annuler")'); await page.waitForTimeout(200);
  };
  await open({}, '/tmp/igntest/ro_on.png'); await open({ showRO: false }, '/tmp/igntest/ro_off.png');
  await page.evaluate(() => window.__rb.openSettings()); await page.waitForTimeout(300);
  await (await page.$('#sRO')).scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/igntest/ro_settings.png' });
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})();
