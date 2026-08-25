// Harness Tier 4 (v1.39.0) — walidator kalki typy/sid/glebokosc (K6/K7/S8), reszta kalki bez
// autopozycji (C-K5), kodek signed int32 (W1/W2), locki cmd + wagi long->short (C-locks/T4),
// merge planera (W8), enkoder tras fail-closed (W6), walidatory labels/pixmap (S2/S3),
// undo pustego kontenera CL (S7), piny: stretch<<8 / readQString-null / drag-LOCK / S4 / wersja.
// Wzorzec extract/makeCtx jak tier3_format.js + formatLayer jak a7_readbuffer.js.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

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
  const i = NEW.indexOf(a), j = NEW.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica bloku: ' + a);
  return NEW.slice(i, j);
}

// ── wspolny blok stalych (jak tier3; CRC32 usuniete w v1.48.3) ──
const constsStart = NEW.indexOf('const DIRS = [');
const constsBlock = NEW.slice(constsStart, NEW.indexOf('// ── arkadia-env.js ──'));

// ═══ ctx kalki (jak delta.js): blok ARKDELTA + walidator + remainder ═══
const deltaCode =
  'let _deltaReview = null;\n' +  // audyt T4/C-K5: deklaracja mieszka poza blokiem rdzenia (UI) — stub
  blockSlice('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  'const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT));\n' +
  extract(NEW, 'function _stripRoomDefaults(room) {') + '\n' +
  blockSlice('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  extract(NEW, 'function stableStringify(val, indent, _lvl) {') + '\n' +
  extract(NEW, 'function pushUndo(entry) {') + '\n' +
  extract(NEW, 'function _replaceRoomData(room, snapshot) {') + '\n' +
  extract(NEW, 'function _dispatchRedo(entry) {') + '\n' +
  blockSlice('// === ARKDELTA START ===', '// ── UI: dialog + wiring') + '\n' +
  'function _deltaCardHide() {}\n' +
  extract(NEW, 'function _arkdeltaBaseNote(base) {') + '\n' +
  extract(NEW, 'function _deltaBaseCheck(base) {') + '\n' +
  '\n;return { pushUndo, buildDelta, validateDeltaText, classifyDelta, _deltaChecksums, stableStringify,' +
  ' _deltaRemainderOps, _deltaValidateOpTypes, _deltaScanDeep, _deltaApplyOverridesToOps,' +
  '\n  get overrides() { return _deltaOverrides; }, set overrides(v) { _deltaOverrides = v; },' +
  '\n  get appliedSeqs() { return _deltaAppliedSeqs; }, set appliedSeqs(v) { _deltaAppliedSeqs = v; },' +
  '\n  set review(v) { _deltaReview = v; }, get review() { return _deltaReview; } };';

function makeDeltaCtx() {
  const a1 = { id: 1, name: 'Area One', rooms: [
    { id: 10, x: 0, y: 0, z: 0, name: 'R10', env: 258, exits: { e: 11 } },
    { id: 11, x: 1, y: 0, z: 0, name: 'R11', env: 258, exits: { w: 10 } },
  ], labels: [] };
  const state = {
    map: { meta: { user_data: { version: '9.9.9', revision: '0123456789abcdef0123456789abcdef01234567' } },
           areas: [a1], colors: { custom_env_colors: {} } },
    areas: new Map(), roomById: {}, roomArea: {},
    undoStack: [], redoStack: [], deltaLog: [], dirty: false,
    filename: 'test.arkmap', z: 0, editMode: true, selected: null, selectedLabel: null, baseInfo: null,
  };
  for (const area of state.map.areas) {
    state.areas.set(area.id, area);
    for (const r of area.rooms) { state.roomById[r.id] = r; state.roomArea[r.id] = area.id; }
  }
  const fn = new Function(
    'state', '_dispatchUndo', 'updateUndoRedoUI', 'draw', 'toast', 'plPl', 'document',
    'download', 'escHtml', 'APP_VERSION',
    'deleteRoom', 'commitDeleteArea', 'commitMoveRoomToArea', 'commitAddExit', 'commitMoveRoom', 'commitDeleteExit',
    'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'refreshLabelList', 'populateEditForm', 'selectArea',
    deltaCode
  );
  const api = fn(state, () => {}, () => {}, () => {}, () => {}, (n, one) => n + ' ' + one,
    { getElementById: () => null },
    () => {}, (x) => String(x), 'v1.39.0-test',
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
  return { state, api };
}

// pomocnicza kalka z poprawnymi sumami (jak _deltaSerializeOps)
function mkDelta(ctx, ops) {
  ops = ops.map((o, i) => Object.assign({}, o, { seq: i + 1 }));
  const meta = { format: 'arkdelta', format_version: 2, ops_count: ops.length, base: {}, app_version: 'test' };
  const checksums = {
    ...ctx.api._deltaChecksums(meta, ops),
  };
  return JSON.stringify({ meta, ops, checksums });
}

// ═══ T1: walidator kalki — typy (K6), sid (K7), glebokosc (S8) ═══
console.log('── T1: validateDeltaText — typy/sid/glebokosc ──');
{
  const ctx = makeDeltaCtx();
  const v = t => ctx.api.validateDeltaText(t);

  // pozytyw: prawdziwa kalka fixture przechodzi
  const fixture = fs.readFileSync(path.join(ROOT, 'tests', 'fixture_demo.arkdelta'), 'utf8');
  const rf = v(fixture);
  ok(rf.ok === true, 'K6/K7: fixture_demo.arkdelta przechodzi (wlasne kalki maja typy i sid)' + (rf.ok ? '' : ' :: ' + rf.errors[0]));

  // pozytyw: snapshoty z sid w srodku przechodza (sid-aware)
  const tSid = mkDelta(ctx, [
    { type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: { id: 'd:1', x: 0, y: 0, z: 0 } }, label: '' },
    { type: 'EDIT_ROOM', target: { roomId: 'd:1' }, payload: { before: { name: 'a', exits: { n: 'd:1' } }, after: { name: 'b', exits: { n: 'd:1' } } }, label: '' },
  ]);
  const rSid = v(tSid);
  ok(rSid.ok === true, 'K6: snapshoty z odwolaniami d:N przechodza (sid-aware)' + (rSid.ok ? '' : ' :: ' + rSid.errors[0]));

  // negatywy K6: typy
  const tBadCoord = mkDelta(ctx, [{ type: 'MOVE_ROOM', target: { roomId: 10 }, payload: { toX: 'abc', toY: 0, toZ: 0 }, label: '' }]);
  const r1 = v(tBadCoord);
  ok(!r1.ok && r1.errors.some(e => e.includes('nieprawidłowe dane') && e.includes('nowa pozycja X')),
    'K6: toX:"abc" odrzucone z laickim komunikatem');

  const tBadColor = mkDelta(ctx, [{ type: 'EDIT_ENV_COLOR', target: { envId: 262 }, payload: { newColor: [999, 0, 0] }, label: '' }]);
  ok(!v(tBadColor).ok, 'K6: kolor 999 odrzucony');
  const tGoodColor = mkDelta(ctx, [{ type: 'EDIT_ENV_COLOR', target: { envId: 262 }, payload: { newColor: [1, 2, 3] }, label: '' }]);
  ok(v(tGoodColor).ok, 'K6: kolor [1,2,3] przechodzi');

  const tBadPaint = mkDelta(ctx, [{ type: 'PAINT_BATCH', target: {}, payload: { changes: 'x' }, label: '' }]);
  ok(!v(tBadPaint).ok, 'K6: PAINT_BATCH changes jako string odrzucone');

  const tBadBefore = mkDelta(ctx, [{ type: 'EDIT_ROOM', target: { roomId: 10 }, payload: { before: [1], after: {} }, label: '' }]);
  ok(!v(tBadBefore).ok, 'K6: before jako tablica odrzucone');

  // negatywy K7: ADD bez sid
  const tAddNoSid = mkDelta(ctx, [{ type: 'ADD_ROOM', target: { roomId: 123, areaId: 1 }, payload: { room: { id: 123, x: 0, y: 0, z: 0 } }, label: '' }]);
  const r2 = v(tAddNoSid);
  ok(!r2.ok && r2.errors.some(e => e.includes('identyfikator kalki')), 'K7: ADD_ROOM ze zwyklym numerem odrzucone');
  const tAreaNoSid = mkDelta(ctx, [{ type: 'ADD_AREA', target: { areaId: 7 }, payload: { area: { id: 7, name: 'X' } }, label: '' }]);
  ok(!v(tAreaNoSid).ok, 'K7: ADD_AREA bez sid odrzucone');
  const tLblNoSid = mkDelta(ctx, [{ type: 'ADD_LABEL', target: { areaId: 1 }, payload: { label: { id: 3, text: 't' } }, label: '' }]);
  ok(!v(tLblNoSid).ok, 'K7: ADD_LABEL bez sid odrzucone');

  // S8: glebokie zagniezdzenie — kontrolowany blad, walidator NIE rzuca
  let deep = {}; { let cur = deep; for (let i = 0; i < 100; i++) { cur.a = {}; cur = cur.a; } }
  const tDeep = mkDelta(ctx, [{ type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: deep }, label: '' }]);
  let threw = false, rDeep = null;
  try { rDeep = v(tDeep); } catch (e) { threw = true; }
  ok(!threw, 'S8: walidator nie rzuca na glebokiej strukturze');
  ok(rDeep && !rDeep.ok && rDeep.errors.some(e => e.includes('zbyt głęboko')), 'S8: kontrolowany blad glebokosci');

  // plytka struktura (50) nadal przechodzi skan
  let shallow = {}; { let cur = shallow; for (let i = 0; i < 50; i++) { cur.a = {}; cur = cur.a; } }
  const tShallow = mkDelta(ctx, [{ type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: shallow }, label: '' }]);
  ok(v(tShallow).ok === true, 'S8: glebokosc 50 miesci sie w limicie');
}

