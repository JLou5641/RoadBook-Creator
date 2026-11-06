// Réseau OSM simulé + trace GPS bruitée, pour tester sans accès à Overpass
const fs = require('fs');
const lat0 = 44.0, lon0 = 4.0, ky = Math.PI / 180 * 6371008.8, kx = Math.cos(lat0 * Math.PI / 180) * ky;
const ll = ([x, y]) => [lat0 + y / ky, lon0 + x / kx];
let nid = 1000;
const nodes = new Map();      // "x,y" -> id
const nodeOf = p => { const k = p.join(','); if (!nodes.has(k)) nodes.set(k, { id: nid++, p }); return nodes.get(k).id; };
const ways = [];
const way = (tags, pts) => ways.push({ type: 'way', id: 5000 + ways.length, nodes: pts.map(nodeOf), tags });

const A = [0, 0], B = [0, 160], C = [60, 320], D = [175, 400], E = [420, 430], F = [700, 400];
way({ highway: 'tertiary', ref: 'D 112' }, [[-600, 0], [-450, 15], [-300, 20], [-150, 10], A, [150, -10], [300, -20], [600, 0]]);
way({ highway: 'track', tracktype: 'grade2' }, [A, [10, 80], B]);
way({ highway: 'track', tracktype: 'grade2' }, [B, [-60, 230], [-120, 300]]);
way({ highway: 'track', tracktype: 'grade4' }, [B, [40, 240], C]);
way({ highway: 'path' }, [[-40, 330], C, [160, 310]]);
way({ highway: 'track', tracktype: 'grade3' }, [C, [70, 400], [80, 480], [95, 540], [120, 565], [145, 545], [160, 480], D]);
way({ highway: 'track', tracktype: 'grade3' }, [[80, 370], D]);
way({ highway: 'track', tracktype: 'grade3' }, [D, [300, 420], E]);
way({ highway: 'unclassified' }, [E, [600, 440], F]);
const N = [700, 120], NW = [686, 114], Wr = [680, 100], SW = [686, 86], Sr = [700, 80], SE = [714, 86], Er = [720, 100], NE = [714, 114];
way({ highway: 'secondary', ref: 'D 9' }, [N, [700, 200], F]);
way({ highway: 'secondary', ref: 'D 9' }, [F, [700, 700]]);
way({ highway: 'secondary', junction: 'roundabout' }, [N, NW, Wr, SW, Sr, SE, Er, NE, N]);
way({ highway: 'tertiary', ref: 'D 30' }, [[560, 100], Wr]);
way({ highway: 'secondary', ref: 'D 9' }, [Sr, [700, 0], [700, -80]]);
way({ highway: 'unclassified' }, [Er, [840, 100]]);
// chemin parallèle non relié (ne doit pas créer de note)
way({ highway: 'track' }, [[-300, 60], [-200, 62], [-100, 64]]);
way({ highway: 'track' }, [[-200, 62], [-200, 140]]);

const elements = [...ways];
for (const { id, p } of nodes.values()) { const [la, lo] = ll(p); elements.push({ type: 'node', id, lat: +la.toFixed(7), lon: +lo.toFixed(7) }); }
fs.writeFileSync(__dirname + '/overpass.json', JSON.stringify({ version: 0.6, elements }));

// parcours : D112 vers l'est, à G sur la piste en A, serrer à D en B, TD en C, épingle, à G en D, goudron en E, à D en F
const route = [[-600, 0], [-450, 15], [-300, 20], [-150, 10], A, [10, 80], B, [40, 240], C, [70, 400], [80, 480], [95, 540], [120, 565], [145, 545], [160, 480], D, [300, 420], E, [600, 440], F, [700, 200], N, NW, Wr, SW, Sr, [700, 0], [700, -80]];
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const pts = [];
for (let i = 1; i < route.length; i++) {
  const a = route[i - 1], b = route[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 6);
  for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t + 4 + gauss() * 2.5, a[1] + (b[1] - a[1]) * t - 3 + gauss() * 2.5]); }
}
pts.push(route[route.length - 1]);
const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Boucle test Cévennes</name></metadata><trk><name>Boucle test</name><trkseg>
${pts.map(p => { const [a, o] = ll(p); return `<trkpt lat="${a.toFixed(7)}" lon="${o.toFixed(7)}"/>`; }).join('\n')}
</trkseg></trk></gpx>`;
fs.writeFileSync(__dirname + '/trace.gpx', gpx);
console.log('nodes', nodes.size, 'ways', ways.length, 'trackpts', pts.length);
