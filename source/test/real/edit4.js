const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('console', m => /Failed|error/i.test(m.text()) && console.log('CONSOLE', m.text())); page.on('requestfailed', r => console.log('REQFAIL', r.url().slice(0,80), r.failure().errorText)); page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|openfreemap/, r => r.abort());
  await page.route(/open-meteo/, r => { const u = new URL(r.request().url()); const n = u.searchParams.get('latitude').split(',').length; r.fulfill({ contentType: 'application/json', headers: {'access-control-allow-origin':'*'}, body: JSON.stringify({ elevation: Array.from({ length: n }, (_, i) => 200 + 60 * Math.sin(i / 7) + i) }) }); });
  await page.route(/overpass|maps.mail.ru/, r => r.fulfill({ contentType: 'application/json', headers: {'access-control-allow-origin':'*'}, body: JSON.stringify({ elements: [{ type: 'node', lat: 47.30, lon: 1.78, tags: { amenity: 'drinking_water' } }, { type: 'node', lat: 47.25, lon: 1.80, tags: { tourism: 'alpine_hut', name: 'Refuge Test' } }] }) }));
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  const rb = f => page.evaluate(f);
  // coupures
  await page.evaluate(() => { const S = window.__rb.S; for (const q of [0.33, 0.66]) { const p = S.ll[Math.floor(S.ll.length * q)]; window.__rb.addStage({ lat: p[0], lng: p[1] }); } });
  console.log('étapes', JSON.stringify(await rb(() => window.__rb.stageList().map(g => [Math.round(g.s0), Math.round(g.s1), g.lock]))));
  await page.evaluate(() => window.__rb.stagesDialog()); await page.waitForTimeout(200);
  await page.click('.mbtn:has-text("Calculer")'); await page.waitForTimeout(1500); console.log('ele', await rb(() => JSON.stringify(window.__rb.S.ele && {n: window.__rb.S.ele.v.length, sig: !!window.__rb.S.ele.sig})), await page.$$eval('#toast div', e => e.map(x => x.textContent)));
  console.log('tableau', (await page.innerText('.stTab')).replace(/\s+/g, ' '));
  await page.check('.stLock[data-i="1"]'); await page.waitForTimeout(200);
  await page.map; await page.screenshot({ path: '/tmp/igntest/edit4_stages.png' });
  const dl = page.waitForEvent('download'); await page.click('.stGpx[data-k="1"]'); const d = await dl; console.log('gpx étape:', d.suggestedFilename());
  await page.click('button.mbtn.primary'); await page.waitForTimeout(200);
  // dessin + verrou
  await page.click('#bDraw'); await page.click('button.mbtn.primary'); await page.waitForTimeout(600);
  console.log('ctrl verrouillés', await page.$$eval('.cpt.locked', e => e.length), '/', await page.$$eval('.cpt', e => e.length));
  await page.click('#bRev'); await page.waitForTimeout(200); console.log('inverser →', (await page.$$eval('#toast div', e => e.map(x => x.textContent))).join('|').slice(0, 120));
  await page.click('#bDrawEnd'); await page.waitForTimeout(300);
  // marqueurs
  await page.evaluate(() => window.__rb.markForm({ lat: 47.3, lon: 1.78, icon: 'water' }, true)); await page.waitForTimeout(200);
  await page.fill('#mkName', 'Source du pré'); await page.click('.mbtn.primary'); await page.waitForTimeout(300);
  await page.click('.mbtn:has-text("Refuges")'); await page.waitForTimeout(800);
  console.log('marqueurs', await rb(() => window.__rb.S.marks.length), 'candidats', await page.$$eval('.mkpin.cand', e => e.length));
  await page.screenshot({ path: '/tmp/igntest/edit4_marks.png' });
  // multi-traces
  const multi = '<?xml version="1.0"?><gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Jour 1</name><trkseg><trkpt lat="47" lon="1"/><trkpt lat="47.05" lon="1.05"/></trkseg></trk><trk><name>Jour 2</name><trkseg><trkpt lat="47.05" lon="1.05"/><trkpt lat="47.1" lon="1.0"/><trkpt lat="47.2" lon="1.0"/></trkseg></trk></gpx>';
  const r = await page.evaluate(async t => { const g = window.__rb.parseGPX(t); const p = window.__rb.pickTrack(g); await new Promise(r => setTimeout(r, 200)); document.querySelectorAll('.trkPick')[1].click(); const c = await p; return { n: g.trks.length, pick: c.name, pts: c.ll.length }; }, multi);
  console.log('multi', JSON.stringify(r));
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
