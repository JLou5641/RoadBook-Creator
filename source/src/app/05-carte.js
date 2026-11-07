/* ============================================================
   5. Carte
   ============================================================ */
const map = L.map('map', { preferCanvas: true, zoomControl: true, maxZoom: 19 }).setView([46.6, 2.4], 6);
const LAYERS = {
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxNativeZoom: 17, maxZoom: 19, attribution: '© contributeurs OpenStreetMap, SRTM | style © OpenTopoMap (CC-BY-SA)' }),
  scan25: L.tileLayer('https://data.geopf.fr/private/wmts?Service=WMTS&apikey=ign_scan_ws&Version=1.0.0&Request=GetTile&Layer=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR&Style=normal&Format=image/jpeg&TileMatrixSet=PM&TileMatrix={z}&TileRow={y}&TileCol={x}', { minZoom: 6, maxNativeZoom: 16, maxZoom: 19, attribution: '© IGN – SCAN 25® Touristique' }),
  planign: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png', { maxNativeZoom: 19, maxZoom: 19, attribution: '© IGN – Plan IGN' }),
  cyclosm: L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 19, attribution: '© contributeurs OpenStreetMap | CyclOSM' }),
  ortho: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg', { maxNativeZoom: 19, maxZoom: 19, attribution: '© IGN – Photographies aériennes' }),
  esritopo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, maxZoom: 19, attribution: 'Carte © Esri' }),
  osm: L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 20, attribution: '© contributeurs OpenStreetMap | OSM France' }),
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, maxZoom: 19, attribution: 'Imagerie © Esri' })
};
/* ---------- Fonds de carte personnels (adresse de tuiles {z}/{x}/{y}) ---------- */
let curLayer = LAYERS.topo.addTo(map), curLayerKey = 'topo';
let myLayers = [];
try { myLayers = JSON.parse(localStorage.getItem('rbgen.myLayers') || '[]'); } catch (_) {}
const myLayerObjs = new Map();
function normTileUrl(u) {
  return String(u || '').trim().replace(/&amp;/g, '&')
    .replace(/\{\$?z\}|\{zoom\}|\{\$zoom\}/gi, '{z}').replace(/\{\$?x\}/gi, '{x}').replace(/\{\$?y\}/gi, '{y}').replace(/\{\$?-y\}/gi, '{-y}');
}
function layerFor(key) {
  if (LAYERS[key]) return LAYERS[key];
  const c = myLayers.find(l => 'c:' + l.id === key); if (!c) return null;
  if (!myLayerObjs.has(c.id)) myLayerObjs.set(c.id, L.tileLayer(c.url, { maxNativeZoom: c.max || 18, maxZoom: Math.max(19, c.max || 18), attribution: esc(c.name) }));
  return myLayerObjs.get(c.id);
}
let baseLevel = {}; try { baseLevel = JSON.parse(localStorage.getItem('rbgen.baseLevel') || '{}') || {}; } catch (_) {}
/* Curseur d'intensité du fond : 10 % à 100 % (atténuation), mémorisé pour chaque fond */
function applyBaseLevel() {
  const v = clamp(+baseLevel[curLayerKey] || 100, 10, 100);
  $('#baseLvl').value = v; $('#baseLvlTxt').textContent = v + ' %'; curLayer.setOpacity(v / 100);
}
function setBaseLayer(key) {
  const lay = layerFor(key) || LAYERS.topo; if (!layerFor(key)) key = 'topo';
  if (curLayer !== lay) { map.removeLayer(curLayer); curLayer = lay.addTo(map); }
  curLayerKey = key; $('#layerSel').value = key;
  applyBaseLevel();
  try { localStorage.setItem('rbgen.layer', key); } catch (_) {}
}
function rebuildLayerSelect() {
  const sel = $('#layerSel');
  sel.querySelectorAll('option[data-my]').forEach(o => o.remove());
  for (const l of myLayers) { const o = document.createElement('option'); o.value = 'c:' + l.id; o.textContent = '⭐ ' + l.name; o.dataset.my = 1; sel.appendChild(o); }
  const m = document.createElement('option'); m.value = '__my'; m.textContent = '➕ Ajouter / gérer mes fonds…'; m.dataset.my = 1; sel.appendChild(m);
  sel.value = curLayerKey;
}
function saveMyLayers() { try { localStorage.setItem('rbgen.myLayers', JSON.stringify(myLayers)); } catch (_) {} }
function openMyLayers(pre, err) {
  pre = pre || {};
  const list = myLayers.length ? myLayers.map(l => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #e6dfd1"><div style="flex:1;min-width:0"><b>${esc(l.name)}</b><div class="help" style="margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.url)}</div></div><button class="mbtn danger" data-del="${l.id}">Supprimer</button></div>`).join('')
    : '<div class="help" style="margin:0">Aucun fond personnel pour l’instant.</div>';
  const m = openModal('Mes fonds de carte', `${list}
    <h3 style="font-family:var(--cond);font-size:17px;margin:16px 0 8px">Ajouter un fond</h3>
    ${err ? `<div style="color:var(--err);font-weight:600;margin-bottom:8px">${esc(err)}</div>` : ''}
    <div class="fld"><label for="mlName">Nom</label><input id="mlName" type="text" value="${esc(pre.name || '')}" placeholder="ex. IGN SCAN 25"></div>
    <div class="fld"><label for="mlUrl">Adresse des tuiles</label><textarea id="mlUrl" rows="3" placeholder="https://…/{z}/{x}/{y}.png">${esc(pre.url || '')}</textarea></div>
    <div class="help">Colle l’adresse d’un service de tuiles contenant <b>{z}</b>, <b>{x}</b> et <b>{y}</b> (les formes {$z}, {$x}, {$y} sont aussi acceptées).</div>
    <div class="fld" style="max-width:170px"><label for="mlMax">Zoom maxi des tuiles</label><input id="mlMax" type="number" min="1" max="22" value="${pre.max || 18}"></div>`, [
    { label: 'Fermer' }, 'sp',
    { label: 'Ajouter et afficher', cls: 'primary', onClick: () => {
      const name = $('#mlName').value.trim(), url = normTileUrl($('#mlUrl').value), max = clamp(parseInt($('#mlMax').value, 10) || 18, 1, 22);
      const again = e => openMyLayers({ name, url: $('#mlUrl').value, max }, e);
      if (!/^https?:\/\//i.test(url)) return again('L’adresse doit commencer par http:// ou https://');
      if (!/\{z\}/.test(url) || !/\{x\}/.test(url) || !/\{-?y\}/.test(url)) return again('L’adresse doit contenir {z}, {x} et {y}.');
      const l = { id: Date.now().toString(36), name: name || 'Mon fond ' + (myLayers.length + 1), url, max };
      myLayers.push(l); saveMyLayers(); rebuildLayerSelect(); setBaseLayer('c:' + l.id);
      toast(`Fond « ${l.name} » ajouté. S’il reste gris, vérifie l’adresse (ou le zoom maxi).`, 'ok');
    } }]);
  m.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.del; myLayers = myLayers.filter(l => l.id !== id); saveMyLayers();
    const lay = myLayerObjs.get(id); myLayerObjs.delete(id);
    if (curLayerKey === 'c:' + id) setBaseLayer('topo'); else if (lay) map.removeLayer(lay);
    rebuildLayerSelect(); openMyLayers();
  }));
}
/* ---------- Heatmap : une seule liste regroupant les couches de fréquentation / sentiers, superposées au fond ---------- */
const HEAT = {
  lidar: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&LAYER=IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&STYLE=normal', { maxNativeZoom: 18, maxZoom: 19, zIndex: 5, className: 'mult', attribution: '© IGN – LiDAR HD' }),
  ombrage: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&STYLE=estompage_grayscale', { maxNativeZoom: 15, maxZoom: 19, zIndex: 5, className: 'mult', attribution: '© IGN – Estompage' }),
  pentes: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&LAYER=GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN&STYLE=normal', { maxNativeZoom: 17, maxZoom: 19, zIndex: 5, opacity: 0.6, attribution: '© IGN – Pentes' }),
  onf: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&LAYER=FORETS.PUBLIQUES&STYLE=FORETS%20PUBLIQUES%20ONF', { maxNativeZoom: 16, maxZoom: 19, zIndex: 5, opacity: 0.8, attribution: '© IGN / ONF – Forêts publiques' }),
  prsf: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&LAYER=PROTECTEDAREAS.PRSF&STYLE=POINT%20RENCONTRE%20SECOURS%20FORET', { maxNativeZoom: 17, maxZoom: 19, zIndex: 6, attribution: '© IGN / ONF – Points de secours en forêt' }),
  porteur: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&LAYER=IGNF_ACCESSIBILITE-PHYSIQUE-FORETS-PORTEUR&STYLE=normal', { maxNativeZoom: 17, maxZoom: 19, zIndex: 5, opacity: 0.8, attribution: '© IGN – Accessibilité des forêts (portage)' }),
  skidder: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&LAYER=IGNF_ACCESSIBILITE-PHYSIQUE-FORETS-SKIDDER&STYLE=normal', { maxNativeZoom: 17, maxZoom: 19, zIndex: 5, opacity: 0.8, attribution: '© IGN – Accessibilité des forêts (débardage)' }),
  gps: L.tileLayer('https://gps.tile.openstreetmap.org/lines/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 19, zIndex: 5, opacity: 0.85, attribution: 'Traces GPS © contributeurs OpenStreetMap' }),
  hiking: L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', { maxNativeZoom: 18, maxZoom: 19, zIndex: 5, opacity: 0.85, attribution: 'Sentiers © Waymarked Trails' }),
  mtb: L.tileLayer('https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png', { maxNativeZoom: 18, maxZoom: 19, zIndex: 5, opacity: 0.85, attribution: 'VTT © Waymarked Trails' }),
  cycling: L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', { maxNativeZoom: 18, maxZoom: 19, zIndex: 5, opacity: 0.85, attribution: 'Vélo © Waymarked Trails' })
};
let curHeat = '';
const HEAT_BASE = { gps: .85, hiking: .85, mtb: .85, cycling: .85, onf: .8, porteur: .8, skidder: .8, pentes: .6, lidar: 1, ombrage: 1, prsf: 1 };
let heatLevel = {}; try { heatLevel = JSON.parse(localStorage.getItem('rbgen.heatLevel') || '{}') || {}; } catch (_) {}
/* Curseur d'intensité : 10 % à 100 % = atténuation (transparence) */
function applyHeatLevel() {
  const lay = HEAT[curHeat]; if (!lay) { $('#heatLvlBox').style.display = 'none'; return; }
  const v = clamp(+heatLevel[curHeat] || 100, 10, 100), base = HEAT_BASE[curHeat] || 1;
  $('#heatLvlBox').style.display = ''; $('#heatLvl').value = v; $('#heatLvlTxt').textContent = v + ' %';
  lay.setOpacity(Math.min(1, base * v / 100));
}
function setHeat(key) {
  if (!HEAT[key]) key = '';
  if (curHeat && HEAT[curHeat]) map.removeLayer(HEAT[curHeat]);
  curHeat = key; if (key) HEAT[key].addTo(map);
  $('#heatSel').value = key; try { localStorage.setItem('rbgen.heat', key); } catch (_) {}
  applyHeatLevel();
}
$('#heatLvl').addEventListener('input', e => { if (!curHeat) return; heatLevel[curHeat] = +e.target.value; try { localStorage.setItem('rbgen.heatLevel', JSON.stringify(heatLevel)); } catch (_) {} applyHeatLevel(); });
$('#heatLvlTxt').addEventListener('dblclick', () => { if (curHeat) { delete heatLevel[curHeat]; applyHeatLevel(); } });
$('#heatSel').addEventListener('change', e => setHeat(e.target.value));
try { setHeat(localStorage.getItem('rbgen.heat') || ''); } catch (_) {}
$('#baseLvl').addEventListener('input', e => { baseLevel[curLayerKey] = +e.target.value; try { localStorage.setItem('rbgen.baseLevel', JSON.stringify(baseLevel)); } catch (_) {} applyBaseLevel(); });
$('#baseLvlTxt').addEventListener('dblclick', () => { delete baseLevel[curLayerKey]; applyBaseLevel(); });
$('#layerSel').addEventListener('change', e => {
  const v = e.target.value;
  if (v === '__my') { e.target.value = curLayerKey; openMyLayers(); return; }
  setBaseLayer(v);
});
rebuildLayerSelect();
let showRad = true; try { showRad = localStorage.getItem('rbgen.radii') !== '0'; } catch (_) {}
$('#radChk').checked = showRad;
$('#radChk').addEventListener('change', e => { showRad = e.target.checked; try { localStorage.setItem('rbgen.radii', showRad ? '1' : '0'); } catch (_) {} renderRadii(); });
try { const l = localStorage.getItem('rbgen.layer'); if (l) setBaseLayer(l); } catch (_) {}
applyBaseLevel();

const casing = L.polyline([], { color: '#fff', weight: 8, opacity: 0.85, interactive: false }).addTo(map);
const line = L.polyline([], { color: '#e4572e', weight: 4.5, opacity: 0.95, interactive: false }).addTo(map);
const mmLine = L.polyline([], { color: '#1b1a17', weight: 2.2, opacity: 0.9, interactive: false }).addTo(map);
const hit = L.polyline([], { weight: 22, opacity: 0, bubblingMouseEvents: false }).addTo(map);
const radLayer = L.layerGroup().addTo(map);       // cercles d'ouverture / validation des waypoints (sous les marqueurs)
const noteLayer = L.layerGroup().addTo(map);
const ctrlLayer = L.layerGroup().addTo(map);
const stageLayer = L.layerGroup().addTo(map), lockLayer = L.layerGroup().addTo(map), markLayer = L.layerGroup().addTo(map), candLayer = L.layerGroup().addTo(map);
const markers = new Map();

const arrowLayer = L.layerGroup().addTo(map);
/* Flèches de sens de parcours : une toutes les ~110 px écran, réparties le long de la trace (recalculées au zoom / déplacement) */
function drawArrows() {
  arrowLayer.clearLayers();
  if (S.settings.arrows === false || !S.ll || S.ll.length < 2) return;
  const b = map.getBounds().pad(0.2), GAP = 110;
  let acc = GAP / 2, prev = map.latLngToLayerPoint(S.ll[0]), cnt = 0;
  for (let i = 1; i < S.ll.length && cnt < 400; i++) {
    const pt = map.latLngToLayerPoint(S.ll[i]);
    const dx = pt.x - prev.x, dy = pt.y - prev.y, d = Math.hypot(dx, dy);
    if (d > 0) {
      let t = GAP - acc;
      while (t <= d) {
        const f = t / d, x = prev.x + dx * f, y = prev.y + dy * f, ll = map.layerPointToLatLng([x, y]);
        if (b.contains(ll)) {
          const ang = Math.atan2(dy, dx) * 180 / Math.PI;
          L.marker(ll, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'dirarrow', iconSize: [16, 16], iconAnchor: [8, 8],
            html: `<svg viewBox="0 0 16 16" width="16" height="16" style="transform:rotate(${ang}deg)"><path d="M2 2 L14 8 L2 14 L5 8 Z" fill="#fff" stroke="#1b1a17" stroke-width="1.4" stroke-linejoin="round"/></svg>` }) }).addTo(arrowLayer);
          cnt++;
        }
        t += GAP;
      }
      acc = d - (t - GAP);
    }
    prev = pt;
  }
}
map.on('zoomend moveend', drawArrows);
const arrowCtl = L.control({ position: 'topleft' });
arrowCtl.onAdd = () => { const d = L.DomUtil.create('div', 'leaflet-bar'); const a = L.DomUtil.create('a', 'arrowbtn', d); a.href = '#'; a.title = 'Flèches de sens de la trace : afficher / masquer'; a.textContent = '➤';
  const upd = () => a.classList.toggle('off', S.settings.arrows === false); upd();
  L.DomEvent.disableClickPropagation(d); L.DomEvent.on(a, 'click', e => { L.DomEvent.preventDefault(e); S.settings.arrows = S.settings.arrows === false; upd(); drawArrows(); save(); }); return d; };
