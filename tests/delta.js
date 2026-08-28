// Harness — delta.js: fundamenty formatu .arkdelta.
// Sekcja T1 (v1.5.43): state.deltaLog — pelny log edycji, lustro operacji bez capu 50.
// Kolejne sekcje (eksport/walidacja/apply) dojda z blokiem ARKDELTA.
// Uruchamianie z katalogu głównego repo.
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
const FNS = [
  'function pushUndo(entry) {',
  'function undoAction() {',
  'function redoAction() {',
  'function undoToIndex(targetIdx) {',
  'function undoAll() {',
  'function redoAll() {',
];
for (const a of FNS) {
  if (HTML.indexOf(a) !== HTML.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}
const code = FNS.map(a => extract(HTML, a)).join('\n') +
  '\n;return { pushUndo, undoAction, redoAction, undoToIndex, undoAll, redoAll };';

function makeCtx() {
  const state = { undoStack: [], redoStack: [], deltaLog: [], dirty: false };
  const undid = [], redid = [], toasts = [];
  const fn = new Function(
    'state', '_dispatchUndo', '_dispatchRedo', 'updateUndoRedoUI', 'draw', 'scheduleDraw', 'toast', 'plPl', 'document',
    code
  );
  const api = fn(
    state,
    (e) => undid.push(e), (e) => redid.push(e),
    () => {}, () => {}, () => {},
    (m) => toasts.push(m),
    (n, one) => n + ' ' + one,
    { getElementById: () => null }
  );
  return { state, undid, redid, api };
}
const mk = (i) => ({ type: 'EDIT_ROOM', roomId: i, label: 'op ' + i });

console.log('— T1: deltaLog — lustro operacji bez capu —');
{
  const { state, api } = makeCtx();
  api.pushUndo(mk(1)); api.pushUndo(mk(2)); api.pushUndo(mk(3));
  ok(state.undoStack.length === 3 && state.deltaLog.length === 3, 'push x3: undoStack 3, deltaLog 3');
  ok(state.deltaLog[2].roomId === 3 && state.deltaLog[0].roomId === 1, 'deltaLog: kolejnosc i identycznosc wpisow');

  api.undoAction();
  ok(state.undoStack.length === 2 && state.deltaLog.length === 2, 'undoAction: oba stosy 2');
  ok(state.deltaLog.every(e => e.roomId !== 3), 'undoAction: cofnieta operacja znika z deltaLog');

  api.redoAction();
  ok(state.undoStack.length === 3 && state.deltaLog.length === 3 && state.deltaLog[2].roomId === 3,
    'redoAction: operacja wraca do deltaLog');

  api.undoToIndex(1);
  ok(state.undoStack.length === 1 && state.deltaLog.length === 1 && state.deltaLog[0].roomId === 1,
    'undoToIndex(1): oba stosy 1, zostaje najstarsza');

  api.redoAll();
  ok(state.undoStack.length === 3 && state.deltaLog.length === 3, 'redoAll: oba stosy 3');

  api.undoAll();
  ok(state.undoStack.length === 0 && state.deltaLog.length === 0, 'undoAll: oba stosy puste');
}
{
  // Cap 50 siedzi inline przy miejscach wywołań (NIE w pushUndo) — symulacja wzorca aplikacji:
  const { state, api } = makeCtx();
  for (let i = 1; i <= 60; i++) {
    api.pushUndo(mk(i));
    if (state.undoStack.length > 50) state.undoStack.shift();  // wzorzec z miejsc wywołań
  }
  ok(state.undoStack.length === 50, 'po 60 pushach z capem: undoStack 50');
  ok(state.deltaLog.length === 60, 'po 60 pushach: deltaLog 60 (bez capu — pelna historia dla eksportu)');
  ok(state.deltaLog[0].roomId === 1 && state.deltaLog[59].roomId === 60, 'deltaLog: pierwsze operacje nie giną');
  api.undoAction();
  ok(state.deltaLog.length === 59 && state.undoStack.length === 49, 'undo po przepełnieniu: mirror spójny');
}
{
  // Asercje strukturalne — kompletność mirroringu poza ścieżkami funkcyjnymi:
  const cancel = extract(HTML, 'function cancelRoomEdit() {');
  ok(cancel.includes('state.deltaLog.pop();'), 'cancelRoomEdit (cichy pop A11\'): mirror deltaLog.pop');
  ok(HTML.includes("state.deltaLog = [];  // ARKDELTA: nowa mapa = pusty log"),
    'wrapper applyMap: reset deltaLog przy wczytaniu mapy');
  ok(HTML.includes("deltaLog:           [],"), 'state: deklaracja deltaLog');
  // audyt T3/W17: cap scentralizowany w pushUndo (choke point); deltaLog nigdy nie scinany
  const capLines = HTML.split('\n').filter(l => l.includes('undoStack.shift()'));
  ok(capLines.length === 1 && capLines[0].includes('audyt T3/W17'),
    'cap 50 dokladnie 1x — w pushUndo (choke point), zero inline');
  ok(!HTML.includes('deltaLog.shift()'), 'deltaLog.shift nigdy (kalka zawsze kompletna wzgledem bazy)');
}

// ═══════════════════════════════════════════════════════════════════════════
// Sekcje T2-T7 (v1.6.0): blok ARKDELTA — eksport, walidacja fail-closed, apply.
// ═══════════════════════════════════════════════════════════════════════════
function blockSlice(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica bloku: ' + a);
  return HTML.slice(i, j);
}
for (const a of ['// === ARKDELTA START ===', '// ── UI: dialog + wiring',
                 'function _stripRoomDefaults(room) {',
                 'function stableStringify(val, indent, _lvl) {',
                 'function _replaceRoomData(room, snapshot) {',
                 'function _dispatchRedo(entry) {',
                 'function _arkdeltaBaseNote(base) {',
                 '// ── constants.js ──', '// ── validate.js ──',
                 '// ── checksum.js ──', '// ── mudlet_dat.js ──']) {
  if (HTML.indexOf(a) !== HTML.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}
const deltaCode =
  blockSlice('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  'const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT));\n' +
  extract(HTML, 'function _stripRoomDefaults(room) {') + '\n' +
  blockSlice('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  extract(HTML, 'function stableStringify(val, indent, _lvl) {') + '\n' +
  extract(HTML, 'function pushUndo(entry) {') + '\n' +
  extract(HTML, 'function _replaceRoomData(room, snapshot) {') + '\n' +
  extract(HTML, 'function _dispatchRedo(entry) {') + '\n' +
  blockSlice('// === ARKDELTA START ===', '// ── UI: dialog + wiring') + '\n' +
  // Stub UI (funkcja karty konfliktu mieszka poza blokiem rdzenia; zachowanie karty testuje E8.confcard w przegladarce).
  'function _deltaCardHide() {}\n' +
  extract(HTML, 'function _arkdeltaBaseNote(base) {') + '\n' +
  extract(HTML, 'function _deltaBaseCheck(base) {') + '\n' +
  '\n;return { pushUndo, _computeBaseInfo, _deltaStripRoom, buildDelta, validateDeltaText, applyDelta, classifyDelta, _arkdeltaBaseNote, _deltaBaseCheck, _deltaChecksums, stableStringify, addChecksums,'
  + '\n  _deltaBuildOcc, _deltaTakenCells, _deltaFindFreeCell, _deltaPlaceCtx, _deltaCellFree, _deltaApplyOverridesToOps, _deltaGhostGeoms, _deltaGhostReset,'
  + '\n  get ghosts() { return _deltaGhosts; }, set ghosts(v) { _deltaGhosts = v; },'
  + '\n  get overrides() { return _deltaOverrides; }, set overrides(v) { _deltaOverrides = v; },'
  + '\n  get placing() { return _deltaPlacing; }, set placing(v) { _deltaPlacing = v; },'
  + '\n  get hover() { return _deltaHover; }, set hover(v) { _deltaHover = v; } };';

function makeDeltaCtx() {
  const a1 = { id: 1, name: 'Area One', rooms: [
    { id: 10, x: 0, y: 0, z: 0, name: 'R10', env: 258, exits: { e: 11 } },
    { id: 11, x: 1, y: 0, z: 0, name: 'R11', env: 258, exits: { w: 10 } },
    { id: 12, x: 0, y: 1, z: 0, name: 'R12', env: 258 },
  ], labels: [{ id: 1, text: 'L1', x: 0, y: 0, z: 0, width: 4, height: 1.2 }] };
  const a2 = { id: 2, name: 'Area Two', rooms: [{ id: 20, x: 5, y: 5, z: 0, name: 'R20', env: 258 }], labels: [] };
  const state = {
    map: { meta: { user_data: { version: '9.9.9', revision: '0123456789abcdef0123456789abcdef01234567' } },
           areas: [a1, a2], colors: { custom_env_colors: {} } },
    areas: new Map(), roomById: {}, roomArea: {},
    undoStack: [], redoStack: [], deltaLog: [], dirty: false,
    filename: 'test.arkmap', z: 0, editMode: true, selected: null, selectedLabel: null, baseInfo: null,
  };
  for (const area of state.map.areas) {
    state.areas.set(area.id, area);
    for (const r of area.rooms) { state.roomById[r.id] = r; state.roomArea[r.id] = area.id; }
  }
  const toasts = [], downloads = [];
  let api = null;
  // Wzorzec miejsc wywołań aplikacji: pushUndo + cap inline + reset redo.
  const commitPush = (entry) => {
    api.pushUndo(entry);
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
  };
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne', nw: 'se', se: 'nw', up: 'down', down: 'up', in: 'out', out: 'in' };
  const stubs = {
    deleteRoom(roomId) {
      const room = state.roomById[roomId];
      const areaId = state.roomArea[roomId];
      const area = state.areas.get(areaId);
      const snapshot = JSON.parse(JSON.stringify(room));
      for (const r of Object.values(state.roomById)) {
        if (!r.exits) continue;
        for (const [d, t] of Object.entries(r.exits)) if (t === roomId) { delete r.exits[d]; }
      }
      area.rooms = area.rooms.filter(r => r.id !== roomId);
      delete state.roomById[roomId]; delete state.roomArea[roomId];
      commitPush({ type: 'DELETE_ROOM', roomId, snapshot, areaId, removedIncoming: [], label: 'Usuniecie pokoju' });
    },
    commitAddExit(sourceId, dir, targetId, bidirectional) {
      const src = state.roomById[sourceId], tgt = state.roomById[targetId];
      if (src.exits && src.exits[dir]) return;  // guard: kierunek zajęty
      src.exits = src.exits || {}; src.exits[dir] = targetId;
      if (bidirectional) { tgt.exits = tgt.exits || {}; if (!tgt.exits[OPP[dir]]) tgt.exits[OPP[dir]] = sourceId; }
      commitPush({ type: 'ADD_EXIT', sourceId, dir, targetId, bidirectional: !!bidirectional, opp: OPP[dir], label: 'Dodanie wyjscia' });
    },
    commitDeleteExit(room, dir) {
      const snap = { exitId: room.exits[dir], hasStub: (room.stubs || []).includes(dir) };
      delete room.exits[dir]; if (!Object.keys(room.exits).length) delete room.exits;
      commitPush({ type: 'DELETE_EXIT', roomId: room.id, dir, snap, label: 'Usuniecie wyjscia' });
    },
    commitMoveRoom(room, fx, fy, fz, tx, ty, tz) {
      room.x = tx; room.y = ty; room.z = tz;
      commitPush({ type: 'MOVE_ROOM', roomId: room.id, fromX: fx, fromY: fy, fromZ: fz, toX: tx, toY: ty, toZ: tz, label: 'Przesuniecie' });
    },
    commitMoveRoomToArea(roomId, toAreaId) {
      const fromAreaId = state.roomArea[roomId];
      const room = state.roomById[roomId];
      const fromArea = state.areas.get(fromAreaId), toArea = state.areas.get(toAreaId);
      fromArea.rooms = fromArea.rooms.filter(r => r.id !== roomId);
      toArea.rooms = toArea.rooms || []; toArea.rooms.push(room);
      state.roomArea[roomId] = toAreaId;
      commitPush({ type: 'MOVE_ROOM_TO_AREA', roomId, fromAreaId, toAreaId, label: 'Przeniesienie do obszaru' });
    },
    commitDeleteArea(areaId) {
      const area = state.areas.get(areaId);
      const snapshot = JSON.parse(JSON.stringify(area));
      const removedRoomIds = (area.rooms || []).map(r => r.id);
      for (const rid of removedRoomIds) { delete state.roomById[rid]; delete state.roomArea[rid]; }
      state.map.areas = state.map.areas.filter(a => a.id !== areaId);
      state.areas.delete(areaId);
      commitPush({ type: 'DELETE_AREA', areaId, snapshot, removedRoomIds, label: 'Usuniecie obszaru' });
    },
  };
  const fn = new Function(
    'state', '_dispatchUndo', 'updateUndoRedoUI', 'draw', 'scheduleDraw', 'toast', 'plPl', 'document',
    'download', 'escHtml', 'APP_VERSION',
    'deleteRoom', 'commitDeleteArea', 'commitMoveRoomToArea', 'commitAddExit', 'commitMoveRoom', 'commitDeleteExit',
    'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'refreshLabelList', 'populateEditForm', 'selectArea',
    deltaCode
  );
  api = fn(state, () => {}, () => {}, () => {}, () => {}, (m) => toasts.push(m), (n, one) => n + ' ' + one,
    { getElementById: () => null },
    (name, text) => downloads.push({ name, text }), (x) => String(x), 'v1.6.0-test',
    stubs.deleteRoom, stubs.commitDeleteArea, stubs.commitMoveRoomToArea, stubs.commitAddExit, stubs.commitMoveRoom, stubs.commitDeleteExit,
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
  return { state, api, toasts, downloads };
}

// Wspólny log przykładowy (10 opów, 12 typów powiązań sid/geometrii/kolorów).
function sampleDeltaLog(state) {
  const r10 = state.roomById[10];
  const renamed = JSON.parse(JSON.stringify(r10)); renamed.name = 'R10X';
  renamed.exits = { e: 11, s: 500 };  // jak w realnej sesji: edycja PO dodaniu wyjścia (snapshot pelny)
  return [
    { type: 'ADD_AREA', areaId: 50, areaData: { id: 50, name: 'Nowa', rooms: [], labels: [] }, label: 'Dodanie obszaru' },
    { type: 'ADD_ROOM', roomId: 500, areaId: 50, roomData: { id: 500, area: 50, x: 3, y: 3, z: 0, name: 'A', env: 262, weight: 1, exits: {}, special_exits: {}, custom_lines: {}, stubs: [], exit_locks: [], exit_weights: {}, doors: {}, user_data: {} }, label: 'Dodanie pokoju' },
    { type: 'ADD_ROOM', roomId: 501, areaId: 50, roomData: { id: 501, area: 50, x: 3, y: 4, z: 0, name: 'B', env: 262, weight: 1, exits: { n: 500 }, special_exits: {}, custom_lines: {}, stubs: [], exit_locks: [], exit_weights: {}, doors: {}, user_data: {} }, label: 'Dodanie pokoju' },
    { type: 'ADD_EXIT', sourceId: 10, dir: 's', targetId: 500, bidirectional: false, label: 'Dodanie wyjscia' },
    { type: 'ADD_LABEL', areaId: 50, snapshot: { id: 1, text: 'Ety', x: 1, y: 1, z: 0, width: 4, height: 1.2 }, label: 'Dodanie etykiety' },
    { type: 'EDIT_ROOM', roomId: 10, before: JSON.parse(JSON.stringify(r10)), after: renamed, label: 'Edycja pokoju' },
    { type: 'PAINT_BATCH', changes: [{ roomId: 11, beforeEnv: 258, beforeSymbol: undefined, afterEnv: 262, afterSymbol: '*' }], label: 'Malowanie' },
    { type: 'MOVE_ROOM', roomId: 12, fromX: 0, fromY: 1, fromZ: 0, toX: 2, toY: 2, toZ: 0, label: 'Przesuniecie' },
    { type: 'EDIT_ENV_COLOR', envId: 262, oldColor: [1, 2, 3], newColor: [4, 5, 6], label: 'Kolor env' },
    { type: 'ADD_CL', roomId: 11, dir: 'w', snapshot: { points: [[0, 0], [1, 1]], color: [255, 0, 0] }, label: 'CL' },
  ];
}

console.log('— T2: buildDelta — determinizm i kształt pliku —');
{
  const c1 = makeDeltaCtx();
  c1.state.baseInfo = c1.api._computeBaseInfo();
  c1.state.deltaLog = sampleDeltaLog(c1.state);
  const t1 = c1.api.buildDelta();
  ok(t1 === c1.api.buildDelta(), 'buildDelta: dwa wywołania na tym samym stanie → identyczne bajty');
  const c2 = makeDeltaCtx();
  c2.state.baseInfo = c2.api._computeBaseInfo();
  c2.state.deltaLog = sampleDeltaLog(c2.state);
  ok(t1 === c2.api.buildDelta(), 'buildDelta: świeży kontekst, ten sam log → identyczne bajty (determinizm)');
  const d = JSON.parse(t1);
  ok(d.meta.format === 'arkdelta' && d.meta.format_version === 2, 'meta: format + format_version 2 (v1.50.2)');
  ok(d.meta.ops_count === d.ops.length && d.ops.length === 10, 'meta.ops_count == liczba opów');
  ok(d.meta.base && d.meta.base.crc === c1.state.baseInfo.crc && d.meta.base.version === '9.9.9',
    'meta.base: crc + version z baseInfo');
  ok(d.meta.app_version === 'v1.6.0-test', 'meta.app_version z APP_VERSION');
  const dcs = c1.api._deltaChecksums(d.meta, d.ops);
  ok(d.checksums.file === dcs.file,
    'checksums.file zgodne z zawartością (meta+ops, XXH3-64)');
  ok(Array.isArray(d.checksums.ops) && d.checksums.ops.length === d.ops.length
    && d.checksums.ops.every((c, i) => c === dcs.ops[i]),
    'checksums.ops: per-op XXH3-64 zgodne');
  ok(/^[0-9a-f]{16}$/.test(d.checksums.file) && d.checksums.ops.every(c => /^[0-9a-f]{16}$/.test(c)),
    'checksums: format hex16 (XXH3-64)');
  ok(d.ops.every((op, i) => op.seq === i + 1), 'seq ciągłe od 1');
  ok(d.ops[0].target.areaId === 'd:1', 'sid: ADD_AREA → d:1');
  ok(d.ops[1].target.roomId === 'd:2' && d.ops[1].target.areaId === 'd:1', 'sid: ADD_ROOM → d:2 w obszarze d:1');
  ok(d.ops[2].payload.room.exits.n === 'd:2', 'sid: exits nowego pokoju przepisane na sid');
  ok(d.ops[3].payload.targetId === 'd:2' && d.ops[3].target.sourceId === 10, 'sid: ADD_EXIT cel sid, źródło numeryczne');
  ok(d.ops[4].payload.label.id === 'd:4' && d.ops[4].target.areaId === 'd:1', 'sid: ADD_LABEL → d:4');
  ok(d.ops[5].target.roomId === 10, 'sid: EDIT_ROOM istniejącego pokoju bez sid');
  const roomA = d.ops[1].payload.room;
  ok(roomA.area === undefined && roomA.exits === undefined && roomA.weight === undefined && roomA.user_data === undefined,
    'payload pokoju spec-clean (bez area / pustych kontenerów / defaultów)');
}

console.log('— T2b: _deltaStripRoom — kanonikalizacja pól zbiorczych (Arc 34) —');
{
  // Repro z paczki użytkownika: kalka tej samej edycji różniła się bajtami zależnie
  // od ścieżki wczytania mapy (.dat zostawia kolejność stubs z pliku, .arkmap sortuje).
  const mkLog = (stubs) => [{ type: 'DELETE_ROOM', roomId: 42, areaId: 1,
    snapshot: { id: 42, x: 1, y: 2, z: 0, name: '', env: 258, stubs } }];
  const cA = makeDeltaCtx();
  cA.state.baseInfo = cA.api._computeBaseInfo();
  cA.state.deltaLog = mkLog(['w', 'nw', 'sw']);   // porządek z loadera .dat
  const cB = makeDeltaCtx();
  cB.state.baseInfo = cB.api._computeBaseInfo();
  cB.state.deltaLog = mkLog(['nw', 'sw', 'w']);   // porządek z loadera .arkmap
  ok(cA.api.buildDelta() === cB.api.buildDelta(),
    'T2b: kolejność stubs w snapshocie NIE wpływa na bajty kalki (pre-fix: przeciek kolejności z loadera)');
  const cC = makeDeltaCtx();
  const stripped = cC.api._deltaStripRoom({ id: 1, x: 0, y: 0, z: 0,
    stubs: ['w', 'n'], exit_locks: ['s', 'n'], special_exit_locks: ['down', 'up'] });
  ok(stripped.stubs.join() === 'n,w' && stripped.exit_locks.join() === 'n,s'
    && stripped.special_exit_locks.join() === 'down,up',
    'T2b: _deltaStripRoom sortuje stubs/exit_locks/special_exit_locks (kanon _diffCanonRoom)');
}

console.log('— T3: validateDeltaText — round-trip eksportu —');
{
  const c = makeDeltaCtx();
  c.state.baseInfo = c.api._computeBaseInfo();
  c.state.deltaLog = sampleDeltaLog(c.state);
  const res = c.api.validateDeltaText(c.api.buildDelta());
  ok(res.ok === true && res.errors.length === 0, 'świeży eksport przechodzi walidację');
  ok(res.delta && res.delta.ops.length === 10, 'walidacja zwraca sparsowaną deltę');
}
{
  // Edytor liczy nowe id jako max+1 z AKTUALNEGO stanu → add po delete re-używa id.
  // sid musi być per wystąpienie (żywy obiekt), nie per id — inaczej duplikat definicji.
  const c = makeDeltaCtx();
  c.state.baseInfo = c.api._computeBaseInfo();
  const lbl = (id) => ({ id, text: 'x', x: 0, y: 0, z: 0, width: 4, height: 1.2 });
  const room = (name) => ({ id: 600, area: 2, x: 9, y: 9, z: 0, name, env: 258 });
  c.state.deltaLog = [
    { type: 'ADD_LABEL', areaId: 1, snapshot: lbl(2), label: 'a' },
    { type: 'DELETE_LABEL', areaId: 1, snapshot: lbl(2), label: 'd' },
    { type: 'ADD_LABEL', areaId: 1, snapshot: lbl(2), label: 'a2' },
    { type: 'ADD_ROOM', roomId: 600, areaId: 2, roomData: room('Q'), label: 'r' },
    { type: 'DELETE_ROOM', roomId: 600, areaId: 2, snapshot: room('Q'), label: 'rd' },
    { type: 'ADD_ROOM', roomId: 600, areaId: 2, roomData: room('Q2'), label: 'r2' },
  ];
  const text = c.api.buildDelta();
  const res = c.api.validateDeltaText(text);
  ok(res.ok === true, 'reuse id po DELETE: eksport przechodzi walidację' + (res.ok ? '' : ': ' + res.errors.join(' | ')));
  const d = JSON.parse(text);
  ok(d.ops[0].payload.label.id !== d.ops[2].payload.label.id, 'reuse label id: dwa ADD_LABEL → różne sid');
  ok(d.ops[1].payload.label.id === d.ops[0].payload.label.id, 'DELETE_LABEL referencuje pierwszy sid');
  ok(d.ops[3].target.roomId !== d.ops[5].target.roomId, 'reuse room id: dwa ADD_ROOM → różne sid');
  ok(d.ops[4].payload.room.id === d.ops[3].target.roomId, 'DELETE_ROOM snapshot z sid pierwszego wystąpienia');
}

console.log('— T4: validateDeltaText — strict refuse —');
{
  const c = makeDeltaCtx();
  const api = c.api;
  c.state.baseInfo = api._computeBaseInfo();
  c.state.deltaLog = sampleDeltaLog(c.state);
  const validText = api.buildDelta();
  const reseal = (delta) => {
    delta.checksums = api._deltaChecksums(delta.meta, delta.ops);
    return api.stableStringify(delta);
  };
  const refuse = (text, frag, name) => {
    const r = api.validateDeltaText(text);
    ok(r.ok === false && r.errors.some(e => e.includes(frag)), name + (r.ok ? ' — PRZESZŁO!' : (r.errors.some(e => e.includes(frag)) ? '' : ' — komunikat: ' + r.errors[0])));
  };
  refuse('', 'Pusty plik', 'odmowa: pusty plik');
  refuse('{nie-json', 'Nie można odczytać pliku', 'odmowa: nieczytelny plik kalki');
  refuse('{}', 'nie jest plik .arkdelta', 'odmowa: JSON bez meta.format');
  { const d = JSON.parse(validText); d.meta.format = 'arkmap';
    refuse(api.stableStringify(d), 'nie jest plik .arkdelta', 'odmowa: zły znacznik formatu'); }
  { const d = JSON.parse(validText); d.meta.format_version = 99;
    refuse(api.stableStringify(d), 'Nieobsługiwana wersja formatu', 'odmowa: nieobsługiwana wersja formatu'); }
  { const d = JSON.parse(validText); d.meta.format_version = 1;
    refuse(api.stableStringify(d), 'Nieobsługiwana wersja formatu', 'odmowa: stara kalka v1 (CRC-32) głośno odrzucona'); }
  { const d = JSON.parse(validText); d.ops[1].payload.room.name = 'SZKODA';
    refuse(api.stableStringify(d), 'uszkodzony', 'odmowa: suma zbiorcza po ingerencji w treść'); }
  { const d = JSON.parse(validText); d.ops[1].payload.room.name = 'SZKODA';
    const r = api.validateDeltaText(api.stableStringify(d));
    ok(r.ok === false && r.errors[0].includes('#2'), 'lokalizacja per-op: wskazany op #2'); }
  { const d = JSON.parse(validText); d.ops[1].seq = 999;
    refuse(reseal(d), 'numeracja nie jest po kolei', 'odmowa: numeracja op nie po kolei'); }
  { const d = JSON.parse(validText); d.ops[0].type = 'FOO_BAR';
    refuse(reseal(d), 'nieznany typ', 'odmowa: nieznany typ operacji'); }
  { const d = JSON.parse(validText); d.ops[3].target.dir = 'northeast';
    refuse(reseal(d), 'nieprawidłowy kierunek', 'odmowa: kierunek spoza VALID_DIRS'); }
  { const d = JSON.parse(validText); delete d.ops[1].payload.room;
    refuse(reseal(d), 'brak: dane pokoju', 'odmowa: brak wymaganego pola danych pokoju'); }
  { const d = JSON.parse(validText); d.ops[5].target.roomId = 'd:99';
    refuse(reseal(d), 'nieistniejącego obiektu kalki', 'odmowa: sid bez definicji'); }
  { const d = JSON.parse(validText); d.ops[2].target.roomId = 'd:2'; d.ops[2].payload.room.id = 'd:2';
    refuse(reseal(d), 'zduplikowany', 'odmowa: zduplikowany sid'); }
  { const d = JSON.parse(validText);
    d.ops[0].payload = JSON.parse('{"__proto__":{},"area":' + JSON.stringify(d.ops[0].payload.area) + '}');
    refuse(reseal(d), 'niedozwolony klucz', 'odmowa: klucz __proto__'); }
  { const d = JSON.parse(validText); d.meta.ops_count = 999;
    refuse(reseal(d), 'w nagłówku', 'odmowa: liczba operacji z nagłówka nie zgadza się z listą'); }
  refuse('x'.repeat(8 * 1024 * 1024 + 1), 'za duży', 'odmowa: plik ponad limit 8 MB');
  { const d = { meta: { format: 'arkdelta', format_version: 2, ops_count: 5001, base: {} },
      ops: Array.from({ length: 5001 }, (_, i) => ({ seq: i + 1, type: 'EDIT_ENV_COLOR', target: { envId: 1 }, payload: { newColor: [1, 2, 3] } })) };
    refuse(reseal(d), 'Za dużo operacji', 'odmowa: ponad 5000 opów'); }
}

console.log('— T5: applyDelta — świeże id i przepisanie sid —');
{
  const c = makeDeltaCtx();
  const { state, api } = c;
  state.baseInfo = api._computeBaseInfo();
  state.deltaLog = sampleDeltaLog(state);
  const v = api.validateDeltaText(api.buildDelta());
  ok(v.ok, 'apply: delta przechodzi walidację');
  const res = api.applyDelta(v.delta);
  ok(res.applied === 10 && res.skipped.length === 0, 'apply: 10/10 naniesionych' + (res.skipped.length ? ' — skipped: ' + JSON.stringify(res.skipped) : ''));
  ok(state.areas.has(3), 'apply: nowy obszar dostał świeży id 3 (max+1), nie 50 z sesji');
  const area3 = state.areas.get(3);
  const ids = area3.rooms.map(r => r.id).sort((a, b) => a - b);
  ok(ids.length === 2 && ids[0] === 21 && ids[1] === 22, 'apply: pokoje kalki dostały świeże id 21, 22 (max+1)');
  const rA = area3.rooms.find(r => r.name === 'A'), rB = area3.rooms.find(r => r.name === 'B');
  ok(rB.exits && rB.exits.n === rA.id, 'apply: exit pokoju B przepisany na świeży id pokoju A');
  ok(state.roomById[10].exits.s === rA.id, 'apply: ADD_EXIT z realnego pokoju 10 → świeży id');
  ok(area3.labels.length === 1 && area3.labels[0].text === 'Ety' && area3.labels[0].id === 1, 'apply: etykieta w nowym obszarze');
  ok(state.roomById[10].name === 'R10X' && state.roomById[10].exits.e === 11, 'apply: EDIT_ROOM przez _dispatchRedo (nazwa + zachowane exits)');
  ok(state.roomById[11].env === 262 && state.roomById[11].symbol === '*', 'apply: PAINT_BATCH');
  ok(state.roomById[12].x === 2 && state.roomById[12].y === 2, 'apply: MOVE_ROOM przez commit');
  ok(state.map.colors.custom_env_colors[262].join() === '4,5,6', 'apply: EDIT_ENV_COLOR');
  ok(state.roomById[11].custom_lines.w.points.length === 2, 'apply: ADD_CL');
  ok(state.undoStack.length === 10 && state.deltaLog.length === 20, 'apply: undoStack +10, deltaLog 10+10 (mirror)');
  ok(state.redoStack.length === 0, 'apply: redoStack czyszczony jak przy zwykłej edycji');
}

console.log('— T6: applyDelta — pomijanie z powodami —');
{
  const c = makeDeltaCtx();
  const { state, api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'DELETE_ROOM', target: { roomId: 999, areaId: 1 }, payload: { room: { id: 999 } }, label: '' },
    { seq: 2, type: 'ADD_EXIT', target: { sourceId: 10, dir: 'e' }, payload: { targetId: 12, bidirectional: false }, label: '' },
    { seq: 3, type: 'EDIT_ROOM', target: { roomId: 999 }, payload: { before: {}, after: { id: 999 } }, label: '' },
    { seq: 4, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 99 }, payload: { room: { id: 'd:1', x: 0, y: 0, z: 0 } }, label: '' },
    { seq: 5, type: 'EDIT_ROOM', target: { roomId: 10 }, payload: { before: {}, after: { id: 10, x: 0, y: 0, z: 0, name: 'X', env: 258, exits: { n: 'd:7' } } }, label: '' },
    { seq: 6, type: 'ADD_EXIT', target: { sourceId: 10, dir: 'n' }, payload: { targetId: 12, bidirectional: true }, label: '' },
  ] };
  const res = api.applyDelta(delta);
  ok(res.applied === 1 && res.skipped.length === 5, 'apply mieszany: 1 naniesiony, 5 pominiętych');
  const why = (seq) => (res.skipped.find(s => s.seq === seq) || {}).reason || '';
  ok(why(1) === 'pokój nie istnieje', 'skip: DELETE_ROOM nieistniejącego pokoju');
  ok(why(2) === 'kierunek zajęty (guard)', 'skip: ADD_EXIT na zajętym kierunku (guard commitu)');
  ok(why(3) === 'pokój nie istnieje', 'skip: EDIT_ROOM nieistniejącego pokoju');
  ok(why(4) === 'obszar nie istnieje', 'skip: ADD_ROOM do nieistniejącego obszaru');
  ok(why(5).includes('d:7'), 'skip: defensywny — osierocony sid w payloadzie');
  ok(state.roomById[10].exits.n === 12 && state.roomById[12].exits.s === 10, 'naniesiony ADD_EXIT dwukierunkowy mimo skipów');
  ok(state.undoStack.length === 1, 'undoStack: tylko naniesione opy');
}

console.log('— T7: baseInfo, spec-clean, struktura UI —');
{
  const c = makeDeltaCtx();
  const { state, api } = c;
  const bi1 = api._computeBaseInfo();
  ok(typeof bi1.crc === 'string' && bi1.crc.length > 0, 'baseInfo: crc policzone');
  ok(bi1.version === '9.9.9' && bi1.revision.startsWith('0123456789'), 'baseInfo: version/revision z meta.user_data');
  state.map.areas.reverse();
  for (const a of state.map.areas) a.rooms.reverse();
  ok(api._computeBaseInfo().crc === bi1.crc, 'baseInfo: crc niezależne od kolejności obszarów/pokoi');
  state.roomById[10].name = 'INNA';
  ok(api._computeBaseInfo().crc !== bi1.crc, 'baseInfo: zmiana treści mapy → inne crc');
  state.roomById[10].name = 'R10';
  const stripped = api._deltaStripRoom({ id: 5, area: 1, x: 1, y: 2, z: 0, name: '', env: 258, exits: {}, weight: 1, symbol: '', stubs: [], user_data: {} });
  ok(stripped.area === undefined && stripped.name === undefined && stripped.exits === undefined
    && stripped.weight === undefined && stripped.symbol === undefined && stripped.stubs === undefined
    && stripped.id === 5 && stripped.env === 258 && stripped.x === 1, '_deltaStripRoom: omission convention spec');
  state.baseInfo = bi1;
  ok(api._arkdeltaBaseNote(null) === 'Kalka bez informacji o wersji mapy, na której ją zapisano.', 'baseNote: brak informacji o wersji');
  ok(api._arkdeltaBaseNote({ crc: bi1.crc, version: '9.9.9' }).includes('Kalka pasuje do wczytanej mapy'), 'baseNote: kalka pasuje do mapy');
  ok(api._arkdeltaBaseNote({ crc: 'deadbeef', version: '1.0.0' }).includes('innej wersji'), 'baseNote: baza niezgodna');
}
ok(HTML.includes('<input type="file" id="fi-arkdelta" accept=".arkdelta">'), 'markup: fi-arkdelta');
ok(HTML.includes('id="btn-load-arkdelta"'), 'markup: btn-load-arkdelta pod przyciskami zapisu');
ok(HTML.includes('loadArkdeltaBtn.disabled = !isEdit'), 'integracja: updateEditUI odlokowuje btn-load-arkdelta w trybie edycji (F7)');
ok(HTML.includes('id="btn-save-arkdelta" class="etb-check" disabled'), 'markup: btn-save-arkdelta pod walidacją (disabled)');
ok(HTML.includes('id="dlg-arkdelta"') && HTML.includes('id="arkdelta-body"'), 'markup: dialog dlg-arkdelta (błędy walidacji)');
ok(HTML.includes('state._deferVerify = true;') && HTML.includes('state.baseInfo = null;')
  && HTML.includes('state.baseInfo = _computeBaseInfo(null, (chkRes && chkRes.computed) || null);')
  && HTML.includes('requestAnimationFrame(() => setTimeout(() => _postLoadVerifyDeferred(mapRef), 0));'),
  'integracja: baseInfo po pierwszej klatce z reużyciem computed z verify (P3b, fala 3)');
ok(HTML.includes('_arkdeltaUpdateSaveBtn();'), 'integracja: hook przycisku zapisu w updateUndoRedoUI');
ok(HTML.includes("btnLoadArkdelta.addEventListener('click'") && HTML.includes("fiArkdelta.addEventListener('change'")
  && HTML.includes("btnSaveArkdelta.addEventListener('click', saveDelta)"), 'integracja: listenery wczytaj/zapisz');
ok(HTML.includes("const APP_VERSION = 'v1.50.2';"), 'wersja: v1.50.2');

// — W3 (v1.35.0): etykiety kalki zachowane przez 6 niskopoziomowych sciezek commit —
{
  const sigs = [
    'function deleteRoom(roomId, label) {',
    'function commitDeleteArea(areaId, label) {',
    'function commitMoveRoomToArea(roomId, targetAreaId, label) {',
    'function commitAddExit(sourceId, dir, targetId, bidirectional, customLabel) {',
    'function commitDeleteExit(room, dir, label) {',
    'function commitMoveRoom(room, fromX, fromY, fromZ, toX, toY, toZ, label) {',
  ];
  for (const s of sigs) ok(HTML.includes(s), 'W3: sygnatura z etykieta — ' + s.slice(9, s.indexOf('(')));
  const fallbacks = [
    'label: label || `Usunięcie pokoju',
    'label: label || `Usunięcie obszaru',
    'label: label || `Przeniesienie pokoju',
    'const label = customLabel || (bidirectional',
    'label: label || `Usunięcie wyjścia',
    'label: label || `Przesunięcie pokoju',
  ];
  for (const f of fallbacks) ok(HTML.includes(f), 'W3: fallback etykiety — ' + f.replace('label: ', '').slice(0, 40));
  const callers = [
    'deleteRoom(op.target.roomId, op.label);',
    'commitDeleteArea(op.target.areaId, op.label);',
    // audyt ext F1.4: applyDelta nie woła już UI-owego commitMoveRoomToArea —
    // ścieżka data-only przekazuje op.label do wpisu undo przez _deltaPush.
    "_deltaPush({ type: 'MOVE_ROOM_TO_AREA', roomId: room.id, fromAreaId, toAreaId, label: op.label });",
    'commitAddExit(op.target.sourceId, op.target.dir, op.payload.targetId, !!op.payload.bidirectional, op.label);',
    'commitDeleteExit(room, op.target.dir, op.label);',
    'commitMoveRoom(room, fx, fy, fz, tx, ty, tz, op.label);',
  ];
  for (const c of callers) ok(HTML.includes(c), 'W3: applyDelta przekazuje op.label — '
    + (c.includes('MOVE_ROOM_TO_AREA') ? 'MOVE_ROOM_TO_AREA (data-only, F1.4)' : c.slice(0, c.indexOf('('))));
  ok(HTML.includes("ops.push({ seq: ++seq, type: e.type, target, payload, label: e.label || '' });"),
    'W3: buildDelta emituje e.label z wpisu undo (round-trip etykiety)');
}

console.log('— T8: classifyDelta + recenzja (M2) —');
{
  const c = makeDeltaCtx();
  const { state, api } = c;
  const op = (seq, type, target, payload) => ({ seq, type, target, payload, label: 'op ' + seq });
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    op(1,  'ADD_ROOM',  { roomId: 'd:1', areaId: 1 }, { room: { id: 'd:1', x: 5, y: 5, z: 0, name: 'Nowy', env: 262 } }),
    op(2,  'ADD_ROOM',  { roomId: 'd:2', areaId: 1 }, { room: { id: 'd:2', x: 1, y: 0, z: 0, name: 'Inny', env: 262 } }),
    op(3,  'ADD_ROOM',  { roomId: 'd:3', areaId: 1 }, { room: { id: 'd:3', x: 1, y: 0, z: 0, name: 'R11', env: 258, exits: { w: 10 } } }),
    op(4,  'ADD_ROOM',  { roomId: 'd:4', areaId: 99 }, { room: { id: 'd:4', x: 0, y: 0, z: 0 } }),
    op(5,  'DELETE_ROOM', { roomId: 12, areaId: 1 }, { room: JSON.parse(JSON.stringify(state.roomById[12])) }),
    op(6,  'DELETE_ROOM', { roomId: 999, areaId: 1 }, { room: { id: 999 } }),
    op(7,  'EDIT_ROOM', { roomId: 10 }, { before: JSON.parse(JSON.stringify(state.roomById[10])), after: Object.assign(JSON.parse(JSON.stringify(state.roomById[10])), { name: 'R10X' }) }),
    op(8,  'EDIT_ROOM', { roomId: 11 }, { before: { id: 11, x: 9, y: 9, z: 0, name: 'STARE' }, after: JSON.parse(JSON.stringify(state.roomById[11])) }),
    op(9,  'EDIT_ROOM', { roomId: 12 }, { before: { id: 12, x: 9, y: 9, z: 0, name: 'A' }, after: { id: 12, x: 8, y: 8, z: 0, name: 'B' } }),
    op(10, 'ADD_EXIT',  { sourceId: 10, dir: 's' }, { targetId: 12, bidirectional: false }),
    op(11, 'ADD_EXIT',  { sourceId: 10, dir: 'e' }, { targetId: 11, bidirectional: false }),
    op(12, 'ADD_EXIT',  { sourceId: 10, dir: 'e' }, { targetId: 12, bidirectional: false }),
    op(13, 'ADD_EXIT',  { sourceId: 999, dir: 'n' }, { targetId: 12, bidirectional: false }),
    op(14, 'ADD_AREA',  { areaId: 'd:5' }, { area: { id: 'd:5', name: 'Trzeci' } }),
    op(15, 'ADD_AREA',  { areaId: 'd:6' }, { area: { id: 'd:6', name: 'Area Two' } }),
    op(16, 'DELETE_AREA', { areaId: 99 }, {}),
    op(17, 'MOVE_ROOM', { roomId: 12 }, { fromX: 0, fromY: 1, fromZ: 0, toX: 7, toY: 7, toZ: 0 }),
    op(18, 'MOVE_ROOM', { roomId: 12 }, { fromX: 0, fromY: 1, fromZ: 0, toX: 0, toY: 1, toZ: 0 }),
    op(19, 'MOVE_ROOM', { roomId: 12 }, { fromX: 0, fromY: 1, fromZ: 0, toX: 1, toY: 0, toZ: 0 }),
    op(20, 'EDIT_ENV_COLOR', { envId: 262 }, { oldColor: null, newColor: [9, 9, 9] }),
    op(21, 'ADD_LABEL', { areaId: 1 }, { label: { id: 'd:7', text: 'L1', x: 0, y: 0, z: 0, width: 4, height: 1.2 } }),
    op(22, 'ADD_LABEL', { areaId: 1 }, { label: { id: 'd:8', text: 'Nowa', x: 3, y: 3, z: 0, width: 4, height: 1.2 } }),
    op(23, 'DELETE_ROOM', { roomId: 'd:4', areaId: 99 }, { room: { id: 'd:4' } }),
    // F1: pokrycie na pokojach, ktore PRZETRWAJA sekwencje (12 znika w op5)
    op(24, 'EDIT_ROOM', { roomId: 11 }, { before: { id: 11, x: 9, y: 9, z: 0, name: 'STARE' }, after: { id: 11, x: 9, y: 9, z: 0, name: 'B' } }),
    op(25, 'ADD_EXIT',  { sourceId: 11, dir: 'n' }, { targetId: 10, bidirectional: false }),
    op(26, 'ADD_EXIT',  { sourceId: 10, dir: 'e' }, { targetId: 20, bidirectional: false }),
    op(27, 'MOVE_ROOM', { roomId: 10 }, { fromX: 0, fromY: 0, fromZ: 0, toX: 7, toY: 7, toZ: 0 }),
    op(28, 'MOVE_ROOM', { roomId: 11 }, { fromX: 9, fromY: 9, fromZ: 0, toX: 9, toY: 9, toZ: 0 }),
    op(29, 'MOVE_ROOM', { roomId: 11 }, { fromX: 9, fromY: 9, fromZ: 0, toX: 7, toY: 7, toZ: 0 }),
  ] };
  const items = api.classifyDelta(delta);
  const cls = (seq) => items.find(i => i.seq === seq).cls;
  const note = (seq) => items.find(i => i.seq === seq).note;
  ok(items.length === 29, 'classify: wszystkie opy sklasyfikowane');
  ok(cls(1) === 'ok', 'classify ADD_ROOM: wolne pole → ok');
  ok(cls(2) === 'hard' && note(2).includes('kolizja'), 'classify ADD_ROOM: pole zajęte (inna nazwa) → hard/kolizja');
  ok(cls(3) === 'done' && note(3).includes('#11'), 'classify ADD_ROOM: to samo pole i nazwa → done (add-matching)');
  ok(cls(4) === 'impossible' && note(4).includes('obszar nie istnieje'), 'classify ADD_ROOM: obszar nie istnieje → impossible');
  ok(cls(5) === 'ok', 'classify DELETE_ROOM: zgodny snapshot → ok');
  ok(cls(6) === 'impossible', 'classify DELETE_ROOM: pokój usunięty upstream → impossible');
  ok(cls(7) === 'ok', 'classify EDIT_ROOM: before zgodne → ok');
  ok(cls(8) === 'done', 'classify EDIT_ROOM: live == after → done (już naniesione)');
  ok(cls(9) === 'impossible', 'classify EDIT_ROOM (F1): pokój usunięty wcześniej w tej kali (op5) → impossible');
  {
    // F2: done-detection po ZMIENIANYCH polach — inne pola mogla zmienic inna op kalki
    const c2 = makeDeltaCtx();
    const orig10 = JSON.parse(JSON.stringify(c2.state.roomById[10]));
    const after10 = Object.assign(JSON.parse(JSON.stringify(orig10)), { name: 'R10X' });
    c2.state.roomById[10].name = 'R10X';
    c2.state.roomById[10].exits = Object.assign({}, c2.state.roomById[10].exits, { n: 11 });
    const d2 = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
      { seq: 1, type: 'EDIT_ROOM', target: { roomId: 10 }, payload: { before: orig10, after: after10 }, label: '' } ] };
    ok(c2.api.classifyDelta(d2)[0].cls === 'done', 'classify EDIT_ROOM (F2): zmieniane pole zgodne z after → done mimo rozjazdu na innych polach');
    c2.state.roomById[10].name = 'INNA';
    ok(c2.api.classifyDelta(d2)[0].cls !== 'done', 'classify EDIT_ROOM (F2): zmieniane pole rozbiezne → nie-done');
  }
  ok(cls(10) === 'impossible', 'classify ADD_EXIT (F1): cel (12) usunięty wcześniej w kali (op5) → impossible');
  ok(cls(11) === 'done', 'classify ADD_EXIT: istnieje do tego samego celu → done');
  ok(cls(12) === 'impossible', 'classify ADD_EXIT (F1): cel (12) usunięty wcześniej w kali → impossible');
  ok(cls(13) === 'impossible', 'classify ADD_EXIT: pokój nie istnieje → impossible');
  ok(cls(14) === 'ok', 'classify ADD_AREA: nowa nazwa → ok');
  ok(cls(15) === 'done' && note(15).includes('#2'), 'classify ADD_AREA: nazwa istnieje → done');
  ok(cls(16) === 'impossible', 'classify DELETE_AREA: obszar nie istnieje → impossible');
  ok(cls(17) === 'impossible', 'classify MOVE_ROOM (F1): pokój 12 usunięty wcześniej w kali (op5) → impossible');
  ok(cls(18) === 'impossible', 'classify MOVE_ROOM (F1): jw. → impossible');
  ok(cls(19) === 'impossible', 'classify MOVE_ROOM (F1): jw. → impossible');
  ok(cls(24) === 'hard', 'classify EDIT_ROOM: live != before → hard (zmieniony upstream)');
  ok(cls(25) === 'ok', 'classify ADD_EXIT: wolny kierunek → ok');
  ok(cls(26) === 'hard' && note(26).includes('pominie tę operację'), 'classify ADD_EXIT: kierunek zajęty innym → hard (Zastosuj pominie operację)');
  ok(cls(27) === 'ok', 'classify MOVE_ROOM: wolne pole → ok');
  ok(cls(28) === 'done', 'classify MOVE_ROOM (F1): już na miejscu wg pozycji z CIENIA (po op24) → done');
  ok(cls(29) === 'hard' && note(29).includes('kolizja'), 'classify MOVE_ROOM (F1): pole zajęte przez pokój przesunięty wcześniej w kali (op27) → hard');
  ok(cls(20) === 'ok', 'classify EDIT_ENV_COLOR: inny kolor → ok');
  ok(cls(21) === 'done', 'classify ADD_LABEL: identyczna etykieta → done');
  ok(cls(22) === 'ok', 'classify ADD_LABEL: nowa → ok');
  ok(cls(23) === 'impossible' && note(23).includes('d:4'), 'classify łańcuch: op na niewykonalnym obiekcie kalki → impossible');
  const chk = (seq) => items.find(i => i.seq === seq).checked;
  ok(chk(1) && chk(2) && !chk(3) && !chk(4) && !chk(15), 'classify: domyślnie zaznaczone ok+hard, odznaczone done+impossible');
  const j3 = items.find(i => i.seq === 3).jump, j1 = items.find(i => i.seq === 1).jump;
  ok(j3 && j3.roomId === 11, 'classify: jump done-ADD_ROOM → istniejący pokój');
  ok(j1 && j1.areaId === 1 && j1.x === 5, 'classify: jump ok-ADD_ROOM → pozycja w obszarze');
}
{
  // onlySeq: nanosi tylko zaznaczone
  const c = makeDeltaCtx();
  const { state, api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 2 }, payload: { room: { id: 'd:1', x: 8, y: 8, z: 0, name: 'Nowy', env: 262 } }, label: 'r' },
    { seq: 2, type: 'EDIT_ROOM', target: { roomId: 10 }, payload: { before: {}, after: { id: 10, x: 0, y: 0, z: 0, name: 'R10X', env: 258, exits: { e: 11 } } }, label: 'e' },
  ] };
  const res = api.applyDelta(delta, new Set([2]));
  ok(res.applied === 1 && res.skipped.length === 0, 'apply onlySeq: naniesiony tylko zaznaczony op');
  ok(state.roomById[10].name === 'R10X', 'apply onlySeq: EDIT_ROOM wykonany');
  ok(state.areas.get(2).rooms.length === 1, 'apply onlySeq: odznaczony ADD_ROOM pominięty milcząco');
  ok(state.undoStack.length === 1, 'apply onlySeq: undoStack tylko z naniesionego');
}
{
  // re-klasyfikacja po apply: ok → done (idempotentność przez klasyfikator)
  const c = makeDeltaCtx();
  const { state, api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 2 }, payload: { room: { id: 'd:1', x: 8, y: 8, z: 0, name: 'Nowy', env: 262 } }, label: 'r' },
  ] };
  const before = api.classifyDelta(delta);
  ok(before[0].cls === 'ok', 're-klasyfikacja: przed apply → ok');
  api.applyDelta(delta);
  const after = api.classifyDelta(delta);
  ok(after[0].cls === 'done', 're-klasyfikacja: po apply → done (powtórne wczytanie kalki nie dubluje)');
}
{
  // EDIT_ENV_COLOR już naniesiony
  const c = makeDeltaCtx();
  const { state, api } = c;
  state.map.colors.custom_env_colors[262] = [9, 9, 9];
  const delta = { meta: {}, ops: [{ seq: 1, type: 'EDIT_ENV_COLOR', target: { envId: 262 }, payload: { oldColor: [1, 2, 3], newColor: [9, 9, 9] }, label: '' }] };
  ok(api.classifyDelta(delta)[0].cls === 'done', 'classify EDIT_ENV_COLOR: kolor już ustawiony → done');
}
// struktura panelu recenzji
ok(HTML.includes('id="delta-panel"') && HTML.includes('id="dp-body"') && HTML.includes('id="dp-apply"')
  && HTML.includes('id="dp-rebase"') && HTML.includes('id="dp-base"'), 'markup: panel recenzji delta-panel');
