const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/data\.geopf\.fr).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.setInputFiles('#fileIn', '/mnt/user-data/uploads/458e641c-1er_trac__RB_MORVAN.json'); await p.waitForTimeout(2000);
  // note avec un trait « autre » bien fourni, on lui ajoute des points bruités pour l'exemple
  const id = await p.evaluate(() => { const N = window.__rb.S.notes.filter(n => n.tulip && n.tulip.others && n.tulip.others.length); const n = N[2]; const o = n.tulip.others[0]; const a = o.p[0], z = o.p[o.p.length - 1]; const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([a[0] + (z[0] - a[0]) * t + Math.sin(i) * 0.4, a[1] + (z[1] - a[1]) * t + Math.cos(i * 1.3) * 0.4]); } o.p = pts; return n.id; });
  await p.evaluate(id => window.__rb.tulipEditor(window.__rb.S.notes.find(n => n.id === id)), id); await p.waitForTimeout(500);
  await p.evaluate(() => { const pa = document.querySelector('#tulOv path[data-k="0"]'); pa.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 })); }); await p.waitForTimeout(300);
  const cnt = () => p.evaluate(() => document.querySelector('#tulCnt').textContent);
  console.log('avant', await cnt()); await p.screenshot({ path: '/tmp/simp_avant.png' });
  await p.tap('#tulSimp'); await p.waitForTimeout(400); console.log('après 1', await cnt());
  await p.screenshot({ path: '/tmp/simp_apres.png' });
  await p.tap('#tulDelLn'); await p.waitForTimeout(300); console.log('après suppression', await cnt(), await p.evaluate(() => document.querySelectorAll('#tulOv path[data-k]').length));
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
