const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/brouter|routing\.openstreetmap|tile|arcgisonline|overpass|kumi|private\.coffee|mail\.ru/, r => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html')); await p.waitForTimeout(400);
  const r = await p.evaluate(async () => { const R = window.__rb, S = R.S;
    // parcours « routé » : 3 points de contrôle en mode trekking, tronçons courbes déjà calculés
    S.ctrl = [[45, 6, null], [45.01, 6.01, 'trekking'], [45.02, 6.0, 'trekking']];
    const a = [[45, 6], [45.003, 6.008], [45.006, 6.004], [45.01, 6.01]], c = [[45.01, 6.01], [45.014, 6.002], [45.017, 6.007], [45.02, 6.0]];
    S.segs = [a, c]; S.src = 'draw';
    R.reverseCtrl(); await new Promise(r => setTimeout(r, 300));
    const exp = [...c].reverse().concat([...a].reverse().slice(1));
    return { n: S.ll.length, ok: JSON.stringify(S.ll.map(q => [q[0], q[1]])) === JSON.stringify(exp), ll: S.ll }; });
  console.log('points', r.n, 'tracé = ancien tracé inversé :', r.ok); console.log(errs.length ? errs.join('\n') : 'aucune erreur JS'); await b.close(); })();
