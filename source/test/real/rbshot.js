// Aperçu des tulipes de rond-point (vraies données IGN) : usage node rbshot.js <fichier.html> <trace.gpx> <sortie.png> <titre>
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [htmlFile, gpxFile, outPng, title] = process.argv.slice(2);
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ignoreHTTPSErrors: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.resolve(htmlFile));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(gpxFile, 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  const html = await page.evaluate(t => {
    const N = window.__rb.S.notes; let h = `<div style="font:bold 15px sans-serif;margin:6px">${t}</div>`;
    N.forEach((n, i) => {
      if (!(n.src && n.src.t === 'rb')) return;
      h += `<div style="display:inline-block;margin:4px;vertical-align:top;font:12px sans-serif;width:230px"><div style="border:1px solid #000;width:230px;height:230px">${window.__rb.tulipSVG(n.tulip, 230)}</div>km ${(n.s / 1000).toFixed(3)} · ${n.text.split('\n').slice(0, 2).join(' · ')}</div>`;
    });
    return h;
  }, title);
  await page.setContent(`<body style="margin:0;background:#ddd;width:1500px">${html}</body>`); await page.screenshot({ path: outPng, fullPage: true });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
