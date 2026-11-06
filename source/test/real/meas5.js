const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  await page.evaluate(() => { const S = window.__rb.S; const ls = window.__rb.bendList(30, 30, 30); const s = ls[4].s + 8; const p = S.ll[Math.round(S.ll.length * s / 30230)];
    S.notes = [{ id: 7, s, lat: p[0], lon: p[1], text: 'À G', cap: 50, showCap: true, kind: 'junction', tulip: { arms: [], R: 50 }, danger: 0 }]; });
  await page.evaluate(() => window.__rb.editNote(7)); await page.waitForTimeout(200);
  await page.click('.mbtn.primary'); await page.waitForTimeout(400);   // enregistre → rendu du roadbook
  console.log('cases CAP', await page.$$eval('#rb .cap', e => e.map(x => x.textContent)));
  await page.click('#rb .cap'); await page.waitForTimeout(800);
  console.log('panneau', await page.$eval('#measBox', e => e.classList.contains('show')), (await page.innerText('#measApply')));
  await page.screenshot({ path: '/tmp/igntest/meas5_cap.png' });
  await page.click('#measApply'); await page.waitForTimeout(500);
  console.log('cap note', await page.evaluate(() => window.__rb.S.notes[0].cap), 'cases CAP', await page.$$eval('#rb .cap', e => e.map(x => x.textContent)), 'panneau fermé', !(await page.$eval('#measBox', e => e.classList.contains('show'))), 'modal visible', await page.$eval('#modalBg', e => e.classList.contains('show')));
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
