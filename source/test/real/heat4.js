const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 760 } });
  await p.route(/^(?!file).*/, r => /data\.geopf\.fr/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.selectOption('#layerSel', 'planign'); await p.selectOption('#heatSel', 'ombrage'); await p.evaluate(() => window.__rb.map.setView([42.95, 1.6], 14)); await p.waitForTimeout(3000);
  for (const v of [100, 200]) { await p.evaluate(v => { const r = document.querySelector('#heatLvl'); r.value = v; r.dispatchEvent(new Event('input')); }, v); await p.waitForTimeout(5000);
    console.log(v, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.leaflet-layer.mult')].map(e => [e.style.opacity, e.style.zIndex, e.querySelectorAll('img').length, [...e.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth).length])))); }
  await b.close(); })();
