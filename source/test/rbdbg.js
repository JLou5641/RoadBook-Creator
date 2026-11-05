// Rond-points : centre ajusté sur l'anneau, comparé à l'ancien calcul (centre des points d'entrée / sortie)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [gpxFile] = process.argv.slice(2);
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ignoreHTTPSErrors: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(gpxFile, 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  const out = await page.evaluate(() => {
    const rb = window.__rb, G = rb.G, res = [];
    for (const n of rb.S.notes) if (n.src && n.src.t === 'rb') {
      const J = n.src.ids.map(id => G.nodes.get(id)), rc = rb.ringCircle(G, J), pts = J.map(j => j.xy), old = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
      res.push({ s: n.s, span: n.span, txt: n.text.replace(/\n/g, ' | '), r: rc && rc.r && +rc.r.toFixed(1), ways: rc && rc.ways, pts: rc && rc.n, decal: rc ? +rb.dxy(rc.c, old).toFixed(1) : null, ids: n.src.ids.length });
    }
    return res;
  });
  for (const o of out) console.log(JSON.stringify(o));
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