arrowCtl.addTo(map);
function renderTrack(fit) {
  casing.setLatLngs(S.ll); line.setLatLngs(S.ll); hit.setLatLngs(S.ll); mmLine.setLatLngs(S.mm || []);
  drawArrows();
  if (fit && S.ll.length > 1) map.fitBounds(line.getBounds(), { padding: [40, 40] });
}
/* Rayons d'ouverture (o) et de validation (c) d'une note, en mètres : waypoint principal + zone de vitesse (DZ / FZ) */
function noteRadii(n) {
  const out = [];
  if (n.wp && isRadiusWP(n.wp.type)) {
    const t = n.wp.type, z = (t === 'dz' || t === 'fz') ? WP_DEF.dz : [0, 0];
    out.push({ t, o: +n.wp.open || z[0] || 0, c: +n.wp.clear || z[1] || 0 });
  }
  if (n.zone) out.push({ t: n.zone.type, o: WP_DEF.dz[0], c: WP_DEF.dz[1] });
  return out.filter(r => r.o > 0 || r.c > 0);
}
function renderRadii() {
  radLayer.clearLayers();
  if (!showRad) return;
  S.notes.forEach(n => {
    const sel = n.id === S.sel, seen = new Set();
    noteRadii(n).forEach(r => {
      if (r.o > 0 && !seen.has('o' + r.o)) { seen.add('o' + r.o); L.circle([n.lat, n.lon], { radius: r.o, color: '#1d4ed8', weight: sel ? 3 : 1.8, dashArray: '7 6', opacity: sel ? 1 : 0.8, fill: true, fillColor: '#1d4ed8', fillOpacity: sel ? 0.1 : 0.04, interactive: false }).addTo(radLayer); }
      if (r.c > 0 && !seen.has('c' + r.c)) { seen.add('c' + r.c); L.circle([n.lat, n.lon], { radius: r.c, color: '#c026d3', weight: sel ? 3 : 2, opacity: 1, fill: true, fillColor: '#c026d3', fillOpacity: sel ? 0.3 : 0.18, interactive: false }).addTo(radLayer); }
    });
  });
}
function radiiText(n) {
  const r = noteRadii(n); if (!r.length) return '';
  const a = r[0], p = [];
  if (a.o > 0) p.push(`ouverture ${a.o} m`); if (a.c > 0) p.push(`validation ${a.c} m`);
  return p.join(' · ');
}
function noteIcon(n, i) {
  const cls = 'nmk' + (n.id === S.sel ? ' sel' : n.wp || n.zone || n.fuel ? ' wp' : (n.kind === 'start' || n.kind === 'end') ? ' se' : '');
  return L.divIcon({ className: cls, html: String(i + 1), iconSize: [24, 24] });
}
function renderMarkers() {
  noteLayer.clearLayers(); markers.clear();
  S.notes.forEach((n, i) => {
    const m = L.marker([n.lat, n.lon], { icon: noteIcon(n, i), keyboard: false, riseOnHover: true });
    m.bindTooltip(() => `<div style="display:flex;gap:8px;align-items:center">${tulipSVG(n.tulip, 86)}<div><b>${i + 1} · ${km(n.s)} km</b><br>${esc(n.text).replace(/\n/g, '<br>')}${whyOf(n) ? `<br><span style="color:#6b6559;font-size:11px">💡 ${esc(whyOf(n))}</span>` : ''}${radiiText(n) ? `<br><span style="color:#6b6559">◎ ${radiiText(n)}</span>` : ''}${n.id === S.sel && !drawing ? '<br><span style="color:#b5651d">↔ glisse pour déplacer</span>' : ''}</div></div>`, { direction: 'top', offset: [0, -12], opacity: 1 });
    m.on('click', () => selectNote(n.id, 'map'));
    m.on('dragstart', () => { moving = true; document.body.classList.add('dragNote'); });
    m.on('drag', () => dragBubble(n, m));
    m.on('dragend', () => { document.body.classList.remove('dragNote'); setTimeout(() => { moving = false; }, 50); dragBubble(); moveNoteTo(n, m); });
    m.addTo(noteLayer); markers.set(n.id, m);
  });
  setMoveable();
  renderRadii();
}
let moving = false;
// une note ne peut être déplacée que si elle est sélectionnée (un clic) et qu'on n'est pas en mode dessin
function setMoveable() { S.notes.forEach(n => { const m = markers.get(n.id); if (m && m.dragging) { if (n.id === S.sel && !drawing && T) m.dragging.enable(); else m.dragging.disable(); } }); }
function refreshMarkerIcons() { S.notes.forEach((n, i) => { const m = markers.get(n.id); if (m) m.setIcon(noteIcon(n, i)); }); setMoveable(); renderRadii(); }

