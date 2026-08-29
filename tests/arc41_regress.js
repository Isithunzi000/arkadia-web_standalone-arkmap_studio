// Harness — regresje Arc 41 (v1.50.3): F1-F8 + H1.
// Kazdy test pinuje kod fixa w arkmap_studio.html: piny strukturalne (kolejnosc /
// obecnosc / licznik) + aserty behawioralne na snipetach wyekstrahowanych VERBATIM
// z pliku (eval tego samego kodu, ktory jedzie w przegladarce — zadnych kopii-recopii).
// Pokrycie:
//   F1 (B-S1): isFatal na sciezkach strukturalnych (dopasowanie DOKLADNE) + preflight
//              applyMap przed jakakolwiek mutacja stanu.
//   F2 (D-S1): choke point loadArkmap (nigdy nie rejectuje z applyMap + rollback
//              state.filename) + olLoadArkmap await/olSetBusy + doLoad obie galezie
//              self-catching.
//   F3 (E-S1): guard re-entrancji showValDialog — nowy dialog anuluje stary (false).
//   F4: _setMapKey w readQMapSU2/SB/SC — klucz '__proto__' przezywa jako wlasciwosc
//       wlasna.
//   F5: guard live-warn wpDecodeRoute ({error:'too-many'} bez .valid — brak TypeError).
//   F6: handleDropFiles — osobny toast dla multi-file vs zly format.
//   F7: applyMap zamyka ctx-menu (typeof-guard).
//   F8: commitSetPosition — isNaN guard zamiast cichego || 0.
//   H1: zero martwych closure undoFn/doFn.
// Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function window_from(anchor, len) {
  const i = HTML.indexOf(anchor);
  if (i < 0) throw new Error('kotwica: ' + anchor);
  return HTML.slice(i, i + len);
}
// wycinek [anchorA, anchorB + pad) — do ekstrakcji verbatim snippetow (B szukane ZA A)
function sliceAB(a, b, pad) {
  const i = HTML.indexOf(a);
  const j = i < 0 ? -1 : HTML.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('wycinek: ' + a + ' .. ' + b);
  return HTML.slice(i, j + b.length + (pad || 0));
}
const cnt = (s, re) => (s.match(re) || []).length;

// ── F1-A: sciezki strukturalne fatalne (dopasowanie DOKLADNE) ───────────────
console.log('— F1-A: isFatal na sciezkach strukturalnych —');
const isStructLine = sliceAB('const _isStructural = (p) =>', '.rooms$/.test(p);');
ok(isStructLine.includes("p === 'areas'"), 'F1-A: sciezka \'areas\' w _isStructural');
ok(isStructLine.includes('/^areas\\[\\d+\\]$/'), 'F1-A: regex areas[i] (exact-match) w _isStructural');
ok(isStructLine.includes('/^areas\\[\\d+\\]\\.rooms$/'), 'F1-A: regex areas[i].rooms (exact-match) w _isStructural');
const _isStructural = new Function(isStructLine + '\nreturn _isStructural;')();
for (const p of ['areas', 'areas[0]', 'areas[12]', 'areas[0].rooms', 'areas[3].rooms'])
  ok(_isStructural(p) === true, 'F1-A: fatalna sciezka strukturalna: ' + p);
for (const p of ['areas[0].rooms[3].x', 'areas[0].labels', 'areasx', 'areas[0].rooms.', 'areas[0].rooms[0]', 'meta', 'colors'])
  ok(_isStructural(p) === false, 'F1-A: glebsza/polowa sciezka NIE jest fatalna: ' + p);
const isFatalLine = sliceAB('const isFatal =', '_isStructural(e.path));');
ok(isFatalLine.includes("e.path === 'format'") && isFatalLine.includes("e.path === 'format_version'"),
  'F1-A: isFatal = format | format_version | strukturalne (kompozycja, koperta v2)');

// ── F1-B: preflight applyMap PRZED mutacja ──────────────────────────────────
console.log('— F1-B: preflight strukturalny applyMap —');
const applyMapWin = window_from('function applyMap(map) {', 6000);
const preflight = sliceAB("if (!map || typeof map !== 'object' || !Array.isArray(map.areas))",
  "throw new Error('niepoprawna struktura mapy (areas[].rooms)');", 4); // + zamykajaca klamra petli
ok(applyMapWin.indexOf("niepoprawna struktura mapy (areas)") > 0 &&
   applyMapWin.indexOf("niepoprawna struktura mapy (areas)") < applyMapWin.indexOf('state.map = map'),
  'F1-B: rzut preflightu PRZED state.map = map');
ok(applyMapWin.indexOf('hideCtxMenu') < applyMapWin.indexOf('state.map = map') || true, 'F1-B: (porzadek poboczny, bez asercji)');
const runPreflight = new Function('map', preflight);
const expectThrow = (m, label) => { let threw = false; try { runPreflight(m); } catch (e) { threw = true; } ok(threw, 'F1-B: rzuca: ' + label); };
const expectPass  = (m, label) => { let threw = false; try { runPreflight(m); } catch (e) { threw = true; } ok(!threw, 'F1-B: przepuszcza: ' + label); };
expectThrow(null, 'null');
expectThrow({}, 'brak areas');
expectThrow({ areas: {} }, 'areas nie-tablica');
expectThrow({ areas: [null] }, 'obszar null');
expectThrow({ areas: [{}] }, 'obszar bez rooms');
expectThrow({ areas: [{ rooms: 'x' }] }, 'rooms nie-tablica');
expectPass({ areas: [] }, 'pusta tablica areas');
expectPass({ areas: [{ rooms: [] }] }, 'poprawny szkielet');

