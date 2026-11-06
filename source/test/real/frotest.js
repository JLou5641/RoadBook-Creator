const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const PISTE = !!process.env.PISTE;
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1.5, ignoreHTTPSErrors: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('ERREUR ' + e.message));
  await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await page.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('rbgen-osm'); q.onsuccess = q.onerror = q.onblocked = r; }); }); await page.reload();
  await page.evaluate(m => { window.__rb.S.settings.data = m; window.__rb.S.settings.straight = false; window.__rb.S.settings.landmarks = false; window.__rb.S.settings.showDir = false; }, 'ign');
  await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__rb.generate());
  await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
  // cas de test construits à partir de vraies notes : 4 carrefours enchaînés sur D 6 (28-30 du roadbook de l'utilisateur) + un vrai changement
  const r = await page.evaluate(() => {
    const S = window.__rb.S, J = S.notes.filter(n => n.kind === 'junction' && n.rd && n.rd.road);
    const mk = (n, s, text, a, b) => ({ ...JSON.parse(JSON.stringify(n)), follow: false, s, text, rd: { a, b, road: true } });
    const d6 = { ref: 'D6', name: '' }, none = { ref: '', name: '' }, d7 = { ref: 'D7', name: '' };
    const base = J[0];
    const L = [mk(base, 1000, 'Serrer à D\nsur route D 6', d6, d6), mk(base, 1030, 'À G\nsur route', d6, none), mk(base, 1080, 'À D\nsur route', none, none), mk(base, 1130, 'À G\nsur route D 7', none, d7), mk(base, 1500, 'À D\nsur route', d7, d7), mk(base, 1530, 'À G\nsur route', d7, d7)];
    const res = window.__rb.followRoad(L);
    const tk = (n, s, text, cat) => ({ ...JSON.parse(JSON.stringify(n)), follow: false, s, text, rd: { a: { ref: '', name: '' }, b: { ref: '', name: '' }, road: cat === 'road', cat } });
    const trk = window.__rb.followRoad([tk(base, 100, 'Lég. à D\nsur piste', 'track'), tk(base, 1230, 'À G\nsur piste', 'track'), tk(base, 1300, 'À G\nsur route', 'road'), tk(base, 1350, 'À D\nsur piste', 'track'), tk(base, 1400, 'À D\nsur piste', 'track')]);
    const gap = window.__rb.followRoad([mk(base, 1000, 'À G\nsur route', none, none), mk(base, 1400, 'À D\nsur route', none, none)]);
    return { out: res.notes.map(n => n.s + ' ' + n.text.replace(/\n/g, ' / ') + (n.follow ? ' [FRO]' : '')), removed: res.removed, gapRemoved: gap.removed, piste: trk.notes.map(n => n.text.replace(/\n/g, ' / ') + (n.follow ? ' [FPP]' : '')) };
  });
  console.log(JSON.stringify(r, null, 1));
  // aperçu avant / après sur de vraies tulipes : trois carrefours voisins d'une même route
  if (PISTE) await page.evaluate(() => { window.__PISTE = true; });
  const pick = await page.evaluate(() => { const S = window.__rb.S; const k = S.notes.findIndex((n, i) => i > 5 && [0, 1, 2].every(d => S.notes[i + d] && S.notes[i + d].kind === 'junction')); return k; });
  const shot = async (name) => { await page.evaluate(() => { document.querySelector('#side').style.width = '520px'; document.querySelector('#side').style.maxWidth = '520px'; }); await page.waitForTimeout(300);
    const rows = await page.$$('#rb .row'); const a = pick + 0, b = pick + 3; const bb1 = await rows[a].boundingBox(), bb2 = await rows[Math.min(b, rows.length - 1)].boundingBox();
    await rows[a].scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    const r1 = await rows[a].boundingBox(); const last = await rows[Math.min(b, rows.length - 1)].boundingBox();
    await page.screenshot({ path: '/home/claude/out/' + name, clip: { x: r1.x - 6, y: r1.y - 4, width: r1.width + 12, height: last.y + last.height - r1.y + 8 } }); };
  await page.evaluate(k => { const S = window.__rb.S; const d6 = { ref: 'D6', name: '' }, none = { ref: '', name: '' };
    const PI = !!window.__PISTE; const t = PI ? ['Lég. à D\nsur piste', 'À G\nsur piste', 'À D\nsur piste'] : ['Serrer à D\nsur route D 6', 'À G\nsur route', 'À D\nsur route']; for (let d = 0; d < 3; d++) { const n = S.notes[k + d]; n.text = t[d]; n.auto = true; n.sym = []; n.lex = []; n.wp = null; n.danger = 0; n.roadNames = []; n.rd = { a: d || PI ? none : d6, b: d || PI ? none : d6, road: !PI, cat: PI ? 'track' : 'road' }; n.follow = false; n.s = S.notes[k].s + d * 660; }
    window.__rb.renderAll(); }, pick);
  await shot(PISTE ? 'apercu-fpp-avant.png' : 'apercu-fro-avant.png');
  await page.evaluate(k => { const S = window.__rb.S; const r = window.__rb.followRoad(S.notes.slice(k, k + 3)); S.notes.splice(k, 3, ...r.notes); window.__rb.renderAll(); }, pick);
  await shot(PISTE ? 'apercu-fpp-apres.png' : 'apercu-fro-apres.png');
  console.log(errs.join('\n') || 'aucune erreur JS'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
