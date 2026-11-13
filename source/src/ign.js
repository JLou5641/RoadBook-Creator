/* ============================================================
   Mode IGN : BD TOPO® (service WFS public de la Géoplateforme, © IGN, Licence Ouverte)
   Les tronçons de route sont coupés à chaque carrefour : leurs extrémités communes donnent les carrefours exacts.
   ============================================================ */
const IGN_LAYERS = { r: 'BDTOPO_V3:troncon_de_route', h: 'BDTOPO_V3:troncon_hydrographique', s: 'BDTOPO_V3:surface_hydrographique', b: 'BDTOPO_V3:batiment' };
// couches des repères (mode « IGN détaillé ») : code → couche BD TOPO
const IGN_EXTRA = { pr: 'BDTOPO_V3:point_du_reseau', vf: 'BDTOPO_V3:troncon_de_voie_ferree', cl: 'BDTOPO_V3:construction_lineaire', ha: 'BDTOPO_V3:haie',
  zh: 'BDTOPO_V3:zone_d_habitation', ld: 'BDTOPO_V3:lieu_dit_non_habite', do: 'BDTOPO_V3:detail_orographique', rs: 'BDTOPO_V3:reservoir', cp: 'BDTOPO_V3:construction_ponctuelle',
  za: 'BDTOPO_V3:zone_d_activite_ou_d_interet' };
const IGN_EXTRA_KEYS = ['nature', 'position_par_rapport_au_sol', 'toponyme', 'categorie', 'etat_de_l_objet'];
const IGN_ROAD_KEYS = ['nature', 'nom_collaboratif_gauche', 'nom_collaboratif_droite', 'importance', 'position_par_rapport_au_sol', 'sens_de_circulation',
  'urbain', 'prive', 'acces_vehicule_leger', 'cpx_numero', 'etat_de_l_objet', 'fictif'];
const IGN_ABBR = { AV: 'Avenue', BD: 'Boulevard', BLD: 'Boulevard', CHE: 'Chemin', CHEM: 'Chemin', RTE: 'Route', R: 'Rue', IMP: 'Impasse', ALL: 'Allée', PL: 'Place',
  TRA: 'Traverse', TSSE: 'Traverse', CRS: 'Cours', MTE: 'Montée', SQ: 'Square', PAS: 'Passage', PASS: 'Passage', HAM: 'Hameau', LOT: 'Lotissement', RES: 'Résidence',
  QUA: 'Quartier', SEN: 'Sentier', VC: 'Voie communale', CR: 'Chemin rural', ZA: 'ZA', ZI: 'ZI' };