// ═══ T2: kodek signed int32 (W1/W2) + piny readQString/null ═══
console.log('── T2: kodek .dat signed — roundtrip i bajty ──');
{
  function formatLayer(html) {
    const a = html.indexOf('// ── constants.js ──');
    const b = html.indexOf('// ── main ──');
    const c = html.indexOf('const ANSI_PAL = buildAnsiPal();');
    const d = html.indexOf('function buildColorCache');
    return html.slice(a, b) + '\n' + html.slice(c, d);
  }
  const api = new Function(formatLayer(NEW) +
    '\n;return { ReadBuffer, WriteBuffer, readQListI, writeQListI, readQListU, writeQListU, readQMMUS, writeQMMUS, readQString, writeQString };')();

  const w1 = new api.WriteBuffer(); api.writeQListI(w1, [-2, 5, 0]);
  const r1 = api.readQListI(new api.ReadBuffer(w1.toUint8Array()));
  ok(JSON.stringify(r1) === JSON.stringify([-2, 5, 0]), 'W1: ujemne id pokoju przezywa roundtrip (readQListI)');

  // bajtowa zgodnosc z dotychczasowym zapisem: int32 i uint32 daja te same bajty (tez dla -2)
  const wP = new api.WriteBuffer(); api.writeQListI(wP, [1, 2, 3]);
  const wN = new api.WriteBuffer(); api.writeQListI(wN, [-2]);
  const expP = [0,0,0,3, 0,0,0,1, 0,0,0,2, 0,0,0,3];
  const expN = [0,0,0,1, 0xFF,0xFF,0xFF,0xFE];
  ok(JSON.stringify([...wP.toUint8Array()]) === JSON.stringify(expP), 'W1: bajty zapisu niezmienione dla id >= 0');
  ok(JSON.stringify([...wN.toUint8Array()]) === JSON.stringify(expN), 'W1: bajty zapisu -2 = dotychczasowy uint32 (FF FF FF FE)');

  const w2 = new api.WriteBuffer(); api.writeQMMUS(w2, { '-2': ['1x'], '5': ['0n'] });
  const r2 = api.readQMMUS(new api.ReadBuffer(w2.toUint8Array()));
  ok(JSON.stringify(r2['-2']) === JSON.stringify(['1x']) && JSON.stringify(r2['5']) === JSON.stringify(['0n']),
    'W2: special exit do ujemnego id przezywa roundtrip');

  const w3 = new api.WriteBuffer(); api.writeQMMUS(w3, { '5': ['0n'] });
  const expQ = [0,0,0,1, 0,0,0,5, 0,0,0,4, 0,0x30, 0,0x6E];
  ok(JSON.stringify([...w3.toUint8Array()]) === JSON.stringify(expQ), 'W2: bajty zapisu niezmienione dla id >= 0');

  // pin C-readQString: null-QString (0xFFFFFFFF) → ''
  const rNull = api.readQString(new api.ReadBuffer(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF])));
  ok(rNull === '', 'pin: readQString null-QString → pusty string (falszywy alarm Claudea, zachowane)');
}