// régénère une note à la distance s2 exactement comme à la génération : analyse de toute la trace, puis on garde la note produite à cet endroit
let regenCache = null;
async function regenNoteAt(latlng, s2) {
  if (!G || G.key !== graphKey()) { toast('Analyse des chemins OSM en cours…'); await fetchOSM(() => {}, () => false); }
  if (!G || !G.ways.length) return null;
  const ck = G.key + '|' + JSON.stringify(S.settings) + '|' + (S.mm ? S.mm.length : 0);
  let all;
  if (regenCache && regenCache.k === ck) all = regenCache.all;
  else {
    const jn = makeJunctionNotes(G, detectEvents(G));
    const bends = detectBends(jn); bends.push(...detectOffroad([...jn, ...bends]));
    all = [startNote(), ...jn, ...bends, endNote()].sort((a, b) => a.s - b.s);
    if (S.settings.pois || S.settings.landmarks) osmExtras(G, all);
    addTrackNames(all);
    if (S.settings.followLvl !== 0 && !(S.settings.followLvl === undefined && S.settings.followRoad === false)) all = followRoad(all).notes;
    regenCache = { k: ck, all };
  }
  const dist = x => x.span ? Math.max(0, x.span[0] - s2, s2 - x.span[1]) : Math.abs(x.s - s2);
  let best = null; for (const x of all) { const d = dist(x); if (d <= 10 && (!best || d < best.d)) best = { x, d }; }
  let note; const found = !!best;
  if (best) note = JSON.parse(JSON.stringify(best.x));
  else {
    note = makeNoteAt(latlng); if (!note) return null;
    try { osmExtras(G, [note]); addTrackNames([note]); } catch (e) { console.error(e); }      // repères proches (stations, églises, lieux-dits…) comme pour les autres notes
  }
  // position libre : la note reste exactement où on l'a posée sur la trace (jamais recalée sur une intersection)
  const q = pointAt(s2), ll = inv(q[0], q[1]);
  note.s = Math.round(s2 * 10) / 10; note.lat = +ll[0].toFixed(6); note.lon = +ll[1].toFixed(6); delete note.span;
  note.id = S.nextId++; note.auto = true; note.moved = true;        // affichage identique à une note générée ; survit à une régénération
  return { note, found };
}
// petite bulle à côté du curseur pendant le déplacement : écart le long de la trace et nouveau km
function dragBubble(n, m) {
  let el = document.getElementById('dragTip');
  if (!n) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'dragTip'; $('#mapwrap').appendChild(el); }
  const p = m.getLatLng(), pr = projAll(fwd(p.lat, p.lng), 150), c = map.latLngToContainerPoint(p);
  if (!pr.length) el.textContent = 'hors trace';
  else { const s2 = pr.reduce((a, b) => b.d < a.d ? b : a).s, dm = Math.round(s2 - n.s); el.textContent = `${dm > 0 ? '+' : dm < 0 ? '−' : '±'}${Math.abs(dm)} m · ${km(s2)} km`; }
  el.style.left = (c.x + 18) + 'px'; el.style.top = (c.y - 36) + 'px';
}

