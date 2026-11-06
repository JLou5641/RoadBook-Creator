// Case « description du roadbook » au-dessus de la 1re note : saisie, mémoire, GPX, impression, aperçu
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1.5, ignoreHTTPSErrors: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/openfreemap|data\.gouv\.fr|overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
  const url = 'file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html');
  await page.goto(url);
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(() => { window.__rb.S.settings.data = 'ign'; });
  await page.selectOption('#layerSel', 'planign');
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync('/tmp/igntest/alpes.gpx', 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 240000 });
  await page.evaluate(() => document.querySelectorAll('#toast div').forEach(d => d.remove()));
  console.log('case présente :', await page.evaluate(() => !!document.querySelector('#rb .dbox #rbDesc')), '· 1re ligne après la case :', await page.evaluate(() => document.querySelector('#rb').children[1].classList.contains('row')));
  const TXT = 'RALLYE DES CIMES — ÉTAPE 2\nChamonix · Samedi 14 novembre\nDépart du parc fermé à 08h30, premier concurrent 08h31.\nLiaison goudronnée de 12 km puis spéciale de 38 km.\nRavitaillement obligatoire au km 28 (essence uniquement).\nRespecter les limitations de vitesse dans les villages.';
  await page.fill('#rbDesc', TXT);
  await page.evaluate(() => { document.querySelector('#side').style.width = '620px'; document.querySelector('#side').style.maxWidth = '620px'; });
  await page.waitForTimeout(300);
  await (await page.$('#side')).screenshot({ path: '/home/claude/out/apercu-description.png' });
  // mémoire : rechargement
  await page.waitForTimeout(800); await page.reload(); await page.waitForTimeout(500);
  console.log('mémorisée après rechargement :', (await page.inputValue('#rbDesc')) === TXT);
  // projet
  console.log('projet contient desc :', await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('rbgen.v1')).desc.length > 20; } catch (e) { return false; } }));
  // GPX
  const gpx = await page.evaluate(() => window.__rb.buildGPX()); fs.writeFileSync('/tmp/igntest/desc_out.gpx', gpx);
  console.log('GPX metadata desc :', /<metadata>\s*<name>[^<]*<\/name>\s*<desc>RALLYE/.test(gpx));
  // impression : pages
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#bPrint'); await page.waitForTimeout(400);
  console.log('impression :', await page.evaluate(() => [...document.querySelectorAll('#print .ppage')].map(p => p.querySelectorAll('.prow').length + ' lignes' + (p.querySelector('.dbox') ? ' (dont description)' : '')).slice(0, 3).join(' · ') + ' … ' + document.querySelectorAll('#print .ppage').length + ' pages'));
  await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(300);
  await page.pdf({ path: '/home/claude/out/desc_impression.pdf', format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }, printBackground: true });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
