const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/tile|arcgisonline|brouter|openrouteservice|routing\.openstreetmap|overpass/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('#bDraw'); await p.waitForTimeout(300);
  await p.selectOption('#magMax', '0'); await p.waitForTimeout(200);
  console.log('S.magMax', await p.evaluate(() => window.__rb.S.magMax), '| options', await p.$$eval('#magMax option', o => o.map(x => x.value).join(',')), '| erreurs', errs.length);
  await p.screenshot({ path: '/tmp/mag8.png' }); await b.close(); })();
