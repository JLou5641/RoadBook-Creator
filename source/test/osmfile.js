// Enregistrer les chemins dans un fichier, vider la mémoire, recharger le fichier, régénérer sans téléchargement
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const db = mock.load(path.join(__dirname, 'north-bayreuth.json'));
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 800 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let calls = 0;
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { calls++; const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  console.log('sélecteur de dossier disponible :', await page.evaluate(() => typeof window.showSaveFilePicker));
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate()); const n1 = await page.evaluate(() => window.__rb.S.notes.length);
  console.log('1re génération : requêtes', calls, 'notes', n1);
  // enregistrement (on simule le cas sans sélecteur → téléchargement)
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  const dl = page.waitForEvent('download');
  await page.click('#bMore'); await page.click('[data-act=saveOsm]');
  const d = await dl; const f = path.join(__dirname, 'chemins.rbosm'); await d.saveAs(f);
  console.log('fichier :', d.suggestedFilename(), (fs.statSync(f).size / 1024).toFixed(0) + ' Ko');
  // vider la mémoire
  await page.click('#bMore'); await page.click('[data-act=settings]'); await page.click('#sClear'); await page.waitForTimeout(300); await page.keyboard.press('Escape');
  calls = 0; await page.evaluate(() => window.__rb.generate()); console.log('après vidage : requêtes', calls, '(doit retélécharger)');
  await page.click('#bMore'); await page.click('[data-act=settings]'); await page.click('#sClear'); await page.waitForTimeout(300); await page.keyboard.press('Escape');
  // rechargement du fichier puis génération
  await page.setInputFiles('#fileIn', f); await page.waitForTimeout(800);
  console.log('message :', await page.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).pop()));
  await page.reload(); await page.waitForTimeout(500);
  calls = 0; await page.evaluate(() => window.__rb.generate()); const n2 = await page.evaluate(() => window.__rb.S.notes.length);
  console.log('après chargement du fichier + rechargement page : requêtes', calls, 'notes', n2, n2 === n1 ? '(identique)' : '(DIFFÉRENT)');
  console.log(errs.join('\n') || 'aucune erreur JS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