// ═══ T2b: golden-pin writera .dat na fixture — fixpoint + zgodnosc z v1.38.0 (bramka W1/W2) ═══
// Fixture pisal Mudlet — bajt-w-bajt wzgledem fixture NIGDY nie trzymal (writer normalizuje
// kolejnosci, np. stubs). Golden = wyjscie writera v1.38.0: len 7845726, crc32 65da3512.
console.log('── T2b: golden writera .dat (fixpoint + crc) ──');
{
  const FIX = path.join(ROOT, 'map_master3.dat');
  if (!fs.existsSync(FIX)) {
    console.log('  SKIP — brak map_master3.dat (bash tests/fetch-fixture.sh)');
  } else {
    const DAT = fs.readFileSync(FIX);
    function formatLayer2(html) {
      const a = html.indexOf('// ── constants.js ──');
      const b = html.indexOf('// ── main ──');
      const c = html.indexOf('const ANSI_PAL = buildAnsiPal();');
      const d = html.indexOf('function buildColorCache');
      return html.slice(a, b) + '\n' + html.slice(c, d);
    }
    const api2 = new Function(formatLayer2(NEW) + '\n;return { datToArkmap, arkmapToDat };')();
    const ab = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
    const o1 = api2.arkmapToDat(api2.datToArkmap(ab.slice(0)));
    const b1 = o1 instanceof Uint8Array ? o1 : new Uint8Array(o1);
    const o2 = api2.arkmapToDat(api2.datToArkmap(b1.buffer.slice(b1.byteOffset, b1.byteOffset + b1.byteLength)));
    const b2 = o2 instanceof Uint8Array ? o2 : new Uint8Array(o2);
    ok(b1.length === b2.length && Buffer.from(b1).equals(Buffer.from(b2)),
      'W1/W2: writer stabilny — fixpoint bajtowy write(read(write(read(fix)))) == write(read(fix))');
    // CRC-32 liczone po stronie testu (zlib) — aplikacja nie nosi juz CRC-32 (v1.48.3)
    const hex = ('00000000' + require('zlib').crc32(b1).toString(16)).slice(-8);
    ok(b1.length === 7845726 && hex === '65da3512',
      'W1/W2: golden — wyjscie writera bajtowo jak v1.38.0 [len=' + b1.length + ' crc=' + hex + ']');
  }
}

