const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_bay';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await p.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth_long.gpx'), 'utf8')); await p.waitForTimeout(300);
  await p.evaluate(() => window.__rb.generate());
  await p.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  const out = await p.evaluate(() => [50, 54, 57].map(i => { const t = window.__rb.S.notes[i].tulip; const f = p => '(' + p.map(v => v.toFixed(0)).join(',') + ')';
    return `#${i + 1} R=${t.R} route: ${t.route.map(q => f(q.p)).join(' ')}\n` + t.others.map((o, k) => `   other${k} ${o.c}: ${o.p.map(f).join(' ')}`).join('\n'); }).join('\n'));
  console.log(out); await b.close();
})();
