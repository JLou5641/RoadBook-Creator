/* ============================================================
   11. Génération
   ============================================================ */
let cancelGen = false;
async function generate() {
  if (drawing) setDrawing(false);
  if (!T) { toast('Charge une trace GPX ou dessine un parcours d’abord.', 'err'); return; }
  if (routing) { toast('Patiente, l’itinéraire est encore en calcul…'); return; }
  const SRC = [['ign', 'BD TOPO (IGN)', 'Réseau très fidèle en France'], ['vt', 'OpenFreeMap vectoriel (OSM)', 'Rapide, partout dans le monde'], ['osm', 'OSM détaillé (Overpass)', 'Noms de routes, ponts, numéros : le plus complet']];
  const cur = S.settings.data, curN = S.settings.dataN || cur;
  const sel = (id, v) => `<select id="${id}" style="width:100%">${SRC.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  openModal('Générer le roadbook', `<div style="font-size:13px;color:#6b6558;margin-bottom:12px;line-height:1.4">Choisis la source de chaque partie. Tu peux prendre la même pour les deux.</div>
    <div style="font-size:13px;font-weight:600;margin:0 0 4px">Tulipes (fidélité des routes et chemins)</div>${sel('gsT', cur)}
    <div style="font-size:13px;font-weight:600;margin:12px 0 4px">Instructions de la 3e case (noms, ponts, numéros…)</div>${sel('gsN', curN)}
    <div id="gsH" style="font-size:12px;color:#6b6558;margin-top:10px;line-height:1.4"></div>
    <div id="gsW" style="display:none;margin-top:10px;padding:8px 10px;border-radius:8px;background:rgba(224,138,0,.14);font-size:12px;line-height:1.4"><b>⚠ Fichier ouvert en local :</b> OSM détaillé (Overpass) refuse souvent les pages sans adresse web. Utilise plutôt la Web App (GitHub), ou choisis BD TOPO / OpenFreeMap.<br><a href="${WEBAPP_URL}" target="_blank" rel="noopener" style="font-weight:700">🌐 Ouvrir la Web App</a> <span style="opacity:.8">(enregistre d'abord ton projet avec 🗂️, puis rouvre-le là-bas)</span></div>`,
    [{ label: 'Annuler' }, { label: 'Générer', cls: 'primary', onClick: m => { S.settings.data = m.querySelector('#gsT').value; S.settings.dataN = m.querySelector('#gsN').value === S.settings.data ? '' : m.querySelector('#gsN').value; runGenerate(); } }]);
  const mm = $('#modal'), hint = () => { const a = mm.querySelector('#gsT').value, b = mm.querySelector('#gsN').value, nm = k => SRC.find(x => x[0] === k)[1]; mm.querySelector('#gsH').textContent = a === b ? 'Une seule source : ' + nm(a) + '.' : 'Le descriptif indiquera : « Tulipes : ' + nm(a) + ' · Instructions : ' + nm(b) + ' ».';
    const w = mm.querySelector('#gsW'); if (w) w.style.display = location.protocol === 'file:' && (a === 'osm' || b === 'osm') ? '' : 'none'; };
  mm.querySelector('#gsT').onchange = mm.querySelector('#gsN').onchange = hint; hint();
}
const keepOnRegen = n => !n.auto || n.moved || n.edited || n.wp || n.zone || n.fuel || (n.sym && n.sym.length) || (n.lex && n.lex.length) || n.tpos || n.tulipEdited || n.symLocked;
let GENLOG = [];
const WEBAPP_URL = 'https://jlou5641.github.io/RoadBook-Creator/';
let rptLayer = null;
function rptClear() { if (rptLayer) { map.removeLayer(rptLayer); rptLayer = null; } $('#modal').classList.remove('rptmini'); }
function rptGo(li) {      // clic sur un panneau écarté : zoom sur la carte, le rapport reste ouvert (réduit, déplaçable)
  const la = +li.dataset.lat, lo = +li.dataset.lon; if (!isFinite(la) || !isFinite(lo)) return;
  $('#modalBg').classList.add('free', 'top'); $('#modal').classList.add('rptmini');
  document.querySelectorAll('#modal .rptgo.on').forEach(e => e.classList.remove('on')); li.classList.add('on');
  if (rptLayer) map.removeLayer(rptLayer);
  rptLayer = L.layerGroup([L.circle([la, lo], { radius: 6, color: '#ff6a1a', weight: 3, fillOpacity: .15, interactive: false }), L.marker([la, lo], { icon: L.divIcon({ className: 'ctlw', html: '✕', iconSize: [22, 22] }), interactive: false })]).addTo(map);
  map.setView([la, lo], Math.max(map.getZoom(), 19));
}
function showReport(title, html) {      // fenêtre du rapport de génération (aussi rouverte depuis le menu ⋯)
  const m = openModal(title, html, [
      { label: '📋 Copier', keep: 1, onClick: (m, el) => { const t = reportText(m); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { el.textContent = '✓ Copié'; }, () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); el.textContent = '✓ Copié'; } catch (_) { el.textContent = 'Copie impossible'; } ta.remove(); }); } },
      { label: '💾 Enregistrer (.txt)', keep: 1, onClick: m => { download('rapport-roadbook-' + new Date().toISOString().slice(0, 10) + '.txt', reportText(m), 'text/plain'); } },
      'sp', { label: 'Fermer', cls: 'primary' }]);
  m.querySelectorAll('.rptgo').forEach(li => li.onclick = () => rptGo(li));
}
function reportText(m) {      // rapport de génération en texte brut (copie / fichier .txt)
  const body = m.querySelector('.mb').cloneNode(true);
  body.querySelectorAll('li').forEach(li => { li.prepend('• '); li.append('\n'); });
  body.querySelectorAll('p,div').forEach(e => e.append('\n'));
  const v = document.querySelector('.ver'), nm = ($('#rbName') || {}).value || '';
  return [m.querySelector('h2').textContent, (nm ? nm + ' — ' : '') + new Date().toLocaleString('fr-FR') + (v ? ' — ' + v.textContent.trim() : ''), '', body.textContent.replace(/\n{3,}/g, '\n\n').trim()].join('\n') + '\n';
}
function genWarn(msg) { GENLOG.push(msg); toast(msg, 'err'); }      // avertissements de la génération, repris dans le rapport final
async function runGenerate() {
  cancelGen = false; GENLOG = [];
  const m = openModal('Génération du roadbook', `<div id="pTxt">Préparation…</div><div class="prog"><div id="pBar"></div></div>`, [{ label: 'Annuler', onClick: () => { cancelGen = true; } }], { noEsc: true });
  const t0 = Date.now(); let lastTxt = 'Préparation…';
  const show = () => { const t = m.querySelector('#pTxt'); if (t) t.textContent = lastTxt + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s'; };
  const prog = (txt, f) => { lastTxt = txt; show(); const b = m.querySelector('#pBar'); if (b) b.style.width = Math.round(f * 100) + '%'; };
  const ticker = setInterval(show, 1000);
  try {
    S.mm = null; buildDerived();                // on repart de la trace d'origine
    await fetchOSM((f, txt) => prog(txt, 0.05 + 0.6 * f), () => cancelGen);
    S.dataSrc = (G && G.used) || '';
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
    const G0 = G, dT = S.settings.data, dN = S.settings.dataN;      // source des tulipes ; les instructions de la 3e case peuvent venir d'une autre source
    S.dataSrcN = '';
    if (dN && dN !== dT) {
      prog('Chargement de la source des instructions…', 0.96);
      try {
        S.settings.data = dN; G = null;
        await fetchOSM((f, txt) => prog(txt, 0.96), () => cancelGen);
        if (cancelGen) throw new Error('annulé');
        if (G && G.ways && G.ways.length) S.dataSrcN = G.used || ''; else G = G0;
      } catch (e) { if (/annulé/.test(e.message || '')) throw e; console.warn('source des instructions indisponible', e); G = G0; genWarn('Source des instructions indisponible : la source des tulipes est utilisée.'); }
      finally { S.settings.data = dT; }
    }
    let rep = null;
    if (S.settings.pois || S.settings.landmarks) { prog('Ajout des repères (gués, ponts, villages…)', 0.97); await sleep(10); rep = osmExtras(G, all); }
    addTrackNames(all);
    let fr = null;
    if (S.settings.followLvl !== 0 && !(S.settings.followLvl === undefined && S.settings.followRoad === false)) { fr = followRoad(all); all.length = 0; all.push(...fr.notes); }
    G = G0;      // le réseau des tulipes reste celui du roadbook (retouche des tulipes)
    S.notes = [...all, ...manual]; applyNoteLang();
    S.stale = false; S.sel = null;
    closeModal(); renderTrack(); renderAll();
    if (S.notes.length > 1) map.fitBounds(line.getBounds(), { padding: [40, 40] });
    const pc = Math.round(ratio * 100);
    const nk = manual.length, nr = all.length;
    const rows = [`<b>${S.notes.length} notes</b> : ${jn.length} intersection${jn.length > 1 ? 's' : ''}${bends.length ? ', ' + bends.length + (bends.length > 1 ? ' virages serrés' : ' virage serré') : ''}${rep && rep.events ? ', ' + rep.events + ' repères' : ''}.`];
    if (nk) rows.push(`${nk} note${nk > 1 ? 's gardées' : ' gardée'} (modifiées ou ajoutées à la main), ${nr} recalculée${nr > 1 ? 's' : ''}.`);
    rows.push(S.settings.tol === 0 ? 'Trace non recalée.' : `Parcours reconnu sur les chemins : <b>${pc} %</b>.`);
    const sn = typeof srcNote === 'function' ? srcNote() : ''; if (sn) rows.push(esc(sn) + '.');
    let html = rows.map(r => `<p style="margin:0 0 6px">${r}</p>`).join('');
    if (rep && rep.skipped && rep.skipped.length) html += `<details style="margin-top:8px;padding:6px 8px;border-radius:8px;background:rgba(255,140,0,.10)"><summary style="cursor:pointer"><b>${rep.skipped.length}</b> panneau${rep.skipped.length > 1 ? 'x' : ''} / obstacle${rep.skipped.length > 1 ? 's' : ''} repéré${rep.skipped.length > 1 ? 's' : ''} mais écarté${rep.skipped.length > 1 ? 's' : ''} <span style="color:#b8590a;font-weight:600">— clique ici pour dérouler la liste, puis sur un point pour zoomer dessus</span></summary><ul style="margin:4px 0 0 18px;padding:0;font-size:13px">${rep.skipped.slice(0, 80).map(k => `<li${k.lat != null ? ` class="rptgo" data-lat="${k.lat}" data-lon="${k.lon}" title="Voir sur la carte"` : ''}>${k.lat != null ? '📍 ' : ''}km ${(k.s / 1000).toFixed(2).replace('.', ',')} · ${esc(k.text)} — ${esc(k.why)}</li>`).join('')}${rep.skipped.length > 80 ? '<li>…</li>' : ''}</ul></details>`;
    if (GENLOG.length) html += `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(224,138,0,.14)"><b>À savoir :</b><ul style="margin:4px 0 0 18px;padding:0">${GENLOG.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`;
    if (pc < 60 && S.settings.tol !== 0) html += `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(224,138,0,.14)"><b>Parcours peu reconnu.</b> Seulement ${pc} % de ta trace a pu être recalée sur les chemins (trait noir sur la carte) : les intersections ne sont repérées que sur cette partie. Si la trace a été dessinée à main levée, augmente <b>« Écart maxi trace ↔ chemins »</b> dans ⋯ › Réglages (par ex. 70 m), puis régénère.</div>`;
    const rtitle = GENLOG.length || (pc < 60 && S.settings.tol !== 0) ? 'Roadbook généré — rapport (avec avertissements)' : 'Roadbook généré — rapport';
    try { localStorage.setItem('rbgen.report', JSON.stringify({ title: rtitle, html })); } catch (_) { }
    showReport(rtitle, html);
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

