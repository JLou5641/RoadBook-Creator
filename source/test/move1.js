const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/tile\.|arcgis|geopf|opentopomap|cyclosm|brouter|openstreetmap\.de|overpass|openfreemap/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await page.waitForTimeout(500);
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(600);
  await page.evaluate(() => { const R = window.__rb, S = R.S; const ls = R.bendList(30, 30, 30);
    S.notes = [ls[3], ls[9], ls[15]].map((bd, i) => { const p = S.ll[Math.round(S.ll.length * bd.s / 30230)]; return { id: 10 + i, s: bd.s, lat: p[0], lon: p[1], text: 'À D', cap: 50, showCap: true, kind: 'manual', tulip: { arms: [], R: 50 }, danger: 0 }; });
    S.sel = null; R.renderAll(); R.map.setView([S.notes[1].lat, S.notes[1].lon], 15); }); await page.waitForTimeout(500);
  const info = () => page.evaluate(() => window.__rb.S.notes.map(n => n.id + ':' + n.s).join(' '));
  console.log('avant', await info());
  const pos = async id => page.evaluate(id => { const R = window.__rb, n = R.S.notes.find(x => x.id === id), p = R.map.latLngToContainerPoint([n.lat, n.lon]), r = document.querySelector('#map').getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }, id);
  // 1) glisser sans sélection : rien ne bouge
  let [x, y] = await pos(11);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y + 5, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
  console.log('sans sélection → modale ?', await page.$$eval('.modal', e => e.length), '| notes', await info());
  // 2) clic = sélection, puis glisser le long de la trace
  [x, y] = await pos(11); await page.mouse.click(x, y); await page.waitForTimeout(300);
  console.log('sélection', await page.evaluate(() => window.__rb.S.sel));
  const tgt = await page.evaluate(() => { const R = window.__rb, n = R.S.notes.find(x => x.id === 11), q = R.T && R.map.latLngToContainerPoint([n.lat, n.lon]); const s = n.s + 120, ps = R.S.ll[Math.round(R.S.ll.length * s / 30230)], c = R.map.latLngToContainerPoint(ps), r = document.querySelector('#map').getBoundingClientRect(); return [r.left + c.x, r.top + c.y]; });
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move((x + tgt[0]) / 2, (y + tgt[1]) / 2, { steps: 6 }); await page.mouse.move(tgt[0], tgt[1], { steps: 6 }); console.log('bulle', await page.$eval('#dragTip', e => e.textContent)); await page.screenshot({ path: '/home/claude/out/apercu-bulle-deplacement.png', clip: { x: 200, y: 150, width: 700, height: 500 } }); await page.mouse.up(); await page.waitForTimeout(400);
  console.log('modale', (await page.innerText('.modal')).replace(/\s+/g, ' ').slice(0, 200));
  await page.screenshot({ path: '/home/claude/out/apercu-deplacer-note.png' });
  // 3) annuler : la note revient
  await page.click('.mbtn:has-text("Annuler")'); await page.waitForTimeout(300);
  console.log('après annuler', await info());
  // 4) refaire et valider
  [x, y] = await pos(11);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(tgt[0], tgt[1], { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400);
  await page.click('.mbtn.primary'); await page.waitForTimeout(400);
  console.log('après valider', await info(), '| texte', await page.evaluate(() => window.__rb.S.notes.find(n => n.id === 11).text));
  await page.screenshot({ path: '/home/claude/out/apercu-deplacer-note-fait.png' });
  await page.click('#toast button'); await page.waitForTimeout(300);
  console.log('après annuler le déplacement', await info());
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})();