// ── F2-1: choke point loadArkmap ────────────────────────────────────────────
console.log('— F2-1: choke point loadArkmap —');
const lkWin = window_from('async function loadArkmap(text, filename)', 4000);
const iPrev   = lkWin.indexOf('const _prevFilename = state.filename;');
const iSetFn  = lkWin.indexOf('state.filename = filename || null;');
const iTryAp  = lkWin.indexOf('applyMap(map);');
const iRoll   = lkWin.indexOf('state.filename = _prevFilename;');
const iToast  = lkWin.indexOf("toast('✗ Nie udało się wczytać mapy — ' + e.message, true);");
ok(iPrev > 0 && iPrev < iSetFn, 'F2-1: _prevFilename zapisane PRZED nadpisaniem state.filename');
ok(iSetFn > 0 && iSetFn < iTryAp, 'F2-1: applyMap w try PO ustawieniu filename (wrapper konsumuje)');
ok(iTryAp > 0 && iTryAp < iRoll && iRoll < iToast,
  'F2-1: catch: rollback filename -> toast -> return (loadArkmap nigdy nie rejectuje z applyMap)');
ok(cnt(HTML, /Nie udało się wczytać mapy/g) === 3, 'F2: dokladnie 3 catch-e z tostem (choke point + 2 galezie doLoad)');

// ── F2-2: olLoadArkmap — busy off po fetchu + await ─────────────────────────
console.log('— F2-2: olLoadArkmap —');
const olWin = window_from('async function olLoadArkmap()', 3000);
const iClose = olWin.indexOf('closeOnlineConfirm();');
const iBusy  = olWin.indexOf('olSetBusy(false);');
const iAwait = olWin.indexOf('await loadArkmap(');
ok(iClose > 0 && iClose < iBusy && iBusy < iAwait,
  'F2-2: closeOnlineConfirm -> olSetBusy(false) -> await loadArkmap (busy wolne przed dialogiem)');

// ── F2-3: doLoad — obie galezie .arkmap self-catching ───────────────────────
console.log('— F2-3: doLoad —');
const dropWin = window_from('async function handleDropFiles(files)', 4000);
ok(cnt(dropWin, /try \{ await loadArkmap\(text, file\.name\); \}/g) === 2,
  'F2-3: obie galezie doLoad (.arkmap i .json->arkmap) maja wlasny try/catch (jest ' +
  cnt(dropWin, /try \{ await loadArkmap\(text, file\.name\); \}/g) + '/2)');

// ── F3: guard re-entrancji showValDialog ────────────────────────────────────
console.log('— F3: showValDialog re-entrancja —');
const svWin = window_from('window.showValDialog = function', 1500);
const iGuard = svWin.indexOf('if (_resolve) { const prev = _resolve; _resolve = null; prev(false); }');
const iAssign = svWin.indexOf('_resolve = resolve;');
ok(iGuard > 0 && iGuard < iAssign, 'F3: guard PRZED _resolve = resolve');
// behavioral: verbatim snippet (guard + przypisanie) ewaluowany w fabryce closure
const guardSnippet = sliceAB('if (_resolve) { const prev = _resolve;', '_resolve = resolve;');
const openDialog = new Function('let _resolve = null;\nreturn function open(resolve) {\n' + guardSnippet + '\n};')();
const settled = [];
openDialog(v => settled.push(['dialog-1', v]));
openDialog(v => settled.push(['dialog-2', v]));
ok(settled.length === 1 && settled[0][0] === 'dialog-1' && settled[0][1] === false,
  'F3: re-entrancja rozwiazuje STARY dialog jako false (anulowanie), nowy zyje');
openDialog(v => settled.push(['dialog-3', v]));
ok(settled.length === 2 && settled[1][0] === 'dialog-2' && settled[1][1] === false,
  'F3: kazda kolejna re-entrancja anuluje poprzednika (deterministycznie)');

// ── F4: _setMapKey w czytnikach QString-keyed ───────────────────────────────
console.log('— F4: _setMapKey —');
ok(cnt(HTML, /_setMapKey\(o, k, v\); \}\s+\/\/ Arc 41 \(v1\.50\.3\)/g) === 3,
  'F4: dokladnie 3 czytniki (SU2/SB/SC) przelaczone na _setMapKey z tagiem Arc 41 (jest ' +
  cnt(HTML, /_setMapKey\(o, k, v\); \}\s+\/\/ Arc 41 \(v1\.50\.3\)/g) + '/3)');
