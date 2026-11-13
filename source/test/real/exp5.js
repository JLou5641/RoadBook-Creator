const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 'a.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(600);
  await p.evaluate(() => { const R = window.__rb; R.S.notes = [
    { id: 'n1', s: 500, lat: R.S.ll[20][0], lon: R.S.ll[20][1], text: 'Contrôle horaire', kind: 'info', wp: { type: 'ch', limit: 25, speed: 50 }, tulip: null },
    { id: 'n2', s: 900, lat: R.S.ll[30][0], lon: R.S.ll[30][1], text: 'Tout droit', kind: 'info', tulip: null },
    { id: 'n3', s: 1300, lat: R.S.ll[40][0], lon: R.S.ll[40][1], text: 'Zone', kind: 'info', zone: { type: 'dz', speed: 60 }, tulip: null }]; });
  await p.waitForTimeout(300);
  for (const m of ['proj', 'full', 'rb', 'trace', 'orient']) {
    const g = await p.evaluate(async m => await window.__rb.buildGPX(() => {}, m), m);
    console.log(m.padEnd(7), 'wpt', (g.match(/<wpt /g) || []).length, '| trk', /<trk>/.test(g), '| tulip', (g.match(/<openrally:tulip>/g) || []).length, '| projet', /rbgen:project/.test(g), '| Ko', Math.round(g.length / 1024), '| XML', g.trimEnd().endsWith('</gpx>'));
  }
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
