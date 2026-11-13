/* ============================================================
   7. Réseau de chemins OSM (Overpass)
   ============================================================ */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter'];
const PAVED_SURF = /^(paved|asphalt|concrete|concrete:plates|concrete:lanes|paving_stones|sett|cobblestone|unhewn_cobblestone|chipseal|metal|bricks)$/;
const UNPAVED_SURF = /^(unpaved|gravel|fine_gravel|dirt|ground|grass|compacted|sand|earth|mud|pebblestone|rock|rocks|wood|woodchips|clay|stone|grass_paver|salt|snow|ice|shells)$/;
function catOf(t) {
  const hw = t.highway || '', sf = (t.surface || '').split(';')[0];
  if (hw === 'track') { if (PAVED_SURF.test(sf)) return 'road'; return /^grade[45]$/.test(t.tracktype || '') ? 'trail' : 'track'; }
  if (/^(path|footway|bridleway|cycleway|steps|pedestrian)$/.test(hw)) return 'trail';
  return UNPAVED_SURF.test(sf) ? 'track' : 'road';
}
function wayLabel(w) {
  const t = w.tags, hw = t.highway || '';
  if (w.cat === 'road') { const r0 = (t.ref || '').split(';')[0].trim(), ref = /\d/.test(r0) && r0.length <= 12 ? ' ' + r0 : ''; return (/^(residential|living_street|pedestrian)$/.test(hw) && !ref ? 'rue' : 'route') + ref; }
  if (w.cat === 'track') return 'piste';
  return hw === 'track' ? 'petite piste' : 'sentier';
}
let liveCache = null;
function liveServers() {               // serveurs qui répondent (on n'attend pas les plus lents), vérifié toutes les 10 min
  if (liveCache && Date.now() - liveCache.t < 600000) return Promise.resolve(liveCache.list);
  return new Promise(resolve => {
    const ok = []; let settled = 0, done = false;
    const finish = () => {
      if (done) return; done = true;
      const list = ok.sort((a, b) => a.ms - b.ms).map(r => r.ep);
      liveCache = { t: Date.now(), list: list.length ? list : OVERPASS.slice() };
      resolve(liveCache.list);
    };
    for (const ep of OVERPASS) {
      const t0 = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 6000);
      fetch(ep.replace(/interpreter$/, 'status'), { mode: 'no-cors', cache: 'no-store', signal: ac.signal })
        .then(() => ok.push({ ep, ms: performance.now() - t0 }), () => {})
        .finally(() => { clearTimeout(to); settled++; if (ok.length >= 2 || settled === OVERPASS.length) finish(); });
    }
    setTimeout(() => { if (ok.length) finish(); }, 2500);
    setTimeout(finish, 6500);
  });
}
async function overpass(q, isCancelled, first, servers) {
  const list = servers && servers.length ? servers : OVERPASS;
  let lastErr = null;
  for (let round = 0; round < 4; round++) for (let k = 0; k < list.length; k++) {      // 4 tours, attente qui double entre deux tours (serveurs saturés : consigne d'Overpass)
    if (k === 0 && round > 0) await sleep(2000 * 2 ** (round - 1));
    const ep = list[(k + (first || 0)) % list.length];
    if (isCancelled()) throw new Error('annulé');
    try {
      const j = await fetchJSON(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 180000);
      if (j.remark && /error|timed out|out of memory|rate_limited/i.test(j.remark)) { lastErr = new Error(j.remark); await sleep(1000); continue; }
      j.__ep = ep.replace(/^https:\/\/([^/]+).*$/, '$1');
      return j;
    } catch (e) {
      lastErr = e;
      if (e.status === 429 || e.status === 504) await sleep(1500);
    }
  }
  throw lastErr || new Error('Serveur OSM indisponible');
}
const osmMargin = () => Math.round(Math.max(90, S.settings.tol + 15, S.settings.tulipR * 1.7));
const extraTiles = new Set();      // zones ajoutées pour les tulipes agrandies
function graphKey() { const s = S.settings; return trackSig(S.ll) + '|' + (/^(osm|ign|ignd)$/.test(s.data) ? s.data : 'vt') + '|' + osmMargin() + '|' + s.foot + '|' + s.water + '|' + s.bld + '|' + extraTiles.size + '|v5'; }
// Petits rectangles (≈ 250 m de parcours chacun) qui couvrent le couloir autour de la trace.
// Requêtes Overpass volontairement simples (rectangles + filtre "highway"), le tri se fait ici.
function routeBoxes(margin) {
  const idx = simplifyDP(T.xy, 5), pts = idx.map(i => T.xy[i]), boxes = [];
  const flush = cur => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of cur) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    const sw = inv(a - margin, b - margin), ne = inv(c + margin, d + margin);
    boxes.push([sw[0], sw[1], ne[0], ne[1]]);
  };
  let cur = [pts[0]], acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(dxy(a, b) / 250));
    for (let k = 1; k <= n; k++) {
      const p = lerp(a, b, k / n); acc += dxy(cur[cur.length - 1], p); cur.push(p);
      if (acc >= 250) { flush(cur); cur = [p]; acc = 0; }
    }
  }
  if (cur.length > 1 || !boxes.length) flush(cur);
  return boxes;
}
/* ---------- Mémoire des chemins : carreaux de 0,0025° gardés dans le navigateur (sans limite de durée) ---------- */
const TS = 0.0025, TILE_V = 3, memTiles = new Map();   // TILE_V : version du contenu des carreaux (2 = avec repères, 3 = + panneaux d'agglomération)
const tkey = (la, lo) => Math.floor(lo / TS) + ',' + Math.floor(la / TS);
const tileBox = k => { const [tx, ty] = k.split(',').map(Number); return [ty * TS, tx * TS, (ty + 1) * TS, (tx + 1) * TS]; };
const TileDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise(res => {
    try {                                   // « tiles » : zones Overpass (mode détaillé) · « vt » : tuiles vectorielles (mode rapide) · « ign » : BD TOPO
      const r = indexedDB.open('rbgen-osm', 3);
      r.onupgradeneeded = () => { const db = r.result; for (const n of ['tiles', 'vt', 'ign']) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'k' }); };
      r.onsuccess = () => res(r.result); r.onerror = r.onblocked = () => res(null);
    } catch (e) { res(null); }
  }));
  const run = (mode, fn, store) => open().then(db => new Promise(res => {
    if (!db) return res(null);
    try { const tx = db.transaction(store, mode), out = fn(tx.objectStore(store)); tx.oncomplete = () => res(out); tx.onerror = tx.onabort = () => res(out); }
    catch (e) { res(null); }
  }));
  return {
    getMany: (keys, store = 'tiles') => run('readonly', st => { const out = new Map(); for (const k of keys) { const r = st.get(k); r.onsuccess = () => { if (r.result) out.set(k, r.result); }; } return out; }, store).then(m => m || new Map()),
    putMany: (recs, store = 'tiles') => run('readwrite', st => { for (const r of recs) st.put(r); }, store),
    clear: () => Promise.all(['tiles', 'vt', 'ign'].map(n => run('readwrite', st => { st.clear(); }, n))),
    getAll: (store = 'tiles') => run('readonly', st => { const out = []; const r = st.getAll(); r.onsuccess = () => out.push(...r.result); return out; }, store).then(a => a || [])
  };
})();
function corridorTiles(margin) {
  const keys = new Set();
  for (const b of routeBoxes(margin))
    for (let ty = Math.floor(b[0] / TS); ty <= Math.floor(b[2] / TS); ty++)
      for (let tx = Math.floor(b[1] / TS); tx <= Math.floor(b[3] / TS); tx++) keys.add(tx + ',' + ty);
  return [...keys];
}
function tilesOf(pts) {
  const set = new Set();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; set.add(tkey(p[0], p[1]));
    if (i) { const a = pts[i - 1], n = Math.ceil(Math.max(Math.abs(p[0] - a[0]), Math.abs(p[1] - a[1])) / (TS / 8)); for (let k = 1; k < n; k++) set.add(tkey(a[0] + (p[0] - a[0]) * k / n, a[1] + (p[1] - a[1]) * k / n)); }
  }
  return set;
}
function mergeTiles(keys) {            // carreaux voisins → rectangles (moins d'instructions dans la requête)
  const rows = new Map();
  for (const k of keys) { const [tx, ty] = k.split(',').map(Number); if (!rows.has(ty)) rows.set(ty, []); rows.get(ty).push(tx); }
  const rects = []; let open = new Map();
  for (const ty of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = rows.get(ty).sort((a, b) => a - b), runs = [];
    for (const x of xs) { const r = runs[runs.length - 1]; if (r && x === r[1] + 1) r[1] = x; else runs.push([x, x]); }
    const next = new Map();
    for (const [x0, x1] of runs) {
      const key = x0 + ':' + x1, o = open.get(key);
      if (o && o.y1 === ty - 1) { o.y1 = ty; open.delete(key); next.set(key, o); } else next.set(key, { x0, x1, y0: ty, y1: ty });
    }
    for (const o of open.values()) rects.push(o);
    open = next;
  }
  for (const o of open.values()) rects.push(o);
  return rects.map(r => [r.y0 * TS, r.x0 * TS, (r.y1 + 1) * TS, (r.x1 + 1) * TS]);
}
function osmQuery(keys) {
  const boxes = mergeTiles(keys).map(b => b.map(v => v.toFixed(5)).join(','));
  const hw = boxes.map(b => `way["highway"](${b});`).join('');
  const ft = boxes.map(b => `way["waterway"](${b});way["natural"="water"](${b});way["building"](${b});`
    + `way["railway"~"^(rail|light_rail|narrow_gauge|tram|preserved|disused)$"](${b});way["barrier"~"^(fence|wall|hedge)$"](${b});way["landuse"="residential"](${b});`).join('');
  const po = boxes.map(b => `node["amenity"~"^(place_of_worship|fuel)$"](${b});way["amenity"~"^(place_of_worship|fuel)$"](${b});`
    + `node["man_made"~"^(water_tower|mast|tower|communications_tower|chimney|windmill|lighthouse)$"](${b});way["man_made"~"^(water_tower|tower|chimney|windmill|lighthouse)$"](${b});`
    + `node["power"="generator"]["generator:source"="wind"](${b});node["natural"~"^(peak|saddle)$"](${b});node["mountain_pass"="yes"](${b});`
    + `node["place"~"^(city|town|village|hamlet|locality|isolated_dwelling)$"](${b});node["hazard"](${b});node["traffic_sign"="city_limit"](${b});`).join('');
  return `[out:json][timeout:180];(${hw})->.h;.h out body;.h >;out qt;(${ft});out geom qt;(${po});out center qt;`;
}
function attribute(j, keys) {          // répartit la réponse Overpass dans les carreaux demandés
  const set = new Set(keys), now = Date.now();
  const recs = new Map(keys.map(k => [k, { k, v: TILE_V, t: now, w: [], n: [], f: [], p: [], ns: new Set() }]));
  const nodes = new Map(), hwNodes = new Set();
  for (const e of j.elements || []) { if (e.type === 'node') { const o = nodes.get(e.id); if (!o || (e.tags && !o.tags)) nodes.set(e.id, e); } else if (e.type === 'way' && !e.geometry && !e.center && e.nodes) e.nodes.forEach(id => hwNodes.add(id)); }
  const place = (pts, add) => {
    let hit = false; for (const k of tilesOf(pts)) if (set.has(k)) { add(recs.get(k)); hit = true; }
    if (!hit && pts.length) add(recs.get(keys[0]));
  };
  for (const e of j.elements || []) {
    if (e.type === 'node') {                    // repère isolé (château d'eau, église, col, lieu-dit…)
      if (e.tags && !hwNodes.has(e.id)) place([[e.lat, e.lon]], r => r.p.push(['n', e.id, e.lat, e.lon, e.tags]));
      continue;
    }
    if (e.type !== 'way') continue;
    if (e.center) { place([[e.center.lat, e.center.lon]], r => r.p.push(['w', e.id, e.center.lat, e.center.lon, e.tags || {}])); continue; }
    if (e.geometry) {
      const pts = e.geometry.filter(Boolean).map(g => [g.lat, g.lon]), flat = [];
      for (const p of pts) flat.push(p[0], p[1]);
      place(pts, r => r.f.push([e.id, e.tags || {}, flat]));
    } else if (e.nodes) {
      const pts = e.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => [n.lat, n.lon]);
      place(pts, r => { r.w.push([e.id, e.nodes, e.tags || {}]); for (const id of e.nodes) r.ns.add(id); });
    }
  }
  for (const r of recs.values()) { for (const id of r.ns) { const n = nodes.get(id); if (n) r.n.push(n.tags ? [id, n.lat, n.lon, n.tags] : [id, n.lat, n.lon]); } delete r.ns; }
  return [...recs.values()];
}
function tilesToElements(recs) {
  const nodes = new Map(), ways = new Map(), feats = new Map(), pois = new Map();
  for (const r of recs) { if (!r) continue; for (const n of r.n) nodes.set(n[0], n); for (const w of r.w) ways.set(w[0], w); for (const f of r.f) feats.set(f[0], f); for (const q of r.p || []) pois.set(q[0] + q[1], q); }
  const els = [];
  for (const n of nodes.values()) els.push({ type: 'node', id: n[0], lat: n[1], lon: n[2], tags: n[3] || null });
  for (const [k, q] of pois) els.push({ type: 'poi', id: k, lat: q[2], lon: q[3], tags: q[4] || {} });
  for (const w of ways.values()) els.push({ type: 'way', id: w[0], nodes: w[1], tags: w[2] });
  for (const f of feats.values()) { const g = []; for (let i = 0; i < f[2].length; i += 2) g.push({ lat: f[2][i], lon: f[2][i + 1] }); els.push({ type: 'way', id: f[0], tags: f[1], geometry: g }); }
  return els;
}
let lastFail = '';
function failReason(e) {                 // raison courte et lisible d'un échec de téléchargement
  const m = String((e && e.message) || e || '');
  if (e && e.name === 'AbortError') return 'délai dépassé';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'pas de réponse du serveur (réseau, blocage ou refus du navigateur)';
  if (/^HTTP (\d+)/.test(m)) return 'le serveur répond ' + m;
  return m.slice(0, 90);
}
async function fetchOSM(progress, isCancelled) {      // mode rapide (fond vectoriel) par défaut ; IGN ou détaillé au choix ; les autres en secours
  const want = /^(osm|ign|ignd)$/.test(S.settings.data) ? S.settings.data : 'vt';
  const order = want === 'ignd' ? ['ignd', 'vt', 'osm'] : want === 'ign' ? ['ign', 'vt', 'osm'] : want === 'vt' ? ['vt', 'osm'] : ['osm', 'vt'];      // OSM détaillé saturé : repli sur le fond vectoriel (avec message)
  const NAME = { ignd: 'BD TOPO de l’IGN (détaillé)', ign: 'BD TOPO de l’IGN', vt: 'Fond vectoriel', osm: 'OpenStreetMap détaillé' }, FN = { ignd: (p, c) => fetchIGN(p, c, true), ign: fetchIGN, vt: fetchVT, osm: fetchOverpass };
  for (let i = 0; i < order.length; i++) {
    try { return await FN[order[i]](progress, isCancelled); }
    catch (e) {
      if (isCancelled() || /annulé/.test(e.message || '') || i === order.length - 1) throw e;
      console.warn(NAME[order[i]] + ' indisponible', e);
      const why = failReason(e);
      genWarn(`${NAME[order[i]]} ${/hors de France/.test(e.message || '') ? 'absente ici (hors de France ?)' : 'indisponible'}${why ? ' — ' + why : ''} : passage au mode ${order[i + 1] === 'vt' ? 'rapide' : 'détaillé (plus lent)'}.${order[i] === 'osm' && location.protocol === 'file:' ? ' Cause probable : fichier ouvert en local, Overpass refuse ces pages — utilise la Web App (' + WEBAPP_URL + ').' : ''}`, 'err');
      lastFail = `${NAME[order[i]]} : ${why || e.message || e}`;
    }
  }
}
function corridorFilter(els, zones) {    // on garde le couloir autour de la trace, comme en mode détaillé
  const zs = new Set(zones), ll = new Map();
  for (const e of els) if (e.type === 'node') ll.set(e.id, [e.lat, e.lon]);
  const hit = pts => { for (const k of tilesOf(pts)) if (zs.has(k)) return true; return false; };
  const around = pts => {                  // grande surface (zone habitée, lac) qui englobe le couloir
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    const y0 = Math.floor(a / TS), y1 = Math.floor(c / TS), x0 = Math.floor(b / TS), x1 = Math.floor(d / TS);
    if ((y1 - y0 + 1) * (x1 - x0 + 1) > 2000) return true;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (zs.has(x + ',' + y)) return true;
    return false;
  };
  els = els.filter(e => {
    if (e.type === 'node') return true;
    if (e.type === 'poi') return zs.has(tkey(e.lat, e.lon));
    if (e.nodes) return hit(e.nodes.map(id => ll.get(id)));
    const pts = e.geometry.map(g => [g.lat, g.lon]);
    return hit(pts) || (e.tags.natural === 'water' || e.tags.landuse === 'residential' ? around(pts) : false);
  });
  const used = new Set(); for (const e of els) if (e.nodes) for (const id of e.nodes) used.add(id);
  return els.filter(e => e.type !== 'node' || used.has(e.id));
}
/* ---------- Mode IGN : BD TOPO par le service WFS de la Géoplateforme (France), cases de 0,01° gardées dans le navigateur ---------- */
let skippedLayers = new Set();
const IGN_WFS = 'https://data.geopf.fr/wfs/ows', IGN_TS = 0.01, IGN_PAGE = 5000, memIGN = new Map();
const IGN_PROPS = {      // on ne demande que les attributs utiles : réponses ~4× plus légères (moins de risque de délai dépassé)
  'BDTOPO_V3:troncon_de_route': 'geometrie,cleabs,' + IGN_ROAD_KEYS.join(','),
  'BDTOPO_V3:troncon_hydrographique': 'geometrie,cleabs,nature,position_par_rapport_au_sol',
  'BDTOPO_V3:surface_hydrographique': 'geometrie,cleabs,nature,position_par_rapport_au_sol',
  'BDTOPO_V3:batiment': 'geometrie,cleabs,nature' };
