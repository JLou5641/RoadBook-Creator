const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/.*/, r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.click('#bMore'); await p.waitForTimeout(200);
  await p.screenshot({ path: '/home/claude/out/apercu-menu-plus-groupes.png', clip: { x: 600, y: 0, width: 500, height: 520 } });
  // menu entries still work
  await p.click('#moreMenu [data-act="help"]'); await p.waitForTimeout(200); console.log('aide', await p.$$eval('.mbtn', e => e.length) > 0);
  await p.keyboard.press('Escape');
  await p.click('#bDraw'); await p.waitForTimeout(300);
  await p.screenshot({ path: '/home/claude/out/apercu-panneau-dessin-groupes.png', clip: { x: 0, y: 40, width: 480, height: 420 } });
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})();
