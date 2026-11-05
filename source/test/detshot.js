// Aperçus du mode IGN détaillé : lignes de roadbook contenant des repères IGN + fenêtre des réglages
// usage : node detshot.js <trace.gpx> <regex> <préfixe> <max>
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [gpxFile, rx, pre, max = '6'] = process.argv.slice(2);
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5, ignoreHTTPSErrors: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ignd'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(gpxFile, 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  await page.evaluate(() => { document.querySelector('#side').style.width = '560px'; document.querySelector('#side').style.maxWidth = '560px'; document.querySelectorAll('#toast div').forEach(d => d.remove()); });
  await page.waitForTimeout(300);
  const idx = await page.evaluate(([rx, max]) => { const re = new RegExp(rx), out = []; window.__rb.S.notes.forEach((n, i) => { if (re.test(n.text) && out.length < +max) out.push(i); }); return out; }, [rx, max]);
  const rows = await page.$$('#rb .row'); let k = 0;
  for (const i of idx) { if (!rows[i]) continue; await rows[i].scrollIntoViewIfNeeded(); await page.waitForTimeout(100); await rows[i].screenshot({ path: `/home/claude/out/${pre}_row${k++}.png` }); }
  console.log('lignes :', idx.join(','), '→', k, 'images');
  if (process.env.SETTINGS) {
    await page.click('#bMore'); await page.click('[data-act=settings]'); await page.waitForTimeout(300);
    await page.selectOption('#sData', 'ignd');
    const el = await page.$('#modal'); await el.screenshot({ path: '/home/claude/out/reglages-ign-detaille.png' });
  }
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
