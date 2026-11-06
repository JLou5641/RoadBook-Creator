// Génération de bout en bout en mode rapide (tuiles vectorielles simulées depuis les extraits OSM réels) ou détaillé (Overpass simulé)
// usage : node runvt.js <tuiles> <osm.json> <trace.gpx> <tag> [vt|osm] [nogzip|fail]
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), zlib = require('zlib');
const mock = require('./mock');
const [tdir, dbFile, gpxFile, tag, mode = 'vt', variant = ''] = process.argv.slice(2);
const db = mock.load(path.join(__dirname, dbFile));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') errs.push(m.text()); });
  let q = 0, vt = 0, vtBytes = 0;
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const u = r.request().url(); if (/status$/.test(u)) return r.fulfill({ status: 200, body: 'ok' }); q++; const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/openfreemap|data\.gouv\.fr/, r => {
    vt++;
    if (variant === 'fail') return r.fulfill({ status: 503, body: 'indisponible' });
    const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(tdir, m[2], m[3] + '.pbf');
    if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    let b = fs.readFileSync(f); if (variant === 'nogzip') b = zlib.gunzipSync(b);
    vtBytes += b.length; r.fulfill({ status: 200, contentType: 'application/x-protobuf', body: b });
  });
  await page.route(/tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  if (mode === 'osm') await page.evaluate(() => { window.__rb.S.settings.data = 'osm'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, gpxFile), 'utf8')); await page.waitForTimeout(300);
  const t0 = Date.now();
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 180000 });
  const dt = Date.now() - t0;
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => { const G = window.__rb.G; return { diag: G && G.diag, ways: G ? G.ways.length : 0, mm: window.__rb.S.mm ? 1 : 0,
    notes: window.__rb.S.notes.map(n => ({ s: n.s, kind: n.kind, text: n.text.replace(/\n/g, ' | ') })) }; });
  console.log(`[${tag}] mode ${mode}${variant ? ' ' + variant : ''} · ${dt} ms · requêtes Overpass ${q} · tuiles vectorielles ${vt} (${(vtBytes / 1024).toFixed(0)} Ko) · ${info.ways} voies`);
  console.log('   ', info.diag);
  const tf = path.join(__dirname, gpxFile + '.truth.txt');
  if (fs.existsSync(tf)) {
    const truth = fs.readFileSync(tf, 'utf8').trim().split('\n').map(l => +l.split(' ')[0] * 1000);
    const J = info.notes.filter(n => n.kind === 'junction');
    const found = truth.filter(s => J.some(n => Math.abs(n.s - s) <= 35)).length, extra = J.filter(n => !truth.some(s => Math.abs(n.s - s) <= 35));
    console.log(`    vérité terrain : ${found}/${truth.length} carrefours notés · notes de carrefour sans carrefour réel : ${extra.length}`);
    for (const n of extra.slice(0, 8)) console.log('      en trop', (n.s / 1000).toFixed(2), n.text);
  }
  fs.writeFileSync(path.join(__dirname, `notes_${tag}.json`), JSON.stringify(await page.evaluate(() => window.__rb.S.notes)));
  fs.writeFileSync(path.join(__dirname, `notes_${tag}.txt`), info.notes.map(n => (n.s / 1000).toFixed(2) + ' ' + n.kind + ' ' + n.text).join('\n'));
  const html = await page.evaluate(() => window.__rb.S.notes.map((n, i) => `<div style="display:inline-block;margin:4px;text-align:center;font:11px sans-serif;width:150px;vertical-align:top">${window.__rb.tulipSVG(n.tulip, 150)}<br>${i + 1}. ${(n.s / 1000).toFixed(2)} ${n.text.replace(/\n/g, ' / ')}</div>`).join(''));
  const p2 = await browser.newPage({ viewport: { width: 1300, height: 700 } }); await p2.setContent(`<body style="background:#bbb;margin:4px">${html}</body>`);
  await p2.screenshot({ path: path.join(__dirname, 'tulips_' + tag + '.png'), fullPage: true });
  console.log(errs.filter(e => !/Failed to load resource/.test(e)).slice(0, 8).join('\n') || '    aucune erreur JS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
