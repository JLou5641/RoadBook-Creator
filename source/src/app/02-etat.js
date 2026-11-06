/* ============================================================
   2. État & sauvegarde
   ============================================================ */
const DEF_SETTINGS = { sv: 2, routeExt: true, symAuto: true, showDir: true, showRoad: true, data: 'vt', tol: 40, merge: 30, tulipR: 50, straight: true, lmOff: [], followLvl: 3, bends: true, offroad: true, bendAngle: 100, goudron: true, foot: false, showCap: true, water: true, bld: true, pois: true, landmarks: true, marksExport: true, showRO: true, showPI: true, showTR: true, arrows: true };
const S = {
  name: 'Mon roadbook', desc: '', src: '', ll: [], mm: null, ctrl: [], segs: [], notes: [], settings: { ...DEF_SETTINGS }, stages: [], marks: [], ele: null, timing: null,
  stale: false, routeMode: 'trekking', nextId: 1, sel: null
};
let T = null;    // parcours dérivé : {xy, cum, L, grid}
let G = null;    // réseau OSM : {nodes, ways, key}
const LS_KEY = 'rbgen.v1';
let saveTimer = null, saveWarned = false;

function snapshot() {
  return { v: 2, name: S.name, desc: S.desc, src: S.src, ll: S.ll, mm: S.mm, ctrl: S.ctrl, segs: S.segs, notes: S.notes, settings: S.settings,
    stale: S.stale, routeMode: S.routeMode, nextId: S.nextId, stages: S.stages, marks: S.marks, ele: S.ele, timing: S.timing, mySyms: MYS };
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot())); }
    catch (e) { if (!saveWarned) { saveWarned = true; toast('Sauvegarde auto impossible (projet trop gros) : utilise « Enregistrer le projet ».'); } }
  }, 500);
}
function restore(o) {
  S.name = o.name || 'Mon roadbook'; S.desc = o.desc || ''; S.src = o.src || ''; S.ctrl = o.ctrl || []; S.segs = o.segs || [];
  S.notes = o.notes || []; S.settings = { ...DEF_SETTINGS, ...(o.settings || {}) }; S.stale = !!o.stale;
  if ((o.settings || {}).sv !== DEF_SETTINGS.sv) S.settings = { ...S.settings, sv: DEF_SETTINGS.sv, tol: DEF_SETTINGS.tol, water: true, bld: true };
  S.routeMode = o.routeMode || 'trekking'; S.nextId = o.nextId || (Math.max(0, ...S.notes.map(n => n.id)) + 1); S.sel = null;
  for (let i = 1; i < S.ctrl.length; i++) if (S.segs[i - 1]) routeCache.set(segKey(S.ctrl[i - 1], S.ctrl[i], S.ctrl[i][2]), S.segs[i - 1]);
  if (o.mySyms) { regMySyms(o.mySyms); saveMySyms(); }      // symboles importés contenus dans le projet
  S.stages = o.stages || []; S.marks = o.marks || []; S.ele = o.ele || null; S.timing = o.timing || null; renderMarks();
  G = null;
  S.mm = o.mm || null;
  setTrack(o.ll || [], true, true);
}

