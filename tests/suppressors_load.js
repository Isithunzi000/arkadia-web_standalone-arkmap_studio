// Harness — suppressors_load.js: walidacja podwojnych linii przy loadzie + eksport z dialogow (v1.45.2, Arc 29).
// Sekcja A: checkSuppressorsInMap — funkcjonalnie (ekstrakcja verbatim): paritet z rdzeniem,
//           guardy malformed, no-throw, read-only na sparsowanej mapie.
// Sekcja B: piny strukturalne — 3 call-site'y loadu, sygnatura showValDialog, sekcja render,
//           wiring eksportu po id (likwidacja querySelectorAll po pozycji — lekcja Arc 9).
// Sekcja C: _suppReportText — funkcjonalnie (pelna lista, sort, builder) + piny eksportu.
// Uruchamianie z katalogu glownego repo: node tests/suppressors_load.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function extract(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('BRAK KOTWICY: ' + anchor);
  if (i !== src.lastIndexOf(anchor)) throw new Error('kotwica nieunikalna: ' + anchor);
  let d = 0; const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('niezbalansowane klamry: ' + anchor);
}

// ─── Sekcja A: checkSuppressorsInMap (funkcjonalnie) ────────────────────────
console.log('— Sekcja A: checkSuppressorsInMap —');
const codeA =
  extract(HTML, 'const OPPOSITE = {') + '\n' +
  extract(HTML, 'function _findMissingSuppressors(roomById, roomArea) {') + '\n' +
  extract(HTML, 'function checkSuppressorsInMap(map) {') + '\n' +
  'return { checkSuppressorsInMap, _findMissingSuppressors };';
const apiA = new Function(codeA)();

function mkMap(rooms, areas) {
  // rooms: obiekty pokoi; areas: [[areaId, [roomId...]], ...] (domyslnie jeden obszar 1)
  const byId = {};
  for (const r of rooms) byId[r.id] = r;
  const groups = areas || [[1, rooms.map(r => r.id)]];
  return { format: 'arkmap', version: 1,
    areas: groups.map(([aid, ids]) => ({ id: aid, name: 'A' + aid, rooms: ids.map(id => byId[id]) })) };
}
const CLP = { points: [[1, 0], [2, 1]] };
const pair = () => [
  { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 }, custom_lines: { e: JSON.parse(JSON.stringify(CLP)) } },
  { id: 2, x: 4, y: 0, z: 0, exits: { w: 1 }, custom_lines: {} },
];

