/* ============================================================
   2. État & sauvegarde
   ============================================================ */
const DEF_SETTINGS = { sv: 2, routeExt: true, symAuto: true, showDir: true, showRoad: true, data: 'vt', tol: 40, merge: 30, tulipR: 50, straight: true, mixY: false, mixT: true, lmOff: [], followLvl: 3, bends: true, offroad: true, bendAngle: 100, goudron: true, foot: false, showCap: true, water: true, bld: true, pois: true, landmarks: true, marksExport: true, showRO: true, showPI: true, showTR: true, arrows: true };
const S = {
  name: 'Mon roadbook', desc: '', src: '', ll: [], mm: null, ctrl: [], segs: [], notes: [], settings: { ...DEF_SETTINGS }, stages: [], marks: [], ele: null, timing: null,
  stale: false, routeMode: 'trekking', snapOn: true, prevRoute: 'trekking', nextId: 1, sel: null
};
let T = null;    // parcours dérivé : {xy, cum, L, grid}
let G = null;    // réseau OSM : {nodes, ways, key}
const LS_KEY = 'rbgen.v1';
const DATA_LABEL = { bdtopo: 'BD TOPO (IGN)', ofm: 'OpenFreeMap (OSM)', osm: 'OpenStreetMap (Overpass)' };      // source des chemins réellement utilisée pour générer
const srcNote = () => {
  if (!S.dataSrc || !DATA_LABEL[S.dataSrc]) return '';
  const m = {}; for (const n of S.notes) if (n.tsrc && n.tulipEdited && n.tsrc !== S.dataSrc && DATA_LABEL[n.tsrc]) m[DATA_LABEL[n.tsrc]] = (m[DATA_LABEL[n.tsrc]] || 0) + 1;      // tulipes choisies avec l'autre source (outil de contrôle)
  const e = Object.entries(m);
  const dn = S.dataSrcN && S.dataSrcN !== S.dataSrc && DATA_LABEL[S.dataSrcN];      // tulipes et instructions de la 3e case issues de deux sources
  return 'Généré avec : ' + (dn ? 'tulipes ' + DATA_LABEL[S.dataSrc] + ' · instructions ' + DATA_LABEL[S.dataSrcN] : DATA_LABEL[S.dataSrc]) + (e.length ? ' ; tulipes choisies avec ' + e.map(([l, c]) => l + ' (' + c + (c > 1 ? ' notes)' : ' note)')).join(', ') : '');
};
let saveTimer = null, saveWarned = false;

