const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 }, ignoreHTTPSErrors: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/alpes.gpx', 'utf8')); await page.waitForTimeout(300);
  for (const tol of [40, 0]) {
    await page.evaluate(t => { window.__rb.S.settings.tol = t; }, tol);
    await page.evaluate(() => window.__rb.generate());
    await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
    const r = await page.evaluate(() => ({ n: window.__rb.S.notes.length, mm: !!window.__rb.S.mm, j: window.__rb.S.notes.filter(n => n.kind === 'junction').length }));
    console.log('tol', tol, JSON.stringify(r));
    const toast = await page.evaluate(() => (document.querySelector('#toast') || {}).textContent); console.log(toast);
  }
  await page.evaluate(() => window.__rb.openSettings()); await page.waitForTimeout(300);
  await page.evaluate(() => { const i = document.querySelector('#sTol'); i.scrollIntoView(); });
  const f = await page.$('#sTol'); const box = await (await f.evaluateHandle(e => e.closest('.fld'))).asElement().boundingBox();
  await page.screenshot({ path: '/home/claude/out/apercu-ecart-0.png', clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });
  console.log(await page.evaluate(() => document.querySelector('#sTol').min), errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
