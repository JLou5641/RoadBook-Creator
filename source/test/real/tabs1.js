const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 520, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 'a.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(500);
  await p.evaluate(() => { const R = window.__rb; R.S.notes = [{ id: 'n1', s: 500, lat: R.S.ll[20][0], lon: R.S.ll[20][1], text: 'Contrôle horaire\nbarrière', kind: 'info', wp: { type: 'ch', limit: 25 }, tulip: null, auto: false }]; R.renderAll(); R.editNote('n1'); });
  await p.waitForTimeout(400);
  for (const t of [0, 1, 2, 3]) { await p.click(`#enTabs button[data-t="${t}"]`); await p.waitForTimeout(150); await p.screenshot({ path: `/home/claude/out/apercu-onglet${t}.png` }); }
  // enregistrement : le waypoint doit être conservé
  await p.click('.mbtn.primary, .btn.primary >> nth=-1').catch(() => {});
  const r = await p.evaluate(() => window.__rb.S.notes[0].wp); console.log(JSON.stringify(r), 'erreurs', errs.join('|') || 0); await b.close(); })();
