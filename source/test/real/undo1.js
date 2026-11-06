const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/data\.geopf\.fr).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.setInputFiles('#fileIn', '/mnt/user-data/uploads/458e641c-1er_trac__RB_MORVAN.json'); await p.waitForTimeout(1500);
  const st = () => p.evaluate(() => ({ n: window.__rb.S.notes.length, t: window.__rb.S.notes[3].text, dis: document.querySelector('#bUndo').disabled }));
  console.log('départ', JSON.stringify(await st()));
  const id = await p.evaluate(() => window.__rb.S.notes[3].id);
  for (const txt of ['AAA', 'BBB']) { await p.evaluate(id => window.__rb.editNote(id), id); await p.waitForTimeout(300); await p.fill('#eText', txt); await p.click('.mbtn.primary'); await p.waitForTimeout(900); }
  console.log('après 2 modifs', JSON.stringify(await st()));
  await p.click('#bUndo'); await p.waitForTimeout(800); console.log('annuler 1', JSON.stringify(await st()));
  await p.click('#bUndo'); await p.waitForTimeout(800); console.log('annuler 2', JSON.stringify(await st()));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(500); console.log('Ctrl+Z (rien)', JSON.stringify(await st()));
  // suppression d'une note puis annuler
  await p.evaluate(id => window.__rb.S.notes.splice(5, 1) && window.__rb.renderAll(), id); await p.waitForTimeout(800);
  console.log('après suppr', (await st()).n); await p.keyboard.press('Control+z'); await p.waitForTimeout(800); console.log('Ctrl+Z', (await st()).n);
  await p.screenshot({ path: '/tmp/undo.png' });
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
