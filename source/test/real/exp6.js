const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 800 } });
  await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 'a.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(600);
  await p.evaluate(() => { const R = window.__rb; R.S.notes = [{ id: 'n1', s: 500, lat: R.S.ll[20][0], lon: R.S.ll[20][1], text: 'x', kind: 'info', tulip: null }]; });
  await p.evaluate(() => document.querySelector('#bExport').click()); await p.waitForTimeout(600);
  await p.screenshot({ path: '/tmp/exp6.png' }); await b.close(); })();
