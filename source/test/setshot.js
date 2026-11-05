const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1300 }, deviceScaleFactor: 1.2 });
  await p.route(/.*/, r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.click('#bMore'); await p.click('[data-act=settings]'); await p.waitForTimeout(300);
  const el = await p.$('#modal'); const box = await el.boundingBox();
  await p.screenshot({ path: '/tmp/igntest/set_full.png', clip: { x: box.x, y: box.y + box.height - 330, width: box.width, height: 330 } }); await b.close();
})();
