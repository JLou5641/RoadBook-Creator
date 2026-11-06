// Image de la note du GPX avec les symboles automatiques + validation du GPX ; réglage « remplacer par les symboles » désactivé
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 1000 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ignd'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/tmp/igntest/alpes.gpx', 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  const idx = await page.evaluate(() => { const re = /^TD$|Entrée|Église|Serrer|Rond-point|Barrière/; const o = []; window.__rb.S.notes.forEach((n, i) => { if (re.test(n.text.split('\n')[0]) || /Entrée|Église|Barrière/.test(n.text)) o.push(i); }); return o.slice(0, 6); });
  const svgs = await page.evaluate(ix => ix.map(i => window.__rb.notesSVG(window.__rb.S.notes[i])), idx);
  const html = svgs.map(s => `<div style="display:inline-block;margin:4px;border:1px solid #000">${s}</div>`).join('');
  await page.setContent(`<body style="margin:0;background:#ddd">${html}</body>`); await page.screenshot({ path: '/home/claude/out/apercu-gpx-notes.png', fullPage: true });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  const gpx = await page.evaluate(async () => { const r = window.__rb.buildGPX(); return typeof r.then === 'function' ? await r : r; });
  console.log('notes imagées :', idx.join(','), '· erreurs :', errs.join('') || 'aucune'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