ok((HTML.match(/class="vd-btn dp-filter"/g) || []).length === 5, 'markup: 5 klawiszy filtrow');
ok(HTML.includes("openDeltaReview(res.delta)"), 'flow: po walidacji otwiera się recenzja');
ok(HTML.includes("document.getElementById('dp-apply').addEventListener('click', _deltaApplyReviewed)"), 'integracja: przycisk Zastosuj zaznaczone');
ok(HTML.includes("document.getElementById('dp-rebase').addEventListener('click', saveDelta)"), 'integracja: rebase = ponowny zapis kalki');
ok(!HTML.includes('arkdelta-apply'), 'markup: stary przycisk Zastosuj usunięty (recenzja przejmuje flow)');
ok(HTML.includes("const ownSid = (op.type === 'ADD_ROOM'"), 'walidator: definicja sid przed skanem użyć');

// ═══════════════════════════════════════════════════════════════════════════
// T9 (v1.8.0): M3 — warstwa duchów + kolizje pozycji.
// ═══════════════════════════════════════════════════════════════════════════
// Wspólna delta kolizyjna (9 opow): 2x ADD_ROOM na zajętym (0,0), MOVE_ROOM na
// zajęte (1,0), wolny ADD_ROOM, ADD_EXIT do sid, DELETE_ROOM istniejący i
// nieistniejący, ADD_AREA + ADD_ROOM w obszarze kalki.
function collisionDelta() {
  const room = (x, y, name) => ({ x, y, z: 0, name, env: 262 });
  return {
    meta: { format: 'arkdelta', format_version: 2, ops_count: 9, base: { crc: 'x' } },
    ops: [
      { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room(0, 0, 'N1') }, label: 'A1' },
      { seq: 2, type: 'ADD_ROOM', target: { roomId: 'd:2', areaId: 1 }, payload: { room: room(0, 0, 'N2') }, label: 'A2' },
      { seq: 3, type: 'MOVE_ROOM', target: { roomId: 12 }, payload: { toX: 1, toY: 0, toZ: 0 }, label: 'M' },
      { seq: 4, type: 'ADD_ROOM', target: { roomId: 'd:4', areaId: 1 }, payload: { room: room(10, 10, 'N3') }, label: 'A3' },
      { seq: 5, type: 'ADD_EXIT', target: { sourceId: 10, dir: 's' }, payload: { targetId: 'd:1', bidirectional: false }, label: 'E' },
      { seq: 6, type: 'DELETE_ROOM', target: { roomId: 11 }, payload: { room: { x: 1, y: 0, z: 0, name: 'R11', env: 258, exits: { w: 10 } } }, label: 'D' },
      { seq: 7, type: 'DELETE_ROOM', target: { roomId: 999 }, payload: { room: { x: 0, y: 0, z: 0, name: 'GH' } }, label: 'D2' },
      { seq: 8, type: 'ADD_AREA', target: { areaId: 'd:9' }, payload: { area: { name: 'Unikalna Nazwa XYZ', rooms: [], labels: [] } }, label: 'AA' },
      { seq: 9, type: 'ADD_ROOM', target: { roomId: 'd:10', areaId: 'd:9' }, payload: { room: room(0, 0, 'K') }, label: 'A4' },
    ],
  };
}

