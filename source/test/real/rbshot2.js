// Tulipes autour des ronds-points (Andorre, mode rapide, tuiles simulées) : usage node rbshot2.js <sortie.png> [seuil en m]
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TD = '/home/claude/vt/tiles_and', [outPng, win = '90'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf|opentopomap|cyclosm/, r => r.abort());
  await p.route(/openfreemap|data\.gouv\.fr/, r => { const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url()), f = m && path.join(TD, m[2], m[3] + '.pbf'); if (!f || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f) }); });
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(300);
  await p.evaluate(() => window.__rb.generate());
  await p.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 120000 });
  const html = await p.evaluate(W => {
    const N = window.__rb.S.notes, rbs = N.filter(n => n.src && n.src.t === 'rb'); let h = '';
    for (const r of rbs) {
      h += '<div style="margin:4px 0;white-space:nowrap">';
      for (const n of N) if (n.s >= r.span[0] - W && n.s <= r.span[1] + W)
        h += `<div style="display:inline-block;margin:2px;vertical-align:top;font:11px sans-serif;width:180px;${n === r ? 'outline:3px solid #e8a000' : ''}"><div style="border:1px solid #000;width:180px;height:180px">${window.__rb.tulipSVG(n.tulip, 180)}</div>km ${(n.s / 1000).toFixed(3)} · ${n.text.split('\n').slice(0, 2).join(' · ')}</div>`;
      h += '</div>';
    }
    return h;
  }, +win);
  await p.setContent(`<body style="margin:0;background:#ddd;width:1500px">${html}</body>`); await p.screenshot({ path: outPng, fullPage: true });
  console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
