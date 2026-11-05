// Symboles du lexique FIA : choix dans la fenêtre d'une note, affichage dans la 3e case, impression et export GPX
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await page.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  await page.evaluate(() => document.querySelectorAll('#toast div').forEach(d => d.remove()));
  // 1. fenêtre de la note 51 : ouvrir la liste, choisir « Sur la piste » › Bosse, Fossé ; chercher « pont » › Sous un pont
  const N = 50;
  await page.evaluate(i => document.querySelectorAll('#rb .row')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), N); await page.waitForTimeout(200);
  await page.click('#eLexOpen'); await page.click('#eLexTabs button[data-c="Sur la piste"]');
  await page.click('#eLexGrid button[data-k="bump"]'); await page.click('#eLexGrid button[data-k="ditch"]');
  await page.fill('#eLexQ', 'clotu'); await page.waitForTimeout(100);
  const found = await page.$$eval('#eLexGrid button', b => b.map(x => x.dataset.k));
  await page.click('#eLexGrid button[data-k="fencegate"]');
  await page.fill('#eLexQ', ''); await page.click('#eLexTabs button[data-c="Abréviations"]'); await page.click('#eLexGrid button[data-k="kpL"]');
  await page.click('#eLexGrid button[data-k="kpL"]'); await page.click('#eLexGrid button[data-k="kpL"]');      // retirer puis remettre
  await page.click('#eLexTabs button[data-c="Sur la piste"]'); await page.waitForTimeout(150);
  const modal = await page.$('.modal'); await page.$eval('.modal', m => { m.scrollTop = 0; });
  await modal.screenshot({ path: '/tmp/lex_dialog.png' });
  console.log('recherche « clotu » :', found.join(', '));
  await page.click('.mbtn.primary'); await page.waitForTimeout(300);
  console.log('note enregistrée :', JSON.stringify(await page.evaluate(i => window.__rb.S.notes[i].lex, N)));
  // 2. d'autres notes avec des symboles (texte long, danger, CAP) pour vérifier la place dans la 3e case
  await page.evaluate(() => {
    const S = window.__rb.S;
    S.notes[51].lex = ['tree', 'CX']; S.notes[52].lex = ['hole', 'onbridge', 'eline']; S.notes[52].danger = 2;
    S.notes[53].lex = ['fence', 'kpR']; S.notes[54].lex = ['wading']; S.notes[54].danger = 1;
  });
  await page.evaluate(i => document.querySelectorAll('#rb .row')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 0); await page.waitForTimeout(150); await page.click('.mbtn:not(.primary):not(.danger)'); await page.waitForTimeout(150);
  await page.evaluate(() => window.__rb.S.notes.length && document.querySelector('#rbName').dispatchEvent(new Event('input')));
  await page.evaluate(i => document.querySelectorAll('#rb .row')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 54); await page.waitForTimeout(150); await page.click('.mbtn.primary'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; document.querySelectorAll('#toast div').forEach(d => d.remove()); });
  await page.waitForTimeout(300);
  const rows = await page.$$('#rb .row');
  await page.setViewportSize({ width: 1500, height: 1300 }); await rows[N - 1].evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
  const bx = await Promise.all(rows.slice(N - 1, N + 5).map(r => r.boundingBox()));
  const y0 = Math.min(...bx.map(x => x.y)), y1 = Math.max(...bx.map(x => x.y + x.height));
  await page.screenshot({ path: '/tmp/lex_rows.png', clip: { x: bx[0].x - 3, y: y0 - 3, width: bx[0].width + 6, height: y1 - y0 + 6 } });
  // contrôle : les symboles ne débordent pas de la 3e case et ne passent pas sous le CAP
  const chk = await page.evaluate(([a, b]) => [...document.querySelectorAll('#rb .row')].slice(a, b).map((r, i) => {
    const k3 = r.querySelector('.k3').getBoundingClientRect(), lx = r.querySelector('.lx'), cap = r.querySelector('.cap');
    if (!lx) return null; const L = lx.getBoundingClientRect(), C = cap && cap.getBoundingClientRect();
    return { note: a + i + 1, dans: L.right <= k3.right + 0.5 && L.bottom <= k3.bottom + 0.5, sousCap: !!C && L.bottom > C.top + 0.5 };
  }).filter(Boolean), [N - 1, N + 5]);
  console.log('3e case :', JSON.stringify(chk));
  // 3. impression et export GPX
  const gpx = await page.evaluate(() => window.__rb.buildGPX()); fs.writeFileSync(path.join(__dirname, 'lex.gpx'), gpx);
  const pngs = [...gpx.matchAll(/<openrally:notes><!\[CDATA\[data:image\/png;base64,([A-Za-z0-9+/=]+)\]\]><\/openrally:notes>/g)].map(m => m[1]);
  console.log('images de notes dans le GPX :', pngs.length);
  if (pngs[N]) fs.writeFileSync('/tmp/lex_note_export.png', Buffer.from(pngs[N], 'base64'));
  if (pngs[N + 2]) fs.writeFileSync('/tmp/lex_note_export2.png', Buffer.from(pngs[N + 2], 'base64'));
  await page.evaluate(() => { window.print = () => {}; document.querySelector('#bPrint').click(); }); await page.waitForTimeout(400);
  await page.emulateMedia({ media: 'print' }); await page.pdf({ path: path.join(__dirname, 'lex.pdf'), format: 'A4', printBackground: true });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
