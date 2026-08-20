// Harness Tier 5 (v1.40.0) — fixy z audytu kimi-k2.7-code:
// F1 __proto__-safe mapy (_setMapKey), F2 backlink room.area w _replaceRoomData,
// F3 suppressor kasowany przy addExit (panel+canvas+undo/redo), F4 rp-env przez
// pendingEnv (zero mutacji live), F5 placeCtx dla obszaru-kalki (sid) + spojnosc
// classify<->apply. Wzorzec extract/makeCtx jak tier4_hardening.js i delta.js.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  OK', name); }
  else { fail++; console.log('  FAIL', name); }
}
function extract(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('BRAK KOTWICY: ' + anchor);
  if (src.indexOf(anchor) !== src.lastIndexOf(anchor)) throw new Error('kotwica nieunikalna: ' + anchor);
  let d = 0; const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('niezbalansowane klamry: ' + anchor);
}
function blockSlice(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica bloku: ' + a);
  return HTML.slice(i, j);
}

// ═══ Sekcja A: F1 — klaster __proto__ ═══
console.log('— A: F1 __proto__ —');
{
  const helper = extract(HTML, 'function _setMapKey(o, k, v) {');
  ok(helper.includes('Object.defineProperty') && helper.includes('enumerable: true')
    && helper.includes('writable: true') && helper.includes('configurable: true'),
    'A1: helper _setMapKey — defineProperty z enumerable/writable/configurable');

  const setMapKey = new Function('o', 'k', 'v', helper + '; return _setMapKey(o, k, v);');
  const o = {};
  setMapKey(o, '__proto__', 'x');
  ok(Object.prototype.hasOwnProperty.call(o, '__proto__') && o['__proto__'] === 'x',
    'A2: __proto__ = own property z wartoscia (nie zignorowane)');
  ok(JSON.stringify(o).includes('__proto__') && Object.keys(o).includes('__proto__'),
    'A3: __proto__ enumerable — JSON.stringify i Object.keys widza klucz');
  setMapKey(o, 'zwykly', 1);
  ok(o['zwykly'] === 1 && Object.keys(o).length === 2, 'A4: zwykly klucz — semantyka bez zmian');
  o['__proto__'] = 'nadpisane';  // writable:true — edytor moze nadpisac
  ok(o['__proto__'] === 'nadpisane', 'A5: __proto__ nadpisywalne (writable)');

  for (const fn of ['readQMapSU', 'readQMapSS', 'readQMapSI']) {
    const body = extract(HTML, 'function ' + fn + '(r) {');
    ok(body.includes('_setMapKey(o, k, v)') && !body.includes('o[k] = v'),
      'A6: ' + fn + ' uzywa _setMapKey (zero surowego o[k] = v)');
  }
  const uses = HTML.split('_setMapKey(').length - 1;
  ok(uses === 8, 'A7: _setMapKey uzyte 8x (definicja + 3 readery + 4 edytory/commit) — jest ' + uses);
}

// ═══ Sekcja B: F2 — backlink room.area w _replaceRoomData ═══
console.log('— B: F2 backlink room.area —');
{
  const fn = extract(HTML, 'function _replaceRoomData(room, snapshot) {');
  const mk = (roomArea) => {
    const state = { roomArea };
    return new Function('state', fn + '; return _replaceRoomData;', )(state);
  };
  // B1: snapshot bez area, kanon ma wpis -> odtworzony
  {
    const replace = mk({ 5: 7 });
    const room = { id: 5, x: 1 };
    replace(room, { id: 5, x: 2, name: 'N' });
    ok(room.area === 7 && room.x === 2, 'B1: brak backlinku w snapshocie -> odtworzony z kanonu');
  }
  // B2: snapshot.area sprzeczne z kanonem -> kanon wygrywa
  {
    const replace = mk({ 5: 7 });
    const room = { id: 5 };
    replace(room, { id: 5, area: 9 });
    ok(room.area === 7, 'B2: snapshot.area != kanon -> kanon wygrywa');
  }
  // B3: brak wpisu w kanonie (osierocony) -> snapshot zachowany
  {
    const replace = mk({});
    const room = { id: 5 };
    replace(room, { id: 5, area: 3 });
    ok(room.area === 3, 'B3: brak wpisu w roomArea -> snapshot.area zachowane');
  }
  // B4: pokoj bez id -> bez wyjatku, bez zmian
  {
    const replace = mk({ 5: 7 });
    const room = { x: 1 };
    replace(room, { x: 2 });
    ok(room.x === 2 && room.area === undefined, 'B4: pokoj bez id -> guard, zero wyjatku');
  }
}

