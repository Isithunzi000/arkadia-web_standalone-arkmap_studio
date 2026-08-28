// Harness fali 3 (P3b) — odroczona weryfikacja sum kontrolnych + baseInfo po pierwszej klatce.
// Statycznie + behawioralnie (ekstrakcja verbatim). Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

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
  const la = extract(HTML, 'async function loadArkmap(text, filename) {');
  ok(!la.includes('verifyChecksums('), 'loadArkmap nie wywołuje verifyChecksums (CRC wyloane ze sciezki krytycznej)');
  ok(la.indexOf('state._deferVerify = true;') > 0 && la.indexOf('state._deferVerify = true;') < la.indexOf('applyMap(map);'),
    'loadArkmap ustawia _deferVerify tuz przed applyMap');
  ok(la.includes("{ present: true, deferred: true }") && la.includes('showValDialog(valRes, chkRes, filename, isFatal, suppMissing)'),
    'dialog walidacji dostaje placeholder deferred (sygnatura showValDialog bez zmian)');
  ok(!la.includes('suma kontrolna]'), 'toast loadu bez etykiety CRC (CRC dopiero po klatce)');

  const wrap = extract(HTML, 'applyMap = function(map) {');
  ok(wrap.includes('const _deferV = !!state._deferVerify;') && wrap.includes('state._deferVerify = null;'),
    'wrapper konsumuje flage _deferVerify (stash→consume, jak _loadCheckpointText)');
  ok(wrap.includes('requestAnimationFrame(() => setTimeout(() => _postLoadVerifyDeferred(mapRef), 0));'),
    'defer przez rAF + setTimeout(0) — po pierwszej klatce');
  ok(wrap.includes("state.baseInfo = _computeBaseInfo(null, null);"),
    'sciezka bez defer (bezposredni applyMap): baseInfo synchronicznie — kompatybilnosc harnessow');
  ok(!HTML.includes('_pendingComputed'), 'mechanizm _pendingComputed wygaszony (zero martwych referencji)');

  const post = extract(HTML, 'function _postLoadVerifyDeferred(mapRef) {');
  ok(post.includes('if (state.map !== mapRef) return;'), 'post-frame: strażnik zdublowanego/zastarego loadu');
  ok(post.includes('state.baseInfo = _computeBaseInfo(null, (chkRes && chkRes.computed) || null);'),
    'post-frame: baseInfo z reużyciem computed (jedno liczenie V4 na load)');
  ok(post.includes('window.__arkmapVerifiedAt = performance.now();'), 'post-frame: hak pomiarowy mega-testu');
  ok(post.includes("toast('⚠ Suma kontrolna mapy NIEZGODNA"), 'post-frame: zla suma = toast ostrzegawczy');

  ok(HTML.includes("if (chkRes.deferred) {"), 'raport walidacji: sekcja CRC "weryfikacja w tle"');
  ok((HTML.split('state._deferVerify = true;').length - 1) === 4,
    'dokladnie 4 sciezki defer (loadArkmap/loadDat/online/restore) — jest ' + (HTML.split('state._deferVerify = true;').length - 1));
  ok((HTML.split('state._verifyPending) { toast(').length - 1) === 2,
    'gating _verifyPending w eksporcie i imporcie kalki (2 miejsca)');
}

// ── T2: behawioralnie — kolejnosc wywolan w loadArkmap ─────────────────────
console.log('── T2: loadArkmap — kolejnosc i brak sync CRC ──');
{
  const src = extract(HTML, 'async function loadArkmap(text, filename) {');
  const mk = (over) => {
    const calls = [];
    const st = { filename: null, _loadCheckpointText: null, _deferVerify: null };
    const f = new Function('state', 'validate', 'checkSuppressorsInMap', 'showValDialog', 'applyMap', 'toast', 'fmtSz',
      src + '\n;return loadArkmap;')(
      st,
      () => { calls.push('validate'); return over.valRes || { ok: true, errors: [], warnings: [] }; },
      () => { calls.push('suppressors'); return []; },
      async () => { calls.push('dialog'); return over.confirm !== false; },
      () => { calls.push('applyMap'); },
      (m) => { calls.push('toast:' + (m.includes('suma kontrolna') ? 'CRC!' : 'plain')); },
      () => ' 1 KB',
    );
    return { f, calls, st };
  };

  // czysta mapa z sumami — bez dialogu, defer ustawiony, toast bez CRC
  {
    const { f, calls, st } = mk({});
    const map = { format: 'arkmap', meta: { checksums: { file: 'x', alg: 'v4' } }, areas: [] };
    const p = f(JSON.stringify(map), 'm.arkmap');
    ok(typeof p.then === 'function', 'loadArkmap async (bez zmian kontraktu)');
    p.then(() => {
      const J = JSON.stringify;
      ok(J(calls) === J(['validate', 'suppressors', 'applyMap', 'toast:plain']),
        'czysta mapa: validate→suppressors→applyMap→toast(bez CRC), zero dialogu — jest ' + J(calls));
      ok(st._deferVerify === true && st._loadCheckpointText !== null, 'stash _deferVerify + _loadCheckpointText ustawione');
    });
  }

  // mapa z bledami — dialog z deferred, akceptacja
  {
    const { f, calls } = mk({ valRes: { ok: false, errors: [{ path: 'areas', msg: 'x' }], warnings: [] } });
    f(JSON.stringify({ format: 'arkmap', meta: {}, areas: [] }), 'm.arkmap').then(() => {
      ok(calls.includes('dialog') && calls.indexOf('dialog') < calls.indexOf('applyMap'),
        'bledy walidacji: dialog przed applyMap (bez zmian)');
    });
  }

  // anulowanie dialogu — applyMap NIE wołany, stash NIE ustawiony
  {
    const { f, calls, st } = mk({ valRes: { ok: false, errors: [{ path: 'areas', msg: 'x' }], warnings: [] }, confirm: false });
    f(JSON.stringify({ format: 'arkmap', areas: [] }), 'm.arkmap').then(() => {
      ok(!calls.includes('applyMap') && st._deferVerify === null,
        'anulowanie dialogu: applyMap nie wolany, stash nie ustawiony (brak zastanego defer)');
    });
  }
}

