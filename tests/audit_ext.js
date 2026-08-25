// Harness — audit_ext.js: piny repro-first audytu zewnetrznego (Arc 31).
// Fala 1 (v1.48.2): F1.1-F1.12 — kalka (.arkdelta) + renderer/cache + XSS.
// Fala 2 (v1.48.3): F2.1-F2.21 — edytor + loader .dat + online + planer + touch + UI/zapis.
// Kazdy pin behawioralny: FAIL na bazie e357c82 (v1.48.1) -> PASS po fixie.
// Piny A2.x: FAIL na bazie abd75f0 (v1.48.2) -> PASS po fixie.
// Ekstrakcja verbatim z arkmap_studio.html (wzorzec diff_kalka.js), stuby DOM.
// Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function extract(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('BRAK KOTWICY: ' + anchor);
  let d = 0; const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('niezbalansowane klamry: ' + anchor);
}
function blockSlice(src, from, to) {
  const i = src.indexOf(from), j = src.indexOf(to);
  if (i < 0 || j < 0 || j <= i) throw new Error('blok: ' + from + ' .. ' + to);
  return src.slice(i, j);
}
const ANCHORS = [
  'function _stripRoomDefaults(room) {', 'function stableStringify(val, indent, _lvl) {',
  'function _replaceRoomData(room, snapshot) {', 'function _dispatchUndo(entry) {', 'function _dispatchRedo(entry) {',
  'function _arkdeltaBaseNote(base) {', 'function _deltaBaseCheck(base) {', 'function diffMaps(srcMap, dstMap) {',
  'function commitMoveRoomToArea(roomId, targetAreaId, label) {',
  'function commitMoveRoom(room, fromX, fromY, fromZ, toX, toY, toZ, label) {',
  'function pushUndo(entry) {',
  'function _paintStrokeRevert() {', 'function _paintStrokeCommit() {', 'function rpApplyHidden() {',
  'function _withRenderTarget(canvas2, viewState, dataOverride, fn) {', 'function buildColorCache(colors) {',
  'function buildAnsiPal() {',
  'function drawRoomsRaster() {', 'function _buildRoomsRaster() {', 'function _rasterKey() {',
  'function _buildCullIndex() {', 'function _cullQuery(rooms, vx0, vx1, vy0, vy1) {',
  'function wx(x) {', 'function wy(y) {', 'function cpx()  {', 'function isRoomHidden(r) {',
  'function openCLEditor(room, dir) {', 'function commitRoomEdit() {',
  '// ── constants.js ──', '// ── validate.js ──',
  '// ── checksum.js ──', '// ── mudlet_dat.js ──',
  '// === ARKDELTA START ===', '// ── UI: dialog + wiring',
];
for (const a of ANCHORS) {
  if (HTML.indexOf(a) !== HTML.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}

// Stale cap (F1.11) — parsowane z HTML; null na bazie (brak stalej) = pin FAIL.
const _mCull = HTML.match(/const CULL_INDEX_MAX_CELLS\s*=\s*(\d+)/);
const _mRast = HTML.match(/const RASTER_MAX_CELLS\s*=\s*(\d+)/);
const CULL_CAP   = _mCull ? +_mCull[1] : null;
const RASTER_CAP = _mRast ? +_mRast[1] : null;

// ── kod kalki (lustro diff_kalka.js; odstepstwa: prawdziwy commitMoveRoomToArea ──
// ── z licznikiem wywolan [F1.4], shimy jumpToRoom/showDirtyConfirm) ──
const KALKA_CODE =
  blockSlice(HTML, '// ── constants.js ──', '// ── validate.js ──') + '\n' +
  'const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT));\n' +
  extract(HTML, 'function _stripRoomDefaults(room) {') + '\n' +
  blockSlice(HTML, '// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  extract(HTML, 'function stableStringify(val, indent, _lvl) {') + '\n' +
  extract(HTML, 'function pushUndo(entry) {') + '\n' +
  extract(HTML, 'function _replaceRoomData(room, snapshot) {') + '\n' +
  extract(HTML, 'function _dispatchRedo(entry) {') + '\n' +
  'let _cmrtaCalls = 0;\n' +
  extract(HTML, 'function commitMoveRoomToArea(roomId, targetAreaId, label) {')
    .replace('label) {', 'label) { _cmrtaCalls++;') + '\n' +
  blockSlice(HTML, '// === ARKDELTA START ===', '// ── UI: dialog + wiring') + '\n' +
  'function _deltaCardHide() {}\n' +
  extract(HTML, 'function _arkdeltaBaseNote(base) {') + '\n' +
  extract(HTML, 'function _deltaBaseCheck(base) {') + '\n' +
  '\n;return { pushUndo, _computeBaseInfo, _deltaStripRoom, buildDelta, validateDeltaText, applyDelta, classifyDelta,'
  + ' _deltaChecksums, stableStringify, addChecksums, diffMaps, _diffEq, commitMoveRoomToArea,'
  + ' get cmrtaCalls() { return _cmrtaCalls; } };';

function makeKalkaCtx(map) {
  const m = JSON.parse(JSON.stringify(map));
  const state = {
    map: m, areas: new Map(), roomById: {}, roomArea: {},
    undoStack: [], redoStack: [], deltaLog: [], dirty: false,
    filename: 'test.arkmap', z: 0, editMode: true, selected: null, selectedLabel: null,
    baseInfo: null, editDirty: false,
  };
  for (const area of m.areas) {
    state.areas.set(area.id, area);
    for (const r of (area.rooms || [])) { state.roomById[r.id] = r; state.roomArea[r.id] = area.id; }
  }
  const toasts = [];
  const counters = { jump: 0, areaList: 0, roomsZ: 0, rasterInv: 0 };
  const fn = new Function(
    'state', '_dispatchUndo', 'updateUndoRedoUI', 'draw', 'scheduleDraw', 'toast', 'plPl', 'document',
    'download', 'escHtml', 'APP_VERSION',
    'deleteRoom', 'commitDeleteArea', 'commitAddExit', 'commitMoveRoom', 'commitDeleteExit',
    'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'refreshLabelList', 'populateEditForm', 'selectArea',
    'jumpToRoom', 'showDirtyConfirm', '_rasterInvalidate',
    KALKA_CODE
  );
  const api = fn(state, () => {}, () => {}, () => {}, () => {}, (m2) => toasts.push(m2), (n, one) => n + ' ' + one,
    { getElementById: () => null },
    () => {}, (x) => String(x), 'v1.48.2-test',
    () => {}, () => {},
    (sourceId, dir, targetId) => { const s = state.roomById[sourceId]; if (s) { s.exits = s.exits || {}; s.exits[dir] = targetId; } },  // commitAddExit: efekt jak w aplikacji
    () => {}, () => {},
    () => { counters.roomsZ++; }, () => { counters.areaList++; }, () => {}, () => {}, () => {}, () => {},
    (id) => { counters.jump++; state.selected = id; }, () => {},
    () => { counters.rasterInv++; });
  return { state, api, toasts, counters };
}

function kalkaText(api, ops) {
  const meta = { format: 'arkdelta', format_version: 2, ops_count: ops.length };
  const checksums = api._deltaChecksums(meta, ops);
  return JSON.stringify({ meta, ops, checksums });
}
const clone = o => JSON.parse(JSON.stringify(o));

// ── kod renderera (F1.7-F1.11) ──
const RASTER_FITS = HTML.indexOf('function _rasterFitsCap() {') !== -1
  ? extract(HTML, 'function _rasterFitsCap() {')
  : 'function _rasterFitsCap() { return null; }  // baza: brak helpera (pin FAIL)';
const RENDER_CODE =
  'const CELL = 18;\n' +
  'const CULL_INDEX_MIN = 256, CULL_GRID_CELLS = 16;\n' +
  'const CULL_INDEX_MAX_CELLS = CULL_CAP, RASTER_MAX_CELLS = RASTER_CAP;\n' +
  'let _rasterCache = null, _cullIndex = null, _paintStroke = null;\n' +
  'let cv = null, ctx = null, _shimActive = false;\n' +
  extract(HTML, 'function buildAnsiPal() {') + '\nconst ANSI_PAL = buildAnsiPal();\n' +
  extract(HTML, 'function wx(x) {') + '\n' +
  extract(HTML, 'function wy(y) {') + '\n' +
  extract(HTML, 'function cpx()  {') + '\n' +
  extract(HTML, 'function isRoomHidden(r) {') + '\n' +
  extract(HTML, 'function _rasterKey() {') + '\n' +
  extract(HTML, 'function _rasterInvalidate() {') + '\n' +
  extract(HTML, 'function _buildRoomsRaster() {') + '\n' +
  extract(HTML, 'function drawRoomsRaster() {') + '\n' +
  extract(HTML, 'function _buildCullIndex() {') + '\n' +
  extract(HTML, 'function _cullQuery(rooms, vx0, vx1, vy0, vy1) {') + '\n' +
  RASTER_FITS + '\n' +
  extract(HTML, 'function pushUndo(entry) {') + '\n' +
  extract(HTML, 'function commitMoveRoom(room, fromX, fromY, fromZ, toX, toY, toZ, label) {') + '\n' +
  extract(HTML, 'function _dispatchUndo(entry) {') + '\n' +
  extract(HTML, 'function _dispatchRedo(entry) {') + '\n' +
  extract(HTML, 'function _paintStrokeRevert() {') + '\n' +
  extract(HTML, 'function _paintStrokeCommit() {') + '\n' +
  extract(HTML, 'function rpApplyHidden() {') + '\n' +
  extract(HTML, 'function _withRenderTarget(canvas2, viewState, dataOverride, fn) {') + '\n' +
  extract(HTML, 'function buildColorCache(colors) {') + '\n' +
  '\n;return { commitMoveRoom, _dispatchUndo, _dispatchRedo, _paintStrokeRevert, _paintStrokeCommit, rpApplyHidden,'
  + ' drawRoomsRaster, _buildRoomsRaster, _buildCullIndex, _cullQuery, _withRenderTarget, buildColorCache, _rasterKey,'
  + ' _rasterFitsCap,'
  + ' get rasterCache() { return _rasterCache; }, set rasterCache(v) { _rasterCache = v; },'
  + ' get cullIndex() { return _cullIndex; },'
  + ' set paintStroke(v) { _paintStroke = v; },'
  + ' setCtx: (c) => { ctx = c; } };';

function makeRenderCtx(rooms) {
  const state = {
    areas: new Map(), roomById: {}, roomArea: {},
    undoStack: [], redoStack: [], deltaLog: [],
    roomsZ: rooms || [], z: 0, areaId: 1, zoom: 1, ox: 0, oy: 0,
    editMode: false, selected: null, pendingEnv: null, view: {},
    map: { colors: { env_colors: {}, custom_env_colors: {} } },
  };
  for (const r of state.roomsZ) state.roomById[r.id] = r;
  const counters = { roomsZ: 0, putImage: 0, drawImage: 0 };
  const documentStub = {
    getElementById: (id) => (id === 'rp-hidden' ? { checked: true } : null),
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData: () => { counters.putImage++; } }) }),
  };
  class ImageDataStub {
    constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
  }
  const fn = new Function(
    'state', 'buildRoomsZ', 'scheduleDraw', 'updateUndoRedoUI', '_syncEditSnapshot', 'populateEditForm',
    'document', 'toast', 'ImageData', '_envOf', 'envColorRgb', 'CULL_CAP', 'RASTER_CAP', 'buildAreaList',
    RENDER_CODE
  );
  const api = fn(state, () => { counters.roomsZ++; }, () => {}, () => {}, () => {}, () => {},
    documentStub, () => {}, ImageDataStub, (r) => (r.env ?? 1), (e) => [e & 255, e & 255, e & 255],
    CULL_CAP, RASTER_CAP, () => {});
  return { state, api, counters };
}

