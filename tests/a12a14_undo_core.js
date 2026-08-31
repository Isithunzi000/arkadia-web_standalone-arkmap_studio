// Harness A12+A14 (krok 14) — commitAddExit guard przed nadpisaniem + prevExit w entry;
// undo ADD_ROOM bez destrukcyjnego czyszczenia wyjść
// Snapshot różnicowy: 9dcc7e1b7395e2c3918c4950519e8c9170f2563e (stan sprzed fixów A12/A14). Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const OLD = execSync('git show 9dcc7e1b7395e2c3918c4950519e8c9170f2563e:arkmap_studio.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

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
for (const a of ['function _dispatchUndo(entry) {', 'function commitAddExit(sourceId, dir, targetId, bidirectional, customLabel) {']) {
  if (NEW.indexOf(a) !== NEW.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}

const codeNew = [
  extract(NEW, 'function _replaceRoomData(room, snapshot) {'),
  extract(NEW, 'function _dispatchUndo(entry) {'),
  extract(NEW, 'function _dispatchRedo(entry) {'),
  extract(NEW, 'function commitAddExit(sourceId, dir, targetId, bidirectional, customLabel) {'),
].join('\n');
const codeOld = [
  extract(OLD, 'function _replaceRoomData(room, snapshot) {'),
  extract(OLD, 'function _dispatchUndo(entry) {'),
].join('\n');

function makeCtx(code) {
  const state = {
    roomById: {}, roomArea: {}, areas: new Map(),
    selected: null, z: 0, editMode: false,
    undoStack: [], redoStack: [], dirty: false,
    map: { areas: [] },
  };
  const toasts = [];
  const OPPOSITE = { n:'s', s:'n', e:'w', w:'e', ne:'sw', sw:'ne', nw:'se', se:'nw', up:'down', down:'up', in:'out', out:'in' };
  const stubDoc = { getElementById: () => null };
  const fn = new Function(
    'state', 'OPPOSITE', 'toast', 'draw', 'scheduleDraw', 'pushUndo', 'updateUndoRedoUI', '_syncEditSnapshot',
    'populateEditForm', 'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'wpRecalcPaths', 'wpRebuildList', 'document',
    code + '\n;return { commitAddExit: (typeof commitAddExit!=="undefined")?commitAddExit:undefined, _dispatchUndo, _dispatchRedo: (typeof _dispatchRedo!=="undefined")?_dispatchRedo:undefined };'
  );
  const api = fn(
    state, OPPOSITE,
    (msg, isErr) => toasts.push({ msg, isErr }),
    () => {}, () => {},
    (entry) => { state.undoStack.push(entry); state.dirty = true; },
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    stubDoc
  );
  return { state, toasts, api };
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }
const J = JSON.stringify;
function mkRoom(id, area, extra) { return Object.assign({ id, area, x: 0, y: 0, z: 0, name: '', env: 258, weight: 1 }, extra || {}); }
function addRoomToState(state, room) {
  state.roomById[room.id] = room; state.roomArea[room.id] = room.area;
  if (!state.areas.has(room.area)) state.areas.set(room.area, { id: room.area, name: 'A' + room.area, rooms: [] });
  state.areas.get(room.area).rooms.push(room);
}

console.log('── T1: guard źródła — zajęty kierunek → odmowa, zero mutacji, zero undo ──');
{
  const { state, toasts, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1, { exits: { n: 2 }, exit_weights: { n: 5 }, doors: { n: 2 } }));
  addRoomToState(state, mkRoom(3, 1));
  const before = J(state.roomById[1]);
  api.commitAddExit(1, 'n', 3, false);
  ok(J(state.roomById[1]) === before, 'pokój źródłowy bez zmian (waga/drzwi nienaruszone)');
  ok(state.undoStack.length === 0, 'brak wpisu undo');
  ok(toasts.length === 1 && toasts[0].isErr, 'toast ostrzegawczy: ' + (toasts[0] && toasts[0].msg));
}

console.log('── T2: guard powrotny — bidi, tgt.exits[opp] zajęte → odmowa atomowa ──');
{
  const { state, toasts, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1));
  addRoomToState(state, mkRoom(2, 1, { exits: { s: 9 } }));
  const b1 = J(state.roomById[1]), b2 = J(state.roomById[2]);
  api.commitAddExit(1, 'n', 2, true);
  ok(J(state.roomById[1]) === b1, 'źródło bez zmian (atomowość — nic nie dodano)');
  ok(J(state.roomById[2]) === b2, 'cel bez zmian');
  ok(state.undoStack.length === 0, 'brak wpisu undo');
  ok(toasts.length === 1 && toasts[0].isErr, 'toast ostrzegawczy');
}

console.log('── T3: happy path jednokierunkowy + ścisła odwrotność (deep-equal) ──');
{
  const { state, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1));
  addRoomToState(state, mkRoom(2, 1));
  const initial = J(state.roomById[1]);
  api.commitAddExit(1, 'n', 2, false);
  ok(state.roomById[1].exits.n === 2, 'wyjście dodane');
  const e = state.undoStack[state.undoStack.length - 1];
  ok(e.prevExit === undefined && e.prevOppExit === undefined && 'prevExit' in e && 'prevOppExit' in e, 'entry zawiera prevExit/prevOppExit');
  state.undoStack.pop();
  api._dispatchUndo(e);
  ok(J(state.roomById[1]) === initial, 'po undo deep-equal stanu początkowego (brak pustego exits:{})');
}

