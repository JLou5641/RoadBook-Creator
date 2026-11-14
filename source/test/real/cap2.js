const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
  await p.route(/^(?!file).*/, r => r.abort()); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 'a.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(400);
  await p.evaluate(() => { const R = window.__rb, ll = R.S.ll; R.S.notes = [
    { id: 1, s: 300, lat: ll[10][0], lon: ll[10][1], text: 'À droite', kind: 'info', tulip: null, cap: 27, showCap: true, auto: true },
    { id: 2, s: 900, lat: ll[30][0], lon: ll[30][1], text: 'Serrer à G', kind: 'info', tulip: null, cap: 112, showCap: false, auto: true },
    { id: 3, s: 1500, lat: ll[50][0], lon: ll[50][1], text: 'TD', kind: 'info', tulip: null, cap: 5, showCap: false, auto: true }]; R.save && R.save(); });
  await p.evaluate(() => document.querySelector('#bRender, #bGen') && 0);
  await p.evaluate(() => window.__rb.renderRoadbook ? window.__rb.renderRoadbook() : window.__rb.renderAll());
  await p.waitForTimeout(300);
  const info = () => p.evaluate(() => [...document.querySelectorAll('#rb .cap')].map(e => [e.textContent, e.className, Math.round(e.getBoundingClientRect().width)]));
  console.log(await info()); await p.screenshot({ path: '/tmp/cap2_a.png' });
  const els = await p.$$('#rb .cap'); await els[1].click(); await p.waitForTimeout(450);
  console.log('après clic sur 112 :', await info(), 'showCap=', await p.evaluate(() => window.__rb.S.notes[1].showCap));
  await els[0].click(); await p.waitForTimeout(450); console.log('après clic sur 27 :', await p.evaluate(() => window.__rb.S.notes[0].showCap));
  await els[2].dblclick(); await p.waitForTimeout(500); console.log('mesure ouverte :', await p.evaluate(() => document.querySelector('#measBox').classList.contains('show')), 'showCap note3 =', await p.evaluate(() => window.__rb.S.notes[2].showCap));
  await b.close(); })();
