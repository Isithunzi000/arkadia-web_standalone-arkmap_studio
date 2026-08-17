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
    'state', '_dispatchUndo', '_dispatchRedo', 'updateUndoRedoUI', 'draw', 'toast', 'plPl', 'document',
    code
  );
  const api = fn(
    state,
    (e) => undid.push(e), (e) => redid.push(e),
    () => {}, () => {},
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
  const capLines = HTML.split('\n').filter(l => l.includes('undoStack.shift()'));
  ok(capLines.length === 31 && capLines.every(l => !l.includes('deltaLog')),
    'cap 50 (31 miejsc inline: 30 edycyjnych + _deltaPush) nigdy nie dotyka deltaLog');
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
  extract(HTML, 'function _arkdeltaBaseNote(base) {') + '\n' +
  '\n;return { pushUndo, _computeBaseInfo, _deltaStripRoom, buildDelta, validateDeltaText, applyDelta, classifyDelta, _arkdeltaBaseNote, crc32str, stableStringify, addChecksums };';

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
    'state', '_dispatchUndo', 'updateUndoRedoUI', 'draw', 'toast', 'plPl', 'document',
    'download', 'escHtml', 'APP_VERSION',
    'deleteRoom', 'commitDeleteArea', 'commitMoveRoomToArea', 'commitAddExit', 'commitMoveRoom', 'commitDeleteExit',
    'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'refreshLabelList', 'populateEditForm', 'selectArea',
    deltaCode
  );
  api = fn(state, () => {}, () => {}, () => {}, (m) => toasts.push(m), (n, one) => n + ' ' + one,
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
  ok(d.meta.format === 'arkdelta' && d.meta.format_version === 1, 'meta: format + format_version');
  ok(d.meta.ops_count === d.ops.length && d.ops.length === 10, 'meta.ops_count == liczba opów');
  ok(d.meta.base && d.meta.base.crc === c1.state.baseInfo.crc && d.meta.base.version === '9.9.9',
    'meta.base: crc + version z baseInfo');
  ok(d.meta.app_version === 'v1.6.0-test', 'meta.app_version z APP_VERSION');
  ok(d.checksums.file === c1.api.crc32str(c1.api.stableStringify({ meta: d.meta, ops: d.ops })),
    'checksums.file zgodne z zawartością (meta+ops)');
  ok(Array.isArray(d.checksums.ops) && d.checksums.ops.length === d.ops.length
    && d.checksums.ops.every((c, i) => c === c1.api.crc32str(c1.api.stableStringify(d.ops[i]))),
    'checksums.ops: per-op CRC zgodne');
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
    delta.checksums = {
      file: api.crc32str(api.stableStringify({ meta: delta.meta, ops: delta.ops })),
      ops: delta.ops.map(op => api.crc32str(api.stableStringify(op))),
    };
    return api.stableStringify(delta);
  };
  const refuse = (text, frag, name) => {
    const r = api.validateDeltaText(text);
    ok(r.ok === false && r.errors.some(e => e.includes(frag)), name + (r.ok ? ' — PRZESZŁO!' : (r.errors.some(e => e.includes(frag)) ? '' : ' — komunikat: ' + r.errors[0])));
  };
  refuse('', 'Pusty plik', 'odmowa: pusty plik');
  refuse('{nie-json', 'JSON', 'odmowa: niepoprawny JSON');
  refuse('{}', 'nie jest plik .arkdelta', 'odmowa: JSON bez meta.format');
  { const d = JSON.parse(validText); d.meta.format = 'arkmap';
    refuse(api.stableStringify(d), 'nie jest plik .arkdelta', 'odmowa: zły znacznik formatu'); }
  { const d = JSON.parse(validText); d.meta.format_version = 99;
    refuse(api.stableStringify(d), 'Nieznana wersja formatu', 'odmowa: nieznana wersja formatu'); }
  { const d = JSON.parse(validText); d.ops[1].payload.room.name = 'SZKODA';
    refuse(api.stableStringify(d), 'uszkodzony', 'odmowa: CRC zbiorczy po ingerencji w treść'); }
  { const d = JSON.parse(validText); d.ops[1].payload.room.name = 'SZKODA';
    const r = api.validateDeltaText(api.stableStringify(d));
    ok(r.ok === false && r.errors[0].includes('#2'), 'lokalizacja per-op CRC: wskazany op #2'); }
  { const d = JSON.parse(validText); d.ops[1].seq = 999;
    refuse(reseal(d), 'seq nieciągłe', 'odmowa: seq nieciągłe'); }
  { const d = JSON.parse(validText); d.ops[0].type = 'FOO_BAR';
    refuse(reseal(d), 'nieznany typ', 'odmowa: nieznany typ operacji'); }
  { const d = JSON.parse(validText); d.ops[3].target.dir = 'northeast';
    refuse(reseal(d), 'nieprawidłowy kierunek', 'odmowa: kierunek spoza VALID_DIRS'); }
  { const d = JSON.parse(validText); delete d.ops[1].payload.room;
    refuse(reseal(d), 'brak payload.room', 'odmowa: brak wymaganego pola payload'); }
  { const d = JSON.parse(validText); d.ops[5].target.roomId = 'd:99';
    refuse(reseal(d), 'nieistniejącego obiektu kalki', 'odmowa: sid bez definicji'); }
  { const d = JSON.parse(validText); d.ops[2].target.roomId = 'd:2'; d.ops[2].payload.room.id = 'd:2';
    refuse(reseal(d), 'zduplikowany', 'odmowa: zduplikowany sid'); }
  { const d = JSON.parse(validText);
    d.ops[0].payload = JSON.parse('{"__proto__":{},"area":' + JSON.stringify(d.ops[0].payload.area) + '}');
    refuse(reseal(d), 'niedozwolony klucz', 'odmowa: klucz __proto__'); }
  { const d = JSON.parse(validText); d.meta.ops_count = 999;
    refuse(reseal(d), 'ops_count', 'odmowa: ops_count nie zgadza się z listą'); }
  refuse('x'.repeat(8 * 1024 * 1024 + 1), 'za duży', 'odmowa: plik ponad limit 8 MB');
  { const d = { meta: { format: 'arkdelta', format_version: 1, ops_count: 5001, base: {} },
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
  const delta = { meta: { format: 'arkdelta', format_version: 1 }, ops: [
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
  ok(api._arkdeltaBaseNote(null) === 'Kalka bez informacji o bazie.', 'baseNote: brak bazy');
  ok(api._arkdeltaBaseNote({ crc: bi1.crc, version: '9.9.9' }).includes('Baza zgodna'), 'baseNote: baza zgodna');
  ok(api._arkdeltaBaseNote({ crc: 'deadbeef', version: '1.0.0' }).includes('innej wersji'), 'baseNote: baza niezgodna');
}
ok(HTML.includes('<input type="file" id="fi-arkdelta" accept=".arkdelta">'), 'markup: fi-arkdelta');
ok(HTML.includes('id="btn-load-arkdelta"'), 'markup: btn-load-arkdelta pod przyciskami zapisu');
ok(HTML.includes('id="btn-save-arkdelta" class="etb-check" disabled'), 'markup: btn-save-arkdelta pod walidacją (disabled)');
ok(HTML.includes('id="dlg-arkdelta"') && HTML.includes('id="arkdelta-body"'), 'markup: dialog dlg-arkdelta (błędy walidacji)');
ok(HTML.includes('state.baseInfo = _computeBaseInfo();'), 'integracja: baseInfo liczone w wrapperze applyMap');
ok(HTML.includes('_arkdeltaUpdateSaveBtn();'), 'integracja: hook przycisku zapisu w updateUndoRedoUI');
ok(HTML.includes("btnLoadArkdelta.addEventListener('click'") && HTML.includes("fiArkdelta.addEventListener('change'")
  && HTML.includes("btnSaveArkdelta.addEventListener('click', saveDelta)"), 'integracja: listenery wczytaj/zapisz');
ok(HTML.includes("const APP_VERSION = 'v1.7.0';"), 'wersja: v1.7.0');

console.log('— T8: classifyDelta + recenzja (M2) —');
{
  const c = makeDeltaCtx();
  const { state, api } = c;
  const op = (seq, type, target, payload) => ({ seq, type, target, payload, label: 'op ' + seq });
  const delta = { meta: { format: 'arkdelta', format_version: 1 }, ops: [
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
  ] };
  const items = api.classifyDelta(delta);
  const cls = (seq) => items.find(i => i.seq === seq).cls;
  const note = (seq) => items.find(i => i.seq === seq).note;
  ok(items.length === 23, 'classify: wszystkie opy sklasyfikowane');
  ok(cls(1) === 'ok', 'classify ADD_ROOM: wolne pole → ok');
  ok(cls(2) === 'hard' && note(2).includes('kolizja'), 'classify ADD_ROOM: pole zajęte (inna nazwa) → hard/kolizja');
  ok(cls(3) === 'done' && note(3).includes('#11'), 'classify ADD_ROOM: to samo pole i nazwa → done (add-matching)');
  ok(cls(4) === 'impossible' && note(4).includes('obszar nie istnieje'), 'classify ADD_ROOM: obszar nie istnieje → impossible');
  ok(cls(5) === 'ok', 'classify DELETE_ROOM: zgodny snapshot → ok');
  ok(cls(6) === 'impossible', 'classify DELETE_ROOM: pokój usunięty upstream → impossible');
  ok(cls(7) === 'ok', 'classify EDIT_ROOM: before zgodne → ok');
  ok(cls(8) === 'done', 'classify EDIT_ROOM: live == after → done (już naniesione)');
  ok(cls(9) === 'hard', 'classify EDIT_ROOM: live != before → hard (zmieniony upstream)');
  ok(cls(10) === 'ok', 'classify ADD_EXIT: wolny kierunek → ok');
  ok(cls(11) === 'done', 'classify ADD_EXIT: istnieje do tego samego celu → done');
  ok(cls(12) === 'hard' && note(12).includes('guard'), 'classify ADD_EXIT: kierunek zajęty innym → hard (guard odmówi)');
  ok(cls(13) === 'impossible', 'classify ADD_EXIT: pokój nie istnieje → impossible');
  ok(cls(14) === 'ok', 'classify ADD_AREA: nowa nazwa → ok');
  ok(cls(15) === 'done' && note(15).includes('#2'), 'classify ADD_AREA: nazwa istnieje → done');
  ok(cls(16) === 'impossible', 'classify DELETE_AREA: obszar nie istnieje → impossible');
  ok(cls(17) === 'ok', 'classify MOVE_ROOM: wolne pole → ok');
  ok(cls(18) === 'done', 'classify MOVE_ROOM: już na miejscu → done');
  ok(cls(19) === 'hard' && note(19).includes('kolizja'), 'classify MOVE_ROOM: pole zajęte → hard');
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
  const delta = { meta: { format: 'arkdelta', format_version: 1 }, ops: [
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
  const delta = { meta: { format: 'arkdelta', format_version: 1 }, ops: [
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

console.log('');
console.log('delta: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
