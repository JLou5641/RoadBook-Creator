const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await p.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await p.waitForTimeout(300);
  await p.evaluate(() => window.__rb.generate());
  await p.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  const html = await p.evaluate(() => {
    const N = window.__rb.S.notes, pick = [0, 12, 20, 33, 50, 54, 56, N.length - 1], S = window.__rb.S; let h = '';
    for (const mode of [true, false]) {
      S.settings.routeExt = mode; h += `<div style="font:13px sans-serif;margin:4px">${mode ? 'Option activée (comme avant)' : 'Option désactivée'}</div>`;
      h += pick.map(i => `<div style="display:inline-block;margin:3px;border:1px solid #000">${window.__rb.tulipSVG(N[i].tulip, 250)}</div>`).join('') + '<br>';
    }
    S.settings.routeExt = true; return h;
  });
  await p.setContent(`<body style="margin:0;background:#ddd">${html}</body>`); await p.screenshot({ path: '/home/claude/out/apercu-route-ext.png', fullPage: true });
  // la case à cocher dans les réglages, et le texte du message
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.click('#bMore'); await p.click('[data-act=settings]'); await p.waitForTimeout(200);
  console.log('case présente :', await p.$eval('#sExt', e => e.checked));
  await p.uncheck('#sExt'); await p.click('.mbtn.primary'); await p.waitForTimeout(300);
  console.log('réglage :', await p.evaluate(() => window.__rb.S.settings.routeExt), '· message :', await p.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).join(' / ')));
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
