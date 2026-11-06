const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const dir = '/home/claude/build/dist/pwa';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(dir, q.url === '/' ? 'index.html' : q.url.split('?')[0]); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); }).listen(8765, async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/openfreemap|geopf|tile|opentopomap|arcgis|cyclosm/, r => r.abort());
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(2500);
  console.log('sw actif :', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active));
  console.log('manifeste :', await p.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()).name));
  await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(1000);
  console.log('hors ligne, appli chargée :', await p.evaluate(() => typeof window.__rb), '· erreurs :', errs.join('|') || 'aucune');
  await b.close(); srv.close();
});
