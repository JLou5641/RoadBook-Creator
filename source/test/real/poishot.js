const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const db = mock.load(path.join(__dirname, 'north-bayreuth.json'));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const u = r.request().url(); if (/status$/.test(u)) return r.fulfill({ status: 200, body: 'ok' }); const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline|geopf/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate()); await page.waitForTimeout(500);
  const idx = await page.evaluate(() => window.__rb.S.notes.findIndex(n => /Altenplos/.test(n.text)));
  await page.evaluate(i => document.querySelectorAll('#rb .row')[i].scrollIntoView({ block: 'start' }), idx); await page.waitForTimeout(200);
  await page.locator('#rb').screenshot({ path: path.join(__dirname, 'poi_a.png') });
  const idx2 = await page.evaluate(() => window.__rb.S.notes.findIndex(n => /Passage à niveau/.test(n.text)));
  await page.evaluate(i => document.querySelectorAll('#rb .row')[i - 1].scrollIntoView({ block: 'start' }), idx2); await page.waitForTimeout(200);
  await page.locator('#rb').screenshot({ path: path.join(__dirname, 'poi_b.png') });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