// ═══ T3: buildRoom — locki jako cmd (C-locks), wagi long->short ═══
console.log('── T3: buildRoom — mSpecialExitLocks / exit_weights ──');
{
  const code = [
    constsBlock,
    extract(NEW, 'function stableStringify(val, indent, _lvl) {'),
    extract(NEW, 'function toQColor(arr, defaultAlpha = 255) {'),
    extract(NEW, 'function _stripRoomDefaults(room) {'),
    extract(NEW, 'function _hash8(s) {'),
    extract(NEW, 'function _datConvertRoom(raw, hashLookup) {'),
    extract(NEW, 'function buildRoom(room, areaId) {'),
  ].join('\n');
  const fn = new Function('state', 'toast', 'draw', 'updateEditUI', 'updateUndoRedoUI', 'hideBanners', 'closeCtxMenu',
    'cv', 'document', '_paintStrokeRevert', '_paintDisarm',
    'let _paintStroke = null, _lockInterval = null;\n' + code + '\n;return { buildRoom, _datConvertRoom };');
  const st = { undoStack: [], redoStack: [], deltaLog: [], dirty: false, editMode: true, githubSession: false, canvasMode: 'normal', lockExpiry: null };
  const elStub = () => ({ classList: { add() {}, remove() {} }, style: {} });
  const api = fn(st, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, { style: {} },
    { getElementById: elStub, hidden: false }, () => {}, () => {});

  const room = {
    id: 7, x: 1, y: 2, z: 0, name: 'T', env: 258, weight: 1,
    exits: { n: 8 }, special_exits: { 'sw;wspinaczka': 9 }, special_exit_locks: ['sw;wspinaczka'],
    exit_weights: { northeast: 3, n: 2 }, custom_lines: {}, doors: {}, stubs: [], exit_locks: [],
  };
  const out = api.buildRoom(room, 1);
  ok(JSON.stringify(out.mSpecialExitLocks) === JSON.stringify(['sw;wspinaczka']),
    'C-locks: mSpecialExitLocks = lista KOMEND (stringow), nie roomId — semantyka v21');
  ok(typeof out.mSpecialExitLocks[0] === 'string', 'C-locks: typ string (sciezka writera lockSet.has(cmd) dziala)');
  ok(JSON.stringify(out.exitWeights) === JSON.stringify({ ne: 3, n: 2 }),
    'exit_weights: long-name "northeast" znormalizowany do "ne" przy zapisie .dat');
  ok(JSON.stringify(out.rawSpecialExits) === JSON.stringify({ '9': ['1sw;wspinaczka'] }),
    'C-locks: rawSpecialExits v20 nadal z prefiksem 1 (zamek nietkniety na sciezce glownej)');
}