console.log('— T9: M3 — duchy, spirala, overridey —');
{
  const c = makeDeltaCtx();
  const delta = collisionDelta();
  const items = c.api.classifyDelta(delta);
  ok(items[0].cls === 'hard' && items[0].coll === true, 'klasyfikacja: ADD_ROOM na zajętym = hard + coll');
  ok(items[1].cls === 'hard' && items[1].coll === true, 'klasyfikacja: drugi ADD_ROOM też hard + coll');
  ok(items[2].cls === 'hard' && items[2].coll === true, 'klasyfikacja: MOVE_ROOM na zajęte = hard + coll');
  ok(items[3].cls === 'ok' && !items[3].coll, 'klasyfikacja: wolny ADD_ROOM = ok bez coll');
  ok(items.sidAreaId instanceof Map && items.sidRoomId instanceof Map, 'klasyfikacja: items niesie mapy sid');

  // Spirala: determinizm i dokładny porządek pierścieni
  const f1 = c.api._deltaFindFreeCell(1, 0, 0, 0, new Set());
  ok(f1 && f1.x === 0 && f1.y === -1, 'spirala: r=0 zajęte, pierwsza wolna r=1 to (0,-1)');
  ok(JSON.stringify(f1) === JSON.stringify(c.api._deltaFindFreeCell(1, 0, 0, 0, new Set()))
    && JSON.stringify(f1) === JSON.stringify(c.api._deltaFindFreeCell(1, 0, 0, 0, new Set())),
    'spirala: 3 przebiegi → identyczny wynik (determinizm)');
  const f2 = c.api._deltaFindFreeCell(1, 0, 0, 0, new Set(['1:0:-1:0']));
  ok(f2 && f2.x === -1 && f2.y === 0, 'spirala: (0,-1) w taken → następna w porządku to (-1,0)');

  // Spirala: taken pokrywa r<=2 wokół (5,5) w area 2 → wynik pierwszy komórek r=3 = (5,2)
  const taken3 = new Set();
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++)
    if (Math.abs(dx) + Math.abs(dy) <= 2) taken3.add('2:' + (5 + dx) + ':' + (5 + dy) + ':0');
  const f3 = c.api._deltaFindFreeCell(2, 5, 5, 0, taken3);
  ok(f3 && f3.x === 5 && f3.y === 2, 'spirala: taken r<=2 → pierwsza komórka r=3 to (5,2)');

  // Spirala: pokrycie wszystkiego do r=25 → null
  const takenAll = new Set();
  for (let dx = -25; dx <= 25; dx++) for (let dy = -25; dy <= 25; dy++)
    if (Math.abs(dx) + Math.abs(dy) <= 25) takenAll.add('2:' + (5 + dx) + ':' + (5 + dy) + ':0');
  ok(c.api._deltaFindFreeCell(2, 5, 5, 0, takenAll) === null, 'spirala: R_MAX=25 wyczerpane → null');

  // Spirala: selfRoomId (MOVE_ROOM) — własna komórka nie liczy się jako zajęta
  const fSelf = c.api._deltaFindFreeCell(1, 1, 0, 0, new Set(), 11);
  ok(fSelf && fSelf.x === 1 && fSelf.y === 0, 'spirala: selfRoomId=11 → własne pole (1,0) wolne dla r=0');

  // Wsadowosc: sekwencyjne autopozycje dwóch kolizji → różne komórki
  const t1 = c.api._deltaTakenCells(delta, items, 1);
  ok(t1.has('1:0:0:0') && t1.has('1:1:0:0') && t1.has('1:10:10:0'), 'taken: cele innych zaznaczonych opów (ADD_ROOM x2 + MOVE_ROOM)');
  const a1 = c.api._deltaFindFreeCell(1, 0, 0, 0, t1);
  c.api.overrides = new Map([[1, { x: a1.x, y: a1.y, how: 'auto' }]]);
  const t2 = c.api._deltaTakenCells(delta, items, 2);
  ok(t2.has('1:' + a1.x + ':' + a1.y + ':0'), 'taken: override pierwszej kolizji rezerwuje komórkę');
  const a2 = c.api._deltaFindFreeCell(1, 0, 0, 0, t2);
  ok(a2 && !(a2.x === a1.x && a2.y === a1.y), 'wsadowość: druga autopozycja ≠ pierwsza (' + a1.x + ',' + a1.y + ' vs ' + a2.x + ',' + a2.y + ')');

  // _deltaCellFree
  ok(c.api._deltaCellFree(1, 0, 0, 0, delta, items, 99) === false, 'cellFree: zajęte na żywo → false');
  ok(c.api._deltaCellFree(1, 9, 9, 0, delta, items, 99) === true, 'cellFree: wolne → true');
  ok(c.api._deltaCellFree(1, a1.x, a1.y, 0, delta, items, 99) === false, 'cellFree: komórka z override → false');
  ok(c.api._deltaCellFree(1, 0, 1, 0, delta, items, 3, 12) === true, 'cellFree: własna komórka MOVE_ROOM → true');

  // _deltaPlaceCtx
  const pctx1 = c.api._deltaPlaceCtx(delta, items, 1);
  ok(pctx1 && pctx1.areaId === 1 && pctx1.z === 0 && pctx1.roomId === undefined, 'placeCtx ADD_ROOM: {areaId, z}');
  const pctx3 = c.api._deltaPlaceCtx(delta, items, 3);
  ok(pctx3 && pctx3.areaId === 1 && pctx3.roomId === 12, 'placeCtx MOVE_ROOM: + roomId');
  const pctx9 = c.api._deltaPlaceCtx(delta, items, 9);
  ok(pctx9 && pctx9.areaId === 'd:9' && pctx9.sidArea === true && pctx9.z === 0,
    'placeCtx: obszar kalki (ADD_AREA ok+checked) -> kontekst na surowym sid (audyt T5/F5)');
  items[7].checked = false;  // odznaczone ADD_AREA = obszar nie powstanie przy apply
  ok(c.api._deltaPlaceCtx(delta, items, 9) === null, 'placeCtx: obszar kalki z odznaczonym ADD_AREA -> null (audyt T5/F5)');
  items[7].checked = true;

  // Geometria duchów — czystość i treść
  const checksumBefore = c.api.stableStringify(c.state.map) + '|' + Object.keys(c.state.roomById).length;
  c.api.ghosts = new Set([1, 3, 5, 6, 7, 9]);
  const geoms = c.api._deltaGhostGeoms(delta, items, [1, 3, 5, 6, 7, 9], c.api.overrides);
  const g1 = geoms.find(g => g.seq === 1), g3 = geoms.find(g => g.seq === 3);
  const g5 = geoms.find(g => g.seq === 5), g6 = geoms.find(g => g.seq === 6);
  ok(g1 && g1.kind === 'room' && g1.resolved === true && g1.x === a1.x && g1.y === a1.y,
    'duch ADD_ROOM: kind room, resolved, pozycja z override');
  ok(g3 && g3.kind === 'move' && g3.fromX === 0 && g3.fromY === 1 && g3.toX === 1 && g3.toY === 0,
    'duch MOVE_ROOM: from (żywe) → to (snap)');
  ok(g5 && g5.kind === 'exit' && g5.del === false && g5.x2 === a1.x && g5.y2 === a1.y,
    'duch ADD_EXIT: linia do pokoju kalki podąża za override');
  ok(g6 && g6.kind === 'del-room' && g6.x === 1 && g6.y === 0, 'duch DELETE_ROOM: del-room na żywej pozycji');
  ok(!geoms.find(g => g.seq === 7), 'duch: op niewykonalny → brak geometrii');
  ok(!geoms.find(g => g.seq === 9), 'duch: ADD_ROOM w obszarze kalki → brak geometrii (nie ma gdzie rysować)');
  c.api._deltaGhostGeoms(delta, items, [1, 3, 5, 6], c.api.overrides);
  c.api._deltaTakenCells(delta, items, 1);
  c.api._deltaFindFreeCell(1, 0, 0, 0, new Set());
  const checksumAfter = c.api.stableStringify(c.state.map) + '|' + Object.keys(c.state.roomById).length;
  ok(checksumBefore === checksumAfter, 'duchy: zero mutacji mapy (checksum przed == po)');

  // Reset stanu M3
  c.api.placing = { seq: 1 }; c.api.hover = { x: 1, y: 1, free: true };
  c.api._deltaGhostReset();
  ok(c.api.ghosts.size === 0 && c.api.overrides.size === 0 && c.api.placing === null && c.api.hover === null,
    '_deltaGhostReset: czyści duchy, overridey, placing, hover');
}
{
  // Apply z override: efektywne współrzędne do mapy, undo entry i deltaLog
  const c = makeDeltaCtx();
  const delta = collisionDelta();
  const items = c.api.classifyDelta(delta);
  const ov = new Map([[1, { x: 7, y: 7, how: 'auto' }]]);
  const res = c.api.applyDelta(delta, new Set([1]), ov);
  ok(res.applied === 1 && res.skipped.length === 0, 'apply+override: naniesiono 1, bez skipów');
  const added = c.state.areas.get(1).rooms.find(r => r.name === 'N1');
  ok(added && added.x === 7 && added.y === 7, 'apply+override: pokój na pozycji zastępczej (7,7)');
  const logEntry = c.state.deltaLog[c.state.deltaLog.length - 1];
  ok(logEntry.type === 'ADD_ROOM' && logEntry.roomData.x === 7 && logEntry.roomData.y === 7,
    'apply+override: deltaLog/undo entry niesie efektywne współrzędne (rebase wyeksportuje poprawione)');

  // Re-klasyfikacja z efektywnymi współrzędnymi → done (idempotencja)
  const patched = { meta: delta.meta, ops: c.api._deltaApplyOverridesToOps(delta.ops, ov) };
  const items2 = c.api.classifyDelta(patched);
  ok(items2[0].cls === 'done', 're-klasyfikacja po apply z override: op → done');

  // _deltaApplyOverridesToOps: patch ADD_ROOM + MOVE_ROOM, oryginał nietknięty
  const patchedOps = patched.ops;
  ok(patchedOps[0].payload.room.x === 7 && delta.ops[0].payload.room.x === 0, 'patch ops: kopia zmieniona, oryginał nie');
  const ovM = new Map([[3, { x: 4, y: 4, how: 'manual' }]]);
  const pm = c.api._deltaApplyOverridesToOps(delta.ops, ovM);
  ok(pm[2].payload.toX === 4 && pm[2].payload.toY === 4 && pm[4] === delta.ops[4],
    'patch ops: MOVE_ROOM toX/toY; opy bez override zachowują referencję');
}
{
  // MOVE_ROOM z override + re-walidacja fail-closed
  const c = makeDeltaCtx();
  const delta = collisionDelta();
  c.api.classifyDelta(delta);
  const res = c.api.applyDelta(delta, new Set([3]), new Map([[3, { x: 4, y: 4, how: 'manual' }]]));
  ok(res.applied === 1 && c.state.roomById[12].x === 4 && c.state.roomById[12].y === 4,
    'apply+override MOVE_ROOM: pokój na (4,4)');
  const le = c.state.deltaLog[c.state.deltaLog.length - 1];
  ok(le.type === 'MOVE_ROOM' && le.toX === 4 && le.toY === 4, 'apply+override MOVE_ROOM: entry z efektywnymi współrzędnymi');
}
{
  // Override unieważniony przed apply → skip, zero mutacji
  const c = makeDeltaCtx();
  const delta = collisionDelta();
  c.api.classifyDelta(delta);
  const nRooms = c.state.areas.get(1).rooms.length;
  const res = c.api.applyDelta(delta, new Set([1]), new Map([[1, { x: 1, y: 0, how: 'manual' }]]));  // (1,0) zajęte przez #11
  ok(res.applied === 0 && res.skipped.length === 1 && res.skipped[0].reason === 'pozycja zastępcza zajęta',
    'apply+override zajęte: skip z powodem, applied 0');
  ok(c.state.areas.get(1).rooms.length === nRooms, 'apply+override zajęte: mapa bez zmian');
}
{
  // Asercje strukturalne HTML — haki M3
  ok(HTML.includes('_drawDeltaGhosts(rs);') && HTML.includes('warstwa 7b'),
    'draw(): warstwa 7b duchów kalki');
  ok(HTML.includes("if (_deltaPlacing) {\n    state.dragX = e.clientX; state.dragY = e.clientY;"),
    'mousedown: przechwyt trybu stawiania przed pan/edit');
  ok(HTML.includes("if (_deltaPlacing) { _deltaUpdateHover(evX(e), evY(e)); return; }"),
    'mousemove: celownik hover');
  ok(HTML.includes("if (e.button === 0 && dx < 5 && dy < 5) _deltaPlaceAtScreen(evX(e), evY(e));"),
    'mouseup: klik = ustawienie pozycji zastępczej');
  ok(HTML.includes("if (_deltaPlacing) { _deltaCancelPlacing(); return; }\n  if (!state.map) return;"),
    'contextmenu: prawy = anuluj stawiania');
  ok(HTML.includes("if (_deltaPlacing) { _deltaCancelPlacing(); return; }\n    // (0) Modal otwarty"),
    'Escape: anulowanie trybu stawiania');
  ok(HTML.includes("_deltaGhostReset();  // ARKDELTA M3: nowa mapa"),
    'applyMap: reset stanu M3 przy nowej mapie');
  ok(HTML.includes('Autopozycja') && HTML.includes('Ręcznie')
    && HTML.includes("bShow.textContent = 'Pokaż'") && HTML.includes("bHide.textContent = 'Ukryj'")
    && HTML.includes('function _deltaShowReal(it) {') && HTML.includes('_deltaRealHl.set(it.seq, hl)'),
    'panel: przyciski Pokaż/Ukryj/Autopozycja/Ręcznie (W1: jednolite Pokaż, rozróżnia tooltip)');
  ok(HTML.includes('Duchy:') && HTML.includes('pozycja zastępcza'), 'panel: legenda kolorów duchów');
  // W1: karta zbiorcza — zawsze po kliku, odświeżanie po mutacjach, fallback-treść
  ok(HTML.includes("row.addEventListener('click', () => { _deltaJump(it); _deltaCardShow(it); });"),
    'W1 karta: klik wiersza = skok na mapie + karta szczegółów');
  ok(HTML.includes('let _deltaCardSeq = null;') && HTML.includes('function _deltaFallbackRows(it) {')
    && HTML.includes('if (!rows.length) rows.push(..._deltaFallbackRows(it));'),
    'W1 karta: tracking seq + wiersze zapasowe (karta zawsze ma treść)');
  ok(HTML.includes('const cur = R.items.find(i => i.seq === _deltaCardSeq);')
    && HTML.includes('if (cur) _deltaCardShow(cur); else _deltaCardHide();'),
    'W1 karta: odświeżanie w _renderDeltaPanel po mutacjach (brak starej karty)');
  ok(HTML.includes('const _DELTA_TYPE_PL = {') && HTML.includes("MOVE_ROOM: 'przesunięcie pokoju'")
    && HTML.includes("AUTO_FIX_SUPPRESSORS: 'automatyczna naprawa podwójnych linii'"),
    'W1 karta: typy opów po polsku (_DELTA_TYPE_PL)');
  ok(HTML.includes("const APP_VERSION = 'v1.50.2';"), 'wersja v1.50.2');
  ok(/r <= 25/.test(HTML), 'spirala: R_MAX = 25');
}