// ═══════════════════════════════════════════════════════════════════════════
// KALKA (F1.1-F1.6)
// ═══════════════════════════════════════════════════════════════════════════

console.log('— A1.1 (F1.1): _sim MOVE_ROOM — cien respektuje zajetosc komorki —');
{
  const map = { meta: {}, areas: [{ id: 1, name: 'A', rooms: [
    { id: 1, x: 0, y: 0, z: 0, name: 'R1', env: 1 },
    { id: 2, x: 1, y: 0, z: 0, name: 'R2', env: 1 },
  ] }], colors: { custom_env_colors: {} } };
  const c = makeKalkaCtx(map);
  const text = kalkaText(c.api, [
    { seq: 1, type: 'MOVE_ROOM', target: { roomId: 1 }, payload: { toX: 1, toY: 0, toZ: 0 } },  // na zajeta (R2)
    { seq: 2, type: 'MOVE_ROOM', target: { roomId: 2 }, payload: { toX: 0, toY: 0, toZ: 0 } },  // na zwolniona? nie — sim skip
  ]);
  const val = c.api.validateDeltaText(text);
  ok(val.ok, 'A1.1: kalka przechodzi walidacje');
  const cls = c.api.classifyDelta(val.delta);
  ok(cls[0].cls === 'hard' && cls[0].coll === true, 'A1.1: op1 (ruch na zajeta komorke) → hard/kolizja');
  ok(cls[1].cls === 'hard' && cls[1].coll === true,
    'A1.1 (F1.1): cien NIE przesunal R1 po kolizji → op2 (R2 na stara komorke R1) tez hard');
}

console.log('— A1.2 (F1.2): validateDeltaText — glebokie JSON bez RangeError —');
{
  const c = makeKalkaCtx({ meta: {}, areas: [{ id: 1, name: 'A', rooms: [] }], colors: {} });
  const DEEP = '{"a":'.repeat(10000) + '1' + '}'.repeat(10000);
  const text = '{"meta":{"format":"arkdelta","format_version":2,"ops_count":1},'
    + '"ops":[{"seq":1,"type":"EDIT_ENV_COLOR","target":{"envId":1},"payload":{"newColor":' + DEEP + '}}],'
    + '"checksums":{"file":"0","ops":["0"]}}';
  let threw = null, val = null;
  try { val = c.api.validateDeltaText(text); } catch (e) { threw = e; }
  ok(threw === null, 'A1.2 (F1.2): glebokosc 10000 → kontrolowane ok:false, bez throw (pre-fix: RangeError ze stableStringify)');
  ok(val !== null && val.ok === false && /głęboko/.test((val.errors || []).join(' ')),
    'A1.2 (F1.2): komunikat „zbyt gleboko zagniezdzona struktura"');
}

console.log('— A1.3 (F1.3): EDIT_ENV_COLOR newColor:null — round-trip —');
{
  const A = { meta: { user_data: {} }, areas: [{ id: 1, name: 'A', rooms: [
    { id: 1, x: 0, y: 0, z: 0, name: 'R1', env: 258 }] }], colors: { custom_env_colors: { '258': [1, 2, 3] } } };
  const c = makeKalkaCtx(A);
  const B = clone(A); B.colors.custom_env_colors = {};
  const text = c.api.buildDelta(c.api.diffMaps(A, B).entries, c.api._computeBaseInfo(clone(A)));
  ok(text.indexOf('"newColor": null') !== -1, 'A1.3: generator emituje newColor:null (przywrocenie domyslnego)');
  const val = c.api.validateDeltaText(text);
  ok(val.ok, 'A1.3 (F1.3): kalka z newColor:null przechodzi walidacje (pre-fix: odrzucona)');
  const B2 = clone(A); B2.colors.custom_env_colors = { '258': [9, 9, 9] };
  const val2 = c.api.validateDeltaText(c.api.buildDelta(c.api.diffMaps(A, B2).entries, c.api._computeBaseInfo(clone(A))));
  ok(val2.ok, 'A1.3: regresja — zmiana koloru (newColor [r,g,b]) nadal przechodzi');
}

console.log('— A1.4 (F1.4): applyDelta MOVE_ROOM_TO_AREA — sciezka data-only —');
{
  const map = { meta: {}, areas: [
    { id: 1, name: 'A1', rooms: [
      { id: 1, x: 0, y: 0, z: 0, name: 'R1', env: 1, area: 1 },
      { id: 2, x: 1, y: 0, z: 0, name: 'R2', env: 1, area: 1 }] },
    { id: 2, name: 'A2', rooms: [] },
  ], colors: {} };
  const c = makeKalkaCtx(map);
  const text = kalkaText(c.api, [
    { seq: 1, type: 'MOVE_ROOM_TO_AREA', target: { roomId: 1 }, payload: { toAreaId: 2 } },
    { seq: 2, type: 'MOVE_ROOM_TO_AREA', target: { roomId: 2 }, payload: { toAreaId: 2 } },
  ]);
  const val = c.api.validateDeltaText(text);
  ok(val.ok, 'A1.4: kalka przechodzi walidacje');
  const res = c.api.applyDelta(val.delta);
  ok(res.applied === 2, 'A1.4: applied == 2 (' + res.applied + ')');
  ok(c.state.roomArea[1] === 2 && c.state.roomArea[2] === 2, 'A1.4: roomArea przepiete');
  ok(c.state.areas.get(2).rooms.some(r => r.id === 1) && !c.state.areas.get(1).rooms.some(r => r.id === 1),
    'A1.4: rooms przepiete miedzy obszarami');
  ok(c.state.roomById[1].area === 2 && c.state.roomById[2].area === 2, 'A1.4: room.area przepiete');
  ok(c.api.cmrtaCalls === 0, 'A1.4 (F1.4): apply NIE wola UI-owego commitMoveRoomToArea (pre-fix: 2 wywolania)');
  ok(c.counters.jump === 0 && c.state.selected === null && c.state.z === 0,
    'A1.4 (F1.4): zero nawigacji per op — selected/z bez zmian (pre-fix: jumpToRoom per op)');
  ok(c.counters.areaList === 1, 'A1.4 (F1.4): buildAreaList raz po petli (pre-fix: per op = 2)');
  ok(c.state.undoStack.filter(e => e.type === 'MOVE_ROOM_TO_AREA').length === 2, 'A1.4: wpisy undo na stosie');
}

console.log('— A1.5 (F1.5): sid d:N tylko w pozycjach referencyjnych —');
{
  const map = { meta: {}, areas: [{ id: 1, name: 'A', rooms: [
    { id: 5, x: 0, y: 0, z: 0, name: 'd:1', env: 1, area: 1 },
    { id: 2, x: 5, y: 5, z: 0, name: 'B', env: 1, area: 1 },
  ] }], colors: {} };
  // K5a: pokoj nazwany „d:1" + prawdziwy sid d:1 w tej samej kalce
  const c = makeKalkaCtx(map);
  const snap5 = clone(map.areas[0].rooms[0]);
  const exitCalls = [];
  const text = kalkaText(c.api, [
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 },
      payload: { room: { x: 9, y: 9, z: 0, name: 'Nowy', env: 1 } } },
    { seq: 2, type: 'ADD_EXIT', target: { sourceId: 'd:1', dir: 'e' }, payload: { targetId: 2 } },
    { seq: 3, type: 'EDIT_ROOM', target: { roomId: 5 },
      payload: { before: snap5, after: Object.assign(clone(snap5), { notes: 'x' }) } },
  ]);
  const val = c.api.validateDeltaText(text);
  ok(val.ok, 'A1.5: kalka z nazwa „d:1" i sidem d:1 przechodzi walidacje');
  const res = c.api.applyDelta(val.delta);
  ok(res.applied === 3, 'A1.5: applied == 3 (' + res.applied + ')');
  ok(c.state.roomById[5].name === 'd:1',
    'A1.5 (F1.5): nazwa pokoju „d:1" NIETKNIETA po apply (pre-fix: nadpisana swiezym id)');
  const fresh = c.state.roomById[6];
  ok(fresh && fresh.name === 'Nowy', 'A1.5: ADD_ROOM naniesiony pod swiezym id');
  // K5b: tekst „d:9" (niezdefiniowany) w polu tekstowym — nie traktowany jak sid
  const c2 = makeKalkaCtx(map);
  const snap2 = clone(map.areas[0].rooms[1]);
  const text2 = kalkaText(c2.api, [
    { seq: 1, type: 'EDIT_ROOM', target: { roomId: 2 },
      payload: { before: snap2, after: Object.assign(clone(snap2), { name: 'd:9' }) } },
  ]);
  const val2 = c2.api.validateDeltaText(text2);
  ok(val2.ok, 'A1.5b (F1.5): tekst „d:9" w nazwie NIE jest bledem „odwolanie do obiektu kalki"');
  if (val2.ok) {
    const res2 = c2.api.applyDelta(val2.delta);
    ok(res2.applied === 1 && c2.state.roomById[2].name === 'd:9',
      'A1.5b (F1.5): apply bez skipu — nazwa „d:9" naniesiona');
  } else {
    ok(false, 'A1.5b (F1.5): apply bez skipu — nazwa „d:9" naniesiona');
  }
  void exitCalls;
}

