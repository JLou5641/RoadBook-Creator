const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const [dbFile, gpxFile] = process.argv.slice(2);
const db = mock.load(path.join(__dirname, dbFile));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, gpxFile), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.evaluate(() => { const R = window.__rb, N = R.S.notes;
    N[2].wp = { type: 'dss', name: '', open: 1000, clear: 200, limit: 45, speed: 50 };
    N[3].wp = { type: 'ass', name: '', open: 800, clear: 90, limit: 120 };      // limite ignorée pour l'ASS
    N[4].wp = { type: 'dt', name: '', open: 1000, clear: 90, speed: 30, limit: 25 };
    N[5].wp = { type: 'ft', name: '', open: 1000, clear: 90, limit: 8 };      // limite ignorée pour le FT
    N[6].wp = { type: 'dss', name: '', open: 1000, clear: 200 }; N[2].text = ''; N[2].lex = []; N[3].text = ''; N[3].lex = [];
    (R.renderAll || (() => {}))(); });
  await page.waitForTimeout(500);
  const el = await page.$('#roadbook, #rb, .rbpage, #list'); 
  await page.evaluate(() => { const r = document.querySelector('#rb'); r.scrollTop = 2 * 147 + 4; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/home/claude/out/apercu-temps-limite.png', clip: { x: 830, y: 70, width: 470, height: 930 } });
  const html = await page.evaluate(() => [...document.querySelectorAll('.tl')].map(e => e.textContent));
  console.log('tlim', JSON.stringify(html));
  // fenêtre d'édition d'une note DSS
  await page.evaluate(() => window.__rb.editNote(window.__rb.S.notes[2].id)); await page.waitForTimeout(300);
  console.log('champ limite visible', await page.$eval('#eLimF', e => e.style.display !== 'none'), await page.$eval('#eLim', e => e.value));
  await page.screenshot({ path: '/home/claude/out/apercu-temps-limite-fenetre.png' });
  console.log(errs.length ? errs.join('\n') : 'aucune erreur JS');
  await browser.close();
})();