// A1: dubel → dokladnie 1 rekord z polami
{
  const m = apiA.checkSuppressorsInMap(mkMap(pair()));
  ok(m.length === 1 && m[0].roomA === 1 && m[0].dir === 'e' && m[0].roomB === 2 && m[0].oppDir === 'w',
    'A1 dubel w sparsowanej mapie → 1 rekord {roomA,dir,roomB,oppDir}');
}
// A2: suppressor obecny → cisza
{
  const p = pair(); p[1].custom_lines = { w: { points: [] } };
  ok(apiA.checkSuppressorsInMap(mkMap(p)).length === 0, 'A2 suppressor (points:[]) po stronie B → cisza');
}
// A3: cross-area → skip
{
  ok(apiA.checkSuppressorsInMap(mkMap(pair(), [[1, [1]], [2, [2]]])).length === 0, 'A3 cross-area → skip');
}
// A4: cross-Z → skip
{
  const p = pair(); p[1].z = 1;
  ok(apiA.checkSuppressorsInMap(mkMap(p)).length === 0, 'A4 cross-Z → skip');
}
// A5: inner-exit → skip
{
  const p = [
    { id: 1, x: 0, y: 0, z: 0, exits: { up: 2 }, custom_lines: { up: JSON.parse(JSON.stringify(CLP)) } },
    { id: 2, x: 0, y: 0, z: 1, exits: { down: 1 }, custom_lines: {} },
  ];
  ok(apiA.checkSuppressorsInMap(mkMap(p)).length === 0, 'A5 inner-exit (up/down) → skip');
}
// A6: orphan CL → skip
{
  const p = pair(); p[0].exits = {};
  ok(apiA.checkSuppressorsInMap(mkMap(p)).length === 0, 'A6 orphan CL (brak exits[dir]) → skip');
}
// A7: malformed — zadne wejscie nie rzuca, wynik []
{
  const cases = [null, undefined, {}, { areas: null }, { areas: [{ rooms: null }] },
    { areas: [{ id: 1, rooms: [null, { custom_lines: { e: CLP } }, { id: 5, custom_lines: null }] }] },
    mkMap([{ id: 1, x: 0, y: 0, z: 0, exits: { e: 2 }, custom_lines: { e: { points: null } } },
           { id: 2, x: 4, y: 0, z: 0, exits: { w: 1 } }])];
  let allOk = true;
  for (const c of cases) {
    try { const r = apiA.checkSuppressorsInMap(c); if (!Array.isArray(r)) allOk = false; }
    catch (e) { allOk = false; }
  }
  ok(allOk, 'A7 malformed (null/brak areas/brak id/points null) → [] bez rzucania');
}
// A8: read-only — mapa nietknieta (snapshot JSON przed/po)
{
  const map = mkMap(pair());
  const before = JSON.stringify(map);
  apiA.checkSuppressorsInMap(map);
  ok(JSON.stringify(map) === before, 'A8 read-only: sparsowana mapa bez mutacji (ida do applyMap)');
}
// A9: paritet z rdzeniem — te same indeksy → identyczna lista
{
  const map = mkMap(pair());
  const roomById = {}, roomArea = {};
  for (const a of map.areas) for (const r of a.rooms) { roomById[r.id] = r; roomArea[r.id] = a.id; }
  const viaMap = apiA.checkSuppressorsInMap(map);
  const viaCore = apiA._findMissingSuppressors(roomById, roomArea);
  ok(JSON.stringify(viaMap) === JSON.stringify(viaCore), 'A9 paritet checkSuppressorsInMap ≡ _findMissingSuppressors');
}

// A10 (Arc 37, PRACA 13): multi-edge — CL na „e", druga krawedz A→B („ne") bez CL.
// Dawny skip otherDefaultEdge opieral sie na dedupie PAR pokoi z Delwinga; nasz
// renderer (drawExits) rysuje linie per (pokoj, kierunek) — linia B→A (opp) i tak
// powstaje, wiec suppressor jest POTRZEBNY i flaga musi sie pojawic.
{
  const p = pair(); p[0].exits.ne = 2;
  const m = apiA.checkSuppressorsInMap(mkMap(p));
  ok(m.length === 1 && m[0].roomA === 1 && m[0].dir === 'e',
    'A10 multi-edge (CL na e + krawedz ne bez CL) → flaga (renderer per-kierunek)');
}
{
  const body = extract(HTML, 'function _findMissingSuppressors(roomById, roomArea) {');
  ok(!body.includes('let otherDefaultEdge'), 'straznik: bez skipu multi-edge (deklaracja otherDefaultEdge usunieta; PRACA 13)');
  ok(body.includes('cross-area'), 'straznik: skip cross-area nadal obecny (swiadoma decyzja wlasciciela)');
}

