const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await p.route(/.*/, r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(() => window.__rb.openSettings()); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelectorAll('.setsec').forEach((d, i) => { d.open = i === 3; }));
  await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/igntest/menu_c.png' }); await b.close();
})();
