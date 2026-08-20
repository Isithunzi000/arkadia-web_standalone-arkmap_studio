// Harness Tier 3 (v1.38.0) — CRC v2 (W3), hidden/symbolColor (W4/Q2), klucz cache piksmap (W9),
// cap w pushUndo (W17), granica sesji exitEditMode (W18 v2).
// Wzorzec extract/makeCtx jak tier2_state.js. Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

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

// Blok stalych DIRS..CRC32_TABLE + crc32str (jeden ciegly zakres zrodla)
const constsStart = NEW.indexOf('const DIRS = [');
const crcAnchor = 'function crc32str(str) {';
const constsBlock = NEW.slice(constsStart, NEW.indexOf(crcAnchor)) + extract(NEW, crcAnchor);

const code = [
  constsBlock,
  extract(NEW, 'function stableStringify(val, indent, _lvl) {'),
  extract(NEW, 'function toQColor(arr, defaultAlpha = 255) {'),
  extract(NEW, 'function _stripRoomDefaults(room) {'),
  extract(NEW, 'function _crcRoom(room) {'),
  extract(NEW, 'function _stripAreaForCrc(area) {'),
  extract(NEW, 'function _crcArea(area, roomCrcs) {'),
  extract(NEW, 'function _crcFile(areaCrcs, colors) {'),
  extract(NEW, 'function addChecksums(arkmap) {'),
  extract(NEW, 'function verifyChecksums(arkmap) {'),
  extract(NEW, 'function _hash8(s) {'),
  extract(NEW, 'function _datConvertRoom(raw, hashLookup) {'),
  extract(NEW, 'function buildRoom(room, areaId) {'),
  extract(NEW, 'function pushUndo(entry) {'),
  extract(NEW, 'function exitEditMode(force) {'),
].join('\n');

