const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/data\.geopf\.fr\/tms).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.evaluate(() => { const s = document.querySelector('#layerSel'); s.value = 'planignv'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  for (const [lat, lon, z, f] of [[47.5336, 1.2373, 16, 'a'], [47.5160, 1.1330, 14, 'b']]) {
    await p.evaluate(([la, lo, zz]) => window.__rb.map.setView([la, lo], zz, { animate: false }), [lat, lon, z]); await p.waitForTimeout(6000);
    await p.screenshot({ path: `/home/claude/out/apercu-plan-vectoriel-${f}.png` }); }
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
