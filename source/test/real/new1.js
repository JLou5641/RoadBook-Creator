// Test des STOP / Cédez le passage : sur notre route ou sur la route croisée (Overpass simulé, fixture test/overpass.json)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'overpass.json'), 'utf8'));
const scen = {
  'feux sur notre route (1003)': e => { e.find(x => x.id === 1003).tags = { highway: 'traffic_signals' }; },
  'feux direction=backward sur notre route': e => { e.find(x => x.id === 1003).tags = { highway: 'traffic_signals', direction: 'backward' }; },
  'ralentisseur sur notre route': e => { e.find(x => x.id === 1003).tags = { traffic_calming: 'bump' }; },
  'passage piéton sur notre route': e => { e.find(x => x.id === 1003).tags = { highway: 'crossing' }; },
  'ralentisseur hors de nos chemins (ignoré)': e => { const n = e.find(x => x.id === 1003); e.push({ type: 'node', id: 9997, lat: n.lat + 0.00002, lon: n.lon, tags: { traffic_calming: 'bump' } }); },
  'danger isolé à ~3 m (gardé)': e => { const n = e.find(x => x.id === 1003); e.push({ type: 'node', id: 9996, lat: n.lat + 0.00003, lon: n.lon, tags: { hazard: 'slippery' } }); },
  'danger isolé à ~20 m (écarté)': e => { const n = e.find(x => x.id === 1003); e.push({ type: 'node', id: 9995, lat: n.lat + 0.00018, lon: n.lon, tags: { hazard: 'slippery' } }); },
  'danger isolé direction contraire (écarté)': e => { const n = e.find(x => x.id === 1003); e.push({ type: 'node', id: 9994, lat: n.lat + 0.00003, lon: n.lon, tags: { hazard: 'slippery', direction: 'backward' } }); e.push({ type: 'node', id: 9993, lat: n.lat + 0.00003, lon: n.lon, tags: { hazard: 'slippery', direction: 'forward' } }); },
};
(async () => { const b = await chromium.launch();
  for (const [nm, f] of Object.entries(scen)) {
    const el = JSON.parse(JSON.stringify(base)); f(el.elements);
    const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
    await p.route(/overpass|kumi|private\.coffee|mail\.ru/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(el) }));
    await p.route(/tile|arcgisonline/, r => r.abort());
    await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.evaluate(t => window.__rb.loadText(t, 'trace.gpx'), fs.readFileSync(path.join(__dirname, '..', 'trace.gpx'), 'utf8')); await p.waitForTimeout(400);
    await p.click('#bGen'); await p.waitForTimeout(300); await p.selectOption('#gsT', 'osm'); await p.selectOption('#gsN', 'osm'); await p.click('#modal .mbtn.primary');
    await p.waitForSelector('#modal h2:has-text("rapport")', { timeout: 20000 }).catch(() => { });
    await p.waitForTimeout(500);
    const t = await p.evaluate(() => window.__rb.S.notes.filter(n => /feux|ralentisseur|piéton/i.test(n.text || '')).map(n => JSON.stringify(window.__rb.noteView(n).keys) + ' ' + JSON.stringify(window.__rb.noteView(n).lines)));
    const sk = await p.evaluate(() => { const d = document.querySelector('#modal details'); return d ? d.textContent.replace(/\n/g, ' ; ') : ''; });
    console.log(nm.padEnd(40), '→', JSON.stringify(t), sk ? '[' + sk + ']' : ''); await p.close(); }
  await b.close(); })();