// ═══════════════════════════════════════════════════════════════════════════
// T10 (v1.9.0): M4 — dialog version-mismatch, re-klasyfikacja w applyMap, manual.
// ═══════════════════════════════════════════════════════════════════════════
console.log('— T10: M4 — version-mismatch, applyMap re-klasyfikacja, manual —');
{
  const c = makeDeltaCtx();
  c.state.baseInfo = c.api._computeBaseInfo();
  const crc = c.state.baseInfo.crc;
  ok(c.api._deltaBaseCheck({ crc }) === null, 'baseCheck: zgodne crc → null (prosto do panelu)');
  const m = c.api._deltaBaseCheck({ crc: 'ffffffff', version: '1.2.3', revision: 'abcdef0123456789' });
  ok(m && m.kind === 'mismatch' && m.baseVersion === '1.2.3' && m.baseRevision === 'abcdef0123456789'
    && m.baseCrc === 'ffffffff' && m.curCrc === crc, 'baseCheck: mismatch → kind + pola obu stron');
  ok(c.api._deltaBaseCheck(null).kind === 'nobase' && c.api._deltaBaseCheck({}).kind === 'nobase',
    'baseCheck: brak base / brak crc → nobase');
}
{
  // Struktura HTML — dialog i wiring M4
  ok(HTML.includes('id="dlg-arkdelta-mismatch"') && HTML.includes('Inna wersja mapy bazowej'),
    'markup: dialog version-mismatch');
  ok(HTML.includes('id="arkdelta-mismatch-ok">Kontynuuj recenzję') && HTML.includes('id="arkdelta-mismatch-cancel">Anuluj'),
    'markup: przyciski Kontynuuj / Anuluj');
  ok(HTML.includes("const chk = _deltaBaseCheck(res.delta.meta.base);")
    && HTML.indexOf('validateDeltaText(text)') < HTML.indexOf('const chk = _deltaBaseCheck')
    && HTML.indexOf('const chk = _deltaBaseCheck') < HTML.indexOf('_openDeltaMismatch(res.delta, chk)'),
    'wiring: validate → baseCheck → dialog (kolejność)');
  ok(HTML.includes("closeDialog('dlg-arkdelta-mismatch');\n    openDeltaReview(delta);"),
    'wiring: Kontynuuj → openDeltaReview');
  ok(HTML.includes("toast('Wczytywanie kalki anulowane')"), 'wiring: Anuluj → toast');
  ok(HTML.includes('// ARKDELTA M4: panel recenzji otwarty → re-klasyfikacja względem nowej mapy')
    && HTML.indexOf('_deltaGhostReset();  // ARKDELTA M3') < HTML.indexOf('// ARKDELTA M4: panel recenzji'),
    'applyMap: re-klasyfikacja otwartego panelu po resecie M3');
  ok(HTML.includes('href="docs/arkmap_manual.html"'), 'about: link do dokumentacji użytkownika');
  ok(HTML.includes("const APP_VERSION = 'v1.50.2';"), 'wersja v1.50.2 w HTML');
}
{
  // Manual: sekcja .arkdelta + spójność numeracji
  const MANUAL = fs.readFileSync(path.join(ROOT, 'docs', 'arkmap_manual.html'), 'utf8');
  ok(MANUAL.includes('<h2 id="arkdelta">21. Kalka zmian .arkdelta'), 'manual: sekcja 21 .arkdelta');
  ok((MANUAL.match(/arkdelta/g) || []).length >= 8, 'manual: kalka opisana (>= 8 wzmianek)');
  ok(MANUAL.includes('<li><a href="#arkdelta">Kalka zmian .arkdelta</a></li>'), 'manual: wpis w TOC');
  const nums = [...MANUAL.matchAll(/<h2 id="[^"]+">(\d+)\./g)].map(m => +m[1]);
  const ciagle = nums.length === 27 && nums.every((n, i) => n === i + 1);
  ok(ciagle, 'manual: numeracja sekcji ciągła 1–27 (27 sekcji)');
  ok(MANUAL.includes('<h3>.arkdelta (kalka zmian)</h3>'), 'manual: podsekcja w Formatach');
  ok(MANUAL.includes('Czy kalka .arkdelta zadziała na nowszej wersji mapy?')
    && MANUAL.includes('Co jeśli pole docelowe operacji z kalki jest zajęte?'), 'manual: 2 pytania FAQ');
  const SPEC = fs.readFileSync(path.join(ROOT, 'docs', 'arkdelta_spec.html'), 'utf8');
  ok(SPEC.includes('Position overrides (session-only)') && SPEC.includes('never enter the file format'),
    'spec: dopisek o sesyjnych override poza formatem');
}


// ═══════════════════════════════════════════════════════════════════════════
// T11 (v1.36.0): audyt Tier 1 — zbieznosc klasyfikatora z apply (W13/W14/W15/W16).
// ═══════════════════════════════════════════════════════════════════════════
console.log('— T11: audyt T1 — klasyfikator ≡ apply —');
{
  // W13: done-SID — zalezny op tlumaczy sie na zywe id przez seed z klasyfikacji
  const c = makeDeltaCtx();
  const { state, api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'ADD_AREA', target: { areaId: 'd:1' }, payload: { area: { id: 'd:1', name: 'Area Two' } }, label: 'a' },
    { seq: 2, type: 'ADD_ROOM', target: { roomId: 'd:2', areaId: 'd:1' }, payload: { room: { id: 'd:2', x: 7, y: 7, z: 0, name: 'Seedowy', env: 262 } }, label: 'r' },
  ] };
  const items = api.classifyDelta(delta);
  ok(items[0].cls === 'done' && items[1].cls === 'ok', 'W13: ADD_AREA done (nazwa), ADD_ROOM z sid-obszaru → ok');
  const only = new Set([2]);
  const resNoSeed = api.applyDelta(JSON.parse(JSON.stringify(delta)), only);
  ok(resNoSeed.applied === 0 && resNoSeed.skipped.length === 1, 'W13: bez seed zalezny op → skip (brak rozstrzygniecia)');
  const seed = new Map();
  for (const m of [items.sidRoomId, items.sidAreaId, items.sidLabelId]) if (m) for (const [k, v] of m) seed.set(k, v);
  ok(seed.get('d:1') === 2, 'W13: seed niesie rozstrzygniecie done d:1 → 2');
  const resSeed = api.applyDelta(delta, only, undefined, seed);
  ok(resSeed.applied === 1 && resSeed.skipped.length === 0, 'W13: z seed zalezny op → applied');
  const newRoom = Object.values(state.roomById).find(r => r.name === 'Seedowy');
  ok(!!newRoom && state.roomArea[newRoom.id] === 2, 'W13: pokój wszedł do żywego obszaru #2');
  const items2 = api.classifyDelta(delta);
  ok(items2[0].cls === 'done' && items2[1].cls === 'done', 'W13: re-klasyfikacja po apply → done/done (idempotentność)');
}
{
  // W15: DELETE_AREA obszaru domyslnego — klasyfikacja impossible, apply skip (nie sukces)
  const c = makeDeltaCtx();
  const { state, api } = c;
  const defArea = { id: -1, name: 'Default Area', rooms: [], labels: [] };
  state.map.areas.push(defArea); state.areas.set(-1, defArea);
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'DELETE_AREA', target: { areaId: -1 }, payload: {}, label: 'x' },
  ] };
  const items = api.classifyDelta(delta);
  ok(items[0].cls === 'impossible' && items[0].note.includes('obszar domyślny'), 'W15: klasyfikacja DELETE_AREA -1 → impossible (obszar domyślny)');
  const res = api.applyDelta(delta);
  ok(res.applied === 0 && res.skipped.length === 1 && res.skipped[0].reason.includes('obszar domyślny'),
    'W15: apply DELETE_AREA -1 → skip, zero mutacji');
  ok(!!state.areas.get(-1), 'W15: Default Area nadal istnieje po apply');
  const res2 = api.applyDelta({ meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'DELETE_AREA', target: { areaId: 2 }, payload: {}, label: 'x' } ] });
  ok(res2.applied === 1 && !state.areas.get(2), 'W15: DELETE_AREA zwykłego obszaru → applied (regresja guardu)');
}
{
  // W16: bidirectional ADD_EXIT — guard przeciwnego kierunku + symetria done
  const c = makeDeltaCtx();
  const { state, api } = c;
  const mkDelta = (ops) => ({ meta: { format: 'arkdelta', format_version: 2 }, ops });
  let items = api.classifyDelta(mkDelta([
    { seq: 1, type: 'ADD_EXIT', target: { sourceId: 12, dir: 'e' }, payload: { targetId: 11, bidirectional: true }, label: 'x' } ]));
  ok(items[0].cls === 'hard' && items[0].note.includes('kierunek przeciwny'), 'W16: bidirectional, przeciwny zajęty → hard (nie ok)');
  items = api.classifyDelta(mkDelta([
    { seq: 1, type: 'ADD_EXIT', target: { sourceId: 10, dir: 'e' }, payload: { targetId: 11, bidirectional: true }, label: 'x' } ]));
  ok(items[0].cls === 'done', 'W16: bidirectional, para kompletna → done');
  delete state.roomById[11].exits.w;
  items = api.classifyDelta(mkDelta([
    { seq: 1, type: 'ADD_EXIT', target: { sourceId: 10, dir: 'e' }, payload: { targetId: 11, bidirectional: true }, label: 'x' } ]));
  ok(items[0].cls === 'hard' && items[0].note.includes('tylko w jedną stronę'), 'W16: jednostronne + bidirectional → hard (nie done)');
}
{
  // W14: PAINT_BATCH / AUTO_FIX_SUPPRESSORS z sid z tej samej kalki → nie impossible
  const c = makeDeltaCtx();
  const { api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: { id: 'd:1', x: 6, y: 6, z: 0, name: 'Malowany', env: 258 } }, label: 'r' },
    { seq: 2, type: 'PAINT_BATCH', target: {}, payload: { changes: [{ roomId: 'd:1', beforeEnv: 258, afterEnv: 262, afterSymbol: '*' }] }, label: 'p' },
    { seq: 3, type: 'AUTO_FIX_SUPPRESSORS', target: {}, payload: { added: [{ roomId: 'd:1', dir: 'e', cl: { points: [], color: [255, 0, 0] } }], removed: [] }, label: 's' },
  ] };
  const items = api.classifyDelta(delta);
  ok(items[0].cls === 'ok', 'W14: ADD_ROOM → ok');
  ok(items[1].cls === 'ok', 'W14: PAINT_BATCH na sid z tej kalki → ok (przed fixem: impossible)');
  ok(items[2].cls === 'ok', 'W14: AUTO_FIX na sid z tej kalki → ok (przed fixem: impossible)');
}
{
  // Asercje strukturalne T1
  ok(HTML.includes('function applyDelta(delta, onlySeq, overrides, seedSids) {'), 'T1: sygnatura applyDelta z seedSids');
  ok(HTML.includes('const res = applyDelta(R.delta, only, _deltaOverrides, seedSids);'), 'T1: _deltaApplyReviewed przekazuje seed');
  ok(HTML.includes("if (op.target.areaId <= 0) { skip('obszar domyślny"), 'T1: applyDelta guard DELETE_AREA <= 0');
  ok(HTML.includes("if (aid <= 0) { items.push(_deltaClsItem(op, 'impossible', 'obszar domyślny"), 'T1: klasyfikator guard DELETE_AREA <= 0');
  ok(HTML.includes('kierunek przeciwny u pokoju docelowego jest zajęty'), 'T1: klasyfikator ADD_EXIT guard przeciwnego kierunku');
  ok(HTML.includes('return false;  // audyt T1/W15'), 'T1: commitDeleteArea jawny zwrot false');
  ok(HTML.includes("const APP_VERSION = 'v1.50.2';"), 'wersja v1.50.2');
}


