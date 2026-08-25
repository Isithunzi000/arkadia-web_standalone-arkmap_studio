// Harness — perf_counters.js: straznik licznikow wydajnosci F0 (Arc 31, v1.45.3).
// Liczniki za flaga window.__PERF_COUNTERS__ — flaga off = zero wplywu na
// zachowanie (zadnego timingu, zadnych zapisow). Pinuje:
//  A. infrastrukture (_PERF, _perfOn, _perfTick) i jej guardy,
//  B. instrumentacje KAZDEJ warstwy draw() (tick po kazdym callu, stale nazwy,
//     kolejnosc, licznik draws/plane/vis za guardem if(_pc)),
//  C. licznik dekodowan pixmap w onload _getPixmapImage za guardem _perfOn(),
//  D. zachowanie bloku w Node: off => no-op (zero zapisow), on => akumulacja,
//  E. driver: wlaczenie flagi po boot, reset przed kamera, liczniki w PERFJSON,
//  F. obecnosc harnessu w run-all.sh.
// Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const DRIVER = fs.readFileSync(path.join(ROOT, 'tests/perf/perf_driver.html'), 'utf8');
const RUNALL = fs.readFileSync(path.join(ROOT, 'tests/run-all.sh'), 'utf8');

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

// ── A: infrastruktura ───────────────────────────────────────────────────────
ok(HTML.includes('const _PERF = { draws: 0, vis: 0, plane: 0, pixmapDecodes: 0, layers: {} };'),
   'A1: obiekt _PERF z polami draws/vis/plane/pixmapDecodes/layers');

const fon = extract(HTML, 'function _perfOn()');
ok(fon.includes("typeof window !== 'undefined'") && fon.includes('!!window.__PERF_COUNTERS__'),
   'A2: _perfOn guard: typeof window + !!window.__PERF_COUNTERS__');

const ftick = extract(HTML, 'function _perfTick(');
const ftickBody = ftick.slice(ftick.indexOf('{') + 1).trimStart();
ok(ftickBody.startsWith('if (!pc) return;'),
   'A3: _perfTick: pierwsza instrukcja to zwrot przy null (zero kosztu gdy off)');
ok(ftick.includes('performance.now()') && ftick.includes('_PERF.layers[name]'),
   'A4: _perfTick: akumulacja do _PERF.layers[name]');

// ── B: instrumentacja draw() ────────────────────────────────────────────────
const d = extract(HTML, 'function draw() {');
ok(d.includes('const _pc = _perfOn() ? { t: performance.now() } : null;'),
   'B1: draw(): _pc inicjalizowane za guardem _perfOn() (null gdy off)');

const TICKS = ['prelude', 'cull', 'exits', 'stubs', 'pending', 'custom_lines',
               'labels', 'rooms', 'area_labels', 'labels_top', 'suppressors', 'ghosts', 'post'];