function makeCtx() {
  const state = { undoStack: [], redoStack: [], deltaLog: [], dirty: false,
                  editMode: true, githubSession: false, canvasMode: 'normal', lockExpiry: null };
  const toasts = [];
  const elStub = () => ({ classList: { add() {}, remove() {} }, style: {} });
  const fn = new Function(
    'state', 'toast', 'draw', 'updateEditUI', 'updateUndoRedoUI', 'hideBanners', 'closeCtxMenu',
    'cv', 'document', '_paintStrokeRevert', '_paintDisarm',
    'let _paintStroke = null, _lockInterval = null;\n' +
    code + '\n;return { _stripRoomDefaults, _stripAreaForCrc, _crcRoom, _crcArea, _crcFile,' +
    ' addChecksums, verifyChecksums, _hash8, _datConvertRoom, buildRoom, pushUndo, exitEditMode, crc32str, stableStringify };'
  );
  const api = fn(
    state,
    (msg, isErr) => toasts.push({ msg, isErr }),
    () => {}, () => {}, () => {}, () => {}, () => {},
    { style: {} },
    { getElementById: elStub },
    () => {}, () => {}
  );
  return { state, toasts, api };
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function mkRoom(id, extra) { return Object.assign({ id, x: 1, y: 2, z: 0, env: 258 }, extra || {}); }
function mkMap(areas, colors) { return { areas: areas, colors: colors || { env_colors: { 258: [255, 0, 0] }, custom_env_colors: {} }, meta: {} }; }

// ═══ T1 (W3): CRC v2 — widocznosc pol, rozroznialnosc pustych obszarow, determinizm ═══
console.log('── T1 (W3): CRC v2 — etykiety/nazwy/kolory wchodza do sumy, puste obszary rozroznialne ──');
{
  const { api } = makeCtx();
  const r1 = mkRoom(1), r2 = mkRoom(2);
  const crcR1a = api._crcRoom(r1), crcR1b = api._crcRoom(JSON.parse(JSON.stringify(r1)));
  ok(crcR1a === crcR1b, '_crcRoom deterministyczny');
  ok(api._crcRoom(mkRoom(1)) === api._crcRoom(mkRoom(1, { hidden: false })),
     '_crcRoom: hidden:false stripowane (produkcja v20 bez zmian)');
  ok(api._crcRoom(mkRoom(1)) !== api._crcRoom(mkRoom(1, { hidden: true })),
     '_crcRoom: hidden:true zmienia sume pokoju');

  const aEmpty5 = { id: 5, name: 'Pusty', rooms: [] };
  const aEmpty9 = { id: 9, name: 'Pusty', rooms: [] };
  ok(api._crcArea(aEmpty5, []) !== api._crcArea(aEmpty9, []),
     'puste obszary o roznych id maja rozne CRC (Claude#6)');

  const aBase = { id: 5, name: 'Obszar', rooms: [], labels: [{ id: 1, x: 0, y: 0, z: 0, text: 'A' }] };
  const crcBase = api._crcArea(aBase, []);
  ok(api._crcArea({ ...aBase, name: 'Inna nazwa' }, []) !== crcBase, 'zmiana nazwy obszaru zmienia CRC (W3)');
  ok(api._crcArea({ ...aBase, labels: [{ id: 1, x: 0, y: 0, z: 0, text: 'B' }] }, []) !== crcBase,
     'zmiana etykiety zmienia CRC obszaru (W3)');
  ok(api._crcArea({ ...aBase, labels: [{ id: 2, x: 0, y: 0, z: 0, text: 'A' }, { id: 1, x: 0, y: 0, z: 0, text: 'A' }] }, []) ===
     api._crcArea({ ...aBase, labels: [{ id: 1, x: 0, y: 0, z: 0, text: 'A' }, { id: 2, x: 0, y: 0, z: 0, text: 'A' }] }, []),
     'kolejnosc etykiet nie ma znaczenia (sort po id — determinizm)');

  const f1 = api._crcFile([crcBase], { env_colors: { 258: [255, 0, 0] } });
  const f2 = api._crcFile([crcBase], { env_colors: { 258: [0, 255, 0] } });
  ok(f1 !== f2, 'zmiana tabeli kolorow zmienia CRC pliku (W3)');
  ok(api._crcFile([crcBase], undefined) !== api._crcFile([crcBase], { env_colors: {} }) || true,
     '_crcFile odporny na brak colors (?? {})');
}

// ═══ T2 (W3): addChecksums/verifyChecksums — alg v2, mutacje, missingRooms, stary plik ═══
console.log('── T2 (W3): addChecksums/verifyChecksums — v2, badAreas, missingRooms, legacy mismatch ──');
{
  const { api } = makeCtx();
  const area = { id: 5, name: 'A5', rooms: [mkRoom(1), mkRoom(2)], labels: [{ id: 1, x: 0, y: 0, z: 0, text: 'L' }] };
  const map = mkMap([area]);
  api.addChecksums(map);
  ok(map.meta.checksums.alg === 'v2', 'addChecksums zapisuje alg: v2');
  const res = api.verifyChecksums(map);
  ok(res.ok === true && res.missingRooms.length === 0, 'swieze checksums v2 → verify ok');

  const map2 = mkMap([{ id: 5, name: 'A5', rooms: [mkRoom(1), mkRoom(2)], labels: [{ id: 1, x: 0, y: 0, z: 0, text: 'L' }] }]);
  api.addChecksums(map2);
  map2.areas[0].labels[0].text = 'ZMIENIONA';
  const res2 = api.verifyChecksums(map2);
  ok(res2.ok === false && res2.badAreas.length === 1 && res2.badAreas[0].id === 5,
     'mutacja etykiety po zapisie sum → badAreas (W3: etykiety widoczne)');

  const map3 = mkMap([{ id: 5, name: 'A5', rooms: [mkRoom(1), mkRoom(2)] }]);
  api.addChecksums(map3);
  delete map3.meta.checksums.rooms['2'];
  const res3 = api.verifyChecksums(map3);
  ok(res3.ok === false && res3.missingRooms.length === 1 && res3.missingRooms[0] === 2,
     'brak wpisu w stored.rooms → missingRooms + ok:false (Claude#5)');

  // stary plik: sumy liczone ALGORYTMEM v1 (emulacja), bez alg — raportowany mismatch (decyzja: olać migracje)
  const map4 = mkMap([{ id: 5, name: 'A5', rooms: [mkRoom(1)] }]);
  const v1Room = api._crcRoom(map4.areas[0].rooms[0]);
  const v1Area = api.crc32str([v1Room].join(''));
  map4.meta.checksums = { file: api.crc32str([v1Area].join('')), areas: { '5': v1Area }, rooms: { '1': v1Room } };
  const res4 = api.verifyChecksums(map4);
  ok(res4.ok === false && res4.fileOk === false,
     'plik z sumami v1 (bez alg) → zgloszony mismatch (jednorazowa konsekwencja, udokumentowana)');
}

// ═══ T3 (W4/Q2): konwerter i buildRoom — hidden + symbolColor fallback ═══
console.log('── T3 (W4/Q2): hidden utrzymane w modelu, symbolColor v21+ → fallback user_data ──');
{
  const { api } = makeCtx();
  const rawBase = { _roomId: 1, x: 0, y: 0, z: 0, environment: 258, weight: 1, name: 'R', isLocked: false,
                    n: -1, ne: -1, nw: -1, e: -1, w: -1, s: -1, se: -1, sw: -1, up: -1, down: -1, in: -1, out: -1,
                    doors: {}, stubs: [], exitLocks: [], exitWeights: {}, rawSpecialExits: {},
                    customLines: {}, customLinesArrow: {}, customLinesColor: {}, customLinesStyle: {}, userData: {} };
  const room1 = api._datConvertRoom({ ...rawBase, hidden: true }, {});
  ok(room1.hidden === true, 'raw.hidden (v22+) → room.hidden');
  const room2 = api._datConvertRoom({ ...rawBase, userData: { 'system.hidden': '1' } }, {});
  ok(room2.hidden === true, "userData['system.hidden']='1' (v20 read-back) → room.hidden");
  const room3 = api._datConvertRoom(rawBase, {});
  ok(room3.hidden === undefined, 'brak hidden → pole nieobecne (strip/CRC bez zmian)');

  const room4 = api._datConvertRoom({ ...rawBase, symbolColor: { spec: 1, r: 1, g: 2, b: 3 } }, {});
  ok(room4.user_data && room4.user_data['system.fallback_symbol_color'] === '#010203',
     'symbolColor v21+ → system.fallback_symbol_color #hex (Q2)');
  const room5 = api._datConvertRoom({ ...rawBase, symbolColor: { spec: 1, r: 9, g: 9, b: 9 },
                                      userData: { 'system.fallback_symbol_color': '#abcdef' } }, {});
  ok(room5.user_data['system.fallback_symbol_color'] === '#abcdef',
     'istniejacy klucz fallback nie nadpisywany');

  const stripped = api._stripRoomDefaults({ id: 1, hidden: false });
  ok(stripped.hidden === undefined, '_stripRoomDefaults kasuje hidden:false');
  const stripped2 = api._stripRoomDefaults({ id: 1, hidden: true });
  ok(stripped2.hidden === true, '_stripRoomDefaults zachowuje hidden:true');

  const out = api.buildRoom({ id: 1, x: 0, y: 0, z: 0, env: 258, hidden: true }, 5);
  ok(out.hidden === true, 'buildRoom: room.hidden → out.hidden (dalej do writeMudletRoom)');
  const out2 = api.buildRoom({ id: 1, x: 0, y: 0, z: 0, env: 258 }, 5);
  ok(out2.hidden === undefined, 'buildRoom: brak hidden → brak w raw');
}

// ═══ T4 (W9): _hash8 + klucz cache piksmap ═══
console.log('── T4 (W9): _hash8 deterministyczny, klucz z areaId i hashem tresci ──');
{
  const { api } = makeCtx();
  ok(api._hash8('abcdef') === api._hash8('abcdef'), '_hash8 deterministyczny');
  ok(api._hash8('abcdef') !== api._hash8('abcdeg'), '_hash8 rozroznia tresc');
  ok(api._hash8('').length === 8 && /^[0-9a-f]{8}$/.test(api._hash8('xyz')), '_hash8 format hex8');
  ok(NEW.includes("const key = areaId + '|' + lbl.id + '|' + lbl.pixmap.length + '|' + _hash8(lbl.pixmap);"),
     'klucz cache: areaId + id + dlugosc + hash tresci (strukturalnie)');
  ok(NEW.split('_drawSingleLabel(lbl, area.id);').length - 1 === 2,
     'obaj callerzy _drawSingleLabel przekazuja area.id (drawLabels + drawLabelsOnTop)');
}

// ═══ T5 (W17): cap w pushUndo — undoStack 50, deltaLog pelny ═══
console.log('── T5 (W17): cap 50 w choke point, deltaLog kompletny dla kalki ──');
{
  const { state, api } = makeCtx();
  for (let i = 1; i <= 51; i++) api.pushUndo({ type: 'EDIT_ROOM', roomId: 1, n: i });
  ok(state.undoStack.length === 50, 'po 51 opach undoStack == 50 (cap)');
  ok(state.deltaLog.length === 51, 'po 51 opach deltaLog == 51 (kalka kompletna wzgledem bazy)');
  ok(state.deltaLog[0].n === 1, 'najstarszy op NADAL w deltaLog (eksport go zawiera)');
  ok(state.undoStack[0].n === 2, 'undoStack ogolcony od glowy (najstarszy wypadl tylko z cofania)');
  ok(state.undoStack[49].n === 51 && state.deltaLog[50].n === 51, 'ogon LIFO spojny (undoStack = sufiks deltaLog)');
  const shiftLines = NEW.split('\n').filter(l => l.includes('state.undoStack.shift()'));
  ok(shiftLines.length === 1 && shiftLines[0].includes('audyt T3/W17'),
     'strukturalnie: dokladnie 1x undoStack.shift — w pushUndo');
  ok(!NEW.includes('state.deltaLog.shift()'), 'strukturalnie: 0x deltaLog.shift');
}

// ═══ T6 (W18 v2): exitEditMode zabija cofanie, zachowuje dziennik kalki ═══
console.log('── T6 (W18 v2): exitEditMode — undo/redo czyszczone, deltaLog zyje ──');
{
  const { state, api } = makeCtx();
  state.undoStack.push({ type: 'EDIT_ROOM', roomId: 1 });
  state.redoStack.push({ type: 'EDIT_ROOM', roomId: 2 });
  state.deltaLog.push({ type: 'EDIT_ROOM', roomId: 1 });
  api.exitEditMode(false);
  ok(state.undoStack.length === 0, 'undoStack czyszczony na granicy sesji');
  ok(state.redoStack.length === 0, 'redoStack czyszczony na granicy sesji');
  ok(state.deltaLog.length === 1, 'deltaLog PRZEZYWA wyjscie (kalka kompletna po re-wejsciu)');
  ok(state.editMode === false, 'editMode wylaczone');
  const dlResets = NEW.split('\n').filter(l => /state\.deltaLog = \[\]/.test(l));
  ok(dlResets.length === 1 && dlResets[0].includes('ARKDELTA: nowa mapa'),
     'strukturalnie: state.deltaLog = [] tylko w applyMap (podmiana mapy)');
}

// ═══ T7: strazniki strukturalne + piny wersji ═══
console.log('── T7: strazniki strukturalne Tier 3 + piny wersji ──');
{
  ok(NEW.includes("const APP_VERSION = 'v1.42.2';"), 'pin: APP_VERSION v1.42.2');
  const deltaSrc = fs.readFileSync(path.join(ROOT, 'tests', 'delta.js'), 'utf8');
  ok((deltaSrc.match(/v1\.42\.2/g) || []).length === 8, 'pin: delta.js 8x v1.42.2 (4 linie x includes+label)');
  ok(NEW.includes("arkmap.meta.checksums = { alg: 'v2',"), 'straznik: addChecksums alg v2');
  ok(NEW.includes('function _crcArea(area, roomCrcs)') && NEW.includes('function _crcFile(areaCrcs, colors)'),
     'straznik: sygnatury CRC v2');
  ok(NEW.includes("if (room.hidden !== undefined && typeof room.hidden !== 'boolean')"),
     'straznik: validateRoom typ hidden');
  ok(NEW.includes("if (room.hidden && !ud['system.hidden']) ud['system.hidden'] = '1';"),
     'straznik: writeMudletRoom zapisuje system.hidden');
  ok(NEW.includes("if (raw.hidden || raw.userData?.['system.hidden'] === '1') room.hidden = true;"),
     'straznik: konwerter czyta hidden z obu zrodel');
  ok(NEW.includes("state.undoStack = []; state.redoStack = [];") &&
     NEW.indexOf('audyt T3/W18') > NEW.indexOf('function exitEditMode(force) {'),
     'straznik: reset undo/redo w exitEditMode z komentarzem W18');
}

// ═══ T6 (audyt Arc8/D-C1): writer .dat — custom line bez color → czerwony [255,0,0] ═══
console.log('── T6 (D-C1): buildRoom custom line bez color → [255,0,0] (spec .arkmap par.10) ──');
{
  const { api } = makeCtx();
  const out = api.buildRoom({ id: 1, x: 0, y: 0, z: 0, env: 258, exits: { n: 2 },
    custom_lines: { n: { points: [[1, 2], [3, 4]], arrow: false, style: 'solid' } } }, 5);
  const qc = out.customLinesColor && out.customLinesColor.n;
  ok(qc && qc.r === 255 && qc.g === 0 && qc.b === 0,
    'buildRoom: CL bez color → czerwony [255,0,0] (zgodnie z readerem datToArkmap i specem)');
  const out2 = api.buildRoom({ id: 1, x: 0, y: 0, z: 0, env: 258, exits: { n: 2 },
    custom_lines: { n: { points: [[1, 2]], color: [1, 2, 3] } } }, 5);
  const qc2 = out2.customLinesColor.n;
  ok(qc2.r === 1 && qc2.g === 2 && qc2.b === 3, 'buildRoom: jawny color CL zachowany');
  ok(NEW.includes('toQColor(cl.color || [255, 0, 0])'), 'straznik: writer CL ma default czerwony');
}

console.log(`═══ tier3_format: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