/* ============================================================
   Éditeur de tulipe : retoucher les traits d'une tulipe générée (version simple)
   ============================================================ */
function tulipEditor(n, keep) {
  if (!n.tulip) { toast('Cette note n’a pas de tulipe.', 'err'); return; }
  const d = keep || JSON.parse(JSON.stringify(n.tulip));
  d.others = d.others || []; d.route = d.route || [];
  let sel = null, ip = -1, nw = null, drag = null;            // sel : 'r' (parcours bleu) ou n° d'un trait ; nw : trait en cours de dessin
  const TYPES = [['road', 'Route'], ['track', 'Piste'], ['trail', 'Hors piste']];
  const kk = () => TK / d.R;
  const toS = p => [TCX + p[0] * kk(), TCY - p[1] * kk()];
  const fromS = (x, y) => [Math.round((x - TCX) / kk() * 10) / 10, Math.round((TCY - y) / kk() * 10) / 10];
  const arr = o => o === 'r' ? d.route.map(q => q.p) : o === 'new' ? nw.p : d.others[o].p;
  const insP = (o, i, p) => { if (o === 'r') { d.route.splice(i, 0, { p, c: (d.route[Math.max(0, i - 1)] || d.route[0] || {}).c || 'track' }); if (Number.isInteger(d.sp) && i <= d.sp) d.sp++; } else arr(o).splice(i, 0, p); };
  const setP = (o, i, p) => { if (o === 'r') d.route[i].p = p; else arr(o)[i] = p; };
  const delP = (o, i) => { if (o === 'r') { d.route.splice(i, 1); if (Number.isInteger(d.sp)) { if (i < d.sp) d.sp--; else if (i === d.sp) { d.sp = null; d.reset = false; } } } else arr(o).splice(i, 1); };
  const curType = () => nw ? nw.c : sel === 'r' ? (d.route[0] || {}).c : sel != null && d.others[sel] ? d.others[sel].c : null;
  const spOk = () => Number.isInteger(d.sp) && d.sp >= 1 && d.sp <= d.route.length - 2;
  const ensureSplit = () => {           // point de séparation entrée / sortie = là où le parcours passe au centre de la tulipe
    if (spOk()) return true;
    const R = d.route; if (R.length < 2) return false;
    let best = null;
    for (let i = 0; i + 1 < R.length; i++) {
      const a = R[i].p, b = R[i + 1].p, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      const u = L2 ? clamp(-(a[0] * dx + a[1] * dy) / L2, 0, 1) : 0, q = [a[0] + u * dx, a[1] + u * dy], dd = Math.hypot(q[0], q[1]);
      if (!best || dd < best.d) best = { i, u, q, d: dd, L: Math.sqrt(L2) };
    }
    const vx = best.u * best.L < 2 && best.i >= 1 ? best.i : (1 - best.u) * best.L < 2 && best.i + 1 <= R.length - 2 ? best.i + 1 : -1;
    if (vx >= 1) { d.sp = vx; return true; }
    const u = clamp(best.u, 0.15, 0.85), a = R[best.i].p, b = R[best.i + 1].p;
    R.splice(best.i + 1, 0, { p: [Math.round((a[0] + (b[0] - a[0]) * u) * 10) / 10, Math.round((a[1] + (b[1] - a[1]) * u) * 10) / 10], c: R[best.i + 1].c });
    d.sp = best.i + 1; return true;
  };
  if (!keep && d.reset === undefined && ensureSplit()) d.reset = true;               // trait-point coché par défaut à l'ouverture (décochable)
  const entryT = () => (spOk() ? d.route[d.sp] : d.route[1] || d.route[0] || {}).c, exitT = () => (spOk() ? d.route[d.sp + 1] : d.route[d.route.length - 1] || {}).c;
  const setSide = (side, t) => { if (!ensureSplit()) return; d.route.forEach((q, k) => { if (side === 'e' ? k <= d.sp : k > d.sp) q.c = t; }); };
  const pathD = pts => 'M' + pts.map(p => { const q = toS(p); return f1(q[0]) + ' ' + f1(q[1]); }).join('L');
  const m = openModal('Modifier la tulipe', `
    <div class="help" style="margin:0 0 6px">Clique un trait pour le choisir, puis glisse ses points. Clique sur le trait choisi pour y ajouter un point. Le trait bleu est le parcours.</div>
    <div class="tulbar" id="tulBar">
      <span id="tulTypes"><button type="button" data-t="road">Route</button> <button type="button" data-t="track">Piste</button> <button type="button" data-t="trail">Hors piste</button></span>
      <span class="tsep"></span>
      <button type="button" id="tulDelPt">➖ Retirer le point</button><button type="button" id="tulSimp" title="Réduit le nombre de points du trait choisi en gardant sa forme (clique plusieurs fois pour simplifier davantage)">✂️ Simplifier</button><button type="button" id="tulDelLn">🗑 Supprimer le trait</button><button type="button" id="tulNew">＋ Nouveau trait</button>
    </div>
    <div class="help" id="tulCnt" style="margin:-2px 0 6px"></div>
    <div class="tulbar" id="tulBarR" style="display:none">
      <div class="trow"><b>Entrée</b><button type="button" data-e="road">Route</button><button type="button" data-e="track">Piste</button><button type="button" data-e="trail">Hors piste</button></div>
      <div class="trow"><b>Sortie</b><button type="button" data-x="road">Route</button><button type="button" data-x="track">Piste</button><button type="button" data-x="trail">Hors piste</button></div>
      <div class="trow"><label class="chk" style="margin:0"><input type="checkbox" id="tulReset"> Trait-point (remise à 0 du trip) entre les deux</label></div>
      <div class="trow" id="tulSide"><b>Côté</b><button type="button" data-sd="auto">Auto</button><button type="button" data-sd="r">Droite</button><button type="button" data-sd="l">Gauche</button></div>
    </div>
    <div id="tulHost"><div id="tulBg"></div><svg id="tulOv" viewBox="0 0 100 100"></svg></div>
    <div class="help" id="tulHint" style="margin-top:6px"></div>`,
    ['sp', ...(n.tulipEdited ? [{ label: 'Revenir à la tulipe automatique', cls: 'danger', onClick: () => revert() }] : []), { label: 'Annuler' }, { label: 'Enregistrer', cls: 'primary', onClick: () => confirmSave() }], { noEsc: false });
  m.classList.add('tulmodal');
  const bg = m.querySelector('#tulBg'), ov = m.querySelector('#tulOv'), hint = m.querySelector('#tulHint');
  const paint = () => {
    bg.innerHTML = tulipSVG(d, 440);
    let o = '';
    const line = (k, pts, on) => { if (pts.length < 2) return ''; return (on ? `<path d="${pathD(pts)}" fill="none" stroke="#e4572e" stroke-opacity=".4" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>` : '') + `<path data-k="${k}" d="${pathD(pts)}" fill="none" stroke="transparent" stroke-width="7" stroke-linecap="round" style="pointer-events:stroke;cursor:pointer"/>`; };
    d.others.forEach((ot, i) => { o += line(i, ot.p, sel === i); });
    if (d.route.length >= 2) o += line('r', arr('r'), sel === 'r');
    const hp = nw ? arr('new') : sel != null ? arr(sel) : [];
    if (nw && nw.p.length >= 2) o += `<path d="${pathD(nw.p)}" fill="none" stroke="#e4572e" stroke-width="1.2" stroke-dasharray="2 1.5" pointer-events="none"/>`;
    hp.forEach((p, i) => { const q = toS(p); o += `<circle data-pt="${i}" cx="${f1(q[0])}" cy="${f1(q[1])}" r="${i === ip ? 3.3 : 2.6}" fill="${i === ip ? '#e4572e' : '#fff'}" stroke="#e4572e" stroke-width="1" style="cursor:grab"/><circle data-pt="${i}" cx="${f1(q[0])}" cy="${f1(q[1])}" r="5" fill="transparent"/>`; });
    ov.innerHTML = o; ui();
  };
  const ui = () => {
    const has = sel != null || nw, t = curType(), len = nw ? 0 : sel != null ? arr(sel).length : 0;
    m.querySelectorAll('#tulBar [data-t]').forEach(b => { b.disabled = !has; b.classList.toggle('on', b.dataset.t === t); });
    m.querySelector('#tulTypes').style.display = sel === 'r' && !nw ? 'none' : '';
    m.querySelector('#tulBarR').style.display = sel === 'r' && !nw ? '' : 'none';
    m.querySelectorAll('#tulBarR [data-e]').forEach(b => b.classList.toggle('on', b.dataset.e === entryT()));
    m.querySelectorAll('#tulBarR [data-x]').forEach(b => b.classList.toggle('on', b.dataset.x === exitT()));
    m.querySelector('#tulReset').checked = !!d.reset && spOk();
    m.querySelector('#tulSide').style.display = d.reset && spOk() ? '' : 'none';
    m.querySelectorAll('#tulSide [data-sd]').forEach(b => b.classList.toggle('on', b.dataset.sd === (d.resetSide || 'auto')));
    m.querySelector('#tulDelPt').disabled = ip < 0 || (!nw && len <= 2);
    m.querySelector('#tulDelLn').disabled = nw || sel == null || sel === 'r';
    m.querySelector('#tulSimp').disabled = !!nw || sel == null || len <= 2;
    m.querySelector('#tulCnt').textContent = nw ? 'Nouveau trait : ' + nw.p.length + ' point' + (nw.p.length > 1 ? 's' : '') : sel != null ? (sel === 'r' ? 'Parcours (bleu)' : 'Trait choisi') + ' : ' + len + ' points' + (ip >= 0 ? ' · point ' + (ip + 1) + ' sélectionné' : ' · touche un point pour le choisir') : 'Touche un trait pour le choisir.';
    const bn = m.querySelector('#tulNew'); bn.textContent = nw ? '✔ Terminer le trait' : '＋ Nouveau trait'; bn.disabled = !!nw && nw.p.length < 2;
    hint.textContent = nw ? 'Clique sur le dessin pour poser les points du nouveau trait, choisis son type, puis « Terminer le trait ».' : sel === 'r' ? 'Parcours (trait bleu) : glisse ses points (le dernier est la pointe de la flèche). Choisis le type de l’entrée et de la sortie ; le trait-point se place au centre de la tulipe, à 135° du sens de marche.' : sel != null ? 'Trait choisi : glisse ses points, clique sur le trait pour en ajouter un, ou choisis son type.' : 'Aucun trait choisi.';
  };
  const pos = e => { const r = ov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100]; };
  const nearSeg = (pts, p) => {      // segment le plus proche d'un point (coordonnées dessin) ; renvoie l'indice d'insertion et le point projeté
    let best = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = toS(pts[i]), b = toS(pts[i + 1]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      const u = L2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1) : 0, q = [a[0] + u * dx, a[1] + u * dy], dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || dd < best.d) best = { i: i + 1, q, d: dd };
    }
    return best;
  };
  ov.addEventListener('pointerdown', e => {
    const p = pos(e), t = e.target;
    if (t.dataset && t.dataset.pt != null) { ip = +t.dataset.pt; drag = { o: nw ? 'new' : sel }; ov.setPointerCapture(e.pointerId); paint(); return; }
    if (nw) { nw.p.push(fromS(p[0], p[1])); ip = nw.p.length - 1; paint(); return; }
    if (t.dataset && t.dataset.k != null) {
      const k = t.dataset.k === 'r' ? 'r' : +t.dataset.k;
      if (k === sel) { const b = nearSeg(arr(k), p); if (b) { insP(k, b.i, fromS(b.q[0], b.q[1])); ip = b.i; drag = { o: k }; ov.setPointerCapture(e.pointerId); } }
      else { sel = k; ip = -1; }
      paint(); return;
    }
    sel = null; ip = -1; paint();
  });
  ov.addEventListener('pointermove', e => { if (!drag || ip < 0) return; const p = pos(e); setP(drag.o, ip, fromS(clamp(p[0], 0, 100), clamp(p[1], 0, 100))); paint(); });
  const end = () => { drag = null; };
  ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
  m.querySelectorAll('#tulBar [data-t]').forEach(b => b.onclick = () => {
    if (nw) nw.c = b.dataset.t; else if (sel === 'r') d.route.forEach(q => { q.c = b.dataset.t; }); else if (sel != null) d.others[sel].c = b.dataset.t;
    paint();
  });
  m.querySelectorAll('#tulBarR [data-e]').forEach(b => b.onclick = () => { setSide('e', b.dataset.e); paint(); });
  m.querySelectorAll('#tulBarR [data-x]').forEach(b => b.onclick = () => { setSide('x', b.dataset.x); paint(); });
  m.querySelectorAll('#tulSide [data-sd]').forEach(b => b.onclick = () => { d.resetSide = b.dataset.sd === 'auto' ? null : b.dataset.sd; paint(); });
  m.querySelector('#tulReset').onchange = e => { if (e.target.checked && !ensureSplit()) { e.target.checked = false; return; } d.reset = e.target.checked; paint(); };
  m.querySelector('#tulDelPt').onclick = () => { if (ip < 0) return; delP(nw ? 'new' : sel, ip); ip = -1; paint(); };
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, u = L2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1) : 0; return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); };
  const simp = (pts, tol, anch) => {      // Douglas-Peucker ; les points « ancres » (extrémités, séparation entrée / sortie) sont toujours gardés
    const keepI = new Set([0, pts.length - 1, ...anch]), a = [...keepI].sort((x, y) => x - y);
    const rec = (i, j) => { let mx = 0, ix = -1; for (let k = i + 1; k < j; k++) { const dd = segD(pts[k], pts[i], pts[j]); if (dd > mx) { mx = dd; ix = k; } } if (ix >= 0 && mx > tol) { keepI.add(ix); rec(i, ix); rec(ix, j); } };
    for (let k = 0; k + 1 < a.length; k++) rec(a[k], a[k + 1]);
    return [...keepI].sort((x, y) => x - y);
  };
  m.querySelector('#tulSimp').onclick = () => {
    if (nw || sel == null) return; const pts = arr(sel); if (pts.length <= 2) return;
    const anch = sel === 'r' && spOk() ? [d.sp] : []; let tol = Math.max(0.5, d.R * 0.012), idx = null;
    for (let k = 0; k < 5; k++) { idx = simp(pts, tol, anch); if (idx.length < pts.length) break; tol *= 2; }
    if (idx.length >= pts.length) { toast('Le trait a déjà le minimum de points.'); return; }
    const before = pts.length;
    if (sel === 'r') { const nd = d.sp; d.route = idx.map(i => d.route[i]); if (anch.length) d.sp = idx.indexOf(nd); } else d.others[sel].p = idx.map(i => pts[i]);
    ip = -1; paint(); toast(before + ' → ' + idx.length + ' points');
  };
  m.querySelector('#tulDelLn').onclick = () => { if (sel == null || sel === 'r') return; d.others.splice(sel, 1); sel = null; ip = -1; paint(); };
  m.querySelector('#tulNew').onclick = () => {
    if (!nw) { nw = { c: 'track', p: [] }; sel = null; ip = -1; }
    else if (nw.p.length >= 2) { d.others.push({ c: nw.c, p: nw.p }); sel = d.others.length - 1; nw = null; ip = -1; }
    paint();
  };
  const onKey = e => { if (!document.body.contains(m) || !$('#modalBg').classList.contains('show')) { document.removeEventListener('keydown', onKey); return; } if ((e.key === 'Delete' || e.key === 'Backspace') && ip >= 0 && !m.querySelector('#tulDelPt').disabled) { e.preventDefault(); m.querySelector('#tulDelPt').click(); } };
  document.addEventListener('keydown', onKey);
  const confirmSave = () => {
    openModal('Appliquer les modifications ?', 'La tulipe de la note <b>' + (S.notes.indexOf(n) + 1) + '</b> va être remplacée par ta version retouchée.<div class="help" style="margin-top:6px">Si tu régénères le roadbook ou déplaces cette note, la tulipe retouchée sera remplacée par une tulipe automatique. Tu peux aussi revenir à la tulipe automatique depuis cet éditeur.</div>',
      ['sp', { label: 'Retour à l’édition', onClick: () => tulipEditor(n, d) }, { label: 'Appliquer', cls: 'primary', onClick: () => {
        n.tulip = d; n.tulipEdited = true; n.edited = true; renderAll(); selectNote(n.id, 'map'); toast('Tulipe modifiée.', 'ok');
      } }]);
  };
  const revert = () => {
    openModal('Revenir à la tulipe automatique ?', 'Tes retouches sur cette tulipe seront perdues.', ['sp', { label: 'Annuler', onClick: () => tulipEditor(n) }, { label: 'Revenir', cls: 'danger', onClick: async () => {
      toast('Tulipe en cours de redessin…');
      try { await redrawTulip(n, n.tulip.R || S.settings.tulipR); n.tulipEdited = false; renderAll(); toast('Tulipe automatique rétablie.', 'ok'); }
      catch (e) { console.error(e); toast('Impossible de redessiner la tulipe (' + (e.message || e) + ').', 'err'); }
    } }]);
  };
  paint();
}

