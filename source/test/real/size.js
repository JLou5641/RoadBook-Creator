const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'); const mock = require('./mock');
(async () => { const browser = await chromium.launch();
  for (const [dbf, gpx] of [['north-bayreuth.json', 'bayreuth_long.gpx'], ['andorra.json', 'andorra.gpx']]) {
    const db = mock.load(path.join(__dirname, dbf)); const page = await browser.newPage();
    await page.route(/overpass|kumi|private\.coffee/, r => { const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
    await page.route(/tile|arcgisonline/, r => r.abort());
    await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
    await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
    await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, gpx), 'utf8')); await page.waitForTimeout(300);
    await page.evaluate(() => window.__rb.generate()); await page.waitForTimeout(500);
    const r = await page.evaluate(async () => { const all = await new Promise(res => { const q = indexedDB.open('rbgen-osm'); q.onsuccess = () => { const g = q.result.transaction('tiles').objectStore('tiles').getAll(); g.onsuccess = () => res(g.result); }; });
      const raw = new Blob([JSON.stringify(all)]); const gz = await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob(); return { tiles: all.length, raw: raw.size, gz: gz.size, km: window.__rb.T.L / 1000 }; });
    console.log(gpx.padEnd(20), r.km.toFixed(1), 'km ·', r.tiles, 'zones · navigateur', (r.raw / 1024).toFixed(0), 'Ko · fichier', (r.gz / 1024).toFixed(0), 'Ko · par 100 km ≈', (r.raw / r.km * 100 / 1048576).toFixed(1), 'Mo /', (r.gz / r.km * 100 / 1048576).toFixed(1), 'Mo');
    await page.close(); }
  await browser.close(); })();
