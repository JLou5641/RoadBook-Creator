const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  const R = () => page.evaluate(() => ({ n: window.__rb.S.ctrl.length, ll: window.__rb.S.ll.length }));
  await page.evaluate(() => { window.__rb.S.routeMode = 'line'; window.__rb.map.setView([47.1, 2.4], 15, { animate: false }); });
  await page.click('#bDraw'); await page.waitForTimeout(200);
  const m = page.locator('#map'); const box = await m.boundingBox(); const X = box.x + 300, Y = box.y + 400;
  // 1. clics
  for (const [dx, dy] of [[0, 0], [200, -60], [400, 20], [600, -80]]) { await page.mouse.click(X + dx, Y + dy); await page.waitForTimeout(150); }
  console.log('après 4 clics', JSON.stringify(await R()));
  // 2. ajout d'un point en tirant sur la trace
  await page.mouse.move(X + 100, Y - 30); await page.mouse.down(); await page.mouse.move(X + 110, Y - 90, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
  console.log('après tirage sur la trace', JSON.stringify(await R()));
  // 3. annuler / rétablir
  await page.click('#bUndo'); await page.waitForTimeout(200); console.log('annuler', JSON.stringify(await R()));
  await page.click('#bRedo'); await page.waitForTimeout(200); console.log('rétablir', JSON.stringify(await R()));
  // 4. main levée (espace)
  await page.keyboard.down('Space'); await page.mouse.move(X + 600, Y + 100); await page.mouse.down();
  for (let k = 1; k <= 30; k++) await page.mouse.move(X + 600 - k * 12, Y + 100 + Math.sin(k / 4) * 40);
  await page.mouse.up(); await page.keyboard.up('Space'); await page.waitForTimeout(400);
  console.log('après main levée', JSON.stringify(await R()));
  await page.screenshot({ path: '/tmp/igntest/edit_free.png' });
  // 5. gomme
  const before = (await R()).n;
  await page.click('#bErase'); await page.mouse.move(X + 400, Y + 100); await page.mouse.down();
  for (let k = 0; k <= 12; k++) await page.mouse.move(X + 400 - k * 20, Y + 100 + Math.sin((k + 8) / 4) * 40, { steps: 2 });
  await page.mouse.up(); await page.waitForTimeout(300);
  console.log('gomme', before, '→', JSON.stringify(await R()));
  await page.screenshot({ path: '/tmp/igntest/edit_erase.png' });
  await page.click('#bUndo'); await page.waitForTimeout(200); console.log('annuler la gomme', JSON.stringify(await R()));
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
