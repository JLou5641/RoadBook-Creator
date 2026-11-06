// Test de bout en bout : page locale, Overpass simulé, génération, captures, export GPX
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const dir = __dirname;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  const overpass = fs.readFileSync(path.join(dir, 'overpass.json'), 'utf8');
  let overpassCalls = 0;
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { overpassCalls++; r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: overpass }); });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  await page.route(/tile|arcgisonline/, r => r.abort());
  await page.goto('file://' + path.join(dir, '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.screenshot({ path: path.join(dir, 'shot0_empty.png') });
  const gpx = fs.readFileSync(path.join(dir, 'trace.gpx'), 'utf8');
  await page.evaluate(t => window.__rb.loadText(t, 'trace.gpx'), gpx);
  await page.waitForTimeout(400);
  await page.click('#bGen');
  await page.waitForFunction(() => window.__rb.S.notes.length > 0 && !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const notes = await page.evaluate(() => window.__rb.S.notes.map(n => ({ s: n.s, text: n.text, cap: n.cap, kind: n.kind })));
  console.log('overpass calls', overpassCalls);
  for (const n of notes) console.log((n.s / 1000).toFixed(2).padStart(6), String(n.cap).padStart(4), n.kind.padEnd(9), n.text.replace(/\n/g, ' | '));
  await page.screenshot({ path: path.join(dir, 'shot1_generated.png') });
  // tulipes en grand
  const html = await page.evaluate(() => window.__rb.S.notes.map((n, i) => `<div style="display:inline-block;margin:6px;text-align:center;font:12px sans-serif">${window.__rb.tulipSVG(n.tulip, 170)}<br>${i + 1}. ${n.text.replace(/\n/g, ' / ')}</div>`).join(''));
  const p2 = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  await p2.setContent(`<body style="background:#ccc">${html}</body>`);
  await p2.screenshot({ path: path.join(dir, 'shot2_tulips.png'), fullPage: true });
  // édition : WP + danger sur la note 4
  await page.evaluate(() => { const n = window.__rb.S.notes[3]; n.wp = { type: 'wpm', open: 800, clear: 200, name: '' }; n.danger = 2; const z = window.__rb.S.notes[1]; z.wp = { type: 'dz', speed: 50 }; const f = window.__rb.S.notes[5]; f.wp = { type: 'fz' }; });
  const out = await page.evaluate(() => window.__rb.buildGPX());
  fs.writeFileSync(path.join(dir, 'export.gpx'), out);
  // ouverture de la fenêtre d'édition pour la capture
  await page.evaluate(() => { document.querySelectorAll('#rb .row')[3].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'shot3_edit.png') });
  await page.keyboard.press('Escape');
  // vue tablette portrait
  await page.setViewportSize({ width: 800, height: 1200 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'shot4_portrait.png') });
  // impression
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.evaluate(() => { window.print = () => {}; document.querySelector('#bPrint').click(); });
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(dir, 'print.pdf'), format: 'A4', printBackground: true });
  console.log('--- console ---\n' + logs.join('\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
