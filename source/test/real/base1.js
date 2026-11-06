const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 760 } }); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route(/^(?!file).*/, r => /data\.geopf\.fr/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.selectOption('#layerSel', 'ortho'); await p.evaluate(() => window.__rb.map.setView([42.95, 1.6], 14));
  await p.evaluate(() => { const r = document.querySelector('#baseLvl'); r.value = 35; r.dispatchEvent(new Event('input')); }); await p.waitForTimeout(5000);
  await p.selectOption('#heatSel', 'lidar'); await p.waitForTimeout(4000);
  await p.screenshot({ path: process.argv[2], clip: { x: 300, y: 60, width: 760, height: 400 } });
  await p.reload(); console.log('erreurs', errs.length, 'mémorisé', await p.inputValue('#baseLvl')); await b.close(); })();
