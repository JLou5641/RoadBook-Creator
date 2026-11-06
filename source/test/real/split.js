const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1500 }, deviceScaleFactor: 1.3 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/openfreemap|overpass|tile\.|geopf|arcgis|opentopomap|cyclosm|kumi|mail\.ru|private\.coffee/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(() => { localStorage.clear(); }); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await p.waitForTimeout(300);
  await p.evaluate(() => { const S = window.__rb.S; S.notes = [{ id: 1, s: 100, lat: 50, lon: 11.5, text: 'TD\nsur piste', cap: 90, showCap: true, kind: 'info', tulip: null, danger: 0 }]; S.nextId = 2; });
  await p.evaluate(() => document.querySelector('#bGen') && 0);
  // ouvrir la fenêtre de la note via l'API de l'appli
  await p.evaluate(() => { window.__rb.renderAll && window.__rb.renderAll(); });
  const n = await p.evaluate(() => Object.keys(FIA_LEX).filter(k => !FIA_LEX[k].x).length + ' visibles / ' + Object.keys(FIA_LEX).length + ' au total');
  console.log(n);
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})();
