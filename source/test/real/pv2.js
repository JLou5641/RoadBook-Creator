const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/(data\.geopf\.fr\/tms|tiles\.openfreemap\.org)).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.evaluate(() => { document.querySelector('#layerBox').style.display = 'none'; });
  for (const k of ['planignv', 'planignvg', 'bdtopov', 'ofmv', 'ofmvg', 'ofmvd']) {
    await p.evaluate(() => { const s = document.querySelector('#layerBox'); s.style.display = ''; });
    await p.evaluate(([key]) => { const s = document.querySelector('#layerSel'); s.value = key; s.dispatchEvent(new Event('change', { bubbles: true })); window.__rb.map.setView([47.5160, 1.1330], 15, { animate: false }); }, [k]);
    await p.waitForTimeout(5500); await (await p.$('#map')).screenshot({ path: `/tmp/pv_${k}.png` }); }
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