console.log('— T12: audyt T3 — baseInfo widzi etykiety/kolory (suma v4), baseCheck, reszta kalki —');
{
  const c = makeDeltaCtx();
  const bi1 = c.api._computeBaseInfo();
  ok(bi1 && typeof bi1.crc === 'string' && bi1.crc.length === 16, 'baseInfo: crc v4 obecne (16 hex)');
  const a1 = c.state.map.areas[0];
  const labels0 = a1.labels;
  const colors0 = c.state.map.colors.custom_env_colors;
  a1.labels = [{ id: 1, x: 0, y: 0, z: 0, text: 'L' }];
  const bi2 = c.api._computeBaseInfo();
  ok(bi2.crc !== bi1.crc, 'baseInfo crc: dodanie etykiety zmienia tozsamosc bazy (W3)');
  a1.labels[0].text = 'ZMIANA';
  ok(c.api._computeBaseInfo().crc !== bi2.crc, 'baseInfo crc: mutacja etykiety zmienia tozsamosc (W3)');
  a1.labels = labels0;
  c.state.map.colors.custom_env_colors = { 262: [1, 2, 3] };
  ok(c.api._computeBaseInfo().crc !== bi1.crc, 'baseInfo crc: kolory env zmieniaja tozsamosc (W3)');
  c.state.map.colors.custom_env_colors = colors0;
  ok(c.api._computeBaseInfo().crc === bi1.crc, 'baseInfo crc: powrot do stanu = powrot crc (determinizm)');
  c.state.baseInfo = bi1;
  ok(c.api._deltaBaseCheck({ crc: bi1.crc }) === null, '_deltaBaseCheck: zgodne crc → null (bez dialogu)');
  const mm = c.api._deltaBaseCheck({ crc: 'deadbeef' });
  ok(mm && mm.kind === 'mismatch', '_deltaBaseCheck: obce crc → mismatch (dialog)');
  ok(c.api._arkdeltaBaseNote({ crc: bi1.crc }).includes('pasuje'), '_arkdeltaBaseNote: „Kalka pasuje" dla zgodnej bazy');
  ok(c.api._arkdeltaBaseNote({}).includes('bez informacji'), '_arkdeltaBaseNote: kalka bez base → uczciwy komunikat');
}


