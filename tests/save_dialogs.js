// Harness — save_dialogs.js: dialogi zapisu (saveWithDialog) + smart-nazwy + checkSuppressors (v1.44.5).
// Sekcja A: checkSuppressors — macierz 16 przypadkow (ekstrakcja verbatim rdzenia
//           _findMissingSuppressors + cienkiego wrappera, mock state; refaktor Arc 29).
// Sekcja B: piny strukturalne — 7 sciezek zapisu przez saveWithDialog, wpisy acceptMap,
//           kotwice smart-nazw, zero golych download( poza helperem, brak triggerDownload.
// Sekcja C: pin APP_VERSION.
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
for (const a of ['const OPPOSITE = {', 'function _findMissingSuppressors(roomById, roomArea) {',
                 'function checkSuppressors() {',
                 'async function saveWithDialog(defaultName, mimeType, dataFn) {',
                 'function kalkaSave() {', 'function saveDelta() {', 'function saveDeltaRemainder() {',
                 'function finalize(canvas, fmt, basename) {', 'function vdDownloadMd(){',
                 'function vdDownloadPng(){', 'function _kalkaSuggestName() {',
                 'function _vdSuggestedName(ext){']) {
  if (HTML.indexOf(a) !== HTML.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}

// ═══ Sekcja A — checkSuppressors (macierz 16 przypadkow) ═══
console.log('— Sekcja A: checkSuppressors —');
const codeA =
  extract(HTML, 'const OPPOSITE = {') + '\n' +
  extract(HTML, 'function _findMissingSuppressors(roomById, roomArea) {') + '\n' +
  extract(HTML, 'function checkSuppressors() {') + '\n' +
  'return { checkSuppressors };';

function mkRoom(id, opts) {
  opts = opts || {};
  return {
    id, x: (opts.x ?? id * 2), y: 0, z: (opts.z ?? 0),
    exits: opts.exits || {}, custom_lines: opts.custom_lines || {},
  };
}
// Bazowa para: A=1 --e--> B=2, B --w--> A (reciprocal), ten sam obszar 10, z=0.
function mkState(pairs, areaMap, insertOrder) {
  const state = { roomById: {}, roomArea: {} };
  const rooms = insertOrder || Object.keys(pairs);
  for (const id of rooms) {
    state.roomById[id] = pairs[id];
    state.roomArea[id] = areaMap && areaMap[id] !== undefined ? areaMap[id] : 10;
  }
  return state;
}
function run(state) {
  return new Function('state', codeA)(state).checkSuppressors();
}
function flagKeys(missing) {
  return missing.map(m => m.roomA + '|' + m.dir + '|' + m.roomB + '|' + m.oppDir).sort();
}
const CLP = { points: [[0.5, 0.2], [1.2, -0.3]], color: [255, 0, 0] };  // realny reshape
const basePair = () => ({
  1: mkRoom(1, { exits: { e: 2 }, custom_lines: { e: JSON.parse(JSON.stringify(CLP)) } }),
  2: mkRoom(2, { exits: { w: 1 } }),
});

// 1. dubel wymaga suppressora → flaga
{
  const m = run(mkState(basePair()));
  ok(m.length === 1 && m[0].roomA === 1 && m[0].dir === 'e' && m[0].roomB === 2 && m[0].oppDir === 'w',
    'A1 dubel bez suppressora → dokladnie 1 flaga');
}
// 2. suppressor obecny (pusta CL na opp) → cisza
{
  const p = basePair(); p[2].custom_lines = { w: { points: [] } };
  ok(run(mkState(p)).length === 0, 'A2 suppressor (points:[]) po stronie B → cisza');
}
// 3. B z niepusta CL na opp → cisza
{
  const p = basePair(); p[2].custom_lines = { w: { points: [[0.1, 0.1]] } };
  ok(run(mkState(p)).length === 0, 'A3 niepusta CL na opp po stronie B → cisza');
}
// 4. multi-edge: inne wyjscie A→B bez CL → cisza
{
  const p = basePair(); p[1].exits = { e: 2, ne: 2 };
  ok(run(mkState(p)).length === 0, 'A4 multi-edge A→B bez CL → cisza');
}
// 5. multi-edge: inne wyjscie B→A bez CL → cisza
{
  const p = basePair(); p[2].exits = { w: 1, sw: 1 };
  ok(run(mkState(p)).length === 0, 'A5 multi-edge B→A bez CL → cisza');
}
// 6. multi-edge, wszystkie pozostale krawedzie maja CL → flaga
{
  const p = basePair();
  p[1].exits = { e: 2, ne: 2 };
  p[1].custom_lines = { e: JSON.parse(JSON.stringify(CLP)), ne: { points: [[0.3, 0.3]] } };
  const m = run(mkState(p));
  ok(m.length === 1 && m[0].dir === 'e', 'A6 multi-edge z CL na pozostalych → 1 flaga (dir=e)');
}
// 7. cross-area → skip
{
  ok(run(mkState(basePair(), { 1: 10, 2: 20 })).length === 0, 'A7 cross-area → skip');
}
// 8. cross-Z → skip
{
  const p = basePair(); p[2].z = 1;
  ok(run(mkState(p)).length === 0, 'A8 cross-Z → skip');
}
// 9. dir z {up, down, in, out} → skip
{
  const p = { 1: mkRoom(1, { exits: { up: 2 }, custom_lines: { up: JSON.parse(JSON.stringify(CLP)) } }),
              2: mkRoom(2, { exits: { down: 1 } }) };
  ok(run(mkState(p)).length === 0, 'A9 inner-exit (up/down/in/out) → skip');
}
// 10. orphan CL (brak exits[dir]) → skip
{
  const p = { 1: mkRoom(1, { exits: {}, custom_lines: { e: JSON.parse(JSON.stringify(CLP)) } }),
              2: mkRoom(2, { exits: { w: 1 } }) };
  ok(run(mkState(p)).length === 0, 'A10 orphan CL → skip');
}
// 11. target nie istnieje → skip
{
  const p = { 1: mkRoom(1, { exits: { e: 999 }, custom_lines: { e: JSON.parse(JSON.stringify(CLP)) } }) };
  ok(run(mkState(p)).length === 0, 'A11 target nie istnieje → skip');
}
// 12. brak reciprocal exit → skip
{
  const p = basePair(); p[2].exits = {};
  ok(run(mkState(p)).length === 0, 'A12 brak reciprocal exit → skip');
}
// 13. A-suppressor (points: []) → skip
{
  const p = basePair(); p[1].custom_lines = { e: { points: [] } };
  ok(run(mkState(p)).length === 0, 'A13 A jest suppressorem (points:[]) → skip');
}
// 14. zepsuty wpis (points nie-tablica) → skip
{
  const p = basePair(); p[1].custom_lines = { e: { points: null } };
  ok(run(mkState(p)).length === 0, 'A14 points nie-tablica → skip');
}
// 15. determinizm: dwie kolejnosci wstawiania pokoi → identyczny ZBIOR flag
{
  const mk3 = () => {
    const rooms = {};
    for (const [a, b] of [[1, 2], [3, 4], [5, 6]]) {
      rooms[a] = mkRoom(a, { exits: { e: b }, custom_lines: { e: JSON.parse(JSON.stringify(CLP)) } });
      rooms[b] = mkRoom(b, { exits: { w: a } });
    }
    return rooms;
  };
  const k1 = flagKeys(run(mkState(mk3(), null, ['1', '2', '3', '4', '5', '6'])));
  const k2 = flagKeys(run(mkState(mk3(), null, ['6', '5', '4', '3', '2', '1'])));
  ok(k1.length === 3 && JSON.stringify(k1) === JSON.stringify(k2),
    'A15 determinizm: kolejnosc wstawiania nie zmienia zbioru flag');
}
// 16. tresc rekordu: {roomA, dir, roomB, oppDir, sourceCL}
{
  const p = basePair();
  const m = run(mkState(p));
  ok(m.length === 1 && m[0].roomA === 1 && m[0].dir === 'e' && m[0].roomB === 2 &&
     m[0].oppDir === 'w' && m[0].sourceCL === p[1].custom_lines.e,
    'A16 rekord: {roomA, dir, roomB, oppDir, sourceCL} (sourceCL = referencja CL)');
}

// ═══ Sekcja B — piny strukturalne dialogow zapisu ═══
console.log('— Sekcja B: piny strukturalne —');
{
  const helper = extract(HTML, 'async function saveWithDialog(defaultName, mimeType, dataFn) {');
  ok(helper.includes("'arkdelta': { 'application/json': ['.arkdelta'] }"), 'B1 acceptMap: wpis arkdelta');
  ok(helper.includes("'md':       { 'text/markdown': ['.md'] }"), 'B2 acceptMap: wpis md');
  ok(helper.includes("'png':      { 'image/png': ['.png'] }"), 'B3 acceptMap: wpis png');
  ok(helper.includes("'svg':      { 'image/svg+xml': ['.svg'] }"), 'B4 acceptMap: wpis svg');

  const kalkaSave = extract(HTML, 'function kalkaSave() {');
  ok(kalkaSave.includes("saveWithDialog(_kalka.fname, 'application/json'") && !/[^_a-zA-Z]download\(/.test(kalkaSave),
    'B5 kalkaSave → saveWithDialog (bez golego download)');

  const saveDelta = extract(HTML, 'function saveDelta() {');
  ok(saveDelta.includes('saveWithDialog(_arkdeltaSuggestedName()') && !/[^_a-zA-Z]download\(/.test(saveDelta),
    'B6 saveDelta → saveWithDialog (bez golego download)');

  const saveRest = extract(HTML, 'function saveDeltaRemainder() {');
  ok(saveRest.includes('saveWithDialog(') && saveRest.includes('-reszta.arkdelta') && !/[^_a-zA-Z]download\(/.test(saveRest),
    'B7 saveDeltaRemainder → saveWithDialog (suffix -reszta)');

  const fin = extract(HTML, 'function finalize(canvas, fmt, basename) {');
  ok((fin.match(/saveWithDialog\(/g) || []).length === 2 && !fin.includes('triggerDownload'),
    'B8 finalize: PNG i SVG przez saveWithDialog');

  const vdMd = extract(HTML, 'function vdDownloadMd(){');
  ok(vdMd.includes("saveWithDialog(_vdSuggestedName('md')") && !/[^_a-zA-Z]download\(/.test(vdMd),
    'B9 vdDownloadMd → saveWithDialog (smart-nazwa)');

  const vdPng = extract(HTML, 'function vdDownloadPng(){');
  ok(vdPng.includes("saveWithDialog(_vdSuggestedName('png')") && !vdPng.includes('map_master3'),
    'B10 vdDownloadPng → saveWithDialog + naglowek bez zahardkodowanej nazwy mapy');

  const sug = extract(HTML, 'function _kalkaSuggestName() {');
  ok(sug.includes("'--' + fmtA + '-do-' + fmtB + '.arkdelta'") && sug.includes('🌐 online · '),
    'B11 smart-nazwa kalki: suffix --<fmtA>-do-<fmtB> + odpinanie prefiksu online');

  ok(HTML.includes("return 'walidacja-kierunkow-' + _vdMapName() + '-' + ts + '.' + ext;"),
    'B12 smart-nazwa walidacji kierunkow: walidacja-kierunkow-<mapa>-<ts>');

  // Zero golych download(/downloadBinary( poza helperem saveWithDialog i definicjami.
  const stripped = HTML
    .replace(helper, '')
    .replace(extract(HTML, 'function downloadBinary(filename, bytes, mime) {'), '')
    .replace(extract(HTML, 'function download(name, text, mime) {'), '');
  ok(!/[^._a-zA-Z]download(?:Binary)?\(/.test(stripped),
    'B13 zero golych download(/downloadBinary( poza helperem');

  ok(HTML.indexOf('triggerDownload') === -1, 'B14 brak triggerDownload w zrodle');
}

// ═══ Sekcja C — pin wersji ═══
console.log('— Sekcja C: pin wersji —');
ok(HTML.includes("const APP_VERSION = 'v1.46.0';"), 'C1 APP_VERSION = v1.46.0');

console.log(`\n═══ save_dialogs.js: PASS ${pass} / FAIL ${fail} ═══`);
process.exit(fail ? 1 : 0);
