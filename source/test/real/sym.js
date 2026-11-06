// Galerie de tous les symboles officiels + contrôle qu'ils ne chevauchent ni la distance partielle, ni la flèche, ni le total
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const mock = require('./mock'); const db = mock.load(path.join(__dirname, 'north-bayreuth.json'));
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru/, r => { const u = r.request().url(); if (/status$/.test(u)) return r.fulfill({ status: 200, body: 'ok' }); const body = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.run(db, body)) }); });
  await page.route(/tile|arcgisonline|geopf/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(t => window.__rb.loadText(t, 't.gpx'), fs.readFileSync(path.join(__dirname, 'bayreuth.gpx'), 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  const cases = [
    { wp: { type: 'wpm', name: '1' } }, { wp: { type: 'wpc', name: '2' } }, { wp: { type: 'wps', name: '3' } }, { wp: { type: 'wpn', name: '4' } },
    { wp: { type: 'wpp', name: '5' } }, { wp: { type: 'wpv', name: '6' } }, { wp: { type: 'wpe', name: '7' } },
    { wp: { type: 'dss' } }, { wp: { type: 'ass' } }, { wp: { type: 'cp' } },
    { wp: { type: 'dn', dur: 15 } }, { wp: { type: 'fn' } }, { wp: { type: 'dn', speed: 50 } }, { wp: { type: 'fn' } },
    { wp: { type: 'dt' } }, { wp: { type: 'ft' } }, { wp: { type: 'dt', speed: 110 } }, { wp: { type: 'ft' } },
    { zone: { type: 'dz', speed: 30 } }, { zone: { type: 'fzdz', speed: 50 } }, { zone: { type: 'fz' } },
    { fuel: true }, { wp: { type: 'dss' }, fuel: true }, { wp: { type: 'wpm', name: '8' }, zone: { type: 'dz', speed: 40 } }, { zone: { type: 'fz' } },
  ];
  const n = await page.evaluate(cases => {
    const S = window.__rb.S; S.notes = S.notes.slice(0, cases.length);
    S.notes.forEach((x, i) => { x.wp = null; x.zone = null; x.fuel = false; Object.assign(x, JSON.parse(JSON.stringify(cases[i]))); });
    document.querySelector('#bGen'); S.stale = false;
    return S.notes.length;
  }, cases);
  // forcer un nouveau rendu (renderAll n'est pas exposé : on passe par la boîte d'édition d'une note sans rien changer)
  await page.evaluate(() => document.querySelectorAll('#rb .row')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await page.waitForTimeout(150);
  await page.click('.mbtn.primary'); await page.waitForTimeout(400);
  const res = await page.evaluate(() => {
    const ov = (a, b) => a && b && a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
    return [...document.querySelectorAll('#rb .row')].map((r, i) => {
      const s = r.querySelector('.syms'); if (!s) return null;
      const sr = s.getBoundingClientRect(), k1 = r.querySelector('.k1').getBoundingClientRect();
      const bad = [];
      if (ov(sr, r.querySelector('.par').getBoundingClientRect())) bad.push('partielle');
      const ar = r.querySelector('.arr'); if (ar && ov(sr, ar.getBoundingClientRect())) bad.push('flèche');
      if (ov(sr, r.querySelector('.tot').getBoundingClientRect()) && sr.top < r.querySelector('.tot').getBoundingClientRect().bottom - 1) bad.push('total');
      if (sr.left < k1.left || sr.right > k1.right + .5) bad.push('déborde');
      const imgs = [...s.querySelectorAll('img')]; if (imgs.some(im => !im.complete || !im.naturalWidth)) bad.push('image cassée');
      return { i: i + 1, alt: [...s.children].map(c => c.alt || 'panneau').join('+'), h: s.style.getPropertyValue('--h'), bad };
    }).filter(Boolean);
  });
  res.forEach(r => console.log(r.i, r.alt, r.h, r.bad.length ? 'PROBLÈME ' + r.bad.join(',') : 'ok'));
  await page.evaluate(() => { const rb = document.querySelector('#rb'); rb.style.overflow = 'visible'; document.querySelector('#side').style.width = '470px'; });
  const rows = await page.$$('#rb .row');
  for (const [k, [a, b]] of Object.entries({ 1: [0, 9], 2: [9, 18], 3: [18, n] })) {
    await rows[a].scrollIntoViewIfNeeded();
    const boxes = await Promise.all(rows.slice(a, b).map(r => r.boundingBox()));
    const y0 = Math.min(...boxes.map(x => x.y)), y1 = Math.max(...boxes.map(x => x.y + x.height));
    await page.setViewportSize({ width: 1400, height: Math.ceil(y1 - y0 + 200) });
    await rows[a].evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(150);
    const b2 = await Promise.all(rows.slice(a, b).map(r => r.boundingBox()));
    const t0 = Math.min(...b2.map(x => x.y)), t1 = Math.max(...b2.map(x => x.y + x.height));
    await page.screenshot({ path: path.join(__dirname, `sym_${k}.png`), clip: { x: b2[0].x - 4, y: t0 - 4, width: b2[0].width + 8, height: t1 - t0 + 8 } });
  }
  const gpx = await page.evaluate(() => window.__rb.buildGPX()); fs.writeFileSync(path.join(__dirname, 'sym.gpx'), gpx);
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