console.log('── T4: happy path bidi + ścisła odwrotność obu pokoi ──');
{
  const { state, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1));
  addRoomToState(state, mkRoom(2, 1));
  const i1 = J(state.roomById[1]), i2 = J(state.roomById[2]);
  api.commitAddExit(1, 'ne', 2, true);
  ok(state.roomById[1].exits.ne === 2 && state.roomById[2].exits.sw === 1, 'oba wyjścia dodane');
  const e = state.undoStack.pop();
  api._dispatchUndo(e);
  ok(J(state.roomById[1]) === i1 && J(state.roomById[2]) === i2, 'po undo oba pokoje deep-equal');
}

console.log('── T5: dispatcher z ręcznie złożonym entry (prevExit zdefiniowane) → undo przywraca ──');
{
  const { state, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1, { exits: { n: 7 } }));
  addRoomToState(state, mkRoom(2, 1, { exits: { s: 8 } }));
  state.roomById[1].exits.n = 2;
  state.roomById[2].exits.s = 1;
  api._dispatchUndo({ type: 'ADD_EXIT', sourceId: 1, dir: 'n', targetId: 2, bidirectional: true, opp: 's', prevExit: 7, prevOppExit: 8 });
  ok(state.roomById[1].exits.n === 7, 'przywrócone prevExit=7');
  ok(state.roomById[2].exits.s === 8, 'przywrócone prevOppExit=8');
}

console.log('── T6: A14 latentny scenariusz — wyjście „z boku stosu" → NOWY zachowuje, STARY kasuje ──');
{
  function scenario(code) {
    const ctx = makeCtx(code);
    const { state, api } = ctx;
    addRoomToState(state, mkRoom(1, 1));
    const newRoom = mkRoom(2, 1);
    const entry = { type: 'ADD_ROOM', roomId: 2, roomData: JSON.parse(J(newRoom)), areaId: 1 };
    addRoomToState(state, newRoom);
    state.roomById[1].exits = { e: 2 };
    state.roomById[1].special_exits = { 'idz do jaskini': 2 };
    api._dispatchUndo(entry);
    return ctx;
  }
  const sNew = scenario(codeNew);
  const sOld = scenario(codeOld);
  ok(sNew.state.roomById[2] === undefined && !sNew.state.areas.get(1).rooms.some(r => r.id === 2), 'NOWY: pokój usunięty');
  ok(sNew.state.roomById[1].exits && sNew.state.roomById[1].exits.e === 2, 'NOWY: wyjście zachowane (dangling, wykrywalne walidatorem)');
  ok(sNew.state.roomById[1].special_exits && sNew.state.roomById[1].special_exits['idz do jaskini'] === 2, 'NOWY: wyjście specjalne zachowane');
  ok(sOld.state.roomById[1].exits.e === undefined && sOld.state.roomById[1].special_exits['idz do jaskini'] === undefined, 'STARY: kasował oba (potwierdzenie zmiany zachowania)');
}

console.log('── T7: normalny LIFO — add room → commitAddExit do niego → undo ×2 → deep-equal ──');
{
  const { state, api } = makeCtx(codeNew);
  addRoomToState(state, mkRoom(1, 1));
  const initial = J({ rooms: state.roomById, areas: [...state.areas.entries()] });
  const newRoom = mkRoom(2, 1);
  const addRoomEntry = { type: 'ADD_ROOM', roomId: 2, roomData: JSON.parse(J(newRoom)), areaId: 1 };
  addRoomToState(state, newRoom);
  state.undoStack.push(addRoomEntry);
  api.commitAddExit(1, 'e', 2, false);
  ok(state.roomById[1].exits.e === 2, 'wyjście do nowego pokoju dodane');
  api._dispatchUndo(state.undoStack.pop());
  api._dispatchUndo(state.undoStack.pop());
  ok(J({ rooms: state.roomById, areas: [...state.areas.entries()] }) === initial, 'po undo ×2 deep-equal stanu początkowego');
}

console.log('── T8: liczniki kotwic ──');
{
  const cnt = (s, sub) => s.split(sub).length - 1;
  ok(cnt(NEW, 'audyt A12') === 3, 'komentarze audyt A12 ×3, jest: ' + cnt(NEW, 'audyt A12'));
  ok(cnt(NEW, 'audyt A14') === 1, 'komentarz audyt A14 ×1');
  ok(cnt(NEW, 'prevExit') === 4, 'prevExit ×4, jest: ' + cnt(NEW, 'prevExit'));
  ok(cnt(NEW, 'Clean reverse exits from other rooms pointing to this room') === 0, 'stara pętla czyszcząca usunięta');
  ok(cnt(OLD, 'Clean reverse exits from other rooms pointing to this room') === 1, 'snapshot 9dcc7e1b7395e2c3918c4950519e8c9170f2563e miał starą pętlę');
}

console.log(`\n═══ WYNIK: ${pass} OK / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
