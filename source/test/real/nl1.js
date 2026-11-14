const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); p.on('console', m => console.log('C', m.text())); p.on('pageerror', e => { if (!/LatLng/.test(e.message)) console.log('ERR', e.message); }); await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  console.log('select réglage absent:', await p.evaluate(() => { document.querySelector('.mhd[data-g="cfg"]').click(); document.querySelector('#moreMenu [data-act="settings"]').click(); return !document.querySelector('#sNoteLang'); }));
  await p.evaluate(() => { const m = document.querySelector('#modalBg'); m && m.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await p.evaluate(() => { __rb.S.notes = [{ id: 1, s: 10, lat: 45, lon: 2, text: 'Lég. à D\nsur piste', auto: true, edited: false, kind: 'junction', cap: 10 }, { id: 2, s: 20, lat: 45, lon: 2, text: 'Mon texte', auto: true, edited: true, kind: 'junction', cap: 10 }, { id: 3, s: 30, lat: 45, lon: 2, text: 'Hors piste', auto: true, edited: false, kind: 'junction', cap: 10 }]; });
  console.log(await p.evaluate(() => [I18N.lang, typeof renderAll, typeof S, __rb.S.notes.length].join()));
  for (const l of ['en', 'fr', 'en']) { await p.evaluate(l => I18N.set(l), l); await p.waitForTimeout(200); console.log(l, await p.evaluate(() => JSON.stringify(__rb.S.notes.map(n => n.text)))); }
  console.log(await p.evaluate(() => ['Église à D','Station-service à G','Danger : glissant à D','Antenne à G','Longer haie à D','Château d\'eau','Épingle à G'].map(t => t + ' => ' + __rb.trNote(t, 'en')).join(' | ')));
  await b.close(); })();
