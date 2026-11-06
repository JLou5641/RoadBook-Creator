const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  await page.evaluate(() => { const S = window.__rb.S; const ls = window.__rb.bendList(30, 30, 30); const s = ls[4].s + 8; const p = S.ll[Math.round(S.ll.length * s / 30230)];
    S.notes = [{ id: 7, s, lat: p[0], lon: p[1], text: 'À G', cap: 50, showCap: true, kind: 'junction', tulip: { arms: [], R: 50 }, danger: 0 }]; window.__rb.generate && 0; });
  await page.evaluate(() => document.querySelector('#bGen') && 0);
  await page.evaluate(() => window.__rb.S.notes.length);
  // rafraîchit la liste
  await page.evaluate(() => { const e = new Event('x'); window.dispatchEvent(e); });
  await page.evaluate(() => window.__rb.editNote(7)); await page.waitForTimeout(300);
  console.log('bouton éditeur', await page.$$eval('#eCapMeas', e => e.length));
  await page.screenshot({ path: '/tmp/igntest/meas4_editor.png' });
  await page.click('#eCapMeas'); await page.waitForTimeout(700);
  console.log('panneau', await page.$eval('#measBox', e => e.classList.contains('show')), (await page.innerText('#measRes')).replace(/\s+/g, ' ').slice(0, 130));
  await page.screenshot({ path: '/tmp/igntest/meas4_panel.png' });
  await page.click('#measApply'); await page.waitForTimeout(600);
  console.log('cap note', await page.evaluate(() => window.__rb.S.notes[0].cap), 'éditeur rouvert', await page.$$eval('#eCap', e => e.length ? e[0].value : null), 'panneau fermé', !(await page.$eval('#measBox', e => e.classList.contains('show'))));
  await page.click('.mbtn:has-text("Annuler")'); await page.waitForTimeout(200);
  // clic sur la case CAP dans le roadbook
  await page.evaluate(() => window.__rb.S.notes[0].cap = 10);
  await page.evaluate(() => { const r = document.querySelector('#rb'); window.__rb.S.notes[0].showCap = true; });
  await page.evaluate(() => window.__rb.S.notes.length && document.querySelector('#rb .cap') ? 1 : 0).then(v => console.log('case CAP présente avant rendu:', v));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
