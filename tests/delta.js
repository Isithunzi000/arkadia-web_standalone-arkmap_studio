// Harness — delta.js: fundamenty formatu .arkdelta.
// Sekcja T1 (v1.5.43): state.deltaLog — pelny log edycji, lustro operacji bez capu 50.
// Kolejne sekcje (eksport/walidacja/apply) dojda z blokiem ARKDELTA.
// Uruchamianie z katalogu głównego repo.
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
const FNS = [
  'function pushUndo(entry) {',
  'function undoAction() {',
  'function redoAction() {',
  'function undoToIndex(targetIdx) {',
  'function undoAll() {',
  'function redoAll() {',
];
for (const a of FNS) {
  if (HTML.indexOf(a) !== HTML.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}
const code = FNS.map(a => extract(HTML, a)).join('\n') +
  '\n;return { pushUndo, undoAction, redoAction, undoToIndex, undoAll, redoAll };';

function makeCtx() {
  const state = { undoStack: [], redoStack: [], deltaLog: [], dirty: false };
  const undid = [], redid = [], toasts = [];
  const fn = new Function(
    'state', '_dispatchUndo', '_dispatchRedo', 'updateUndoRedoUI', 'draw', 'toast', 'plPl', 'document',
    code
  );
  const api = fn(
    state,
    (e) => undid.push(e), (e) => redid.push(e),
    () => {}, () => {},
    (m) => toasts.push(m),
    (n, one) => n + ' ' + one,
    { getElementById: () => null }
  );
  return { state, undid, redid, api };
}
const mk = (i) => ({ type: 'EDIT_ROOM', roomId: i, label: 'op ' + i });

console.log('— T1: deltaLog — lustro operacji bez capu —');
{
  const { state, api } = makeCtx();
  api.pushUndo(mk(1)); api.pushUndo(mk(2)); api.pushUndo(mk(3));
  ok(state.undoStack.length === 3 && state.deltaLog.length === 3, 'push x3: undoStack 3, deltaLog 3');
  ok(state.deltaLog[2].roomId === 3 && state.deltaLog[0].roomId === 1, 'deltaLog: kolejnosc i identycznosc wpisow');

  api.undoAction();
  ok(state.undoStack.length === 2 && state.deltaLog.length === 2, 'undoAction: oba stosy 2');
  ok(state.deltaLog.every(e => e.roomId !== 3), 'undoAction: cofnieta operacja znika z deltaLog');

  api.redoAction();
  ok(state.undoStack.length === 3 && state.deltaLog.length === 3 && state.deltaLog[2].roomId === 3,
    'redoAction: operacja wraca do deltaLog');

  api.undoToIndex(1);
  ok(state.undoStack.length === 1 && state.deltaLog.length === 1 && state.deltaLog[0].roomId === 1,
    'undoToIndex(1): oba stosy 1, zostaje najstarsza');

  api.redoAll();
  ok(state.undoStack.length === 3 && state.deltaLog.length === 3, 'redoAll: oba stosy 3');

  api.undoAll();
  ok(state.undoStack.length === 0 && state.deltaLog.length === 0, 'undoAll: oba stosy puste');
}
{
  // Cap 50 siedzi inline przy miejscach wywołań (NIE w pushUndo) — symulacja wzorca aplikacji:
  const { state, api } = makeCtx();
  for (let i = 1; i <= 60; i++) {
    api.pushUndo(mk(i));
    if (state.undoStack.length > 50) state.undoStack.shift();  // wzorzec z miejsc wywołań
  }
  ok(state.undoStack.length === 50, 'po 60 pushach z capem: undoStack 50');
  ok(state.deltaLog.length === 60, 'po 60 pushach: deltaLog 60 (bez capu — pelna historia dla eksportu)');
  ok(state.deltaLog[0].roomId === 1 && state.deltaLog[59].roomId === 60, 'deltaLog: pierwsze operacje nie giną');
  api.undoAction();
  ok(state.deltaLog.length === 59 && state.undoStack.length === 49, 'undo po przepełnieniu: mirror spójny');
}
{
  // Asercje strukturalne — kompletność mirroringu poza ścieżkami funkcyjnymi:
  const cancel = extract(HTML, 'function cancelRoomEdit() {');
  ok(cancel.includes('state.deltaLog.pop();'), 'cancelRoomEdit (cichy pop A11\'): mirror deltaLog.pop');
  ok(HTML.includes("state.deltaLog = [];  // ARKDELTA: nowa mapa = pusty log"),
    'wrapper applyMap: reset deltaLog przy wczytaniu mapy');
  ok(HTML.includes("deltaLog:           [],"), 'state: deklaracja deltaLog');
  const capLines = HTML.split('\n').filter(l => l.includes('undoStack.shift()'));
  ok(capLines.length === 30 && capLines.every(l => !l.includes('deltaLog')),
    'cap 50 (30 miejsc inline) nigdy nie dotyka deltaLog');
}

console.log('');
console.log('delta: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
