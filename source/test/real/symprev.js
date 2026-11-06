const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 950 }, deviceScaleFactor: 1.5, ignoreHTTPSErrors: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; window.__rb.S.settings.landmarks = true; });
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/alpes.gpx', 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
  const T = ['Muret'];
  await page.evaluate(T => { const S = window.__rb.S; const keep = S.notes.filter(n => n.kind === 'junction').slice(2, 2 + T.length); keep.forEach((n, i) => { n.kind = 'info'; n.auto = true; n.text = T[i]; n.sym = []; n.lex = []; n.wp = null; n.danger = 0; n.roadNames = []; delete n.follow; }); S.notes = [S.notes[0], ...keep]; window.__rb.S.settings.symAuto = true; window.__rb.renderAll(); }, T);
  await page.evaluate(() => { document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; }); await page.waitForTimeout(400);
  const shot = async name => { const rows = await page.$$('#rb .row'); await rows[1].scrollIntoViewIfNeeded(); const a = await rows[1].boundingBox(); const b = await rows[rows.length - 1].boundingBox(); await page.screenshot({ path: name, fullPage: false, clip: { x: a.x - 2, y: a.y - 2, width: a.width + 4, height: b.y + b.height - a.y + 4 } }); return rows.length; };
  // la liste est longue : on capture par rangées
  const rows = await page.$$('#rb .row'); console.log('rangées', rows.length);
  const out = [];
  for (const sym of [false, true]) {
    await page.evaluate(v => { window.__rb.S.settings.symAuto = v; window.__rb.renderAll(); }, sym); await page.waitForTimeout(300);
    const rs = await page.$$('#rb .row');
    for (let i = 1; i < rs.length; i++) { await rs[i].scrollIntoViewIfNeeded(); await page.waitForTimeout(80); const f = `/tmp/igntest/sp_${sym ? 'o' : 'n'}_${i}.png`; await rs[i].screenshot({ path: f }); out.push(f); }
  }
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