// ─── Sekcja B: piny strukturalne loadu ──────────────────────────────────────
console.log('— Sekcja B: piny strukturalne —');
{
  ok((HTML.match(/checkSuppressorsInMap\(/g) || []).length === 4,
    'B1 checkSuppressorsInMap: 1 definicja + 3 call-site loadu (=4 wystapienia)');
  ok(HTML.includes('window.showValDialog = function(valRes, chkRes, filename, isFatal, suppMissing)'),
    'B2 showValDialog: sygnatura z suppMissing');
  const la = extract(HTML, 'async function loadArkmap(text, filename) {');
  ok(la.includes('checkSuppressorsInMap(map)') && la.includes('showValDialog(valRes, chkRes, filename, isFatal, suppMissing)'),
    'B3 loadArkmap: check + przekazanie do showValDialog');
  const ld = extract(HTML, 'async function loadDat(file) {');
  ok(ld.includes('checkSuppressorsInMap(arkmap)') && ld.includes('suppMissing'),
    'B4 loadDat (.dat z dysku): check + przekazanie');
  const lo = extract(HTML, 'async function olLoadDat() {');
  ok(lo.includes('checkSuppressorsInMap(arkmap)') && lo.includes('suppMissing'),
    'B5 olLoadDat (.dat online): check + przekazanie');
  ok((HTML.match(/suppMissing\.length > 0/g) || []).length === 3,
    'B6 warunek otwarcia val-modalu rozszerzony o podwojne linie we wszystkich 3 sciezkach');
  ok((HTML.match(/suppMissing\.length === 0/g) || []).length === 3,
    'B7 toast sukcesu wymaga braku podwojnych linii (3 sciezki, inaczej ⚠)');
  ok(HTML.includes('PODWÓJNE LINIE — '), 'B8 sekcja PODWÓJNE LINIE renderowana w val-modal');
}

// ─── Sekcja C: raport podwojnych linii + eksport ────────────────────────────
console.log('— Sekcja C: raport i eksport —');
{
  const codeC =
    extract(HTML, 'function _suppLine(m) {') + '\n' +
    extract(HTML, 'function _suppSort(missing) {') + '\n' +
    extract(HTML, 'function buildDiagnosticsReport(opts) {') + '\n' +
    extract(HTML, 'function _suppReportText(missing) {') + '\n' +
    'return { _suppReportText };';
  const apiC = new Function('APP_VERSION', 'state', codeC)('v1.48.3', { filename: 'map_master3.arkmap' });

  const many = [];
  for (let i = 30; i >= 1; i--) many.push({ roomA: i, dir: 'e', roomB: i + 1000, oppDir: 'w' });
  const r1 = apiC._suppReportText(many);
  ok(r1.split('\n')[0] === '# Raport podwójnych linii wyjść — ArkMap Studio', 'C1 naglowek H1 raportu podwojnych');
  ok(r1.includes('- Plik: map_master3.arkmap'), 'C2 plik biezacej mapy w naglowku');
  ok(r1.includes('- Wersja aplikacji: v1.48.3'), 'C3 wersja aplikacji (pin)');
  ok((r1.match(/^Pokój #\d+ \(dir=e → #\d+\): podwójna linia, domknięcie w #\d+ dir=w$/gm) || []).length === 30,
    'C4 PELNA lista 30 pozycji (bez obcinania jak w UI)');
  ok(r1.indexOf('Pokój #1 ') < r1.indexOf('Pokój #30'), 'C5 sortowanie numeryczne po roomA');
  const strip = s => s.split('\n').filter(l => !l.startsWith('- Data: ')).join('\n');
  ok(strip(r1) === strip(apiC._suppReportText(many)), 'C6 deterministyczny poza linia daty');
  const r0 = apiC._suppReportText([]);
  ok(r0.includes('## Podwójne linie (0)\n\n(brak)'), 'C7 pusta lista → sekcja (0) + (brak)');
  ok(r1.includes('dotyczą tylko wyglądu'), 'C8 sekcja informacyjna: kosmetyka, nie blokuje');

  ok(/function _suppCopyReport\(missing\)/.test(HTML) && /function _suppDownloadMd\(missing\)/.test(HTML),
    'C9 helpery eksportu: _suppCopyReport + _suppDownloadMd');
  ok(HTML.includes("'raport-podwojne-linie-' + _reportMapName() + '-' + _reportTs() + '.md'"),
    'C10 nazwa pliku wg konwencji raport-podwojne-linie-<mapa>-<ts>.md');
  for (const id of ['supp-copy', 'supp-md', 'supp-html', 'suppm-copy', 'suppm-md', 'suppm-html', 'supp-cancel', 'supp-skip', 'supp-fix'])
    ok(HTML.includes("getElementById('" + id + "')"), 'C11 wiring po id: ' + id);
  ok(!HTML.includes("querySelectorAll('.dlg-ftr button')"),
    'C12 likwidacja wiringu po pozycji w stopce (lekcja Arc 9: btn-lde-*)');
  ok((HTML.match(/escHtml\(m\.dir\)/g) || []).length === 2 && (HTML.match(/escHtml\(String\(m\.roomA\)\)/g) || []).length === 2,
    'C13 lista supp-item escapowana w obu dialogach (Arc 9: sinki escapuja same)');
}

console.log('\nsuppressors_load: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
