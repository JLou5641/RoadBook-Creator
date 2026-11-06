// Mémoire des chemins : 1re génération, régénération, rechargement de la page ; serveur simulé lent (1,5 s)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const db = mock.load(path.join(__dirname, 'north-bayreuth.json'));
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let calls = 0, active = 0, maxActive = 0; const hosts = new Set();
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, async r => {
    calls++; active++; maxActive = Math.max(maxActive, active); hosts.add(new URL(r.request().url()).host);
    const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' '));
    const res = JSON.stringify(mock.run(db, body)); await new Promise(z => setTimeout(z, 1500)); active--;
    r.fulfill({ status: 200, contentType: 'application/json', body: res });
  });
  await page.route(/tile|arcgisonline/, r => r.abort());
  const url = 'file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html');
  await page.goto(url); await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await page.waitForTimeout(300);
  const gen = async label => {
    calls = 0; maxActive = 0; const t0 = Date.now();
    await page.evaluate(() => window.__rb.generate());
    const n = await page.evaluate(() => window.__rb.S.notes.length);
    console.log(label.padEnd(36), 'requêtes:', calls, ' en parallèle max:', maxActive, ' durée:', ((Date.now() - t0) / 1000).toFixed(1) + ' s', ' notes:', n);
    return n;
  };
  const n1 = await gen('1re génération');
  const n2 = await gen('régénération (même session)');
  await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(500);
  const n3 = await gen('après rechargement de la page');
  await page.evaluate(() => { window.__rb.S.settings.tol = 60; window.__rb.S.settings.bld = false; });
  const n4 = await gen('réglages modifiés (écart 60, sans bât.)');
  console.log('serveurs utilisés :', [...hosts].join(', '));
  console.log(errs.join('\n') || 'aucune erreur JS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
