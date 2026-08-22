// Harness Tier 2 (v1.37.0) — utrata danych UX: dirty-guard K2/K3, rename SE Q4, selectedRoom W10,
// undo ADD_AREA W11, DELETE_AREA na samym Default Area W12.
// Wzorzec extract/makeCtx jak a13_delete_area.js. Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

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
for (const a of ['function commitDeleteArea(areaId, label) {', 'function _dispatchUndo(entry) {',
                 'function _dispatchRedo(entry) {', 'function commitAddArea(name) {',
                 'function commitMoveRoomToArea(roomId, targetAreaId, label) {',
                 'function fitRouteToView() {']) {
  if (NEW.indexOf(a) !== NEW.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}

const code = [
  extract(NEW, 'function _replaceRoomData(room, snapshot) {'),
  extract(NEW, 'function _dispatchUndo(entry) {'),
  extract(NEW, 'function _dispatchRedo(entry) {'),
  extract(NEW, 'function commitDeleteArea(areaId, label) {'),
  extract(NEW, 'function commitAddArea(name) {'),
  extract(NEW, 'function commitMoveRoomToArea(roomId, targetAreaId, label) {'),
].join('\n');

function makeCtx() {
  const state = {
    roomById: {}, roomArea: {}, areas: new Map(),
    selected: null, z: 0, editMode: true, editDirty: false, editSnapshot: null,
    undoStack: [], redoStack: [], dirty: false,
    map: { areas: [] }, areaId: 1,
    _lastCleanedCrossExits: null, _lastRemovedEmptyContainers: null, _lastWpCleared2: null,
  };
  const calls = [];   // nagrywanie: ['selectArea', id, fit] / ['jumpToRoom', id] / ['showDirtyConfirm', fn]
  const toasts = [];
  const stubDoc = { getElementById: () => null };
  const fn = new Function(
    'state', 'toast', 'draw', 'pushUndo', 'updateUndoRedoUI',
    'populateEditForm', 'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'wpRecalcPaths', 'wpRebuildList',
    'selectArea', 'closeAreaPanel', 'document', 'jumpToRoom', 'showDirtyConfirm',
    code + '\n;return { commitDeleteArea, commitAddArea, commitMoveRoomToArea, _dispatchUndo, _dispatchRedo };'
  );
  const api = fn(
    state,
    (msg, isErr) => toasts.push({ msg, isErr }),
    () => {},
    (entry) => { state.undoStack.push(entry); state.dirty = true; },
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    (id, fit) => calls.push(['selectArea', id, fit]),
    () => {},
    stubDoc,
    (id) => calls.push(['jumpToRoom', id]),
    (cont) => calls.push(['showDirtyConfirm', cont])
  );
  return { state, calls, toasts, api };
}
function mkRoom(id, area, extra) { return Object.assign({ id, area, x: 0, y: 0, z: 0, name: 'R' + id, env: 258, weight: 1 }, extra || {}); }
function addRoomToState(state, room) {
  state.roomById[room.id] = room; state.roomArea[room.id] = room.area;
  if (!state.areas.has(room.area)) {
    const a = { id: room.area, name: 'A' + room.area, rooms: [] };
    state.areas.set(room.area, a); state.map.areas.push(a);
  }
  state.areas.get(room.area).rooms.push(room);
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

console.log('── T1 (W12): DELETE_AREA gdy zostaje sam Default Area (id 0) — commit i redo nawigują ──');
{
  const { state, calls, api } = makeCtx();
  addRoomToState(state, mkRoom(0, 0));        // Default Area id 0 z pokojem 0
  addRoomToState(state, mkRoom(7, 5));        // obszar-ofiara 5
  state.areas.get(0).name = 'Default Area';
  state.areaId = 5;
  api.commitDeleteArea(5);
  const nav = calls.filter(c => c[0] === 'selectArea');
  ok(nav.length === 1 && nav[0][1] === 0, 'commit: selectArea(0) mimo falsy id — nagrane: ' + JSON.stringify(nav));
  ok(!state.areas.has(5), 'commit: obszar 5 usuniety');
}
{
  const { state, calls, api } = makeCtx();
  addRoomToState(state, mkRoom(0, 0));
  addRoomToState(state, mkRoom(7, 5));
  state.areaId = 5;
  const entry = { type: 'DELETE_AREA', areaId: 5, removedRoomIds: [7], snapshot: JSON.parse(JSON.stringify(state.areas.get(5))),
    cleanedExits: [], removedEmptyContainers: [], wpCleared: [] };
  api._dispatchRedo(entry);
  const nav = calls.filter(c => c[0] === 'selectArea');
  ok(nav.length === 1 && nav[0][1] === 0, 'redo: selectArea(0) mimo falsy id — nagrane: ' + JSON.stringify(nav));
}

console.log('── T2 (W11): undo ADD_AREA naprawia wiszący areaId (prevAreaId), redo nie szarpie ──');
{
  const { state, calls, api } = makeCtx();
  addRoomToState(state, mkRoom(0, 0));
  addRoomToState(state, mkRoom(1, 3));
  state.areaId = 3;
  api.commitAddArea('T2 Area');
  const e = state.undoStack[state.undoStack.length - 1];
  ok(e.type === 'ADD_AREA' && e.prevAreaId === 3, 'commit: wpis niesie prevAreaId=3, jest: ' + e.prevAreaId);
  const newId = e.areaId;
  const navCommit = calls.filter(c => c[0] === 'selectArea');
  ok(navCommit.length === 1 && navCommit[0][1] === newId, 'commit: nawigacja do nowego obszaru #' + newId);
  state.areaId = newId;                        // symulacja: prawdziwy selectArea by to ustawil
  calls.length = 0;
  api._dispatchUndo(state.undoStack.pop());
  const navUndo = calls.filter(c => c[0] === 'selectArea');
  ok(navUndo.length === 1 && navUndo[0][1] === 3, 'undo: powrot do prevAreaId=3 — nagrane: ' + JSON.stringify(navUndo));
  ok(!state.areas.has(newId), 'undo: obszar usuniety');
}
{
  // wpis z kalki (bez prevAreaId, bez nawigacji w commicie) + wiszacy areaId → fallback pierwszy klucz
  const { state, calls, api } = makeCtx();
  addRoomToState(state, mkRoom(0, 0));
  addRoomToState(state, mkRoom(1, 2));
  state.areas.set(9, { id: 9, name: 'Z kalki', rooms: [] });
  state.areaId = 9;
  api._dispatchUndo({ type: 'ADD_AREA', areaId: 9, areaData: { id: 9, name: 'Z kalki', rooms: [] } });
  const nav = calls.filter(c => c[0] === 'selectArea');
  ok(nav.length === 1 && nav[0][1] === 0, 'undo bez prevAreaId: fallback pierwszy klucz (0) — nagrane: ' + JSON.stringify(nav));
}
{
  // areaId NIEwiszący → undo nie nawiguje; redo przy poprawnym areaId nie szarpie
  const { state, calls, api } = makeCtx();
  addRoomToState(state, mkRoom(0, 0));
  addRoomToState(state, mkRoom(1, 2));
  state.areas.set(9, { id: 9, name: 'X', rooms: [] });
  state.areaId = 2;
  api._dispatchUndo({ type: 'ADD_AREA', areaId: 9, prevAreaId: 2, areaData: { id: 9, name: 'X', rooms: [] } });
  ok(calls.filter(c => c[0] === 'selectArea').length === 0, 'undo: areaId poprawny (2) → zero nawigacji');
  state.areas.set(9, { id: 9, name: 'X', rooms: [] });   // symulacja stanu sprzed redo
  api._dispatchRedo({ type: 'ADD_AREA', areaId: 9, prevAreaId: 2, areaData: { id: 9, name: 'X', rooms: [] } });
  ok(calls.filter(c => c[0] === 'selectArea').length === 0, 'redo: areaId poprawny → bez szarpania widokiem');
  state.areaId = 77;                                     // wiszacy (obszar 77 nie istnieje)
  api._dispatchRedo({ type: 'ADD_AREA', areaId: 9, prevAreaId: 2, areaData: { id: 9, name: 'X', rooms: [] } });
  const nav = calls.filter(c => c[0] === 'selectArea');
  ok(nav.length === 1 && nav[0][1] === 9, 'redo: wiszacy areaId (77) → selectArea(9) — nagrane: ' + JSON.stringify(nav));
}

console.log('── T3 (K3): commitMoveRoomToArea nie czyści dirty prewencyjnie; guard na nawigacji ──');
{
  const { state, calls, api } = makeCtx();
  addRoomToState(state, mkRoom(10, 1));
  addRoomToState(state, mkRoom(20, 2));
  state.selected = 10;
  state.editDirty = true;
  state.editSnapshot = { id: 10, name: 'brudny' };
  api.commitMoveRoomToArea(10, 2);
  ok(state.roomArea[10] === 2 && state.areas.get(2).rooms.some(r => r.id === 10), 'przeniesienie dokonane (zatwierdzone dialogiem)');
  ok(state.editDirty === true && state.editSnapshot !== null, 'dirty + snapshot NIENARUSZONE po commicie');
  const guards = calls.filter(c => c[0] === 'showDirtyConfirm');
  ok(guards.length === 1, 'kanoniczny guard odpalony raz (zamiast cichego discardu)');
  ok(calls.filter(c => c[0] === 'jumpToRoom').length === 0, 'jumpToRoom odlozone do kontynuacji');
  guards[0][1]();                              // uzytkownik wybral (Porzuc/Zapisz) → kontynuacja
  ok(calls.filter(c => c[0] === 'jumpToRoom').length === 1, 'kontynuacja nawiguje do przeniesionego pokoju');
  const e = state.undoStack[state.undoStack.length - 1];
  ok(e.type === 'MOVE_ROOM_TO_AREA' && e.fromAreaId === 1 && e.toAreaId === 2, 'wpis undo poprawny');
}
{
  const { state, calls, api } = makeCtx();     // ścieżka czysta — jak dawniej
  addRoomToState(state, mkRoom(10, 1));
  addRoomToState(state, mkRoom(20, 2));
  api.commitMoveRoomToArea(10, 2);
  ok(calls.filter(c => c[0] === 'showDirtyConfirm').length === 0, 'czysty formularz: bez guarda');
  ok(calls.filter(c => c[0] === 'jumpToRoom' && c[1] === 10).length === 1, 'czysty formularz: jumpToRoom od razu');
}

console.log('── T4: strażniki strukturalne (zrodlo) ──');
{
  ok(!NEW.includes('state.selectedRoom'), 'W10: 0 × state.selectedRoom w pliku');
  ok(!NEW.includes('if (first) selectArea('), 'W12: 0 × if (first) selectArea — falsy guard usuniety');
  ok((NEW.match(/first !== undefined/g) || []).length >= 2, 'W12: first !== undefined ×2 (commit + redo)');
  const fit = extract(NEW, 'function fitRouteToView() {');
  ok(!fit.includes('Silently discard') && fit.includes('showDirtyConfirm') && fit.includes('_finishFit'),
    'K2: fitRouteToView z kanonicznym guardem + domkniecie _finishFit');
  const mv = extract(NEW, 'function commitMoveRoomToArea(roomId, targetAreaId, label) {');
  ok(!mv.includes('state.editDirty = false'), 'K3: commitMoveRoomToArea bez prewencyjnego czyszczenia dirty');
  ok(mv.includes('showDirtyConfirm(() => jumpToRoom(roomId))'), 'K3: guard na nawigacji do przeniesionego pokoju');
  const add = extract(NEW, 'function commitAddArea(name) {');
  ok(add.includes('prevAreaId'), 'W11: commitAddArea nagrywa prevAreaId');
  ok(NEW.includes('pendingSERenames:         null,'), 'Q4: pendingSERenames w init state');
  ok(NEW.includes('if (!state.pendingSERenames)'), 'Q4: init w updateSpecialeTab');
  ok(NEW.includes('const ren = state.pendingSERenames;'), 'Q4: sledzenie rename w update() wiersza SE');
  ok(NEW.includes('const explicitTo = state.pendingSERenames'), 'Q4: jawny rename w commitRoomEdit przed heurystyka');
  ok(NEW.includes('if (room.doors[newCmd] === undefined)'), 'Q4: target wygrywa per-pole (doors)');
  ok((NEW.match(/state\.pendingSERenames\s+= null;/g) || []).length === 2, 'Q4: clear ×2 (zmiana pokoju + po commicie)');
  ok(NEW.includes("const APP_VERSION = 'v1.44.4';"), 'wersja: v1.44.4');
}

console.log('');
if (fail === 0) { console.log('═══ tier2_state: ' + pass + ' OK, 0 FAIL ═══'); }
else { console.log('═══ tier2_state: ' + pass + ' OK, ' + fail + ' FAIL ═══'); process.exit(1); }
