// Aperçu final : éditeur (zone de placement) puis la même note enregistrée dans le roadbook
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1500, height: 1700 }, deviceScaleFactor: 1.4 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await page.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  await page.evaluate(() => { document.querySelectorAll('#toast div').forEach(d => d.remove()); document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; });
  const I = 56;
  await page.evaluate(i => document.querySelectorAll('#rb .row')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), I); await page.waitForTimeout(250);
  await page.selectOption('#eDanger', '2');                                                      // le danger et le CAP modifiés s'affichent tout de suite
  await page.click('#eLexOpen'); await page.click('#eLexTabs button[data-c="Sur la piste"]');
  await page.selectOption('#eWp', ''); await page.click('#eLexGrid button[data-k="ditch"]');
  const st = await (await page.$('#stD')).boundingBox(); const im = await page.$('#stTin .fs'); const b = await im.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(st.x + st.width * 0.72, st.y + st.height * 0.62, { steps: 8 }); await page.mouse.up();
  await page.evaluate(() => { const m = document.querySelector('.modal'); m.scrollTop = 0; });
  await (await page.$('.stlabels')).evaluate(e => e.scrollIntoView({ block: 'start' }));
  const stage = await page.$('.stage'), lab = await page.$('.stlabels'); const sb = await stage.boundingBox(), lb = await lab.boundingBox();
  await page.screenshot({ path: '/tmp/fid_stage.png', clip: { x: lb.x - 4, y: lb.y - 4, width: lb.width + 8, height: sb.y + sb.height - lb.y + 8 } });
  await page.click('.mbtn.primary'); await page.waitForTimeout(400);
  const rows = await page.$$('#rb .row'); await rows[I].evaluate(e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await rows[I].screenshot({ path: '/tmp/fid_row.png' });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
