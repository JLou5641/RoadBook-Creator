// Mode dessin (BRouter simulé), note manuelle, reprise après rechargement, panne Overpass
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const dir = __dirname;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error') logs.push('console.error: ' + m.text()); });
  const ov = JSON.parse(fs.readFileSync(path.join(dir, 'overpass.json'), 'utf8'));
  let overpassFail = false;
  await page.route(/overpass|kumi|private\.coffee/, r => overpassFail ? r.fulfill({ status: 504, body: 'timeout' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ov) }));
  await page.route(/tile|arcgisonline/, r => r.abort());
  // BRouter simulé : renvoie le chemin du réseau entre les deux points (ici : la route de test complète découpée)
  const gpx = fs.readFileSync(path.join(dir, 'trace.gpx'), 'utf8');
  let brouterCalls = 0;
  await page.route(/brouter\.de/, r => {
    brouterCalls++;
    const u = new URL(r.request().url()); const [a, b] = u.searchParams.get('lonlats').split('|').map(s => s.split(',').map(Number));
    const coords = []; for (let k = 0; k <= 20; k++) coords.push([a[0] + (b[0] - a[0]) * k / 20, a[1] + (b[1] - a[1]) * k / 20]);
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }] }) });
  });
  await page.goto('file://' + path.join(dir, '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(() => localStorage.clear()); await page.reload();
  // dessin
  await page.click('#bDraw');
  await page.evaluate(() => { })
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + 300, box.y + 500); await page.mouse.click(box.x + 500, box.y + 300); await page.mouse.click(box.x + 650, box.y + 450);
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ ctrl: window.__rb.S.ctrl.length, ll: window.__rb.S.ll.length, src: window.__rb.S.src, km: window.__rb.T && window.__rb.T.L }));
  console.log('dessin', JSON.stringify(st), 'brouter calls', brouterCalls);
  await page.screenshot({ path: path.join(dir, 'shot5_draw.png') });
  await page.click('#bDrawEnd');
  // reprise : on recharge une trace GPX, on génère, on ajoute une note à la main
  await page.evaluate(t => window.__rb.loadText(t, 'trace.gpx'), gpx); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate()); await page.waitForTimeout(800);
  const n0 = await page.evaluate(() => window.__rb.S.notes.length);
  // clic sur la trace au milieu du segment D112 (entre départ et note 2)
  const pt = await page.evaluate(() => { const S = window.__rb.S; const p = S.ll[Math.floor(S.ll.length * 0.12)]; return p; });
  const xy = await page.evaluate(p => { const m = document.querySelector('#map'); return null; }, pt);
  await page.evaluate(p => { const ev = { latlng: { lat: p[0], lng: p[1] } }; window.__rb_hitClick = ev; }, pt);
  // passe par l'API Leaflet : on centre la carte sur le point puis on clique au centre
  await page.evaluate(p => { window.dispatchEvent(new Event('resize')); }, pt);
  const center = await page.evaluate(p => { const el = document.querySelector('#map'); return { w: el.clientWidth, h: el.clientHeight }; }, pt);
  await page.evaluate(p => { const mapEl = document.querySelector('#map'); }, pt);
  await page.evaluate(p => window.__rb_setView && window.__rb_setView(p), pt);
  console.log('notes après génération', n0);
  // reload -> reprise automatique
  await page.waitForTimeout(800);
  await page.reload(); await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ notes: window.__rb.S.notes.length, name: document.querySelector('#rbName').value, rows: document.querySelectorAll('#rb .row').length }));
  console.log('après rechargement', JSON.stringify(r));
  // panne Overpass
  overpassFail = true;
  await page.evaluate(t => window.__rb.loadText(t, 'trace2.gpx'), gpx.replace('Boucle test Cévennes', 'Autre')); await page.waitForTimeout(300);
  await page.click('#bGen');
  await page.waitForFunction(() => document.querySelector('#modal h2') && /indisponibles/.test(document.querySelector('#modal h2').textContent), null, { timeout: 30000 });
  console.log('erreur affichée :', await page.evaluate(() => document.querySelector('#modal .mb').textContent.slice(0, 90)));
  await page.screenshot({ path: path.join(dir, 'shot6_error.png') });
  console.log(logs.join('\n') || 'aucune erreur JS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