// ═══ Sekcja C: F3 — suppressor kasowany przy addExit ═══
console.log('— C: F3 suppressor przy addExit —');
{
  const commit = extract(HTML, 'function commitAddExit(sourceId, dir, targetId, bidirectional, customLabel) {');
  ok(commit.includes('prevSupCL') && commit.includes('prevOppSupCL'),
    'C1: commitAddExit snapshotuje suppressory (prevSupCL/prevOppSupCL)');
  ok(/pushUndo\(\{ type: 'ADD_EXIT'[^}]*prevSupCL/.test(commit.replace(/\n/g, ' ')),
    'C2: entry ADD_EXIT niesie prevSupCL (jedna jednostka undo)');

  // C3: behavioralny — commitAddExit kasuje martwy suppressor w tej samej jednostce undo
  const state = {
    roomById: { 1: { id: 1, x: 0, y: 0, z: 0, custom_lines: { e: { points: [], color: [255, 0, 0] } } },
                2: { id: 2, x: 1, y: 0, z: 0 } },
    undoStack: [], redoStack: [],
  };
  const pushed = [];
  const ctx = {
    state,
    OPPOSITE: { n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne', nw: 'se', se: 'nw', up: 'down', down: 'up', in: 'out', out: 'in' },
    pushUndo: (e) => { state.undoStack.push(e); pushed.push(e); },
    draw: () => {}, toast: () => {}, updateUndoRedoUI: () => {}, _syncEditSnapshot: () => {},
  };
  const run = new Function(...Object.keys(ctx), commit + '; return commitAddExit;')(...Object.values(ctx));
  run(1, 'e', 2, false);
  const src = state.roomById[1];
  ok(src.exits && src.exits.e === 2, 'C3: exit dodany (exits.e = 2)');
  ok(!(src.custom_lines && src.custom_lines.e), 'C4: martwy suppressor skasowany przy dodaniu exit');
  const entry = pushed[0];
  ok(entry && entry.prevSupCL && Array.isArray(entry.prevSupCL.points) && entry.prevSupCL.points.length === 0
    && entry.prevSupCL.color && entry.prevSupCL.color[0] === 255,
    'C5: entry niesie snapshot suppressora (points [], color)');
  // undo przywraca suppressor (logika dispatchu: entry.prevSupCL -> custom_lines[dir])
  const undoSrc = extract(HTML, "case 'ADD_EXIT': {\n      const src = rm(entry.sourceId); if (!src) break;\n      // audyt A12: przywróć nadpisane wyjście");
  ok(undoSrc.includes('entry.prevSupCL') && undoSrc.includes('src.custom_lines[entry.dir] = JSON.parse(JSON.stringify(entry.prevSupCL))'),
    'C6: undo ADD_EXIT przywraca suppressor z entry');
  const redoSrc = extract(HTML, "case 'ADD_EXIT': {\n      const src = rm(entry.sourceId); if (!src) break;\n      src.exits = src.exits || {}; src.exits[entry.dir] = entry.targetId;");
  ok(redoSrc.includes('delete src.custom_lines[entry.dir]') && redoSrc.includes('entry.prevSupCL'),
    'C7: redo ADD_EXIT ponownie kasuje suppressor');
  const panel = extract(HTML, 'function commitRoomEdit() {');
  ok(panel.includes('audyt T5/F3 (#27)') && panel.includes('(room.custom_lines[dir].points || []).length === 0'),
    'C8: panel (pendingExitTarget) kasuje suppressor — undo pokryte snapshotem pokoju');
}

// ═══ Sekcja D: F4 — rp-env bez mutacji live ═══
console.log('— D: F4 rp-env przez pendingEnv —');
{
  const line = HTML.split('\n').find(l => l.includes('id="rp-env"') && l.includes('onchange'));
  ok(line && !line.includes('r.env=parseInt') && line.includes('state.pendingEnv=parseInt'),
    'D1: onchange rp-env — pendingEnv zamiast mutacji r.env');
  ok(HTML.includes("pendingEnv:         null,"), 'D2: state init pendingEnv');
  ok(HTML.includes('state.pendingEnv        = null;  // audyt T5/F4 (#1)'), 'D3: populateEditForm resetuje pendingEnv');
  ok(HTML.includes('state.pendingEnv = null;  // audyt T5/F4 (#1): porzucona zmiana env'),
    'D4: Porzuc czysci pendingEnv');
  ok(HTML.includes('state.pendingEnv         = null;  // audyt T5/F4 (#1): zapisane'),
    'D5: commitRoomEdit konsumuje pendingEnv po zapisie');

  const envOf = extract(HTML, 'function _envOf(r) {');
  const roomColor = extract(HTML, 'function roomColor(r) {');
  ok(roomColor.includes('_envOf(r)'), 'D6: roomColor przez _envOf (override renderu)');
  ok(HTML.includes('state.colorCache[_envOf(r)] || DEFAULT_ROOM_CSS;  // audyt T5/F4 (#1)'),
    'D7: minimap przez _envOf');
  // D8: behavioralny _envOf
  const st = { pendingEnv: null, editMode: true, selected: 5 };
  const envOfFn = new Function('state', envOf + '; return _envOf;')(st);
  ok(envOfFn({ id: 5, env: 3 }) === 3, 'D8a: pendingEnv null -> r.env');
  st.pendingEnv = 9;
  ok(envOfFn({ id: 5, env: 3 }) === 9, 'D8b: pendingEnv + selected + editMode -> override');
  ok(envOfFn({ id: 6, env: 4 }) === 4, 'D8c: inny pokoj -> bez override');
  st.editMode = false;
  ok(envOfFn({ id: 5, env: 3 }) === 3, 'D8d: poza editMode -> bez override');
}

// ═══ Sekcja E: F5 — obszar-kalka (sid): placeCtx + spojnosc classify/apply ═══
console.log('— E: F5 obszar-kalka sid —');
{
  const deltaCode =
    'let _deltaReview = null;\n' +
    blockSlice('// ── constants.js ──', '// ── validate.js ──') + '\n' +
    'const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT));\n' +
    extract(HTML, 'function _stripRoomDefaults(room) {') + '\n' +
    blockSlice('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
    extract(HTML, 'function stableStringify(val, indent, _lvl) {') + '\n' +
    extract(HTML, 'function pushUndo(entry) {') + '\n' +
    extract(HTML, 'function _replaceRoomData(room, snapshot) {') + '\n' +
    extract(HTML, 'function _dispatchRedo(entry) {') + '\n' +
    blockSlice('// === ARKDELTA START ===', '// ── UI: dialog + wiring') + '\n' +
    'function _deltaCardHide() {}\n' +
    extract(HTML, 'function _arkdeltaBaseNote(base) {') + '\n' +
    extract(HTML, 'function _deltaBaseCheck(base) {') + '\n' +
    '\n;return { pushUndo, applyDelta, classifyDelta, _deltaPlaceCtx, _deltaTakenCells, _deltaCellFree, _deltaFindFreeCell, _deltaRoomAt,'
    + '\n  get overrides() { return _deltaOverrides; }, set overrides(v) { _deltaOverrides = v; } };';

  const a1 = { id: 1, name: 'Area One', rooms: [
    { id: 10, x: 0, y: 0, z: 0, name: 'R10', env: 258 },
    { id: 11, x: 1, y: 0, z: 0, name: 'R11', env: 258 },
  ], labels: [] };
  const state = {
    map: { meta: { user_data: {} }, areas: [a1], colors: { custom_env_colors: {} } },
    areas: new Map(), roomById: {}, roomArea: {},
    undoStack: [], redoStack: [], deltaLog: [], dirty: false,
    filename: 'test.arkmap', z: 0, editMode: true, selected: null, selectedLabel: null, baseInfo: null,
  };
  state.areas.set(1, a1);
  for (const r of a1.rooms) { state.roomById[r.id] = r; state.roomArea[r.id] = 1; }
  const api = new Function('state', 'document', 'window', 'localStorage', 'toast', 'draw',
    'buildRoomsZ', 'buildAreaList', 'deleteRoom', 'commitAddExit', 'commitDeleteExit',
    'commitMoveRoom', 'commitMoveRoomToArea', '_syncEditSnapshot', 'updateUndoRedoUI', 'renderDeltaList',
    deltaCode)(
    state,
    { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    {}, { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    () => {}, () => {}, () => {}, () => {},
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {});

  const room = (x, y, name) => ({ x, y, z: 0, name, env: 262 });
  const delta = {
    meta: { format: 'arkdelta', format_version: 1, ops_count: 4, base: { crc: 'x' } },
    ops: [
      { seq: 1, type: 'ADD_AREA', target: { areaId: 'd:9' }, payload: { area: { name: 'Nowy Obszar T5', rooms: [], labels: [] } }, label: 'AA' },
      { seq: 2, type: 'ADD_ROOM', target: { roomId: 'd:10', areaId: 'd:9' }, payload: { room: room(3, 3, 'K1') }, label: 'A1' },
      { seq: 3, type: 'ADD_ROOM', target: { roomId: 'd:11', areaId: 'd:9' }, payload: { room: room(3, 3, 'K2') }, label: 'A2' },
      { seq: 4, type: 'ADD_ROOM', target: { roomId: 'd:12', areaId: 'd:9' }, payload: { room: room(5, 5, 'K3') }, label: 'A3' },
    ],
  };
  const items = api.classifyDelta(delta);
  ok(items[0].cls === 'ok', 'E1: ADD_AREA sid -> ok');
  ok(items[1].cls === 'ok', 'E2: pierwszy ADD_ROOM w obszarze-kalce -> ok');
  ok(items[2].cls === 'hard' && items[2].coll === true,
    'E3: drugi ADD_ROOM na to samo pole -> hard+coll (cien wykrywa kolizje miedzyopowa)');
  ok(items[3].cls === 'ok', 'E4: trzeci ADD_ROOM na wolnym polu -> ok');

  const pctx = api._deltaPlaceCtx(delta, items, 3);
  ok(pctx && pctx.areaId === 'd:9' && pctx.sidArea === true && pctx.z === 0,
    'E5: placeCtx dla obszaru-kalki -> kontekst na surowym sid (autopozycja dostepna)');
  items[0].checked = false;
  ok(api._deltaPlaceCtx(delta, items, 3) === null,
    'E6: odznaczone ADD_AREA -> placeCtx null (obszar nie powstanie)');
  items[0].checked = true;
  const deltaNoArea = { meta: delta.meta, ops: delta.ops.slice(1) };
  const itemsNoArea = api.classifyDelta(deltaNoArea);
  ok(api._deltaPlaceCtx(deltaNoArea, itemsNoArea, 2) === null,
    'E7: sid-area bez ADD_AREA w delcie -> placeCtx null');

  // E8: autopozycja na sid-area — taken z kluczem sid rezerwuje cele innych opow
  const taken = api._deltaTakenCells(delta, items, 3);
  ok(taken.has('d:9:3:3:0') && taken.has('d:9:5:5:0'), 'E8: taken na surowym sid (cele opow 2 i 4)');
  const cell = api._deltaFindFreeCell('d:9', 3, 3, 0, taken);
  ok(cell && !(cell.x === 3 && cell.y === 3) && !taken.has('d:9:' + cell.x + ':' + cell.y + ':0'),
    'E9: spirala na sid-area omija taken -> (' + (cell && cell.x) + ',' + (cell && cell.y) + ')');

  // E10: spojnosc classify<->apply — zaznaczone 'ok' bez kolizji: zero skipow
  const deltaOk = { meta: delta.meta, ops: [delta.ops[0], delta.ops[1], delta.ops[3]] };
  const itemsOk = api.classifyDelta(deltaOk);
  ok(itemsOk.every(i => i.cls === 'ok'), 'E10: wszystkie opy ok po usunieciu kolizji');
  const res = api.applyDelta(deltaOk);
  ok(res.applied === 3 && res.skipped.length === 0, 'E11: apply zaznaczonych ok -> 3 applied / 0 skipped (brak rozjazdu)');
  const newArea = [...state.areas.values()].find(a => a.name === 'Nowy Obszar T5');
  ok(newArea && newArea.rooms.length === 2
    && newArea.rooms.some(r => r.name === 'K1') && newArea.rooms.some(r => r.name === 'K3'),
    'E12: pokoje faktycznie w nowym obszarze po apply');
}

console.log('');
console.log(`═══ tier5_audit: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
