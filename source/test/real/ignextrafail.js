// Une couche de repères tombe en panne (HTTP 503) : les routes sont gardées, un message le dit, rien de faux n'est mis en mémoire
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [gpxFile] = process.argv.slice(2);
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 1000 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.route(/geopf\.fr\/wfs.*(lieu_dit_non_habite|haie)/, r => r.fulfill({ status: 503, body: 'indisponible', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ignd'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(gpxFile, 'utf8')); await page.waitForTimeout(300);
  const t0 = Date.now(); await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  const r = await page.evaluate(async () => ({ diag: window.__rb.G.diag, toasts: [...document.querySelectorAll('#toast div')].map(d => d.textContent), notes: window.__rb.S.notes.length, x: (await window.__rb.allIGN()).filter(r => /^x:/.test(r.k)).length }));
  console.log(Math.round((Date.now() - t0) / 1000) + ' s'); console.log(JSON.stringify(r, null, 1)); console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
