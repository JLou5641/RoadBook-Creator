// Aperçu FIM d'une portion route / piste en mode rapide (tuiles vectorielles simulées)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay', [a, b] = [+process.argv[2], +process.argv[3]];
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  await page.evaluate(() => { document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; document.querySelectorAll('#toast div').forEach(d => d.remove()); });
  await page.waitForTimeout(300);
  const rows = await page.$$('#rb .row');
  await rows[a].evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
  const bx = await Promise.all(rows.slice(a, b + 1).map(r => r.boundingBox()));
  const y0 = Math.min(...bx.map(x => x.y)), y1 = Math.max(...bx.map(x => x.y + x.height));
  if (y1 > 1000) { await page.setViewportSize({ width: 1500, height: Math.ceil(y1 + 40) }); }
  await rows[a].evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
  const b2 = await Promise.all(rows.slice(a, b + 1).map(r => r.boundingBox()));
  const t0 = Math.min(...b2.map(x => x.y)), t1 = Math.max(...b2.map(x => x.y + x.height));
  await page.screenshot({ path: '/home/claude/out/apercu-route-piste.png', clip: { x: b2[0].x - 3, y: t0 - 3, width: b2[0].width + 6, height: t1 - t0 + 6 } });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
