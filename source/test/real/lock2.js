const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  await page.evaluate(() => { const S = window.__rb.S; const n = { id: 99, s: 3000, lat: S.ll[200][0], lon: S.ll[200][1], text: 'À D\nÉolienne à G\nsur piste\nFin goudron', cap: 120, showCap: true, kind: 'junction', tulip: { arms: [], R: 50 }, danger: 0 }; S.notes = [n]; window.__rb.editNote(99); });
  await page.waitForTimeout(400);
  console.log('texte', JSON.stringify(await page.inputValue('#eText')), 'libres', await page.$$eval('#stDin .fs', e => e.map(x => x.title)));
  await page.screenshot({ path: '/tmp/igntest/free_open.png' });
  // sélectionne le 1er symbole, le rétrécit, déplace le 2e, retire le 3e
  const fs_ = await page.$$('#stDin .fs');
  const box = await fs_[0].boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150);
  await page.fill('#stSize', '12'); await page.dispatchEvent('#stSize', 'input'); await page.waitForTimeout(150);
  const b2 = await (await page.$$('#stDin .fs'))[1].boundingBox(); await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.mouse.down(); await page.mouse.move(b2.x + b2.width / 2 + 40, b2.y + b2.height / 2 + 50, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150);
  const b3 = await (await page.$$('#stDin .fs'))[2].boundingBox(); await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2); await page.mouse.down(); await page.mouse.up(); await page.click('#stDel'); await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/igntest/free_edit.png' });
  await page.click('.mbtn.primary'); await page.waitForTimeout(400);
  console.log('note', JSON.stringify(await page.evaluate(() => { const n = window.__rb.S.notes[0]; return { text: n.text, lex: n.lex, sym: n.sym }; })));
  console.log('rendu', JSON.stringify(await page.evaluate(() => { const v = window.__rb.noteView(window.__rb.S.notes[0]); return { lines: v.lines, keys: v.keys }; })));
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
