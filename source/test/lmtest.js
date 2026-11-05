const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1300, height: 950 }, deviceScaleFactor: 1.5 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/overpass|openfreemap|tile\.|geopf|arcgis|opentopomap|cyclosm|data\.gouv/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(() => window.__rb.openSettings()); await page.waitForTimeout(300);
  console.log('cases :', await page.evaluate(() => document.querySelectorAll('.lmchk').length), '· cochées :', await page.evaluate(() => [...document.querySelectorAll('.lmchk')].filter(c => c.checked).length));
  await page.evaluate(() => { const d = document.querySelector('.lmbox'); d.open = true; d.scrollIntoView({ block: 'start' }); ['hedge', 'fence', 'wall', 'antenna', 'stop', 'trackname'].forEach(k => document.querySelector('.lmchk[data-lm=' + k + ']').click()); });
  await page.waitForTimeout(200);
  const m = await page.$('#modalBg .modal, #modal, .modal'); await (m || page).screenshot({ path: '/home/claude/out/apercu-reperes-un-par-un.png' });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#modalBg button, .modal button')].find(x => /Enregistrer/.test(x.textContent)); b.click(); });
  await page.waitForTimeout(300);
  console.log('lmOff enregistré :', await page.evaluate(() => JSON.stringify(window.__rb.S.settings.lmOff)));
  // filtre : identification des repères
  console.log(await page.evaluate(() => { const S = window.__rb.S; return ['ford', 'stop', 'barrier'].length; }), errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
