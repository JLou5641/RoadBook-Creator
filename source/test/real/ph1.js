const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(800);
  console.log('btns', await p.evaluate(() => [...document.querySelectorAll('header button, #topbar button')].map(b => b.id).join(',')));
  await p.click('#bMore'); await p.waitForTimeout(600);
  console.log(await p.evaluate(() => { const o = []; for (const e of document.querySelectorAll('#moreMenu, .menu, [id*=enu], [class*=menu], [class*=pop]')) { const r = e.getBoundingClientRect(); if (r.width) o.push(`${e.tagName}#${e.id}.${e.className} x=${Math.round(r.x)} w=${Math.round(r.width)} pos=${getComputedStyle(e).position} tr=${getComputedStyle(e).transform}`); } return o.join('\n') + '\nscrollX ' + document.scrollingElement.scrollLeft + ' scrollW ' + document.documentElement.scrollWidth + ' vis ' + innerWidth; }));
  await p.screenshot({ path: '/home/claude/out/apercu-menu-telephone.png' }); console.log('erreurs', errs.join('|') || 0); await b.close(); })();