function moveNoteTo(n, m) {
  const back = () => { m.setLatLng([n.lat, n.lon]); renderRadii(); };
  const p = m.getLatLng(), pr = projAll(fwd(p.lat, p.lng), 150);
  if (!pr.length) { back(); toast('Trop loin de la trace : la note n’a pas bougé.', 'err'); return; }
  const best = pr.reduce((a, b) => b.d < a.d ? b : a), s2 = Math.round(best.s * 10) / 10;
  const idx = S.notes.indexOf(n) + 1, dm = Math.round(s2 - n.s);
  if (Math.abs(dm) < 1) { back(); return; }
  const q = pointAt(s2), qq = inv(q[0], q[1]); m.setLatLng(qq);      // la note se pose sur la trace en attendant ta réponse
  const done = async ok => {
    if (!ok) { back(); return; }
    const old = JSON.parse(JSON.stringify(n));
    let r = null; try { r = await regenNoteAt({ lat: qq[0], lng: qq[1] }, s2); } catch (e) { console.error(e); }
    if (!r) { back(); toast('Analyse impossible ici (chemins OSM indisponibles) : la note n’a pas bougé.', 'err'); return; }
    const id = n.id; Object.keys(n).forEach(k => delete n[k]); Object.assign(n, r.note, { id });
    renderAll(); selectNote(n.id, 'map');
    toast(`Note ${S.notes.indexOf(n) + 1} régénérée à ${km(n.s)} km${r.found ? '' : ' (aucune intersection ni virage ici : note simple)'}.`, 'ok', { label: 'Annuler', fn: () => { Object.keys(n).forEach(k => delete n[k]); Object.assign(n, old); renderAll(); selectNote(n.id, 'map'); } });
  };
  openModal('Déplacer la note ?', `<div>Note <b>${idx}</b> : de <b>${km(n.s)} km</b> à <b>${km(s2)} km</b> (${dm > 0 ? '+' : '−'}${Math.abs(dm)} m le long de la trace).</div><div class="help" style="margin-top:6px">La note est <b>entièrement régénérée</b> à la nouvelle position (texte, symboles, tulipe, CAP). Tes modifications sur cette note${n.tulipEdited ? ', y compris ta tulipe retouchée,' : ''} seront perdues, mais tu pourras annuler juste après.</div>`,
    ['sp', { label: 'Annuler', onClick: () => done(false) }, { label: 'Déplacer', cls: 'primary', onClick: () => done(true) }], { onCancel: () => done(false) });
}

