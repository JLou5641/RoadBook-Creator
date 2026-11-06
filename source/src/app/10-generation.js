/* ============================================================
   11. Génération
   ============================================================ */
let cancelGen = false;
async function generate() {
  if (drawing) setDrawing(false);
  if (!T) { toast('Charge une trace GPX ou dessine un parcours d’abord.', 'err'); return; }
  if (routing) { toast('Patiente, l’itinéraire est encore en calcul…'); return; }
  runGenerate();
}
const keepOnRegen = n => !n.auto || n.moved || n.edited || n.wp || n.zone || n.fuel || (n.sym && n.sym.length) || (n.lex && n.lex.length) || n.tpos || n.tulipEdited || n.symLocked;
async function runGenerate() {
  cancelGen = false;
  const m = openModal('Génération du roadbook', `<div id="pTxt">Préparation…</div><div class="prog"><div id="pBar"></div></div>`, [{ label: 'Annuler', onClick: () => { cancelGen = true; } }], { noEsc: true });
  const t0 = Date.now(); let lastTxt = 'Préparation…';
  const show = () => { const t = m.querySelector('#pTxt'); if (t) t.textContent = lastTxt + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s'; };
  const prog = (txt, f) => { lastTxt = txt; show(); const b = m.querySelector('#pBar'); if (b) b.style.width = Math.round(f * 100) + '%'; };
  const ticker = setInterval(show, 1000);
  try {
    S.mm = null; buildDerived();                // on repart de la trace d'origine
    await fetchOSM((f, txt) => prog(txt, 0.05 + 0.6 * f), () => cancelGen);
    if (cancelGen) throw new Error('annulé');
    if (!G.ways.length) {
      closeModal(); renderAll();
      openModal('Aucun chemin trouvé', 'Aucun chemin OpenStreetMap n’a été trouvé autour de ta trace : impossible de repérer les intersections.<br><br>Vérifie sur la carte que la trace passe bien sur des chemins (fond CyclOSM pour mieux les voir).'
        + `<div class="help" style="margin-top:12px">Détail technique : ${esc(G.diag || '')}</div>`, [{ label: 'OK', cls: 'primary' }]);
      return;
    }
    prog('Recalage de la trace sur les chemins…', 0.68);
    const mm = S.settings.tol === 0 ? null : await mapMatch(G, f => prog('Recalage de la trace sur les chemins…', 0.68 + 0.17 * f), () => cancelGen);      // 0 = pas de recalage
    S.mm = mm ? mm.ll : null; buildDerived();
    const ratio = mm ? mm.ratio : 0;
    prog('Repérage des intersections…', 0.87); await sleep(30);
    const ev = detectEvents(G);
    const jn = makeJunctionNotes(G, ev);
    prog('Dessin des tulipes…', 0.95); await sleep(10);
    const bends = detectBends(jn);
    bends.push(...detectOffroad([...jn, ...bends]));
    const manual = S.notes.filter(keepOnRegen);      // notes ajoutées, déplacées ou modifiées à la main (texte, symboles, waypoint, zone, danger, tulipe, cap…) : jamais supprimées
    const kept = new Set(manual.map(n => n.kind));
    const all = [...(kept.has('start') ? [] : [startNote()]), ...jn, ...bends, ...(kept.has('end') ? [] : [endNote()])].filter(n => !manual.some(m => m.kind !== 'start' && m.kind !== 'end' && n.kind !== 'start' && n.kind !== 'end' && Math.abs(m.s - n.s) < 30)).sort((a, b) => a.s - b.s);      // on ne recrée pas une note automatique juste à côté d'une note gardée
    let rep = null;
    if (S.settings.pois || S.settings.landmarks) { prog('Ajout des repères (gués, ponts, villages…)', 0.97); await sleep(10); rep = osmExtras(G, all); }
    addTrackNames(all);
    let fr = null;
    if (S.settings.followLvl !== 0 && !(S.settings.followLvl === undefined && S.settings.followRoad === false)) { fr = followRoad(all); all.length = 0; all.push(...fr.notes); }
    S.notes = [...all, ...manual];
    S.stale = false; S.sel = null;
    closeModal(); renderTrack(); renderAll();
    if (S.notes.length > 1) map.fitBounds(line.getBounds(), { padding: [40, 40] });
    const pc = Math.round(ratio * 100);
    toast(`${S.notes.length} notes : ${jn.length} intersection${jn.length > 1 ? 's' : ''}${bends.length ? ', ' + bends.length + (bends.length > 1 ? ' virages serrés' : ' virage serré') : ''}${rep && rep.events ? ', ' + rep.events + ' repères' : ''}. ${S.settings.tol === 0 ? 'Trace non recalée.' : 'Parcours reconnu sur les chemins : ' + pc + ' %.'}`, 'ok');
    if (pc < 60 && S.settings.tol !== 0) openModal('Parcours peu reconnu', `Seulement <b>${pc} %</b> de ta trace a pu être recalée sur les chemins OpenStreetMap (trait noir sur la carte) : les intersections ne sont repérées que sur cette partie.<br><br>Si ta trace a été dessinée à main levée ou s’écarte des chemins, augmente <b>« Écart maxi trace ↔ chemins »</b> dans ⋯ › Réglages (par ex. 70 m), puis régénère. Les portions hors-piste ou absentes d’OpenStreetMap restent sans intersection.`, [{ label: 'OK', cls: 'primary' }]);
  } catch (e) {
    closeModal();
    if (e.message === 'annulé') { toast('Génération annulée.'); return; }
    console.error(e);
    const blocked = e instanceof TypeError || /fetch|network/i.test(e.message || '');
    openModal('Chemins OSM indisponibles', `Impossible de télécharger les chemins OpenStreetMap (${esc(e.message || e)}).<br><br>`
      + (blocked ? 'La connexion aux serveurs OpenStreetMap a été bloquée. Ouvre le fichier <b>directement dans Chrome, Edge ou Firefox</b> (double-clic sur le fichier enregistré sur ton ordinateur), pas dans un aperçu, et vérifie ta connexion internet.'
                 : 'Réessaie dans une minute : les serveurs gratuits sont parfois saturés.'), [{ label: 'OK', cls: 'primary' }]);
  } finally { clearInterval(ticker); }
}

