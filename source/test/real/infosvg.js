const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 400 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/.*/, r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file:///home/claude/build/dist/generateur-roadbook.html');
  const svgs = await p.evaluate(() => ['Entrée Chamonix-Mont-Blanc', 'Pont', 'Sortie Bourges\nLonger haie à G'].map(t => window.__rb.notesSVG({ kind: 'info', text: t, auto: true })));
  await p.setContent('<body style="margin:0;background:#ddd">' + svgs.map(s => `<div style="display:inline-block;margin:4px;border:1px solid #000">${s}</div>`).join('') + '</body>'); await p.screenshot({ path: '/tmp/igntest/infosvg.png' });
  console.log(errs.join('') || 'aucune erreur JS'); await b.close();
})();
