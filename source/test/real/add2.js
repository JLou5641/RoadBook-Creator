const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const [dbFile, gpxFile] = process.argv.slice(2);
const db = mock.load(path.join(__dirname, dbFile));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, gpxFile), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 }); await page.waitForTimeout(500);
  // une note avec repères (3 lignes ou plus) : on en pose une autre au même endroit (+6 m)
  const info = await page.evaluate(() => { const R = window.__rb; const i = R.S.notes.findIndex(n => n.kind === 'junction' && (n.text || '').split('\n').length >= 3); if (i < 0) return null; const n = R.S.notes[i]; return { i, id: n.id, s: n.s, text: n.text, keys: R.noteView(n).keys.join(',') }; });
  console.log('modèle', JSON.stringify(info));
  const r = await page.evaluate(async s => { const R = window.__rb; const p = R.S.ll[Math.round(R.S.ll.length * (s + 6) / R.T.L)]; await R.addManualNote({ lat: p[0], lng: p[1] }); const n = R.S.notes.find(x => x.moved); return { s: n.s, text: n.text, keys: R.noteView(n).keys.join(','), auto: n.auto, moved: n.moved }; }, info.s);
  console.log('note posée', JSON.stringify(r));
  await page.screenshot({ path: '/home/claude/out/apercu-note-meme-endroit.png' });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})();
