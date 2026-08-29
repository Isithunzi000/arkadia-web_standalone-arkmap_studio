// Harness — converters_crc: zbieżność CRC na ścieżce .dat → .arkmap → applyMap → zapis.
// Fundament pod base.crc formatu .arkdelta: base.crc liczone po wczytaniu mapy musi być
// identyczne z CRC pliku, z którego mapa pochodzi (spec S4: „CRC przy load, nie przy eksporcie").
// Konwerter tools/dat2arkmap.mjs ekstrahuje kod z arkmap_studio.html, więc ścieżka CLI
// i przeglądarkowa to ten sam kod — ten harness pilnuje, żeby round-trip przez applyMap
// był bajtowo stabilny (determinizm tożsamości bazy).
// Uruchamianie z katalogu głównego repo. Wymaga fixture (tests/fetch-fixture.sh).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const TOOL = path.join(ROOT, 'tools', 'dat2arkmap.mjs');

const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) {
  console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
  process.exit(2);
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Ekstrakcja bloków z arkmap_studio.html (technika jak w dat2arkmap.mjs) ──
function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica: ' + a);
  return HTML.slice(i, j);
}
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
if (HTML.indexOf('function applyMap(map) {') !== HTML.lastIndexOf('function applyMap(map) {'))
  throw new Error('kotwica nieunikalna: applyMap');

const pipeCode =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  block('function stableStringify(val, indent, _lvl) {', 'function saveArkmapAs()') + '\n' +
  block('function _canonicalizeMapForSave(map) {', 'function _arkmapSuggestedName() {') + '\n' +
  extract(HTML, 'function applyMap(map) {') + '\n' +
  'return { verifyChecksums, _prepareArkmapForSave, _serializeMap, applyMap };';

function makeCtx() {
  const state = { map: null, areas: new Map(), roomById: {}, roomArea: {}, colorCache: {}, filename: 'x.arkmap', z: 0 };
  const dummyEl = () => ({
    classList: { remove() {}, add() {}, toggle() {} },
    disabled: false, innerHTML: '', style: {}, title: '', textContent: '', dataset: {},
  });
  const documentStub = { getElementById: () => dummyEl(), querySelector: () => null };
  const localStorageStub = { removeItem() {}, getItem: () => null, setItem() {} };
  const fn = new Function(
    'state', 'document', 'localStorage', 'searchIn', 'btnSaveArkmap', 'btnSaveDat', 'btnSaveAs2',
    'buildColorCache', 'buildAreaList', '_recomputeAstarParams', 'selectArea', 'escHtml',
    'rebuildLegend',
    '_pixmapCache', '_hopViaCache',
    pipeCode
  );
  const api = fn(
    state, documentStub, localStorageStub, dummyEl(), dummyEl(), dummyEl(), dummyEl(),
    () => { state.colorCache = {}; }, () => {}, () => {}, () => {}, (s) => String(s),
    () => {},
    new Map(), new Map()
  );
  return { state, api };
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'converters_crc-'));
const TEST_VER = '0.205.0';
const TEST_SHA = '0123456789abcdef0123456789abcdef01234567';

function runTool(out) {
  return spawnSync('node', [TOOL, FIX, out, '--version', TEST_VER, '--revision', TEST_SHA], { encoding: 'utf8' });
}

// ── T1: determinizm konwersji CLI ───────────────────────────────────────────
console.log('— T1: determinizm konwersji .dat → .arkmap —');
const out1 = path.join(TMP, 'a.arkmap');
const out2 = path.join(TMP, 'b.arkmap');
{
  const r1 = runTool(out1);
  ok(r1.status === 0, 'konwersja fixture: kod 0');
  const r2 = runTool(out2);
  ok(r2.status === 0, 'konwersja fixture (powtórzona): kod 0');
  const b1 = fs.readFileSync(out1, 'utf8');
  const b2 = fs.readFileSync(out2, 'utf8');
  ok(b1 === b2, 'dwa przebiegi z tymi samymi flagami → bajtowo identyczny plik');
  const parsed = JSON.parse(b1);
  ok(parsed.meta.user_data.version === TEST_VER && parsed.meta.user_data.revision === TEST_SHA,
    'wtrysk version/revision obecny w meta.user_data');
}

// ── T2: round-trip przez applyMap — bajtowa stabilność ─────────────────────
console.log('— T2: round-trip .arkmap → applyMap → _serializeMap —');
{
  const original = fs.readFileSync(out1, 'utf8');
  const { state, api } = makeCtx();
  let threw = null;
  try { api.applyMap(JSON.parse(original)); } catch (e) { threw = e; }
  ok(!threw, 'applyMap na sparsowanym .arkmap nie rzuca (stubbed DOM)' + (threw ? ': ' + threw.message : ''));
  ok(state.map && Array.isArray(state.map.areas) && Object.keys(state.roomById).length > 0,
    'applyMap wypełnia state.map / roomById / areas');
  api._prepareArkmapForSave();
  const round = api._serializeMap();
  ok(round === original, 're-serializacja po wczytaniu bajtowo identyczna z plikiem (base.crc stabilny)');
  const crcOrig = JSON.parse(original).checksums.file;
  const crcRound = JSON.parse(round).checksums.file;
  ok(crcOrig === crcRound, 'checksums.file (top-level) przed i po round-tripie identyczne');
}

// ── T3: checksumy weryfikowalne po round-tripie ────────────────────────────
console.log('— T3: verifyChecksums na wyniku round-tripu —');
{
  const { state, api } = makeCtx();
  api.applyMap(JSON.parse(fs.readFileSync(out1, 'utf8')));
  api._prepareArkmapForSave();
  const round = JSON.parse(api._serializeMap());
  const v = api.verifyChecksums(round);
  ok(v.present === true, 'checksums obecne po round-tripie');
  ok(v.ok === true && v.fileOk === true && v.badAreas.length === 0 && v.badRooms.length === 0,
    'verifyChecksums: plik/obszary/pokoje zgodne po round-tripie');
}

// ── T4: zmiana treści zmienia CRC (czułość tożsamości bazy) ────────────────
console.log('— T4: czułość CRC na zmianę mapy —');
{
  const { state, api } = makeCtx();
  api.applyMap(JSON.parse(fs.readFileSync(out1, 'utf8')));
  const crcBefore = (() => { api._prepareArkmapForSave(); return JSON.parse(api._serializeMap()).checksums.file; })();
  const anyRoom = state.map.areas.find(a => a.rooms.length > 0).rooms[0];
  anyRoom.name = anyRoom.name + 'X';
  const crcAfter = (() => { api._prepareArkmapForSave(); return JSON.parse(api._serializeMap()).checksums.file; })();
  ok(crcBefore !== crcAfter, 'zmiana nazwy pokoju → inne checksums.file (delta odróżni bazę)');
}

console.log('');
console.log('converters_crc: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