hit.on('click', e => {
  if (pickClick(e.latlng)) return;
  if (drawing) {
    if (tool === 'cut') cutAt(e.latlng);
    else if (!justDragged && !stroke && tool !== 'erase' && !freeOn()) addCtrl([e.latlng.lat, e.latlng.lng]);
  } else addManualNote(e.latlng);
});
map.on('click', e => { if (pickClick(e.latlng)) return; if (drawing && !justDragged && !stroke && tool !== 'erase' && tool !== 'cut' && !freeOn()) addCtrl([e.latlng.lat, e.latlng.lng]); });
hit.on('mousedown', e => {
  if (!drawing || tool === 'cut') return;
  if (strokeStart(e.containerPoint, e.latlng)) return;
  if (S.ctrl.length >= 2) { const i = nearestSeg(e.latlng); if (i > 0) { const ls = lockedSet(); if (ls && ls.has(i) && ls.has(i - 1)) { toast('Étape verrouillée 🔒', 'err'); return; } pendingIns = { i, p0: e.containerPoint }; map.dragging.disable(); } }
});
map.on('mousedown', e => { if (drawing) strokeStart(e.containerPoint, e.latlng); });
map.on('mousemove', e => { if (drawing) strokeMove(e.containerPoint, e.latlng); });
window.addEventListener('mouseup', () => { if (pendingIns && !stroke) { pendingIns = null; map.dragging.enable(); } else strokeEnd(); });


