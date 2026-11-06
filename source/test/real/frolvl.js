const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/overpass|openfreemap|tile\.|geopf|arcgis|opentopomap|cyclosm|data\.gouv/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  const r = await page.evaluate(() => {
    const N = (s, text, a, b, o) => Object.assign({ kind: 'junction', auto: true, s, text, rd: { a, b, road: true, cat: 'road' }, roadNames: [] }, o || {});
    const e = { ref: '', name: '' }, d6 = { ref: 'D6', name: '' }, nm = x => ({ ref: '', name: x });
    const info = (s, text) => ({ kind: 'info', auto: true, s, text });
    const mk = () => [
      N(100, 'Serrer à G\\nsur route'.replace('\\\\n', '\n'), e, e),
      N(300, 'À D\nsur route\nRue de la Gare', e, e, { roadNames: ['Rue de la Gare'] }),
      info(350, 'Longer haie à G'),
      N(500, 'Serrer à D\nsur route\nAntenne à G', e, e),
      info(600, 'STOP'),
      N(700, 'À G\nsur route', e, e),
      N(800, 'À D\nsur route', e, e)];
    const show = (lvl) => { const L = mk(); L[0].text = 'Serrer à G\nsur route'; const R = window.__rb.followRoad(L, lvl); return R.notes.map(n => n.s + ': ' + n.text.replace(/\n/g, ' / ')).join(' | '); };
    return [0, 1, 2, 3].map(l => 'niveau ' + l + ' → ' + show(l));
  });
  r.forEach(x => console.log(x));
  // réglage : curseur dans la fenêtre
  await page.evaluate(() => window.__rb.openSettings && 0);
  await page.evaluate(() => window.__rb.openSettings()); await page.waitForTimeout(300);
  await page.evaluate(() => { const el = document.querySelector('#sFollow'); el.scrollIntoView({ block: 'center' }); el.value = 2; el.dispatchEvent(new Event('input')); }); await page.waitForTimeout(200);
  const box = await page.$('#sFollow'); const m = await page.$('#modalBg .modal, #modal, .modal'); await (m || page).screenshot({ path: '/home/claude/out/apercu-curseur-regroupement.png' });
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
