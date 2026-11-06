const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 800 } });
  await p.route(/brouter|routing\.openstreetmap|tile|arcgisonline|overpass|kumi|private\.coffee|mail\.ru/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.evaluate(() => window.__rb.openSettings && window.__rb.openSettings());
  
  await p.waitForTimeout(400); await p.screenshot({path:process.argv[2]}); await b.close(); })();