function snapshot() {
  return { v: 2, name: S.name, desc: S.desc, src: S.src, ll: S.ll, mm: S.mm, ctrl: S.ctrl, segs: S.segs, notes: S.notes, settings: S.settings,
    stale: S.stale, routeMode: S.routeMode, snapOn: S.snapOn, prevRoute: S.prevRoute, nextId: S.nextId, stages: S.stages, marks: S.marks, ele: S.ele, timing: S.timing, dataSrc: S.dataSrc || '', dataSrcN: S.dataSrcN || '', mySyms: MYS };
}
let dirty = false;
function setDirty(v) { dirty = v; try { localStorage.setItem('rbgen.dirty', v ? '1' : ''); } catch (e) { } const b = document.getElementById('bSave'); if (b) { b.classList.toggle('dirty', v); b.title = v ? 'Modifications non sauvegardées dans un fichier : clique pour sauvegarder le projet' : 'Sauvegarder le projet en cours (fichier .json à rouvrir plus tard)'; } }
/* Historique : un instantané du projet après chaque modification (40 max), pour le bouton « Annuler » */
const HIST = [];
function updUndo() { const b = document.getElementById('bUndo'); if (b) b.disabled = HIST.length < 2; }
function histPush(str) { if (HIST.length && HIST[HIST.length - 1] === str) return; HIST.push(str); const mx = str.length > 3e6 ? 6 : 40; while (HIST.length > mx) HIST.shift(); updUndo(); }      // gros projet : moins d'étapes d'annulation gardées en mémoire
const ProjDB = (() => {      // sauvegarde automatique des gros projets (IndexedDB, bien plus de place que localStorage)
  let dbp = null; const open = () => dbp || (dbp = new Promise(res => { try { const r = indexedDB.open('rbgen-proj', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = r.onblocked = () => res(null); } catch (e) { res(null); } }));
  const run = (mode, fn) => open().then(db => new Promise(res => { if (!db) return res(null); try { const tx = db.transaction('p', mode); let out = null; const rq = fn(tx.objectStore('p')); if (rq) rq.onsuccess = () => { out = rq.result; }; tx.oncomplete = () => res(out === null ? true : out); tx.onerror = tx.onabort = () => res(null); } catch (e) { res(null); } }));
  return { has: false, put: str => run('readwrite', st => st.put(str, 'cur')), get: () => run('readonly', st => st.get('cur')).then(v => (typeof v === 'string' ? v : null)), del: () => run('readwrite', st => st.delete('cur')) };
})();
function doSave() {
  const str = JSON.stringify(snapshot());
  let ok = false;
  try { localStorage.setItem(LS_KEY, str); ok = true; if (ProjDB.has) { ProjDB.has = false; ProjDB.del(); } }
  catch (e) { }
  if (!ok) ProjDB.put(str).then(r => { if (r) { ProjDB.has = true; try { localStorage.removeItem(LS_KEY); } catch (_) { } } else if (!saveWarned) { saveWarned = true; toast('Sauvegarde auto impossible (projet trop gros) : utilise « Sauvegarder ».'); } });      // gros projet : trop lourd pour localStorage (~5 Mo) → IndexedDB
  histPush(str);
}
function save() {
  setDirty(true);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 500);
}
function undoAll() {      // revient à l'état d'avant la dernière modification, où qu'elle ait été faite
  clearTimeout(saveTimer); if (S.notes.length || S.ll.length) doSave();
  if (HIST.length < 2) { toast('Rien à annuler.'); return; }
  HIST.pop();
  const g0 = G; restore(JSON.parse(HIST[HIST.length - 1])); if (g0 && !G) G = g0;
  $('#rbName').value = S.name; $('#routeMode').value = S.routeMode;
  renderAll(); renderTrack(); clearTimeout(saveTimer); doSave(); setDirty(true); updUndo();
  toast('Modification annulée.');
}
function restore(o) {
  S.name = o.name || 'Mon roadbook'; S.desc = o.desc || ''; S.src = o.src || ''; S.ctrl = o.ctrl || []; S.segs = o.segs || [];
  S.notes = o.notes || []; S.settings = { ...DEF_SETTINGS, ...(o.settings || {}) }; S.stale = !!o.stale;
  if ((o.settings || {}).sv !== DEF_SETTINGS.sv) S.settings = { ...S.settings, sv: DEF_SETTINGS.sv, tol: DEF_SETTINGS.tol, water: true, bld: true };
  S.routeMode = o.routeMode || 'trekking'; S.snapOn = o.snapOn !== false; S.prevRoute = o.prevRoute || (S.routeMode !== 'line' ? S.routeMode : 'trekking'); S.nextId = o.nextId || (Math.max(0, ...S.notes.map(n => n.id)) + 1); S.sel = null;
  for (let i = 1; i < S.ctrl.length; i++) if (S.segs[i - 1]) routeCache.set(segKey(S.ctrl[i - 1], S.ctrl[i], S.ctrl[i][2]), S.segs[i - 1]);
  if (o.mySyms) { regMySyms(o.mySyms); saveMySyms(); }      // symboles importés contenus dans le projet
  S.stages = o.stages || []; S.marks = o.marks || []; S.ele = o.ele || null; S.timing = o.timing || null; S.dataSrc = o.dataSrc || ''; S.dataSrcN = o.dataSrcN || ''; renderMarks();
  G = null;
  S.mm = o.mm || null;
  setTrack(o.ll || [], true, true);
}

