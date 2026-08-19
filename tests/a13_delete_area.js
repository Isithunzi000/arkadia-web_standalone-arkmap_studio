// Harness A13 (krok 15) — commit DELETE_AREA czyści puste kontenery jak redo + removedEmptyContainers w undo
// Snapshot różnicowy: 45aee0f (stan sprzed fixa A13). Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const OLD = execSync('git show 45aee0f:arkmap_studio.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

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
for (const a of ['function commitDeleteArea(areaId, label) {', 'function _dispatchUndo(entry) {', 'function _dispatchRedo(entry) {']) {
  if (NEW.indexOf(a) !== NEW.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}

const codeNew = [
  extract(NEW, 'function _replaceRoomData(room, snapshot) {'),
  extract(NEW, 'function _dispatchUndo(entry) {'),
  extract(NEW, 'function _dispatchRedo(entry) {'),
  extract(NEW, 'function commitDeleteArea(areaId, label) {'),
].join('\n');
const codeOld = [
  extract(OLD, 'function _replaceRoomData(room, snapshot) {'),
  extract(OLD, 'function _dispatchUndo(entry) {'),
  extract(OLD, 'function _dispatchRedo(entry) {'),
  extract(OLD, 'function commitDeleteArea(areaId) {'),
].join('\n');

// Kanoniczny stringify: sortuje klucze obiektów rekurencyjnie (kolejność kluczy po restore może się różnić)
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function snapState(state) {
  // Kolejność obszarów po undo (push na koniec) — istniejące zachowanie poza scope'm A13 → porównujemy zbiory
  return canon({
    rooms: state.roomById,
    areas: [...state.areas.entries()].sort((a, b) => a[0] - b[0]),
    mapAreas: [...state.map.areas].map(a => a).sort((a, b) => a.id - b.id),
    roomArea: state.roomArea,
  });
}

function makeCtx(code) {
  const state = {
    roomById: {}, roomArea: {}, areas: new Map(),
    selected: null, z: 0, editMode: true, editDirty: false, editSnapshot: null,
    undoStack: [], redoStack: [], dirty: false,
    map: { areas: [] }, areaId: 1,
    _lastCleanedCrossExits: null, _lastRemovedEmptyContainers: null, _lastWpCleared2: null,
  };
  const toasts = [];
  const stubDoc = { getElementById: () => null };
  const fn = new Function(
    'state', 'toast', 'draw', 'pushUndo', 'updateUndoRedoUI',
    'populateEditForm', 'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'wpRecalcPaths', 'wpRebuildList',
    'selectArea', 'closeAreaPanel', 'document',
    code + '\n;return { commitDeleteArea, _dispatchUndo, _dispatchRedo };'
  );
  const api = fn(
    state,
    (msg, isErr) => toasts.push({ msg, isErr }),
    () => {},
    (entry) => { state.undoStack.push(entry); state._entryCopy = entry; state.dirty = true; },
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    () => {}, () => {},
    stubDoc
  );
  return { state, toasts, api };
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }
const J = JSON.stringify;
function mkRoom(id, area, extra) { return Object.assign({ id, area, x: 0, y: 0, z: 0, name: 'R' + id, env: 258, weight: 1 }, extra || {}); }
function addRoomToState(state, room) {
  state.roomById[room.id] = room; state.roomArea[room.id] = room.area;
  if (!state.areas.has(room.area)) {
    const a = { id: room.area, name: 'A' + room.area, rooms: [] };
    state.areas.set(room.area, a); state.map.areas.push(a);
  }
  state.areas.get(room.area).rooms.push(room);
}

console.log('── T1: 7 uprzednio pustych kontenerów → commit nagrywa, undo przywraca ──');
{
  const { state, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1));
  addRoomToState(state, mkRoom(2, 2, {
    exits: {}, special_exits: {}, custom_lines: {}, doors: {}, exit_weights: {},
    exit_locks: [], special_exit_locks: [],
  }));
  const initial = snapState(state);
  api.commitDeleteArea(1);
  const r2 = state.roomById[2];
  ok(r2.exits === undefined && r2.special_exits === undefined && r2.custom_lines === undefined &&
     r2.doors === undefined && r2.exit_weights === undefined &&
     r2.exit_locks === undefined && r2.special_exit_locks === undefined, 'commit: wszystkie 7 pustych kontenerów skasowane');
  const e = state.undoStack[state.undoStack.length - 1];
  ok(Array.isArray(e.removedEmptyContainers) && e.removedEmptyContainers.length === 7, 'entry.removedEmptyContainers = 7 rekordów, jest: ' + (e.removedEmptyContainers || []).length);
  api._dispatchUndo(state.undoStack.pop());
  ok(snapState(state) === initial, 'undo: deep-equal stanu początkowego (kontenery puste odtworzone)');
  const r2b = state.roomById[2];
  ok(Array.isArray(r2b.exit_locks) && Array.isArray(r2b.special_exit_locks) && !Array.isArray(r2b.custom_lines), 'typy kontenerów: locki = tablice, reszta = obiekty');
}