function ignName(n) {                    // « CHE DE L'ARMEE D'AFRIQUE » → « Chemin de l'Armee d'Afrique »
  if (!n) return '';
  n = String(n).trim();
  if (n !== n.toUpperCase()) return n;
  const small = /^(de|du|des|la|le|les|et|au|aux|sur|en|à)$/;
  return n.toLowerCase().split(/\s+/).map((w, i) => {
    const up = w.toUpperCase();
    if (i === 0 && IGN_ABBR[up]) return IGN_ABBR[up];
    if (i > 0 && small.test(w)) return w;
    return w.replace(/(^|-)(l'|d')?(\p{L})/gu, (m, s, a, c) => s + (a ? (i || s ? a : a[0].toUpperCase() + a[1]) : '') + c.toUpperCase());
  }).join(' ');
}
function ignHighway(p) {                 // nature BD TOPO → étiquettes à la manière d'OSM (utilisées par tout le reste de l'appli)
  if (p.etat_de_l_objet && p.etat_de_l_objet !== 'En service') return null;
  const n = p.nature || '', imp = parseInt(p.importance, 10) || 5;
  const byImp = () => imp <= 1 ? 'trunk' : imp === 2 ? 'primary' : imp === 3 ? 'secondary' : imp === 4 ? 'tertiary' : p.urbain ? 'residential' : 'unclassified';
  let hw;
  switch (n) {
    case 'Type autoroutier': hw = 'motorway'; break;
    case 'Bretelle': hw = (imp <= 2 ? 'primary' : imp === 3 ? 'secondary' : 'tertiary') + '_link'; break;
    case 'Route à 2 chaussées': case 'Route à 1 chaussée': case 'Rond-point': hw = byImp(); break;
    case 'Route empierrée': hw = 'track'; break;
    case 'Chemin': hw = 'track'; break;
    case 'Sentier': hw = 'path'; break;
    case 'Escalier': hw = 'steps'; break;
    case 'Piste cyclable': hw = 'cycleway'; break;
    default: return null;                // bac, liaison maritime…
  }
  const t = { highway: hw, ign: n };
  if (n === 'Route empierrée') t.surface = 'gravel';
  if (n === 'Chemin') t.surface = 'unpaved';
  if (n === 'Rond-point') t.junction = 'roundabout';
  if (/gu[ée]/i.test(p.position_par_rapport_au_sol || '')) t.ford = 'yes';          // « Gué ou radier »
  const pos = parseInt(p.position_par_rapport_au_sol, 10) || 0;
  if (pos > 0) { t.bridge = 'yes'; t.layer = String(pos); } else if (pos < 0) { t.tunnel = 'yes'; t.layer = String(pos); }
  if (p.sens_de_circulation === 'Sens direct') t.oneway = 'yes'; else if (p.sens_de_circulation === 'Sens inverse') t.oneway = '-1';
  const nm = ignName(p.nom_collaboratif_gauche || p.nom_collaboratif_droite); if (nm) t.name = nm;
  if (p.cpx_numero) t.ref = String(p.cpx_numero).replace(/^([A-Z]+)\s*(\d)/, '$1 $2');
  if (p.prive === true || p.acces_vehicule_leger === 'Restreint aux ayants droit') t.access = 'private';
  return t;
}
function ignLines(g) {                   // GeoJSON (lon, lat[, z]) → listes de [lat, lon]
  if (!g) return [];
  const L = c => c.filter(q => isFinite(q[0]) && isFinite(q[1])).map(q => [q[1], q[0]]);
  if (g.type === 'LineString') return [L(g.coordinates)];
  if (g.type === 'MultiLineString') return g.coordinates.map(L);
  if (g.type === 'Polygon') return [L(g.coordinates[0] || [])];                       // contour extérieur seulement
  if (g.type === 'MultiPolygon') return g.coordinates.map(p => L(p[0] || []));
  return [];
}
function ignPoints(g) {                  // tous les sommets d'une géométrie GeoJSON, en [lat, lon]
  if (!g) return [];
  const P = c => isFinite(c[0]) && isFinite(c[1]) ? [[c[1], c[0]]] : [];
  const walk = c => typeof c[0] === 'number' ? P(c) : c.flatMap(walk);
  return g.coordinates ? walk(g.coordinates) : [];
}
function ignToElements(feats) {          // feats : [{ l: 'r'|'h'|'s'|'b' ou code de repère, id, p, g }]
  const els = [], nodeId = new Map(), nodeEl = new Map(), grid = new Map();
  let nid = 1, wid = 1;
  const addNode = (la, lo) => {          // tous les nœuds de route sont rangés dans une grille de ~10 m, pour y poser les repères ponctuels
    const el = { type: 'node', id: nid++, lat: la, lon: lo, tags: null };
    els.push(el); nodeEl.set(el.id, el);
    const gk = Math.round(la * 1e4) + ',' + Math.round(lo * 1e4); let a = grid.get(gk); if (!a) grid.set(gk, a = []); a.push(el);
    return el.id;
  };
  const endNode = (la, lo) => {          // extrémités communes (au centimètre près) = même nœud
    const k = la.toFixed(7) + ',' + lo.toFixed(7);
    let id = nodeId.get(k); if (id) return id;
    id = addNode(la, lo); nodeId.set(k, id); return id;
  };
  const nearNode = (la, lo, maxM) => {   // nœud de route le plus proche (à moins de maxM mètres)
    let best = null, bd = maxM;
    const cx = Math.round(la * 1e4), cy = Math.round(lo * 1e4), kx = 111320 * Math.cos(la * Math.PI / 180);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const el of grid.get((cx + dx) + ',' + (cy + dy)) || []) {
      const d = Math.hypot((el.lat - la) * 111320, (el.lon - lo) * kx); if (d < bd) { bd = d; best = el; }
    }
    return best;
  };
  const center = g => { const q = ignPoints(g); if (!q.length) return null; return [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length]; };
  const later = [];
  for (const f of feats) {
    const p = f.p || {};
    if (f.l === 'r') {
      const tags = ignHighway(p); if (!tags) continue;
      for (const pts of ignLines(f.g)) {
        if (pts.length < 2) continue;
        const ids = pts.map((q, i) => i === 0 || i === pts.length - 1 ? endNode(q[0], q[1]) : addNode(q[0], q[1]));
        els.push({ type: 'way', id: wid++, nodes: ids, tags });
      }
    } else if (f.l === 'h' || f.l === 's' || f.l === 'b') {
      const tags = f.l === 'h' ? { waterway: /canal/i.test(p.nature || '') ? 'canal' : /foss|écoulement canalisé/i.test(p.nature || '') ? 'ditch' : 'stream', ...(parseInt(p.position_par_rapport_au_sol, 10) < 0 ? { tunnel: 'culvert' } : {}) }
        : f.l === 's' ? { natural: 'water' } : { building: 'yes' };
      for (const pts of ignLines(f.g)) if (pts.length >= 2) els.push({ type: 'way', id: 1e9 + wid++, tags, geometry: pts.map(q => ({ lat: q[0], lon: q[1] })) });
    } else if (IGN_EXTRA[f.l]) later.push(f);
  }
  // repères (mode IGN détaillé) : mêmes étiquettes que OpenStreetMap, pour que tout le reste de l'appli les lise tels quels
  const nat = p => String(p.nature || ''), nm = p => ignName(p.toponyme);
  const line = (f, tags) => { for (const pts of ignLines(f.g)) if (pts.length >= 2) els.push({ type: 'way', id: 1e9 + wid++, tags, geometry: pts.map(q => ({ lat: q[0], lon: q[1] })) }); };
  const poi = (f, tags) => { const c = center(f.g); if (c) els.push({ type: 'poi', id: 2e9 + wid++, lat: c[0], lon: c[1], tags }); };
  const churches = [];
  for (const f of later) if (f.l === 'za' && /^Religieux$/i.test((f.p || {}).categorie || '')) { const c = center(f.g); if (c) churches.push(c); }
  const nearChurch = c => churches.some(q => Math.hypot((q[0] - c[0]) * 111320, (q[1] - c[1]) * 111320 * Math.cos(c[0] * Math.PI / 180)) < 60);
  for (const f of later) {
    const p = f.p || {}, n = nat(p);
    if (p.etat_de_l_objet && p.etat_de_l_objet !== 'En service') continue;
    switch (f.l) {
      case 'pr': {                                                    // barrières, passages à niveau, péages : posés sur le nœud de route le plus proche
        const tg = n === 'Barrière' ? { barrier: 'lift_gate' } : n === 'Passage à niveau' ? { railway: 'level_crossing' } : /péage/i.test(n) ? { barrier: 'toll_booth' } : null;
        const c = tg && center(f.g), el = c && nearNode(c[0], c[1], 6);
        if (el) el.tags = { ...(el.tags || {}), ...tg };
        break; }
      case 'vf': {                                                    // voies ferrées (croisements, ponts, passages sous voie ferrée)
        if (/métro/i.test(n)) break;
        const pos = parseInt(p.position_par_rapport_au_sol, 10) || 0;
        line(f, { railway: /tramway/i.test(n) ? 'tram' : 'rail', ...(pos > 0 ? { bridge: 'yes' } : pos < 0 ? { tunnel: 'yes' } : {}) });
        break; }
      case 'cl': if (n === 'Mur') line(f, { barrier: 'wall' }); else if (n === 'Clôture') line(f, { barrier: 'fence' }); break;
      case 'ha': line(f, { barrier: 'hedge' }); break;
      case 'zh': if (n === 'Lieu-dit habité') line(f, { landuse: 'residential', ...(nm(p) ? { name: nm(p) } : {}) }); break;     // villages : entrée / sortie
      case 'ld': if (n === 'Lieu-dit non habité' && nm(p)) poi(f, { place: 'locality', name: nm(p) }); break;
      case 'do': if (/^(Sommet|Pic)$/.test(n)) poi(f, { natural: 'peak', ...(nm(p) ? { name: nm(p) } : {}) }); else if (n === 'Col') poi(f, { natural: 'saddle', ...(nm(p) ? { name: nm(p) } : {}) }); break;
      case 'rs': if (/^Château d'eau$/i.test(n)) poi(f, { man_made: 'water_tower' }); break;
      case 'cp': {
        if (n === 'Antenne') poi(f, { man_made: 'mast', 'tower:type': 'communication' });
        else if (n === 'Cheminée') poi(f, { man_made: 'chimney' });
        else if (/^[ÉE]olienne/i.test(n)) poi(f, { power: 'generator' });
        else if (n === 'Phare') poi(f, { man_made: 'lighthouse' });
        else if (/^Moulin à vent/i.test(n)) poi(f, { man_made: 'windmill' });
        else if (n === 'Clocher') { const c = center(f.g); if (c && !nearChurch(c)) poi(f, { amenity: 'place_of_worship', religion: 'christian' }); }
        break; }
      case 'za': if (/^Religieux$/i.test(p.categorie || '')) poi(f, { amenity: 'place_of_worship', religion: /chrétien/i.test(n) ? 'christian' : 'other' }); break;
    }
  }
  return els;
}
if (typeof module !== 'undefined') module.exports = { ignToElements, ignHighway, ignName, ignPoints, IGN_LAYERS, IGN_EXTRA };
