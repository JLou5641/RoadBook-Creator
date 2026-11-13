// Point précédent sur la route, nouveau point sur un chemin inconnu du calculateur : le tronçon suit la route jusqu'à la jonction puis le chemin (pas de diagonale)
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  let R = 0;
  await p.route(/brouter\.de/, r => { const m = /lonlats=([^&]+)/.exec(decodeURIComponent(r.request().url())); const [A, B] = m[1].split('|').map(q => q.split(',').map(Number));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ features: [{ geometry: { coordinates: [[A[0], R], [(A[0] + B[0]) / 2, R], [B[0], R]] } }] }) }); });
  await p.route(/routing\.openstreetmap/, r => r.abort());
  await p.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const mk = a => a.map(q => ({ lat: q[0], lon: q[1] }));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elements: [
      { type: 'way', id: 9, tags: { highway: 'track' }, geometry: mk([[R, 3.0010], [R + 0.0011, 3.0010], [R + 0.0011, 3.0050]]) },
      { type: 'way', id: 8, tags: { highway: 'secondary' }, geometry: mk([[R, 2.9990], [R, 3.0050]]) }] }) }); });
  await p.route(/tile|arcgisonline/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('#bDraw'); await p.waitForTimeout(300);
  await p.evaluate(() => window.__rb.map.setView([45, 3], 17, { animate: false }));
  const xy = ll => p.evaluate(([la, lo]) => { const m = window.__rb.map, r = m.getContainer().getBoundingClientRect(), q = m.latLngToContainerPoint([la, lo]); return [q.x + r.left, q.y + r.top]; }, ll);
  R = await p.evaluate(() => { const m = window.__rb.map, r = m.getContainer().getBoundingClientRect(); return m.containerPointToLatLng([500 - r.left, 620 - r.top]).lat; });
  for (const ll of [[R, 3.0003], [R, 3.0007]]) { await p.mouse.click(...await xy(ll)); await p.waitForTimeout(500); }
  await p.mouse.click(...await xy([R + 0.0011, 3.0030])); await p.waitForTimeout(3000);
  const o = await p.evaluate(() => ({ ctrl: window.__rb.S.ctrl.map(c => c[2]), ll: window.__rb.S.ll.map(q => [q[0], q[1]]) }));
  const near = (la, lo) => o.ll.some(q => Math.abs(q[0] - la) < 0.00003 && Math.abs(q[1] - lo) < 0.00003);

  const st = () => p.evaluate(() => ({ ctrl: window.__rb.S.ctrl.map(c => c[2]), n: window.__rb.S.ll.length }));
  console.log('avant', JSON.stringify(await st()));
  const mk = await p.$$('.cpt'); const bb = await mk[1].boundingBox(); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx - 15, cy, { steps: 5 }); await p.mouse.move(cx - 30, cy, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(4000);
  console.log('après', JSON.stringify(await st()));
  await p.screenshot({ path: '/tmp/mag7.png' }); await b.close(); })();
