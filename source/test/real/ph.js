const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/ph1.png' });
  await p.evaluate(() => document.querySelector('#bMore').click()); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/ph2.png' });
  await b.close(); })();
