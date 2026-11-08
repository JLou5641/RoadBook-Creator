const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/(data\.geopf\.fr\/(wfs|tms)|tiles\.openfreemap\.org)).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/home/claude/scan/seg.gpx', 'utf8')); await p.waitForTimeout(500);
  await p.evaluate(() => window.__rb.generate());
  await p.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
  await p.waitForFunction(() => !/Génération/.test(document.querySelector('#modal').innerText) || !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 }); await p.waitForTimeout(500);
  const n0 = await p.evaluate(() => window.__rb.S.notes.length); console.log('notes', n0);
  for (const k of ['0', '1']) {
    await p.click('#bExport'); await p.waitForTimeout(400); if (k === '0') { console.log((await p.innerText('#modal')).replace(/\n+/g, ' | ')); await p.screenshot({ path: '/tmp/exp1.png' }); }
    await p.check('input[name=xgpx][value="' + k + '"]');
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 200000 }), p.click('#modal .mbtn.primary')]);
    const f = '/tmp/exp_' + k + '.gpx'; await d.saveAs(f); console.log('export', k, Math.round(fs.statSync(f).size / 1024), 'Ko', fs.readFileSync(f, 'utf8').includes('rbgen:project'));
    await p.waitForTimeout(1200);
  }
  await p.evaluate(() => { window.__rb.S.notes.length = 0; });
  await p.setInputFiles('#fileIn', '/tmp/exp_1.gpx'); await p.waitForTimeout(1500);
  console.log('notes après réimport projet', await p.evaluate(() => window.__rb.S.notes.length), n0);
  await p.setInputFiles('#fileIn', '/tmp/exp_0.gpx'); await p.waitForTimeout(1500);
  console.log('notes après réimport seul', await p.evaluate(() => window.__rb.S.notes.length));
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
