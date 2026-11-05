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
  await page.evaluate(() => {
    const N = window.__rb.S.notes, set = (i, wp) => { N[i].wp = wp; };
    set(0, { type: 'dss', open: 1000, clear: 200 }); set(1, { type: 'wpm', open: 800, clear: 90 }); set(2, { type: 'wps', open: 1000, clear: 30 });
    set(4, { type: 'dz', speed: 50, open: 1000, clear: 90 }); set(7, { type: 'fz', speed: 50, open: 1000, clear: 90 }); set(8, { type: 'cp', open: 1000, clear: 90 });
    N[9].danger = 2; N[10].danger = 3; set(11, { type: 'wpc', clear: 300 }); set(12, { type: 'wpn', open: 800, clear: 200 }); N[13].danger = 1;
    set(14, { type: 'wpv', clear: 200 }); set(15, { type: 'fuel' }); set(N.length - 1, { type: 'ass', open: 800, clear: 90 });
    N[3].auto = false;
  });
  await page.evaluate(() => { document.querySelector('#rbName').dispatchEvent(new Event('input')); });
  // re-rendu via une édition factice
  await page.evaluate(() => { const r = document.querySelectorAll('#rb .row')[0]; r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  await page.waitForTimeout(200); await page.click('.mbtn.primary'); await page.waitForTimeout(400);
  const side = await page.locator('#rb'); await side.screenshot({ path: path.join(__dirname, 'fim_ecran.png') });
  await page.evaluate(() => { document.querySelector('#rb').scrollTop = 1300; }); await page.waitForTimeout(200);
  await side.screenshot({ path: path.join(__dirname, 'fim_ecran2.png') });
  // impression
  await page.evaluate(() => { window.print = () => {}; document.querySelector('#bPrint').click(); }); await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'print' }); await page.pdf({ path: path.join(__dirname, 'fim.pdf'), format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const gpx = await page.evaluate(() => window.__rb.buildGPX()); fs.writeFileSync(path.join(__dirname, 'fim.gpx'), gpx);
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
