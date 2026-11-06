const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  for (const mode of ['ign', 'ignd']) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true }); const page = await ctx.newPage();
    await page.route(/overpass|kumi|private\.coffee|mail\.ru|tile\.|arcgisonline|geopf\.fr\/private|opentopomap|cyclosm/, r => r.abort());
    await page.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
    await page.evaluate(m => { window.__rb.S.settings.data = m; window.__rb.S.settings.straight = false; }, mode);
    await page.evaluate(t => window.__rb.loadText(t, 'u.gpx'), fs.readFileSync('/tmp/igntest/user.gpx', 'utf8')); await page.waitForTimeout(300);
    await page.evaluate(() => window.__rb.generate());
    await page.waitForFunction(() => !document.querySelector('#modalBg').classList.contains('show'), null, { timeout: 280000 });
    const r = await page.evaluate(() => window.__rb.S.notes.map((n, k) => (k + 1) + ' ' + (n.s / 1000).toFixed(2) + ' ' + n.text.replace(/\n/g, ' / ') + (n.rd ? '  [' + (n.rd.cat || '-') + ' ' + JSON.stringify(n.rd.a).replace(/"/g, '') + '>' + JSON.stringify(n.rd.b).replace(/"/g, '') + ']' : '') + (n.follow ? ' <FOLLOW>' : '')));
    console.log('== ' + mode); console.log(r.join('\n')); await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