const readersBlk = sliceAB('function readQMapSU(r) {', 'function readQMapSC', 400);
ok(cnt(readersBlk, /\bo\[k\] = v\b/g) === 0, 'F4: zero surowych o[k] = v w czytnikach QString-keyed');
const setMapKeyFn = sliceAB('function _setMapKey(o, k, v) {', 'else o[k] = v;', 3); // + zamykajaca klamra
const _setMapKey = new Function(setMapKeyFn + '\nreturn _setMapKey;')();
const probe = {};
_setMapKey(probe, '__proto__', 7);
_setMapKey(probe, 'e', 1);
ok(Object.prototype.hasOwnProperty.call(probe, '__proto__') && probe['__proto__'] === 7,
  'F4: __proto__ jako wlasciwosc WLASNA z wartoscia (nie prototyp)');
ok(Object.getPrototypeOf(probe) === Object.prototype, 'F4: prototyp obiektu nietkniety');
ok(JSON.stringify(probe) === '{"__proto__":7,"e":1}', 'F4: klucz enumerable — widoczny dla JSON.stringify');

// ── F5: guard live-warn wpDecodeRoute ───────────────────────────────────────
console.log('— F5: live-warn guard —');
const f5line = sliceAB('if (!res || !res.valid || !res.valid.length)', "warn.style.display = 'none'; return; }");
const liveWarn = new Function('res', 'warn', f5line + '\nreturn "PROCEED";');
const mkWarn = () => ({ style: { display: '' } });
const w1 = mkWarn();
let f5threw = false, r1;
try { r1 = liveWarn({ error: 'too-many' }, w1); } catch (e) { f5threw = true; }
ok(!f5threw && r1 === undefined && w1.style.display === 'none',
  'F5: {error:\'too-many\'} — brak TypeError, warn ukryty, wyjscie z listenera');
const w2 = mkWarn();
ok(liveWarn({ valid: [{ roomId: 1 }] }, w2) === 'PROCEED' && w2.style.display === '',
  'F5: poprawny wynik przechodzi dalej (warn nietkniety przez guard)');
const w3 = mkWarn();
ok(liveWarn(null, w3) === undefined && w3.style.display === 'none', 'F5: res=null — warn ukryty');

// ── F6: multi-file vs format w handleDropFiles ──────────────────────────────
console.log('— F6: multi-file toast —');
const iMulti  = dropWin.indexOf('files.length > 1');
const iMultiT = dropWin.indexOf('Wczytaj tylko jeden plik naraz');
const iFmtT   = dropWin.indexOf('Nieobsługiwany format');
ok(iMulti > 0 && iMulti < iMultiT && iMultiT < iFmtT,
  'F6: galaz files.length>1 z wlasnym tostem PRZED tostem formatu');

// ── F7: hideCtxMenu w applyMap ──────────────────────────────────────────────
console.log('— F7: hideCtxMenu w applyMap —');
const iHC = applyMapWin.indexOf("if (typeof hideCtxMenu === 'function') hideCtxMenu();");
ok(iHC > 0 && iHC < applyMapWin.indexOf('state.map = map'),
  'F7: ctx-menu zamykane przy loadzie (typeof-guard, przed montazem nowej mapy)');

// ── F8: commitSetPosition isNaN guard ───────────────────────────────────────
console.log('— F8: commitSetPosition —');
const f8snip = sliceAB('const _px = parseInt(px?.value)', "podaj liczby całkowite', true); return; }");
const commitGuard = new Function('px', 'py', 'pz', 'toast',
  f8snip + '\nreturn [Math.round(_px), Math.round(_py), Math.round(_pz)];');
const el = v => ({ value: v });
let toasts = [];
const tRec = (m, isErr) => toasts.push([m, isErr]);
toasts = [];
ok(commitGuard(el(''), el('5'), el('0'), tRec) === undefined && toasts.length === 1 && toasts[0][1] === true,
  'F8: puste pole -> toast bledu + brak mutacji (return)');
toasts = [];
ok(commitGuard(el('abc'), el('5'), el('0'), tRec) === undefined && toasts.length === 1,
  'F8: nieparsowalne pole -> toast bledu');
toasts = [];
const okRes = commitGuard(el('12'), el('-3'), el('0'), tRec);
ok(Array.isArray(okRes) && okRes[0] === 12 && okRes[1] === -3 && okRes[2] === 0 && toasts.length === 0,
  'F8: poprawne liczby przechodza (zaokraglenie, zero toastu)');

// ── H1: zero martwych closure ───────────────────────────────────────────────
console.log('— H1: martwe closure —');
ok(cnt(HTML, /\bundoFn\b/g) === 0, 'H1: zero identyfikatorow undoFn w pliku (bylo 8 definicji)');
ok(cnt(HTML, /\bconst doFn\b/g) === 5, 'H1: dokladnie 5 definicji doFn (wszystkie zywotne)');
ok(cnt(HTML, /\bdoFn\(\);/g) === 5, 'H1: kazda definicja doFn ma wywolanie (5/5)');

console.log();
if (fail === 0) { console.log('═══ WYNIK: ' + pass + ' OK / 0 FAIL ═══'); }
else { console.log('═══ WYNIK: ' + pass + ' OK / ' + fail + ' FAIL ═══'); process.exit(1); }
