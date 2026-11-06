const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [a, b, out, ...ss] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 700, height: 900 } });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  const A = JSON.parse(fs.readFileSync(a)), B = JSON.parse(fs.readFileSync(b));
  const pick = (N, s) => N.reduce((x, n) => !x || Math.abs(n.s - s) < Math.abs(x.s - s) ? n : x, null);
  const html = await page.evaluate(([A, B, ss]) => ss.map(s => { const f = N => N.reduce((x, n) => !x || Math.abs(n.s - s) < Math.abs(x.s - s) ? n : x, null); const a = f(A), b = f(B);
    return `<div style="font:12px sans-serif;margin:6px 0"><b>${(s / 1000).toFixed(2)} km</b><br><div style="display:inline-block;width:200px;vertical-align:top">${window.__rb.tulipSVG(a.tulip, 180)}<br>rapide : ${a.text.replace(/\n/g, ' / ')}</div><div style="display:inline-block;width:200px;vertical-align:top;margin-left:20px">${window.__rb.tulipSVG(b.tulip, 180)}<br>détaillé : ${b.text.replace(/\n/g, ' / ')}</div></div>`; }).join(''), [A, B, ss.map(Number)]);
  const p2 = await browser.newPage({ viewport: { width: 480, height: 600 } }); await p2.setContent(`<body style="background:#ccc;margin:6px">${html}</body>`);
  await p2.screenshot({ path: out, fullPage: true }); await browser.close();
})();
