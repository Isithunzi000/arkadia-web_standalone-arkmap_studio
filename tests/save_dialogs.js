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
                 'function vdDownloadHtml(){', 'function _kalkaSuggestName() {',
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
// 4. multi-edge: inne wyjscie A→B bez CL → flaga (Arc 37, PRACA 13: nasz renderer
//    rysuje linie per (pokoj, kierunek), bez dedupu par Delwinga — linia B→A (opp)
//    i tak powstaje, wiec suppressor jest potrzebny; pre-Arc-37: cisza)
{
  const p = basePair(); p[1].exits = { e: 2, ne: 2 };
  const m = run(mkState(p));
  ok(m.length === 1 && m[0].dir === 'e' && m[0].roomB === 2,
    'A4 multi-edge A→B bez CL → 1 flaga (PRACA 13: renderer per-kierunek)');
}
// 5. multi-edge: inne wyjscie B→A bez CL → flaga (jak A4 — dodatkowa krawedz
//    B→A bez CL nie zdejmuje potrzeby suppressora na opp)
{
  const p = basePair(); p[2].exits = { w: 1, sw: 1 };
  const m = run(mkState(p));
  ok(m.length === 1 && m[0].dir === 'e' && m[0].roomB === 2,
    'A5 multi-edge B→A bez CL → 1 flaga (PRACA 13)');
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

  // (guard kotwicy: pre-fix funkcji nie ma — czysty FAIL zamiast wyjatku ekstrakcji)
  const vdHtml = HTML.includes('function vdDownloadHtml(){') ? extract(HTML, 'function vdDownloadHtml(){') : '';
  ok(vdHtml.includes("saveWithDialog(_vdSuggestedName('html')") && vdHtml.includes('_reportHtmlDoc(')
    && !vdHtml.includes('map_master3'),
    'B10 vdDownloadHtml → saveWithDialog + _reportHtmlDoc (UX-1: HTML zamiast PNG)');

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

  // v1.52.2: „Zapisz jako…" zawsze widoczny — zero inline display:none na przycisku
  // i zero reguly CSS odblokowujacej go tylko w trybie edycji.
  ok(!HTML.includes('id="btn-save-arkmap-as" disabled style="display:none"'),
     'B15 btn-save-arkmap-as bez inline display:none (zawsze widoczny)');
  ok(!HTML.includes('#app.edit-mode #btn-save-arkmap-as'),
     'B16 brak reguly CSS #app.edit-mode #btn-save-arkmap-as (relikt trybu edycji)');
}

// ═══ Sekcja C — pin wersji ═══
console.log('— Sekcja C: pin wersji —');
ok(HTML.includes("const APP_VERSION = 'v1.52.2';"), 'C1 APP_VERSION = v1.52.2');