Object.assign(IGN_PROPS, {      // couches de repères (mode IGN détaillé) : champs vérifiés sur le vrai service
  'BDTOPO_V3:point_du_reseau': 'geometrie,cleabs,nature,etat_de_l_objet', 'BDTOPO_V3:troncon_de_voie_ferree': 'geometrie,cleabs,nature,position_par_rapport_au_sol,etat_de_l_objet',
  'BDTOPO_V3:construction_lineaire': 'geometrie,cleabs,nature,etat_de_l_objet', 'BDTOPO_V3:haie': 'geometrie,cleabs',
  'BDTOPO_V3:zone_d_habitation': 'geometrie,cleabs,nature,toponyme,etat_de_l_objet', 'BDTOPO_V3:lieu_dit_non_habite': 'geometrie,cleabs,nature,toponyme',
  'BDTOPO_V3:detail_orographique': 'geometrie,cleabs,nature,toponyme', 'BDTOPO_V3:reservoir': 'geometrie,cleabs,nature,etat_de_l_objet',
  'BDTOPO_V3:construction_ponctuelle': 'geometrie,cleabs,nature,toponyme,etat_de_l_objet', 'BDTOPO_V3:zone_d_activite_ou_d_interet': 'geometrie,cleabs,categorie,nature,toponyme,etat_de_l_objet' });
