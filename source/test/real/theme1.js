const { chromium } = require('playwright'); const path = require('path'); const fs=require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/.*/, r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.setInputFiles('#fileIn', '/tmp/igntest/corner.gpx'); await p.waitForTimeout(800);
  for (const [i,n] of [[1,'jour'],[2,'nuit']]) {
    await p.click('#bMore'); await p.click('[data-act="theme"]'); await p.waitForTimeout(200);
    await p.screenshot({ path: `/home/claude/out/apercu-theme-${n}.png` });
    await p.click('#bMore'); await p.waitForTimeout(200);
    await p.screenshot({ path: `/home/claude/out/apercu-theme-${n}-menu.png`, clip:{x:640,y:0,width:640,height:620} });
    await p.keyboard.press('Escape'); await p.mouse.click(300,400);
  }
  console.log(await p.evaluate(()=>document.body.dataset.theme), errs.join('\n')||'aucune erreur JS'); await b.close();
})();