// ═══ A4.5 (UX-5): potwierdzenie pierwszego nadpisu + autobackup IndexedDB ═══
console.log('— A4.5 (UX-5): confirm nadpisu + backup IndexedDB —');
const ASYNC_PINS_SD = [];
{
  // — statyczne —
  ok(HTML.includes('let _arkmapOverwriteConfirmed = false;'),
    'A4.5 (UX-5A): flaga _arkmapOverwriteConfirmed zadeklarowana (pre-fix: brak)');
  ok((HTML.match(/_arkmapOverwriteConfirmed = false/g) || []).length === 6,
    'A4.5 (UX-5A): reset flagi przy KAZDYM przypisaniu handle (deklaracja + 5 miejsc: restoreLastSave, save-as, fallback, save-dialog, applyMap)');
  ok(HTML.includes('id="dlg-confirm-overwrite"') && HTML.includes('id="cow-ok"') &&
     HTML.includes('id="dlg-backups"') && HTML.includes('id="bak-list"') &&
     HTML.includes('id="btn-backups"') && HTML.includes('id="bak-clear"'),
    'A4.5 (UX-5): dialogi dlg-confirm-overwrite + dlg-backups + przyciski w DOM (pre-fix: brak)');
  const pas = HTML.includes('async function _performArkmapSave(onSaved) {') ? extract(HTML, 'async function _performArkmapSave(onSaved) {') : '';
  const iGate = pas.indexOf('_showOverwriteConfirm('), iCreate = pas.indexOf('createWritable(');
  const iBak = pas.indexOf('_bakPut('), iWrite = pas.indexOf('writable.write(');
  ok(iGate !== -1 && iCreate !== -1 && iGate < iCreate,
    'A4.5 (UX-5A): gate potwierdzenia PRZED createWritable w bloku handle (pre-fix: zapis bez pytania)');
  ok(iBak !== -1 && iWrite !== -1 && iBak < iWrite,
    'A4.5 (UX-5B): _bakPut PRZED writable.write — backup poprzedniej zawartosci (pre-fix: brak backupu)');
  const sbd = HTML.includes('async function showBackupsDialog() {') ? extract(HTML, 'async function showBackupsDialog() {') : '';
  ok(sbd.includes('.kopia-') && sbd.includes('_bakTs(en.ts)') && sbd.includes("'.arkmap'"),
    'A4.5 (UX-5B): [Pobierz] -> sugerowana nazwa <nazwa>.kopia-<ts>.arkmap');
  ok(sbd.includes('Brak kopii zapasowych'),
    'A4.5 (UX-5B): pusty stan dialogu kopii');
  // Arc 34 (v1.49.4, obs 2): nawias podtytulu lamiemy wylacznie w calosci (nowrap span)
  ok(HTML.includes('<div class="dlg-sub">Automatyczne — przed każdym nadpisem istniejącego pliku <span style="white-space:nowrap">(maks. 5 na plik)</span></div>'),
    'A4.5 (UX-5C, Arc 34): podtytul dlg-backups — nawias w nowrap span (pre-fix: lamany w srodku)');
}
{
  // — behawioralny A: pierwszy zapis pyta, drugi cicho; backup przed write —
  const SRC = 'let _arkmapFileHandle = handle0, _arkmapOverwriteConfirmed = false;\n'
    + extract(HTML, 'async function _performArkmapSave(onSaved) {') + '\n'
    + 'return { save: _performArkmapSave, get confirmed() { return _arkmapOverwriteConfirmed; } };';
  const state = { map: { format: 'arkmap' }, editRev: 0, pristineArkmap: 'OLD', dirty: true };
  const seq = [], writes = [];
  let confirmCalls = 0, confirmCb = null, confirmName = null;
  const handle0 = {
    name: 'mapa.arkmap',
    createWritable: async () => ({
      write: async (t) => { seq.push('write'); writes.push(t); },
      close: async () => {},
    }),
  };
  const api = new Function('state', '_serializeMapForSaveSigned', '_arkmapSuggestedName', 'saveWithDialog',
    'toast', '_updateSaveButtonText', '_showOverwriteConfirm', '_bakPut', 'handle0', SRC)
    (state, async () => 'NEW', () => 'mapa.arkmap', async () => null, () => {}, () => {},
      (name, cb) => { confirmCalls++; confirmName = name; confirmCb = cb; },
      async (name, text) => { seq.push('bak:' + name + ':' + text); },
      handle0);
  ASYNC_PINS_SD.push((async () => {
    api.save();
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    ok(confirmCalls === 1 && confirmName === 'mapa.arkmap' && writes.length === 0,
      'A4.5 (UX-5A): pierwszy zapis na handle -> confirm „Nadpisac mapa.arkmap?", write WSTRZYMANY (pre-fix: write od razu, bez pytania)');
    if (!confirmCb) { ok(false, 'A4.5 (UX-5B): po [Nadpisz] -> _bakPut przed write (pre-fix: brak confirmu w ogole)'); return; }
    confirmCb();   // [Nadpisz]
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    ok(writes.length === 1 && writes[0] === 'NEW' && seq[0] === 'bak:mapa.arkmap:OLD' && seq[1] === 'write',
      'A4.5 (UX-5B): po [Nadpisz] -> _bakPut(pristine) PRZED writable.write (kolejnosc), potem nowy zapis');
    ok(state.dirty === false && state.pristineArkmap === 'NEW' && api.confirmed === true,
      'A4.5: po zapisie dirty czyszczone, bufor odswiezony, flaga ustawiona (regresja T6-F2)');
    api.save();    // drugi zapis — juz bez pytania
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    ok(confirmCalls === 1 && writes.length === 2,
      'A4.5 (UX-5A): drugi zapis w sesji -> cicho (confirm tylko raz na handle)');
  })());
}
{
  // — behawioralny B: rotacja N=5 na in-memory IndexedDB —
  // (guard kotwic: pre-fix modulu nie ma — czysty FAIL zamiast wyjatku ekstrakcji)
  const hasBak = HTML.includes('function _bakOpen() {') && HTML.includes('async function _bakPut(name, text) {');
  if (!hasBak) {
    ok(false, 'A4.5 (UX-5B): rotacja N=5 — modul backupu IndexedDB (pre-fix: brak modulu)');
    ok(false, 'A4.5 (UX-5B): wpis ma metadane (ts, size, pokoje) (pre-fix: brak modulu)');
  }
  const BAK_SRC = !hasBak ? 'return { _bakPut: async () => {}, _bakList: async () => [] };'
    : 'const _BAK_MAX = 5;\n'
    + extract(HTML, 'function _bakOpen() {') + '\n'
    + extract(HTML, 'function _bakReq(req) {') + '\n'
    + extract(HTML, 'async function _bakPut(name, text) {') + '\n'
    + extract(HTML, 'async function _bakList() {') + '\n'
    + 'return { _bakPut, _bakList };';
  let autoId = 0;
  const records = new Map();
  const mkReq = (result) => {
    const r = { result, onsuccess: null, onerror: null };
    queueMicrotask(() => { if (r.onsuccess) r.onsuccess(); });
    return r;
  };
  const mkStore = () => ({
    add(rec) { const id = ++autoId; records.set(id, Object.assign({}, rec, { id })); return mkReq(id); },
    delete(id) { records.delete(id); return mkReq(undefined); },
    clear() { records.clear(); return mkReq(undefined); },
    getAll() { return mkReq([...records.values()]); },
    index() { return { getAll: (name) => mkReq([...records.values()].filter(x => x.name === name)) }; },
  });
  const dbStub = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => ({ createIndex: () => {} }),
    transaction: () => ({ objectStore: () => mkStore() }),
    close: () => {},
  };
  const idbStub = {
    open() {
      const r = { result: dbStub, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => { if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); });
      return r;
    },
  };
  const bak = new Function('state', 'indexedDB', BAK_SRC)({ areas: new Map() }, idbStub);
  if (hasBak) ASYNC_PINS_SD.push((async () => {
    for (let i = 1; i <= 6; i++) await bak._bakPut('mapa.arkmap', 'T' + i);
    await bak._bakPut('inna.arkmap', 'X1');   // inna nazwa — osobna rotacja
    const list = await bak._bakList();
    const mapa = list.filter(e => e.name === 'mapa.arkmap').map(e => e.text).sort();
    ok(list.length === 6 && mapa.length === 5 && mapa.join(',') === 'T2,T3,T4,T5,T6',
      'A4.5 (UX-5B): rotacja N=5 — 6. zapis kasuje najstarszy wpis TEJ nazwy, inne nazwy nietkniete');
    ok(list.every(e => typeof e.ts === 'number' && typeof e.size === 'number' && e.rooms === 0),
      'A4.5 (UX-5B): wpis ma metadane (ts, size, pokoje) do listowania w dialogu');
  })());
}
{
  // — behawioralny C: dialog listuje wpisy; [Pobierz] -> saveWithDialog z sugerowana nazwa —
  // (guard kotwic: pre-fix dialogu nie ma — czysty FAIL zamiast wyjatku ekstrakcji)
  const hasDlg = HTML.includes('async function showBackupsDialog() {');
  if (!hasDlg) {
    ok(false, 'A4.5 (UX-5B): dialog listuje wpisy (pre-fix: brak showBackupsDialog)');
    ok(false, 'A4.5 (UX-5B): [Pobierz .arkmap] -> saveWithDialog (pre-fix: brak dialogu)');
  }
  const DLG_SRC = !hasDlg ? 'return { showBackupsDialog: async () => {} };'
    : extract(HTML, 'function _bakFmtSize(n) {') + '\n'
    + extract(HTML, 'function _bakTs(ts) {') + '\n'
    + extract(HTML, 'async function showBackupsDialog() {') + '\n'
    + 'return { showBackupsDialog };';
  const rows = [];
  const listEl = {
    innerHTML: '',
    appendChild(r) { rows.push(r); },
  };
  const mkRow = () => {
    const btns = {};
    return {
      style: {},
      innerHTML: '',
      querySelector(sel) { return btns[sel] || (btns[sel] = { onclick: null }); },
    };
  };
  const opened = [], saves = [];
  const entries = [{ id: 7, name: 'mapa.arkmap', ts: 1760000000000, rooms: 1234, size: 2 * 1048576, text: 'TXT' }];
  const dlg = new Function('document', 'openDialog', 'closeDialog', 'escHtml', 'saveWithDialog', 'toast',
    '_bakList', '_bakDelete', DLG_SRC)
    ({ getElementById: (id) => (id === 'bak-list' ? listEl : null), createElement: () => mkRow() },
      (id) => opened.push(id), () => {}, (s) => String(s),
      async (name, mime, fn) => { saves.push({ name, mime, text: fn() }); return null; },
      () => {}, async () => entries, async () => {});
  if (hasDlg) ASYNC_PINS_SD.push((async () => {
    await dlg.showBackupsDialog();
    ok(opened[0] === 'dlg-backups' && rows.length === 1 &&
       rows[0].innerHTML.includes('mapa.arkmap') && rows[0].innerHTML.includes('1234 pokoi') && rows[0].innerHTML.includes('2.0 MB'),
      'A4.5 (UX-5B): dialog listuje wpisy (nazwa, pokoje, rozmiar) — pre-fix: brak dialogu');
    rows[0].querySelector('[data-dl]').onclick();
    await new Promise(r => setImmediate(r));
    ok(saves.length === 1 && /^mapa\.kopia-\d{8}-\d{6}\.arkmap$/.test(saves[0].name) &&
       saves[0].mime === 'application/json' && saves[0].text === 'TXT',
      'A4.5 (UX-5B): [Pobierz .arkmap] -> saveWithDialog z sugerowana nazwa <nazwa>.kopia-<ts>.arkmap i trescia wpisu');
  })());
}