let ignLite = true;                                          // passe à false si le service refuse la liste d'attributs (on redemande alors tout)
async function ignQuery(layer, box, isCancelled) {      // toutes les pages d'une couche sur un rectangle
  const out = [], PG = /batiment/.test(layer) ? 1500 : IGN_PAGE;      // pages plus petites pour les bâtiments (réponses lourdes)
  for (let page = 0; page < 60; page++) {
    if (isCancelled()) throw new Error('annulé');
    const mk = () => new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: layer, OUTPUTFORMAT: 'application/json',
      BBOX: `${box[0].toFixed(5)},${box[1].toFixed(5)},${box[2].toFixed(5)},${box[3].toFixed(5)},urn:ogc:def:crs:EPSG::4326`, SORTBY: 'cleabs', COUNT: PG, STARTINDEX: page * PG,
      ...(ignLite && IGN_PROPS[layer] ? { PROPERTYNAME: IGN_PROPS[layer] } : {}) });
    let j = null, err = null;
    for (let t = 0; t < 4 && !j; t++) {                       // le service répond parfois 503 ou 429 (trop de demandes) : on réessaie en attendant de plus en plus
      try { j = await fetchJSON(IGN_WFS + '?' + mk(), {}, 90000); }
      catch (e) {
        err = e; if (isCancelled()) throw new Error('annulé');
        if (e.status === 400 && ignLite) { ignLite = false; t--; continue; }      // liste d'attributs refusée : on la retire et on recommence
        await sleep((e.status === 429 ? 2000 : 1000) * 2 ** t);
      }
    }
    if (!j) throw err || new Error('Service IGN indisponible');
    if (!Array.isArray(j.features)) throw new Error('Réponse IGN inattendue');
    out.push(...j.features);
    if (j.features.length < PG) break;
  }
  return out;
}
function ignSlim(l, f) {                 // on ne garde que ce qui sert (géométrie en lon, lat arrondis)
  const P = f.properties || {}, p = {};
  for (const k of l === 'r' ? IGN_ROAD_KEYS : IGN_EXTRA[l] ? IGN_EXTRA_KEYS : ['nature', 'position_par_rapport_au_sol']) if (P[k] != null) p[k] = P[k];
  const r = c => c.map(q => [Math.round(q[0] * 1e7) / 1e7, Math.round(q[1] * 1e7) / 1e7]);
  const g = f.geometry; if (!g) return null;
  const G = { type: g.type, coordinates: g.type === 'Point' ? [Math.round(g.coordinates[0] * 1e7) / 1e7, Math.round(g.coordinates[1] * 1e7) / 1e7] : g.type === 'LineString' ? r(g.coordinates) : g.type === 'MultiLineString' || g.type === 'Polygon' ? g.coordinates.map(r) : g.type === 'MultiPolygon' ? g.coordinates.map(p => p.map(r)) : null };
  return G.coordinates ? { l, id: f.id || P.cleabs, p, g: G } : null;
}
function ignRects(missing) {            // rectangles de cases voisines (une ligne de cases à la fois), découpés à 6 cases pour garder des réponses raisonnables
  const rows = new Map(); for (const k of missing) { const [x, y] = k.split(',').map(Number); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
  const rects = [];
  for (const [y, xs] of rows) { xs.sort((a, b) => a - b); let r = null; for (const x of xs) { if (r && x === r[1] + 1 && x - r[0] < 6) r[1] = x; else rects.push(r = [x, x, y]); } }
  return rects;
}
const IGN_XNAME = { pr: 'barrières', vf: 'voies ferrées', cl: 'murs et clôtures', ha: 'haies', zh: 'villages', ld: 'lieux-dits', do: 'sommets et cols', rs: 'châteaux d’eau', cp: 'antennes et cheminées', za: 'églises' };
async function fetchIGNExtras(cells, progress, isCancelled) {      // repères de la BD TOPO (mode IGN détaillé) : une case = ses repères, gardés à part sous la clé « x:case »
  const XK = k => 'x:' + k, recs = new Map();
  for (const k of cells) if (memIGN.has(XK(k))) recs.set(k, memIGN.get(XK(k)));
  const need = cells.filter(k => !recs.has(k));
  if (need.length) for (const [k, r] of await TileDB.getMany(need.map(XK), 'ign')) if (!(r.miss && r.miss.length)) { recs.set(k.slice(2), r); memIGN.set(k, r); }
  const missing = cells.filter(k => !recs.has(k)), failed = new Set(), got = [];
  if (missing.length) {
    const rects = ignRects(missing), codes = Object.keys(IGN_EXTRA), jobs = [];
    for (const r of rects) for (const c of codes) jobs.push({ r, c });
    const byCell = new Map(missing.map(k => [k, { k: XK(k), t: Date.now(), f: [], miss: [] }]));
    let next = 0, done = 0, stop = null;
    progress(0, `Repères de la BD TOPO (IGN)… 0/${jobs.length}`);
    const worker = async () => {
      while (!stop && next < jobs.length) {
        const j = jobs[next++], box = [j.r[2] * IGN_TS, j.r[0] * IGN_TS, (j.r[2] + 1) * IGN_TS, (j.r[1] + 1) * IGN_TS];
        let feats = [];
        const lost = () => { for (let x = j.r[0]; x <= j.r[1]; x++) { const c = byCell.get(x + ',' + j.r[2]); if (c) c.miss.push(j.c); } };      // cases non gardées en mémoire : à retélécharger la prochaine fois
        if (failed.has(j.c)) lost();                                    // cette couche a déjà échoué : on ne perd pas de temps
        else try { feats = await ignQuery(IGN_EXTRA[j.c], box, () => isCancelled() || !!stop); }
        catch (e) {
          if (/annulé/.test(e.message || '')) { stop = stop || e; break; }
          failed.add(j.c); console.warn('Repères IGN ignorés', IGN_EXTRA[j.c], e); lost();
        }
        for (const f of feats) {
          const s = ignSlim(j.c, f); if (!s) continue;
          const hit = new Set(); for (const q of ignPoints(s.g)) hit.add(Math.floor(q[1] / IGN_TS) + ',' + Math.floor(q[0] / IGN_TS));
          let placed = false; for (const k of hit) { const c = byCell.get(k); if (c) { c.f.push(s); placed = true; } }
          if (!placed) byCell.get(j.r[0] + ',' + j.r[2]).f.push(s);
        }
        done++; progress(done / jobs.length, `Repères de la BD TOPO (IGN)… ${done}/${jobs.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
    if (stop) throw stop;
    for (const c of byCell.values()) { recs.set(c.k.slice(2), c); if (!c.miss.length) got.push(c); }
  }
  if (got.length) { for (const r of got) memIGN.set(r.k, r); TileDB.putMany(got, 'ign'); }
  const out = new Map(); for (const r of recs.values()) for (const f of r.f) out.set(f.l + f.id, f);
  return { feats: [...out.values()], failed };
}
async function fetchIGN(progress, isCancelled, detail) {
  const key = graphKey();
  if (G && G.key === key) { progress(1, 'Chemins déjà en mémoire'); return G; }
  const prog0 = progress; if (detail) progress = (f, t) => prog0(f * 0.7, t);      // mode détaillé : 70 % pour les routes, 30 % pour les repères
  const zones = [...new Set([...corridorTiles(osmMargin()), ...extraTiles])];
  const cellOfZone = k => { const [tx, ty] = k.split(',').map(Number); return Math.floor(tx * TS / IGN_TS + 1e-9) + ',' + Math.floor(ty * TS / IGN_TS + 1e-9); };
  const cells = [...new Set(zones.map(cellOfZone))], recs = new Map();
  for (const k of cells) if (memIGN.has(k)) recs.set(k, memIGN.get(k));
  const need = cells.filter(k => !recs.has(k));
  if (need.length) for (const [k, r] of await TileDB.getMany(need, 'ign')) { recs.set(k, r); memIGN.set(k, r); }
  const missing = cells.filter(k => !recs.has(k)), cached = cells.length - missing.length, got = [];
  const memo = cached ? ` · ${cached} déjà en mémoire` : '';
  if (missing.length) {
    const rects = ignRects(missing);
    const layers = Object.entries(IGN_LAYERS).filter(([l]) => l === 'r' || (l === 'b' ? S.settings.bld : S.settings.water));
    const jobs = []; for (const r of rects) for (const [l, name] of layers) jobs.push({ r, l, name });
    const byCell = new Map(missing.map(k => [k, { k, t: Date.now(), f: [] }]));
    let next = 0, done = 0, fail = null; const skipped = new Set(); skippedLayers = skipped;
    progress(0, `Téléchargement de la BD TOPO (IGN)… 0/${jobs.length}${memo}`);
    const worker = async () => {
      while (!fail && next < jobs.length) {
        const j = jobs[next++], box = [j.r[2] * IGN_TS, j.r[0] * IGN_TS, (j.r[2] + 1) * IGN_TS, (j.r[1] + 1) * IGN_TS];
        try {
          let feats;
          const lab = j.l === 'b' ? 'bâtiments' : 'eau';
          if (j.l !== 'r' && skipped.has(lab)) feats = [];                       // cette couche a déjà échoué : on ne perd pas de temps
          else try { feats = await ignQuery(j.name, box, () => isCancelled() || !!fail); }
          catch (e) { if (j.l === 'r' || /annulé/.test(e.message || '')) throw e; skipped.add(lab); console.warn('Couche IGN ignorée', j.name, e); feats = []; }     // eau et bâtiments sont facultatifs : seules les routes comptent
          for (const f of feats) {
            const s = ignSlim(j.l, f); if (!s) continue;
            const pts = ignLines(s.g); const hit = new Set();
            for (const line of pts) for (const p of line) hit.add(Math.floor(p[1] / IGN_TS) + ',' + Math.floor(p[0] / IGN_TS));
            let placed = false; for (const k of hit) { const c = byCell.get(k); if (c) { c.f.push(s); placed = true; } }
            if (!placed) byCell.get(j.r[0] + ',' + j.r[2]).f.push(s);
          }
        } catch (e) { fail = fail || e; }
        done++; progress(done / jobs.length, `Téléchargement de la BD TOPO (IGN)… ${done}/${jobs.length}${memo}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
    if (fail) throw fail;
    for (const c of byCell.values()) { recs.set(c.k, c); got.push(c); }
  }
  const all = new Map(); for (const r of recs.values()) for (const f of r.f) all.set(f.l + f.id, f);
  if (![...all.values()].some(f => f.l === 'r')) throw new Error('Aucun tronçon BD TOPO ici (hors de France ?)');
  let extra = { feats: [], failed: new Set() };
  if (detail) extra = await fetchIGNExtras(cells, (f, t) => prog0(0.7 + 0.3 * f, t), isCancelled);
  prog0(1, 'Lecture des chemins…'); await sleep(20);
  G = buildGraph(corridorFilter(ignToElements([...all.values(), ...extra.feats]), zones));
  if (got.length) { for (const r of got) memIGN.set(r.k, r); TileDB.putMany(got, 'ign'); }
  G.key = key; G.used = 'bdtopo';
  G.diag = `mode IGN${detail ? ' détaillé' : ''} : BD TOPO® (© IGN, Licence Ouverte) · ${cells.length} cases (${cached} en mémoire) · ${G.ways.length} chemins retenus` + (detail ? ` · ${extra.feats.length} repères` : '')
    + (skippedLayers.size ? ` · non chargés : ${[...skippedLayers].join(', ')}` : '') + (extra.failed.size ? ` · repères non chargés : ${[...extra.failed].map(c => IGN_XNAME[c]).join(', ')}` : '');
  if (extra.failed.size) genWarn(`Repères IGN non chargés (${[...extra.failed].map(c => IGN_XNAME[c]).join(', ')}) : le service ne répond pas. Les routes sont bien là ; régénère plus tard pour les avoir.`, 'err');
  if (skippedLayers.size) genWarn(`BD TOPO : ${[...skippedLayers].join(' et ')} non chargés (le service ne répond pas), les routes sont bien là.`, 'err');
  return G;
}
/* ---------- Mode rapide : tuiles vectorielles OpenFreeMap (schéma OpenMapTiles), gardées dans le navigateur ---------- */
const VT_URLS = ['https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf', 'https://openmaptiles.data.gouv.fr/data/planet-vector/{z}/{x}/{y}.pbf'];
const memVT = new Map(), vtOk = new Set();      // vtOk : serveurs qui ont déjà fourni une vraie tuile
let vtFirst = 0;
function vtTilesFor(zones) {             // tuiles z14 qui couvrent les zones du couloir
  const n = 2 ** VT_Z, set = new Set();
  const tx = lon => Math.floor((lon + 180) / 360 * n), ty = lat => { const r = lat * D2R; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
  for (const k of zones) { const b = tileBox(k); for (let x = tx(b[1]); x <= tx(b[3] - 1e-9); x++) for (let y = ty(b[2] - 1e-9); y <= ty(b[0]); y++) set.add(VT_Z + '/' + x + '/' + y); }
  return [...set];
}
async function getVTile(k, isCancelled) {
  const [z, x, y] = k.split('/'); let lastErr = null;
  for (let round = 0; round < 2; round++) for (let i = 0; i < VT_URLS.length; i++) {
    const si = (vtFirst + i) % VT_URLS.length;
    if (isCancelled()) throw new Error('annulé');
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 15000); let r;
      try { r = await fetch(VT_URLS[si].replace('{z}', z).replace('{x}', x).replace('{y}', y), { signal: ac.signal }); } finally { clearTimeout(to); }
      if ((r.status === 204 || r.status === 404) && vtOk.has(si)) return new Uint8Array(0);      // tuile vide (mer, aucune donnée)
      if (r.status === 204 || r.status === 404) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      let b = new Uint8Array(await r.arrayBuffer());
      if (b[0] === 0x1f && b[1] === 0x8b) b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      vtFirst = si; vtOk.add(si); return b;
    } catch (e) { lastErr = e; if (e.status === 429) await sleep(1000); }
  }
  throw lastErr || new Error('Fond vectoriel indisponible');
}
async function fetchVT(progress, isCancelled) {
  const key = graphKey();
  if (G && G.key === key) { progress(1, 'Chemins déjà en mémoire'); return G; }
  const zones = [...new Set([...corridorTiles(osmMargin()), ...extraTiles])], keys = vtTilesFor(zones), data = new Map();
  for (const k of keys) if (memVT.has(k)) data.set(k, memVT.get(k));
  const need = keys.filter(k => !data.has(k));
  if (need.length) for (const [k, r] of await TileDB.getMany(need, 'vt')) { data.set(k, r.d); memVT.set(k, r.d); }
  const missing = keys.filter(k => !data.has(k)), cached = keys.length - missing.length, got = [];
  const memo = cached ? ` · ${cached} déjà en mémoire` : '';
  let next = 0, done = 0, fail = null;
  if (missing.length) progress(0, `Chargement du fond vectoriel… 0/${missing.length}${memo}`);
  const worker = async () => {
    while (!fail && next < missing.length) {
      const k = missing[next++];
      try { const d = await getVTile(k, () => isCancelled() || !!fail); data.set(k, d); got.push({ k, t: Date.now(), d }); } catch (e) { fail = fail || e; }
      done++; progress(done / missing.length, `Chargement du fond vectoriel… ${done}/${missing.length}${memo}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, missing.length) }, worker));
  if (fail) throw fail;
  if (!keys.some(k => data.get(k) && data.get(k).length)) throw new Error('Fond vectoriel vide');
  progress(1, 'Lecture des chemins…'); await sleep(20);
  const tiles = keys.map(k => { const [, x, y] = k.split('/').map(Number), d = data.get(k); return { x, y, layers: d && d.length ? decodeMVT(d) : {} }; });
  if (!tiles.some(t => t.layers.transportation)) throw new Error('Format du fond vectoriel inconnu');     // schéma changé : mode détaillé en secours
  G = buildGraph(corridorFilter(vtToElements(tiles, { barriers: new Set(Object.keys(BARRIER_TXT)) }), zones));
  if (got.length) { for (const r of got) memVT.set(r.k, r.d); TileDB.putMany(got, 'vt'); }
  G.key = key; G.used = 'ofm';
  G.diag = `mode rapide : fond vectoriel OpenFreeMap (© OpenMapTiles, données © OpenStreetMap) · ${keys.length} tuiles (${cached} en mémoire) · ${G.ways.length} chemins retenus`;
  return G;
}
/* ---------- Mode détaillé : Overpass ---------- */
async function fetchOverpass(progress, isCancelled) {
  const key = graphKey();
  if (G && G.key === key) { progress(1, 'Chemins déjà en mémoire'); return G; }
  const keys = [...new Set([...corridorTiles(osmMargin()), ...extraTiles])], now = Date.now(), recs = new Map();
  for (const k of keys) { const r = memTiles.get(k); if (r && r.v === TILE_V) recs.set(k, r); }
  const need = keys.filter(k => !recs.has(k));
  if (need.length) for (const [k, r] of await TileDB.getMany(need)) if (r.v === TILE_V) { recs.set(k, r); memTiles.set(k, r); }
  const missing = keys.filter(k => !recs.has(k)), cached = keys.length - missing.length;
  const memo = cached ? ` · ${cached} zone${cached > 1 ? 's' : ''} déjà en mémoire` : '';
  const eps = new Set(); let fetched = [];
  const servers = missing.length ? await liveServers() : [];
  for (let pass = 0; pass < 2 && missing.length; pass++) {
    // peu de requêtes (le serveur principal n'en accepte qu'environ 2 par minute) : ≤ 400 zones chacune, 2 en parallèle si utile
    const nb = Math.max(missing.length > 120 && servers.length > 1 ? 2 : 1, Math.ceil(missing.length / 400)), B = Math.ceil(missing.length / nb), batches = [];
    for (let i = 0; i < missing.length; i += B) batches.push(missing.slice(i, i + B));
    let next = 0, done = 0, fail = null; fetched = [];
    progress(0, `Téléchargement des chemins OpenStreetMap… 0/${batches.length}${memo}`);
    const worker = async w => {            // jusqu'à 3 téléchargements en parallèle, un par serveur
      while (!fail && next < batches.length) {
        const b = batches[next++];
        try {
          const j = await overpass(osmQuery(b), () => isCancelled() || !!fail, w + pass, servers);
          eps.add(j.__ep);
          for (const r of attribute(j, b)) { recs.set(r.k, r); fetched.push(r); }
        } catch (e) { fail = fail || e; }
        done++; progress(done / batches.length, `Téléchargement des chemins OpenStreetMap… ${done}/${batches.length}${memo}`);
      }
    };
    await Promise.all([0, 1].slice(0, Math.min(2, batches.length, servers.length || 1)).map(worker));
    if (fail) throw fail;
    if (fetched.some(r => r.w.length) || cached) break;    // réponse vide : on réessaie une fois avec d'autres serveurs
  }
  if (!missing.length) progress(1, `Chemins déjà en mémoire (${cached} zones)`);
  G = buildGraph(tilesToElements(keys.map(k => recs.get(k))));
  if (G.ways.length && fetched.length) { for (const r of fetched) memTiles.set(r.k, r); TileDB.putMany(fetched); }
  G.key = key; G.used = 'osm';
  G.diag = `mode détaillé : serveur ${[...eps].join(', ') || '—'} · ${keys.length} zones (${cached} en mémoire) · ${G.ways.length} chemins retenus`;
  return G;
}
function lineKind(t) {
  if (t.power === 'line') return 'ht';
  if (t.power === 'minor_line') return 'elec';
  if (/^(rail|light_rail|narrow_gauge|tram|preserved|disused)$/.test(t.railway || '')) return 'rail';
  if (/^(fence|wall|hedge)$/.test(t.barrier || '')) return t.barrier;
  if (t.landuse === 'residential') return 'resid';
  return null;
}
function featOf(t) {
  const ww = t.waterway;
  if (ww) { if (/^(river|canal)$/.test(ww)) return 'river'; if (/^(stream|brook|tidal_channel|rapids)$/.test(ww)) return 'stream'; if (/^(ditch|drain)$/.test(ww)) return 'ditch'; if (ww === 'riverbank') return 'warea'; return null; }
  if (t.natural === 'water' || t.landuse === 'reservoir') return 'warea';
  if (t.building && t.building !== 'no') return 'bld';
  return null;
}
function buildGraph(els) {
  const nodes = new Map(), ways = [], feats = [];
  for (const e of els) if (e.type === 'node') nodes.set(e.id, { id: e.id, lat: e.lat, lon: e.lon, xy: fwd(e.lat, e.lon), br: [], tags: e.tags || null });
  const pois = [], lines = [];
  for (const e of els) if (e.type === 'poi') pois.push({ id: e.id, lat: e.lat, lon: e.lon, xy: fwd(e.lat, e.lon), tags: e.tags || {} });
  for (const e of els) if (e.type === 'way' && e.geometry) {          // cours d'eau, plans d'eau, bâtiments, lignes
    const lk = lineKind(e.tags || {});
    if (lk) {
      const lp = e.geometry.filter(Boolean).map(g => fwd(g.lat, g.lon));
      if (lp.length > 1 && (lk !== 'resid' || dxy(lp[0], lp[lp.length - 1]) < 0.5)) {
        let lb = [Infinity, Infinity, -Infinity, -Infinity];
        for (const p of lp) lb = [Math.min(lb[0], p[0]), Math.min(lb[1], p[1]), Math.max(lb[2], p[0]), Math.max(lb[3], p[1])];
        lines.push({ k: lk, pts: lp, bb: lb, tags: e.tags || {} });
      }
    }
    const k = featOf(e.tags || {}); if (!k || (k === 'bld' ? !S.settings.bld : !S.settings.water)) continue;
    const pts = e.geometry.filter(Boolean).map(g => fwd(g.lat, g.lon)); if (pts.length < 2) continue;
    const area = k === 'warea' || k === 'bld';
    if (area && dxy(pts[0], pts[pts.length - 1]) > 0.5) continue;      // polygone non fermé : ignoré
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of pts) bb = [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.max(bb[2], p[0]), Math.max(bb[3], p[1])];
    feats.push({ k, pts, bb, area });
  }
  const excl = new RegExp('^(corridor|elevator|platform|proposed|construction|abandoned|disused|razed|bus_stop|raceway|via_ferrata|escape|bus_guideway|emergency_bay|rest_area|services|traffic_island'
    + (S.settings.foot ? '' : '|footway|steps|cycleway|pedestrian') + ')$');
  for (const e of els) {
    if (e.type !== 'way' || e.geometry || !e.nodes || e.nodes.length < 2) continue;
    const tags = e.tags || {}, hw = tags.highway;
    if (!hw || excl.test(hw) || tags.area === 'yes' || /^(parking_aisle|driveway|drive-through|emergency_access)$/.test(tags.service || '')) continue;
    ways.push({ id: e.id, nodes: e.nodes, tags, cat: catOf(tags) });
  }
  for (const w of ways) {
    const n = w.nodes.length, closed = n > 2 && w.nodes[0] === w.nodes[n - 1];
    for (let i = 0; i < n; i++) {
      if (closed && i === n - 1) continue;
      const nd = nodes.get(w.nodes[i]); if (!nd) continue;
      if (i + 1 < n && w.nodes[i + 1] !== w.nodes[i]) nd.br.push({ way: w, i, dir: 1 });
      if (i - 1 >= 0 && w.nodes[i - 1] !== w.nodes[i]) nd.br.push({ way: w, i, dir: -1 });
      else if (i === 0 && closed) nd.br.push({ way: w, i: n - 1, dir: -1 });
    }
  }
  const fgrid = new Map(), big = [];
  for (const f of feats) {
    const x0 = Math.floor(f.bb[0] / CELL), x1 = Math.floor(f.bb[2] / CELL), y0 = Math.floor(f.bb[1] / CELL), y1 = Math.floor(f.bb[3] / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) { big.push(f); continue; }
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = cellKey(i, j); let a = fgrid.get(k); if (!a) fgrid.set(k, a = []); a.push(f); }
  }
  return { nodes, ways, feats, fgrid, big, pois, lines };
}
function featuresNear(g, c, R) {
  if (!g || !g.fgrid) return [];
  const set = new Set(g.big);
  const x0 = Math.floor((c[0] - R) / CELL), x1 = Math.floor((c[0] + R) / CELL), y0 = Math.floor((c[1] - R) / CELL), y1 = Math.floor((c[1] + R) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const a = g.fgrid.get(cellKey(i, j)); if (a) for (const f of a) set.add(f); }
  return [...set].filter(f => f.bb[0] <= c[0] + R && f.bb[2] >= c[0] - R && f.bb[1] <= c[1] + R && f.bb[3] >= c[1] - R);
}
function buildSegGrid(g) {
  const grid = new Map();
  for (const w of g.ways) for (let i = 0; i < w.nodes.length - 1; i++) {
    const a = g.nodes.get(w.nodes[i]), b = g.nodes.get(w.nodes[i + 1]); if (!a || !b) continue;
    const n = Math.max(1, Math.ceil(dxy(a.xy, b.xy) / 20)), cells = new Set();
    for (let k = 0; k <= n; k++) { const c = cellOf(lerp(a.xy, b.xy, k / n)); cells.add(cellKey(c[0], c[1])); }
    const sg = [w, i];
    for (const ck of cells) { let arr = grid.get(ck); if (!arr) grid.set(ck, arr = []); arr.push(sg); }
  }
  g.segGrid = grid;
}
function nearestWaySeg(g, p, maxD) {
  if (!g.segGrid) buildSegGrid(g);
  const r = Math.ceil(maxD / CELL), [cx, cy] = cellOf(p); let best = null;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const arr = g.segGrid.get(cellKey(cx + i, cy + j)); if (!arr) continue;
    for (const [w, k] of arr) {
      const a = g.nodes.get(w.nodes[k]), b = g.nodes.get(w.nodes[k + 1]);
      const pr = segProj(p, a.xy, b.xy);
      if (pr.d <= maxD && (!best || pr.d < best.d)) best = { w, k, d: pr.d, q: pr.q, a, b };
    }
  }
  return best;
}

/* ============================================================
   7b. Recalage de la trace sur les chemins (map-matching Viterbi)
   La trace (GPS bruité, dessin à main levée…) est ramenée sur les
   chemins OSM les plus probables ; les intersections sont ensuite
   repérées exactement sur ce chemin recalé.
   ============================================================ */
function prepAdj(g) {
  if (g.adjReady) return;
  for (const n of g.nodes.values()) {
    n.adj = [];
    for (const b of n.br) { const m = g.nodes.get(b.way.nodes[b.i + b.dir]); if (m) n.adj.push([m, dxy(n.xy, m.xy)]); }
  }
  g.adjReady = true;
}
function dijkstra(src, maxD) {           // distances depuis src (bornées à maxD)
  const D = new Map([[src.id, { d: 0, prev: null, n: src }]]);
  const h = [[0, src]];
  const up = i => { while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const down = i => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } };
  while (h.length) {
    const top = h[0], last = h.pop(); if (h.length) { h[0] = last; down(0); }
    const [d, n] = top; if (d > D.get(n.id).d) continue;
    for (const [m, L] of n.adj) {
      const nd = d + L; if (nd > maxD) continue;
      const cur = D.get(m.id);
      if (!cur || nd < cur.d) { D.set(m.id, { d: nd, prev: n, n: m }); h.push([nd, m]); up(h.length - 1); }
    }
  }
  return D;
}
function mmCandidates(g, p, tol) {
  const r = Math.ceil(tol / CELL), [cx, cy] = cellOf(p), seen = new Set(), list = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const arr = g.segGrid.get(cellKey(cx + i, cy + j)); if (!arr) continue;
    for (const sg of arr) {
      if (seen.has(sg)) continue; seen.add(sg);
      const [w, k] = sg, a = g.nodes.get(w.nodes[k]), b = g.nodes.get(w.nodes[k + 1]);
      if (!a || !b) continue;
      const pr = segProj(p, a.xy, b.xy);
      if (pr.d <= tol) list.push({ a, b, t: pr.t, q: pr.q, d: pr.d, len: dxy(a.xy, b.xy) });
    }
  }
  list.sort((x, y) => x.d - y.d);
  const out = [];
  for (const c of list) { if (out.some(o => dxy(o.q, c.q) < 4)) continue; out.push(c); if (out.length >= 7) break; }
  return out;
}
function netDist(a, b, getD) {
  if (a.a === b.a && a.b === b.b) return { d: Math.abs(b.t - a.t) * a.len };
  if (a.a === b.b && a.b === b.a) return { d: Math.abs(1 - b.t - a.t) * a.len };
  let best = Infinity, bx = null, by = null;
  const ea = [[a.a, a.t * a.len], [a.b, (1 - a.t) * a.len]], eb = [[b.a, b.t * b.len], [b.b, (1 - b.t) * b.len]];
  for (const [x, dx] of ea) {
    const D = getD(x);
    for (const [y, dy] of eb) { const e = D.get(y.id); if (!e) continue; const v = dx + e.d + dy; if (v < best) { best = v; bx = x; by = y; } }
  }
  return { d: best, x: bx, y: by };
}
async function mapMatch(g, prog, isCancelled) {
  prepAdj(g); if (!g.segGrid) buildSegGrid(g);
  const tol = S.settings.tol, sigma = Math.max(5, tol / 3), beta = 12, STEP = 20;
  const maxD = STEP * 3 + 2 * tol + 40;
  const cache = new Map();
  const getD = n => { let d = cache.get(n.id); if (!d) { if (cache.size > 3000) cache.clear(); d = dijkstra(n, maxD); cache.set(n.id, d); } return d; };
  const ss = []; for (let s = 0; s < T.L; s += STEP) ss.push(s); ss.push(T.L);
  const P = ss.map(pointAt);
  const chains = []; let cur = null;
  for (let k = 0; k < ss.length; k++) {
    if (k % 250 === 0) { prog(k / ss.length); await sleep(0); if (isCancelled()) throw new Error('annulé'); }
    const cs = mmCandidates(g, P[k], tol);
    if (!cs.length) { if (cur) chains.push(cur); cur = null; continue; }
    const em = cs.map(c => -0.5 * (c.d / sigma) ** 2);
    if (!cur) { cur = { k0: k, st: [{ cs, sc: em, bk: cs.map(() => -1) }] }; continue; }
    const pv = cur.st[cur.st.length - 1], ds = dxy(P[k - 1], P[k]);
    const sc = [], bk = []; let any = false;
    for (let j = 0; j < cs.length; j++) {
      let best = -Infinity, bi = -1;
      for (let i = 0; i < pv.cs.length; i++) {
        if (pv.sc[i] === -Infinity) continue;
        const nd = netDist(pv.cs[i], cs[j], getD).d; if (!isFinite(nd)) continue;
        const v = pv.sc[i] - Math.abs(nd - ds) / beta;
        if (v > best) { best = v; bi = i; }
      }
      sc.push(bi >= 0 ? best + em[j] : -Infinity); bk.push(bi); if (bi >= 0) any = true;
    }
    if (!any) { chains.push(cur); cur = { k0: k, st: [{ cs, sc: em, bk: cs.map(() => -1) }] }; continue; }
    const mx = Math.max(...sc);
    cur.st.push({ cs, sc: sc.map(v => v - mx), bk });
  }
  if (cur) chains.push(cur);
  // reconstruction du chemin le plus probable, tronçon par tronçon
  const pieces = [];
  for (const ch of chains) {
    const n = ch.st.length; if (n < 3) continue;          // tronçon trop court : on garde la trace brute
    const last = ch.st[n - 1].sc; let j = last.indexOf(Math.max(...last));
    const seq = new Array(n);
    for (let t = n - 1; t >= 0; t--) { seq[t] = ch.st[t].cs[j]; j = ch.st[t].bk[j]; }
    const pts = [seq[0].q];
    for (let t = 1; t < n; t++) {
      const a = seq[t - 1], b = seq[t], r = netDist(a, b, getD);
      if (r.x) {
        const D = getD(r.x), path = []; let e = D.get(r.y.id), guard = 0;
        while (e && guard++ < 10000) { path.push(e.n.xy); e = e.prev ? D.get(e.prev.id) : null; }
        for (let q = path.length - 1; q >= 0; q--) pts.push(path[q]);
      }
      pts.push(b.q);
    }
    pieces.push({ s0: ss[ch.k0], s1: ss[ch.k0 + n - 1], pts });
  }
  if (!pieces.length) return null;
  const out = []; let sPrev = 0, matched = 0;
  // raccord trace brute ↔ trace recalée : l'écart au point de jonction est résorbé sur 40 m (sinon on obtient un petit zigzag au lieu d'un coude net)
  const FADE = 40;
  const raw = (s0, s1, dA, dB) => {
    for (let s = s0; s < s1; s += 10) {
      let p = pointAt(s);
      if (dA && s - s0 < FADE) { const k = 1 - (s - s0) / FADE; p = [p[0] + dA[0] * k, p[1] + dA[1] * k]; }
      if (dB && s1 - s < FADE) { const k = 1 - (s1 - s) / FADE; p = [p[0] + dB[0] * k, p[1] + dB[1] * k]; }
      out.push(p);
    }
  };
  const gap = (q, s) => { const r = pointAt(s); return [q[0] - r[0], q[1] - r[1]]; };
  for (let i = 0; i < pieces.length; i++) {
    const pc = pieces[i];
    raw(sPrev, pc.s0, sPrev > 0 ? gap(pieces[i - 1].pts[pieces[i - 1].pts.length - 1], sPrev) : null, gap(pc.pts[0], pc.s0));
    for (const p of pc.pts) out.push(p); matched += polyLen(pc.pts); sPrev = pc.s1;
  }
  if (sPrev < T.L - 1) { const lp = pieces[pieces.length - 1]; raw(sPrev, T.L, gap(lp.pts[lp.pts.length - 1], sPrev), null); out.push(pointAt(T.L)); }
  const xy = out.filter((p, i) => i === 0 || dxy(p, out[i - 1]) > 0.3);
  let total = 0; for (let i = 1; i < xy.length; i++) total += dxy(xy[i - 1], xy[i]);
  return { ll: xy.map(p => { const q = inv(p[0], p[1]); return [+q[0].toFixed(6), +q[1].toFixed(6)]; }), ratio: total ? matched / total : 0 };
}