console.log('── T2: pełny cykl commit→undo→redo→undo z wyjściem cross-area + metadanymi + pustym kontenerem ──');
{
  const { state, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1));
  addRoomToState(state, mkRoom(5, 2, {
    exits: { n: 1, e: 9 },
    custom_lines: { n: { points: [{ x: 1, y: 2 }], color: 'red' } },
    doors: { n: 2 }, exit_weights: { n: 3 }, exit_locks: ['n'],
    special_exits: { 'wskocz': 1 }, special_exit_locks: ['wskocz'],
    user_data: {},
  }));
  addRoomToState(state, mkRoom(9, 2));
  const initial = snapState(state);
  api.commitDeleteArea(1);
  const afterCommit = snapState(state);
  ok(state.roomById[1] === undefined, 'commit: pokój obszaru usunięty');
  ok(state.roomById[5].exits.n === undefined && state.roomById[5].exits.e === 9, 'commit: wyjście do obszaru skasowane, inne zachowane');
  ok(state.roomById[5].custom_lines === undefined, 'commit: custom_lines opróżnione → skasowane');
  api._dispatchUndo(state.undoStack.pop());
  ok(snapState(state) === initial, 'undo: deep-equal oryginału');
  const entry = JSON.parse(J(state._entryCopy));
  api._dispatchRedo(entry);
  ok(snapState(state) === afterCommit, 'redo: deep-equal stanu po commicie (commit ≡ redo)');
  api._dispatchUndo(entry);
  ok(snapState(state) === initial, 'drugie undo: deep-equal oryginału (idempotencja cykli)');
}

console.log('── T3: różnicowy stary/nowy — stary undo zostawia undefined, nowy odtwarza ──');
{
  function scenario(code) {
    const { state, api } = makeCtx(code);
    addRoomToState(state, mkRoom(1, 1));
    addRoomToState(state, mkRoom(2, 2, { custom_lines: {}, special_exits: {}, exit_locks: [] }));
    api.commitDeleteArea(1);
    return { state, api, entry: state._entryCopy };
  }
  const sNew = scenario(codeNew);
  const sOld = scenario(codeOld);
  ok(sNew.state.roomById[2].custom_lines === undefined && sOld.state.roomById[2].custom_lines !== undefined,
     'commit: NOWY kasuje puste custom_lines (jak redo), STARY zostawiał');
  sNew.api._dispatchUndo(sNew.state.undoStack.pop());
  sOld.api._dispatchUndo(sOld.state.undoStack.pop());
  ok(sNew.state.roomById[2].custom_lines !== undefined && sNew.state.roomById[2].exit_locks !== undefined, 'NOWY undo: puste kontenery odtworzone');
  ok(sOld.state.roomById[2].custom_lines !== undefined && sOld.state.roomById[2].exit_locks !== undefined, 'STARY undo: puste kontenery przeżyły commit, więc są (asymetria commit/redo)');
  const oldRedoEntry = { type: 'DELETE_AREA', areaId: 1, removedRoomIds: [1], snapshot: sOld.entry.snapshot, cleanedExits: sOld.entry.cleanedExits };
  sOld.api._dispatchRedo(oldRedoEntry);
  ok(sOld.state.roomById[2].custom_lines === undefined, 'STARY redo: puste custom_lines skasowane bez zapisu (źródło A13)');
  sOld.api._dispatchUndo(oldRedoEntry);
  ok(sOld.state.roomById[2].custom_lines === undefined, 'STARY undo po redo: custom_lines utracone na stałe (A13)');
}

