// Mode IGN : mémoire du navigateur, fichier .rbosm (enregistrer, vider, recharger) et régénération sans téléchargement
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const DB = JSON.parse(fs.readFileSync('/home/claude/ign/data/marseille10.geojson', 'utf8')).features;
for (const f of DB) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const c of f.geometry.coordinates) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } f.bb = [y0, x0, y1, x1]; }
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 800 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let calls = 0;
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/(wmts|private)|opentopomap|cyclosm/, r => r.abort());
  await page.route(/data\.geopf\.fr\/wfs/, r => {
    calls++; const u = new URL(r.request().url()), q = Object.fromEntries([...u.searchParams].map(([k, v]) => [k.toUpperCase(), v]));
    const [la0, lo0, la1, lo1] = q.BBOX.split(',').map(Number), s0 = +q.STARTINDEX || 0;
    const all = q.TYPENAMES === 'BDTOPO_V3:troncon_de_route' ? DB.filter(f => f.bb[0] <= la1 && f.bb[2] >= la0 && f.bb[1] <= lo1 && f.bb[3] >= lo0) : [];
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: all.slice(s0, s0 + +q.COUNT).map(({ bb, ...f }) => f) }) });
  });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  // le mode est choisi par la boîte des réglages, comme le ferait l'utilisateur
  await page.click('#bMore'); await page.click('[data-act=settings]'); await page.selectOption('#sData', 'ign'); await page.click('.mbtn.primary'); await page.waitForTimeout(200);
  console.log('réglage enregistré :', await page.evaluate(() => window.__rb.S.settings.data));
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/home/claude/ign/data/marseille_route_piste.gpx', 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate()); const n1 = await page.evaluate(() => window.__rb.S.notes.length);
  console.log('1re génération : requêtes', calls, 'notes', n1, '·', await page.evaluate(() => window.__rb.G.diag));
  await page.reload(); await page.waitForTimeout(500); calls = 0; await page.evaluate(() => window.__rb.generate());
  console.log('page rechargée : réglage', await page.evaluate(() => window.__rb.S.settings.data), '· requêtes', calls, '(0 attendu)');
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  const dl = page.waitForEvent('download'); await page.click('#bMore'); await page.click('[data-act=saveOsm]');
  const d = await dl; const f = path.join(__dirname, 'chemins_ign.rbosm'); await d.saveAs(f);
  console.log('fichier :', (fs.statSync(f).size / 1024).toFixed(0) + ' Ko', '·', await page.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).pop()));
  await page.click('#bMore'); await page.click('[data-act=settings]'); await page.click('#sClear'); await page.waitForTimeout(300); await page.keyboard.press('Escape');
  await page.setInputFiles('#fileIn', f); await page.waitForTimeout(800);
  console.log('chargement :', await page.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).pop()));
  await page.reload(); await page.waitForTimeout(500);
  calls = 0; await page.evaluate(() => window.__rb.generate()); const n2 = await page.evaluate(() => window.__rb.S.notes.length);
  console.log('après rechargement du fichier : requêtes', calls, 'notes', n2, n2 === n1 ? '(identique)' : '(DIFFÉRENT)');
  const gpx = await page.evaluate(() => window.__rb.buildGPX()); fs.writeFileSync(path.join(__dirname, 'ign.gpx'), gpx);
  console.log(errs.join('\n') || 'aucune erreur JS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
