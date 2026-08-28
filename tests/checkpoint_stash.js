// Harness hardeningu v1.50.1 (Arc 39) — zastaly stash _loadCheckpointText/_deferVerify
// przy wyjatku w oknie loadu (miedzy podlozeniem przez loadArkmap a konsumpcja
// w wrapperze applyMap). Finding audytu zewnetrznego fal 1-5 (oba silniki zbieznie).
// Pre-fix: wyjatek w _origApplyMap/exitEditMode zostawial zastaly tekst .arkmap,
// ktory NASTEPNY load konsumowal jako pristineArkmap (restoreLastSave przywrociloby
// zla mape). Fix: try/catch na calym oknie, catch czysci BEZ konsumpcji + rethrow.
// Repro-first: ARKMAP_HTML=<stary html> node tests/checkpoint_stash.js musi dac FAIL-e.
// Statycznie + behawioralnie (ekstrakcja verbatim). Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(process.env.ARKMAP_HTML || path.join(ROOT, 'arkmap_studio.html'), 'utf8');

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

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── T1: piny statyczne ──────────────────────────────────────────────────────
console.log('── T1: piny statyczne ──');
{
  const wrap = extract(HTML, 'applyMap = function(map) {');
  ok(wrap.includes('try {'), 'wrapper: cialo w try (ochrona okna stash→konsumpcja)');
  ok(wrap.indexOf('try {') < wrap.indexOf('_origApplyMap(map);'), 'try obejmuje _origApplyMap (poczatek okna)');
  const ci = wrap.indexOf('} catch (e) {');
  const consI = wrap.indexOf('state.pristineArkmap = state._loadCheckpointText || _serializeMap();');
  ok(ci > 0 && consI > 0 && ci > consI, 'catch ZA konsumpcja — cale okno w try');
  const catchBody = wrap.slice(ci);
  ok(catchBody.includes('state._loadCheckpointText = null;') && catchBody.includes('state._deferVerify = null;'),
    'catch czysci oba flagi (powrot do stanu inicjalnego null/null)');
  ok(catchBody.includes('throw e;'), 'catch przepuszcza wyjatek dalej (widocznosc bledu bez zmian)');
  ok(!catchBody.includes('pristineArkmap') && !catchBody.includes('_serializeMap'),
    'catch czysci BEZ konsumpcji (zadnego pristineArkmap/_serializeMap w catch)');
  ok(HTML.split('state.pristineArkmap = state._loadCheckpointText || _serializeMap();').length - 1 === 1,
    'dokladnie jedna konsumpcja stashu w calym pliku');
}

// ── T2-T6: behawioralnie — wrapper applyMap ─────────────────────────────────
// Impl przelaczane per scenariusz (jeden fn, mutowalne hooki).
function mk() {
  const impl = {
    orig: () => {},                       // _origApplyMap
    exit: null,                           // exitEditMode (null = nie zdefiniowany throw)
    base: () => ({ crc: 'B' }),           // _computeBaseInfo
  };
  const rafCalls = [];
  const st = {
    editMode: false, filename: 'm.arkmap', map: { areas: [] },
    _loadCheckpointText: null, _deferVerify: null,
    pristineArkmap: null, baseInfo: undefined, _verifyPending: undefined,
    undoStack: ['u'], redoStack: ['r'], deltaLog: ['d'], dirty: true,
    editDirty: true, editSnapshot: {}, areaSnapshot: {}, selectedLabel: 'L',
    lockExpiry: 123, canvasMode: 'paint', currentFileName: 'stary', selected: 5,
  };
  const src = extract(HTML, 'applyMap = function(map) {');
  const fn = new Function(
    'state', 'exitEditMode', '_deltaGhostReset', '_computeBaseInfo', 'requestAnimationFrame',
    'window', '_postLoadVerifyDeferred', '_serializeMap', 'document', 'hideBanners',
    'updateUndoRedoUI', 'updateEditUI', 'cv', 'clearInterval', '_origApplyMap',
    'var _lockInterval=null, _paintStroke=null, _arkmapFileHandle={}, _arkmapOverwriteConfirmed=true, applyMap;\n' +
    src + '\n;return applyMap;'
  )(
    st,
    () => { if (impl.exit) impl.exit(); },
    () => {},
    (a, b) => impl.base(a, b),
    (cb) => { rafCalls.push(cb); },
    {},
    () => {},
    () => 'SERIALIZED-B',
    { getElementById: () => null },
    () => {}, () => {}, () => {},
    { style: {} },
    () => {},
    (m) => impl.orig(m),
  );
  return { fn, st, impl, rafCalls };
}

