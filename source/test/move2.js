const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const [dbFile, gpxFile] = process.argv.slice(2);
const db = mock.load(path.join(__dirname, dbFile));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const L = fs.readFileSync(path.join(__dirname, 'runreal.js'), 'utf8').split('\n')[7];
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.answer ? mock.answer(db, body) : mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, gpxFile), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__rb.S.settings.showRoad = false; window.__rb.generate(); });
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 }); await page.waitForTimeout(500);
  const list = () => page.evaluate(() => window.__rb.S.notes.map((n, i) => `${i + 1}@${Math.round(n.s)} ${n.text.replace(/\n/g, '/')}`));
  console.log((await list()).slice(0, 12).join('\n'));
  // note source = 3e ; cible = position de la 6e
  const ids = await page.evaluate(() => window.__rb.S.notes.map(n => n.id));
  const src = ids[2], dst = ids[5];
  const px = async id => page.evaluate(id => { const R = window.__rb, n = R.S.notes.find(x => x.id === id), p = R.map.latLngToContainerPoint([n.lat, n.lon]), r = document.querySelector('#map').getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }, id);
  await page.evaluate(([a, b]) => { const R = window.__rb; const n = R.S.notes.find(x => x.id === b); R.map.setView([n.lat, n.lon], 14); }, [src, dst]); await page.waitForTimeout(500);
  const attendu = await page.evaluate(id => window.__rb.S.notes.find(x => x.id === id).text, dst);
  let [x, y] = await px(src); await page.mouse.click(x, y); await page.waitForTimeout(300);
  const mode = process.argv[4] || 'jn'; let [tx, ty] = await px(dst);
  if (mode === 'off') { const q = await page.evaluate(id => { const R = window.__rb, n = R.S.notes.find(x => x.id === id), s = n.s + 70, p = R.S.ll[Math.round(R.S.ll.length * s / R.T.L)], c = R.map.latLngToContainerPoint(p), r = document.querySelector('#map').getBoundingClientRect(); return [r.left + c.x, r.top + c.y]; }, dst); tx = q[0]; ty = q[1]; }
  console.log('src visible', x > 0 && x < 1400 && y > 0 && y < 900, 'cible', tx | 0, ty | 0);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move((x + tx) / 2, (y + ty) / 2, { steps: 8 }); await page.mouse.move(tx + 2, ty + 2, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(500);
  console.log((await page.innerText('.modal')).replace(/\s+/g, ' ').slice(0, 160));
  await page.click('.mbtn.primary'); await page.waitForTimeout(1500);
  console.log('toast', await page.$eval('#toast', e => e.textContent));
  console.log('attendu (texte de l’ancienne note cible)', JSON.stringify(attendu));
  console.log('affichage', await page.evaluate(() => window.__rb.S.notes.map(n => n.moved + '/' + n.auto + ':' + window.__rb.noteView(n).lines.join('|')).slice(2, 7).join('  ;  ')));
  console.log(await page.evaluate(() => window.__rb.S.notes.map((n, i) => `${i + 1}@${Math.round(n.s)} auto=${n.auto} ${n.text.replace(/\n/g, '/')}`).slice(0, 10).join('\n')));
  await page.screenshot({ path: '/home/claude/out/apercu-deplacer-regenere.png' });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})();
