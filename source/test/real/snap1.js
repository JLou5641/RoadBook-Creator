const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  await p.route(/brouter|routing\.openstreetmap|tile|arcgisonline|overpass/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('#bDraw'); await p.waitForTimeout(300);
  const clickAt = async (x, y) => { await p.mouse.click(x, y); await p.waitForTimeout(250); };
  const modes = () => p.evaluate(() => window.__rb.S.ctrl.map(c => c[2]));
  const txt = () => p.textContent('#bSnapMode');
  await clickAt(400, 300); await clickAt(500, 320);            // activé : suit les chemins
  await p.click('#bSnapMode'); const t1 = await txt();
  await clickAt(600, 300);                                       // désactivé : ligne droite
  await p.keyboard.press('r'); const t2 = await txt();           // touche R : réactive
  await clickAt(700, 320);
  console.log('modes', JSON.stringify(await modes()), '|', t1, '|', t2);
  const dis = await p.evaluate(() => document.querySelector('#bSnap').disabled), lbl = await p.textContent('#bSnap');
  console.log('bSnap désactivé sans sélection:', dis, '|', lbl);
  await p.screenshot({ path: '/tmp/snap1.png' }); await b.close(); })();
