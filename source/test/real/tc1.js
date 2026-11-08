const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/(data\.geopf\.fr\/(wfs|tms)|tiles\.openfreemap\.org)).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/home/claude/scan/seg.gpx', 'utf8')); await p.waitForTimeout(500);
  await p.evaluate(() => window.__rb.generate());
  await p.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
  await p.waitForFunction(() => !/Génération/.test(document.querySelector('#modal').innerText) || !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
  const gpx = await p.evaluate(async () => {
    const N = window.__rb.S.notes; const mk = (i, type, limit) => { N[i].wp = { type, limit, speed: 30 }; };
    mk(5, 'dss', 25); mk(10, 'dt', 40); mk(15, 'dn', 12); mk(20, 'dss'); mk(25, 'ass', 9); mk(30, 'ch', 15);
    return await window.__rb.buildGPX(() => {}, false);
  });
  const w = [...gpx.matchAll(/<wpt[\s\S]*?<\/wpt>/g)].map(m => m[0]).filter(x => /openrally:(dss|dt|dn|neutralization|ass|checkpoint)/.test(x));
  for (const x of w) console.log((x.match(/openrally:(dss|dt|dn|ass|checkpoint)/) || [])[1], '|', (x.match(/<openrally:(dss|dt|dn|ass|checkpoint|timecontrol|speed|neutralization)[^>]*>/g) || []).join(' '));
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