console.log('── T2: throw w _origApplyMap — flagi czyszczone BEZ konsumpcji ──');
{
  const { fn, st, impl } = mk();
  impl.orig = () => { throw new Error('boom'); };
  st._loadCheckpointText = 'STALE-A'; st._deferVerify = true;
  let caught = null;
  try { fn({}); } catch (e) { caught = e.message; }
  ok(caught === 'boom', 'wyjatek przepuszczony (rethrow)');
  ok(st._loadCheckpointText === null && st._deferVerify === null, 'oba flagi wyczyszczone do null');
  ok(st.pristineArkmap === null, 'pristineArkmap nietkniete — zastaly tekst NIE skonsumowany');

  console.log('── T3: kolejny load (styl .dat) po throw — zero zastanego tekstu ──');
  impl.orig = () => {};
  fn({});
  ok(st.pristineArkmap === 'SERIALIZED-B', 'pristine z serializacji nowej mapy, NIE ze stashu (pre-fix: STALE-A)');
  ok(st._verifyPending === false && st.baseInfo && st.baseInfo.crc === 'B', 'bez defer: baseInfo sync, _verifyPending false');
}

console.log('── T4: happy path .arkmap — stash konsumowany (pin P3a) ──');
{
  const { fn, st, rafCalls } = mk();
  st._loadCheckpointText = 'FILE-A'; st._deferVerify = true;
  fn({});
  ok(st.pristineArkmap === 'FILE-A', 'checkpoint = surowy tekst pliku (P3a nietkniete)');
  ok(st._loadCheckpointText === null && st._deferVerify === null, 'oba flagi skonsumowane (null)');
  ok(st._verifyPending === true && st.baseInfo === null && rafCalls.length === 1,
    'defer: _verifyPending true, baseInfo null do klatki, rAF zaplanowane');
}

console.log('── T5: throw PO konsumpcji defer (w _computeBaseInfo) — idempotentnosc ──');
{
  const { fn, st, impl } = mk();
  impl.base = () => { throw new Error('base-boom'); };
  let caught = null;
  try { fn({}); } catch (e) { caught = e.message; }
  ok(caught === 'base-boom', 'wyjatek z _computeBaseInfo przepuszczony');
  ok(st._loadCheckpointText === null && st._deferVerify === null && st.pristineArkmap === null,
    'czyszczenie idempotentne (null→null), pristine niedoszlo do skutku');
}

console.log('── T6: throw w exitEditMode (sam poczatek okna) ──');
{
  const { fn, st, impl } = mk();
  st.editMode = true;
  impl.exit = () => { throw new Error('exit-boom'); };
  st._loadCheckpointText = 'STALE-A'; st._deferVerify = true;
  let caught = null;
  try { fn({}); } catch (e) { caught = e.message; }
  ok(caught === 'exit-boom', 'wyjatek z exitEditMode przepuszczony');
  ok(st._loadCheckpointText === null && st._deferVerify === null, 'flagi wyczyszczone mimo throwa na wejsciu');
  ok(st.pristineArkmap === null, 'pristineArkmap nietkniete');
}

console.log(`\n═══ PODSUMOWANIE: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
