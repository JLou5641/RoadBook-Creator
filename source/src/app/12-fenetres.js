/* ============================================================
   13. Fenêtres, messages, réglages, aide
   ============================================================ */
let modalOpts = null;
function openModal(title, body, buttons, opts) {
  const m = $('#modal'); modalOpts = opts || {};
  m.innerHTML = `<h2>${esc(title)}</h2><div class="mb">${body}</div><div class="mf"></div>`;
  const mf = m.querySelector('.mf');
  for (const b of buttons || []) {
    if (b === 'sp') { const sp = document.createElement('span'); sp.className = 'sp'; mf.appendChild(sp); continue; }
    const el = document.createElement('button'); el.className = 'mbtn ' + (b.cls || ''); el.textContent = b.label;
    el.onclick = () => { modalOpts = null; closeModal(); if (b.onClick) b.onClick(m); };
    mf.appendChild(el);
  }
  if (!buttons || !buttons.length) mf.style.display = 'none';
  m.style.transform = ''; $('#modalBg').classList.toggle('top', !!(opts && opts.top));      // top : fenêtre ancrée en haut (sa position ne change pas quand son contenu change) et fond plus clair
  $('#modalBg').classList.add('show');
  return m;
}
// fenêtre déplaçable à la souris ou au doigt en tirant sur son titre (pour voir la carte derrière)
(function () {
  const m = $('#modal'); let d = null;
  m.addEventListener('pointerdown', e => {
    const h = e.target.closest('h2'); if (!h || e.button > 0) return;
    const r = m.getBoundingClientRect(), tr = /translate\(([-\d.]+)px, ?([-\d.]+)px\)/.exec(m.style.transform || '');
    d = { x: e.clientX, y: e.clientY, tx: tr ? +tr[1] : 0, ty: tr ? +tr[2] : 0, r }; h.setPointerCapture(e.pointerId); e.preventDefault();
  });
  m.addEventListener('pointermove', e => {
    if (!d) return;
    const dx = clamp(e.clientX - d.x, -d.r.left - d.r.width + 80, innerWidth - d.r.left - 80), dy = clamp(e.clientY - d.y, -d.r.top, innerHeight - d.r.top - 40);
    m.style.transform = `translate(${Math.round(d.tx + dx)}px, ${Math.round(d.ty + dy)}px)`;
  });
  const end = () => { d = null; };
  m.addEventListener('pointerup', end); m.addEventListener('pointercancel', end);
})();
function closeModal() { $('#modalBg').classList.remove('show'); }
function cancelModal() { if (!$('#modalBg').classList.contains('show') || (modalOpts && modalOpts.noEsc)) return; const o = modalOpts; modalOpts = null; closeModal(); if (o && o.onCancel) o.onCancel(); }
$('#modalBg').addEventListener('mousedown', e => { if (e.target.id === 'modalBg') cancelModal(); });
function ask(title, html, okLabel, onOk) { openModal(title, html, ['sp', { label: 'Annuler' }, { label: okLabel, cls: 'primary', onClick: onOk }]); }
function toast(msg, cls, action) {
  const d = document.createElement('div'); d.className = cls || ''; d.textContent = msg;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.style.cssText = 'margin-left:12px;pointer-events:auto;border:0;border-radius:5px;padding:3px 9px;font-weight:700;background:#e39b2d;cursor:pointer'; b.onclick = () => { action.fn(); d.remove(); }; d.appendChild(b); }
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), action ? 7000 : cls === 'err' ? 10000 : 4200);
}
function openSettings() {
  const s = S.settings;
  const num = (id, label, v, min, max, help) => `<div class="fld"><label for="${id}">${label}</label><input id="${id}" type="number" min="${min}" max="${max}" value="${v}">${help ? `<div class="help" style="margin:2px 0 0">${help}</div>` : ''}</div>`;
  const chk = (id, label, v) => `<label class="chk"><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${label}</label>`;
  openModal('Réglages de génération', `
    <details class="setsec" open><summary>🗺️ Données et trace <span class="setbadge">source des chemins</span></summary>
    <div class="fld"><label for="sData">Source des chemins</label><select id="sData">
      <option value="vt"${!/^(osm|ign|ignd)$/.test(s.data) ? ' selected' : ''}>Rapide — fond vectoriel OpenFreeMap (par défaut)</option>
      <option value="ign"${s.data === 'ign' ? ' selected' : ''}>IGN — BD TOPO, France seulement (mêmes chemins que le SCAN 25)</option>
      <option value="ignd"${s.data === 'ignd' ? ' selected' : ''}>IGN détaillé — BD TOPO avec les repères, France seulement</option>
      <option value="osm"${s.data === 'osm' ? ' selected' : ''}>Détaillé — OpenStreetMap complet (Overpass, plus lent)</option></select>
      <details class="lmbox"><summary>ℹ️ Détails des sources</summary><div class="help" style="margin:2px 0 0"><b>Rapide</b> : chemins, carrefours, ronds-points, goudron / piste, eau, bâtiments, ponts, tunnels, gués, portails, villages, sommets, stations-service, églises.<br>
      <b>IGN</b> : routes, routes empierrées, chemins, sentiers, ronds-points, ponts, gués, noms de rues et numéros de routes de la BD TOPO, cours d’eau, plans d’eau, bâtiments ; France seulement.<br>
      <b>IGN détaillé</b> : tout cela, plus les repères de la BD TOPO : barrières, passages à niveau, voies ferrées, murs, clôtures, haies, entrées et sorties de villages, lieux-dits, sommets, cols, châteaux d’eau, antennes, cheminées, éoliennes, églises (un peu plus long à télécharger ; pas de STOP, ni de sable ou boue, ni de pentes).<br>
      <b>Détaillé</b> : en plus clôtures, STOP, sable / boue, état de la piste, pentes, châteaux d’eau, antennes… mais téléchargement bien plus long.</div></details></div>
    ${num('sTol', 'Écart maxi trace ↔ chemins (m)', s.tol, 0, 100, 'Ta trace est recalée sur les chemins situés à moins de cette distance. Augmente-la si ta trace est dessinée à main levée. Mets 0 pour ne pas recaler : la trace est gardée telle quelle.')}
    ${chk('sFoot', 'Inclure les voies piétonnes et cyclables (footway, cycleway, escaliers)', s.foot)}
    </details>
    <details class="setsec" open><summary>📝 Quelles notes créer <span class="setbadge">↻ à régénérer</span></summary>
${num('sMerge', 'Regrouper les notes à moins de (m)', s.merge, 5, 100)}
    ${chk('sStraight', 'Noter aussi les intersections où l’on continue tout droit', s.straight)}
    ${chk('sMixY', 'Noter les fourches (Y) dont une branche est d’un autre type (route + chemin)', s.mixY)}
    ${chk('sMixT', 'Noter les T et croisements dont les autres branches sont d’un autre type (route + chemin)', s.mixT)}
    <div class="fld"><label>Regroupement des notes sur une même route ou piste (FRO / FPP) : <b id="sFollowTxt">${['aucun', 'prudent', 'normal', 'large'][s.followLvl === undefined ? (s.followRoad === false ? 0 : 3) : s.followLvl]}</b>
      <input type="range" id="sFollow" style="width:100%;margin-top:4px" min="0" max="3" step="1" oninput="document.getElementById('sFollowTxt').textContent=['aucun','prudent','normal','large'][this.value]" value="${s.followLvl === undefined ? (s.followRoad === false ? 0 : 3) : s.followLvl}"></label>
      <div class="help">0 aucun · 1 prudent : seulement les notes « direction + sur route » · 2 normal : le nom de la rue ne compte plus · 3 large : les repères secondaires (haie, antenne, clôture…) ne coupent plus la série. Les STOP, ponts, passages à niveau, villages, ronds-points et changements de numéro de route coupent toujours.</div></div>
    ${chk('sGoudron', 'Noter les changements « fin / début goudron »', s.goudron)}
    ${chk('sBends', 'Noter les virages serrés hors intersection', s.bends)}
    ${num('sBendA', 'Angle mini d’un virage serré (°)', s.bendAngle, 60, 170)}
    ${chk('sOffroad', 'Noter les passages hors piste (trace hors des chemins : direction, flèche pointillée et CAP)', s.offroad !== false)}
    ${chk('sPois', 'Notes de repères : gués, passages à niveau, stops, portails, ponts, tunnels, sable, pentes, clôtures, villages, cols, stations-service', s.pois)}
    ${chk('sLand', 'Repères visuels : châteaux d’eau, antennes, églises, éoliennes, sommets, lieux-dits, noms des pistes', s.landmarks)}
    <details class="lmbox"><summary>Choisir les repères un par un</summary>
      <div class="help">Décoche les repères dont tu ne veux pas dans le roadbook. Les deux cases ci-dessus restent l’interrupteur général de chaque groupe. Il faut régénérer le roadbook pour que ça s’applique (certains repères n’existent que selon la source des chemins choisie).</div>
      <div class="lmbtns"><button type="button" class="mbtn" id="lmAll">Tout cocher</button> <button type="button" class="mbtn" id="lmNone">Tout décocher</button></div>
      ${[['p', 'Notes de repères'], ['v', 'Repères visuels']].map(([g, tt]) => `<div class="lmgrp"><b>${tt}</b>${LM_TYPES.filter(x => x[2] === g).map(x => `<label class="chk"><input type="checkbox" class="lmchk" data-lm="${x[0]}"${(s.lmOff || []).includes(x[0]) ? '' : ' checked'}> ${x[1]}</label>`).join('')}</div>`).join('')}
    </details>
    </details>
    <details class="setsec"><summary>🌷 Dessin de la tulipe <span class="setbadge">↻ à régénérer</span></summary>
${num('sR', 'Rayon dessiné dans la tulipe (m)', s.tulipR, 25, 120)}
    ${chk('sWater', 'Dessiner les cours d’eau et plans d’eau (bleu ciel)', s.water)}
    ${chk('sBld', 'Dessiner les bâtiments', s.bld)}
    ${chk('sExt', 'Montrer la route d’où l’on vient et où l’on va (la suite du tracé en noir, avant le point de départ et après la flèche)', s.routeExt !== false)}
    </details>
    <details class="setsec" open><summary>👁️ Affichage des notes <span class="setbadge">⚡ immédiat, sans régénérer</span></summary>
    ${chk('sSym', 'Remplacer les repères connus par leur symbole du lexique (Pont, Tunnel, Gué, rond-point, village, antenne…)', s.symAuto !== false)}
    ${chk('sDir', 'Afficher les directions dans la 3e case (TD, Lég. à G, À D, Épingle, Serrer à D…)', s.showDir !== false)}
    ${chk('sRO', 'Afficher « sur route / sur rue » (symbole RO) — le regroupement « Suivre la route » (FRO) reste actif', s.showRO !== false)}
    ${chk('sPI', 'Afficher « sur piste » (symbole P) — le regroupement « Suivre la piste » (FPP) reste actif', s.showPI !== false)}
    ${chk('sTR', 'Afficher « sur sentier » (symbole T)', s.showTR !== false)}
    ${chk('sRoad', 'Afficher les noms de route dans les instructions (nom de la rue ou de la piste, numéro de route : D 976…)', s.showRoad !== false)}
    ${chk('sCap', 'Afficher le CAP sur les nouvelles notes', s.showCap)}
    </details>
    <div class="help" style="margin-top:6px">Les chemins téléchargés sont gardés dans ce navigateur pour aller plus vite (⋯ › « Enregistrer les chemins OSM » pour en faire une copie dans un dossier). <a href="#" id="sClear">Vider cette mémoire</a></div>`, [
    { label: 'Valeurs par défaut', onClick: () => { S.settings = { ...DEF_SETTINGS }; afterSettings(); } }, 'sp',
    { label: 'Annuler' },
    { label: 'Enregistrer', cls: 'primary', onClick: () => {
      const g = (id, d, a, b) => { const v = parseFloat($('#' + id).value); return isFinite(v) ? clamp(v, a, b) : d; };
      const same = o => JSON.stringify(Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {}));      // comparaison sans tenir compte de l'ordre des champs
      const before = same({ ...S.settings, routeExt: 0, symAuto: 0, showDir: 0, showRoad: 0, showRO: 0, showPI: 0, showTR: 0, arrows: 0 });
      S.settings = { sv: DEF_SETTINGS.sv, data: /^(osm|ign|ignd)$/.test($('#sData').value) ? $('#sData').value : 'vt', tol: g('sTol', 40, 0, 100), water: $('#sWater').checked, bld: $('#sBld').checked, pois: $('#sPois').checked, landmarks: $('#sLand').checked, merge: g('sMerge', 30, 5, 100), tulipR: g('sR', 50, 25, 120), straight: $('#sStraight').checked, mixY: $('#sMixY').checked, mixT: $('#sMixT').checked,
        followLvl: +$('#sFollow').value, lmOff: [...document.querySelectorAll('.lmchk')].filter(c => !c.checked).map(c => c.dataset.lm), goudron: $('#sGoudron').checked, bends: $('#sBends').checked, offroad: $('#sOffroad').checked, bendAngle: g('sBendA', 100, 60, 170), foot: $('#sFoot').checked, routeExt: $('#sExt').checked, symAuto: $('#sSym').checked, showDir: $('#sDir').checked, showRoad: $('#sRoad').checked, showRO: $('#sRO').checked, showPI: $('#sPI').checked, showTR: $('#sTR').checked, showCap: $('#sCap').checked };
      afterSettings(before === same({ ...S.settings, routeExt: 0, symAuto: 0, showDir: 0, showRoad: 0, showRO: 0, showPI: 0, showTR: 0, arrows: 0 }));
    } }]);
  const lmSet = v => document.querySelectorAll('.lmchk').forEach(c => { c.checked = v; });
  if ($('#lmAll')) { $('#lmAll').onclick = () => lmSet(true); $('#lmNone').onclick = () => lmSet(false); }
  const c = $('#sClear');
  if (c) c.onclick = async e => { e.preventDefault(); memTiles.clear(); memVT.clear(); memIGN.clear(); G = null; await TileDB.clear(); toast('Mémoire des chemins vidée.'); };
}
function afterSettings(displayOnly) { drawArrows(); if (displayOnly) { renderRoadbook(); renderMarkers(); renderInfo(); save(); toast('Réglage enregistré.', 'ok'); return; }
  if (S.notes.length) { S.stale = true; toast('Réglages enregistrés : clique sur « Générer le roadbook » pour les appliquer.'); renderRoadbook(); renderMarkers(); } renderInfo(); save(); }
