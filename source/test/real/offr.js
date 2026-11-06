const process_FIT = true;
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const tol = +(process.argv[2] || 40);
(async () => {
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 }, ignoreHTTPSErrors: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => { window.__rb.S.settings.data = 'ign'; window.__rb.S.settings.tol = t; }, tol);
  await page.evaluate(t => window.__rb.loadText(t, 'o.gpx'), fs.readFileSync((process.argv[3]||'/tmp/igntest/offroad.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
  const out = await page.evaluate(() => window.__rb.S.notes.map((n, i) => ({ i: i + 1, km: (n.s / 1000).toFixed(2), t: (n.text || '').replace(/\n/g, ' / '), k: n.kind, cap: n.cap })));
  out.forEach(o => console.log(o.i, o.km, o.k, o.cap, o.t));
  await page.evaluate(process_FIT => { const n = window.__rb.S.notes.find(n => n.kind === 'bend') || window.__rb.S.notes[11]; (process_FIT ? window.__rb.map.setView([n.lat, n.lon], 15, { animate: false }) : window.__rb.map.setView([n.lat, n.lon], 18, { animate: false })); }, process_FIT); await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/igntest/off_' + tol + '.png', fullPage: false });
  await page.evaluate(() => { document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; }); await page.waitForTimeout(300);
  const rs = await page.$$('#rb .row'); const files = [];
  for (let i = Math.max(1, rs.length - 4); i < rs.length; i++) { await rs[i].scrollIntoViewIfNeeded(); const f = '/tmp/igntest/offrow_' + i + '.png'; await rs[i].screenshot({ path: f }); files.push(f); }
  console.log(files.join(' '));
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
