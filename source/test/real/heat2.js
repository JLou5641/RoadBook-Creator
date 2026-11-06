const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 760 } });
  await p.route(/^(?!file).*/, r => /data\.geopf\.fr/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.selectOption('#layerSel', 'planign'); await p.selectOption('#heatSel', process.argv[3]);
  const A = process.argv; await p.evaluate(A => window.__rb.map.setView([+(A[4]||42.95), +(A[5]||1.6)], +(A[6]||14)), process.argv); await p.waitForTimeout(6000);
  await p.screenshot({ path: process.argv[2], clip: { x: 300, y: 60, width: 760, height: 520 } }); await b.close(); })();
