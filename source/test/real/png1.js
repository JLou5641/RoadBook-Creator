const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1000, height: 900 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/(data\.geopf\.fr\/(wfs|tms)|tiles\.openfreemap\.org)).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(500);
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/home/claude/scan/seg.gpx', 'utf8')); await p.waitForTimeout(500);
  await p.click('#bGen'); await p.waitForTimeout(300); await p.selectOption('#gsT', 'ign'); await p.selectOption('#gsN', 'vt'); await p.click('#modal .mbtn.primary');
  await p.waitForSelector('#modal h2:has-text("rapport")', { timeout: 280000 }); await p.click('#modal .mbtn.primary');
  const r = await p.evaluate(async () => { const out = []; const ns = window.__rb.S.notes.filter(n => n.tulip).slice(3, 8);
    for (const n of ns) { const svg = window.__rb.tulipSVG(n.tulip, 300, n.sym); const a = await window.__rb.svgToPNG(svg, 300, 300);
      const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300); x.drawImage(img, 0, 0, 300, 300); const o = c.toDataURL('image/png'); out.push({ pal: a, full: o }); }
    return out; });
  r.forEach((x, i) => { console.log(i, 'palette', Math.round(x.pal.length * .75), 'plein', Math.round(x.full.length * .75)); fs.writeFileSync(`/tmp/t${i}_pal.png`, Buffer.from(x.pal.split(',')[1], 'base64')); fs.writeFileSync(`/tmp/t${i}_full.png`, Buffer.from(x.full.split(',')[1], 'base64')); });
  console.log('erreurs', errs.join('|') || 0); await b.close(); })();