// ═══ T4: reszta kalki — oryginal + tylko reczne pozycje (C-K5, decyzja P2) ═══
console.log('── T4: _deltaRemainderOps — autopozycje nie przeciekaja ──');
{
  const ctx = makeDeltaCtx();
  const ops = [
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: { id: 'd:1', x: 0, y: 0, z: 0 } }, label: '' },
    { seq: 2, type: 'MOVE_ROOM', target: { roomId: 10 }, payload: { toX: 5, toY: 5, toZ: 0 }, label: '' },
    { seq: 3, type: 'MOVE_ROOM', target: { roomId: 11 }, payload: { toX: 7, toY: 7, toZ: 0 }, label: '' },
  ];
  ctx.api.review = {
    delta: { ops: JSON.parse(JSON.stringify(ops)) },
    originalOps: JSON.parse(JSON.stringify(ops)),
    items: [{ seq: 1, cls: 'ok' }, { seq: 2, cls: 'ok' }, { seq: 3, cls: 'hard' }],
  };
  ctx.api.overrides = new Map([
    [1, { x: 10, y: 10, how: 'auto' }],    // autopozycja — NIE wolno przeciec
    [2, { x: 20, y: 20, how: 'manual' }],  // reczne przesuniecie — przecieka (swiadomy wybor)
  ]);
  const rest = ctx.api._deltaRemainderOps();
  ok(rest.length === 3, 'C-K5: reszta kompletna (3 nienaniesione)');
  ok(rest[0].payload.room.x === 0 && rest[0].payload.room.y === 0,
    'C-K5: autopozycja NIE przecieka do pliku reszty (x=0 z oryginalu)');
  ok(rest[1].payload.toX === 20 && rest[1].payload.toY === 20,
    'C-K5: reczne przesuniecie przecieka (swiadoma decyzja uzytkownika)');
  ok(rest[2].payload.toX === 7, 'C-K5: op bez override bez zmian');
  // naniesione wypadaja z reszty
  ctx.api.appliedSeqs = new Set([1]);
  const rest2 = ctx.api._deltaRemainderOps();
  ok(rest2.length === 2 && rest2.every(o => o.seq !== 1), 'C-K5: naniesione seq wypada z reszty');
  // fallback bez originalOps (defensywnie)
  ctx.api.appliedSeqs = new Set();
  ctx.api.review = { delta: { ops: JSON.parse(JSON.stringify(ops)) }, items: [{ seq: 1, cls: 'ok' }] };
  ok(ctx.api._deltaRemainderOps().length === 1, 'C-K5: fallback na delta.ops gdy brak originalOps');
}

