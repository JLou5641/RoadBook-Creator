const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); 
  for (const [w, h, tag, lang] of [[390, 780, 'ph', 'fr'], [1000, 700, 'pc', 'en']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 }); await p.route(/^(?!file).*/, r => r.abort()); p.on('pageerror', e => console.log('ERR', e.message));
    await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(l => { localStorage.clear(); localStorage.setItem('rbLang', l); }, lang); await p.reload(); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('#bMore').click()); await p.waitForTimeout(200); await p.screenshot({ path: `/tmp/m_${tag}1.png` });
    await p.evaluate(() => document.querySelector('.mhd[data-g="tools"]').click()); await p.waitForTimeout(200); await p.screenshot({ path: `/tmp/m_${tag}2.png` });
    await p.evaluate(() => document.querySelector('.mhd[data-g="cfg"]').click()); await p.waitForTimeout(200); await p.screenshot({ path: `/tmp/m_${tag}3.png` });
    console.log(tag, 'menu ouvert après clic section:', await p.evaluate(() => document.querySelector('#moreMenu').classList.contains('open')));
    await p.evaluate(() => document.querySelector('#moreMenu [data-act="settings"]').click()); await p.waitForTimeout(300);
    console.log(tag, 'réglages ouverts:', await p.evaluate(() => !!document.querySelector('#sCapMode')));
  } await b.close(); })();
