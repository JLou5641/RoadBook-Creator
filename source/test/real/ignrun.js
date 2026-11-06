// Mode IGN de bout en bout : service WFS de la Géoplateforme simulé avec un vrai extrait BD TOPO (Marseille 10e, publié par l'IGN)
// usage : node ignrun.js <trace.gpx> <tag> [premièreNote dernièreNote]
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [gpxFile, tag, a, b] = process.argv.slice(2);
const DB = JSON.parse(fs.readFileSync('/home/claude/ign/data/marseille10.geojson', 'utf8')).features;
for (const f of DB) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const c of f.geometry.coordinates) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } f.bb = [y0, x0, y1, x1]; }
DB.sort((p, q) => p.properties.cleabs < q.properties.cleabs ? -1 : 1);
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  let req = 0; const layers = {};
  await page.route(/data\.geopf\.fr\/wfs/, r => {
    req++; const u = new URL(r.request().url()), q = Object.fromEntries([...u.searchParams].map(([k, v]) => [k.toUpperCase(), v]));
    const [la0, lo0, la1, lo1] = q.BBOX.split(',').map(Number), n = +q.COUNT, s0 = +q.STARTINDEX || 0;
    layers[q.TYPENAMES] = (layers[q.TYPENAMES] || 0) + 1;
    const all = q.TYPENAMES === 'BDTOPO_V3:troncon_de_route' ? DB.filter(f => f.bb[0] <= la1 && f.bb[2] >= la0 && f.bb[1] <= lo1 && f.bb[3] >= lo0) : [];
    const feats = all.slice(s0, s0 + n).map(({ bb, ...f }) => f);
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', numberMatched: all.length, numberReturned: feats.length, features: feats }) });
  });
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(gpxFile, 'utf8')); await page.waitForTimeout(300);
  const t0 = Date.now();
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 180000 });
  const info = await page.evaluate(() => ({ diag: window.__rb.G && window.__rb.G.diag, mm: !!window.__rb.S.mm, notes: window.__rb.S.notes.map(n => (n.s / 1000).toFixed(2) + ' ' + n.kind + ' ' + n.text.replace(/\n/g, ' | ')) }));
  console.log(`[${tag}] ${Date.now() - t0} ms · requêtes WFS ${req} ${JSON.stringify(layers)}`); console.log('   ', info.diag);
  console.log(info.notes.join('\n'));
  if (a != null) {
    await page.evaluate(() => { document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; document.querySelectorAll('#toast div').forEach(d => d.remove()); });
    await page.waitForTimeout(300);
    const rows = await page.$$('#rb .row'), A = +a, B = Math.min(+b, rows.length - 1);
    await rows[A].evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
    let bx = await Promise.all(rows.slice(A, B + 1).map(r => r.boundingBox()));
    const need = Math.max(...bx.map(x => x.y + x.height)) - Math.min(...bx.map(x => x.y)) + 120;
    if (need > 1000) { await page.setViewportSize({ width: 1500, height: Math.ceil(need) }); await rows[A].evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200); }
    bx = await Promise.all(rows.slice(A, B + 1).map(r => r.boundingBox()));
    const y0 = Math.min(...bx.map(x => x.y)), y1 = Math.max(...bx.map(x => x.y + x.height));
    await page.screenshot({ path: `/home/claude/out/${tag}.png`, clip: { x: bx[0].x - 3, y: y0 - 3, width: bx[0].width + 6, height: y1 - y0 + 6 } });
  }
  console.log(errs.filter(e => !/Failed to load resource/.test(e)).slice(0, 8).join('\n') || '    aucune erreur JS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