// ═══ A4.6 (UX-6): fallback saveWithDialog informuje o Pobranych ═══
console.log('— A4.6 (UX-6): toast fallbacku saveWithDialog —');
ASYNC_PINS_SD.push((async () => {
  const src = extract(HTML, 'async function saveWithDialog(defaultName, mimeType, dataFn) {') + '\nreturn saveWithDialog;';
  const mk = (win) => {
    const toasts = [], dls = [];
    const fn = new Function('window', 'toast', 'download', 'downloadBinary', 'fmtSz', src)
      (win, (m) => toasts.push(String(m)), (n, t) => dls.push([n, t]), (n) => dls.push([n]), () => '');
    return { fn, toasts, dls };
  };
  // Sciezka 1: brak FS API
  const a = mk({});
  const ra = await a.fn('raport.html', 'text/html', () => 'TRESC');
  ok(ra === true && a.dls.length === 1 && a.dls[0][0] === 'raport.html',
    'A4.6: fallback <a download> bez FS API dziala (regresja helpera)');
  ok(a.toasts.some(t => /nie wspiera wyboru/.test(t) && /Pobranych: raport\.html/.test(t)),
    'A4.6 (UX-6): brak FS API -> toast „plik trafil do Pobranych: <nazwa>" (pre-fix: „[pobrano domyslnie]" bez wyjasnienia)');
  // Sciezka 2: picker odrzucony bledem (np. wygasla aktywacja po async yieldach)
  const b = mk({ showSaveFilePicker: async () => { const e = new Error('gest wygasl'); e.name = 'SecurityError'; throw e; } });
  const rb = await b.fn('r2.md', 'text/markdown', () => 'T');
  ok(rb === true && b.dls.length === 1 && b.toasts.some(t => /Pobranych: r2\.md/.test(t)),
    'A4.6 (UX-6): odrzucony picker -> fallback z tym samym toastem o Pobranych (pre-fix: „Zapisano" sugerujace wybor sciezki)');
  // Regresja: anulowanie przez usera = cisza (bez toastu o Pobranych)
  const c = mk({ showSaveFilePicker: async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; } });
  const rc = await c.fn('r3.md', 'text/markdown', () => 'T');
  ok(rc === false && c.dls.length === 0 && !c.toasts.some(t => /Pobranych/.test(t)),
    'A4.6: AbortError (anulowanie) -> bez fallbacku, bez toastu (regresja K6)');
})());

