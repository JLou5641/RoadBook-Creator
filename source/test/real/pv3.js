const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/(data\.geopf\.fr\/tms|tiles\.openfreemap\.org)).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  const shots = [['bdtopov', 13], ['bdtopov', 14], ['bdtopov', 17], ['planignv', 19]];
  for (const [k, z] of shots) {
    await p.evaluate(([key, zz]) => { const s = document.querySelector('#layerSel'); s.value = key; s.dispatchEvent(new Event('change', { bubbles: true })); window.__rb.map.setView([47.5160, 1.1330], zz, { animate: false }); }, [k, z]);
    await p.waitForTimeout(16000); await (await p.$('#map')).screenshot({ path: `/tmp/pv3_${k}_${z}.png` }); }
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
