const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.evaluate(t => window.__rb.loadText(t, 'a.gpx'), fs.readFileSync(path.join(__dirname, 'andorra.gpx'), 'utf8')); await p.waitForTimeout(500);
  // pas de réseau : on simule la génération en remplaçant fetchOSM par un réseau vide ne marche pas -> on teste keepOnRegen et le bouton
  const r = await p.evaluate(() => { const R = window.__rb; return { btn: !!document.querySelector('#bSave'), keep: typeof keepOnRegen }; });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bSave')]);
  console.log(JSON.stringify(r), 'fichier', dl.suggestedFilename(), 'erreurs', errs.join('|') || 0); await p.screenshot({ path: '/home/claude/out/apercu-sauvegarder.png', clip: { x: 0, y: 0, width: 1400, height: 70 } }); await b.close(); })();