console.log('── T4: entry legacy bez removedEmptyContainers → undo bez crasha ──');
{
  const { state, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1));
  addRoomToState(state, mkRoom(2, 2));
  const snapshot = JSON.parse(J(state.areas.get(1)));
  state.areas.delete(1); state.map.areas = state.map.areas.filter(a => a.id !== 1);
  delete state.roomById[1]; delete state.roomArea[1];
  let crashed = false;
  try {
    api._dispatchUndo({ type: 'DELETE_AREA', areaId: 1, removedRoomIds: [1], snapshot, cleanedExits: [] });
  } catch (e) { crashed = true; }
  ok(!crashed, 'brak wyjątku');
  ok(state.roomById[1] !== undefined && state.areas.has(1), 'obszar i pokój przywrócone');
}

console.log('── T5: liczniki kotwic ──');
{
  const cnt = (s, sub) => s.split(sub).length - 1;
  console.log('  [info] audyt A13: ' + cnt(NEW, 'audyt A13') + ', removedEmptyContainers: ' + cnt(NEW, 'removedEmptyContainers'));
  ok(cnt(NEW, 'removedEmptyContainers') >= 6, 'removedEmptyContainers obecne w doFn+entry+undo');
  ok(/const APP_VERSION = 'v1\.\d+\.\d+';/.test(NEW), 'APP_VERSION obecne');
  ok(cnt(NEW, 'if (r.exits && !Object.keys(r.exits).length) delete r.exits;') === 0, 'stare kasowanie exits bez nagrania usunięte z doFn');
  ok(cnt(NEW, 'if (r.special_exits && !Object.keys(r.special_exits).length) delete r.special_exits;') === 0, 'stare kasowanie special_exits bez nagrania usunięte z doFn');
  ok(cnt(OLD, 'removedEmptyContainers') === 0, 'snapshot 45aee0f nie miał removedEmptyContainers');
}

console.log('── T6: smoke regresji dispatcherów (scenariusze A12/A14 na tym samym ekstrakcie) ──');
{
  const { state, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1));
  const initial = snapState(state);
  const newRoom = mkRoom(2, 1);
  const addRoomEntry = { type: 'ADD_ROOM', roomId: 2, roomData: JSON.parse(J(newRoom)), areaId: 1 };
  addRoomToState(state, newRoom);
  state.undoStack.push(addRoomEntry);
  state.roomById[1].exits = { e: 2 };
  api._dispatchUndo(state.undoStack.pop());
  ok(state.roomById[1].exits.e === 2 && state.roomById[2] === undefined, 'A14: undo ADD_ROOM zachowuje wyjścia');
  delete state.roomById[1].exits;
  ok(snapState(state) === initial, 'stan wrócił do początkowego');
  state.roomById[1].exits = { n: 2 };
  api._dispatchUndo({ type: 'ADD_EXIT', sourceId: 1, dir: 'n', targetId: 2, bidirectional: false, opp: 's', prevExit: undefined, prevOppExit: undefined });
  ok(state.roomById[1].exits === undefined, 'A12: undo ADD_EXIT sprząta pusty kontener');
  ok(snapState(state) === initial, 'deep-equal po smoke');
}

console.log(`\n═══ WYNIK: ${pass} OK / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
