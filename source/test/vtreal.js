// Mode IGN de bout en bout avec le VRAI service WFS de la Géoplateforme (sans simulation)
// usage : node ignreal.js <trace.gpx> <tag>
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [gpxFile, tag] = process.argv.slice(2);
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  const log = [];
  page.on('response', async r => { const u = r.url(); if (/openfreemap/.test(u)) { const q = new URL(u).searchParams; let n = 0; try { n = (await r.body()).length; } catch (e) {} log.push(`${r.status()} ${u.split('/').slice(-3).join('/')} ${(n / 1024).toFixed(0)} Ko${''}`); } });
  page.on('requestfailed', r => { if (/openfreemap/.test(r.url())) log.push('ÉCHEC ' + r.failure().errorText); });
  await page.route(/data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'vt'; });
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(gpxFile, 'utf8')); await page.waitForTimeout(300);
  const t0 = Date.now();
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  const info = await page.evaluate(() => ({ diag: window.__rb.G && window.__rb.G.diag, mm: !!window.__rb.S.mm, n: window.__rb.S.notes.length, toasts: [...document.querySelectorAll('#toast div')].map(d => d.textContent) }));
  console.log(`[${tag}] ${Date.now() - t0} ms · ${log.length} requêtes`); console.log(log.join('\n'));
  console.log('   ', info.diag, '· notes', info.n, '· map-matching', info.mm); console.log('    toasts :', JSON.stringify(info.toasts));
  console.log(errs.filter(e => !/Failed to load resource/.test(e)).slice(0, 8).join('\n') || '    aucune erreur JS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
