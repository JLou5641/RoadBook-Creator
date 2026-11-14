const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message)); await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.mhd[data-g="cfg"]').click()); await p.evaluate(() => document.querySelector('#moreMenu [data-act="settings"]').click()); await p.waitForTimeout(300);
  console.log('Écart par défaut =', await p.evaluate(() => document.querySelector('#sTol').value)); await b.close(); })();
