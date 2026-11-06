// Ordre de superposition : deux symboles qui se chevauchent, avant-plan / arrière-plan, rendu écran et export
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1500, height: 1500 }, deviceScaleFactor: 1.3 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await page.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  await page.evaluate(() => document.querySelectorAll('#toast div').forEach(d => d.remove()));
  await page.evaluate(i => document.querySelectorAll('#rb .row')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 51); await page.waitForTimeout(200);
  console.log('boutons au départ :', await page.$eval('#stFront', b => b.disabled), await page.$eval('#stBack', b => b.disabled), '· menus supprimés :', !(await page.$('#eLexMode')), !(await page.$('#eLexCase')));
  await page.click('#eLexOpen'); await page.click('#eLexTabs button[data-c="Symboles"]');
  await page.fill('#eLexQ', 'trou'); await page.click('#eLexGrid button[data-k="hole"]');            // 1er : rond barré
  await page.fill('#eLexQ', 'village'); await page.click('#eLexGrid button[data-k="village"]');       // 2e : rond V, par-dessus
  // décaler le 2e (sélectionné) pour qu'il recouvre en partie le 1er : on déplace le 1er à gauche
  const st = await (await page.$('#stT')).boundingBox();
  const hole = (await page.$$('#stTin .fs'))[0]; let hb = await hole.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(st.x + st.width * 0.45, st.y + st.height * 0.4, { steps: 6 }); await page.mouse.up();
  const village = (await page.$$('#stTin .fs'))[1]; let vb = await village.boundingBox();
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2); await page.mouse.down(); await page.mouse.move(st.x + st.width * 0.55, st.y + st.height * 0.45, { steps: 6 }); await page.mouse.up();
  const order = () => page.evaluate(() => [...document.querySelectorAll('#stTin .fs')].map(i => i.title));
  console.log('ordre au départ (arrière → avant) :', (await order()).join(' · '));
  await (await page.$('.modal')).screenshot({ path: '/tmp/ord_a.png' });
  // sélectionner le 1er (rond barré) et le mettre en avant-plan
  const h2 = (await page.$$('#stTin .fs'))[0]; const hb2 = await h2.boundingBox();
  await page.mouse.click(hb2.x + 3, hb2.y + hb2.height / 2);
  console.log('boutons actifs après sélection :', !(await page.$eval('#stFront', b => b.disabled)));
  await page.click('#stFront'); console.log('après « avant-plan » :', (await order()).join(' · '));
  await (await page.$('.modal')).screenshot({ path: '/tmp/ord_b.png' });
  await page.click('#stBack'); console.log('après « arrière-plan » :', (await order()).join(' · '));
  await page.click('#stFront');
  await page.click('.mbtn.primary'); await page.waitForTimeout(300);
  console.log('enregistré (arrière → avant) :', await page.evaluate(() => window.__rb.S.notes[51].sym.map(q => q.k).join(' · ')));
  await page.evaluate(() => { document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; document.querySelectorAll('#toast div').forEach(d => d.remove()); });
  const rows = await page.$$('#rb .row'); await rows[51].evaluate(e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await rows[51].screenshot({ path: '/tmp/ord_row.png' });
  const gpx = await page.evaluate(() => window.__rb.buildGPX()); fs.writeFileSync(path.join(__dirname, 'order.gpx'), gpx);
  const T = [...gpx.matchAll(/<openrally:tulip><!\[CDATA\[data:image\/png;base64,([A-Za-z0-9+/=]+)\]\]>/g)].map(m => m[1])[51];
  fs.writeFileSync('/tmp/ord_tulip.png', Buffer.from(T, 'base64'));
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
