// Harness krok D — share-linki v2 (format ARKMAP2:<algo><dir><trans>:base64)
// Bez snapshotu różnicowego: stary format ARKMAP: jest celowo odrzucany (brak kompatybilności
// wstecznej — decyzja projektowa). Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

// ── Ekstrakcja verbatim ─────────────────────────────────────────────────────
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
  const code = shareBlock(html) + '\n;return { wpEncodeRoute, wpDecodeRoute };';
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

// ── T1: round-trip wszystkich 18 permutacji (2 algo × 3 dir × 3 trans) ──────
console.log('── T1: round-trip 18 permutacji ──');
{
  const state = mkState();
  const api = buildApi(NEW)(state, null);
  const ALGOS = ['dijkstra', 'astar'];
  const DIRS = ['cardinal', 'vertical', 'all'];
  const TRANS = ['off', 'normal', 'aggressive'];
  for (const a of ALGOS) for (const d of DIRS) for (const t of TRANS) {
    const wp = mkWp(a, d, t);
    // wpState jest argumentem fabryki — przebuduj API z bieżącym stanem
    const api2 = buildApi(NEW)(state, wp);
    const code = api2.wpEncodeRoute();
    const res = api2.wpDecodeRoute(code);
    ok(res !== null
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
  ok(code.startsWith('ARKMAP2:'), 'prefiks ARKMAP2:');
  ok(code.slice(8, 11) === 'apg', 'flagi astar/vertical/aggressive = "apg" (dostałem: ' + code.slice(8, 11) + ')');
  ok(code[11] === ':', 'dwukropek po flagach');
  ok(atob(code.slice(12)) === '100,200,300', 'payload base64 = CSV roomId');
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

// ── T3: odrzucanie śmieci (ścisła walidacja, zero legacy) ───────────────────
console.log('── T3: odrzucanie śmieci ──');
{
  const state = mkState();
  const api = buildApi(NEW)(state, null);
  const good = api.wpEncodeRoute.call ? null : null; // (porządek: budujemy kody ręcznie)
  const b64 = s => btoa(s);
  const cases = [
    ['', 'pusty ciąg'],
    ['ARKMAP:MTAwLDIwMA==', 'stary format v0 (ARKMAP:base64)'],
    ['ARKMAP:d:' + b64('100,200'), 'stary format v1 (ARKMAP:d:base64)'],
    ['arkmap2:dwp:' + b64('100,200'), 'prefiks małymi literami'],
    ['ARKMAP2:', 'same flagi, brak payloadu i dwukropka'],
    ['ARKMAP2:dwp', 'brak dwukropka po flagach'],
    ['ARKMAP2:dwp:', 'pusty payload'],
    ['ARKMAP2:xwp:' + b64('100,200'), 'zły kod algorytmu (x)'],
    ['ARKMAP2:dxp:' + b64('100,200'), 'zły kod filtra kierunków (x)'],
    ['ARKMAP2:dwx:' + b64('100,200'), 'zły kod transportu (x)'],
    ['ARKMAP2:dwpp:' + b64('100,200'), '4 znaki flag'],
    ['ARKMAP2:dw:' + b64('100,200'), '2 znaki flag'],
    ['ARKMAP2:dwp:!!!', 'nie-base64'],
    ['ARKMAP2:dwp:' + b64('abc'), 'payload nie-liczbowy'],
    ['ARKMAP2:dwp:' + b64('100,abc,200'), 'śmieć w środku CSV'],
    ['ARKMAP2:dwp:' + b64('100,-5,200'), 'ujemne ID'],
    ['ARKMAP2:dwp:' + b64('100,0,200'), 'zerowe ID'],
    ['ARKMAP2:dwp:' + b64('100.5,200'), 'niecałkowite ID'],
    ['ARKMAP2:dwp:' + b64('0100,200'), 'leading zero'],
    ['ARKMAP2:dwp:' + b64('100,,200'), 'pusty token w CSV'],
    ['ARKMAP2:dwp:' + b64(' '), 'payload z samych białych znaków'],
  ];
  for (const [code, label] of cases) {
    ok(api.wpDecodeRoute(code) === null, `odrzucone: ${label}`);
  }
}

// ── T4: walidacja waypointów przeciw mapie ───────────────────────────────────
console.log('── T4: walidacja ID-ów przeciw state.roomById ──');
{
  const state = mkState();
  const api = buildApi(NEW)(state, null);
  const code = 'ARKMAP2:dwp:' + btoa('100,999,200');
  const res = api.wpDecodeRoute(code);
  ok(res !== null && res.valid.join(',') === '100,200' && res.invalidCount === 1 && res.total === 3,
    'nieistniejący pokój 999 → pominięty, invalidCount=1');
  const res2 = api.wpDecodeRoute('ARKMAP2:dwp:' + btoa('999,998'));
  ok(res2 !== null && res2.valid.length === 0 && res2.invalidCount === 2,
    'wszystkie nieistniejące → valid puste (import odmówi tostem)');
  const res3 = api.wpDecodeRoute('  ARKMAP2:akn:' + btoa('300,100') + '  ');
  ok(res3 !== null && res3.valid.join(',') === '300,100' && res3.algorithm === 'astar'
    && res3.dirMode === 'cardinal' && res3.transportMode === 'normal',
    'otoczenie białymi znakami OK + flagi akn zdekodowane');
}

// ── T5: okablowanie importu w HTML (asercje strukturalne) ───────────────────
console.log('── T5: okablowanie importu ──');
{
  ok(NEW.includes("startsWith('ARKMAP2:')"), 'import wymaga prefiksu ARKMAP2:');
  const imp = NEW.indexOf('wpState.dirMode = res.dirMode;');
  ok(imp > 0, 'import ustawia dirMode z kodu');
  ok(imp > 0 && NEW.indexOf('wpRefreshDirUI();', imp) > imp, 'import odświeża UI filtra kierunków');
  ok(NEW.includes('wpState.transportMode = res.transportMode;'), 'import ustawia transportMode z kodu');
  ok(NEW.includes('function wpRefreshDirUI()'), 'istnieje helper wpRefreshDirUI');
  ok(!NEW.includes("'ARKMAP:' + algoCode"), 'stary enkoder ARKMAP: usunięty');
}

console.log(`\n═══ share_link.js: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
