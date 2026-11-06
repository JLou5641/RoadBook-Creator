// Serveurs simulés : principal limité (2 requêtes/min, 4 s), VK 5 s, kumi muet, private.coffee hors service
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const db = mock.load(path.join(__dirname, 'north-bayreuth.json'));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const log = []; let mainHits = [];
  await page.route(/overpass-api\.de|maps\.mail\.ru|kumi|private\.coffee/, async r => {
    const u = new URL(r.request().url()), host = u.host, t = Date.now();
    if (/status$/.test(u.pathname)) { if (/kumi/.test(host)) { await new Promise(z => setTimeout(z, 20000)); return r.abort(); } if (/coffee/.test(host)) return r.abort('connectionrefused'); return r.fulfill({ status: 200, body: 'ok' }); }
    if (/coffee/.test(host)) return r.abort('connectionrefused');
    if (/kumi/.test(host)) { await new Promise(z => setTimeout(z, 200000)); return r.abort(); }
    if (/overpass-api/.test(host)) { mainHits = mainHits.filter(x => t - x < 60000); if (mainHits.length >= 2) { log.push(host + ' 429'); return r.fulfill({ status: 429, body: 'rate' }); } mainHits.push(t); }
    const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' '));
    const res = JSON.stringify(mock.run(db, body)); await new Promise(z => setTimeout(z, /mail/.test(host) ? 5000 : 4000));
    log.push(host + ' ok ' + (res.length / 1024).toFixed(0) + ' Ko, ' + (body.match(/way\["highway"\]/g) || []).length + ' rectangles');
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: res });
  });
  await page.route(/tile|arcgisonline/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  for (const g of ['bayreuth_long.gpx', 'bayreuth.gpx']) {
    await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, g), 'utf8')); await page.waitForTimeout(300);
    log.length = 0; const t0 = Date.now();
    await page.click('#bGen');
    let txt = ''; const tick = setInterval(async () => { try { txt = await page.evaluate(() => document.querySelector('#pTxt') && document.querySelector('#pTxt').textContent); } catch (e) {} }, 700);
    await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show') || /indisponibles|Aucun/.test(document.querySelector('#modal h2').textContent), null, { timeout: 400000 });
    clearInterval(tick);
    console.log("   MODAL:", await page.evaluate(() => document.querySelector("#modalBg").classList.contains("show") ? document.querySelector("#modal").textContent.slice(0, 300) : "-"));
    await page.evaluate(() => document.querySelector("#modalBg").classList.remove("show"));
    const n = await page.evaluate(() => window.__rb.S.notes.length), diag = await page.evaluate(() => window.__rb.G && window.__rb.G.diag);
    console.log(`${g}: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${n} notes | dernier message : « ${txt} »`);
    console.log('   ' + log.join(' | ')); console.log('   ' + diag);
  }
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
