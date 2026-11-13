// Test des STOP / Cédez le passage : sur notre route ou sur la route croisée (Overpass simulé, fixture test/overpass.json)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'overpass.json'), 'utf8'));
const scen = {
  'aucun': e => { },
  'stop sur noeud partagé (route principale vs piste)': e => { e.find(x => x.id === 1004).tags = { highway: 'stop' }; },
  'stop sur la piste (noeud propre à la piste, 1008)': e => { e.find(x => x.id === 1008).tags = { highway: 'stop' }; },
  'stop sur la route principale (noeud propre 1003)': e => { e.find(x => x.id === 1003).tags = { highway: 'stop' }; },
  'stop partagé, direction=backward (contraire au sens)': e => { e.find(x => x.id === 1004).tags = { highway: 'stop', direction: 'backward' }; },
  'route principale coupée au carrefour + stop (doit être ignoré)': e => { const w = e.find(x => x.id === 5000); const i = w.nodes.indexOf(1004); e.push({ type: 'way', id: 5002, nodes: w.nodes.slice(i), tags: { ...w.tags } }); w.nodes = w.nodes.slice(0, i + 1); e.find(x => x.id === 1004).tags = { highway: 'give_way' }; },
  'stop sur un noeud hors de tous les chemins connus (doit être ignoré)': e => { const n = e.find(x => x.id === 1003); e.push({ type: 'node', id: 9999, lat: n.lat, lon: n.lon, tags: { highway: 'stop', direction: 'backward' } }); },
  'portail sur notre route (noeud 1003) : doit être gardé': e => { e.find(x => x.id === 1003).tags = { barrier: 'gate' }; },
  'portail hors de nos chemins (noeud isolé) : doit être ignoré': e => { const n = e.find(x => x.id === 1003); e.push({ type: 'node', id: 9998, lat: n.lat + 0.00002, lon: n.lon, tags: { barrier: 'gate' } }); },
  'cédez-le-passage sur noeud partagé': e => { e.find(x => x.id === 1004).tags = { highway: 'give_way' }; },
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
    const t = await p.evaluate(() => window.__rb.S.notes.filter(n => /stop|cédez|giveway|portail|fencegate/i.test((n.text || '') + JSON.stringify(n.sym || ''))).map(n => n.why));
    const sk = await p.evaluate(() => { const d = document.querySelector('#modal details'); return d ? d.textContent.replace(/\n/g, ' ; ') : ''; });
    console.log(nm.padEnd(55), '→', t.length ? 'PANNEAU gardé' : 'ignoré', sk ? '[' + sk + ']' : ''); await p.close(); }
  await b.close(); })();