// ═══ Sekcja D (Arc 40, v1.50.2): showValDialog z placeholderem deferred ═══
// Bug: loadArkmap (P3b) podaje dialogowi { present: true, deferred: true } — body
// nie mialo galezi deferred i crashowalo na chkRes.badAreas.slice (cicha smierc
// loadu .arkmap z sumami + jakikolwiek warning/suppressor, np. mapa 0.208.0).
// Lekcja pokrycia: pin "chkRes.deferred" zaspokajal sie raportem schowka — D1
// liczy DOKLADNIE 2 miejsca obslugi (raport + body).
console.log('— Sekcja D (Arc 40): showValDialog — placeholder deferred —');
{
  const dlgSrc = extract(HTML, "window.showValDialog = function(valRes, chkRes, filename, isFatal, suppMissing) {");
  ok(HTML.split('chkRes.deferred').length - 1 === 2,
    'D1: deferred obsluzony w DOKLADNIE 2 miejscach (raport schowka + body dialogu) — jest ' + (HTML.split('chkRes.deferred').length - 1));
  const iDef = dlgSrc.indexOf('if (chkRes.deferred) {');
  const iOk  = dlgSrc.indexOf('if (chkRes.ok) {');
  ok(iDef > 0 && iOk > 0 && iDef < iOk, 'D2: body dialogu — gałąź deferred PRZED gałęzią ok (nie spada do badAreas)');

  // Behawioralnie: render body z placeholderem deferred (verbatim IIFE + stub DOM)
  const iife = extract(HTML, "(function() {\n  const overlay  = document.getElementById('val-modal-overlay');");
  const suppSrc = extract(HTML, 'function _suppLine(m) {') + '\n' + extract(HTML, 'function _suppSort(missing) {');
  const mkEl = () => {
    const el = {
      className: '', textContent: '', style: {}, children: [], _ls: {}, _cls: new Set(),
      set innerHTML(v) { if (v === '') this.children.length = 0; },
      get innerHTML() { return ''; },
      classList: { add(c) { el._cls.add(c); }, remove(c) { el._cls.delete(c); }, contains(c) { return el._cls.has(c); } },
      appendChild(c) { this.children.push(c); },
      addEventListener(ev, fn) { this._ls[ev] = fn; },
    };
    return el;
  };
  const allText = (el) => [el.textContent || '', ...el.children.map(allText)].join('\n');
  const mkDialog = () => {
    const els = {};
    const doc = { getElementById: (id) => (els[id] = els[id] || mkEl()), createElement: () => mkEl(), addEventListener() {} };
    const win = {};
    new Function('document', 'window', 'saveWithDialog', 'buildDiagnosticsReport', '_valReportSections',
                 '_copyReportToClipboard', '_reportMapName', '_reportTs', '_reportHtmlDoc', 'APP_VERSION', 'navigator', 'console',
      suppSrc + '\n' + iife + ')();\n;return 0;')(
      doc, win, () => {}, () => '', () => '', () => {}, () => 'm', () => 't', () => '', 'vT', { clipboard: { writeText: async () => {} } }, console);
    return { els, show: win.showValDialog };
  };
  const FULL = { present: true, ok: false, fileOk: false, badAreas: [{ name: 'ObsZ', id: 7 }], badRooms: [], missingRooms: [], missingAreas: [], extraRooms: [], extraAreas: [] };

  ASYNC_PINS_SD.push((async () => {
    // D3-D7: placeholder deferred — pre-fix: TypeError na badAreas.slice (cicha smierc loadu)
    const d1 = mkDialog();
    let threw = null, resolved = null;
    const supp = [{ roomA: 7226, dir: 'n', roomB: 16210, oppDir: 's' }];
    try {
      const p = d1.show({ ok: true, errors: [], warnings: [{ path: 'areas[0]', msg: 'w' }] }, { present: true, deferred: true }, 'm.arkmap', false, supp);
      p.then((r) => { resolved = r; }, (e) => { threw = e; });  // executor catchuje throw w reject
    } catch (e) { threw = e; }
    await new Promise((r) => setTimeout(r, 0));  // wykonaj executor przed asercjami
    ok(threw === null, 'D3: render z { present: true, deferred: true } NIE rzuca (pre-fix: TypeError badAreas.slice)');
    const txt = allText(d1.els['val-modal-body']);
    ok(txt.includes('weryfikacja po wczytaniu'), 'D4: body pokazuje notke deferred (weryfikacja w tle)');
    ok(!/niezgodn/i.test(txt), 'D5: body NIE spada do gałęzi niezgodnej sumy (badAreas/badRooms)');
    ok(txt.includes('PODWÓJNE LINIE — 1'), 'D6: sekcja podwójnych linii renderuje się przy deferze');
    d1.els['val-btn-load']._ls.click();
    await new Promise((r) => setTimeout(r, 0));
    ok(resolved === true, 'D7: przycisk Wczytaj rozwiązuje dialog true');

    // D8: pelny wynik verifyChecksums — gałąź niezgodnej sumy nadal dziala (regresja else-if)
    const d2 = mkDialog();
    let threw2 = null;
    try { d2.show({ ok: true, errors: [], warnings: [] }, FULL, 'm.arkmap', false, null); } catch (e) { threw2 = e; }
    const txt2 = allText(d2.els['val-modal-body']);
    ok(threw2 === null && txt2.includes('niezgodna') && txt2.includes('Obszar: ObsZ (id=7)'),
      'D8: pełny chkRes — sekcja niezgodnej sumy renderuje obszary (bez zmian)');
  })());
}

Promise.all(ASYNC_PINS_SD).then(() => {
  console.log(`\n═══ save_dialogs.js: PASS ${pass} / FAIL ${fail} ═══`);
  process.exit(fail ? 1 : 0);
});
