const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/data\.geopf\.fr).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.setInputFiles('#fileIn', '/mnt/user-data/uploads/458e641c-1er_trac__RB_MORVAN.json'); await p.waitForTimeout(1500);
  const cnt = () => p.evaluate(() => ({ why: window.__rb.S.notes.filter(n => n.why).length, btn: document.querySelectorAll('.rbr.row .acts button[data-a="why"]').length, tot: window.__rb.S.notes.length }));
  console.log('ouverture', JSON.stringify(await cnt()));
  await p.setInputFiles('#fileIn', '/mnt/user-data/uploads/d628998c-chemins-osm-2026-11-06.rbosm'); await p.waitForTimeout(4000);
  await p.click('#bGen'); await p.waitForFunction(() => !document.querySelector('#modalBg.show'), null, { timeout: 170000 }).catch(() => {}); await p.waitForTimeout(1000);
  console.log('après gén', JSON.stringify(await cnt()));
  // sauvegarde -> réouverture
  const json = await p.evaluate(() => JSON.stringify(window.__rb.S.notes.length && (() => { return localStorage.getItem(Object.keys(localStorage).find(k => /proj|rbgen\.state|rbgen\.s/.test(k) && k !== 'rbgen.dirty')); })()));
  const snap = await p.evaluate(() => localStorage.getItem('rbgen.project') || localStorage.getItem(Object.keys(localStorage).filter(k => k.startsWith('rbgen'))[0])); console.log(await p.evaluate(() => Object.keys(localStorage).join(',')));
  await p.reload(); await p.waitForTimeout(1500); console.log('après rechargement (autosave)', JSON.stringify(await cnt()));
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
