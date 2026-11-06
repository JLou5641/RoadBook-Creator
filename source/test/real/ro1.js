const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/.*/, r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  const out = await p.evaluate(() => {
    const T = ['À D\nsur piste\nFin goudron', 'TD\nsur route D 976\nDébut goudron', 'Suivre la route D 976', 'Suivre la piste', 'À G\nsur sentier', 'À D\nsur rue\nSortie Bourges'];
    const run = (set) => { Object.assign(window.__rb.S.settings, { showRO: true, showPI: true, showTR: true }, set); return T.map(t => { const v = window.__rb.noteView({ text: t, auto: true }); return t.replace(/\n/g, ' | ') + '  →  [' + v.keys.join(',') + '] ' + JSON.stringify(v.lines.join(' | ')); }); };
    return ['— tout affiché', ...run({}), '— route masquée', ...run({ showRO: false }), '— piste + sentier masqués', ...run({ showPI: false, showTR: false }), '— symAuto désactivé + route masquée', ...run({ showRO: false, symAuto: false })];
  });
  console.log(out.join('\n')); console.log(errs.join('\n') || 'aucune erreur JS');
  await p.evaluate(() => { Object.assign(window.__rb.S.settings, { showRO: true, showPI: true, showTR: true, symAuto: true }); window.__rb.openSettings(); }); await p.waitForTimeout(300);
  console.log('cases', await p.$$eval('#sRO,#sPI,#sTR', e => e.map(x => x.checked)));
  await p.uncheck('#sRO'); await p.click('.mbtn.primary'); await p.waitForTimeout(300);
  console.log('showRO après réglage', await p.evaluate(() => window.__rb.S.settings.showRO), errs.join('\n') || 'aucune erreur JS'); await b.close();
})();
