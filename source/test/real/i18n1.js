const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  await p.route(/^(?!file).*/, r => r.abort());
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('rbLang', 'en'); }); await p.reload();
  const miss = async (tag) => { const m = await p.evaluate(() => I18N.missing()); console.log('== ' + tag + ' (' + m.length + ')'); m.forEach(x => console.log('  ' + x.slice(0, 150))); };
  await miss('start');
  await p.evaluate(t => window.__rb.loadText(t, 'a.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(500);
  await miss('after load');
  const clickMenu = async (act) => { await p.click('#bMore'); await p.click('#moreMenu [data-act="' + act + '"]'); await p.waitForTimeout(400); };
  await p.click('#bMore'); await p.screenshot({ path: '/tmp/en_menu.png' }); await p.mouse.click(5, 5);
  for (const a of ['settings', 'stages', 'marks', 'alt', 'meas', 'ctl', 'help']) { await clickMenu(a); await miss(a); if (a === 'settings') await p.screenshot({ path: '/tmp/en_settings.png' }); await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.modal-bg,.modal').forEach(e => e.remove())); }
  await p.click('#bExport'); await p.waitForTimeout(300); await miss('export'); await p.screenshot({ path: '/tmp/en_export.png' });
  await b.close(); })();
