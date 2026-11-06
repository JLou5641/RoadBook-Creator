const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ignd'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/tmp/igntest/alpes.gpx', 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  const gpx = await page.evaluate(async () => { const r = window.__rb.buildGPX(); return typeof r.then === 'function' ? await r : r; });
  fs.writeFileSync('/tmp/igntest/alpes_out.gpx', typeof gpx === 'string' ? gpx : gpx.xml || gpx.content || JSON.stringify(gpx).slice(0, 100)); console.log('GPX', fs.statSync('/tmp/igntest/alpes_out.gpx').size, 'octets', errs.join('') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
