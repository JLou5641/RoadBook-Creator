const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', e => console.log('ERR', e.message)); page.on('request', r => /meteo/.test(r.url()) && console.log('REQ', r.url().slice(0, 100)));
  await page.route(/tile\./, r => r.abort());
  await page.route(/open-meteo/, r => r.fulfill({ contentType: 'application/json', headers: {'access-control-allow-origin':'*'}, body: JSON.stringify({ elevation: Array.from({ length: 100 }, (_, i) => 200 + i) }) }));
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  await page.evaluate(() => window.__rb.stagesDialog()); await page.waitForTimeout(200);
  console.log(await page.$$eval('.mbtn', e => e.map(x => x.textContent)));
  await page.click('.mbtn:has-text("Calculer")'); await page.waitForTimeout(300);
  console.log(await page.$$eval('#toast div', e => e.map(x => x.textContent)));
  await page.waitForTimeout(2500); console.log(await page.$$eval('#toast div', e => e.map(x => x.textContent)), await page.evaluate(() => !!window.__rb.S.ele));
  await b.close();
})();
