const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1000, height: 900 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/(data\.geopf\.fr\/(wfs|tms)|tiles\.openfreemap\.org)).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/home/claude/scan/seg.gpx', 'utf8')); await p.waitForTimeout(500);
  const run = async (a, c) => { await p.click('#bGen'); await p.waitForTimeout(300); await p.selectOption('#gsT', a); await p.selectOption('#gsN', c);
    if (c === 'ign' && a === 'ign') console.log('hint', await p.innerText('#gsH')); else console.log('hint', await p.innerText('#gsH'));
    await p.screenshot({ path: '/tmp/gen_dialog.png' }); await p.click('#modal .mbtn.primary');
    await p.waitForFunction(() => !/Génération du roadbook/.test(document.querySelector('#modal h2').innerText) || !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 }); await p.waitForSelector('#modal h2:has-text("rapport")', { timeout: 20000 }); await p.screenshot({ path: '/tmp/gen_rapport.png' }); await p.context().grantPermissions(['clipboard-read','clipboard-write']); await p.click('#modal .mbtn:has-text("Copier")'); await p.waitForTimeout(300); console.log('btn', await p.innerText('#modal .mf')); console.log('CLIP', await p.evaluate(() => navigator.clipboard.readText())); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#modal .mbtn:has-text("Enregistrer")')]); console.log('DL', dl.suggestedFilename()); console.log('modalopen', await p.isVisible('#modal h2')); await p.click('#modal .mbtn.primary'); await p.waitForTimeout(500);
    const gpx = await p.evaluate(() => window.__rb.buildGPX(() => {}, false)); console.log((gpx.match(/<desc>[^<]*/) || [''])[0]);
    return await p.evaluate(() => ({ n: window.__rb.S.notes.length, src: window.__rb.S.dataSrc, srcN: window.__rb.S.dataSrcN, })); };
  console.log(JSON.stringify(await run('ign', 'vt')));

  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