/* ---------- Recherche d'un lieu (en haut à gauche de la carte) : géocodeur IGN (France) + Photon / OpenStreetMap (monde) ---------- */
{
  const box = $('#placeBox'), inp = $('#placeInp'), list = $('#placeList');
  let pin = null, seq = 0, timer = null;
  const goTo = (lat, lon, label, zoom) => {
    map.setView([lat, lon], Math.max(map.getZoom(), zoom || 14));
    if (pin) map.removeLayer(pin);
    pin = L.marker([lat, lon], { interactive: false, keyboard: false, title: label }).addTo(map);
    setTimeout(() => { if (pin) { map.removeLayer(pin); pin = null; } }, 15000);
    list.style.display = 'none'; inp.blur();
  };
  const parseCoords = q => {
    const m = q.trim().replace(/,/g, ' ').replace(/\s+/g, ' ').match(/^(-?\d{1,2}(?:\.\d+)?) (-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) return null; const a = +m[1], b = +m[2];
    return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] : null;
  };
  const fj = (url, ms) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(url, { signal: c.signal }).then(r => { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); }); };
  async function search(q) {
    const my = ++seq, co = parseCoords(q);
    if (co) { show([{ label: `Coordonnées ${co[0]}, ${co[1]}`, sub: 'Aller à ce point', lat: co[0], lon: co[1] }]); return; }
    list.innerHTML = '<div class="pl-info">Recherche…</div>'; list.style.display = 'block';
    const c = map.getCenter();
    const [a, b] = await Promise.allSettled([
      fj('https://data.geopf.fr/geocodage/search?limit=6&q=' + encodeURIComponent(q), 8000),
      fj(`https://photon.komoot.io/api/?limit=6&lang=fr&lat=${c.lat.toFixed(3)}&lon=${c.lng.toFixed(3)}&q=${encodeURIComponent(q)}`, 8000)
    ]);
    if (my !== seq) return;
    const out = [];
    if (a.status === 'fulfilled') for (const f of a.value.features || []) out.push({ label: f.properties.label, sub: f.properties.context || f.properties.type || '', lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], z: f.properties.type === 'street' || f.properties.type === 'housenumber' ? 16 : 14 });
    if (b.status === 'fulfilled') for (const f of b.value.features || []) {
      const P = f.properties, lat = f.geometry.coordinates[1], lon = f.geometry.coordinates[0];
      if (out.some(o => Math.abs(o.lat - lat) < 0.01 && Math.abs(o.lon - lon) < 0.01)) continue;
      out.push({ label: P.name || P.street || q, sub: [P.city || P.county, P.state, P.country].filter(Boolean).join(', '), lat, lon, z: 13 });
    }
    show(out, a.status === 'rejected' && b.status === 'rejected');
  }
  function show(items, failed) {
    list.innerHTML = '';
    if (!items.length) { list.innerHTML = `<div class="pl-info">${failed ? 'Recherche indisponible (pas de connexion ?)' : 'Aucun résultat'}</div>`; list.style.display = 'block'; return; }
    items.slice(0, 8).forEach(it => { const d = document.createElement('div'); d.className = 'pl-it'; d.innerHTML = `<b>${esc(it.label)}</b><span>${esc(it.sub || '')}</span>`; d.addEventListener('mousedown', e => { e.preventDefault(); goTo(it.lat, it.lon, it.label, it.z); }); list.appendChild(d); });
    list._first = items[0]; list.style.display = 'block';
  }
  inp.addEventListener('input', () => { clearTimeout(timer); const q = inp.value.trim(); if (q.length < 2) { list.style.display = 'none'; return; } timer = setTimeout(() => search(q), 350); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const f = list._first; if (f && list.style.display !== 'none') goTo(f.lat, f.lon, f.label, f.z); else if (inp.value.trim().length > 1) search(inp.value.trim()); } if (e.key === 'Escape') { list.style.display = 'none'; inp.blur(); } });
  inp.addEventListener('focus', () => { if (list.children.length) list.style.display = 'block'; });
  inp.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 150));
  L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
}
