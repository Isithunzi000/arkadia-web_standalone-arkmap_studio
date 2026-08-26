#!/usr/bin/env node
// bench_kalka.js — stress kalki .arkdelta w Node (Arc 37, PRACA 11).
// Mierzy pelny pipeline generatora kalki z diffu map, dokladnie jak w apce
// (call-site dlg-kalka-diff): _computeBaseInfo(src) -> diffMaps(src, dst)
// -> buildDelta(entries, base). Scenariusz: realny fixture (map_master3.dat)
// + deterministyczny (LCG) zestaw ~7 tys. edycji rozproszonych po mapie.
//
// Narzedzie pomiarowe — NIE zmienia aplikacji i NIE wchodzi w zarejestrowane
// kryteria stress (CRASH/LOAD/JANK/MEM). Ekstrakcja verbatim jak diff_kalka.js.
//
// Uzycie:  node --expose-gc tests/perf/bench_kalka.js <out_dir> [N]
// Wyjscie: <out_dir>/results_kalka.json + podsumowanie na stdout
// Metodologia: warm-up 2 (odrzucane), N przebiegow (domyslnie 10), GC miedzy
// przebiegami, statystyki min/med/p95/max per faza + total.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) fail('kotwica bloku: ' + JSON.stringify(a));
  return HTML.slice(i, j);
}
function extract(anchor) {
  const i = HTML.indexOf(anchor);
  if (i < 0) fail('kotwica: ' + anchor);
  let d = 0; const j = HTML.indexOf('{', i);
  for (let k = j; k < HTML.length; k++) {
    if (HTML[k] === '{') d++;
    else if (HTML[k] === '}') { d--; if (d === 0) return HTML.slice(i, k + 1); }
  }
  fail('niezbalansowane klamry: ' + anchor);
}

