// L'aperçu de l'éditeur doit être identique à la vraie case : on compare la case « description » de l'éditeur à celle du roadbook
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1500, height: 1500 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await page.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  await page.evaluate(() => { document.querySelectorAll('#toast div').forEach(d => d.remove()); const n = window.__rb.S.notes[56]; n.danger = 2; n.lex = ['kpL']; });
  const IDX = [56, 53];
  for (const i of IDX) {
    // 1) la vraie case dans le roadbook
    await page.evaluate(() => { document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; });
    const rows = await page.$$('#rb .row'); await rows[i].evaluate(e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(150);
    const real = await rows[i].$('.k3'); const rb = await real.boundingBox();
    await real.screenshot({ path: `/tmp/fid_real_${i}.png` });
    // 2) la case de l'éditeur
    await page.evaluate(k => document.querySelectorAll('#rb .row')[k].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), i); await page.waitForTimeout(250);
    if (i === 56) { await page.click('#eLexOpen'); await page.click('#eLexTabs button[data-c="Sur la piste"]'); await page.click('#eLexGrid button[data-k="bump"]'); await page.evaluate(() => { document.querySelector('.modal').scrollTop = 0; }); }
    const stD = await page.$('#stD'); await stD.screenshot({ path: `/tmp/fid_edit_${i}.png` });
    const sb = await stD.boundingBox();
    // fidélité : tailles relatives de la 1re ligne (texte) mesurées dans les deux
    const m = await page.evaluate(() => { const a = document.querySelector('#stD .t1'), c = document.querySelector('#stD .k3'); return { t1: a.getBoundingClientRect().height / c.getBoundingClientRect().height, ln: document.querySelector('#stD .t1').textContent }; });
    const mr = await page.evaluate(k => { const r = document.querySelectorAll('#rb .row')[k], a = r.querySelector('.k3 .t1'), c = r.querySelector('.k3'); return { t1: a.getBoundingClientRect().height / c.getBoundingClientRect().height, ln: a.textContent }; }, i);
    console.log(`note ${i + 1} : 1re ligne « ${m.ln} » / « ${mr.ln} », hauteur relative éditeur ${m.t1.toFixed(3)} · roadbook ${mr.t1.toFixed(3)}`);
    await (await page.$('.modal')).screenshot({ path: `/tmp/fid_dialog_${i}.png` });
    await page.click('.mf .mbtn:has-text("Annuler")'); await page.waitForTimeout(200);
  }
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
