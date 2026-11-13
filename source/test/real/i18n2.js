const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  await p.route(/^(?!file).*/, r => r.abort());
  p.on('pageerror', e => console.log('ERR', e.stack.split('\n').slice(0,3).join(' | ')));
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('rbLang', 'en'); }); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 'a.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(500);
  const all = new Set();
  const grab = async () => (await p.evaluate(() => I18N.missing())).forEach(x => all.add(x));
  const closeAll = async () => { await p.evaluate(() => { document.querySelector('#modalBg').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); }); };
  for (const a of ['settings', 'stages', 'marks', 'alt', 'meas', 'ctl', 'help', 'report']) {
    await p.evaluate(a => document.querySelector('#moreMenu [data-act="' + a + '"]').click(), a); await p.waitForTimeout(500); await grab();
    if (a === 'settings') { await p.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); }); await grab(); }
    await p.screenshot({ path: '/tmp/en_' + a + '.png' }); await p.keyboard.press('Escape'); await closeAll();
  }
  for (const id of ['#bExport', '#bGen', '#bDraw']) { await p.evaluate(i => document.querySelector(i).click(), id); await p.waitForTimeout(500); await grab(); await p.screenshot({ path: '/tmp/en_' + id.slice(1) + '.png' }); await p.keyboard.press('Escape'); await closeAll(); }
  fs.writeFileSync('/tmp/missing.json', JSON.stringify([...all], null, 1)); console.log(all.size);
  await b.close(); })();
