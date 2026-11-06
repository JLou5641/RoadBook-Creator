const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/data\.geopf\.fr).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.setInputFiles('#fileIn', '/mnt/user-data/uploads/458e641c-1er_trac__RB_MORVAN.json'); await p.waitForTimeout(1500);
  await p.setInputFiles('#fileIn', '/mnt/user-data/uploads/d628998c-chemins-osm-2026-11-06.rbosm'); await p.waitForTimeout(4000);
  const gen = async () => { await p.click('#bGen'); await p.waitForFunction(() => !document.querySelector('#modalBg.show'), null, { timeout: 170000 }).catch(() => {}); await p.waitForTimeout(800); return p.evaluate(() => window.__rb.S.notes.length); };
  const res = {};
  for (const [y, t] of [[0, 1], [0, 0], [1, 1]]) { await p.evaluate(([y, t]) => { window.__rb.S.settings.mixY = !!y; window.__rb.S.settings.mixT = !!t; }, [y, t]); res[y + '' + t] = await gen(); }
  console.log(res);
  await p.evaluate(() => window.__rb.openSettings()); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('#sMixY').scrollIntoView());
  await p.screenshot({ path: '/tmp/mix_set.png' }); console.log('erreurs', errs.join('|') || 0); await b.close(); })();
