const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 950 }, ignoreHTTPSErrors: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ignd'; });
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(300);
  const run = async off => {
    await page.evaluate(o => { window.__rb.S.settings.lmOff = o; }, off);
    await page.evaluate(() => window.__rb.generate());
    await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
    return page.evaluate(() => { const t = window.__rb.S.notes.map(n => n.text).join('\n'); return { notes: window.__rb.S.notes.length, haie: (t.match(/haie/g) || []).length, antenne: (t.match(/Antenne/g) || []).length, village: (t.match(/Entrée|Sortie/g) || []).length, rue: window.__rb.S.notes.filter(n => (n.roadNames || []).length).length }; });
  };
  console.log('tout     ', JSON.stringify(await run([])));
  console.log('sans haie, antenne, village, nom de rue', JSON.stringify(await run(['hedge', 'antenna', 'village', 'trackname'])));
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
