// Règles texte → symbole : exemples, puis rendu dans la case description
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/.*/, r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '..', '..', 'dist', 'generateur-roadbook.html'));
  const out = await p.evaluate(() => {
    const T = ['Rond-point\n2e sortie\nsur rue\nSortie Bourges', 'Pont', 'Sous voie ferrée', 'Pont sur voie ferrée', 'Tunnel', 'Gué', 'Passage à niveau', 'Barrière (privé)', 'Grille à bétail', 'STOP',
      'À D\nsur piste\nFin goudron', 'TD\nsur route D 976\nDébut goudron', 'Antenne à G', 'Station-service à D\nStation-service à G', 'Église à D\nPlace du Mont Blanc', "Château d'eau à G",
      'Longer clôture à D', 'Longer mur à G', 'Longer haie à G', 'Entrée Chamonix-Mont-Blanc', 'Sortie Bourges', 'Sommet Aiguille du Midi (3842 m)', 'Col de la Croix (1200 m)', 'Montée raide (14 %)',
      'Lieu-dit les Jeurs', 'Danger : glissant', 'Marches'];
    return T.map(t => { const v = window.__rb.noteView({ text: t, auto: true }); return t.replace(/\n/g, ' | ') + '  →  [' + v.keys.join(',') + ']  ' + JSON.stringify(v.lines.join(' | ')); })
      .concat(['— note manuelle :', (() => { const v = window.__rb.noteView({ text: 'Pont', auto: false }); return 'Pont → [' + v.keys + '] ' + v.lines; })()]);
  });
  console.log(out.join('\n')); console.log(errs.join('\n') || 'aucune erreur JS'); await b.close();
})();
