// Mode IGN : les routes répondent, mais l'eau et les bâtiments échouent (erreur 500) -> on garde le mode IGN avec les routes seules
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const DB = JSON.parse(fs.readFileSync('/home/claude/ign/data/marseille10.geojson', 'utf8')).features;
for (const f of DB) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const c of f.geometry.coordinates) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } f.bb = [y0, x0, y1, x1]; }
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.route(/data\.geopf\.fr\/wfs/, r => {
    const u = new URL(r.request().url()), q = Object.fromEntries([...u.searchParams].map(([k, v]) => [k.toUpperCase(), v]));
    if (q.TYPENAMES !== 'BDTOPO_V3:troncon_de_route') return r.fulfill({ status: 500, body: 'erreur serveur' });
    const [la0, lo0, la1, lo1] = q.BBOX.split(',').map(Number), s0 = +q.STARTINDEX || 0;
    const all = DB.filter(f => f.bb[0] <= la1 && f.bb[2] >= la0 && f.bb[1] <= lo1 && f.bb[3] >= lo0);
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: all.slice(s0, s0 + +q.COUNT).map(({ bb, ...f }) => f) }) });
  });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/home/claude/ign/data/marseille_route_piste.gpx', 'utf8')); await page.waitForTimeout(300);
  const t0 = Date.now(); await page.evaluate(() => window.__rb.generate());
  const r = await page.evaluate(() => ({ diag: window.__rb.G.diag, n: window.__rb.S.notes.length, msg: [...document.querySelectorAll('#toast div')].map(d => d.textContent) }));
  console.log(`${Date.now() - t0} ms · notes ${r.n}\n  ${r.diag}\n  messages : ${r.msg.join(' / ')}`);
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
