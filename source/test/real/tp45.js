const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1250, height: 560 } });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  const html = await page.evaluate(() => {
    const R = 40, mk = (exit, side, label) => {
      const route = [{ p: [0, -40], c: 'road' }, { p: [0, 0], c: 'road' }, ...exit.map(p => ({ p, c: 'road' }))];
      const t = { R, sq: false, kind: 'junction', route, others: [], wl: [], wa: [], bld: [], sp: 1, reset: true, resetSide: side };
      return `<div style="display:inline-block;margin:4px;text-align:center;font:13px sans-serif;width:195px">${window.__rb.tulipSVG(t, 190)}<br>${label}</div>`;
    };
    const ex = { droite: [[25, 0], [38, 0]], gauche: [[-25, 0], [-38, 0]], tout_droit: [[0, 25], [0, 38]], epingle_d: [[10, 6], [30, -20]] };
    let h = '';
    for (const [k, e] of Object.entries(ex)) for (const s of ['r', 'l']) h += mk(e, s, k.replace('_', ' ') + ' · côté ' + (s === 'r' ? 'droit' : 'gauche'));
    return h;
  });
  await page.setContent('<body style="margin:0;background:#ddd">' + html + '</body>'); await page.screenshot({ path: '/home/claude/out/apercu-trait-point-45.png' });
  await b.close();
})();