// ═══════════════════════════════════════════════════════════════════════════
// T13 (Arc 11 WS4): seedSids — stany brzegowe.
// ═══════════════════════════════════════════════════════════════════════════
console.log('— T13: seedSids — pusta mapa, luki, pusty seed, egzekucja > seed —');
{
  // S1: pusta mapa bazowa — wszystko rozstrzygane wewnatrz delty, zero seed
  const c = makeDeltaCtx();
  const { state, api } = c;
  state.map.areas = []; state.areas.clear(); state.roomById = {}; state.roomArea = {};
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'ADD_AREA', target: { areaId: 'd:1' }, payload: { area: { id: 'd:1', name: 'Pusta' } }, label: 'a' },
    { seq: 2, type: 'ADD_ROOM', target: { roomId: 'd:2', areaId: 'd:1' }, payload: { room: { id: 'd:2', x: 0, y: 0, z: 0, name: 'E13A', env: 262 } }, label: 'r' },
    { seq: 3, type: 'ADD_ROOM', target: { roomId: 'd:3', areaId: 'd:1' }, payload: { room: { id: 'd:3', x: 1, y: 0, z: 0, name: 'E13B', env: 262 } }, label: 'r' },
    { seq: 4, type: 'ADD_EXIT', target: { sourceId: 'd:2', dir: 'e' }, payload: { targetId: 'd:3', bidirectional: true }, label: 'x' },
  ] };
  const res = api.applyDelta(delta);
  ok(res.applied === 4 && res.skipped.length === 0,
    'S1: pusta mapa — 4 opy naniesione bez seed [applied=' + res.applied + ' skipped=' + res.skipped.length + ']');
  const ra = Object.values(state.roomById).find(r => r.name === 'E13A');
  const rb = Object.values(state.roomById).find(r => r.name === 'E13B');
  const ar = [...state.areas.values()].find(a => a.name === 'Pusta');
  ok(!!ra && !!rb && !!ar, 'S1: obszar i oba pokoje istnieja po apply');
  ok(ra && rb && ra.exits && ra.exits.e === rb.id && rb.exits && rb.exits.w === ra.id,
    'S1: exit bidi miedzy swiezymi pokojami (sid -> sid wewnatrz delty)');
  ok(ar && ra && ar.rooms.some(r => r.id === ra.id) && state.roomArea[ra.id] === ar.id,
    'S1: spojnosc area.rooms i roomArea dla swiezych id');
}
{
  // S2: seed wskazuje LUKE (zywe id nie istnieje) — kontrolowany skip, zero mutacji
  const c = makeDeltaCtx();
  const { state, api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'ADD_EXIT', target: { sourceId: 10, dir: 's' }, payload: { targetId: 'd:9' }, label: 'x' },
  ] };
  const res = api.applyDelta(delta, undefined, undefined, new Map([['d:9', 777]]));
  ok(res.applied === 0 && res.skipped.length === 1 && res.skipped[0].reason.includes('nie istnieje'),
    'S2: seed -> luka (777) => kontrolowany skip [reason=' + (res.skipped[0] && res.skipped[0].reason) + ']');
  ok(!state.roomById[10].exits || state.roomById[10].exits.s === undefined, 'S2: zero mutacji pokoju zrodlowego');
}
{
  // S3: seed NIE nadpisuje sid definiowanego przez sama delte (egzekucja wygrywa)
  const c = makeDeltaCtx();
  const { state, api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: { id: 'd:1', x: 9, y: 9, z: 0, name: 'E13Fresh', env: 262 } }, label: 'r' },
    { seq: 2, type: 'EDIT_ROOM', target: { roomId: 'd:1' }, payload: { before: {}, after: { id: 'd:1', x: 9, y: 9, z: 0, name: 'E13Renamed', env: 262 } }, label: 'e' },
  ] };
  const res = api.applyDelta(delta, undefined, undefined, new Map([['d:1', 11]]));
  ok(res.applied === 2 && res.skipped.length === 0, 'S3: oba opy naniesione [applied=' + res.applied + ']');
  ok(state.roomById[11].name === 'R11', 'S3: pokoj z seeda (11) nietkniety — seed nie wygrywa z egzekucja');
  const fresh = Object.values(state.roomById).find(r => r.x === 9 && r.y === 9);
  ok(!!fresh && fresh.id !== 11 && fresh.name === 'E13Renamed',
    'S3: EDIT_ROOM trafil w SWIEZY pokoj (nie w 11) [freshId=' + (fresh && fresh.id) + ']');
}
{
  // S4: pusty seed (new Map()) zachowuje sie jak brak seed
  const mk = () => ({ meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'ADD_AREA', target: { areaId: 'd:1' }, payload: { area: { id: 'd:1', name: 'Area Two' } }, label: 'a' },
    { seq: 2, type: 'ADD_ROOM', target: { roomId: 'd:2', areaId: 'd:1' }, payload: { room: { id: 'd:2', x: 7, y: 7, z: 0, name: 'Dep', env: 262 } }, label: 'r' },
  ] });
  const only = new Set([2]);
  const r1 = makeDeltaCtx().api.applyDelta(mk(), only);
  const r2 = makeDeltaCtx().api.applyDelta(mk(), only, undefined, new Map());
  ok(r1.applied === 0 && r1.skipped.length === 1 && r2.applied === 0 && r2.skipped.length === 1
    && r1.skipped[0].reason === r2.skipped[0].reason,
    'S4: pusty seed === brak seed (identyczny skip zaleznego opu)');
}
{
  // S5: osierocony sid w TARGET (nie payload) — defensywny skip
  const c = makeDeltaCtx();
  const { api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'EDIT_ROOM', target: { roomId: 'd:7' }, payload: { before: {}, after: { id: 'd:7' } }, label: 'e' },
  ] };
  const res = api.applyDelta(delta);
  ok(res.applied === 0 && res.skipped.length === 1 && res.skipped[0].reason.includes('d:7'),
    'S5: sid w target bez definicji i bez seed => skip [reason=' + (res.skipped[0] && res.skipped[0].reason) + ']');
}

