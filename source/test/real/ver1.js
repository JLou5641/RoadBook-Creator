const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 700 } });
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.screenshot({ path: '/home/claude/out/apercu-version-1.png', clip: { x: 0, y: 0, width: 700, height: 70 } });
  await p.click('#bMore'); await p.waitForTimeout(300);
  const d = await p.$('#moreMenu'); await d.evaluate(e => e.scrollTop = 99999);
  await p.screenshot({ path: '/home/claude/out/apercu-version-2.png', clip: { x: 500, y: 40, width: 800, height: 660 } });
  console.log(await p.evaluate(() => [document.querySelector('.vtag').textContent, document.querySelector('.dropdown .ver').textContent].join(' | '))); await b.close(); })();