// ═══ T5: undo ADD_CL/ADD_SUPPRESSOR/AUTO_FIX — pusty kontener (S7) ═══
console.log('── T5: undo — sprzatanie pustego custom_lines ──');
{
  const src = extract(NEW, 'function _dispatchUndo(entry) {');
  const mk = () => {
    const state = { roomById: {} };
    const fn = new Function('state', src + '\n;return _dispatchUndo;');
    return { state, undo: fn(state) };
  };
  // ADD_CL, kontenera nie bylo → znika caly
  let c = mk();
  c.state.roomById[1] = { id: 1, custom_lines: { w: { points: [], color: [255, 0, 0] } } };
  c.undo({ type: 'ADD_CL', roomId: 1, dir: 'w', hadContainer: false });
  ok(c.state.roomById[1].custom_lines === undefined, 'S7: undo ADD_CL bez kontenera → custom_lines usuniete');
  // ADD_CL, kontener byl → zostaje
  c = mk();
  c.state.roomById[1] = { id: 1, custom_lines: { w: { points: [] }, e: { points: [[1, 1]] } } };
  c.undo({ type: 'ADD_CL', roomId: 1, dir: 'w', hadContainer: true });
  ok(JSON.stringify(Object.keys(c.state.roomById[1].custom_lines)) === JSON.stringify(['e']),
    'S7: undo ADD_CL z kontenerem → zostaja inne wpisy');
  // wpis legacy (bez hadContainer) → stare zachowanie (kontener zostaje) — kompatybilnosc
  c = mk();
  c.state.roomById[1] = { id: 1, custom_lines: { w: { points: [] } } };
  c.undo({ type: 'ADD_CL', roomId: 1, dir: 'w' });
  ok(JSON.stringify(c.state.roomById[1].custom_lines) === JSON.stringify({}), 'S7: wpis legacy bez flagi → bez zmian (kompatybilnosc)');
  // ADD_SUPPRESSOR bez kontenera → znika
  c = mk();
  c.state.roomById[2] = { id: 2, custom_lines: { n: { points: [] } } };
  c.undo({ type: 'ADD_SUPPRESSOR', roomId: 2, dir: 'n', hadContainer: false });
  ok(c.state.roomById[2].custom_lines === undefined, 'S7: undo ADD_SUPPRESSOR bez kontenera → usuniete');
  // AUTO_FIX: added z hadContainer=false → znika; removed przywraca
  c = mk();
  c.state.roomById[3] = { id: 3, custom_lines: { s: { points: [] } } };
  c.state.roomById[4] = { id: 4 };
  c.undo({ type: 'AUTO_FIX_SUPPRESSORS',
           added: [{ roomId: 3, dir: 's', hadContainer: false }],
           removed: [{ roomId: 4, dir: 'n', snapshot: { points: [[0, 0]], color: [1, 2, 3] } }] });
  ok(c.state.roomById[3].custom_lines === undefined, 'S7: undo AUTO_FIX added → pusty kontener usuniety');
  ok(c.state.roomById[4].custom_lines.n.points.length === 1, 'S7: undo AUTO_FIX removed → CL przywrocone');
}

// ═══ T6: planer — jawny merge SE>exits (W8) ═══
console.log('── T6: dijkstra — kolizja kluczy, priorytet SE ──');
{
  const code = [
    constsBlock,
    extract(NEW, 'function _edgeWeight(room, dir, neighborRoom) {'),
    extract(NEW, 'function _dirAllowed(dir, room) {'),
    extract(NEW, 'function dijkstraPath(fromId, toId) {'),
  ].join('\n');
  const fn = new Function('state', 'wpState',
    'let _pathHops = null, _transportEdges = null;\n' +
    'function _heapPush(heap, item) { heap.push(item); heap.sort((a, b) => a[0] - b[0]); }\n' +
    'function _heapPop(heap) { return heap.shift(); }\n' +
    code + '\n;return { dijkstraPath };');
  const state = { roomById: {
    1: { id: 1, exits: { n: 2 }, special_exits: { n: 3 } },  // kolizja klucza n — SE wygrywa
    2: { id: 2, exits: {} },
    3: { id: 3, exits: {} },
    4: { id: 4, exits: { e: 5 } },
    5: { id: 5, exits: {} },
  } };
  const api = fn(state, { dirMode: 'all', transportMode: 'off' });
  const p13 = api.dijkstraPath(1, 3);
  ok(p13 && p13.length === 2 && p13[1] === 3, 'W8: kolizja exits.n/special_exits.n → krawedz SE widoczna (priorytet SE, jak przy Object.assign)');
  const p12 = api.dijkstraPath(1, 2);
  ok(p12 === null, 'W8: exits.n przykryte przez SE (dokumentowana semantyka kolizji — bez zmian)');
  const p45 = api.dijkstraPath(4, 5);
  ok(p45 && p45.length === 2 && p45[1] === 5, 'W8: zwykla sciezka bez kolizji dziala');
  ok(!NEW.includes('Object.assign({}, room.exits || {}, room.special_exits || {})'), 'W8: zero Object.assign-merge w planerze (3 miejsca przepisane)');
}

