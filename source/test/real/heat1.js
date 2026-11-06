const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const urls = []; await p.route(/tile|arcgis|geopf|waymarked|brouter|overpass/, r => { urls.push(r.request().url()); r.abort(); });
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  for (const k of ['gps', 'mtb', 'lidar', 'onf', 'prsf', 'porteur', 'skidder', 'pentes', 'ombrage', '']) { await p.selectOption('#heatSel', k); await p.waitForTimeout(500); }
  await p.selectOption('#heatSel', 'lidar'); await p.waitForTimeout(600);
  await p.screenshot({ path: process.argv[2], clip: { x: 300, y: 60, width: 520, height: 200 } });
  console.log('gps', urls.some(u => /gps\.tile/.test(u)), 'mtb', urls.some(u => /waymarkedtrails\.org\/mtb/.test(u)), 'hiking', urls.some(u => /waymarkedtrails\.org\/hiking/.test(u)), 'lidar', urls.some(u => /IGNF_LIDAR/.test(u)), 'onf', urls.some(u => /FORETS.PUBLIQUES/.test(u)), 'erreurs', errs.length);
  await p.reload(); console.log('mémorisé', await p.inputValue('#heatSel')); await b.close(); })();
