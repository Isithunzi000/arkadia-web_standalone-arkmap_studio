// Harness — diff_kalka.js: generator kalki z diffu map (F1).
// Sekcje: D1 podstawy (pusta kalka, determinizm, phantom-defaults, overlap),
// D2 klasyfikacja zmian do pelnego slownika opow, D3 kolejnosc emisji,
// D4 round-trip (buildDelta → validate → classify na zrodle), D5 piny UI.
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
for (const a of ['function _stripRoomDefaults(room) {', 'function stableStringify(val, indent, _lvl) {',
                 'function _replaceRoomData(room, snapshot) {', 'function _dispatchRedo(entry) {',
                 'function _arkdeltaBaseNote(base) {', 'function _deltaBaseCheck(base) {',
                 'function diffMaps(srcMap, dstMap) {',
                 '// ── constants.js ──', '// ── validate.js ──',
                 '// ── checksum.js ──', '// ── mudlet_dat.js ──',
                 '// === ARKDELTA START ===', '// ── UI: dialog + wiring']) {
  if (HTML.indexOf(a) !== HTML.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}
const deltaCode =
  blockSlice(HTML, '// ── constants.js ──', '// ── validate.js ──') + '\n' +
  'const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT));\n' +
  extract(HTML, 'function _stripRoomDefaults(room) {') + '\n' +
  blockSlice(HTML, '// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  extract(HTML, 'function stableStringify(val, indent, _lvl) {') + '\n' +
  extract(HTML, 'function pushUndo(entry) {') + '\n' +
  extract(HTML, 'function _replaceRoomData(room, snapshot) {') + '\n' +
  extract(HTML, 'function _dispatchRedo(entry) {') + '\n' +
  blockSlice(HTML, '// === ARKDELTA START ===', '// ── UI: dialog + wiring') + '\n' +
  'function _deltaCardHide() {}\n' +
  extract(HTML, 'function _arkdeltaBaseNote(base) {') + '\n' +
  extract(HTML, 'function _deltaBaseCheck(base) {') + '\n' +
  '\n;return { pushUndo, _computeBaseInfo, _deltaStripRoom, buildDelta, validateDeltaText, applyDelta, classifyDelta, _arkdeltaBaseNote, _deltaBaseCheck, _deltaChecksums, stableStringify, addChecksums, diffMaps, _diffCanonRoom, _diffEq, _deltaIsSuppressor,'
  + '\n  _deltaBuildOcc, _deltaTakenCells, _deltaFindFreeCell, _deltaPlaceCtx, _deltaCellFree, _deltaApplyOverridesToOps, _deltaGhostGeoms, _deltaGhostReset,'
  + '\n  get ghosts() { return _deltaGhosts; }, set ghosts(v) { _deltaGhosts = v; },'
  + '\n  get overrides() { return _deltaOverrides; }, set overrides(v) { _deltaOverrides = v; },'
  + '\n  get placing() { return _deltaPlacing; }, set placing(v) { _deltaPlacing = v; },'
  + '\n  get hover() { return _deltaHover; }, set hover(v) { _deltaHover = v; } };';

function makeCtx(map) {
  const m = JSON.parse(JSON.stringify(map));
  const state = {
    map: m,
    areas: new Map(), roomById: {}, roomArea: {},
    undoStack: [], redoStack: [], deltaLog: [], dirty: false,
    filename: 'test.arkmap', z: 0, editMode: true, selected: null, selectedLabel: null, baseInfo: null,
  };
  for (const area of m.areas) {
    state.areas.set(area.id, area);
    for (const r of (area.rooms || [])) { state.roomById[r.id] = r; state.roomArea[r.id] = area.id; }
  }
  const toasts = [], downloads = [];
  const fn = new Function(
    'state', '_dispatchUndo', 'updateUndoRedoUI', 'draw', 'toast', 'plPl', 'document',
    'download', 'escHtml', 'APP_VERSION',
    'deleteRoom', 'commitDeleteArea', 'commitMoveRoomToArea', 'commitAddExit', 'commitMoveRoom', 'commitDeleteExit',
    'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'refreshLabelList', 'populateEditForm', 'selectArea',
    deltaCode
  );
  const api = fn(state, () => {}, () => {}, () => {}, (m2) => toasts.push(m2), (n, one) => n + ' ' + one,
    { getElementById: () => null },
    (name, text) => downloads.push({ name, text }), (x) => String(x), 'v1.6.0-test',
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
  return { state, api, toasts, downloads };
}

// ── fabryki map testowych ──
function mapBase() {
  return { meta: { user_data: { version: '1.0.0' } }, areas: [
    { id: 1, name: 'Area One', rooms: [
      { id: 1, x: 0, y: 0, z: 0, name: 'R1', env: 258, exits: { e: 2 } },
      { id: 2, x: 1, y: 0, z: 0, name: 'R2', env: 258, exits: { w: 1 } },
      { id: 3, x: 2, y: 0, z: 0, name: 'R3', env: 258 },
    ], labels: [{ id: 1, text: 'L1', x: 0, y: 0, z: 0, width: 4, height: 1.2 }] },
    { id: 2, name: 'Area Two', rooms: [{ id: 20, x: 5, y: 5, z: 0, name: 'R20', env: 258 }], labels: [] },
  ], colors: { custom_env_colors: {} } };
}
const clone = o => JSON.parse(JSON.stringify(o));
const types = r => r.entries.map(e => e.type);

console.log('— D1: podstawy —');
{
  const A = mapBase();
  const c = makeCtx(A);
  const r0 = c.api.diffMaps(A, clone(A));
  ok(r0.entries.length === 0, 'identyczne mapy → pusta kalka');
  ok(r0.overlap === 1, 'overlap identycznych = 1');

  const P = clone(A);  // symulacja .dat→.arkmap: defaulty explicite
  P.areas[0].rooms[0].weight = 1; P.areas[0].rooms[0].hidden = false;
  P.areas[0].rooms[1].symbol = ''; P.areas[0].rooms[1].locked = false;
  P.areas[0].rooms[2].exits = {}; P.areas[0].rooms[2].user_data = {};
  const r1 = c.api.diffMaps(A, P);
  ok(r1.entries.length === 0, 'phantom-defaults: .dat-style defaulty → pusta kalka');

  const B = clone(A);
  B.areas[0].rooms[0].x = 7;
  const c2 = makeCtx(A);
  const t1 = c2.api.buildDelta(c2.api.diffMaps(A, B).entries, c2.api._computeBaseInfo(clone(A)));
  const c3 = makeCtx(A);
  const t2 = c3.api.buildDelta(c3.api.diffMaps(A, B).entries, c3.api._computeBaseInfo(clone(A)));
  ok(t1 === t2, 'determinizm: dwa przebiegi → identyczne bajty');

  const X = { meta: {}, areas: [{ id: 90, name: 'Obca', rooms: [{ id: 900, x: 0, y: 0, z: 0, name: 'X', env: 1 }], labels: [] }] };
  const r4 = c.api.diffMaps(A, X);
  ok(r4.overlap === 0, 'overlap obcej mapy = 0 (straznik pokrewienstwa)');
  ok(r4.stats.delRoom === 4 && r4.stats.addRoom === 1, 'obca mapa: same delete+add');
}

console.log('— D2: klasyfikacja do pelnego slownika —');
{
  const A = mapBase();
  const c = makeCtx(A);

  const B1 = clone(A); B1.areas[0].rooms.push({ id: 4, x: 3, y: 0, z: 0, name: 'R4', env: 258, exits: { w: 3 } });
  let r = c.api.diffMaps(A, B1);
  ok(types(r).join(',') === 'ADD_ROOM', 'nowy pokoj → ADD_ROOM');
  ok(r.entries[0].label === 'Dodanie pokoju "R4" (#4)', 'etykieta ADD_ROOM');
  ok(r.entries[0].roomData.exits.w === 3, 'ADD_ROOM niesie wyjscia inline');

  const B2 = clone(A); B2.areas[0].rooms = B2.areas[0].rooms.filter(x => x.id !== 2);
  B2.areas[0].rooms[0].exits = {};  // w celu R1 traci wyjscie e (kaskada)
  delete B2.areas[0].rooms[0].exits;
  r = c.api.diffMaps(A, B2);
  ok(types(r).join(',') === 'DELETE_ROOM', 'usuniecie pokoju → tylko DELETE_ROOM (kaskada, bez DELETE_EXIT)');
  ok(r.entries[0].label === 'Usunięcie pokoju "R2" (#2)', 'etykieta DELETE_ROOM');

  const B3 = clone(A); B3.areas[0].rooms[2].x = 9;  // R3 na wolne pole
  r = c.api.diffMaps(A, B3);
  ok(types(r).join(',') === 'MOVE_ROOM' && r.entries[0].toX === 9, 'ruch na wolne pole → MOVE_ROOM');
  ok(r.entries[0].label === 'Przesunięcie pokoju "R3" (#3)', 'etykieta MOVE_ROOM');

  const B4 = clone(A); B4.areas[0].rooms[0].x = 2; B4.areas[0].rooms[2].x = 0;  // R1↔R3 swap
  r = c.api.diffMaps(A, B4);
  ok(types(r).join(',') === 'EDIT_ROOM,MOVE_ROOM' && r.entries[0].roomId === 1 && r.entries[1].roomId === 3,
    'swap → fallback EDIT_ROOM (nizsze id) + MOVE_ROOM');
  ok(r.entries[0].label === 'Przesunięcie pokoju "R1" (#1)', 'fallback zachowuje etykiete ruchu');

  const B5 = clone(A); B5.areas[0].rooms[0].x = 1; B5.areas[0].rooms[1].x = 2; B5.areas[0].rooms[2].x = 0; // cykl 3
  r = c.api.diffMaps(A, B5);
  ok(types(r).join(',') === 'EDIT_ROOM,MOVE_ROOM,MOVE_ROOM', 'cykl 3 pokoi → 1 fallback + 2 MOVE');

  const B6 = clone(A); B6.areas[0].rooms[0].name = 'R1x';
  r = c.api.diffMaps(A, B6);
  ok(types(r).join(',') === 'EDIT_ROOM' && r.entries[0].label === 'Edycja pokoju "R1x" (#1)', 'residual → EDIT_ROOM');

  const B7 = clone(A); B7.areas[0].rooms[2].exits = { w: 2 };  // nowe wyjscie
  r = c.api.diffMaps(A, B7);
  ok(types(r).join(',') === 'ADD_EXIT' && r.entries[0].bidirectional === false,
    'nowe wyjscie → ADD_EXIT jednokierunkowe');
  ok(r.entries[0].label === 'Dodanie wyjścia w → #2 (z #3)', 'etykieta ADD_EXIT');

  const B8 = clone(A); delete B8.areas[0].rooms[0].exits;  // R1 traci e
  r = c.api.diffMaps(A, B8);
  ok(types(r).join(',') === 'DELETE_EXIT' && r.entries[0].snap.exitId === 2, 'usuniecie wyjscia → DELETE_EXIT z exitId');
  ok(r.entries[0].label === 'Usunięcie wyjścia e z #1', 'etykieta DELETE_EXIT');

  const B9 = clone(A); B9.areas[0].rooms[0].exits.e = 3;  // retarget e: 2→3
  r = c.api.diffMaps(A, B9);
  ok(types(r).join(',') === 'DELETE_EXIT,ADD_EXIT', 'retarget wyjscia → DELETE_EXIT + ADD_EXIT');

  const B10 = clone(A); B10.areas[0].rooms[0].doors = { e: 2 };  // drzwi na istniejacym wyjsciu
  r = c.api.diffMaps(A, B10);
  ok(types(r).join(',') === 'EDIT_EXIT' && r.entries[0].label === 'Edycja wyjścia e w pokoju "R1" (#1)',
    'zmiana drzwi → EDIT_EXIT (jeden kierunek)');

  const B11 = clone(A); B11.areas[0].rooms[0].special_exits = { 'wespij': 3 };
  r = c.api.diffMaps(A, B11);
  ok(types(r).join(',') === 'EDIT_EXIT', 'special exit → EDIT_EXIT (brak ADD_SPECIAL_EXIT w slowniku)');

  const B12 = clone(A); B12.areas[0].rooms[0].env = 100; B12.areas[0].rooms[1].env = 100; B12.areas[0].rooms[2].env = 100;
  r = c.api.diffMaps(A, B12);
  ok(types(r).join(',') === 'PAINT_BATCH' && r.entries[0].changes.length === 3, 'identyczne malowanie 3 pokoi → 1 PAINT_BATCH');
  ok(r.entries[0].label === 'Malowanie — 3 pokoi', 'etykieta PAINT_BATCH');

  const B13 = clone(A); B13.areas[0].rooms[0].custom_lines = { e: { points: [[1, 2], [3, 4]], color: '#fff' } };
  r = c.api.diffMaps(A, B13);
  ok(types(r).join(',') === 'ADD_CL' && r.entries[0].label.indexOf('Dodano CL dir=e') === 0, 'nowa CL → ADD_CL');

  const B14 = clone(A); B14.areas[0].rooms[0].custom_lines = { e: { points: [] } };  // suppressor
  r = c.api.diffMaps(A, B14);
  ok(types(r).join(',') === 'ADD_CL' && r.entries[0].label.indexOf('Dodanie pustej custom line') === 0,
    'suppressor → ADD_CL z etykieta pustej custom line');

  const A15 = clone(A); A15.areas[0].rooms[0].custom_lines = { e: { points: [] } };
  const B15 = clone(A15); delete B15.areas[0].rooms[0].custom_lines;
  r = c.api.diffMaps(A15, B15);
  ok(types(r).join(',') === 'DELETE_CL' && r.entries[0].label.indexOf('Usunięcie pustej custom line') === 0,
    'usuniecie suppressora → DELETE_CL');

  const B16 = clone(A); B16.areas.push({ id: 3, name: 'Area Three', rooms: [{ id: 30, x: 0, y: 0, z: 0, name: 'R30', env: 1 }], labels: [{ id: 1, text: 'NL', x: 1, y: 1, z: 0, width: 4, height: 1.2 }] });
  r = c.api.diffMaps(A, B16);
  ok(types(r).join(',') === 'ADD_AREA,ADD_ROOM,ADD_LABEL', 'nowy obszar → ADD_AREA → ADD_ROOM → ADD_LABEL');

  const B17 = clone(A); B17.areas[1].rooms = []; // oproznij Area Two
  const A17 = clone(A); A17.areas[1].rooms = [];
  const B17b = clone(A17); B17b.areas[1].name = 'Renamed';
  r = c.api.diffMaps(A17, B17b);
  ok(types(r).join(',') === 'EDIT_AREA' && r.entries[0].label === 'Edycja obszaru "Renamed"', 'zmiana nazwy obszaru → EDIT_AREA');

  const B18 = clone(A); B18.areas = B18.areas.filter(a => a.id !== 2);
  r = c.api.diffMaps(A, B18);
  ok(types(r).join(',') === 'DELETE_ROOM,DELETE_AREA', 'kasacja obszaru → DELETE_ROOM przed DELETE_AREA');

  const B19 = clone(A); B19.areas[0].rooms[2].area = 2; // R3 → Area Two
  B19.areas[0].rooms = B19.areas[0].rooms.filter(x => x.id !== 3); B19.areas[1].rooms.push(B19.areas[0].rooms.find?.(() => false) || undefined);
  B19.areas[1].rooms = B19.areas[1].rooms.filter(Boolean);
  { const r3 = clone(A.areas[0].rooms[2]); r3.area = 2; B19.areas[1].rooms.push(r3); }
  r = c.api.diffMaps(A, B19);
  ok(types(r).join(',') === 'MOVE_ROOM_TO_AREA' && r.entries[0].fromAreaId === 1 && r.entries[0].toAreaId === 2,
    'zmiana obszaru → MOVE_ROOM_TO_AREA');

  const B20 = clone(A); B20.colors.custom_env_colors = { '258': [10, 20, 30] };
  r = c.api.diffMaps(A, B20);
  ok(types(r).join(',') === 'EDIT_ENV_COLOR' && r.entries[0].label === 'Zmiana koloru env 258 → rgb(10,20,30)',
    'nowy kolor env → EDIT_ENV_COLOR');

  const A21 = clone(A); A21.colors.custom_env_colors = { '258': [10, 20, 30] };
  const B21 = clone(A21); delete B21.colors.custom_env_colors['258'];
  r = c.api.diffMaps(A21, B21);
  ok(types(r).join(',') === 'EDIT_ENV_COLOR' && r.entries[0].newColor === null && r.entries[0].label === 'Przywróć domyślny kolor env 258',
    'usuniecie koloru env → EDIT_ENV_COLOR z newColor null');

  const B22 = clone(A); B22.areas[0].labels[0].x = 5;
  r = c.api.diffMaps(A, B22);
  ok(types(r).join(',') === 'MOVE_LABEL', 'przesuniecie etykiety → MOVE_LABEL');

  const B23 = clone(A); B23.areas[0].labels[0].width = 8;
  r = c.api.diffMaps(A, B23);
  ok(types(r).join(',') === 'RESIZE_LABEL' && r.entries[0].toW === 8, 'zmiana rozmiaru etykiety → RESIZE_LABEL');

  const B24 = clone(A); B24.areas[0].labels[0].text = 'L1x';
  r = c.api.diffMaps(A, B24);
  ok(types(r).join(',') === 'EDIT_LABEL' && r.entries[0].label === 'Edycja etykiety "L1x" (#1)', 'zmiana tekstu etykiety → EDIT_LABEL');

  const B25 = clone(A); B25.areas[0].labels = [];
  r = c.api.diffMaps(A, B25);
  ok(types(r).join(',') === 'DELETE_LABEL', 'usuniecie etykiety → DELETE_LABEL');
}

console.log('— D3: kolejnosc emisji (topologiczna) —');
{
  const A = mapBase();
  const c = makeCtx(A);
  const B = clone(A);
  B.areas.push({ id: 3, name: 'New', rooms: [{ id: 30, x: 0, y: 0, z: 0, name: 'N1', env: 1 }], labels: [] });
  B.areas[1].rooms = []; B.areas = B.areas.filter(a => a.id !== 2);        // kasacja Area Two
  B.areas[0].rooms[2].x = 9;                                              // ruch R3
  B.areas[0].rooms[0].name = 'R1x';                                       // residual R1
  B.areas[0].rooms[1].env = 100;                                          // paint R2
  B.areas[0].labels = [];                                                 // delete etykiety
  r = c.api.diffMaps(A, B);
  ok(types(r).join(',') === 'ADD_AREA,ADD_ROOM,DELETE_ROOM,MOVE_ROOM,EDIT_ROOM,PAINT_BATCH,DELETE_LABEL,DELETE_AREA',
    'kolejnosc: addArea → addRoom → delRoom → move → edit → paint → label → delArea');
}

console.log('— D4: round-trip (buildDelta → validate → classify na zrodle) —');
{
  const A = mapBase();
  const c = makeCtx(A);
  const B = clone(A);
  B.areas.push({ id: 3, name: 'New', rooms: [{ id: 30, x: 0, y: 0, z: 0, name: 'N1', env: 1, exits: { w: 1 } }], labels: [{ id: 1, text: 'NL', x: 1, y: 1, z: 0, width: 4, height: 1.2 }] });
  B.areas[0].rooms[0].exits.e = 30;                                       // retarget do nowego pokoju
  B.areas[0].rooms[2].x = 9;                                              // ruch
  B.areas[0].rooms[1].name = 'R2x';                                       // residual
  B.areas[0].rooms[2].env = 100;                                          // paint + ruch (mieszane granularnie)
  B.colors.custom_env_colors = { '258': [1, 2, 3] };
  const r = c.api.diffMaps(A, B);
  const text = c.api.buildDelta(r.entries, c.api._computeBaseInfo(clone(A)));
  const val = c.api.validateDeltaText(text);
  ok(val.ok, 'zlozony scenariusz: kalka przechodzi walidacje');
  const cls = c.api.classifyDelta(val.delta);
  const bad = cls.filter(it => it.cls === 'hard' || it.cls === 'impossible');
  ok(bad.length === 0, 'classify na zrodle: zero hard/impossible (' + cls.map(i => i.cls).join(',') + ')'
    + (bad.length ? ' || ' + bad.map(b => b.type + ' seq=' + b.seq + ': ' + b.note).join(' ;; ') : ''));
  const again = c.api.buildDelta(c.api.diffMaps(A, B).entries, c.api._computeBaseInfo(clone(A)));
  ok(again === text, 'round-trip deterministyczny');
}

console.log('— D5: piny UI (standalone, D7) —');
{
  ok(HTML.indexOf('<button id="btn-diff-kalka" style="margin-top:6px">⇄ Stwórz kalkę mapy&hellip;</button>') !== -1,
    'przycisk Stworz kalke mapy pod Wczytaj .arkdelta');
  ok(!/<button id="btn-diff-kalka"[^>]*disabled/.test(HTML), 'przycisk NIE jest disabled (zawsze aktywny)');
  const iBtn = HTML.indexOf('btn-diff-kalka');
  const iLoad = HTML.indexOf('btn-load-arkdelta');
  ok(iLoad !== -1 && iBtn > iLoad && iBtn < iLoad + 400, 'przycisk bezposrednio pod Wczytaj .arkdelta');
  for (const id of ['id="dlg-kalka"', 'id="dk-create"', 'id="dk-save"', 'id="dk-status-src"', 'id="dk-status-dst"',
                    'id="dk-warn"', 'id="dk-summary"', 'id="dk-fi-src"', 'id="dk-fi-dst"',
                    'id="dk-src-online"', 'id="dk-dst-online"', 'id="dk-fmt-src"', 'id="dk-fmt-dst"'])
    ok(HTML.indexOf(id) !== -1, 'markup: ' + id);
  const dkBox = HTML.slice(HTML.indexOf('id="dlg-kalka"'), HTML.indexOf('id="dk-cards"'));
  ok(/class="dlg-box" style="width:740px"/.test(dkBox), 'dlg-kalka: szerokosc 740px (nie max-width — bug 420px)');
  ok(dkBox.indexOf('max-width') === -1, 'dlg-kalka: brak max-width na boksie (chroni klasowe 90vw)');
  ok(HTML.indexOf('<button id="dk-create" class="btn-primary" disabled>Stwórz kalkę</button>') !== -1,
    'dk-create startowo disabled (czeka na obie mapy)');
  ok(HTML.indexOf("openDialog('dlg-kalka')") !== -1, 'wiring: otwarcie dialogu');
  ok(HTML.indexOf("document.getElementById('dk-create').addEventListener('click', kalkaCreate)") !== -1, 'wiring: kalkaCreate');
  ok(HTML.indexOf("document.getElementById('dk-save').addEventListener('click', kalkaSave)") !== -1, 'wiring: kalkaSave');
  ok(HTML.indexOf('_kalkaLoadFile(side, f)') !== -1, 'wiring: loadery z pliku');
  ok(HTML.indexOf('_kalkaOnlineLoad(b.dataset.side, b.dataset.fmt)') !== -1, 'wiring: loadery online');
  ok(HTML.indexOf('async function olFetchFile(url, label, expectedSize, prog) {') !== -1,
    'olFetchFile: parametryzowany progress');
  ok(HTML.indexOf('const _bar = prog ? (prog.bar || null) : olConfirmBar;') !== -1,
    'olFetchFile: domyslny cel = ol-confirm (stare zachowanie)');
  ok(HTML.indexOf('function buildDelta(log, base) {') !== -1, 'buildDelta(log, base)');
  ok(HTML.indexOf('function _computeBaseInfo(map, precomputed) {') !== -1, '_computeBaseInfo(map, precomputed)');
  ok(HTML.indexOf('buildDelta(r.entries, _computeBaseInfo(_kalka.src))') !== -1, 'generator: baza z mapy zrodlowej');
  ok(HTML.indexOf('if (r.entries.length > 5000 || bytes > 8 * 1024 * 1024)') !== -1, 'pre-flight limitow walidatora');
  ok(HTML.indexOf('if (r.overlap < 0.5 && r.srcRooms > 0 && r.dstRooms > 0)') !== -1, 'straznik pokrewienstwa');
  ok(HTML.indexOf('Mapy są identyczne — nie ma czego zapisywać.') !== -1, 'pusta kalka → komunikat bez zapisu');
  ok(HTML.indexOf('if (!validateDeltaText(text).ok)') !== -1, 'autowalidacja przed zapisem');
}

console.log('— D6: realne wartosci w wierszach diff (Arc 35, v1.49.5) —');
{
  // Kazdy op w formacie .arkdelta (target/payload jak z buildDelta). diffRows
  // karmia: wiersz panelu, karte kliku, raport .md/.html i etykiete ducha.
  const A = mapBase();
  const c = makeCtx(A);
  const r1 = A.areas[0].rooms[0], r2 = A.areas[0].rooms[1], r3 = A.areas[0].rooms[2];
  const r20 = A.areas[1].rooms[0];
  const mkUd = (base, ud) => Object.assign({}, clone(base), { user_data: ud });
  const ops = [
    // 1: EDIT_ROOM — user_data per-klucz (pre-fix: jeden wiersz „stare"/"nowe")
    { seq: 1, type: 'EDIT_ROOM', target: { roomId: 1 },
      payload: { before: mkUd(r1, { klucz: 'a' }), after: mkUd(r1, { klucz: 'b', nowy: 5 }) } },
    // 2: EDIT_ROOM — custom_lines (N pkt) + drzwi (stany tekstowe)
    { seq: 2, type: 'EDIT_ROOM', target: { roomId: 3 },
      payload: {
        before: Object.assign({}, clone(r3), { custom_lines: { n: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }, doors: { n: 1 } }),
        after:  Object.assign({}, clone(r3), { custom_lines: { n: { points: [{ x: 0, y: 0 }] } }, doors: { n: 3 } }) } },
    // 3-7: etykiety
    { seq: 3, type: 'EDIT_LABEL', target: { areaId: 1, labelId: 1 },
      payload: { before: { id: 1, text: 'L1', x: 0, y: 0, z: 0, width: 4, height: 1.2 },
                 after:  { id: 1, text: 'L1x', x: 2, y: 0, z: 0, width: 4, height: 1.2 } } },
    { seq: 4, type: 'ADD_LABEL', target: { areaId: 1 },
      payload: { label: { id: 'd:9', text: 'NOWA', x: 3, y: 3, z: 0, width: 2, height: 1 } } },
    { seq: 5, type: 'DELETE_LABEL', target: { areaId: 1, labelId: 1 },
      payload: { label: { id: 1, text: 'L1', x: 0, y: 0, z: 0, width: 4, height: 1.2 } } },
    { seq: 6, type: 'MOVE_LABEL', target: { areaId: 1, labelId: 1 },
      payload: { fromX: 0, fromY: 0, toX: 5, toY: 6 } },
    { seq: 7, type: 'RESIZE_LABEL', target: { areaId: 1, labelId: 1 },
      payload: { fromW: 4, fromH: 1.2, fromX: 0, fromY: 0, toW: 6, toH: 2, toX: 0, toY: 0 } },
    // 8: EDIT_CL — punkty + kolor
    { seq: 8, type: 'EDIT_CL', target: { roomId: 1, dir: 'n' },
      payload: { before: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '#111', style: 'solid' },
                 after:  { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], color: '#222', style: 'solid' } } },
    // 9: EDIT_AREA — nazwa
    { seq: 9, type: 'EDIT_AREA', target: { areaId: 1 },
      payload: { name: 'Area One X', user_data: {}, beforeName: 'Area One', beforeUserData: {} } },
    // 10: DELETE_SPECIAL_EXIT — polecenie + cel
    { seq: 10, type: 'DELETE_SPECIAL_EXIT', target: { roomId: 2 },
      payload: { cmd: 'wspinacz', targetId: 3 } },
    // 11: DELETE_ROOM — nazwa + pozycja
    { seq: 11, type: 'DELETE_ROOM', target: { roomId: 20, areaId: 2 },
      payload: { room: clone(r20) } },
    // 12: EDIT_ENV_COLOR — rgb
    { seq: 12, type: 'EDIT_ENV_COLOR', target: { envId: 300 },
      payload: { oldColor: null, newColor: [10, 20, 30] } },
    // 13: PAINT_BATCH — liczba + wiersze per pokoj
    { seq: 13, type: 'PAINT_BATCH', target: {},
      payload: { changes: [
        { roomId: 1, beforeEnv: 258, beforeSymbol: '', afterEnv: 262, afterSymbol: '#' },
        { roomId: 2, beforeEnv: 258, beforeSymbol: '', afterEnv: 262, afterSymbol: '#' } ] } },
    // 14: MOVE_ROOM — typ poza zakresem PRACY 3: nadal BEZ diffRows (guard)
    { seq: 14, type: 'MOVE_ROOM', target: { roomId: 3 },
      payload: { fromX: 2, fromY: 0, fromZ: 0, toX: 9, toY: 0, toZ: 0 } },
  ];
  const cls = c.api.classifyDelta({ ops });
  const at = seq => cls.find(i => i.seq === seq);
  const rows = seq => (at(seq).diffRows || []);
  const strs = seq => rows(seq).map(r => r.str).join(' | ');

  // — EDIT_ROOM: user_data z prawdziwymi wartosciami (pin dyskryminujacy) —
  ok(rows(1).some(r => r.p === 'user_data.klucz' && r.b === 'a' && r.a === 'b'),
    'user_data: wiersz per-klucz z wartosciami a -> b || ' + strs(1));
  ok(rows(1).some(r => r.p === 'user_data.nowy' && r.b === '—' && r.a === '5'),
    'user_data: nowy klucz jako osobny wiersz');
  ok(!rows(1).some(r => r.b === 'stare' || r.a === 'nowe'),
    'user_data: ZERO literalow „stare"/"nowe" (placeholder usuniety)');

  // — EDIT_ROOM: custom line i drzwi —
  ok(rows(2).some(r => r.p === 'custom line n' && r.b === '2 pkt' && r.a === '1 pkt'),
    'custom line: podsumowanie punktow 2 pkt -> 1 pkt || ' + strs(2));
  ok(rows(2).some(r => r.p === 'drzwi n' && r.b === 'open' && r.a === 'locked'),
    'drzwi: stan tekstowy open -> locked || ' + strs(2));

  // — tabela per typ (M5b: _deltaOpExtraDiffRows podpieta w dispatch) —
  ok(strs(3).includes('tekst: „L1" → „L1x"') && strs(3).includes('pozycja (0,0,0) → (2,0,0)'),
    'EDIT_LABEL: tekst + pozycja || ' + strs(3));
  ok(strs(4).includes('+etykieta „NOWA"') && strs(4).includes('pozycja (3,3,0)'),
    'ADD_LABEL: tekst + pozycja || ' + strs(4));
  ok(strs(5).includes('−etykieta „L1"'),
    'DELETE_LABEL: tekst || ' + strs(5));
  ok(strs(6).includes('pozycja (0,0) → (5,6)'),
    'MOVE_LABEL: pozycja 2D || ' + strs(6));
  ok(strs(7).includes('rozmiar 4×1.2 → 6×2'),
    'RESIZE_LABEL: rozmiar || ' + strs(7));
  ok(strs(8).includes('punkty: 2 → 3') && strs(8).includes('kolor: #111 → #222'),
    'EDIT_CL: punkty + kolor || ' + strs(8));
  ok(strs(9).includes('nazwa: „Area One" → „Area One X"'),
    'EDIT_AREA: nazwa || ' + strs(9));
  ok(strs(10).includes('−wyjście specjalne „wspinacz"') && strs(10).includes('cel: #3'),
    'DELETE_SPECIAL_EXIT: polecenie + cel || ' + strs(10));
  ok(strs(11).includes('−pokój „R20" (#20)') && strs(11).includes('pozycja (5,5,0)'),
    'DELETE_ROOM: nazwa + pozycja || ' + strs(11));
  ok(rows(12).some(r => r.p === 'kolor env 300' && r.b === 'domyślny' && r.a === 'rgb(10,20,30)'),
    'EDIT_ENV_COLOR: domyslny -> rgb(10,20,30) || ' + strs(12));
  ok(strs(13).includes('malowanie: 2 pokoi') && strs(13).includes('#1: env 258 / „" → env 262 / „#"'),
    'PAINT_BATCH: liczba + wiersze per pokoj || ' + strs(13));

  // — guard: typy poza zakresem nadal bez diffRows —
  ok(at(14).diffRows === undefined && at(14).diff === undefined,
    'MOVE_ROOM: bez diffRows (typ poza zakresem — zachowanie nietkniete)');

  // — spojnosc: legacy it.diff === diffRows.map(str) —
  ok(cls.filter(i => i.diffRows).every(i => JSON.stringify(i.diff) === JSON.stringify(i.diffRows.map(r => r.str))),
    'kazdy item z diffRows ma zsynchronizowane legacy diff');

  // — determinizm: dwukrotna klasyfikacja daje identyczne wiersze —
  const cls2 = c.api.classifyDelta({ ops: JSON.parse(JSON.stringify(ops)) });
  ok(JSON.stringify(cls2.map(i => i.diffRows || null)) === JSON.stringify(cls.map(i => i.diffRows || null)),
    'classifyDelta x2: diffRows deterministyczne');
}

console.log('');
console.log('═══ diff_kalka: ' + pass + ' OK, ' + fail + ' FAIL ═══');
process.exit(fail ? 1 : 0);