console.log('— A3.4 (DI-4): glebokie meta kalki — kontrolowane ok:false, nie RangeError —');
{
  // Guard glebokosci byl tylko na ops, a meta tez wchodzi do stableStringify
  // w _deltaChecksums — glebokie meta wywalaloby RangeError poza walidatorem
  // (kontrakt: validateDeltaText nigdy nie rzuca).
  const c = makeDeltaCtx();
  const meta = { format: 'arkdelta', format_version: 2, ops_count: 0 };
  let cur = meta; for (let i = 0; i < 200; i++) { cur.n = {}; cur = cur.n; }  // limit skanera: 60
  const checksums = c.api._deltaChecksums(meta, []);
  const text = JSON.stringify({ meta, ops: [], checksums });
  let res = null, threw = null;
  try { res = c.api.validateDeltaText(text); } catch (e) { threw = e; }
  ok(threw === null && res && res.ok === false && /głęboko/.test((res.errors || []).join(' ')),
    'A3.4 (DI-4): meta 200 gleboko (checksumy zgodne!) -> ok:false „zbyt gleboko", bez throw (pre-fix: meta szla prosto do stableStringify)');
}

console.log('— A3.6 (DI-9): konflikty kalki — normalizacja kaskad, korpus 763 opow na mapie rzeczywistej —');
{
  const FIX = path.join(ROOT, 'map_master3.dat');
  if (!fs.existsSync(FIX)) {
    console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
    process.exit(2);
  }
  const KALKA = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'kalka_korpus_di9.arkdelta'), 'utf8'));
  const DATBUF = fs.readFileSync(FIX);

  // Pelna skladanka: warstwa formatu (.dat) + rdzen kalki + prawdziwe commity
  // (kaskady _simDeleteRoom/deleteRoom — to one wyksztalcily 729 falszywych konfliktow).
  const fullCode =
    blockSlice('// ── constants.js ──', '// ── validate.js ──') + '\n' +
    blockSlice('// ── validate.js ──', '// ── checksum.js ──') + '\n' +
    blockSlice('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
    blockSlice('// ── mudlet_dat.js ──', '// ── dat-to-arkmap.js ──') + '\n' +
    blockSlice('// ── dat-to-arkmap.js ──', '// ── arkmap-to-dat.js ──') + '\n' +
    extract(HTML, 'function stableStringify(val, indent, _lvl) {') + '\n' +
    extract(HTML, 'function _canonicalizeMapForSave(map) {') + '\n' +
    extract(HTML, 'function _canonicalCloneForSave() {') + '\n' +
    extract(HTML, 'function _serializeMapForSave() {') + '\n' +
    blockSlice("const ARKDELTA_FORMAT = 'arkdelta';", 'function _deltaGhostReset() {') + '\n' +
    extract(HTML, 'const OPPOSITE = {') + '\n' +
    extract(HTML, 'function pushUndo(entry) {') + '\n' +
    extract(HTML, 'function commitMoveRoom(room, fromX, fromY, fromZ, toX, toY, toZ, label) {') + '\n' +
    extract(HTML, 'function commitAddExit(sourceId, dir, targetId, bidirectional, customLabel) {') + '\n' +
    extract(HTML, 'function commitDeleteExit(room, dir, label) {') + '\n' +
    extract(HTML, 'function deleteRoom(roomId, label) {') + '\n' +
    extract(HTML, 'function _replaceRoomData(room, snapshot) {') + '\n' +
    extract(HTML, 'function _dispatchRedo(entry) {') + '\n' +
    extract(HTML, 'function commitDeleteArea(areaId, label) {') + '\n' +
    'function _rasterInvalidate() {}\n' +  // DI-1: epilog applyDelta moze go wolac; tu bez licznika
    '\n;return { datToArkmap, stableStringify, _canonicalizeMapForSave, validateDeltaText, classifyDelta, applyDelta, _computeV4Checksums, _deltaChecksums };';
  const fullFactory = new Function(
    'state', 'toast', 'scheduleDraw', 'updateUndoRedoUI', '_syncEditSnapshot',
    'buildAreaList', 'buildRoomsZ', 'draw', 'plPl', 'document', 'closeAreaPanel', fullCode);
  const mkState = (map) => {
    const st = { map, roomById: {}, roomArea: {}, areas: new Map(),
      undoStack: [], redoStack: [], deltaLog: [], dirty: false, editMode: true,
      selected: null, areaId: (map.areas[0] && map.areas[0].id) ?? -1, z: 0,
      pendingStubs: new Set(), pendingStubRemovals: new Set() };
    for (const area of map.areas || []) {
      st.areas.set(area.id, area);
      for (const r of (area.rooms || [])) { st.roomById[r.id] = r; st.roomArea[r.id] = area.id; }
    }
    return st;
  };
  const docStub = { getElementById: () => null };
  const mkApi = (st) => fullFactory(st, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    (n, one) => n + ' ' + one, docStub, () => {});
  const baseMap = mkApi(mkState({ areas: [] }))
    .datToArkmap(DATBUF.buffer.slice(DATBUF.byteOffset, DATBUF.byteOffset + DATBUF.byteLength));
  // Kalka korpusowa zbudowana ze stanu wczytanego z .arkmap (forma kanoniczna zapisu).
  // Surowy wynik datToArkmap rozni sie polami pokoi (v4 checksum to normalizuje,
  // _deltaRoomCmp nie) — kanonikalizacja odtwarza baze kalki 1:1 (zweryfikowane
  // pokoj-per-pokoj: 0 roznic na 26988).
  mkApi(mkState({ areas: [] }))._canonicalizeMapForSave(baseMap);
  const nOps = KALKA.ops.length;
  ok(nOps === 763, 'A3.6 (DI-9): fixture kalki korpusowej = 763 opy (jest ' + nOps + ')');
  const histOf = (cls) => {
    const h = {};
    for (const it of (cls.items || cls)) { const k = it.cls || '?'; h[k] = (h[k] || 0) + 1; }
    return h;
  };

  // A3.6a: czysta baza -> zero konfliktow (pre-fix: 729 falszywych — konflikt liczony
  // wobec EWOLUUJACEGO cienia; kaskady usuniec zmienialy pokoje przed ich opami).
  {
    const st = mkState(JSON.parse(JSON.stringify(baseMap)));
    const h = histOf(mkApi(st).classifyDelta(KALKA));
    ok((h.hard || 0) === 0 && (h.ok || 0) === nOps,
      'A3.6a (DI-9): korpus 763 opow -> 0 konfliktow hard (pre-fix: 729 falszywych „pokoj zmienil sie na mapie")');
  }

  // A3.6b: jeden pokoj zmieniony „upstream" -> dokladnie 1 konflikt (wykrywalnosc zachowana).
  {
    const delAreaOp = KALKA.ops.find(o => o.type === 'DELETE_AREA');
    const delAreaId = delAreaOp && delAreaOp.target.areaId;
    const cnt = new Map();
    for (const o of KALKA.ops) {
      if ((o.type === 'DELETE_ROOM' || o.type === 'EDIT_ROOM') && typeof o.target.roomId === 'number')
        cnt.set(o.target.roomId, (cnt.get(o.target.roomId) || 0) + 1);
    }
    const st = mkState(JSON.parse(JSON.stringify(baseMap)));
    let pick = null;
    for (const [rid, n] of [...cnt.entries()].sort((a, b) => a[0] - b[0])) {
      if (n === 1 && st.roomById[rid] && st.roomArea[rid] !== delAreaId) { pick = rid; break; }
    }
    ok(pick !== null, 'A3.6b (DI-9): fixture ma pokoj z dokladnie 1 opem poza kasowanym obszarem (wybrano ' + pick + ')');
    st.roomById[pick].name = 'ZMIENIONE UPSTREAM';
    const h = histOf(mkApi(st).classifyDelta(KALKA));
    ok((h.hard || 0) === 1 && (h.ok || 0) === nOps - 1,
      'A3.6b (DI-9): 1 pokoj zmieniony upstream -> dokladnie 1 konflikt hard (jest ' + (h.hard || 0) + ')');
  }

  // A3.6c (regresja): pelny apply + checksum v4 wyniku (wartosc z korpusu, mapa po-zmianach).
  {
    const st = mkState(JSON.parse(JSON.stringify(baseMap)));
    const api = mkApi(st);
    let res = null, err = null;
    try { res = api.applyDelta(KALKA); } catch (e) { err = e; }
    ok(!err && res && res.applied === nOps && (res.skipped || []).length === 0,
      'A3.6c (DI-9): pelny apply ' + nOps + '/' + nOps + ', skipped=0' + (err ? ' :: ' + err.message : ''));
    const cs = api._computeV4Checksums(st.map);
    ok(cs.file === '9477365f08eecc7c',
      'A3.6c (DI-9): checksum v4 pliku po apply = 9477365f08eecc7c (jest ' + cs.file + ')');
  }

  // A3.6d: lancuch ADD_ROOM(sid) -> EDIT_ROOM(sid) — baseline nie zna pokoi kalki,
  // fallback na ewoluujacy cien musi dac klasyfikacje ok (bez falszywego konfliktu).
  {
    const c = makeDeltaCtx();
    const ops = [
      { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 },
        payload: { room: { x: 9, y: 9, z: 0, name: 'Nowy', env: 1 } } },
      { seq: 2, type: 'EDIT_ROOM', target: { roomId: 'd:1' },
        payload: { before: { x: 9, y: 9, z: 0, name: 'Nowy', env: 1, area: 1 },
                   after:  { x: 9, y: 9, z: 0, name: 'Nowy2', env: 1, area: 1 } } },
    ];
    const meta = { format: 'arkdelta', format_version: 2, ops_count: ops.length };
    const delta = { meta, ops, checksums: c.api._deltaChecksums(meta, ops) };
    const h = histOf(c.api.classifyDelta(delta));
    ok((h.hard || 0) === 0 && (h.impossible || 0) === 0 && (h.ok || 0) === 2,
      'A3.6d (DI-9): ADD_ROOM(sid)->EDIT_ROOM(sid) -> ok, bez falszywego konfliktu (fallback na cien)');
  }

  // A3.6e (statyczny): mechanizm DI-9 — konflikty przez _deltaRoomCmpKalka
  // (normalizacja kaskad wlasnej kalki), kaskada cienia = lustro deleteRoom.
  {
    const srcCls = extract(HTML, 'function classifyDelta(delta) {');
    ok(/_deltaRoomCmpKalka\(room, P\.room, _delSet\)/.test(srcCls) && /_deltaRoomCmpKalka\(room, P\.before, _delSet\)/.test(srcCls),
      'A3.6e (DI-9): DELETE_ROOM i EDIT_ROOM licza konflikt przez _deltaRoomCmpKalka z _delSet');
    ok(/DELETE_ROOM'\) \{ const id = resR/.test(srcCls) && /DELETE_AREA'\) \{/.test(srcCls) && srcCls.includes('_delSet.add'),
      'A3.6e (DI-9): _delSet z DELETE_ROOM + pokoi z DELETE_AREA');
    const srcSim = extract(HTML, 'function _deltaBuildShadow(sidDone) {');
    for (const f of ['exit_weights', 'exit_locks', 'doors', 'custom_lines', 'special_exit_locks']) {
      ok(srcSim.includes('o.' + f), 'A3.6e (DI-9): kaskada cienia czysci ' + f + ' (lustro deleteRoom)');
    }
    ok(!/withBaseline|_baseline/.test(HTML),
      'A3.6e (DI-9): zero pozostalosci po wariancie baseline (regresja kalki sekwencyjnych, E1)');
  }

  // A3.6f: kalka SEKWENCYJNA — before = stan POSREDNI (po prawdziwej kaskadzie).
  // Wariant baseline flagowal taka kalke hard (regresja E1.roundtrip);
  // surowy cien z niekompletna kaskada tez (zostawial doors/exit_weights).
  {
    const c = makeDeltaCtx();
    c.state.roomById[10].doors = { e: 2 };  // drzwi na wyjsciu e->11 (kasowane kaskadowo razem z wyjsciem)
    const snap11 = JSON.parse(JSON.stringify(c.state.roomById[11]));
    const ops = [
      { seq: 1, type: 'DELETE_ROOM', target: { roomId: 11 }, payload: { room: snap11 } },
      // before: pokoj 10 po PRAWDZIWEJ kaskadzie (bez exits e->11, bez doors e)
      { seq: 2, type: 'EDIT_ROOM', target: { roomId: 10 },
        payload: { before: { id: 10, x: 0, y: 0, z: 0, name: 'R10', env: 258 },
                   after:  { id: 10, x: 0, y: 0, z: 0, name: 'R10x', env: 258 } } },
    ];
    const meta = { format: 'arkdelta', format_version: 2, ops_count: ops.length };
    const delta = { meta, ops, checksums: c.api._deltaChecksums(meta, ops) };
    const h = histOf(c.api.classifyDelta(delta));
    ok((h.hard || 0) === 0 && (h.ok || 0) === 2,
      'A3.6f (DI-9): kalka sekwencyjna (before = stan posredni po kaskadzie, z doors) -> ok, bez hard (regresja E1)');
  }
}

