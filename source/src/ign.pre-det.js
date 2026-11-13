/* ============================================================
   Mode IGN : BD TOPO® (service WFS public de la Géoplateforme, © IGN, Licence Ouverte)
   Les tronçons de route sont coupés à chaque carrefour : leurs extrémités communes donnent les carrefours exacts.
   ============================================================ */
const IGN_LAYERS = { r: 'BDTOPO_V3:troncon_de_route', h: 'BDTOPO_V3:troncon_hydrographique', s: 'BDTOPO_V3:surface_hydrographique', b: 'BDTOPO_V3:batiment' };
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
function ignToElements(feats) {          // feats : [{ l: 'r'|'h'|'s'|'b', id, p, g }]
  const els = [], nodeId = new Map();
  let nid = 1, wid = 1;
  const endNode = (la, lo) => {          // extrémités communes (au centimètre près) = même nœud
    const k = la.toFixed(7) + ',' + lo.toFixed(7);
    let id = nodeId.get(k); if (id) return id;
    id = nid++; nodeId.set(k, id); els.push({ type: 'node', id, lat: la, lon: lo, tags: null }); return id;
  };
  for (const f of feats) {
    if (f.l === 'r') {
      const tags = ignHighway(f.p || {}); if (!tags) continue;
      for (const pts of ignLines(f.g)) {
        if (pts.length < 2) continue;
        const ids = pts.map((q, i) => i === 0 || i === pts.length - 1 ? endNode(q[0], q[1]) : (els.push({ type: 'node', id: nid, lat: q[0], lon: q[1], tags: null }), nid++));
        els.push({ type: 'way', id: wid++, nodes: ids, tags });
      }
    } else {
      const p = f.p || {};
      const tags = f.l === 'h' ? { waterway: /canal/i.test(p.nature || '') ? 'canal' : /foss|écoulement canalisé/i.test(p.nature || '') ? 'ditch' : 'stream', ...(parseInt(p.position_par_rapport_au_sol, 10) < 0 ? { tunnel: 'culvert' } : {}) }
        : f.l === 's' ? { natural: 'water' } : { building: 'yes' };
      for (const pts of ignLines(f.g)) if (pts.length >= 2) els.push({ type: 'way', id: 1e9 + wid++, tags, geometry: pts.map(q => ({ lat: q[0], lon: q[1] })) });
    }
  }
  return els;
}
if (typeof module !== 'undefined') module.exports = { ignToElements, ignHighway, ignName, IGN_LAYERS };
