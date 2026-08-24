// Harness — audit_ext.js: piny repro-first audytu zewnetrznego (Arc 31).
// Fala 1 (v1.48.2): F1.1-F1.12 — kalka (.arkdelta) + renderer/cache + XSS.
// Kazdy pin behawioralny: FAIL na bazie e357c82 (v1.48.1) -> PASS po fixie.
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
  + ' _deltaChecksums, stableStringify, addChecksums, diffMaps, _diffEq,'
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
  const counters = { jump: 0, areaList: 0, roomsZ: 0 };
  const fn = new Function(
    'state', '_dispatchUndo', 'updateUndoRedoUI', 'draw', 'scheduleDraw', 'toast', 'plPl', 'document',
    'download', 'escHtml', 'APP_VERSION',
    'deleteRoom', 'commitDeleteArea', 'commitAddExit', 'commitMoveRoom', 'commitDeleteExit',
    'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'refreshLabelList', 'populateEditForm', 'selectArea',
    'jumpToRoom', 'showDirtyConfirm',
    KALKA_CODE
  );
  const api = fn(state, () => {}, () => {}, () => {}, () => {}, (m2) => toasts.push(m2), (n, one) => n + ' ' + one,
    { getElementById: () => null },
    () => {}, (x) => String(x), 'v1.48.2-test',
    () => {}, () => {},
    (sourceId, dir, targetId) => { const s = state.roomById[sourceId]; if (s) { s.exits = s.exits || {}; s.exits[dir] = targetId; } },  // commitAddExit: efekt jak w aplikacji
    () => {}, () => {},
    () => { counters.roomsZ++; }, () => { counters.areaList++; }, () => {}, () => {}, () => {}, () => {},
    (id) => { counters.jump++; state.selected = id; }, () => {});
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
    'document', 'toast', 'ImageData', '_envOf', 'envColorRgb', 'CULL_CAP', 'RASTER_CAP',
    RENDER_CODE
  );
  const api = fn(state, () => { counters.roomsZ++; }, () => {}, () => {}, () => {}, () => {},
    documentStub, () => {}, ImageDataStub, (r) => (r.env ?? 1), (e) => [e & 255, e & 255, e & 255],
    CULL_CAP, RASTER_CAP);
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

console.log('');
console.log(`═══ audit_ext: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