function openHelp() {
  const demo = { R: 50, kind: 'junction', route: [{ p: [0, -50], c: 'track' }, { p: [0, 0], c: 'track' }, { p: [35, 35], c: 'track' }], others: [{ c: 'road', p: [[-50, 5], [50, -5]] }, { c: 'trail', p: [[0, 0], [-30, 40]] }],
    wl: [{ k: 'stream', p: [[-50, -25], [-10, -20], [20, -32], [50, -28]] }], bld: [[[-38, 12], [-22, 12], [-22, 24], [-38, 24], [-38, 12]], [[18, -12], [30, -12], [30, -4], [18, -4], [18, -12]]] };
  openModal('Aide', `
    <div style="display:flex;gap:14px;align-items:center">${tulipSVG(demo, 110)}<div>
    <b>Lire une tulipe</b><br>● point = tu arrives ici · ▲ flèche = direction à prendre<br>
    <span style="color:#0000FF;font-weight:700">bleu</span> = ton parcours · noir = les autres chemins<br>double trait = route goudronnée · trait plein = piste · pointillés = sentier / petite piste<br>bleu ciel = cours d’eau · rectangles = bâtiments</div></div>
    <p><b>Trait noir sur la carte</b> : la partie de ta trace recalée sur les chemins OpenStreetMap. Les intersections sont repérées sur ce trait.</p>
    <p><b>Intersections manquantes</b> : augmente « Écart maxi trace ↔ chemins » dans les réglages. Trop de notes : décoche « tout droit ».</p>
    <p><b>Modifier</b> : ✎ sur une note (texte, CAP, danger, symboles du lexique FIA, waypoint WPV/WPM/WPS, zone de vitesse DZ/FZ). Clique sur la trace pour ajouter une note.</p>
    <p><b>Internet</b> est nécessaire pour la carte, le calcul d’itinéraire et les chemins. Mode rapide (par défaut) : fond vectoriel OpenFreeMap. Mode IGN (⚙️ Réglages, France) : BD TOPO, la base des cartes IGN. Mode détaillé : OpenStreetMap complet via Overpass, plus lent mais avec tous les repères. Ton travail est gardé automatiquement dans ce navigateur.</p>
    <p style="color:#8a8478;font-size:12px">Données © contributeurs OpenStreetMap (ODbL). Chemins du mode rapide : OpenFreeMap © OpenMapTiles. Mode IGN : BD TOPO® © IGN (Licence Ouverte). Itinéraires BRouter / OSRM. Fonds OpenTopoMap, IGN, CyclOSM, Esri.</p>`, [{ label: 'OK', cls: 'primary' }]);
}