// ── T3: behawioralnie — _postLoadVerifyDeferred ─────────────────────────────
console.log('── T3: _postLoadVerifyDeferred ──');
{
  const src = extract(HTML, 'function _postLoadVerifyDeferred(mapRef) {');
  const mk = (chkRes, stale) => {
    const log = [];
    const mapObj = { areas: [] };
    const st = { map: stale ? { areas: ['INNA'] } : mapObj, baseInfo: undefined, _verifyPending: true };
    const win = {};
    const fn = new Function('state', 'verifyChecksums', '_computeBaseInfo', 'window', 'performance', 'toast',
      src + '\n;return _postLoadVerifyDeferred;')(
      st,
      () => { log.push('verify'); return chkRes; },
      (m, pre) => { log.push('baseInfo:pre=' + (pre ? 'TAK' : 'nie')); return { crc: 'abc' }; },
      win,
      { now: () => 1234.5 },
      (m, err) => { log.push('toast:' + (err ? 'warn' : 'ok')); },
    );
    return { fn, log, st, win, mapObj };
  };

  // happy path: verify → baseInfo z reuzyciem computed → hak → bez toastu
  {
    const { fn, log, st, win, mapObj } = mk({ present: true, ok: true, computed: { file: 'F' } });
    fn(mapObj);
    ok(JSON.stringify(log) === JSON.stringify(['verify', 'baseInfo:pre=TAK']),
      'happy: verify → baseInfo z reuzyciem computed — jest ' + JSON.stringify(log));
    ok(st._verifyPending === false && st.baseInfo && st.baseInfo.crc === 'abc',
      'happy: _verifyPending wyczyszczone, baseInfo ustawione');
    ok(win.__arkmapVerifiedAt === 1234.5, 'happy: hak pomiarowy ustawiony');
  }

  // zla suma → toast ostrzegawczy
  {
    const { fn, log, mapObj } = mk({ present: true, ok: false, fileOk: false, badAreas: [], badRooms: [], computed: { file: 'F' } });
    fn(mapObj);
    ok(log.includes('toast:warn'), 'zla suma: toast ostrzegawczy po klatce');
  }

  // mapa bez sum → chkRes.present=false → baseInfo liczy sam (pre=nie), zero toastu
  {
    const { fn, log, mapObj } = mk({ present: false, ok: true });
    fn(mapObj);
    ok(log.includes('baseInfo:pre=nie') && !log.some(x => x.startsWith('toast')),
      'bez sum w pliku: baseInfo liczy sam, cisza (brak toastu)');
  }

  // zastary callback (inna mapa zaladowana miedzyczasie) → no-op
  {
    const { fn, log, st, mapObj } = mk({ present: true, ok: true, computed: {} }, true);
    fn(mapObj);
    ok(log.length === 0 && st._verifyPending === true && st.baseInfo === undefined,
      'zastary callback: no-op (baseInfo nietkniete, flaga zostaje dla nowszego loadu)');
  }

  // verify rzuca → baseInfo mimo to (pre=nie), aplikacja zyje
  {
    const st = { map: { areas: [] }, baseInfo: undefined, _verifyPending: true };
    const win = {};
    const log = [];
    const fn = new Function('state', 'verifyChecksums', '_computeBaseInfo', 'window', 'performance', 'toast',
      src + '\n;return _postLoadVerifyDeferred;')(
      st,
      () => { throw new Error('uszkodzone dane'); },
      (m, pre) => { log.push('baseInfo'); return { crc: 'abc' }; },
      win,
      { now: () => 1 },
      (m) => { log.push('toast'); },
    );
    fn(st.map);
    ok(log.includes('baseInfo') && st._verifyPending === false && win.__arkmapVerifiedAt === 1,
      'verify rzuca: baseInfo mimo to, flaga sprzatnieta, hak ustawiony');
  }
}

console.log(`\n═══ PODSUMOWANIE: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