console.log('— A3.8 (N3): roomId wymagane w PAINT_BATCH.changes i AUTO_FIX added/removed —');
{
  const mkKalka = (c, ops) => {
    const meta = { format: 'arkdelta', format_version: 2, ops_count: ops.length };
    return JSON.stringify({ meta, ops, checksums: c.api._deltaChecksums(meta, ops) });
  };
  // PAINT_BATCH: element bez roomId (pre-fix: przechodzil walidacje, cicho pomijany przy apply)
  {
    const c = makeDeltaCtx();
    const r = c.api.validateDeltaText(mkKalka(c, [
      { seq: 1, type: 'PAINT_BATCH', target: {}, payload: { changes: [{ afterEnv: 5, afterSymbol: '' }] } },
    ]));
    ok(r.ok === false && /lista zmian/.test((r.errors || []).join(' ')),
      'A3.8 (N3): PAINT_BATCH changes bez roomId -> walidator odrzuca (pre-fix: przepuszcza)');
  }
  // AUTO_FIX: added/removed bez roomId
  {
    const c = makeDeltaCtx();
    const r = c.api.validateDeltaText(mkKalka(c, [
      { seq: 1, type: 'AUTO_FIX_SUPPRESSORS', target: {}, payload: { added: [{ dir: 'e', snapshot: {} }], removed: [] } },
    ]));
    ok(r.ok === false && /dodane wpisy/.test((r.errors || []).join(' ')),
      'A3.8 (N3): AUTO_FIX added bez roomId -> walidator odrzuca (pre-fix: przepuszcza)');
    const c2 = makeDeltaCtx();
    const r2 = c2.api.validateDeltaText(mkKalka(c2, [
      { seq: 1, type: 'AUTO_FIX_SUPPRESSORS', target: {}, payload: { added: [], removed: [{ dir: 'e', snapshot: {} }] } },
    ]));
    ok(r2.ok === false && /usunięte wpisy/.test((r2.errors || []).join(' ')),
      'A3.8 (N3): AUTO_FIX removed bez roomId -> walidator odrzuca (pre-fix: przepuszcza)');
  }
  // Regresja: poprawne wpisy (z roomId, takze sid) przechodza
  {
    const c = makeDeltaCtx();
    const r = c.api.validateDeltaText(mkKalka(c, [
      { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 },
        payload: { room: { x: 9, y: 9, z: 0, name: 'N', env: 1 } } },
      { seq: 2, type: 'PAINT_BATCH', target: {}, payload: { changes: [{ roomId: 10, afterEnv: 5, afterSymbol: '' }, { roomId: 'd:1', afterEnv: 6 }] } },
      { seq: 3, type: 'AUTO_FIX_SUPPRESSORS', target: {}, payload: { added: [{ roomId: 10, dir: 'e', snapshot: {} }], removed: [{ roomId: 11, dir: 'w', snapshot: {} }] } },
    ]));
    ok(r.ok === true, 'A3.8 (N3): PAINT_BATCH/AUTO_FIX z roomId (numer + sid) nadal przechodza (regresja)'
      + (r.ok ? '' : ' :: ' + (r.errors || [])[0]));
  }
  // Regresja korpus: kalka korpusowa (763 opy) nadal waliduje sie OK
  {
    const FIX = path.join(ROOT, 'map_master3.dat');
    if (!fs.existsSync(FIX)) {
      console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
      process.exit(2);
    }
    const KALKA = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'kalka_korpus_di9.arkdelta'), 'utf8'));
    const c = makeDeltaCtx();
    const r = c.api.validateDeltaText(JSON.stringify(KALKA));
    ok(r.ok === true, 'A3.8 (N3): kalka korpusowa 763 opy nadal przechodzi walidacje (regresja zaostrzenia)');
  }
}

// ═══ A3.11 (N1): tautologiczny effect-check w MOVE_ROOM_TO_AREA usuniety ═══
console.log('— A3.11 (N1): cleanup effect-checku —');
{
  ok(!HTML.includes('efekt nieutrwalony'),
    'A3.11 (N1): martwy effect-check usuniety z applyDelta (pre-fix: skip(\'efekt nieutrwalony\') po tautologii)');
  // Regresja: MOVE_ROOM_TO_AREA nadal aplikuje sie data-only (pokoj realnie w nowym obszarze)
  const c = makeDeltaCtx();
  const { state, api } = c;
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'MOVE_ROOM_TO_AREA', target: { roomId: 10 }, payload: { toAreaId: 2 }, label: '' } ] };
  const res = api.applyDelta(delta);
  ok(res.applied === 1 && state.roomArea[10] === 2
    && state.areas.get(2).rooms.some(r => r.id === 10)
    && !state.areas.get(1).rooms.some(r => r.id === 10),
    'A3.11 (N1): MOVE_ROOM_TO_AREA nadal applied — pokoj realnie przeniesiony (regresja)');
}

// ═══ A3.12 (N2): MOVE_ROOM bez toZ — guard zajetosci liczony na z pokoju ═══
console.log('— A3.12 (N2): shRoomAt z fallbackiem z pokoju —');
{
  const c = makeDeltaCtx();
  const { state, api } = c;
  state.roomById[10].z = 5; state.roomById[11].z = 5;  // oba pokoje na z=5; 11 stoi na (1,0,5)
  // Op BEZ toZ w payloadzie (obejscie walidatora — _DELTA_SCHEMA wymusza toZ, tu celowo bez)
  const delta = { meta: { format: 'arkdelta', format_version: 2 }, ops: [
    { seq: 1, type: 'MOVE_ROOM', target: { roomId: 10 },
      payload: { fromX: 0, fromY: 0, fromZ: 5, toX: 1, toY: 0 }, label: '' } ] };
  const items = api.classifyDelta(delta);
  ok(items[0].cls === 'hard' && /zajęte/.test(items[0].note || ''),
    'A3.12 (N2): classify MOVE_ROOM bez toZ -> hard, pole (1,0,5) zajete przez #11 (pre-fix: z=undefined->0 -> ok)');
  const res = api.applyDelta(delta);
  ok(res.applied === 0 && state.roomById[10].x === 0 && state.roomById[10].z === 5,
    'A3.12 (N2): applyDelta — pokoj NIE przesuniety na zajeta komorke, brak crashu (regresja guarda na zywo)');
  ok((HTML.match(/shRoomAt\([^)]*P\.toZ \?\? \(/g) || []).length === 2,
    'A3.12 (N2): oba guardy shRoomAt (sim + classify) z fallbackiem P.toZ ?? (z pokoju) — krotnosc 2');
}

console.log('');
console.log('delta: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
