// Cercles d'ouverture / validation des waypoints sur la carte : aperçu + vérifications
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const gpxFile = process.argv[2] || '/tmp/igntest/alpes.gpx';
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1.5, ignoreHTTPSErrors: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await page.selectOption('#layerSel', 'planign');
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(gpxFile, 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  // quelques waypoints : WPM, WPC (sans ouverture), WPS, DZ puis FZ (zone)
  const info = await page.evaluate(() => {
    const R = window.__rb, N = R.S.notes, step = Math.floor(N.length / 5), pick = [step, 2 * step, 3 * step, 4 * step];
    N[pick[0]].wp = { type: 'wpm', open: 800, clear: 90 };
    N[pick[1]].wp = { type: 'wpc', clear: 300 };
    N[pick[2]].wp = { type: 'wps', open: 1000, clear: 30 };
    N[pick[3]].zone = { type: 'dz', speed: 30 };
    R.renderAll();
    return { pick, n: N.length, radii: pick.map(i => R.noteRadii(N[i])), circles: (() => { let k = 0; R.map.eachLayer(l => { if (l instanceof L.Circle) k++; }); return k; })() };
  });
  console.log(JSON.stringify(info));
  // vue sur le premier waypoint
  await page.evaluate(z => { window.__Z = z; }, process.env.ZOOM || 14);
  const view = async i => { await page.evaluate(i => { const n = window.__rb.S.notes[i]; window.__rb.map.setView([n.lat, n.lon], +(window.__Z || 14), { animate: false }); }, i); await page.waitForTimeout(1500); };
  await page.evaluate(() => document.querySelectorAll('#toast div').forEach(d => d.remove()));
  await view(info.pick[0]);
  await page.evaluate(i => { document.querySelector(`#rb .row[data-id="${window.__rb.S.notes[i].id}"]`).click(); }, info.pick[0]);
  await page.waitForTimeout(800);
  await view(info.pick[0]);
  await (await page.$('#mapwrap')).screenshot({ path: '/home/claude/out/' + (process.env.OUT || 'apercu-rayons-carte.png') });
  // case décochée → plus de cercles ; recochée → de retour (et mémorisé)
  const count = () => page.evaluate(() => { let k = 0; window.__rb.map.eachLayer(l => { if (l instanceof L.Circle) k++; }); return k; });
  const avant = await count();
  await page.uncheck('#radChk'); const off = await count(); const ls = await page.evaluate(() => localStorage.getItem('rbgen.radii'));
  await page.check('#radChk'); const on = await count();
  console.log('cercles : avant', avant, '· case décochée', off, '(mémorisé', ls + ') · recochée', on);
  // tooltip
  await page.evaluate(() => { const m = document.querySelector('.nmk.sel') || document.querySelector('.nmk.wp'); m.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }); await page.waitForTimeout(100); await page.waitForTimeout(400);
  console.log('infobulle :', await page.evaluate(() => (document.querySelector('.leaflet-tooltip') || {}).textContent));
  // les cercles ne bloquent pas le clic sur la trace (ajout de note) : interactive=false
  console.log('cercles interactifs :', await page.evaluate(() => { let k = 0; window.__rb.map.eachLayer(l => { if (l instanceof L.Circle && l.options.interactive) k++; }); return k; }));
  console.log('erreurs :', errs.join('\n') || 'aucune');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
