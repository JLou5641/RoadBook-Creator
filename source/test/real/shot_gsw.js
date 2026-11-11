const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
 await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
 await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/home/claude/scan/seg.gpx', 'utf8')); await p.waitForTimeout(500);
 await p.click('#bGen'); await p.waitForTimeout(300); await p.selectOption('#gsT', 'osm'); await p.waitForTimeout(200);
 await p.locator('#modal').screenshot({ path: '/tmp/man/43_alerte_local.png' }); await b.close(); })();
