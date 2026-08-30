// Harness — fix_batch_v1445.js: finalny batch fixow v1.44.5 (R1 + K1 + K2 + K3).
// Sekcja A (R1): startClDrawingExisting ustawia state.clRoom — edycja punktow
//                istniejacej CL na canvasie (ekstrakt verbatim + mock).
// Sekcja B (K1): saveWithDialog — guard na null z dataFn (np. toBlob) w obu galeziach
//                (FSAPI + fallback) — test behawioralny na ekstrakcie.
// Sekcja C (K2): handlery odczytu plikow (fiArkmap change, handleDropFiles, fiArkdelta
//                change) — obsluga rejection file.text() — piny + test behawioralny.
// Sekcja D (K3): hideExitDetail czysci _activeSpecialExit (ekstrakt + mock).
// Sekcja E: pin APP_VERSION.
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
for (const a of ['function startClDrawingExisting(dir) {',
                 'async function saveWithDialog(defaultName, mimeType, dataFn) {',
                 'function hideExitDetail() {',
                 "fiArkmap.addEventListener('change', async e => {"]) {
  if (HTML.indexOf(a) !== HTML.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}

// ═══ Sekcja A — R1: startClDrawingExisting ustawia state.clRoom ═══
console.log('— Sekcja A: R1 startClDrawingExisting —');
{
  const codeA = extract(HTML, 'function startClDrawingExisting(dir) {') +
    '\nreturn { startClDrawingExisting };';
  const mkA = new Function('state', 'setCanvasMode', codeA);

  // A1-A6: sciezka szczescia — pokoj z CL w kierunku 'n'
  const room = { id: 5, custom_lines: { n: { points: [[1, 2], [3, 4]], color: [255, 0, 0] } } };
  const state = { selected: 5, roomById: { 5: room }, clRoom: null, clIsNew: null,
                  clDir: null, clPoints: null, clOriginalPoints: null };
  let mode = null;
  const { startClDrawingExisting } = mkA(state, m => { mode = m; });
  startClDrawingExisting('n');
  ok(state.clRoom === room, 'A1 clRoom ustawione na pokoj (fix R1)');
  ok(state.clIsNew === false, 'A2 clIsNew === false');
  ok(state.clDir === 'n', 'A3 clDir ustawione');
  ok(Array.isArray(state.clPoints) && state.clPoints.length === 2, 'A4 clPoints z CL');
  ok(state.clPoints !== room.custom_lines.n.points &&
     state.clPoints[0] !== room.custom_lines.n.points[0], 'A5 clPoints gleboka kopia');
  ok(mode === 'cl-drawing', 'A6 setCanvasMode(cl-drawing)');

  // A7: guard — pokoj bez CL w danym kierunku: wczesny return, zero mutacji
  const state2 = { selected: 5, roomById: { 5: { id: 5, custom_lines: {} } },
                   clRoom: null, clIsNew: null, clDir: null };
  let mode2 = null;
  mkA(state2, m => { mode2 = m; }).startClDrawingExisting('s');
  ok(state2.clRoom === null && state2.clIsNew === null && state2.clDir === null && mode2 === null,
    'A7 guard: brak CL → bez mutacji stanu');

  // A8: guard — brak zaznaczenia
  const state3 = { selected: null, roomById: {}, clRoom: null };
  mkA(state3, () => { throw new Error('nie powinno wejsc'); }).startClDrawingExisting('n');
  ok(state3.clRoom === null, 'A8 guard: brak selected → return');
}

// ═══ Sekcja B — K1: saveWithDialog guard na null z dataFn ═══
console.log('— Sekcja B: K1 saveWithDialog null-guard —');
{
  ok(HTML.match(/audyt K1: toBlob moze zwrocic null/g)?.length === 2,
    'B1 pin: 2 guardy K1 w saveWithDialog (FSAPI + fallback)');

  const codeB = extract(HTML, 'async function saveWithDialog(defaultName, mimeType, dataFn) {') +
    '\nreturn { saveWithDialog };';
  const mkB = new Function('window', 'toast', 'download', 'downloadBinary', codeB);

  // B2: fallback (brak FSAPI) + dataFn null → toast bledu, return false, download nie wywolane
  {
    const calls = { toast: [], download: 0, downloadBinary: 0 };
    const w = {};  // brak showSaveFilePicker
    const saveWithDialog = mkB(w, (m, isErr) => calls.toast.push([m, isErr]),
      () => calls.download++, () => calls.downloadBinary++).saveWithDialog;
    saveWithDialog('x.png', 'image/png', async () => null).then(r => {
      ok(r === false, 'B2 fallback+null → return false');
      ok(calls.toast.length === 1 && calls.toast[0][1] === true &&
         calls.toast[0][0].includes('Nie udało się wygenerować'), 'B3 fallback+null → toast bledu');
      ok(calls.download === 0 && calls.downloadBinary === 0, 'B4 fallback+null → zero zapisu');

      // B5: fallback + dataFn string → download wywolane, return true
      const c2 = { toast: [], download: 0, downloadBinary: 0 };
      const sd2 = mkB({}, m => c2.toast.push(m),
        () => c2.download++, () => c2.downloadBinary++).saveWithDialog;
      return sd2('x.md', 'text/markdown', async () => 'abc').then(r2 => {
        ok(r2 === true && c2.download === 1, 'B5 fallback+string → download, return true');

        // B6-B8: FSAPI + dataFn null → toast bledu, return false, writable.write nie wywolane
        const c3 = { toast: [], write: 0 };
        const w3 = { showSaveFilePicker: async () => ({
          name: 'x.png',
          createWritable: async () => ({ write: async () => c3.write++, close: async () => {} }),
        }) };
        const sd3 = mkB(w3, (m, isErr) => c3.toast.push([m, isErr]),
          () => {}, () => {}).saveWithDialog;
        return sd3('x.png', 'image/png', async () => null).then(r3 => {
          ok(r3 === false, 'B6 FSAPI+null → return false');
          ok(c3.toast.length === 1 && c3.toast[0][1] === true, 'B7 FSAPI+null → toast bledu');
          ok(c3.write === 0, 'B8 FSAPI+null → writable.write nie wywolane');
        });
      });
    }).then(() => sectionC()).catch(e => { fail++; console.log('  FAIL B-async: ' + e.message); sectionC(); });
  }
}

// ═══ Sekcja C — K2: obsluga rejection file.text() ═══
function sectionC() {
  console.log('— Sekcja C: K2 rejection file.text() —');
  ok(HTML.match(/audyt K2/g)?.length === 4,
    'C1 pin: 4 guardy K2 (fiArkmap 1, drop 2, arkdelta 1)');

  // C2: ekstrakt handlera fiArkmap change — rejection → toast, loadArkmap nie wywolane
  const codeC =
    'let _handler; const fiArkmap = { addEventListener: (ev, fn) => { _handler = fn; } };\n' +
    extract(HTML, "fiArkmap.addEventListener('change', async e => {") + ');\n' +
    '\nreturn { fire: _handler };';
  const mkC = new Function('checkLocalLoadDuringEdit', 'loadArkmap', 'toast', codeC);
  const callsC = { toast: [], load: [] };
  const { fire } = mkC(() => false, async (t, n) => callsC.load.push([t, n]),
    (m, isErr) => callsC.toast.push([m, isErr]));
  const badFile = { name: 'zepsuty.arkmap', text: async () => { throw new Error('read fail'); } };
  const goodFile = { name: 'dobra.arkmap', text: async () => '{"format":"arkmap"}' };
  fire({ target: { files: [badFile], value: 'x' } }).then(() => {
    ok(callsC.toast.length === 1 && callsC.toast[0][1] === true &&
       callsC.toast[0][0].includes('zepsuty.arkmap'), 'C2 rejection → toast bledu z nazwa pliku');
    ok(callsC.load.length === 0, 'C3 rejection → loadArkmap nie wywolane');
    return fire({ target: { files: [goodFile], value: 'x' } });
  }).then(() => {
    ok(callsC.load.length === 1 && callsC.load[0][0] === '{"format":"arkmap"}' &&
       callsC.load[0][1] === 'dobra.arkmap', 'C4 sukces → loadArkmap(text, name)');
    sectionD();
  }).catch(e => { fail++; console.log('  FAIL C-async: ' + e.message); sectionD(); });
}

// ═══ Sekcja D — K3: hideExitDetail czysci _activeSpecialExit ═══
function sectionD() {
  console.log('— Sekcja D: K3 hideExitDetail —');
  const codeD = extract(HTML, 'function hideExitDetail() {') + '\nreturn { hideExitDetail };';
  const mkD = new Function('document', 'state', 'scheduleDraw', codeD);
  const state = { _activeExitDir: 'n', _activeSpecialExit: 'wypełć drzwiami' };
  let drawn = 0;
  const doc = { getElementById: () => null, querySelectorAll: () => [] };
  mkD(doc, state, () => drawn++).hideExitDetail();
  ok(state._activeExitDir === null, 'D1 _activeExitDir czyszczone');
  ok(state._activeSpecialExit === null, 'D2 _activeSpecialExit czyszczone (fix K3)');
  ok(drawn === 1, 'D3 draw() wywolane');

  // ═══ Sekcja E — pin wersji ═══
  console.log('— Sekcja E: pin wersji —');
  ok(HTML.includes("const APP_VERSION = 'v1.52.3';"), 'E1 APP_VERSION = v1.52.3');

  console.log(`\n═══ fix_batch_v1445.js: PASS ${pass} / FAIL ${fail} ═══`);
  process.exit(fail ? 1 : 0);
}