const tickCount = (d.match(/_perfTick\(_pc, '/g) || []).length;
ok(tickCount === TICKS.length,
   'B2: draw(): dokladnie ' + TICKS.length + ' tickow (jest ' + tickCount + ')');

let prevIdx = -1, orderOk = true;
for (const name of TICKS) {
  const idx = d.indexOf("_perfTick(_pc, '" + name + "')");
  if (idx < 0 || idx <= prevIdx) orderOk = false;
  prevIdx = idx;
  ok(idx >= 0, 'B3: tick „' + name + '" obecny w draw()');
}
ok(orderOk, 'B4: ticki w ustawionej kolejnosci warstw: ' + TICKS.join(' → '));

// tick bezposrednio po callu warstwy — dozwolony tylko komentarz liniowy miedzy
// Arc 33 (v1.49.3): warstwa exits ma dwie sciezki renderu (full drawExits /
// roomsOnly drawExitsLite) w jednej linii — tick „exits" mierzy obie, regex
// dopuszcza galaz lite miedzy callem full a tickiem.
const C = String.raw`(\s*//[^\n]*)?\s*`;
const PAIRS = [
  [new RegExp(String.raw`drawExits\(vis, rs\);( else if \(_lodMode === 'roomsOnly'\) drawExitsLite\(vis, rs\);)?` + C + String.raw`_perfTick\(_pc, 'exits'\)`), 'exits'],
  [new RegExp(String.raw`drawStubs\(vis, rs\);` + C + String.raw`_perfTick\(_pc, 'stubs'\)`), 'stubs'],
  [new RegExp(String.raw`drawPendingExitLines\(rs\);` + C + String.raw`_perfTick\(_pc, 'pending'\)`), 'pending'],
  [new RegExp(String.raw`drawCustomLines\(vis\);` + C + String.raw`_perfTick\(_pc, 'custom_lines'\)`), 'custom_lines'],
  [new RegExp(String.raw`drawLabels\(\);` + C + String.raw`_perfTick\(_pc, 'labels'\)`), 'labels'],
  [new RegExp(String.raw`drawRooms\(vis, rs\);` + C + String.raw`_perfTick\(_pc, 'rooms'\)`), 'rooms'],
  [new RegExp(String.raw`drawCrossAreaLabels\(rs\);` + C + String.raw`_perfTick\(_pc, 'area_labels'\)`), 'area_labels'],
  [new RegExp(String.raw`drawLabelsOnTop\(\);` + C + String.raw`_perfTick\(_pc, 'labels_top'\)`), 'labels_top'],
  [new RegExp(String.raw`drawSuppressors\(vis\);` + C + String.raw`_perfTick\(_pc, 'suppressors'\)`), 'suppressors'],
  [new RegExp(String.raw`_drawDeltaGhosts\(rs\);` + C + String.raw`_perfTick\(_pc, 'ghosts'\)`), 'ghosts'],
];
for (const [re, name] of PAIRS) {
  ok(re.test(d), 'B5: tick „' + name + '" bezposrednio po swoim callu warstwy');
}

ok(/if \(_pc\) \{ _PERF\.draws\+\+; _PERF\.plane = rooms\.length; _PERF\.vis = vis\.length; \}/.test(d),
   'B6: licznik draws/plane/vis za guardem if (_pc), po filtrze viewportu');

// ── C: licznik dekodowan pixmap ─────────────────────────────────────────────
ok(HTML.includes('img.onload  = () => { entry.loaded = true; if (_perfOn()) _PERF.pixmapDecodes++; scheduleDraw(); };'),
   'C1: onload pixmap: pixmapDecodes++ za guardem _perfOn(), przed scheduleDraw() (RAF-batching F1)');

// ── D: zachowanie bloku w Node (off => no-op, on => akumulacja) ─────────────
const blockStart = HTML.indexOf('const _PERF =');
const blockEnd = HTML.indexOf('function _perfTick(');
ok(blockStart > 0 && blockEnd > blockStart, 'D0: blok licznikow mozliwy do wydobycia');
const block = HTML.slice(blockStart) ;
const tickFn = extract(HTML, 'function _perfTick(');
const onFn = extract(HTML, 'function _perfOn()');
const code = 'const _PERF = { draws: 0, vis: 0, plane: 0, pixmapDecodes: 0, layers: {} };\n'
           + onFn + '\n' + tickFn + '\nreturn { _PERF, _perfOn, _perfTick };';
// off: window zdefiniowane bez flagi
{
  const m = new Function('window', 'performance', code)({}, performance);
  ok(m._perfOn() === false, 'D1: flaga off => _perfOn() false');
  m._perfTick(null, 'rooms');
  ok(Object.keys(m._PERF.layers).length === 0 && m._PERF.draws === 0,
     'D2: flaga off => tick(null) to no-op, zero zapisow w _PERF');
}
// on: window z flaga
{
  const m = new Function('window', 'performance', code)({ __PERF_COUNTERS__: true }, performance);
  ok(m._perfOn() === true, 'D3: flaga on => _perfOn() true');
  const pc = { t: performance.now() };
  m._perfTick(pc, 'rooms');
  m._perfTick(pc, 'rooms');
  ok(typeof m._PERF.layers.rooms === 'number' && m._PERF.layers.rooms >= 0,
     'D4: flaga on => tick akumuluje do layers.rooms (' + m._PERF.layers.rooms + ')');
  m._perfTick(pc, 'exits');
  ok(Object.keys(m._PERF.layers).length === 2,
     'D5: akumulacja per nazwa warstwy (rooms + exits)');
}
// undefined window (Node bez window): typeof guard
{
  const m = new Function('window', 'performance', code)(undefined, performance);
  ok(m._perfOn() === false, 'D6: brak window => _perfOn() false (typeof guard)');
}

// ── E: driver ───────────────────────────────────────────────────────────────
ok(DRIVER.includes('W.__PERF_COUNTERS__ = true;'),
   'E1: driver wlacza flage po boocie iframe');
ok(DRIVER.includes('function perfReset(W)') && DRIVER.includes('function perfRead(W)'),
   'E2: driver: helpery perfReset/perfRead');
// kotwice na WYWOLANIACH (nie definicjach helperow)
const iCam = DRIVER.indexOf('= await cameraPath(W)');
const iReset = DRIVER.indexOf('perfReset(W);');
const iLoad = DRIVER.indexOf('const loadCounters = perfRead(W)');
const iReadCam = DRIVER.indexOf('const camCounters = perfRead(W)');
ok(iLoad > 0 && iReset > iLoad && iCam > iReset && iReadCam > iCam,
   'E3: kolejnosc w main: perfRead (load) → perfReset → cameraPath → perfRead (kamera)');
ok(DRIVER.includes('camera_counters') && DRIVER.includes('load_counters'),
   'E4: PERFJSON niesie load_counters i camera_counters');

// ── F: run-all ──────────────────────────────────────────────────────────────
ok(RUNALL.includes('tests/perf_counters.js'),
   'F1: harness wpisany do tests/run-all.sh');

console.log('\nperf_counters: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
