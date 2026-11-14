const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message)); await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  console.log(await p.evaluate(() => ['TD','Lég. à G','À D','Épingle à D\nsur sentier','Serrer à G\nsur route D 976','Rond-point\n2e sortie\nsur piste','Virage serré à D','Hors piste','Début goudron','Danger : glissant','Longer clôture à G','Entrée Foo','Sortie agglomération','Montée raide (14 %)','Barrière (privé)','Sommet Truc (1200 m)','Col du Test (1500 m)','Fourche à D'].map(t => t.replace(/\n/g,'/') + ' => ' + __rb.trNote(t, 'en').replace(/\n/g,'/')).join('\n')));
  // dialogue réglages
  await p.evaluate(() => { document.querySelector('.mhd[data-g="cfg"]').click(); document.querySelector('#moreMenu [data-act="settings"]').click(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { __rb.S.notes = [{ id: 1, s: 10, text: 'Lég. à D\nsur piste', auto: true, edited: false, kind: 'junction', cap: 10 }, { id: 2, s: 20, text: 'Mon texte', auto: true, edited: true, kind: 'junction', cap: 10 }]; });
  console.log('select présent:', await p.evaluate(() => !!document.querySelector('#sNoteLang')));
  await p.evaluate(() => { document.querySelector('#sNoteLang').value = 'en'; });
  await p.evaluate(() => { document.querySelectorAll('.mf button')[document.querySelectorAll('.mf button').length-1].click(); });
  await p.waitForTimeout(500);
  console.log(await p.evaluate(() => JSON.stringify(__rb.S.notes.map(n => n.text)) + ' lang=' + __rb.S.settings.noteLang));
  await p.evaluate(() => { document.querySelector('.mhd[data-g="cfg"]').click(); document.querySelector('#moreMenu [data-act="settings"]').click(); }); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('#sNoteLang').value = 'fr'; document.querySelectorAll('.mf button')[document.querySelectorAll('.mf button').length-1].click(); }); await p.waitForTimeout(400);
  console.log(await p.evaluate(() => JSON.stringify(__rb.S.notes.map(n => n.text))));
  await b.close(); })();
