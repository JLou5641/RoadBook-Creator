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
    const N = window.__rb.S.notes; let i = 3;
    for (const t of ['wpv','wpm','wps','wpe','wpc','wpn','wpp','cp','ch','dss','ass','dn','fn','dt','ft']) N[i++].wp = { type: t, limit: 10, dur: 5, speed: 50 };
    N[i++].zone = { type: 'dz', speed: 70 }; N[i++].zone = { type: 'fz' }; N[i++].zone = { type: 'fzdz', speed: 60 }; N[i++].fuel = true;
    return await window.__rb.buildGPX(() => {}, false);
  });
  const w = [...gpx.matchAll(/<wpt[\s\S]*?<\/wpt>/g)].map(m => m[0]);
  const order = ['wpv','wpm','wps','wpe','wpc','wpn','wpp','cp','ch','dss','ass','dn','fn','dt','ft','dz','fz','fzdz','fuel'];
  order.forEach((t, k) => { const x = w[3 + k]; console.log(t.padEnd(6), (x.match(/<openrally:(?!tulip|notes|distance|cap|danger)[a-z]+[^>]*>[^<]*/g) || []).join(' ').replace(/<\/?openrally:/g, '<')); });
  await b.close(); })();
