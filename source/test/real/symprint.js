const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const db = mock.load(path.join(__dirname, 'north-bayreuth.json'));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const u = r.request().url(); if (/status$/.test(u)) return r.fulfill({ status: 200, body: 'ok' }); const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline|geopf/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.evaluate(() => { const S = window.__rb.S; const c = [{ wp: { type: 'dss' } }, { wp: { type: 'wpm', name: '1' }, zone: { type: 'dz', speed: 30 } }, { zone: { type: 'fzdz', speed: 50 } }, { zone: { type: 'fz' } }, { wp: { type: 'cp' } }];
    S.notes.forEach((x, i) => { x.wp = null; x.zone = null; x.fuel = false; if (c[i]) Object.assign(x, c[i]); }); });
  await page.evaluate(() => document.querySelectorAll('#rb .row')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await page.waitForTimeout(150);
  await page.click('.mbtn.primary'); await page.waitForTimeout(300);
  await page.evaluate(() => { window.print = () => {}; document.querySelector('#bPrint').click(); }); await page.waitForTimeout(500);
  await page.emulateMedia({ media: 'print' }); await page.pdf({ path: path.join(__dirname, 'symprint.pdf'), format: 'A4', printBackground: true });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