// Unia przepisow: bench_parse.js (parse fixture) + diff_kalka.js (silnik kalki).
// VALID_DIRS definiuje blok validate.js — NIE doklejac kopii jak w diff_kalka.
const deltaCode =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── validate.js ──', '// ── checksum.js ──') + '\n' +
  block('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  block('// ── mudlet_dat.js ──', '// ── dat-to-arkmap.js ──') + '\n' +
  block('// ── dat-to-arkmap.js ──', '// ── arkmap-to-dat.js ──') + '\n' +
  block('const ANSI_PAL = buildAnsiPal();', 'function buildColorCache') + '\n' +
  extract('function _stripRoomDefaults(room) {') + '\n' +
  extract('function stableStringify(val, indent, _lvl) {') + '\n' +
  extract('function pushUndo(entry) {') + '\n' +
  extract('function _replaceRoomData(room, snapshot) {') + '\n' +
  extract('function _dispatchRedo(entry) {') + '\n' +
  block('// === ARKDELTA START ===', '// ── UI: dialog + wiring') + '\n' +
  'function _deltaCardHide() {}\n' +
  extract('function _arkdeltaBaseNote(base) {') + '\n' +
  extract('function _deltaBaseCheck(base) {') + '\n' +
  '\n;return { pushUndo, _computeBaseInfo, _deltaStripRoom, buildDelta, validateDeltaText, applyDelta, classifyDelta, _arkdeltaBaseNote, _deltaBaseCheck, _deltaChecksums, stableStringify, addChecksums, diffMaps, _diffCanonRoom, _diffEq, _deltaIsSuppressor,'
  + '\n  _deltaBuildOcc, _deltaTakenCells, _deltaFindFreeCell, _deltaPlaceCtx, _deltaCellFree, _deltaApplyOverridesToOps, _deltaGhostGeoms, _deltaGhostReset,'
  + '\n  get ghosts() { return _deltaGhosts; }, set ghosts(v) { _deltaGhosts = v; },'
  + '\n  get overrides() { return _deltaOverrides; }, set overrides(v) { _deltaOverrides = v; },'
  + '\n  get placing() { return _deltaPlacing; }, set placing(v) { _deltaPlacing = v; },'
  + '\n  get hover() { return _deltaHover; }, set hover(v) { _deltaHover = v; },'
  + '\n  datToArkmap };';

function makeCtx() {
  const state = {
    map: null,
    areas: new Map(), roomById: {}, roomArea: {},
    undoStack: [], redoStack: [], deltaLog: [], dirty: false,
    filename: 'bench.arkmap', z: 0, editMode: true, selected: null, selectedLabel: null, baseInfo: null,
  };
  const fn = new Function(
    'state', '_dispatchUndo', 'updateUndoRedoUI', 'draw', 'toast', 'plPl', 'document',
    'download', 'escHtml', 'APP_VERSION',
    'deleteRoom', 'commitDeleteArea', 'commitMoveRoomToArea', 'commitAddExit', 'commitMoveRoom', 'commitDeleteExit',
    'buildRoomsZ', 'buildAreaList', 'buildColorCache', 'refreshLabelList', 'populateEditForm', 'selectArea',
    deltaCode
  );
  const api = fn(state, () => {}, () => {}, () => {}, () => {}, (n, one) => n + ' ' + one,
    { getElementById: () => null },
    () => {}, (x) => String(x), 'v-bench-kalka',
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
  return { state, api };
}

// ── fixture ──
const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) fail('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');

const ctx0 = makeCtx();
const DAT = fs.readFileSync(FIX);
const buf = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
const srcMap = ctx0.api.datToArkmap(buf);

// ── scenariusz edycji (deterministyczny LCG — ten sam zestaw w kazdym przebiegu) ──
let seed = 0x5eed;
const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const dstMap = JSON.parse(JSON.stringify(srcMap));
const edits = { move: 2000, rename: 2000, paint: 2000, del: 500, add: 500, delExit: 500, addCL: 300, label: 100 };
{
  const flat = [];
  for (const a of dstMap.areas) for (const r of (a.rooms || [])) flat.push({ a, r });
  if (flat.length < edits.move + edits.del) fail('fixture za maly dla scenariusza (pokoi: ' + flat.length + ')');

  // przesuniecia / rename / paint — na roznych pokojach (bez usuwania)
  const used = new Set();
  const pickFresh = () => { let i; do { i = Math.floor(rnd() * flat.length); } while (used.has(i)); used.add(i); return flat[i].r; };
  for (let k = 0; k < edits.move; k++)   { const r = pickFresh(); r.x += 1; }
  for (let k = 0; k < edits.rename; k++) { const r = pickFresh(); r.name = (r.name || '') + ' x'; }
  for (let k = 0; k < edits.paint; k++)  { const r = pickFresh(); r.env = ((r.env || 0) + 1) % 300; }
  for (let k = 0; k < edits.delExit; k++) {
    const r = pick(flat).r;
    const ks = r.exits ? Object.keys(r.exits) : [];
    if (ks.length) delete r.exits[ks[0]];
  }
  for (let k = 0; k < edits.addCL; k++) {
    const r = pick(flat).r;
    const ks = r.exits ? Object.keys(r.exits) : [];
    if (ks.length) { r.custom_lines = r.custom_lines || {}; r.custom_lines[ks[0]] = { points: [[0, 0], [1, 1]] }; }
  }
  // usuniecia — od konca po indeksach pokoi w obszarach
  const delCands = flat.slice(0, 4000);
  for (let k = 0; k < edits.del; k++) {
    const c = pick(delCands);
    const idx = c.a.rooms.indexOf(c.r);
    if (idx >= 0) c.a.rooms.splice(idx, 1);
  }
  // dodatki — klon z nowym id w obszarze wzorca
  let maxId = 0;
  for (const { r } of flat) if (r.id > maxId) maxId = r.id;
  for (let k = 0; k < edits.add; k++) {
    const c = pick(flat);
    const nr = JSON.parse(JSON.stringify(c.r));
    nr.id = ++maxId; nr.x += 2; nr.y += 2; nr.exits = {}; delete nr.custom_lines;
    c.a.rooms.push(nr);
  }
  // etykiety: edit/delete/add po obszarach z etykietami
  const withLabels = dstMap.areas.filter(a => (a.labels || []).length > 0);
  let lid = 1000000;
  for (let k = 0; k < edits.label && withLabels.length; k++) {
    const a = pick(withLabels);
    const mode = k % 3;
    if (mode === 0 && a.labels.length) a.labels[0].text = (a.labels[0].text || '') + ' ~';
    else if (mode === 1 && a.labels.length > 1) a.labels.splice(1, 1);
    else a.labels.push({ id: ++lid, text: 'bench ' + k, x: 0, y: 0, z: 0, width: 2, height: 1 });
  }
}

// ── pomiar ──
const OUT_DIR = process.argv[2] || path.join(__dirname, 'out');
const N = parseInt(process.argv[3] || '10', 10);
const WARM = 2;
if (typeof global.gc !== 'function') fail('uruchom z --expose-gc (GC miedzy przebiegami)');
fs.mkdirSync(OUT_DIR, { recursive: true });

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: +s[0].toFixed(1), med: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}

