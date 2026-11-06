const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const db = mock.load(path.join(__dirname, 'north-bayreuth.json'));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let calls = 0;
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const u = r.request().url(); if (/status$/.test(u)) return r.fulfill({ status: 200, body: 'ok' }); calls++; const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline|geopf/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate()); calls = 0;
  const before = await page.evaluate(() => window.__rb.tulipSVG(window.__rb.S.notes[11].tulip, 200));
  const edit = async (idx, R) => {
    await page.evaluate(i => document.querySelectorAll('#rb .row')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), idx);
    await page.waitForTimeout(200); await page.fill('#eR', String(R)); await page.click('.mbtn.primary');
    await page.waitForFunction(r => [...document.querySelectorAll('#toast div')].some(d => d.textContent.includes('rayon de ' + r)), R, { timeout: 30000 });
    return page.evaluate(i => { const n = window.__rb.S.notes[i]; return { text: n.text.replace(/\n/g, ' | '), R: n.tulip.R, others: n.tulip.others.length, bld: (n.tulip.bld || []).length }; }, idx);
  };
  console.log('note 12 R=100 :', JSON.stringify(await edit(11, 100)), '| requêtes', calls);
  const after = await page.evaluate(() => window.__rb.tulipSVG(window.__rb.S.notes[11].tulip, 200));
  console.log('note 12 R=30  :', JSON.stringify(await edit(11, 30)));
  const small = await page.evaluate(() => window.__rb.tulipSVG(window.__rb.S.notes[11].tulip, 200));
  console.log('départ R=90   :', JSON.stringify(await edit(0, 90)));
  // ancienne note sans "recette", après rechargement de la page
  await page.evaluate(() => { delete window.__rb.S.notes[5].src; }); await page.waitForTimeout(800);
  await page.reload(); await page.waitForTimeout(500); calls = 0;
  console.log('note 6 (ancienne) R=80 :', JSON.stringify(await edit(5, 80)), '| requêtes', calls);
  await page.setContent(`<body style="background:#bbb;font:13px sans-serif"><div style="display:flex;gap:10px"><div>${before}<br>50 m (défaut)</div><div>${after}<br>100 m</div><div>${small}<br>30 m</div></div></body>`);
  await page.screenshot({ path: path.join(__dirname, 'radius.png'), clip: { x: 0, y: 0, width: 660, height: 240 } });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
