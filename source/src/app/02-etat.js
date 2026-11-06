/* ============================================================
   2. État & sauvegarde
   ============================================================ */
const DEF_SETTINGS = { sv: 2, routeExt: true, symAuto: true, showDir: true, showRoad: true, data: 'vt', tol: 40, merge: 30, tulipR: 50, straight: true, mixY: false, mixT: true, lmOff: [], followLvl: 3, bends: true, offroad: true, bendAngle: 100, goudron: true, foot: false, showCap: true, water: true, bld: true, pois: true, landmarks: true, marksExport: true, showRO: true, showPI: true, showTR: true, arrows: true };
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
let dirty = false;
function setDirty(v) { dirty = v; try { localStorage.setItem('rbgen.dirty', v ? '1' : ''); } catch (e) { } const b = document.getElementById('bSave'); if (b) { b.classList.toggle('dirty', v); b.title = v ? 'Modifications non sauvegardées dans un fichier : clique pour sauvegarder le projet' : 'Sauvegarder le projet en cours (fichier .json à rouvrir plus tard)'; } }
/* Historique : un instantané du projet après chaque modification (40 max), pour le bouton « Annuler » */
const HIST = [];
function updUndo() { const b = document.getElementById('bUndo'); if (b) b.disabled = HIST.length < 2; }
function histPush(str) { if (HIST.length && HIST[HIST.length - 1] === str) return; HIST.push(str); if (HIST.length > 40) HIST.shift(); updUndo(); }
function doSave() {
  const str = JSON.stringify(snapshot());
  try { localStorage.setItem(LS_KEY, str); }
  catch (e) { if (!saveWarned) { saveWarned = true; toast('Sauvegarde auto impossible (projet trop gros) : utilise « Sauvegarder ».'); } }
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
  S.routeMode = o.routeMode || 'trekking'; S.nextId = o.nextId || (Math.max(0, ...S.notes.map(n => n.id)) + 1); S.sel = null;
  for (let i = 1; i < S.ctrl.length; i++) if (S.segs[i - 1]) routeCache.set(segKey(S.ctrl[i - 1], S.ctrl[i], S.ctrl[i][2]), S.segs[i - 1]);
  if (o.mySyms) { regMySyms(o.mySyms); saveMySyms(); }      // symboles importés contenus dans le projet
  S.stages = o.stages || []; S.marks = o.marks || []; S.ele = o.ele || null; S.timing = o.timing || null; renderMarks();
  G = null;
  S.mm = o.mm || null;
  setTrack(o.ll || [], true, true);
}

