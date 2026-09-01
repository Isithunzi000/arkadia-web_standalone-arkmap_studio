// Harness krok D — share-linki gen 3 (format arkmap:<algo><dir><trans>:<ids CSV>:<crc8>)
// Wielkosc liter bez znaczenia (dekoder lowercasuje); crc8 = pierwsze 8 hex xxh3_64
// ze zlowerkowanego rdzenia "arkmap:<flagi>:<ids>" — integralnosc wklejek, nie security.
// Starsze generacje (ARKMAP:/ARKMAP2:, base64) sa celowo odrzucane (brak kompatybilnosci
// wstecznej — decyzja projektowa). Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

// ── Ekstrakcja verbatim ─────────────────────────────────────────────────────
// gen 3: enkoder/dekoder licza crc przez xxh3_64hex — harness dociaga blok XXH3
// (samowystarczalny, miedzy markerami ====XXH3-64-BEGIN/END====).
function xxh3Block(html) {
  let a = html.indexOf('====XXH3-64-BEGIN====');
  const b = html.indexOf('====XXH3-64-END====');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwica XXH3-64');
  a = html.lastIndexOf('\n', a) + 1;   // marker siedzi w komentarzu — bierzemy cala linie
  return html.slice(a, b);
}
function shareBlock(html) {
  const a = html.indexOf('function wpEncodeRoute() {');
  const b = html.indexOf('function wpUpdateRouteCode()');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwica wpEncodeRoute');
  const c = html.indexOf('function wpDecodeRoute(code) {');
  const d = html.indexOf('function wpImportOpen()');
  if (c < 0 || d < 0 || d <= c) throw new Error('kotwica wpDecodeRoute');
  return html.slice(a, b) + '\n' + html.slice(c, d);
}
function buildApi(html) {
  const code = xxh3Block(html) + '\n' + shareBlock(html) + '\n;return { wpEncodeRoute, wpDecodeRoute, xxh3_64hex };';
  return new Function('state', 'wpState', code);
}

