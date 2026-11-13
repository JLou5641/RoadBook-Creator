// Chemin inconnu du calculateur : BRouter et OSRM échouent / mentent, Overpass donne le chemin → point calé + tronçon qui suit le chemin
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  let L = 0, L0 = 0;
  await p.route(/brouter\.de/, r => { const m = /lonlats=([^&]+)/.exec(decodeURIComponent(r.request().url())); const [A, B] = m[1].split('|').map(q => q.split(',').map(Number)); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ features: [{ geometry: { coordinates: [[A[0], L - 0.004], [B[0], L - 0.004]] } }] }) }); });
  await p.route(/routing\.openstreetmap/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ geometry: { coordinates: [[3.0, L - 0.004], [3.002, L - 0.004]] } }] }) }));
  // chemin OSM : ligne brisée proche de L (lat) avec un coude
  await p.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const geom = [[L, 2.9990], [L, 3.0010], [L + 0.0003, 3.0020], [L + 0.0003, 3.0040]].map(q => ({ lat: q[0], lon: q[1] })); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elements: [{ type: 'way', id: 77, tags: { highway: 'track' }, geometry: geom }] }) }); });
  await p.route(/tile|arcgisonline/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('#bDraw'); await p.waitForTimeout(300);
  await p.evaluate(() => window.__rb.map.setView([45, 3], 17, { animate: false }));
  L = await p.evaluate(() => { const m = window.__rb.map, r = m.getContainer().getBoundingClientRect(); return m.containerPointToLatLng([500 - r.left, 417 - r.top]).lat; });
    const [A, B] = await p.evaluate((pp) => { const m = window.__rb.map, r = m.getContainer().getBoundingClientRect(); return pp.map(x => { const q = m.latLngToContainerPoint(x); return [q.x + r.left, q.y + r.top]; }); }, [[L - 0.00005, 3.0006], [L + 0.00025, 3.0030]]).catch(() => []);
  await p.mouse.click(...A); await p.waitForTimeout(300);
  await p.mouse.click(...B); await p.waitForTimeout(1500);         // 2e : chemin inconnu du calculateur → calé sur le chemin OSM
  const c = await p.evaluate(() => ({ ctrl: window.__rb.S.ctrl.map(q => [q[0].toFixed(5), q[1].toFixed(5), q[2]]), n: window.__rb.S.ll.length }));
  console.log(JSON.stringify(c));
  await p.mouse.click(600, 700); await p.waitForTimeout(1500);        // loin de tout chemin → refus
  const body = await p.evaluate(() => document.body.innerText);
  console.log('points:', (await p.evaluate(() => window.__rb.S.ctrl.length)), '|', (/🧲 Point trop loin[^\n]*/.exec(body) || ['ABSENT'])[0]);
  await p.screenshot({ path: '/tmp/mag4.png' }); await b.close(); })();
