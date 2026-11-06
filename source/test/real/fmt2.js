const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/^(?!file)(?!https:\/\/data\.geopf\.fr).*/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.setInputFiles('#fileIn', '/mnt/user-data/uploads/458e641c-1er_trac__RB_MORVAN.json'); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const n = window.__rb.S.notes.find(x => (x.text || '').split('\n').length > 1) || window.__rb.S.notes[3]; n.symLocked = true; n.text = 'Titre\nligne deux'; n.tcol = '#d00000'; n.tbold = 'on'; n.sym = [{ tx: 'Hop', c: 'd', x: 50, y: 60, h: 14, rot: 30, col: '#0050ff' }, { k: 'tarmac', c: 'd', x: 30, y: 60, h: 20, rot: 90 }];
    const s = window.__rb.notesSVG(n); return { texts: (s.match(/<text[^>]*>/g) || []).slice(0, 4), g: (s.match(/<g [^>]*>/g) || []), img: (s.match(/<image[^>]*transform[^>]*>/g) || []).length }; });
  console.log(JSON.stringify(r)); console.log('erreurs', errs.join('|') || 0); await b.close(); })();