// ── Stuby ───────────────────────────────────────────────────────────────────
// Mapa syntetyczna: pokoje 100, 200, 300 istnieją; 999 nie istnieje.
function mkState() { return { roomById: { 100: { id: 100 }, 200: { id: 200 }, 300: { id: 300 } } }; }
function mkWp(algorithm, dirMode, transportMode) {
  return {
    algorithm, dirMode, transportMode,
    waypoints: [{ roomId: 100 }, { roomId: 200 }, { roomId: 300 }],
  };
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

const TE = new TextEncoder();
const apiCrc = buildApi(NEW)(mkState(), null);
const crcFor = core => apiCrc.xxh3_64hex(TE.encode(core)).slice(0, 8);
const withCrc = core => core + ':' + crcFor(core);

// ── T1: round-trip wszystkich 18 permutacji (2 algo × 3 dir × 3 trans) ──────
console.log('── T1: round-trip 18 permutacji ──');
{
  const state = mkState();
  const ALGOS = ['dijkstra', 'astar'];
  const DIRS = ['cardinal', 'vertical', 'all'];
  const TRANS = ['off', 'normal', 'aggressive'];
  for (const a of ALGOS) for (const d of DIRS) for (const t of TRANS) {
    const wp = mkWp(a, d, t);
    // wpState jest argumentem fabryki — przebuduj API z bieżącym stanem
    const api2 = buildApi(NEW)(state, wp);
    const code = api2.wpEncodeRoute();
    const res = api2.wpDecodeRoute(code);
    ok(res !== null && !res.error
      && res.algorithm === a && res.dirMode === d && res.transportMode === t
      && res.valid.join(',') === '100,200,300' && res.invalidCount === 0 && res.total === 3,
      `round-trip ${a}/${d}/${t} → ${code.slice(0, 14)}…`);
  }
}

// ── T2: struktura formatu ────────────────────────────────────────────────────
console.log('── T2: struktura kodu ──');
{
  const state = mkState();
  const api = buildApi(NEW)(state, mkWp('astar', 'vertical', 'aggressive'));
  const code = api.wpEncodeRoute();
  const parts = code.split(':');
  ok(parts[0] === 'arkmap', 'prefiks arkmap: (male litery)');
  ok(parts[1] === 'apg', 'flagi astar/vertical/aggressive = "apg" (dostałem: ' + parts[1] + ')');
  ok(parts.length === 4, 'dokładnie 4 pola rozdzielone dwukropkami');
  ok(parts[2] === '100,200,300', 'payload = czysty CSV roomId (bez base64)');
  ok(/^[0-9a-f]{8}$/.test(parts[3]), 'crc8 = 8 znakow hex');
  ok(parts[3] === crcFor('arkmap:apg:100,200,300'), 'crc zgodne z xxh3_64(rdzenia)');
  ok(code === code.toLowerCase(), 'enkoder emituje wylacznie male litery');
  // Golden pin — ta sama wartosc co w pakiecie npm arkmap (tests/waypoints.test.mjs)
  const apiG = buildApi(NEW)(state, mkWp('astar', 'cardinal', 'normal'));
  ok(apiG.wpEncodeRoute() === 'arkmap:akn:100,200,300:c44c6e53', 'golden: arkmap:akn:100,200,300:c44c6e53');
  // Determinizm: ten sam stan → identyczny kod, dwa razy
  ok(api.wpEncodeRoute() === code, 'encode deterministyczny (2× identyczny)');
  const r1 = api.wpDecodeRoute(code), r2 = api.wpDecodeRoute(code);
  ok(JSON.stringify(r1) === JSON.stringify(r2), 'decode deterministyczny (2× identyczny)');
  // Za krótka trasa → pusty kod
  const wp1 = mkWp('dijkstra', 'all', 'off'); wp1.waypoints = [{ roomId: 100 }];
  ok(buildApi(NEW)(state, wp1).wpEncodeRoute() === '', 'mniej niż 2 waypointy → pusty kod');
  const wp0 = mkWp('dijkstra', 'all', 'off'); wp0.waypoints = [{ roomId: null }, { roomId: null }];
  ok(buildApi(NEW)(state, wp0).wpEncodeRoute() === '', 'puste sloty → pusty kod');
}

// ── T2b: wielkosc liter bez znaczenia ───────────────────────────────────────
console.log('── T2b: case-insensitive ──');
{
  const state = mkState();
  const api = buildApi(NEW)(state, mkWp('dijkstra', 'all', 'off'));
  const code = api.wpEncodeRoute();
  const want = api.wpDecodeRoute(code);
  ok(JSON.stringify(api.wpDecodeRoute(code.toUpperCase())) === JSON.stringify(want),
    'pelny CAPS (prefiks + flagi + crc) dekoduje identycznie');
  const mixed = 'ArkMap:DwP:100,200,300:' + code.split(':')[3].toUpperCase();
  ok(JSON.stringify(api.wpDecodeRoute(mixed)) === JSON.stringify(want), 'mieszana wielkosc liter OK');
}

// ── T3: odrzucanie śmieci (ścisła walidacja, zero legacy) ───────────────────
console.log('── T3: odrzucanie śmieci ──');
{
  const state = mkState();
  const api = buildApi(NEW)(state, null);
  const b64 = s => btoa(s);
  const cases = [
    ['', 'pusty ciąg'],
    ['ARKMAP:MTAwLDIwMA==', 'stary format v0 (ARKMAP:base64)'],
    ['ARKMAP:d:' + b64('100,200'), 'stary format v1 (ARKMAP:d:base64)'],
    ['arkmap2:dwp:' + b64('100,200'), 'gen 2 (arkmap2:base64) — brak kompatybilnosci'],
    ['ARKMAP2:dwp:' + b64('100,200'), 'gen 2 CAPS — brak kompatybilnosci'],
    ['arkmap:', 'samy prefiks'],
    ['arkmap:dwp', 'brak pol po flagach'],
    ['arkmap:dwp:100,200', 'brak pola crc'],
    [withCrc('arkmap:dwp:100,200') + ':ff', 'dodatkowe 5. pole'],
    ['arkmap:xwp:100,200:00000000', 'zły kod algorytmu (x)'],
    ['arkmap:dxp:100,200:00000000', 'zły kod filtra kierunków (x)'],
    ['arkmap:dwx:100,200:00000000', 'zły kod transportu (x)'],
    ['arkmap:dwpp:100,200:00000000', '4 znaki flag'],
    ['arkmap:dw:100,200:00000000', '2 znaki flag'],
    ['arkmap:dwp:100,200:aabbccd', 'crc 7 znakow'],
    ['arkmap:dwp:100,200:aabbccdde', 'crc 9 znakow'],
    ['arkmap:dwp:100,200:zzzzzzzz', 'crc nie-hex'],
    ['arkmap:dwp::aabbccdd', 'pusty payload'],
  ];
  for (const [code, label] of cases) {
    ok(api.wpDecodeRoute(code) === null, `odrzucone: ${label}`);
  }
  // niekanoniczne CSV (z POPRAWNYM crc — struktura ma odrzucic, nie suma)
  for (const csv of ['0100,200', '100,,200', '100,abc,200', '100,-5,200', '100,0,200', '100.5,200', '100, 200']) {
    ok(api.wpDecodeRoute(withCrc('arkmap:dwp:' + csv)) === null, `odrzucone: CSV "${csv}"`);
  }
}

// ── T3b: crc — integralnosc wklejki ─────────────────────────────────────────
console.log('── T3b: crc ──');
{
  const state = mkState();
  const api = buildApi(NEW)(state, mkWp('dijkstra', 'all', 'off'));
  const good = api.wpEncodeRoute();
  const tampered = good.replace('100,200,300', '100,201,300');
  const r = api.wpDecodeRoute(tampered);
  ok(r !== null && r.error === 'crc' && r.actual === good.split(':')[3] && r.expected === crcFor('arkmap:dwp:100,201,300'),
    'edytowany payload przy starym crc → error crc (expected/actual)');
  const badCrc = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
  ok(api.wpDecodeRoute(badCrc)?.error === 'crc', 'edytowane crc → error crc');
  ok(api.wpDecodeRoute('arkmap:dwp:100,200:00000000')?.error === 'crc', 'poprawne strukturalnie, zle crc → error crc');
  // crc przed limitem: 201 WP ze zlym crc zglasza crc, nie too-many
  const ids = Array.from({ length: 201 }, (_, i) => i + 1).join(',');
  ok(api.wpDecodeRoute('arkmap:dwp:' + ids + ':00000000')?.error === 'crc', 'crc weryfikowane przed limitem WP');
}

// ── T4: walidacja waypointów przeciw mapie ───────────────────────────────────
console.log('── T4: walidacja ID-ów przeciw state.roomById ──');
{
  const state = mkState();
  const api = buildApi(NEW)(state, null);
  const res = api.wpDecodeRoute(withCrc('arkmap:dwp:100,999,200'));
  ok(res !== null && res.valid.join(',') === '100,200' && res.invalidCount === 1 && res.total === 3,
    'nieistniejący pokój 999 → pominięty, invalidCount=1');
  const res2 = api.wpDecodeRoute(withCrc('arkmap:dwp:999,998'));
  ok(res2 !== null && res2.valid.length === 0 && res2.invalidCount === 2,
    'wszystkie nieistniejące → valid puste (import odmówi tostem)');
  const res3 = api.wpDecodeRoute('  ' + withCrc('arkmap:akn:300,100') + '  ');
  ok(res3 !== null && res3.valid.join(',') === '300,100' && res3.algorithm === 'astar'
    && res3.dirMode === 'cardinal' && res3.transportMode === 'normal',
    'otoczenie białymi znakami OK + flagi akn zdekodowane');
}

// ── T5: okablowanie importu w HTML (asercje strukturalne) ───────────────────
console.log('── T5: okablowanie importu ──');
{
  ok(NEW.includes("toLowerCase().startsWith('arkmap:')"), 'import wymaga prefiksu arkmap: (case-insensitive)');
  ok(NEW.includes("res.error === 'crc'"), 'handler ma osobny komunikat dla bledu crc');
  const imp = NEW.indexOf('wpState.dirMode = res.dirMode;');
  ok(imp > 0, 'import ustawia dirMode z kodu');
  ok(imp > 0 && NEW.indexOf('wpRefreshDirUI();', imp) > imp, 'import odświeża UI filtra kierunków');
  ok(NEW.includes('wpState.transportMode = res.transportMode;'), 'import ustawia transportMode z kodu');
  ok(NEW.includes('function wpRefreshDirUI()'), 'istnieje helper wpRefreshDirUI');
  ok(!NEW.includes("'ARKMAP:' + algoCode"), 'stary enkoder ARKMAP: usunięty');
  ok(!NEW.includes("'ARKMAP2:' + algoCode"), 'enkoder ARKMAP2: usunięty');
}

// ── T6: Arc 37 (F-PLANNER-2) — twardy limit waypointów WP_MAX=200 ───────────
console.log('── T6: limit waypointów (F-PLANNER-2, Arc 37) ──');
{
  // Mapa syntetyczna: pokoje 1..201 istnieją
  const bigState = { roomById: {} };
  for (let i = 1; i <= 201; i++) bigState.roomById[i] = { id: i };
  const mkBigWp = n => ({
    algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off',
    waypoints: Array.from({ length: n }, (_, i) => ({ roomId: i + 1 })),
  });
  // P1: dokładnie 200 waypointów → zaakceptowane (strzeże, że limit nie za ciasny)
  const api200 = buildApi(NEW)(bigState, mkBigWp(200));
  const r200 = api200.wpDecodeRoute(api200.wpEncodeRoute());
  ok(r200 !== null && !r200.error && r200.total === 200 && r200.valid.length === 200,
    '200 waypointów → zaakceptowane (limit nie za ciasny)');
  // P2: 201 waypointów → odrzucone z error 'too-many' (dyskryminuje pre/post-fix)
  const api201 = buildApi(NEW)(bigState, mkBigWp(201));
  const r201 = api201.wpDecodeRoute(api201.wpEncodeRoute());
  ok(r201 !== null && r201.error === 'too-many' && r201.max === 200 && r201.total === 201,
    '201 waypointów → odrzucone: error too-many, max=200 (pre-fix: zaakceptowane)');
  // P3: komunikat handlera budowany z wyniku (nie zaszyty na sztywno)
  ok(NEW.includes("toast('✗ Za dużo waypointów (max ' + res.max + ')')"),
    'handler: komunikat limitu z res.max (limit i tekst nigdy się nie rozjadą)');
}

console.log(`\n═══ share_link.js: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
