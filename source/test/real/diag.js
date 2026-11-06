const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  for (const mode of ['vt', 'ign', 'ignd']) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true }); const page = await ctx.newPage();
    await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
    await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
    await page.evaluate(m => { window.__rb.S.settings.data = m; window.__rb.S.settings.straight = false; }, mode);
    await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(300);
    await page.evaluate(() => window.__rb.generate());
    await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
    const r = await page.evaluate(() => { const N = window.__rb.S.notes; const J = N.filter(n => n.kind === 'junction' && n.rd && n.rd.cat);
      const why = { follow: 0, seul: 0, nom: 0, autre: 0, conflit: 0 };
      J.forEach((n, i) => { const l = (n.text || '').split('\n').filter(Boolean); if (n.follow) why.follow++; else if (l.length === 2 && /^(TD|Lég|À|Serrer)/.test(l[0])) why.seul++; else if ((n.roadNames || []).length) why.nom++; else why.autre++; });
      return { total: N.length, jn: J.length, ...why, ex: N.filter(n => n.kind === 'junction' && n.rd && n.rd.cat && !n.follow).slice(0, 400).map(n => n.text.replace(/\n/g, ' / ')).filter(t => /sur (route|piste)/.test(t)).reduce((a, t) => { const k = t.replace(/ D ?\d+.*/, ''); a[k] = (a[k] || 0) + 1; return a; }, {}) }; });
    console.log(mode, JSON.stringify(r).slice(0, 900)); await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
