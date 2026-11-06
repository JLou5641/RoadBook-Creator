const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'); const dir = __dirname;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(path.join(dir, 'overpass.json'), 'utf8') }));
  await page.route(/tile|arcgisonline/, r => r.abort());
  await page.goto('file://' + path.join(dir, '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 'trace.gpx'), fs.readFileSync(path.join(dir, 'trace.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate()); await page.waitForTimeout(800);
  const n0 = await page.evaluate(() => window.__rb.S.notes.length);
  // clic sur la trace à ~300 m du départ
  const pos = await page.evaluate(() => { const { S, map } = window.__rb; const p = S.ll[45]; map.setView(p, 18, { animate: false }); const c = map.latLngToContainerPoint(p); return { x: c.x, y: c.y }; });
  await page.waitForTimeout(300);
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + pos.x, box.y + pos.y);
  await page.waitForTimeout(400);
  const dlg = await page.evaluate(() => document.querySelector('#modalBg').classList.contains('show') && document.querySelector('#modal h2').textContent);
  await page.fill('#eText', 'Attention ornière\nrester à droite');
  await page.selectOption('#eDanger', '1');
  await page.click('.mbtn.primary');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => window.__rb.S.notes.filter(n => !n.auto).map(n => ({ s: n.s, text: n.text, danger: n.danger })));
  console.log('notes', n0, '-> dialog:', dlg, '-> manuelles:', JSON.stringify(r));
  await page.screenshot({ path: path.join(dir, 'shot7_manual.png') });
  console.log(errs.join('\n') || 'aucune erreur JS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
