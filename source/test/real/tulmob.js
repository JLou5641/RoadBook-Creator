const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/data\.geopf\.fr).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.setInputFiles('#fileIn', '/mnt/user-data/uploads/458e641c-1er_trac__RB_MORVAN.json'); await p.waitForTimeout(1800);
  await p.evaluate(() => { const n = window.__rb.S.notes.find(x => x.tulip && x.tulip.others && x.tulip.others.length > 1); window.__rb.tulipEditor(n); }); await p.waitForTimeout(600);
  await p.screenshot({ path: '/tmp/tulmob.png' });
  console.log(await p.evaluate(() => { const m = document.querySelector('.tulmodal'); const r = m.getBoundingClientRect(); return JSON.stringify({ h: r.height, top: r.top, sh: m.scrollHeight, ch: m.clientHeight, btns: [...m.querySelectorAll('#tulBar button')].map(x => x.id + ':' + Math.round(x.getBoundingClientRect().top)) }); }));
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
