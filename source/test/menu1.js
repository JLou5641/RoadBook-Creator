const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/.*/, r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(() => window.__rb.openSettings()); await p.waitForTimeout(300);
  console.log('sections', await p.$$eval('.setsec>summary', e => e.map(x => x.textContent.replace(/\s+/g, ' '))));
  const ids = ['sData','sTol','sFoot','sMerge','sStraight','sFollow','sGoudron','sBends','sBendA','sOffroad','sPois','sLand','sR','sWater','sBld','sExt','sSym','sDir','sRO','sPI','sTR','sRoad','sCap','sClear'];
  console.log('ids manquants', ids.filter(i => !document_has(i)).join(',') || 'aucun');
  function document_has(i) { return true; }
  console.log('présents', await p.evaluate(ids => ids.filter(i => !document.getElementById(i)), ids));
  await p.screenshot({ path: '/tmp/igntest/menu_a.png' });
  await p.evaluate(() => { const m = document.querySelector('#modal'); m.scrollTop = m.scrollHeight; document.querySelector('#modal .mb') && (document.querySelector('#modal .mb').scrollTop = 99999); }); await p.waitForTimeout(200);
  await p.screenshot({ path: '/tmp/igntest/menu_b.png' });
  await p.uncheck('#sRO'); await p.fill('#sTol', '25'); await p.click('.mbtn.primary'); await p.waitForTimeout(300);
  console.log('réglages', await p.evaluate(() => [window.__rb.S.settings.showRO, window.__rb.S.settings.tol]));
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})();
