const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 760 } }); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route(/^(?!file).*/, r => /data\.geopf\.fr/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.selectOption('#layerSel', 'planign'); await p.selectOption('#heatSel', 'ombrage');
  await p.evaluate(() => window.__rb.map.setView([42.95, 1.6], 14));
  const set = async v => { await p.evaluate(v => { const r = document.querySelector('#heatLvl'); r.value = v; r.dispatchEvent(new Event('input')); }, v); await p.waitForTimeout(9000); };
  for (const v of [30, 100, 200]) { await set(v); await p.screenshot({ path: process.argv[2].replace('.png', v + '.png'), clip: { x: 300, y: 60, width: 760, height: 400 } }); }
  console.log('erreurs', errs.length, await p.evaluate(() => [...document.querySelectorAll('.leaflet-layer.mult')].map(e => e.style.opacity + '|' + e.style.filter))); await b.close(); })();
