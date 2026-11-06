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
  const edit = async (i, f) => {
    await page.evaluate(i => document.querySelectorAll('#rb .row')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), i); await page.waitForTimeout(150);
    await f(); await page.click('.mbtn.primary'); await page.waitForTimeout(150);
  };
  await edit(1, async () => { await page.selectOption('#eWp', 'wpm'); await page.selectOption('#eZone', 'dz'); await page.fill('#eSpeed', '50'); await page.screenshot({ path: path.join(__dirname, 'wp2_dialog.png') }); });
  await edit(3, async () => { await page.selectOption('#eZone', 'fzdz'); await page.fill('#eSpeed', '30'); });
  await edit(5, async () => { await page.selectOption('#eZone', 'fz'); });
  await edit(6, async () => { await page.selectOption('#eWp', 'dt'); await page.fill('#eWpSp', '50'); });
  await edit(8, async () => { await page.selectOption('#eWp', 'ft'); });
  await edit(9, async () => { await page.selectOption('#eWp', 'dn'); await page.fill('#eDur', '15'); await page.check('#eFuel'); });
  await edit(10, async () => { await page.selectOption('#eWp', 'fn'); });
  await page.evaluate(() => { const n = window.__rb.S.notes[12]; n.wp = { type: 'dz', speed: 70 }; });   // ancienne forme
  await page.evaluate(() => document.querySelectorAll('#rb .row')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await page.waitForTimeout(150); await page.click('.mbtn.primary'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelectorAll('#rb .row')[1].scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(200);
  await page.locator('#rb').screenshot({ path: path.join(__dirname, 'wp2_rows.png') });
  await page.evaluate(() => { document.querySelectorAll('#rb .row')[6].scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(200);
  await page.locator('#rb').screenshot({ path: path.join(__dirname, 'wp2_rows2.png') });
  const gpx = await page.evaluate(() => window.__rb.buildGPX()); fs.writeFileSync(path.join(__dirname, 'wp2.gpx'), gpx);
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
