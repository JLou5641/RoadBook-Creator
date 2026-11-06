const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(500);
  await page.click('#bDraw'); await page.waitForTimeout(300); await page.click('button.mbtn.primary'); await page.waitForTimeout(600);
  await page.selectOption('#routeMode', 'line').catch(()=>{});
  const st = () => page.evaluate(() => ({ c: window.__rb.S.ctrl.length, ll: window.__rb.S.ll.length, a: window.__rb.S.ctrl[0].slice(0,2).map(x=>+x.toFixed(4)), z: window.__rb.S.ctrl.slice(-1)[0].slice(0,2).map(x=>+x.toFixed(4)), km: document.querySelector('#sumKm').textContent }));
  console.log('départ', JSON.stringify(await st()));
  await page.click('#bRev'); await page.waitForTimeout(800); console.log('inversé', JSON.stringify(await st()));
  await page.click('#bUndo'); await page.waitForTimeout(800); console.log('annulé', JSON.stringify(await st()));
  // couper : clic sur la trace au milieu
  await page.click('#bCut');
  const mid = await page.evaluate(() => { const c = window.__rb.S.ctrl[150]; const p = window.__rb.map.latLngToContainerPoint(c); return [p.x, p.y]; });
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + mid[0], box.y + mid[1]); await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/igntest/edit3_cut.png' });
  console.log('boutons', await page.$$eval('.mbtn', e => e.map(x => x.textContent)));
  await page.click('text=Supprimer le début'); await page.waitForTimeout(800); console.log('début coupé', JSON.stringify(await st()));
  await page.click('#bUndo'); await page.waitForTimeout(600);
  // réduire
  await page.click('#bReduce'); await page.waitForTimeout(300);
  await page.fill('#redTol', '20'); await page.dispatchEvent('#redTol', 'input'); await page.waitForTimeout(200);
  console.log('réduire:', await page.textContent('#redTxt'));
  await page.screenshot({ path: '/tmp/igntest/edit3_reduce.png' });
  await page.click('text=Appliquer'); await page.waitForTimeout(800); console.log('réduit', JSON.stringify(await st()));
  // fusion
  const g = fs.readFileSync('/tmp/igntest/alpes.gpx');
  await page.setInputFiles('#mergeIn', '/tmp/igntest/alpes.gpx'); await page.waitForTimeout(1200); console.log('fusionné', JSON.stringify(await st()));
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
