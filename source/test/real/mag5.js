// Après un point calé en « ligne droite » sur un chemin inconnu, déplacer un point précédent sur la route doit rester calé sur la route (pas de ligne droite)
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  let roadLat = 0, brFail = false;
  await p.route(/brouter\.de/, r => { if (brFail) return r.abort(); const m = /lonlats=([^&]+)/.exec(decodeURIComponent(r.request().url())); const [A, B] = m[1].split('|').map(s => s.split(',').map(Number));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ features: [{ geometry: { coordinates: [[A[0], roadLat], [(A[0] + B[0]) / 2, roadLat], [B[0], roadLat]] } }] }) }); });
  await p.route(/routing\.openstreetmap/, r => r.abort());
  await p.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const mk = L => [[L, 2.9990], [L, 3.0050]].map(q => ({ lat: q[0], lon: q[1] })); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elements: [{ type: 'way', id: 9, tags: { highway: 'track' }, geometry: mk(roadLat + 0.0011) }, { type: 'way', id: 8, tags: { highway: 'secondary' }, geometry: mk(roadLat) }] }) }); });
  await p.route(/tile|arcgisonline/, r => r.abort());
  await p.goto('file://' + (process.env.F || path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'))); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('#bDraw'); await p.waitForTimeout(300);
  await p.evaluate(() => window.__rb.map.setView([45, 3], 17, { animate: false }));
  const xy = ll => p.evaluate(([la, lo]) => { const m = window.__rb.map, r = m.getContainer().getBoundingClientRect(), q = m.latLngToContainerPoint([la, lo]); return [q.x + r.left, q.y + r.top]; }, ll);
  roadLat = await p.evaluate(() => { const m = window.__rb.map, r = m.getContainer().getBoundingClientRect(); return m.containerPointToLatLng([500 - r.left, 600 - r.top]).lat; });
  const modes = () => p.evaluate(() => window.__rb.S.ctrl.map(c => c[2] + '@' + c[0].toFixed(5)));
  for (const ll of [[roadLat, 3.0003], [roadLat, 3.0015]]) { await p.mouse.click(...await xy(ll)); await p.waitForTimeout(500); }
  await p.mouse.click(...await xy([roadLat + 0.0011, 3.0030])); await p.waitForTimeout(1500);
  console.log('modes après pose du point sur le chemin :', JSON.stringify(await modes()));
  const drag = async (from, to) => { const [x0, y0] = await xy(from), [x1, y1] = await xy(to); await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 }); await p.mouse.move(x1, y1, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(1200); };
  await drag([roadLat, 3.0015], [roadLat + 0.00008, 3.0016]);
  console.log('après déplacement d’un point route (calculateur OK)      :', JSON.stringify(await modes()));
  brFail = true;
  await drag([roadLat, 3.0015], [roadLat + 0.00008, 3.0016]);
  console.log('après déplacement d’un point route (calculateur en panne):', JSON.stringify(await modes())); await b.close(); })();
