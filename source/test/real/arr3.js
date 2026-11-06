const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 800 } });
  await p.route(/brouter|routing\.openstreetmap|tile|arcgisonline|overpass|kumi|private\.coffee|mail\.ru/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(600);
  await p.evaluate(() => { const R = window.__rb, ll = R.S.ll; R.map.setView(ll[Math.floor(ll.length * 0.45)], 15); }); await p.waitForTimeout(500);
  const a = await p.locator('.dirarrow').count(); await p.click('.arrowbtn'); await p.waitForTimeout(300);
  const c = await p.locator('.dirarrow').count(); await p.screenshot({ path: process.argv[2], clip: { x: 0, y: 60, width: 520, height: 400 } });
  await p.click('.arrowbtn'); await p.waitForTimeout(300); console.log(a, c, await p.locator('.dirarrow').count()); await b.close(); })();
