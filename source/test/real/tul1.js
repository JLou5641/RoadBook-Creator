const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const [dbFile, gpxFile] = process.argv.slice(2);
const db = mock.load(path.join(__dirname, dbFile));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, gpxFile), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 }); await page.waitForTimeout(500);
  const id = await page.evaluate(() => { const n = window.__rb.S.notes.find(n => n.kind === 'junction' && n.tulip && (n.tulip.others || []).length >= 3); return n.id; });
  await page.evaluate(id => window.__rb.tulipEditor(window.__rb.S.notes.find(n => n.id === id)), id); await page.waitForTimeout(300);
  console.log('traits', await page.$$eval('#tulOv path[data-k]', e => e.length));
  await page.screenshot({ path: '/home/claude/out/apercu-editeur-tulipe.png' });
  const box = async sel => { const b = await (await page.$(sel)).boundingBox(); return b; };
  const centre = async el => { const b = await el.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const n0 = await page.evaluate(id => { const n = window.__rb.S.notes.find(n => n.id === id); return { o: n.tulip.others.length, c0: n.tulip.others[0].c, p0: JSON.stringify(n.tulip.others[0].p[0]) }; }, id);
  // choisir le 1er trait : cliquer sur son milieu
  const hits = await page.$$('#tulOv path[data-k]'); let mid = null;
  for (const h of hits) { const k = await h.getAttribute('data-k'); if (k === 'r') continue; const len = await h.evaluate(p => p.getTotalLength());
    for (const f of [0.05,0.15,0.25,0.35,0.45,0.55,0.65,0.75,0.85,0.95]) { mid = await h.evaluate((p, l) => { const q = p.getPointAtLength(l), m = p.getScreenCTM(); return [q.x * m.a + m.e, q.y * m.d + m.f]; }, len * f);
      await page.mouse.click(mid[0], mid[1]); await page.waitForTimeout(100); if (await page.$eval('#tulTypes', e => e.style.display !== 'none') && await page.$eval('#tulHint', e => /Trait choisi/.test(e.textContent))) break; mid = null; }
    if (mid) break; }
  console.log('poignées', await page.$$eval('#tulOv circle', e => e.length));
  await page.click('#tulBar [data-t="road"]'); await page.waitForTimeout(100);
  // glisser le 1er point
  const h0 = (await page.$$('#tulOv circle'))[0]; const [hx, hy] = await centre(h0);
  await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(hx + 30, hy + 20, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(100);
  console.log('apres glisser', await page.$eval('#tulOv circle', e => e.getAttribute('cx') + ',' + e.getAttribute('cy')), 'avant', Math.round(hx), Math.round(hy));
  // ajouter un point sur le trait (clic sur le trait déjà choisi)
  const cnt1 = await page.$$eval('#tulOv circle', e => e.length);
  await page.mouse.click(mid[0] + 0, mid[1] + 0); await page.waitForTimeout(100);
  const cnt2 = await page.$$eval('#tulOv circle', e => e.length);
  console.log('poignées avant/après ajout', cnt1, cnt2);
  // nouveau trait
  await page.click('#tulNew'); const hb = await page.$eval('#tulHost', e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width]; });
  await page.mouse.click(hb[0] + hb[2] * .2, hb[1] + hb[2] * .2); await page.mouse.click(hb[0] + hb[2] * .35, hb[1] + hb[2] * .3); await page.click('#tulBar [data-t="trail"]'); await page.click('#tulNew'); await page.waitForTimeout(100);
  await page.screenshot({ path: '/home/claude/out/apercu-editeur-tulipe-2.png' });
  await page.click('.mbtn.primary'); await page.waitForTimeout(200);
  console.log('confirmation', (await page.innerText('.modal h2')));
  await page.click('.mbtn:has-text("Retour")'); await page.waitForTimeout(200);
  console.log('retour éditeur', await page.$$eval('#tulOv path[data-k]', e => e.length));
  await page.click('.mbtn.primary'); await page.waitForTimeout(200); await page.click('.mbtn.primary:has-text("Appliquer")'); await page.waitForTimeout(300);
  const n1 = await page.evaluate(id => { const n = window.__rb.S.notes.find(n => n.id === id); return { o: n.tulip.others.length, c0: n.tulip.others[0].c, p0: JSON.stringify(n.tulip.others[0].p[0]), ed: n.tulipEdited, edited: n.edited, np: n.tulip.others[0].p.length }; }, id);
  console.log('avant', JSON.stringify(n0), 'après', JSON.stringify(n1));
  // revenir à l'automatique
  await page.evaluate(id => window.__rb.tulipEditor(window.__rb.S.notes.find(n => n.id === id)), id); await page.waitForTimeout(200);
  console.log('bouton revenir', await page.$$eval('.mbtn:has-text("Revenir")', e => e.length));
  await page.click('.mbtn:has-text("Revenir")'); await page.waitForTimeout(200); await page.click('.mbtn.danger:has-text("Revenir")'); await page.waitForTimeout(1500);
  console.log('après retour', await page.evaluate(id => { const n = window.__rb.S.notes.find(n => n.id === id); return { o: n.tulip.others.length, ed: n.tulipEdited }; }, id));
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})();
