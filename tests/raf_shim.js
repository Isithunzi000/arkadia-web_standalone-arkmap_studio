// Harness — raf_shim.js: straznik RAF-batchinga i shima render-to-offscreen
// (Arc 31 F1, v1.46.0). Pinuje:
//  A. strukture scheduleDraw (flaga koalescencji, RAF -> draw(), rearm),
//  B. komplet podmiany call-site'ow: 121x scheduleDraw(); i DOKLADNIE 1 gole
//     draw(); w calym pliku (wewnatrz scheduleDraw — kontrakt synchroniczny),
//  C. strukture _withRenderTarget (try/finally, przywracanie cv/ctx i pol,
//     lista swapow, komentarz decyzji D1),
//  D. guard D2 w draw() (minimapki tlumione podczas shima),
//  E. deklaracje cv/ctx jako let (scoped swap),
//  F. obecnosc harnessu w run-all.sh.
// Strona dynamiczna (koalescencja, zlote piksele, izolacja, finally przy
// wyjatku, tlumienie minimapek): scenariusze empiryczne E23.raf / E23.shim.
// Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
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

// ── A: scheduleDraw ─────────────────────────────────────────────────────────
ok(HTML.includes('let _drawScheduled = false;'), 'A1: flaga _drawScheduled zainicjowana');
const sd = extract(HTML, 'function scheduleDraw()');
ok(sd.includes('if (_drawScheduled) return;'), 'A2: guard koalescencji (powrot, gdy klatka juz zamowiona)');
ok(sd.includes('_drawScheduled = true;') && sd.includes('requestAnimationFrame(() => { _drawScheduled = false; draw(); });'),
   'A3: zamowienie klatki RAF + zwolnienie flagi przed draw() (rearm)');

// ── B: komplet podmiany call-site'ow ────────────────────────────────────────
const nSched = (HTML.match(/\bscheduleDraw\(\);/g) || []).length;
// F5 (Arc 31, v1.48.1): +1 call-site — scheduleDraw() w _deltaReviewReportHtml
// (przywrocenie paska statusu/slidera po renderach shimowych miniaturek).
ok(nSched === 122, 'B1: dokladnie 122 call-site\'ow scheduleDraw(); (jest ' + nSched + ')');
const bareAll = (HTML.match(/\bdraw\(\);/g) || []).length;
const sdBare = (sd.match(/\bdraw\(\);/g) || []).length;
// F5: +2 gole draw(); w _deltaRenderComparison — render miniatur MUSI byc
// synchroniczny (offscreen przechwytywany natychmiast przez toDataURL);
// to nie jest sciezka interaktywna, batching RAF nie ma tu zastosowania.
ok(bareAll === 3 && sdBare === 1,
   'B2: gole draw(); tylko w scheduleDraw (kontrakt) i 2 shimowych renderach miniatur F5 (jest ' + bareAll + '/' + sdBare + ')');
ok(HTML.includes('state.pendingEnv=parseInt(this.value);scheduleDraw()'),
   'B3: inline onchange (rp-env, pendingEnv) tez przez scheduleDraw — sweep objal wariant bez srednika');
const noLineComments = HTML.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const strayDraw = (noLineComments.match(/(?<!function )\bdraw\(\)(?!\s*;)/g) || []).length;
ok(strayDraw === 0, 'B4: zero golych draw() bez srednika poza definicja i komentarzami (jest ' + strayDraw + ')');

// ── C: _withRenderTarget ────────────────────────────────────────────────────
ok(HTML.includes('let _shimActive = false;'), 'C1: flaga _shimActive zainicjowana');
const shim = extract(HTML, 'function _withRenderTarget(');
ok(shim.includes('try {') && shim.includes('} finally {'), 'C2: scoped swap w try/finally');
const iFin = shim.indexOf('} finally {');
const fin = shim.slice(iFin);
ok(fin.includes('_shimActive = false;') && fin.includes('cv = savedCv;') && fin.includes('ctx = savedCtx;'),
   'C3: finally wylacza flage i przywraca cv/ctx (takze przy wyjatku)');
ok(shim.includes('undo.push') && fin.includes('o[k] = v'), 'C4: stos undo swapow przywracany w finally');
for (const key of ["'zoom'", "'ox'", "'oy'", "'z'", "'areaId'", "'roomsZ'", "'roomById'", "'roomArea'", "'areas'", "'env_colors'", "'custom_env_colors'"]) {
  ok(shim.includes(key), 'C5: swap pola ' + key + ' obecny w shimie');
}
ok(shim.includes("'env_colors'") && shim.includes("'custom_env_colors'") && !shim.includes('state.envColors'),
   'C6: kolory env przez state.map.colors.* (NIE nieistniejace state.envColors)');
// komentarz D1 siedzi w bloku dokumentacyjnym NAD funkcja (poza extract)
const shimDoc = HTML.slice(Math.max(0, HTML.indexOf('function _withRenderTarget(') - 1800), HTML.indexOf('function _withRenderTarget('));
ok(shimDoc.includes('Decyzja D1') && shimDoc.includes('showGrid') && shimDoc.includes('mudletLabels') && shimDoc.includes('showSuppressors'),
   'C7: komentarz decyzji D1 przy shimie (flagi widoku zostaja live — zakaz dopisywania do swapow)');

// ── D: guard D2 w draw() ────────────────────────────────────────────────────
const d = extract(HTML, 'function draw() {');
ok(d.includes('if (!_shimActive) { updateMinimap_call(); wpUpdateOverviewThrottled(); }'),
   'D1: draw() tlumi minimapki podczas shima (decyzja D2)');

// ── E: cv/ctx jako let ──────────────────────────────────────────────────────
ok(HTML.includes("let cv  = document.getElementById('cv');") && HTML.includes("let ctx = cv.getContext('2d');"),
   'E1: cv/ctx zadeklarowane jako let (scoped swap shima)');

// ── F: run-all ──────────────────────────────────────────────────────────────
ok(RUNALL.includes('tests/raf_shim.js'), 'F1: harness wpisany do tests/run-all.sh');

console.log('\nraf_shim: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
