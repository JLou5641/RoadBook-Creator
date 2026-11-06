const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mode = process.argv[2] || 'ignd';
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, ignoreHTTPSErrors: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(m => { window.__rb.S.settings.data = m; window.__rb.S.settings.straight = false; }, mode);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
  const out = await page.evaluate(() => window.__rb.S.notes.map((n, i) => ({ i: i + 1, km: (n.s / 1000).toFixed(2), t: (n.text || '').replace(/\n/g, ' / '), same: n.follow, k: n.kind })));
  fs.writeFileSync('/tmp/igntest/user_notes_' + mode + '.json', JSON.stringify(out));
  out.filter(o => o.i >= 18 && o.i <= 36).forEach(o => console.log(o.i, o.km, o.t, o.same === undefined ? '' : '[same=' + o.same + ']'));
  console.log('total', out.length, errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