console.log('— A1.6 (F1.6): PAINT_BATCH / AUTO_FIX_SUPPRESSORS — walidacja elementow —');
{
  const map = { meta: {}, areas: [{ id: 1, name: 'A', rooms: [
    { id: 1, x: 0, y: 0, z: 0, name: 'R1', env: 1 }] }], colors: {} };
  const c = makeKalkaCtx(map);
  const t1 = kalkaText(c.api, [{ seq: 1, type: 'PAINT_BATCH', target: {}, payload: { changes: [null] } }]);
  const v1 = c.api.validateDeltaText(t1);
  ok(v1.ok === false, 'A1.6 (F1.6): changes:[null] odrzucone przez walidator (pre-fix: przechodzi)');
  let threw = null;
  try {
    c.api.classifyDelta({ meta: { format: 'arkdelta', format_version: 2, ops_count: 1 },
      ops: [{ seq: 1, type: 'PAINT_BATCH', target: {}, payload: { changes: [null] } }] });
  } catch (e) { threw = e; }
  ok(threw === null, 'A1.6 (F1.6): classifyDelta nie rzuca na changes:[null] (pre-fix: TypeError)');
  const t2 = kalkaText(c.api, [{ seq: 1, type: 'AUTO_FIX_SUPPRESSORS', target: {}, payload: { added: [null], removed: [] } }]);
  const v2 = c.api.validateDeltaText(t2);
  ok(v2.ok === false, 'A1.6 (F1.6): added:[null] odrzucone przez walidator (pre-fix: przechodzi)');
  let threw2 = null;
  try {
    c.api.classifyDelta({ meta: { format: 'arkdelta', format_version: 2, ops_count: 1 },
      ops: [{ seq: 1, type: 'AUTO_FIX_SUPPRESSORS', target: {}, payload: { added: [null], removed: [] } }] });
  } catch (e) { threw2 = e; }
  ok(threw2 === null, 'A1.6 (F1.6): classifyDelta nie rzuca na added:[null] (pre-fix: TypeError)');
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDERER / CACHE (F1.7-F1.11)
// ═══════════════════════════════════════════════════════════════════════════

console.log('— A1.7 (F1.7): swiezosc CullIndex/rastra po ruchu na tym samym Z —');
{
  const rc = makeRenderCtx([{ id: 1, x: 0, y: 0, z: 0, env: 1 }]);
  const room = rc.state.roomById[1];
  let n = rc.counters.roomsZ;
  rc.api.commitMoveRoom(room, 0, 0, 0, 3, 0, 0, 't');
  ok(rc.counters.roomsZ === n + 1, 'A1.7 (F1.7): commitMoveRoom rebuilduje roomsZ bezwarunkowo (pre-fix: nigdy)');
  n = rc.counters.roomsZ;
  rc.api._dispatchUndo({ type: 'MOVE_ROOM', roomId: 1, fromX: 0, fromY: 0, fromZ: 0, toX: 3, toY: 0, toZ: 0 });
  ok(rc.counters.roomsZ === n + 1, 'A1.7 (F1.7): undo MOVE_ROOM przy tym samym Z rebuilduje (pre-fix: tylko przy zmianie Z)');
  n = rc.counters.roomsZ;
  rc.api._dispatchRedo({ type: 'MOVE_ROOM', roomId: 1, fromX: 0, fromY: 0, fromZ: 0, toX: 3, toY: 0, toZ: 0 });
  ok(rc.counters.roomsZ === n + 1, 'A1.7 (F1.7): redo MOVE_ROOM przy tym samym Z rebuilduje (pre-fix: tylko przy zmianie Z)');
  const iApply = HTML.indexOf('function applyDelta');
  const moveCase = HTML.slice(HTML.indexOf("case 'MOVE_ROOM': {", iApply), HTML.indexOf("case 'MOVE_ROOM_TO_AREA': {", iApply));
  ok(!/buildRoomsZ\(\)/.test(moveCase), 'A1.7: applyDelta MOVE_ROOM — brak dubla buildRoomsZ (rebuild w commitMoveRoom)');
}

console.log('— A1.8 (F1.8): invalidacja rastra przy mutacjach env/symbol/hidden —');
{
  const rc = makeRenderCtx([{ id: 1, x: 0, y: 0, z: 0, env: 5 }]);
  const freshCache = () => ({ key: rc.api._rasterKey(), canvas: {}, minX: 0, maxY: 0, cols: 1, rows: 1 });
  // undo PAINT_BATCH (zmiana env) — klucz rastra NIE zawiera env: bez invalidate raster stary
  rc.api.rasterCache = freshCache();
  rc.api._dispatchUndo({ type: 'PAINT_BATCH', changes: [{ roomId: 1, beforeEnv: 7, beforeSymbol: undefined }] });
  ok(rc.api.rasterCache === null, 'A1.8 (F1.8): undo PAINT_BATCH uniewaznia raster (pre-fix: klucz bez env — stary raster)');
  rc.api.setCtx({ imageSmoothingEnabled: true, save() {}, restore() {}, drawImage: () => { rc.counters.drawImage++; }, strokeRect() {} });
  const p0 = rc.counters.putImage;
  rc.api.drawRoomsRaster();
  ok(rc.counters.putImage === p0 + 1, 'A1.8: po uniewaznieniu drawRoomsRaster rebuilduje raster');
  // redo PAINT_BATCH
  rc.api.rasterCache = freshCache();
  rc.api._dispatchRedo({ type: 'PAINT_BATCH', changes: [{ roomId: 1, afterEnv: 9, afterSymbol: undefined }] });
  ok(rc.api.rasterCache === null, 'A1.8 (F1.8): redo PAINT_BATCH uniewaznia raster');
  // _paintStrokeRevert
  rc.api.rasterCache = freshCache();
  rc.api.paintStroke = new Map([[1, { env: 5, symbol: undefined }]]);
  rc.api._paintStrokeRevert();
  ok(rc.api.rasterCache === null, 'A1.8 (F1.8): _paintStrokeRevert uniewaznia raster');
  // rpApplyHidden
  rc.state.selected = 1;
  rc.api.rasterCache = freshCache();
  rc.api.rpApplyHidden();
  ok(rc.api.rasterCache === null, 'A1.8 (F1.8): rpApplyHidden uniewaznia raster');
  // statyczne: pozostale sciezki (commitRoomEdit env/symbol, _paintStrokeCommit)
  const srcEdit = extract(HTML, 'function commitRoomEdit() {');
  ok(/_rasterInvalidate\(\)/.test(srcEdit), 'A1.8 (F1.8): commitRoomEdit invaliduje raster przy zmianie env/symbol');
  const srcCommit = extract(HTML, 'function _paintStrokeCommit() {');
  ok(/_rasterInvalidate\(\)/.test(srcCommit), 'A1.8 (F1.8): _paintStrokeCommit invaliduje raster');
}

console.log('— A1.9 (F1.9): _withRenderTarget — rebuild colorCache na podmienionych —');
{
  const rc = makeRenderCtx([]);
  rc.state.map.colors.custom_env_colors = { '7': [10, 20, 30] };
  rc.api.buildColorCache(rc.state.map.colors);
  ok(rc.state.colorCache['7'] === 'rgb(10,20,30)', 'A1.9: colorCache zbudowany z kolorow mapy');
  let inside = null;
  rc.api._withRenderTarget({ getContext: () => ({}) }, {}, { customEnvColors: { '7': [200, 100, 50] } },
    () => { inside = rc.state.colorCache['7']; });
  ok(inside === 'rgb(200,100,50)', 'A1.9 (F1.9): wewnatrz shima colorCache odpowiada PODMIENIONYM kolorom (pre-fix: nieprzebudowany)');
  ok(rc.state.colorCache['7'] === 'rgb(10,20,30)', 'A1.9 (F1.9): colorCache przywrocony po finally');
  ok(rc.state.map.colors.custom_env_colors['7'].join(',') === '10,20,30', 'A1.9: custom_env_colors przywrocone');
}

console.log('— A1.10 (F1.10): drawRoomsRaster — imageSmoothingEnabled przywrocone —');
{
  const rc = makeRenderCtx([{ id: 1, x: 0, y: 0, z: 0, env: 5 }]);
  const ctx = {
    imageSmoothingEnabled: true, saveN: 0, restoreN: 0, _stack: [],
    save() { this.saveN++; this._stack.push(this.imageSmoothingEnabled); },
    restore() { this.restoreN++; this.imageSmoothingEnabled = this._stack.pop(); },
    drawImage() {}, strokeRect() {},
  };
  rc.api.setCtx(ctx);
  rc.api.rasterCache = null;
  rc.api.drawRoomsRaster();
  ok(ctx.imageSmoothingEnabled === true, 'A1.10 (F1.10): smoothing zachowane po drawRoomsRaster (pre-fix: zostaje false)');
  ok(ctx.saveN === 1 && ctx.restoreN === 1, 'A1.10 (F1.10): save/restore wokol blitu i markera selekcji');
}

console.log('— A1.11 (F1.11): cap alokacji CullIndex/raster — fallback zamiast RangeError —');
{
  const many = [];
  for (let i = 0; i < 300; i++) many.push({ id: i + 1, x: i, y: 0, z: 0, env: 1 });
  many.push({ id: 999, x: 1120000, y: 1120000, z: 0, env: 1 });   // bbox ~4.9e9 cel siatki
  const rc = makeRenderCtx(many);
  let threw = null;
  try { rc.api._buildCullIndex(); } catch (e) { threw = e; }
  ok(threw === null, 'A1.11 (F1.11): ogromny bbox → brak RangeError w _buildCullIndex (pre-fix: RangeError)');
  ok(rc.api.cullIndex === null, 'A1.11 (F1.11): powyzej capa CullIndex wylaczony (fallback liniowy)');
  const vis = rc.api._cullQuery(many, 0, 50, -1, 1);
  ok(vis.length === 51, 'A1.11: fallback liniowy _cullQuery zwraca pokoje (' + vis.length + ')');
  ok(CULL_CAP === 4194304 && RASTER_CAP === 4194304, 'A1.11 (F1.11): stale CULL_INDEX_MAX_CELLS/RASTER_MAX_CELLS = 2^22');
  ok(rc.api._rasterFitsCap() === false, 'A1.11 (F1.11): raster fallback dla bbox > cap (pre-fix: brak helpera)');
  const rc2 = makeRenderCtx([{ id: 1, x: 0, y: 0, z: 0, env: 1 }]);
  ok(rc2.api._rasterFitsCap() === true, 'A1.11: maly bbox → raster dozwolony');
  const callLine = HTML.match(/if \(_lodMode === 'raster'[^\n]*drawRoomsRaster\(\)[^\n]*drawRooms\(vis, rs\)/);
  ok(!!callLine && /_rasterFitsCap\(\)/.test(callLine[0]),
    'A1.11 (F1.11): fallback do drawRooms w miejscu wywolania (draw)');
}

// ═══════════════════════════════════════════════════════════════════════════
// XSS (F1.12)
// ═══════════════════════════════════════════════════════════════════════════

console.log('— A1.12 (F1.12): openCLEditor — klucz custom_lines poza inline onclick —');
{
  const srcCL = extract(HTML, 'function openCLEditor(room, dir) {');
  ok(!/onclick="[^"]*'\$\{/.test(srcCL), 'A1.12 (F1.12): brak interpolacji stringa w atrybucie onclick');
  ok(/startClDrawingExisting\(dir\)/.test(srcCL) && !/onclick="[^"]*startClDrawingExisting/.test(srcCL),
    'A1.12 (F1.12): wiring programowy btn.onclick = startClDrawingExisting(dir)');
  const bad = HTML.match(/onclick="[^"]*'\$\{/g) || [];
  ok(bad.length === 0, 'A1.12: grep-audit — zero atrybutow onclick z interpolacja stringa w calym pliku');
}

// ═══════════════════════════════════════════════════════════════════════════
// FALA 2 (v1.48.3) — EDYTOR (F2.1-F2.7)
// ═══════════════════════════════════════════════════════════════════════════

const PUSH_UNDO_SRC = extract(HTML, 'function pushUndo(entry) {');
function mkPushUndo(state) { return new Function('state', PUSH_UNDO_SRC + '\nreturn pushUndo;')(state); }

console.log('— A2.1 (F2.1): commitMoveRoomToArea do obszaru id 0 + undo —');
{
  const map = { meta: {}, areas: [
    { id: 0, name: 'Default', rooms: [] },
    { id: 1, name: 'A', rooms: [{ id: 5, x: 0, y: 0, z: 0, name: 'R5', env: 1 }] },
  ], colors: { custom_env_colors: {} } };
  const c = makeKalkaCtx(map);
  c.api.commitMoveRoomToArea(5, 0);
  ok(c.state.roomArea[5] === 0 && (c.state.areas.get(0).rooms || []).some(r => r.id === 5),
    'A2.1 (F2.1): przeniesienie do obszaru id 0 dziala (pre-fix: falsy guard blokuje)');
  const entry = c.state.undoStack[c.state.undoStack.length - 1];
  ok(entry && entry.type === 'MOVE_ROOM_TO_AREA' && entry.toAreaId === 0 && entry.fromAreaId === 1,
    'A2.1 (F2.1): wpis undo z toAreaId 0 na stosie');
  // undo przez prawdziwy dispatcher (render ctx)
  const rc = makeRenderCtx([]);
  const r5 = { id: 5, x: 0, y: 0, z: 0, name: 'R5', env: 1, area: 0 };
  rc.state.areas.set(0, { id: 0, name: 'Default', rooms: [r5] });
  rc.state.areas.set(1, { id: 1, name: 'A', rooms: [] });
  rc.state.roomById[5] = r5; rc.state.roomArea[5] = 0;
  if (entry) rc.api._dispatchUndo(entry);
  ok(!!entry && rc.state.roomArea[5] === 1 && rc.state.areas.get(1).rooms.some(r => r.id === 5)
    && !rc.state.areas.get(0).rooms.some(r => r.id === 5),
    'A2.1: undo MOVE_ROOM_TO_AREA z obszaru 0 dziala');
}

console.log('— A2.2 (F2.2): rename spec-exit foo→bar + delete wiersza —');
{
  const WIRE = 'function wireSpecRows(container, room) {\n'
    + blockSlice(HTML, "  container.querySelectorAll('.spec-row').forEach(row => {",
      "  const addBtn = document.getElementById('spec-add-btn');") + '\n}';
  const cmdIn  = { dataset: { orig: 'foo' }, value: 'foo', oninput: null, onfocus: null };
  const idIn   = { value: '7', oninput: null, onfocus: null };
  const lockChk = { checked: false, onchange: null };
  const delBtn = { onclick: null };
  const confirmBtn = { onclick: null };
  const row = { querySelector: (s) => ({ '.spec-cmd': cmdIn, '.spec-id': idIn,
    'input[type=checkbox]': lockChk, '.spec-del': delBtn, '.spec-confirm': confirmBtn })[s] || null,
    nextElementSibling: null };
  const container = { querySelectorAll: (s) => (s === '.spec-row' ? [row] : []) };
  const state = {
    roomById: { 7: { id: 7, name: 'Cel' } },
    pendingSpecialExits: { foo: 7 }, pendingSpecialExitLocks: {}, pendingSERenames: {},
    _activeSpecialExit: null,
  };
  const room = { id: 1, special_exits: { foo: 7 } };
  const wire = new Function('state', '_setMapKey', 'setEditDirty', 'scheduleDraw', 'updateSpecialeTab',
    'commitRoomEdit', WIRE + '\nreturn wireSpecRows;')
    (state, (o, k, v) => { o[k] = v; }, () => {}, () => {}, () => {}, () => {});
  wire(container, room);
  cmdIn.value = 'bar'; cmdIn.oninput();  // rename foo → bar
  ok(state.pendingSpecialExits.bar === 7 && state.pendingSERenames.foo === 'bar'
    && !('foo' in state.pendingSpecialExits), 'A2.2: rename foo→bar przeniosl pending (setup)');
  delBtn.onclick();  // ✕ na wierszu po rename
  ok(!('bar' in state.pendingSpecialExits) && !('foo' in state.pendingSpecialExits),
    'A2.2 (F2.2): po ✕ pending bez foo i bez bar (pre-fix: bar zostaje → wskrzeszony przy commicie)');
  const ren = state.pendingSERenames || {};
  ok(!Object.values(ren).includes('bar') && !('bar' in ren),
    'A2.2 (F2.2): rekord rename dotyczacy wiersza skasowany (lustro kolapsu lancucha)');
}

console.log('— A2.3 (F2.3): pendingExitTarget na nieistniejacy pokoj —');
{
  const COMMIT_SRC = extract(HTML, 'function commitRoomEdit() {');
  const room = { id: 1, x: 0, y: 0, z: 0, name: 'R1', env: 1, exits: {} };
  const state = {
    selected: 1, editMode: true, editSnapshot: null, editDirty: true, dirty: false,
    roomById: { 1: room }, roomArea: { 1: 1 },
    areas: new Map([[1, { id: 1, name: 'A', rooms: [room] }]]),
    undoStack: [], redoStack: [], deltaLog: [],
    pendingExitTarget: { n: 999 }, pendingEnv: null, pendingDoors: {}, pendingExitWeight: {},
    pendingExitLock: {}, pendingStubs: new Set(), pendingStubRemovals: new Set(),
    pendingSpecialExits: null, pendingSpecialExitLocks: null, pendingSpecialDoors: null, pendingSERenames: null,
  };
  const toasts = [];
  const commit = new Function('state', 'document', 'toast', 'switchRpTab', '_setMapKey', 'buildRoomsZ',
    '_roomCollisionAt', '_rasterInvalidate', 'pushUndo', 'updateUndoRedoUI', 'scheduleDraw', 'populateEditForm',
    'OPPOSITE', 'escHtml', 'plPl', 'closeDialog', 'openDialog', 'commitAddExit',
    COMMIT_SRC + '\nreturn commitRoomEdit;')
    (state, { getElementById: () => null, querySelector: () => null }, (m) => toasts.push(String(m)),
      () => {}, (o, k, v) => { o[k] = v; }, () => {}, () => null, () => {},
      mkPushUndo(state), () => {}, () => {}, () => {},
      { n: 's', s: 'n', e: 'w', w: 'e' }, (x) => String(x), (n, one) => n + ' ' + one, () => {}, () => {}, () => {});
  commit();
  ok(room.exits.n === undefined,
    'A2.3 (F2.3): exit na nieistniejacy cel NIE utworzony (pre-fix: wiszacy exit do #999)');
  ok(toasts.some(t => /Pominięto 1 wyj/.test(t)),
    'A2.3 (F2.3): zbiorczy toast ostrzezenia o pominietym celu');
}

console.log('— A2.4 (F2.4): tryb add-room — guard zajetosci komorki —');
{
  const CASE_SRC = 'function addRoomCase(mx, my) {\n'
    + blockSlice(HTML, "    case 'add-room': {", "    case 'cl-drawing': {")
      .replace(/^\s*case 'add-room': \{\n/, '').replace(/\}\s*$/, '') + '\n}';
  const existing = { id: 1, x: 3, y: 3, z: 0, name: 'R1', env: 1 };
  const state = {
    roomById: { 1: existing }, roomArea: { 1: 1 }, areaId: 1, z: 0, isArkadia: true,
    areas: new Map([[1, { id: 1, name: 'A', rooms: [existing] }]]),
    roomsZ: [existing], undoStack: [], redoStack: [], deltaLog: [], selected: null, editMode: true,
  };
  const toasts = [];
  const collisionAt = new Function('state', extract(HTML, 'function _roomCollisionAt(x, y, z, excludeId) {')
    + '\nreturn _roomCollisionAt;')(state);
  const addRoom = new Function('state', 'toast', 'setCanvasMode', 'buildRoomsZ', 'pushUndo',
    'updateUndoRedoUI', 'showRoomInfo', 'scheduleDraw', '_roomCollisionAt',
    CASE_SRC + '\nreturn addRoomCase;')
    (state, (m) => toasts.push(String(m)), () => {}, () => {}, mkPushUndo(state),
      () => {}, () => {}, () => {}, collisionAt);
  addRoom(3.2, 2.9);  // → (3,3,0) zajęte przez #1
  ok(Object.keys(state.roomById).length === 1,
    'A2.4 (F2.4): klik na zajeta komorke NIE tworzy pokoju (pre-fix: stackowanie)');
  ok(toasts.some(t => /zajęte przez pokój #1/.test(t)), 'A2.4 (F2.4): toast kolizji przy add-room');
  const beforeFree = Object.keys(state.roomById).length;
  addRoom(8.1, 8.2);  // wolna komórka — kontrola regresji funkcji
  ok(Object.keys(state.roomById).length === beforeFree + 1,
    'A2.4: wolna komorka — pokoj tworzony (regresja funkcji)');
}

console.log('— A2.5 (F2.5): clamp resize etykiety — kotwica nieruchoma —');
{
  const BLOCK_SRC = 'function labelResizeDrag(e) {\n'
    + blockSlice(HTML, '  if (state.labelResizing && state.selectedLabel) {', '  // ── LABEL DRAG') + '\n}';
  const lbl = { id: 9, x: 10, y: 10, width: 4, height: 2, text: 'L' };
  const state = {
    labelResizing: true, selectedLabel: { areaId: 1, labelId: 9 },
    areas: new Map([[1, { id: 1, labels: [lbl] }]]),
    labelDragStartMapX: 0, labelDragStartMapY: 0,
    labelResizeCorner: 'tl', labelResizeOrigW: 4, labelResizeOrigH: 2,
    labelResizeOrigX: 10, labelResizeOrigY: 10,
  };
  const drag = new Function('state', 'screenToMap', 'evX', 'evY', 'scheduleDraw',
    BLOCK_SRC + '\nreturn labelResizeDrag;')
    (state, () => [100, -100], () => 0, () => 0, () => {});
  drag({});
  ok(lbl.width === 0.5 && Math.abs((lbl.x + lbl.width) - 14) < 1e-9,
    'A2.5 (F2.5): clamp szerokosci (tl) — prawa krawedz zakotwiczona (pre-fix: kotwica przemieszczona)');
  ok(lbl.height === 0.2 && Math.abs((lbl.y + lbl.height) - 12) < 1e-9,
    'A2.5 (F2.5): clamp wysokosci (tl) — kotwica zakotwiczona (pre-fix: kotwica przemieszczona)');
}

console.log('— A2.6 (F2.6): bledna waga — zero mutacji pokoju —');
{
  const COMMIT_SRC = extract(HTML, 'function commitRoomEdit() {');
  const room = { id: 2, x: 1, y: 1, z: 0, name: 'Stara', env: 5, symbol: '#', exits: {} };
  const state = {
    selected: 2, editMode: true, editSnapshot: null, editDirty: true, dirty: false,
    roomById: { 2: room }, roomArea: { 2: 1 },
    areas: new Map([[1, { id: 1, name: 'A', rooms: [room] }]]),
    undoStack: [], redoStack: [], deltaLog: [],
    pendingExitTarget: {}, pendingEnv: null, pendingDoors: {}, pendingExitWeight: {},
    pendingExitLock: {}, pendingStubs: new Set(), pendingStubRemovals: new Set(),
    pendingSpecialExits: null, pendingSpecialExitLocks: null, pendingSpecialDoors: null, pendingSERenames: null,
  };
  const toasts = [];
  const mkInput = (v) => ({ value: v, classList: { add() {}, remove() {} }, focus() {} });
  const els = { 'rp-name': mkInput('Nowa Nazwa'), 'rp-weight': mkInput('0') };
  const commit = new Function('state', 'document', 'toast', 'switchRpTab', '_setMapKey', 'buildRoomsZ',
    '_roomCollisionAt', '_rasterInvalidate', 'pushUndo', 'updateUndoRedoUI', 'scheduleDraw', 'populateEditForm',
    'OPPOSITE', 'escHtml', 'plPl', 'closeDialog', 'openDialog', 'commitAddExit',
    COMMIT_SRC + '\nreturn commitRoomEdit;')
    (state, { getElementById: (id) => els[id] || null, querySelector: () => null },
      (m) => toasts.push(String(m)),
      () => {}, (o, k, v) => { o[k] = v; }, () => {}, () => null, () => {},
      mkPushUndo(state), () => {}, () => {}, () => {},
      {}, (x) => String(x), (n, one) => n + ' ' + one, () => {}, () => {}, () => {});
  commit();
  ok(room.name === 'Stara' && room.env === 5 && room.symbol === '#' && room.weight === undefined,
    'A2.6 (F2.6): bledna waga → room bez zadnej zmiany (pre-fix: name zmutowane przed walidacja)');
  ok(toasts.some(t => /Waga musi być/.test(t)), 'A2.6: toast walidacji wagi');
}

console.log('— A2.7 (F2.7): undo auto-fixu suppressorow — bez pustego custom_lines —');
{
  const A = { id: 1, x: 0, y: 0, z: 0, name: 'A', env: 1, exits: { e: 2 },
    custom_lines: { e: { points: [[0.5, 0.9], [1.5, 0.9]], color: [255, 0, 0] } } };
  const B = { id: 2, x: 2, y: 0, z: 0, name: 'B', env: 1, exits: { w: 1 } };
  const state = { roomById: { 1: A, 2: B }, undoStack: [], redoStack: [], deltaLog: [] };
  const autoFix = new Function('state', 'pushUndo', 'updateUndoRedoUI', 'scheduleDraw', 'toast',
    extract(HTML, 'function autoFixSuppressors(missing) {') + '\nreturn autoFixSuppressors;')
    (state, mkPushUndo(state), () => {}, () => {}, () => {});
  autoFix([{ roomA: 1, dir: 'e', roomB: 2, oppDir: 'w' }]);
  const entry = state.undoStack[state.undoStack.length - 1];
  ok(entry && entry.type === 'AUTO_FIX_SUPPRESSORS' && entry.added.length === 1 && !!B.custom_lines?.w,
    'A2.7: suppressor dodany po stronie B (setup)');
  ok(entry.added[0].hadContainer === false,
    'A2.7 (F2.7): hadContainer=false gdy B nie mial kontenera (pre-fix: odwrocona flaga)');
  const rc = makeRenderCtx([]);
  rc.state.roomById[1] = A; rc.state.roomById[2] = B;
  rc.api._dispatchUndo(entry);
  ok(B.custom_lines === undefined,
    'A2.7 (F2.7): undo auto-fixu nie zostawia custom_lines: {} (pre-fix: pusty kontener zostaje)');
}

// ═══════════════════════════════════════════════════════════════════════════
// FALA 2 (v1.48.3) — LOADER .dat (F2.8-F2.11)
// ═══════════════════════════════════════════════════════════════════════════

// Warstwa formatu (wzorzec malformed_dat.js): constants.js -> main + DEPS.
function formatLayer(html) {
  const a = html.indexOf('// ── constants.js ──');
  const b = html.indexOf('// ── main ──');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice warstwy formatu');
  const c = html.indexOf('const ANSI_PAL = buildAnsiPal();');
  const d = html.indexOf('function buildColorCache');
  if (c < 0 || d < 0 || d <= c) throw new Error('kotwice DEPS');
  return html.slice(a, b) + '\n' + html.slice(c, d);
}
const fmt = new Function(formatLayer(HTML)
  + '\n;return { ReadBuffer, WriteBuffer, readMudletDat, datToArkmap, validate,'
  + ' writeQMapII, writeQMapIS, writeQMapIC, writeQMapSU, writeQMapSS, writeQFont, writeQMapSI,'
  + ' writeQListI, writeQMMIPP, writeQVector, writeMudletArea, writeMudletRoom };')();

// Skladnia bufora v20/v21 przez ORYGINALNE prymitywy zapisu (kontrolowane liczniki).
function buildDatV20(opts) {
  const { areaCount = 0, areas = [], lblAreaCount = 0, rooms = [], version = 20, v21LabelCount = null } = opts;
  const w = new fmt.WriteBuffer();
  w.writeInt32(version);
  fmt.writeQMapII(w, {}); fmt.writeQMapIS(w, {}); fmt.writeQMapIC(w, {});
  fmt.writeQMapSU(w, {}); fmt.writeQMapSS(w, {});
  fmt.writeQFont(w, null); w.writeDouble(1.0); w.writeInt8(0);
  w.writeInt32(areaCount);
  for (const [aid, a] of areas) {
    w.writeInt32(aid);
    if (version >= 21) {
      // jak writeMudletArea + v21: mLast2DMapZoom przed userData, labelCount po
      fmt.writeQListI(w, a.rooms ?? []); fmt.writeQListI(w, []); fmt.writeQMMIPP(w, {});
      w.writeInt8(0);
      w.writeInt32(0); w.writeInt32(0); w.writeInt32(0); w.writeInt32(0); w.writeInt32(0); w.writeInt32(0);
      fmt.writeQVector(w, [0, 0, 0]);
      fmt.writeQMapII(w, {}); fmt.writeQMapII(w, {}); fmt.writeQMapII(w, {}); fmt.writeQMapII(w, {});
      fmt.writeQVector(w, [0, 0, 0]);
      w.writeInt8(0); w.writeInt32(0);
      w.writeDouble(1.0);
      fmt.writeQMapSS(w, {});
      w.writeInt32(v21LabelCount === null ? 0 : v21LabelCount);
    } else {
      fmt.writeMudletArea(w, a);
    }
  }
  fmt.writeQMapSI(w, {});
  if (version < 21) w.writeInt32(lblAreaCount);
  for (const [rid, room] of rooms) { w.writeInt32(rid); fmt.writeMudletRoom(w, room); }
  const u8 = w.toUint8Array();
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}
function expectDatThrow(fn, re, name) {
  try { fn(); }
  catch (e) { ok(re.test(String(e && e.message || e)), name + ' [msg=' + String(e && e.message).slice(0, 70) + ']'); return; }
  ok(false, name + ' [BRAK WYJATKU — cicha pusta sekcja]');
}

console.log('— A2.8 (F2.8): ujemne liczniki sekcji .dat → kontrolowany throw —');
expectDatThrow(() => fmt.datToArkmap(buildDatV20({ areaCount: -1 })),
  /ujemny licznik sekcji/, 'A2.8 (F2.8): areaCount=-1 → throw (pre-fix: cicha pusta mapa)');
expectDatThrow(() => fmt.datToArkmap(buildDatV20({ areaCount: 0, lblAreaCount: -1 })),
  /ujemny licznik sekcji/, 'A2.8 (F2.8): lblAreaCount=-1 → throw (pre-fix: cicho)');
expectDatThrow(() => fmt.datToArkmap(buildDatV20({ version: 21, areaCount: 1, areas: [[1, { rooms: [] }]], v21LabelCount: -1 })),
  /ujemny licznik sekcji/, 'A2.8 (F2.8): v21 labelCount=-1 → throw (pre-fix: cicho)');

console.log('— A2.9 (F2.9): duplikaty id → warning + last-wins —');
{
  const buf = buildDatV20({
    areaCount: 2, areas: [[1, { rooms: [1] }], [1, { rooms: [2] }]],
    rooms: [[1, { area: 1, name: 'PIERWSZY' }], [2, { area: 1, name: 'X' }], [1, { area: 1, name: 'DRUGI' }]],
  });
  const raw = fmt.readMudletDat(buf);
  const iw = raw.importWarnings || [];
  ok(iw.some(w => /zduplikowany id obszaru #1/.test(w)),
    'A2.9 (F2.9): duplikat id obszaru → warning (pre-fix: cicho)');
  ok(iw.some(w => /zduplikowany id pokoju #1/.test(w)),
    'A2.9 (F2.9): duplikat id pokoju → warning (pre-fix: cicho)');
  ok(raw.rooms[1] && raw.rooms[1].name === 'DRUGI' && raw.areas[1].rooms.length === 1 && raw.areas[1].rooms[0] === 2,
    'A2.9: dane last-wins bez zmian (regresja funkcji)');
}
const ASYNC_PINS = [];
ASYNC_PINS.push((async () => {  // A2.9 kanal: loadDat → dialog walidacyjny z anulowaniem
  const buf = buildDatV20({ areaCount: 1, areas: [[1, { rooms: [1] }]],
    rooms: [[1, { area: 1, name: 'A' }], [1, { area: 1, name: 'B' }]] });
  let dialogRes = null, applied = false;
  const loadDat = new Function('state', 'datToArkmap', 'validate', 'checkSuppressorsInMap', 'showValDialog',
    'applyMap', 'toast', 'fmtSz',
    extract(HTML, 'async function loadDat(file) {') + '\nreturn loadDat;')
    ({}, fmt.datToArkmap, fmt.validate, () => [],
      async (res) => { dialogRes = res; return false; },  // uzytkownik ANULUJE
      () => { applied = true; }, () => {}, () => '');
  await loadDat({ name: 't.dat', size: buf.byteLength, arrayBuffer: async () => buf });
  ok(dialogRes !== null && (dialogRes.warnings || []).some(w => /zduplikowany id pokoju #1/.test(w)),
    'A2.9 (F2.9): warning o duplikacie trafia do dialogu walidacyjnego (pre-fix: brak dialogu)');
  ok(applied === false, 'A2.9 (F2.9): anulowanie dialogu przerywa import (pre-fix: import szedl dalej cicho)');
})());

console.log('— A2.10 (F2.10): wiszace id / orphan rekordy → warningi importu —');
{
  const buf = buildDatV20({ areaCount: 1, areas: [[1, { rooms: [1, 99] }]],
    rooms: [[1, { area: 1, name: 'OK' }], [5, { area: 1, name: 'ORPHAN' }]] });
  const map = fmt.datToArkmap(buf);
  const iw = map._importWarnings || [];
  ok(iw.some(w => /1 pokoi bez rekordu/.test(w)),
    'A2.10 (F2.10): wiszace id 99 → warning z liczba zgubionych (pre-fix: cicho)');
  ok(iw.some(w => /spoza list obszarow/.test(w)),
    'A2.10 (F2.10): rekord #5 spoza list obszarow → warning orphan (pre-fix: cicho)');
  ok(map.areas[0].rooms.length === 1 && map.areas[0].rooms[0].id === 1,
    'A2.10: dane bez zmian — pominiete rekordy jak dotychczas (regresja funkcji)');
  ok(!JSON.stringify(map).includes('_importWarnings'),
    'A2.10: _importWarnings poza modelem (nieenumerowalne — zero smieci w zapisie)');
}

console.log('— A2.11 (F2.11): NaN/Infinity przez walidacje geometrii —');
{
  const GOOD_FONT = { family: 'F', point_size: 10, pixel_size: 10, style_hint: 0, weight: 50,
    underline: false, strike_out: false, fixed_pitch: false, style_setting: false };
  const meta = () => ({ map_name: 'M', symbol_font: { ...GOOD_FONT }, symbol_font_fudge_factor: 1, use_only_map_font: false });
  const mapL = { format: 'arkmap', version: 1, meta: meta(), colors: {}, areas: [
    { id: 1, name: 'A', rooms: [], labels: [
      { id: 1, x: NaN, y: 0, z: 0, width: Infinity, height: 1, text: 't', fg_color: [0, 0, 0], bg_color: [255, 255, 255] } ] } ] };
  const resL = fmt.validate(mapL);
  ok(resL.errors.some(e => /\.x$/.test(e.path) && /must be number/.test(e.msg)),
    'A2.11 (F2.11): NaN w label.x odrzucone (pre-fix: typeof przepuszcza)');
  ok(resL.errors.some(e => /\.width$/.test(e.path) && /must be number/.test(e.msg)),
    'A2.11 (F2.11): Infinity w label.width odrzucone (pre-fix: przepuszcza)');
  const mapC = { format: 'arkmap', version: 1, meta: meta(), colors: {}, areas: [
    { id: 1, name: 'A', rooms: [
      { id: 1, x: 0, y: 0, z: 0, name: 'R1', env: 1, exits: { e: 2 }, custom_lines: { e: { points: [[NaN, 1]] } } },
      { id: 2, x: 1, y: 0, z: 0, name: 'R2', env: 1 } ] } ] };
  const resC = fmt.validate(mapC);
  ok(resC.errors.some(e => /custom_lines\.e\.points\[0\]/.test(e.path) && /must be \[number, number\]/.test(e.msg)),
    'A2.11 (F2.11): NaN w punkcie CL odrzucone (pre-fix: przepuszcza)');
}

console.log('— A2.12 (F2.12): innerHTML z danymi sieciowymi → escHtml —');
{
  const m = HTML.match(/olSyncInfo\.innerHTML\s*=\s*`[^`]*`/s);
  const line = m ? m[0] : '';
  ok(/escHtml\(ver\)/.test(line) && /escHtml\(rev\)/.test(line),
    'A2.12 (F2.12): ver/rev escHtml-owane w olSyncInfo.innerHTML (pre-fix: surowe dane z index.json)');
}

console.log('— A2.13 (F2.13): TOCTOU fallback → re-fetch index.json przed plikiem —');
ASYNC_PINS.push((async () => {
  const MAPA_RAW = (HTML.match(/const MAPA_RAW_URL = '([^']+)'/) || [null, ''])[1];
  let mk = null;
  try {
    const src = extract(HTML, 'async function olRefreshIndexOnFallback() {');
    mk = new Function('fetchImpl', 'toastImpl', 'olIndex0', 'olBaseUrl0', 'MAPA_RAW_URL',
      'let olIndex = olIndex0, olBaseUrl = olBaseUrl0; const fetch = fetchImpl, toast = toastImpl;\n' +
      src + '\nreturn (async () => { await olRefreshIndexOnFallback(); return { olIndex, olBaseUrl }; })();');
  } catch (e) { /* baza: brak funkcji → oba piny FAIL nizej */ }
  if (!mk) {
    ok(false, 'A2.13 (F2.13): fallback: rozjazd revision → świeży index + toast (pre-fix: brak mechanizmu)');
    ok(false, 'A2.13 (F2.13): SHA-pinned: bez re-fetchu (pre-fix: brak mechanizmu)');
    return;
  }
  // Scenariusz 1: fallback aktywny, gałąź przesunięta między dialogiem a pobraniem
  const fresh = { revision: 'bbbbbbb2222', version: '9.9', arkmap_size: 10, dat_size: 20 };
  const calls = [], toasts = [];
  const fetchMock = async (url) => { calls.push(url); return { ok: true, json: async () => fresh }; };
  const r1 = await mk(fetchMock, (m) => toasts.push(m), { revision: 'aaaaaaa1111', version: '1.0' }, MAPA_RAW, MAPA_RAW);
  ok(r1.olIndex.revision === 'bbbbbbb2222' && calls.length === 1 && toasts.some(t => /kopia zmieniła się w trakcie/i.test(t)),
    'A2.13 (F2.13): fallback: rozjazd revision → świeży index + toast (pre-fix: plik B opisany jako A)');
  // Scenariusz 2: SHA-pinned → zero re-fetchu, metadane nietknięte
  const calls2 = [];
  const pinned = 'https://raw.githubusercontent.com/Isithunzi000/arkadia-web_standalone-arkmap_studio/' + 'a'.repeat(40) + '/';
  const idx2 = { revision: 'aaaaaaa1111', version: '1.0' };
  const r2 = await mk((u) => { calls2.push(u); return fetchMock(u); }, () => {}, idx2, pinned, MAPA_RAW);
  ok(calls2.length === 0 && r2.olIndex === idx2,
    'A2.13 (F2.13): SHA-pinned: bez re-fetchu (regresja wydajności)');
})());

console.log('— A2.14 (F2.14): olFetchFile z twardym limitem bajtów —');
ok(/const OL_MAX_BYTES = 64 \* 1024 \* 1024/.test(HTML),
  'A2.14 (F2.14): stała OL_MAX_BYTES = 64 MB (pre-fix: brak limitu)');
// Wspoldzielony wrapper olFetchFile (A2.14 + A3.7) — wstrzykuje obie stale limitu.
const mkOlFetch = () => {
  const src = extract(HTML, 'async function olFetchFile(');
  const olMaxExpr = (HTML.match(/const OL_MAX_BYTES = ([^;]+);/) || [null, '0'])[1];
  const olHardExpr = (HTML.match(/const OL_MAX_BYTES_HARD = ([^;]+);/) || [null, 'Infinity'])[1];
  return new Function('fetchImpl', 'olConfirmPrg', 'olConfirmBar',
    'const OL_MAX_BYTES = ' + olMaxExpr + '; const OL_MAX_BYTES_HARD = ' + olHardExpr + '; const fetch = fetchImpl;\n' + src + '\nreturn olFetchFile;');
};
ASYNC_PINS.push((async () => {
  let of = null;
  try {
    of = mkOlFetch();
  } catch (e) { /* baza: niedosiagalne — funkcja istnieje; zostawione dla spojnosci */ }
  const prgStub = { textContent: '' }, barStub = { style: {} };
  // Strumień 66 MB (3 × 22 MB) ponad limit — expectedSize nieznany (null)
  const bigChunks = [22, 22, 22].map(mb => new Uint8Array(mb * 1024 * 1024));
  const fetchBig = async () => ({ ok: true, headers: { get: () => null },
    body: { getReader: () => { let i = 0; return {
      async read() { return i < bigChunks.length ? { done: false, value: bigChunks[i++] } : { done: true }; },
      releaseLock() {} }; } } });
  let threw = '';
  try {
    await of(fetchBig, prgStub, barStub)('http://x/f', 'f', null, { prg: prgStub, bar: null });
  } catch (e) { threw = String(e && e.message || e); }
  ok(/za duży/.test(threw),
    'A2.14 (F2.14): strumień 66 MB → kontrolowany throw „za duży" (pre-fix: bez limitu)');
  // Kontrola: mały strumień 300 B przechodzi i bajty się zgadzają (regresja funkcji)
  const small = [100, 100, 100].map((n, k) => new Uint8Array(n).fill(k + 1));
  const fetchSmall = async () => ({ ok: true, headers: { get: () => '300' },
    body: { getReader: () => { let i = 0; return {
      async read() { return i < small.length ? { done: false, value: small[i++] } : { done: true }; },
      releaseLock() {} }; } } });
  let buf = null;
  try { buf = await of(fetchSmall, prgStub, barStub)('http://x/f', 'f', 300, { prg: prgStub, bar: null }); }
  catch (e) { /* zostanie null → FAIL */ }
  ok(buf && buf.length === 300 && buf[0] === 1 && buf[299] === 3,
    'A2.14: mały strumień bez zmian (regresja funkcji)');
})());

console.log('— A3.7 (DI-6): sufit absolutny OL_MAX_BYTES_HARD = 256 MB —');
ok(/const OL_MAX_BYTES_HARD = 256 \* 1024 \* 1024/.test(HTML)
   && /Math\.min\(Math\.max\(Number\.isFinite\(expectedSize\)[^)]*\?[^:]*:[^,]*, OL_MAX_BYTES\), OL_MAX_BYTES_HARD\)/.test(HTML),
  'A3.7 (DI-6): formula limitu z sufitem Math.min(..., OL_MAX_BYTES_HARD) (pre-fix: 125% expectedSize bez sufitu)');
ASYNC_PINS.push((async () => {
  const of = mkOlFetch();
  const prgStub = { textContent: '' }, barStub = { style: {} };
  // expectedSize kłamie: 300 MB -> 125% = 375 MB. Bez sufitu strumień 300 MB
  // przeszedlby w calosci; z sufitem 256 MB throw po 260 MB (13. chunk).
  const chunk = new Uint8Array(20 * 1024 * 1024);
  const fetch300 = async () => ({ ok: true, headers: { get: () => null },
    body: { getReader: () => { let i = 0; return {
      async read() { return i < 15 ? { done: false, value: chunk, i0: i++ } : { done: true }; },
      releaseLock() {} }; } } });
  // (wyzej: value: chunk = ten sam 20 MB chunk za kazdym razem; i0 tylko inkrementuje licznik)
  let threw = '';
  try {
    await of(fetch300, prgStub, barStub)('http://x/f', 'f', 300 * 1024 * 1024, { prg: prgStub, bar: null });
  } catch (e) { threw = String(e && e.message || e); }
  ok(/za duży/.test(threw),
    'A3.7 (DI-6): expectedSize 300 MB + strumien 300 MB -> throw przy 256 MB (pre-fix: lecial do 375 MB)');
  // Regresja: expectedSize 100 MB (125% = 125 MB) + strumien 130 MB -> limit 125 MB wygrywa (floor dziala jak byl)
  const chunk10 = new Uint8Array(10 * 1024 * 1024);
  const fetch130 = async () => ({ ok: true, headers: { get: () => null },
    body: { getReader: () => { let i = 0; return {
      async read() { return i < 13 ? { done: false, value: chunk10, i0: i++ } : { done: true }; },  // 13 x 10 MB = 130 MB
      releaseLock() {} }; } } });
  let threw2 = '';
  try {
    await of(fetch130, prgStub, barStub)('http://x/f', 'f', 100 * 1024 * 1024, { prg: prgStub, bar: null });
  } catch (e) { threw2 = String(e && e.message || e); }
  ok(/za duży/.test(threw2),
    'A3.7 (DI-6): expectedSize 100 MB + strumien 130 MB -> limit 125% bez zmian (regresja F2.14)');
})());

console.log('— A2.15 (F2.15): planer — omijanie zablokowanych pokoi —');
{
  const body = blockSlice(HTML, 'function _heapLt', 'function astarPath(fromId, toId) {')
    + extract(HTML, 'function astarPath(fromId, toId) {');
  // Shim DIR_BY_SHORT (poza wycinkiem): pin uzywa wylacznie e/w (kardynalne, idx<=8)
  const mk = new Function('state', 'wpState',
    'const DIR_BY_SHORT = { e: { idx: 2 }, w: { idx: 6 } };\n'
    + body + '\nreturn { dijkstraPath, astarPath };');
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mkState = (lockId) => ({
    roomById: {
      1: { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 }, locked: lockId === 1 },
      2: { id: 2, x: 1, y: 0, z: 0, exits: { e: 3, w: 1 }, locked: lockId === 2 },
      3: { id: 3, x: 2, y: 0, z: 0, exits: { w: 2 }, locked: lockId === 3 },
    },
    roomArea: { 1: 'A', 2: 'A', 3: 'A' },
    editMode: false,
    astarParams: { maxEdgeDist: 1, minEdgeW: 1 },
  });
  const wpOn  = { avoidLocked: true,  dirMode: 'all', transportMode: 'off', algorithm: 'dijkstra' };
  const wpOff = { avoidLocked: false, dirMode: 'all', transportMode: 'off', algorithm: 'dijkstra' };
  // ON + cel locked → null (oba algorytmy); pre-fix: break przed guardem → trasa przechodzi
  const Pon = mk(mkState(3), wpOn);
  ok(Pon.dijkstraPath(1, 3) === null && Pon.astarPath(1, 3) === null,
    'A2.15 (F2.15): ON — trasa do locked celu = null, oba algorytmy (pre-fix: przechodzi)');
  // ON + skrót from==to z locked startem → [fromId] zostaje (paritet Mudlet, regresja)
  const Pself = mk(mkState(1), wpOn);
  ok(eq(Pself.dijkstraPath(1, 1), [1]) && eq(Pself.astarPath(1, 1), [1]),
    'A2.15 (F2.15): skrót from==to zostaje przy locked starcie (regresja)');
  // OFF → routowanie permissive przez locked (styl Dargotha)
  const Poff = mk(mkState(3), wpOff);
  ok(eq(Poff.dijkstraPath(1, 3), [1, 2, 3]) && eq(Poff.astarPath(1, 3), [1, 2, 3]),
    'A2.15 (F2.15): OFF — trasa przez locked dozwolona (regresja przełącznika)');
  // ON + locked pośredni → null (regresja: działało i ma działać)
  const Pmid = mk(mkState(2), wpOn);
  ok(Pmid.dijkstraPath(1, 3) === null && Pmid.astarPath(1, 3) === null,
    'A2.15: ON — locked pośredni nadal pomijany (regresja)');
  // Statyczne: domyślne ON w wpState
  ok(/avoidLocked:\s*true/.test(HTML),
    'A2.15 (F2.15): wpState.avoidLocked domyślnie ON (pre-fix: brak przełącznika)');
  // Geometry gate: checkbox w panelu planera — kolejność DOM + wiersz CSS + etykieta
  const iT = HTML.indexOf('id="wp-transport"'), iC = HTML.indexOf('id="wp-avoidlocked"'), iR = HTML.indexOf('id="wp-route-code"');
  ok(iT > 0 && iC > iT && iR > iC && /Omijaj zablokowane pokoje/.test(HTML) && /#wp-avoidlocked-row\s*\{/.test(HTML),
    'A2.15 (F2.15): checkbox w panelu — geometria: kolejność DOM + CSS + etykieta (pre-fix: brak)');
  // Wiring: change → wpState + re-plan tras
  ok(/getElementById\('wp-avoidlocked'\)/.test(HTML) && /wpState\.avoidLocked = wpAvoidLockedCb\.checked/.test(HTML),
    'A2.15 (F2.15): wiring change → wpState + re-plan (pre-fix: brak)');
}

console.log('— A2.16–A2.18 (F2.16–F2.18): touch — pinch vs narzedzia / tap po pinch / srodek CSS-px —');
{
  const slice = blockSlice(HTML, 'let _touches = {};', "cv.addEventListener('wheel', e => {");
  function mkTouchEnv(opts) {
    const calls = { revert: 0, commit: 0, click: [], dbl: [], zoom: [], move: [], paint: 0 };
    const handlers = {};
    const cv = {
      width: opts.cvW || 100, height: opts.cvH || 100,
      addEventListener: (t, fn) => { handlers[t] = fn; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: opts.rectW || 100, height: opts.rectH || 100 }),
      classList: { add() {}, remove() {} },
    };
    const state = {
      editMode: !!opts.editMode, canvasMode: opts.canvasMode || 'normal', selected: opts.selected ?? null,
      roomsZ: opts.roomsZ || [], roomById: opts.roomById || {},
      dragging: false, dragX: 0, dragY: 0, ox: 0, oy: 0, zoom: 1,
      editDraggingRoom: false, editDragCurrentX: 0, editDragCurrentY: 0,
      editSnapshot: null, _paintHover: null,
    };
    const api = new Function('cv', 'state', 'document', 'handlers',
      '_paintApplyAtScreen', '_paintStrokeCommit', '_paintStrokeRevert',
      'evX', 'evY', 'screenToMap', 'scheduleDraw', 'zoomAround',
      'handleClick', 'handleDblClick', '_tryMoveRoomWithPolicy',
      'let _paintStroke = null;\n' + slice +
      '\nreturn { handlers, getStroke: () => _paintStroke };')
      (cv, state, { getElementById: () => null }, handlers,
        () => { calls.paint++; }, () => { calls.commit++; }, () => { calls.revert++; },
        t => t.clientX, t => t.clientY, () => [0, 0], () => {},
        (mx, my, f) => { calls.zoom.push([mx, my, f]); },
        (x, y) => { calls.click.push([x, y]); }, (x, y) => { calls.dbl.push([x, y]); },
        (...a) => { calls.move.push(a); return 'ok'; });
    return { handlers, calls, state, getStroke: api.getStroke };
  }
  const T = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
  const ev = (touches, changed) => ({ preventDefault() {}, touches, changedTouches: changed || [] });

  // F2.16a: pinch w trakcie paint stroke → revert raz, zero commitu
  {
    const env = mkTouchEnv({ editMode: true, canvasMode: 'paint' });
    env.handlers.touchstart(ev([T(1, 10, 10)]));
    const strokeStarted = env.getStroke() !== null;
    env.handlers.touchstart(ev([T(1, 10, 10), T(2, 50, 10)]));
    env.handlers.touchmove(ev([T(1, 10, 10), T(2, 60, 10)]));
    env.handlers.touchend(ev([T(1, 10, 10)], [T(2, 60, 10)]));
    env.handlers.touchend(ev([], [T(1, 10, 10)]));
    ok(strokeStarted && env.getStroke() === null && env.calls.revert === 1 && env.calls.commit === 0,
      'A2.16 (F2.16): pinch anuluje paint stroke — revert raz na gest, bez commitu (pre-fix: commit po pinch)');
  }
  // F2.16b: pinch w trakcie dragu pokoju → anulowanie, zero MOVE_ROOM
  {
    const env = mkTouchEnv({ editMode: true, canvasMode: 'normal', selected: 7,
      roomsZ: [{ id: 7, x: 0, y: 0 }], roomById: { 7: { id: 7, x: 0, y: 0, z: 0 } } });
    env.handlers.touchstart(ev([T(1, 10, 10)]));
    const dragStarted = env.state.editDraggingRoom === true;
    env.handlers.touchstart(ev([T(1, 10, 10), T(2, 50, 10)]));
    env.handlers.touchend(ev([T(1, 10, 10)], [T(2, 50, 10)]));
    env.handlers.touchend(ev([], [T(1, 10, 10)]));
    ok(dragStarted && env.state.editDraggingRoom === false && env.calls.move.length === 0,
      'A2.16 (F2.16): pinch anuluje drag pokoju — bez MOVE_ROOM po pinch (pre-fix: commit po pinch)');
  }
  // F2.17: tap po pinch zablokowany; swiezy tap po resecie dziala (regresja)
  {
    const env = mkTouchEnv({});
    env.handlers.touchstart(ev([T(1, 10, 10)]));
    env.handlers.touchstart(ev([T(1, 10, 10), T(2, 50, 10)]));
    env.handlers.touchend(ev([T(1, 10, 10)], [T(2, 50, 10)]));
    env.handlers.touchend(ev([], [T(1, 11, 11)]));   // palec 1 w gorze — ruch < 8 px
    const clickAfterPinch = env.calls.click.length;
    env.handlers.touchstart(ev([T(3, 20, 20)]));      // swiezy gest jednopalcowy
    env.handlers.touchend(ev([], [T(3, 21, 21)]));
    ok(clickAfterPinch === 0 && env.calls.click.length === 1,
      'A2.17 (F2.17): tap po pinch zablokowany, swiezy tap dziala (pre-fix: widmowy tap po pinch)');
  }
  // F2.18: srodek pinch w pikselach canvasu (cv 200 px / rect 100 px → mnoznik 2)
  {
    const env = mkTouchEnv({ cvW: 200, cvH: 200, rectW: 100, rectH: 100 });
    env.handlers.touchstart(ev([T(1, 10, 10)]));
    env.handlers.touchstart(ev([T(1, 10, 10), T(2, 30, 10)]));
    env.handlers.touchmove(ev([T(1, 10, 10), T(2, 30, 10)]));   // dist 20 → baseline
    env.handlers.touchmove(ev([T(1, 10, 10), T(2, 40, 10)]));   // dist 30 → zoom
    const z = env.calls.zoom[0] || [];
    ok(env.calls.zoom.length === 1 && z[0] === 50 && z[1] === 20 && Math.abs(z[2] - 1.5) < 1e-9,
      'A2.18 (F2.18): srodek pinch skalowany do px canvasu (25,10 → 50,20) (pre-fix: bez mnoznika)');
  }
}

console.log('— A2.19 (F2.19): zapis na klonie — live model bez mutacji, bajty ≡ dawnej sciezki —');
{
  // Wycinek sciezki zapisu (lustro converters_crc: constants + checksum + stableStringify..saveArkmapAs)
  let api = null;
  const mkState = (map) => ({ map, areas: new Map(), roomById: {}, roomArea: {}, colorCache: {}, filename: 'x.arkmap', z: 0 });
  try {
    const pipe =
      blockSlice(HTML, '// ── constants.js ──', '// ── validate.js ──') + '\n' +
      blockSlice(HTML, '// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
      blockSlice(HTML, 'function stableStringify(val, indent, _lvl) {', 'function saveArkmapAs()') + '\n' +
      blockSlice(HTML, 'function _canonicalizeMapForSave(map) {', 'function _arkmapSuggestedName() {') + '\n' +
      'return { _prepareArkmapForSave, _serializeMap, _serializeMapForSave, _canonicalCloneForSave };';
    const dummyEl = () => ({ classList: { remove() {}, add() {}, toggle() {} },
      disabled: false, innerHTML: '', style: {}, title: '', textContent: '', dataset: {} });
    const mkApi = new Function('state', 'document', 'localStorage', 'searchIn', 'btnSaveArkmap', 'btnSaveDat', 'btnSaveAs2',
      'buildColorCache', 'buildAreaList', '_recomputeAstarParams', 'selectArea', 'escHtml', 'rebuildLegend',
      '_pixmapCache', '_hopViaCache', pipe);
    api = (st) => mkApi(st, { getElementById: () => dummyEl(), querySelector: () => null },
      { removeItem() {}, getItem: () => null, setItem() {} }, dummyEl(), dummyEl(), dummyEl(), dummyEl(),
      () => { st.colorCache = {}; }, () => {}, () => {}, () => {}, (s) => String(s), () => {}, new Map(), new Map());
  } catch (e) { /* baza: brak _canonicalizeMapForSave → piny FAIL nizej */ api = null; }
  // Fixture: prawdziwa mapa z .dat, potem zaburzona kolejnosc + pole live room.area
  const fixture = () => {
    const m = fmt.datToArkmap(buildDatV20({
      areaCount: 2, areas: [[1, { rooms: [3, 1] }], [2, { rooms: [2] }]],
      rooms: [[1, { area: 1, name: 'A' }], [2, { area: 2, name: 'B' }], [3, { area: 1, name: 'C' }]],
    }));
    m.areas.reverse();
    for (const area of m.areas) {
      if (area.rooms) { area.rooms.reverse(); for (const r of area.rooms) { r.area = area.id; r.stubs = ['w', 'n', 'e']; } }
    }
    return m;
  };
  if (!api) {
    ok(false, 'A2.19 (F2.19): zloty test bajtowosci — nowa sciezka ≡ dawna (pre-fix: brak _serializeMapForSave)');
    ok(false, 'A2.19 (F2.19): anulowany save ⇒ live state.map deep-equal przed/po (pre-fix: mutacje zostaja)');
    ok(false, 'A2.19 (F2.19): kanoniczny klon do .dat (room.area out, checksums in), live nietkniety');
  } else {
    // Dawna sciezka (referencja zlota): prepare na live + serialize — obie funkcje dalej w wycinku
    const stOld = mkState(fixture());
    const apiOld = api(stOld);
    apiOld._prepareArkmapForSave();
    const oldBytes = apiOld._serializeMap();
    // Nowa sciezka: _serializeMapForSave na klonie
    const stNew = mkState(fixture());
    const apiNew = api(stNew);
    const snapBefore = JSON.stringify(stNew.map);
    const newBytes = apiNew._serializeMapForSave();
    ok(newBytes === oldBytes,
      'A2.19 (F2.19): zloty test bajtowosci — nowa sciezka ≡ dawna (pre-fix: brak _serializeMapForSave)');
    ok(JSON.stringify(stNew.map) === snapBefore && stNew.map.areas[0].rooms.some(r => 'area' in r),
      'A2.19 (F2.19): anulowany save ⇒ live state.map deep-equal przed/po (pre-fix: mutacje zostaja)');
    const stDat = mkState(fixture());
    const apiDat = api(stDat);
    const snapDat = JSON.stringify(stDat.map);
    const clone = apiDat._canonicalCloneForSave();
    const cloneRooms = (clone.areas || []).flatMap(a => a.rooms || []);
    ok(cloneRooms.length > 0 && cloneRooms.every(r => !('area' in r)) && !!(clone.meta && clone.meta.checksums)
      && JSON.stringify(stDat.map) === snapDat,
      'A2.19 (F2.19): kanoniczny klon do .dat (room.area out, checksums in), live nietkniety');
  }
  // Statyczne: call-site'y przelaczone na sciezke klonujaca
  ok((HTML.match(/const text = _serializeMapForSave\(\);/g) || []).length === 2
    && /arkmapToDat\(_canonicalCloneForSave\(\)\)/.test(HTML),
    'A2.19 (F2.19): call-site’y save×2 + eksport .dat na sciezce klonujacej (pre-fix: prepare na live)');
}

console.log('— A2.20 (F2.20): skroty +/-/f nieaktywne w formularzach —');
{
  const slice = blockSlice(HTML, '// ─── KEYBOARD', 'function zoomAround(mx, my, f) {');
  const calls = { fit: 0, zoom: 0, draw: 0 };
  let keydownFn = null;
  const documentStub = { addEventListener: (t, fn) => { if (t === 'keydown') keydownFn = fn; } };
  const searchInStub = { focus() {}, value: '' };
  const stateStub = { editMode: false, selected: null, roomById: {}, ox: 0, oy: 0, zoom: 1 };
  new Function('document', 'searchIn', 'state', 'cv', 'zoomAround', 'fitToView', 'syncZoomSlider', 'scheduleDraw',
    slice)(documentStub, searchInStub, stateStub, { width: 800, height: 600 },
    () => { calls.zoom++; }, () => { calls.fit++; }, () => {}, () => { calls.draw++; });
  const evInForm = (key) => ({ target: { closest: () => ({}) }, key, ctrlKey: false, preventDefault() {}, shiftKey: false });
  const evOutside = (key) => ({ target: { closest: () => null }, key, ctrlKey: false, preventDefault() {}, shiftKey: false });
  keydownFn(evInForm('f'));
  const fitInForm = calls.fit;
  keydownFn(evInForm('+'));
  const zoomInForm = calls.zoom;
  keydownFn(evOutside('f'));
  ok(fitInForm === 0 && zoomInForm === 0,
    'A2.20 (F2.20): „f"/„+" wpisane w formularz nie odpala fitToView/zoom (pre-fix: odpala)');
  ok(calls.fit - fitInForm === 1,
    'A2.20: „f" poza formularzem nadal dziala (regresja)');
  const pan = slice.match(/PAN \(viewer \+ edit mode[\s\S]*?\n\}\);/);
  const guarded = pan && /if \(!inForm && \(e\.key === '\+' \|\| e\.key === '='\)\)/.test(pan[0])
    && /if \(!inForm && e\.key === '-'\)/.test(pan[0])
    && /if \(!inForm && \(e\.key === 'f' \|\| e\.key === 'F'\) && !e\.ctrlKey\)/.test(pan[0])
    && /if \(e\.ctrlKey && e\.key === 'f'\) \{ e\.preventDefault\(\); searchIn\.focus\(\); \}/.test(pan[0]);
  ok(!!guarded,
    'A2.20 (F2.20): statycznie — +/-/f z guardem !inForm, ctrl+f bez zmian (pre-fix: bez guarda)');
}

console.log('— A2.21 (F2.21): drop .json przekazuje nazwe pliku —');
{
  const dropBlock = blockSlice(HTML, 'async function handleDropFiles(files) {', '// Cały dokument obsługuje drag&drop');
  ok(/parsed\?\.format === 'arkmap'\) await loadArkmap\(text, file\.name\);/.test(dropBlock),
    'A2.21 (F2.21): loadArkmap(text, file.name) w galezi .json (pre-fix: nazwa gubiona)');
}

console.log('— A3.1 (DI-1): MOVE_ROOM_TO_AREA z/do biezacego obszaru -> rebuild roomsZ+raster —');
{
  const map = { meta: {}, areas: [
    { id: 1, name: 'A1', rooms: [
      { id: 1, x: 0, y: 0, z: 0, name: 'R1', env: 1, area: 1 },
      { id: 2, x: 1, y: 0, z: 0, name: 'R2', env: 1, area: 1 }] },
    { id: 2, name: 'A2', rooms: [] },
  ], colors: {} };
  const mkKalka = (api, rid, to) => kalkaText(api,
    [{ seq: 1, type: 'MOVE_ROOM_TO_AREA', target: { roomId: rid }, payload: { toAreaId: to } }]);
  // Scenariusz 1: pokoj WCHODZI do biezacego obszaru (areaId=2) — epilog musi rebuildowac.
  const c1 = makeKalkaCtx(map);
  c1.state.areaId = 2;
  const v1 = c1.api.validateDeltaText(mkKalka(c1.api, 1, 2));
  ok(v1.ok, 'A3.1 (DI-1): kalka MOVE_ROOM_TO_AREA przechodzi walidacje');
  const r1 = c1.api.applyDelta(v1.delta);
  ok(r1.applied === 1 && c1.state.roomArea[1] === 2, 'A3.1 (DI-1): ruch naniesiony (applied=1)');
  ok(c1.counters.roomsZ === 1 && c1.counters.rasterInv === 1,
    'A3.1 (DI-1): ruch DO biezacego obszaru -> epilog rebuilduje roomsZ+raster (pre-fix: 0 wywolan — stale dane na canvasie)');
  ok(c1.counters.areaList === 1, 'A3.1 (DI-1): buildAreaList raz po batchu (bez zmian, F1.4)');
  // Scenariusz 2: ruch miedzy OBCYMI obszarami (areaId=99) — bez dodatkowego rebuildu.
  const c2 = makeKalkaCtx(map);
  c2.state.areaId = 99;
  const v2 = c2.api.validateDeltaText(mkKalka(c2.api, 1, 2));
  c2.api.applyDelta(v2.delta);
  ok(c2.counters.roomsZ === 0 && c2.counters.rasterInv === 0 && c2.counters.areaList === 1,
    'A3.1 (DI-1): ruch miedzy obcymi obszarami -> bez rebuildu roomsZ/raster (regresja wydajnosci)');
  // Scenariusz 3: pokoj WYCHODZI z biezacego obszaru (areaId=1) — tez rebuild.
  const c3 = makeKalkaCtx(map);
  c3.state.areaId = 1;
  const v3 = c3.api.validateDeltaText(mkKalka(c3.api, 1, 2));
  c3.api.applyDelta(v3.delta);
  ok(c3.counters.roomsZ === 1 && c3.counters.rasterInv === 1,
    'A3.1 (DI-1): ruch Z biezacego obszaru -> epilog rebuilduje roomsZ+raster (pre-fix: 0 wywolan)');
}

console.log('— A3.3 (DI-3): olLoadDat przekazuje warningi importu .dat do dialogu —');
{
  const src = extract(HTML, 'async function olLoadDat() {');
  const iMerge = src.indexOf('.concat(importWarnings)');
  const iDlg = src.indexOf('showValDialog(');
  ok(iMerge !== -1 && /_importWarnings/.test(src),
    'A3.3 (DI-3): merge _importWarnings do r.warnings w sciezce online (pre-fix: warningi parsera polykane)');
  ok(iMerge !== -1 && iDlg !== -1 && iMerge < iDlg,
    'A3.3 (DI-3): merge PRZED showValDialog — warningi widoczne w dialogu (lustro loadDat; pre-fix: brak)');
}

console.log('— A3.5 (DI-5): olRefreshIndexOnFallback — AbortController + 30 s —');
ASYNC_PINS.push((async () => {
  const src = extract(HTML, 'async function olRefreshIndexOnFallback() {');
  ok(/AbortController/.test(src) && /signal:\s*ctrl\.signal/.test(src) && /clearTimeout/.test(src),
    'A3.5 (DI-5): re-fetch ma AbortController + signal + clearTimeout (pre-fix: fetch bez timeoutu — busy w nieskonczonosc)');
  // Behawioralnie: zawieszony fetch + timer odpalajacy abort -> funkcja WRACA (catch polyka AbortError).
  const MAPA_RAW = (HTML.match(/const MAPA_RAW_URL = '([^']+)'/) || [null, ''])[1];
  let timerMs = null, cleared = false;
  const setTimeoutMock = (fn2, ms) => { timerMs = ms; setImmediate(fn2); return 1; };
  const clearTimeoutMock = () => { cleared = true; };
  const hangingFetch = (url, opts) => new Promise((resolve, reject) => {
    if (opts && opts.signal) opts.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    // nigdy sie nie rozwiązuje — jedyny ratunek to abort z timera
  });
  const mk = new Function('fetchImpl', 'toastImpl', 'olIndex0', 'olBaseUrl0', 'MAPA_RAW_URL', 'setTimeoutImpl', 'clearTimeoutImpl',
    'let olIndex = olIndex0, olBaseUrl = olBaseUrl0; const fetch = fetchImpl, toast = toastImpl, setTimeout = setTimeoutImpl, clearTimeout = clearTimeoutImpl;\n' +
    src + '\nreturn (async () => { await olRefreshIndexOnFallback(); return true; })();');
  const verdict = await Promise.race([
    mk(hangingFetch, () => {}, { revision: 'aaaaaaa1111', version: '1.0' }, MAPA_RAW, MAPA_RAW, setTimeoutMock, clearTimeoutMock)
      .then(() => 'returned', () => 'threw'),
    new Promise(r => setTimeout(r, 500)).then(() => 'hung'),
  ]);
  ok(verdict === 'returned' && timerMs === 30000 && cleared,
    'A3.5 (DI-5): zawieszony re-fetch -> abort po 30 s -> funkcja wraca, dialog odblokowany (pre-fix: hang)');
})());

Promise.all(ASYNC_PINS).then(() => {
  console.log('');
  console.log(`═══ audit_ext: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
});
