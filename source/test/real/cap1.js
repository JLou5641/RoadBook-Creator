const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  await p.route(/^(?!file).*/, r => r.abort()); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 'a.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(400);
  await p.evaluate(() => { const R = window.__rb, ll = R.S.ll; R.S.notes = [
    { id: 1, s: 300, lat: ll[10][0], lon: ll[10][1], text: 'À droite', kind: 'bend', tulip: { route: [{ p: [0, 0], c: 'trail' }, { p: [0, -30], c: 'trail' }] }, cap: 247, showCap: true, auto: true },
    { id: 2, s: 900, lat: ll[30][0], lon: ll[30][1], text: 'À droite\nRoute D 976', kind: 'info', tulip: { route: [{ p: [0, 0], c: 'road' }, { p: [0, -30], c: 'road' }] }, cap: 120, showCap: true, auto: true }]; });
  const caps = () => p.evaluate(() => [...document.querySelectorAll('#rb .cap')].map(e => e.textContent));
  console.log('départ', await caps());
  const setMode = async v => { await p.evaluate(() => document.querySelector('#moreMenu [data-act="settings"]').click()); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true)); await p.selectOption('#sCapMode', v);
    if (v === 'hp') await p.screenshot({ path: '/tmp/cap_set.png' });
    await p.evaluate(() => [...document.querySelectorAll('#modal button')].find(b => /Enregistrer|Save/.test(b.textContent)).click()); await p.waitForTimeout(400); };
  for (const m of ['hp', 'off', 'all']) { await setMode(m); console.log(m, await caps(), await p.evaluate(() => window.__rb.S.stale)); }
  await b.close(); })();
