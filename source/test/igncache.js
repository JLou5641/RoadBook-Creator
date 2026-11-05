// Cache du mode IGN détaillé : 2e génération après rechargement = 0 requête ; sauvegarde puis rechargement des repères (.rbosm)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [gpxFile] = process.argv.slice(2);
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ignoreHTTPSErrors: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message)); let req = 0;
  page.on('request', r => { if (/geopf\.fr\/wfs/.test(r.url())) req++; });
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  const url = 'file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html');
  const run = async () => {
    await page.evaluate(() => { window.__rb.S.settings.data = 'ignd'; });
    await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(gpxFile, 'utf8')); await page.waitForTimeout(300);
    req = 0; await page.evaluate(() => window.__rb.generate());
    await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
    return page.evaluate(() => ({ diag: window.__rb.G.diag, txt: window.__rb.S.notes.map(n => n.text).join('|') }));
  };
  await page.goto(url); await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  const a = await run(); console.log('1re génération :', req, 'requêtes ·', a.diag);
  await page.reload();
  const b = await run(); console.log('après rechargement :', req, 'requête(s) ·', b.diag, '· notes identiques :', a.txt === b.txt);
  // enregistrement / rechargement : on exporte, vide la base, ré-importe
  const n = await page.evaluate(async () => { const all = await window.__rb.allIGN(); return { total: all.length, x: all.filter(r => /^x:/.test(r.k)).length, json: JSON.stringify(all) }; });
  console.log('cases en mémoire :', n.total, '· dont repères :', n.x);
  await page.evaluate(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await page.reload();
  await page.evaluate(async j => { await window.__rb.importOsm({ ign: JSON.parse(j) }); }, n.json);
  const c = await run(); console.log('après import du fichier :', req, 'requête(s) · notes identiques :', a.txt === c.txt);
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
