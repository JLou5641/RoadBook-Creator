const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 }, locale: 'fr-FR' });
  await p.route(/^(?!file).*/, r => r.abort()); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  await p.evaluate(() => localStorage.clear()); await p.reload();
  const snap = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ') + '|' + [...document.querySelectorAll('[title],[placeholder]')].map(e => e.title + e.placeholder).join('|'));
  const fr0 = await snap(); console.log('lang défaut', await p.evaluate(() => I18N.lang));
  await p.evaluate(() => document.querySelector('#moreMenu [data-act="lang"]').click()); await p.waitForTimeout(300);
  console.log('après clic', await p.evaluate(() => I18N.lang), await p.evaluate(() => localStorage.getItem('rbLang')));
  await p.screenshot({ path: '/tmp/en_switch.png' });
  await p.evaluate(() => document.querySelector('#moreMenu [data-act="lang"]').click()); await p.waitForTimeout(300);
  const fr1 = await snap(); console.log('retour FR identique ?', fr0.replace(/Langue de l.interface[^|]*/, '') === fr1.replace(/Langue de l.interface[^|]*/, ''));
  if (fr0 !== fr1) { const a = fr0.split(/(?<=[ |])/), c = fr1.split(/(?<=[ |])/); let i = 0; while (a[i] === c[i]) i++; console.log(a.slice(i, i + 8).join(''), '###', c.slice(i, i + 8).join('')); }
  // anglais du navigateur => anglais par défaut
  const p2 = await (await b.newContext({ locale: 'en-GB' })).newPage(); await p2.route(/^(?!file).*/, r => r.abort());
  await p2.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); console.log('navigateur EN →', await p2.evaluate(() => I18N.lang));
  await b.close(); })();
