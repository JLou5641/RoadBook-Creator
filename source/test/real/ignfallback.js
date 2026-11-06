// Mode IGN hors de France (le service ne renvoie rien) puis IGN en panne : passage automatique au mode rapide
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay';
(async () => {
  for (const variant of ['vide', 'panne']) {
    const browser = await chromium.launch(); const page = await browser.newPage();
    let wfs = 0, vt = 0;
    await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
    await page.route(/data\.geopf\.fr\/wfs/, r => { wfs++; variant === 'vide' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"type":"FeatureCollection","features":[]}' }) : r.fulfill({ status: 503, body: 'indisponible' }); });
    await page.route(/openfreemap|data\.gouv\.fr/, r => { vt++; const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
    await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
    await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
    await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
    await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_main_levee.gpx'), 'utf8')); await page.waitForTimeout(300);
    const t0 = Date.now(); await page.evaluate(() => window.__rb.generate());
    const r = await page.evaluate(() => ({ diag: window.__rb.G.diag, n: window.__rb.S.notes.length, msg: [...document.querySelectorAll('#toast div')].map(d => d.textContent) }));
    console.log(`[${variant}] ${Date.now() - t0} ms · WFS ${wfs} · tuiles ${vt} · notes ${r.n} · ${r.diag.split(' · ')[0]} · message : ${r.msg.join(' / ')}`);
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
