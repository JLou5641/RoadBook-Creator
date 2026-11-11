// Test des STOP / Cédez le passage : sur notre route ou sur la route croisée (Overpass simulé, fixture test/overpass.json)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'overpass.json'), 'utf8'));
const scen = {
  'aucun': e => { },
  'stop sur noeud partagé (route principale vs piste)': e => { e.find(x => x.id === 1004).tags = { highway: 'stop' }; },
  'stop sur la piste (noeud propre à la piste, 1008)': e => { e.find(x => x.id === 1008).tags = { highway: 'stop' }; },
  'stop sur la route principale (noeud propre 1003)': e => { e.find(x => x.id === 1003).tags = { highway: 'stop' }; },
  'stop partagé, direction=backward (contraire au sens)': e => { e.find(x => x.id === 1004).tags = { highway: 'stop', direction: 'backward' }; },
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
    const t = await p.evaluate(() => window.__rb.S.notes.map(n => (n.text || '') + ' ' + JSON.stringify(n.sym || '')).filter(x => /stop|cédez|giveway/i.test(x)));
    console.log(nm.padEnd(55), '→', t.length ? 'PANNEAU gardé' : 'ignoré'); await p.close(); }
  await b.close(); })();
