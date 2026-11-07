const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 700 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/data\.geopf\.fr).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('rbgen.myLayers', JSON.stringify([{ id: 'a1', name: 'Mon fond perso', url: 'https://x/{z}/{x}/{y}.png' }])); }); await p.reload(); await p.waitForTimeout(800);
  console.log(await p.evaluate(() => [...document.querySelectorAll('#layerSel optgroup')].map(g => g.label + ' : ' + g.children.length)));
  await p.selectOption('#layerSel', 'planign'); console.log('val', await p.evaluate(() => document.querySelector('#layerSel').value));
  await p.selectOption('#layerSel', 'c:a1'); console.log('val perso', await p.evaluate(() => document.querySelector('#layerSel').value));
  await p.evaluate(() => { const s = document.querySelector('#layerSel'); s.size = 16; s.style.height = 'auto'; });
  await p.locator('#layerBox').screenshot({ path: '/home/claude/out/apercu-fonds-par-origine.png' }); console.log('erreurs', errs.join('|') || 0); await b.close(); })();
