// Réglage « Afficher les directions dans la 3e case » : mêmes notes avec et sans directions (case décochée dans la fenêtre des réglages)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [gpxFile, rx, max = '5'] = process.argv.slice(2);
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
  const idx = await page.evaluate(([rx, max]) => { const re = new RegExp(rx), out = []; window.__rb.S.notes.forEach((n, i) => { if (re.test(n.text) && out.length < +max) out.push(i); }); return out; }, [rx, max]);
  const shoot = async tag => { const rows = await page.$$('#rb .row'); let k = 0; for (const i of idx) { await rows[i].scrollIntoViewIfNeeded(); await page.waitForTimeout(80); await rows[i].screenshot({ path: `/home/claude/out/dir_${tag}${k++}.png` }); } };
  await shoot('a');
  await page.click('#bMore'); await page.click('[data-act=settings]'); await page.waitForTimeout(250);
  console.log('case présente, cochée :', await page.$eval('#' + (process.env.CHK || 'sDir'), e => e.checked)); console.log('(case ' + (process.env.CHK || 'sDir') + ')');
  await page.uncheck('#' + (process.env.CHK || 'sDir')); await page.click('.mbtn.primary'); await page.waitForTimeout(500);
  console.log('réglage :', await page.evaluate(() => window.__rb.S.settings.showDir), '· message :', await page.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).join(' / ')), '· fenêtre « régénérer » :', await page.evaluate(() => document.querySelector('#modalBg').classList.contains('show')));
  await page.evaluate(() => document.querySelectorAll('#toast div').forEach(d => d.remove()));
  await shoot('b');
  console.log('lignes :', idx.join(','), '·', errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
