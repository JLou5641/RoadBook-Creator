const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
  await p.route(/tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.click('#bMore'); await p.waitForTimeout(200);
  const m = await p.$('#moreMenu'); await m.screenshot({ path: '/tmp/menu.png' }); await b.close(); })();