// ═══ T7: enkoder tras fail-closed (W6) ═══
console.log('── T7: wpEncodeRoute/wpDecodeRoute — spojnosc ──');
{
  const code = extract(NEW, 'function wpEncodeRoute() {') + '\n' + extract(NEW, 'function wpDecodeRoute(code) {');
  const fn = new Function('wpState', 'state', code + '\n;return { wpEncodeRoute, wpDecodeRoute };');
  const wpState = { waypoints: [{ roomId: 1 }, { roomId: 2 }], algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off' };
  const state = { roomById: { 1: {}, 2: {} } };
  const api = fn(wpState, state);
  const code2 = api.wpEncodeRoute();
  ok(code2.startsWith('ARKMAP2:'), 'W6: normalna trasa koduje sie');
  const dec = api.wpDecodeRoute(code2);
  ok(dec && JSON.stringify(dec.valid) === JSON.stringify([1, 2]) && dec.invalidCount === 0, 'W6: roundtrip wlasnego kodu');
  wpState.waypoints = [{ roomId: 1 }, { roomId: -2 }];
  ok(api.wpEncodeRoute() === '', 'W6: ujemne id → enkoder fail-closed (nie produkuje kodu, ktorego dekoder odrzuci)');
  wpState.waypoints = [{ roomId: 1 }, { roomId: 2.5 }];
  ok(api.wpEncodeRoute() === '', 'W6: nie-calkowite id → fail-closed');
}

// ═══ T8: walidatory modelu — labels tablica (S2), pixmap base64+cap (S3) ═══
console.log('── T8: validateArea/validateLabel ──');
{
  const code = [
    extract(NEW, 'function err(path, msg) {'),
    extract(NEW, 'function isRGB(v) {'),
    extract(NEW, 'function validateUserData(ud, path, errors) {'),
    extract(NEW, 'function validateLabel(label, path, errors) {'),
    extract(NEW, 'function validateArea(area, path, errors, warnings = []) {'),
  ].join('\n');
  const api = new Function(code + '\n;return { validateArea, validateLabel };')();

  const goodLabel = { id: 1, x: 0, y: 0, z: 0, width: 4, height: 1.2, text: 'L',
                      fg_color: [1, 2, 3], bg_color: [4, 5, 6] };
  const mkArea = labels => ({ id: 1, name: 'A', rooms: [], labels });

  let errs = [];
  api.validateArea(mkArea({}), 'a', errs);
  ok(errs.some(e => e.path === 'a.labels' && e.msg === 'must be an array'),
    'S2: labels jako obiekt → kontrolowany blad (wczesniej ciche przejscie)');

  errs = [];
  api.validateArea(mkArea([goodLabel]), 'a', errs);
  ok(!errs.some(e => e.path.startsWith('a.labels')), 'S2: poprawne etykiety bez bledu');

  errs = [];
  api.validateLabel({ ...goodLabel, pixmap: '###nie-base64###' }, 'l', errs);
  ok(errs.some(e => e.path === 'l.pixmap' && e.msg === 'must be valid base64'),
    'S3: zly base64 → blad przy imporcie (wczesniej wywalalo sie przy eksporcie)');

  errs = [];
  api.validateLabel({ ...goodLabel, pixmap: 'A'.repeat(4194305) }, 'l', errs);
  ok(errs.some(e => e.path === 'l.pixmap' && e.msg.startsWith('too large')),
    'S3: pixmapa ponad limit 4 MB → blad (C-base64)');

  errs = [];
  api.validateLabel({ ...goodLabel, pixmap: Buffer.from([1, 2, 3, 4]).toString('base64') }, 'l', errs);
  ok(!errs.some(e => e.path === 'l.pixmap'), 'S3: poprawna pixmapa bez bledu');
}

// ═══ T9: piny i strazniki strukturalne ═══
console.log('── T9: piny ──');
{
  ok(NEW.includes("w.writeUInt16((o.stretch        ?? 100) << 8);"), 'pin P3: stretch<<8 ZACHOWANY (oryginalny bug Mudleta — zgodnosc bajtowa, nikomu nie poprawiac)');
  ok(NEW.includes("if (byteLen === 0 || byteLen === 0xFFFFFFFF) return '';"), 'pin: readQString null-QString obsluzony');
  const dragGuards = NEW.split('\n').filter(l => l.includes('if (wpLocked) return;'));
  ok(dragGuards.length === 3, 'pin S5: guard wpLocked we wszystkich 3 handlerach panelu (2x drag + resize) [actual=' + dragGuards.length + ']');
  const bareLS = NEW.split('\n').filter(l => l.includes('localStorage.removeItem') && !l.includes('try') && !l.includes('catch'));
  ok(bareLS.length === 0, 'pin S6: zero golego localStorage.removeItem (6 miejsc owinietych)');
  ok(!NEW.includes('if (targetId === -1)'), 'pin Q5: martwy guard -1 usuniety');
  ok(NEW.includes('const _DELTA_MAX_DEPTH = 60;'), 'pin S8: limit glebokosci skanera kalki');
  const s7 = (NEW.split('audyt T4/S7').length - 1);
  ok(s7 >= 8, 'pin S7: hadContainer we wszystkich sciezkach CL [actual=' + s7 + ']');
  // pin P1 (S4): NADPISANY decyzja F2.15 (Arc 31, v1.48.3) — domyslnie paritet z Mudletem
  // (locked nieosiagalny tez jako CEL), przelacznik „Omijaj zablokowane pokoje" → OFF = permissive.
  // Dawniej: locked-cel dozwolony (break przed locked). Piny behawioralne: audit_ext A2.15.
  // N6 (Arc 32, v1.49.0): pop-guard z wyjatkiem STARTU (cur !== fromId) — zablokowany
  // start nie ucina trasy u zrodla; relaksacja do locked bez zmian. Piny: transport A3.9.
  const dij = extract(NEW, 'function dijkstraPath(fromId, toId) {');
  ok(dij.indexOf('if (room.locked && wpState.avoidLocked && cur !== fromId) continue;') >= 0
    && dij.indexOf('if (room.locked && wpState.avoidLocked && cur !== fromId) continue;') < dij.indexOf('if (cur === toId) break;')
    && dij.includes('if (wpState.avoidLocked && nbr.locked) continue;'),
    'pin P1: F2.15 — guard locked (ON=paritet Mudlet) PRZED breakiem + przy relaksacji; OFF=permissive; N6: wyjatek startu');
  // piny wersji
  ok(NEW.includes("const APP_VERSION = 'v1.49.1';"), 'pin: APP_VERSION v1.49.1');
  const deltaSrc = fs.readFileSync(path.join(ROOT, 'tests', 'delta.js'), 'utf8');
  ok(deltaSrc.split('v1.49.1').length - 1 === 10, 'pin: delta.js 10x v1.49.1');
  const t2 = fs.readFileSync(path.join(ROOT, 'tests', 'tier2_state.js'), 'utf8');
  ok(t2.includes("wersja: v1.49.1"), 'pin: tier2_state.js v1.49.1');
  const t3 = fs.readFileSync(path.join(ROOT, 'tests', 'tier3_format.js'), 'utf8');
  ok(t3.includes("pin: APP_VERSION v1.49.1"), 'pin: tier3_format.js v1.49.1');
}

// ═══ T10: bramka — wlasne kalki zawsze z sid (K7 nie zabija wlasnych eksportow) ═══
console.log('── T10: buildDelta → sid + walidator ──');
{
  const ctx = makeDeltaCtx();
  ctx.state.deltaLog.push(
    { type: 'ADD_AREA', areaId: 50, areaData: { id: 50, name: 'Nowa', rooms: [], labels: [] }, label: 'a' },
    { type: 'ADD_ROOM', roomId: 500, areaId: 50, roomData: { id: 500, area: 50, x: 3, y: 3, z: 0, name: 'A', env: 262, weight: 1, exits: {}, special_exits: {}, custom_lines: {}, stubs: [], exit_locks: [], exit_weights: {}, doors: {}, user_data: {} }, label: 'r' },
    { type: 'ADD_LABEL', areaId: 50, snapshot: { id: 1, text: 'Ety', x: 1, y: 1, z: 0, width: 4, height: 1.2 }, label: 'l' }
  );
  const txt = ctx.api.buildDelta();
  const d = JSON.parse(txt);
  const adds = d.ops.filter(o => o.type.startsWith('ADD_'));
  ok(adds.length === 3, 'bramka: 3 opy ADD w eksporcie');
  ok(d.ops.find(o => o.type === 'ADD_AREA').target.areaId.match(/^d:/), 'bramka K7: ADD_AREA z sid');
  ok(d.ops.find(o => o.type === 'ADD_ROOM').target.roomId.match(/^d:/), 'bramka K7: ADD_ROOM z sid');
  ok(String(d.ops.find(o => o.type === 'ADD_LABEL').payload.label.id).match(/^d:/), 'bramka K7: ADD_LABEL z sid');
  const rv = ctx.api.validateDeltaText(txt);
  ok(rv.ok === true, 'bramka K6/K7: wlasna kalka przechodzi zaostrzony walidator' + (rv.ok ? '' : ' :: ' + rv.errors[0]));
}

console.log('');
console.log(fail === 0 ? '═══ tier4_hardening: ' + pass + ' OK, 0 FAIL ═══' : '═══ tier4_hardening: ' + pass + ' OK, ' + fail + ' FAIL ═══');
process.exit(fail === 0 ? 0 : 1);