const tBase = [], tDiff = [], tBuild = [], tTotal = [];
let entriesN = -1, overlap = -1, bytes = -1;
const heapBefore = process.memoryUsage().heapUsed;

for (let run = 0; run < WARM + N; run++) {
  global.gc();
  const ctx = makeCtx();           // swiezy kontekst — silnik kalki trzyma stan modulowy
  const t0 = performance.now();
  const base = ctx.api._computeBaseInfo(srcMap);
  const t1 = performance.now();
  const r = ctx.api.diffMaps(srcMap, dstMap);
  const t2 = performance.now();
  // Arc 37 fala E (R3): asercja ksztaltu wyniku PRZED buildDelta — poza oknami tDiff/tBuild;
  // bez niej blad API ujawilby sie dopiero krachem/straznikiem determinizmu z mylacym komunikatem.
  if (!r || !Array.isArray(r.entries)) fail('diffMaps zwrocilo niepoprawny wynik (brak entries) — przebieg ' + run);
  const text = ctx.api.buildDelta(r.entries, base);
  const t3 = performance.now();
  if (run >= WARM) { tBase.push(t1 - t0); tDiff.push(t2 - t1); tBuild.push(t3 - t2); tTotal.push(t3 - t0); }
  // determinizm: identyczny rozmiar wyniku w kazdym przebiegu
  if (entriesN === -1) { entriesN = r.entries.length; overlap = r.overlap; bytes = text.length; }
  else if (r.entries.length !== entriesN || text.length !== bytes) {
    fail('NIEDETERMINIZM: przebieg ' + run + ' — entries ' + r.entries.length + '/' + entriesN + ', bytes ' + text.length + '/' + bytes);
  }
}
const heapAfter = process.memoryUsage().heapUsed;

const roomsTotal = srcMap.areas.reduce((s, a) => s + (a.rooms || []).length, 0);
const appv = (HTML.match(/APP_VERSION = '([^']*)'/) || [])[1] || '?';
const out = {
  tool: 'bench_kalka', app_version: appv, fixture: 'map_master3.dat',
  map: { rooms: roomsTotal, areas: srcMap.areas.length },
  edits, result: { entries: entriesN, overlap: +overlap.toFixed(4), delta_bytes: bytes },
  runs: { base: stats(tBase), diff: stats(tDiff), build: stats(tBuild), total: stats(tTotal) },
  heap_delta_mb: +((heapAfter - heapBefore) / 1048576).toFixed(1),
};
fs.writeFileSync(path.join(OUT_DIR, 'results_kalka.json'), JSON.stringify(out, null, 1) + '\n');

console.log('== bench_kalka — stress kalki (Arc 37, PRACA 11) ==');
console.log('mapa: ' + roomsTotal + ' pokoi, ' + srcMap.areas.length + ' obszarow | edycje: '
  + Object.entries(edits).map(([k, v]) => k + '=' + v).join(' '));
console.log('wynik: ' + entriesN + ' opow, overlap ' + overlap.toFixed(4) + ', kalka ' + bytes + ' B');
for (const [label, s] of [['baseInfo', out.runs.base], ['diffMaps', out.runs.diff], ['buildDelta', out.runs.build], ['TOTAL', out.runs.total]]) {
  console.log(label.padEnd(10) + ' med ' + String(s.med).padStart(7) + ' ms | p95 ' + String(s.p95).padStart(7)
    + ' | min ' + s.min + ' | max ' + s.max + '  (n=' + s.n + ')');
}
console.log('zapisano ' + path.join(OUT_DIR, 'results_kalka.json'));
