// Harness — uniwersalne kolory env + parity wizualny z Delwingiem (Arc 13, v1.44.1).
// Kontrakt: ARKADIA_ENVS/ARKADIA_SYMBOLS to override TYLKO dla map arkadianskich
// (isArkadiaMap — map_sync_version / 'arkadia' w nazwie / >=2 sygnaturowe envId>255).
// Mapy obce renderuja sie z palety ANSI + kolorow z pliku (jak mudlet-web/Delwing).
// Golden: fixture .dat renderuje kazdy uzywany envId BIT-FOR-BIT jak przed zmiana.
// Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) {
  console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
  process.exit(2);
}
const DAT = fs.readFileSync(FIX);

// Ekstrakcja: warstwa formatu (constants.js -> main) + region kolorow (ANSI_PAL -> LEGENDA).
function colorLayer(html) {
  const a = html.indexOf('// ── constants.js ──'); const b = html.indexOf('// ── main ──');
  const c = html.indexOf('const ANSI_PAL = buildAnsiPal();'); const d = html.indexOf('// ─── LEGENDA');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice warstwy formatu');
  if (c < 0 || d < 0 || d <= c) throw new Error('kotwice regionu kolorow');
  return 'let state={colorCache:{},pendingEnv:null,editMode:false,selected:null,isArkadia:false,map:null,filename:null};\n'
    + 'let _rasterCache=null; function _rasterInvalidate(){ _rasterCache=null; }\n'  // F3 (Arc 31): stub — buildColorCache uniewaznia raster
    + html.slice(a, b) + '\n' + html.slice(c, d);
}
const api = new Function(colorLayer(HTML)
  + '\n;return { datToArkmap, buildColorCache, isArkadiaMap, envListForUi, usedSymbolsOnMap,'
  + ' setState(o){ Object.assign(state, o); }, getCache(){ return state.colorCache; } };')();
const { datToArkmap, buildColorCache, isArkadiaMap, envListForUi, usedSymbolsOnMap } = api;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// Golden wygenerowany z fixture PRZED zmiana (Arc 13) — kazdy uzywany envId -> css.
const GOLDEN = {"200":"rgb(0,0,255)","201":"rgb(0,255,0)","202":"rgb(255,0,0)","203":"rgb(165,42,42)","257":"rgb(128,0,0)","258":"rgb(0,179,0)","259":"rgb(128,128,0)","260":"rgb(0,0,128)","261":"rgb(128,0,128)","262":"rgb(0,128,128)","263":"rgb(192,192,192)","264":"rgb(36,36,36)","265":"rgb(255,0,0)","266":"rgb(0,255,0)","267":"rgb(255,255,0)","268":"rgb(0,0,255)","269":"rgb(255,0,255)","270":"rgb(0,255,255)","271":"rgb(255,255,255)","272":"rgb(128,128,128)","293":"rgb(0,171,192)","294":"rgb(139,255,0)","295":"rgb(239,176,73)","296":"rgb(163,151,235)","297":"rgb(236,167,236)","298":"rgb(22,232,196)","299":"rgb(0,170,255)","301":"rgb(255,114,14)","303":"rgb(170,139,89)","400":"rgb(186,112,74)","798":"rgb(255,140,0)","799":"rgb(230,230,250)","800":"rgb(30,144,255)","801":"rgb(154,205,50)","802":"rgb(85,107,47)","803":"rgb(0,255,255)","805":"rgb(107,142,35)","806":"rgb(0,100,0)","810":"rgb(255,0,0)","811":"rgb(139,69,19)","812":"rgb(230,230,250)","813":"rgb(255,255,255)","814":"rgb(34,139,34)","815":"rgb(39,227,227)","823":"rgb(255,215,0)","824":"rgb(47,79,79)","825":"rgb(189,183,107)","826":"rgb(184,134,11)","830":"rgb(255,69,0)","855":"rgb(160,82,45)","-1":"DEFAULT"};

const ark = datToArkmap(DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength));

console.log('— T1: isArkadiaMap — detekcja —');
ok(isArkadiaMap(ark, 'map_master3.dat') === true, 'fixture -> true (map_sync_version w user_data)');
ok(isArkadiaMap({ meta: { user_data: { map_sync_version: '1' } } }, null) === true, 'sam map_sync_version -> true');
ok(isArkadiaMap({ meta: { user_data: {} } }, 'arkadia-mapa.arkmap') === true, "'arkadia' w filename -> true");
ok(isArkadiaMap({ meta: { user_data: { map_name: 'Arkadia dev' } } }, null) === true, "'arkadia' w map_name -> true");
ok(isArkadiaMap({ meta: { user_data: {} }, colors: {}, areas: [{ id: 1, rooms: [{ env: 257 }, { env: 266 }] }] }, null) === true,
  '>=2 sygnaturowe envId -> true (stara arkadianska bez marki)');
ok(isArkadiaMap({ meta: { user_data: {} }, colors: {}, areas: [{ id: 1, rooms: [{ env: 258 }] }] }, null) === false,
  'pojedyncza sygnatura -> false');
ok(isArkadiaMap({ meta: { user_data: {} }, colors: {}, areas: [{ id: 1, rooms: [{ env: 10 }] }] }, 'obca.arkmap') === false,
  'mapa obca -> false');
ok(isArkadiaMap(null, null) === false && isArkadiaMap({}, null) === false, 'null/pusta mapa -> false (bez wyjatku)');

console.log('— T2: GOLDEN — fixture renderuje bit-for-bit jak przed Arc 13 —');
{
  api.setState({ isArkadia: isArkadiaMap(ark, 'map_master3.dat'), map: ark });
  buildColorCache(ark.colors || {});
  const cache = api.getCache();
  const used = new Set();
  for (const a of ark.areas) for (const r of a.rooms) used.add(r.env);
  const keys = Object.keys(GOLDEN);
  let bad = [];
  for (const e of keys) {
    const got = cache[e] || 'DEFAULT';
    if (got !== GOLDEN[e]) bad.push(e + ': golden ' + GOLDEN[e] + ' != ' + got);
  }
  ok(keys.length === used.size, 'golden pokrywa wszystkie uzywane envId (' + keys.length + ')');
  ok(bad.length === 0, 'wszystkie envId 1:1 z golden' + (bad.length ? ' — ROZJAZDY: ' + bad.slice(0, 3).join('; ') : ''));
  ok(ark.meta.map_name === 'Arkadia', 'map_name fixture nadal „Arkadia"');
}

console.log('— T3: mapa obca — uniwersalny render (jak Delwing/mudlet-web) —');
{
  // Uwaga: env-y musza byc NIE-sygnaturowe (spoza tabeli ARKADIA_ENVS) — inaczej
  // detekcja slusznie rozpoznalaby mape jako arkadianska (>=2 sygnatury >255).
  const foreign = { format: 'arkmap', version: 1, meta: { map_name: 'Obca', user_data: {} },
    colors: { env_colors: { 11: 2 }, custom_env_colors: { 4000: [1, 2, 3] } },
    areas: [{ id: 1, name: 'A', rooms: [{ id: 1, x: 0, y: 0, z: 0, env: 10 }, { id: 2, x: 1, y: 0, z: 0, env: 20 }] }] };
  api.setState({ isArkadia: isArkadiaMap(foreign, 'obca.arkmap'), map: foreign });
  buildColorCache(foreign.colors);
  const cache = api.getCache();
  ok(cache[295] === undefined, 'env 295 („Karczmy" z tabeli) NIE nadpisany — brak wpisu -> DEFAULT_ROOM');
  ok(cache[20] === 'rgb(0,0,215)', 'env 20 -> paleta ANSI (kostka xterm), nie tabela');
  ok(cache[4000] === 'rgb(1,2,3)', 'custom_env_colors z pliku wygrywa bez arkadianskiej tabeli');
  ok(cache[11] === 'rgb(0,128,0)', 'env_colors alias z pliku dziala dla mapy obcej (ANSI 2)');
  const list = envListForUi();
  ok(list.every(e => e.name === 'env ' + e.envId), 'envListForUi obcej mapy: nazwy generyczne „env N"');
  ok(!list.some(e => e.name === 'Las'), 'envListForUi obcej mapy: zero arkadianskich nazw');
  const ids = list.map(e => e.envId).join(',');
  ok(ids === '10,11,20,4000', 'envListForUi obcej mapy: tylko zdefiniowane/uzywane, sort num [actual=' + ids + ']');
  const syms = usedSymbolsOnMap();
  ok(Array.isArray(syms) && syms.length === 0, 'usedSymbolsOnMap: obca mapa bez symboli -> pusta');
  api.setState({ isArkadia: true, map: ark });
  buildColorCache(ark.colors || {});
  ok(envListForUi().some(e => e.name === 'Las'), 'envListForUi Arkadii: pelna tabela z nazwami (Las)');
}

console.log('— T4: strażnicy strukturalni (HTML) —');
const count = (needle) => HTML.split(needle).length - 1;
ok(count('function isArkadiaMap(map, filename)') === 1, 'isArkadiaMap zdefiniowana raz');
ok(count('if (state.isArkadia && typeof ARKADIA_ENVS') === 1, 'gate tabeli w buildColorCache (×1)');
ok(count('rebuildLegend()') === 3 && count('function rebuildLegend()') === 1, 'rebuildLegend: def + startup + applyMap');
ok(count('state.isArkadia ? 258 : 1') === 2, 'domyslny env nowego pokoju per mapa (×2)');
ok(count('_datFallbackMapName(raw)') === 2, 'neutralny fallback map_name (def + uzycie)');
ok(count("rgba(100,140,180,0.55)") === 0, 'stary styl stubow (niebieski dash) usuniety');
{
  const i = HTML.indexOf('function drawStubs');
  const j = HTML.indexOf('\n}\n', i);
  const body = HTML.slice(i, j);
  ok(i > 0 && body.includes("ctx.strokeStyle = 'rgb(225,225,225)';"), 'stuby: lineColor wyjsc (Delwing 1:1)');
  ok(!body.includes('setLineDash'), 'stuby: pelna linia (zero dash)');
  ok(body.includes('0.5 * cpx()'), 'stuby: dlugosc 0.5 jednostki mapy (Delwing 1:1)');
}
ok(count("const APP_VERSION = 'v1.49.4';") === 1, 'APP_VERSION v1.49.4');

// ═══ A4.2 (UX-2): kontrasty tekstow WCAG ≥ 4.5:1 na obu tlach aplikacji ═══
console.log('— A4.2 (UX-2): kontrasty WCAG vs --bg #0d0f12 i --panel #141720 —');
{
  const SELS = [
    ['.ec.no', 'tekst pustej komorki'],
    ['.cl-del', 'kasowanie custom line'],
    ['.wp-field::placeholder', 'placeholder pol trasy'],
    ['.ec.stub', 'tekst stub'],
    ['.spec-del', 'kasowanie spec-exit'],
    ['#mob-clear-btn', 'mobilne usuwanie trasy'],
    ['.arkmap-only-badge', 'badge arkmap-only'],
    ['.vd-arr', 'strzalki walidacji'],
    ['.vd-num', 'numeracja walidacji'],
    ['.tag-chip span', 'kasowanie tagu'],
  ];
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255); };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const cssColor = (sel) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&');
    const m = HTML.match(new RegExp(esc + '\\s*\\{[^}]*?color:\\s*(#[0-9a-fA-F]{6})'));
    return m && m[1];
  };
  for (const [sel, label] of SELS) {
    const fg = cssColor(sel);
    const r1 = fg ? ratio(fg, '#0d0f12') : 0, r2 = fg ? ratio(fg, '#141720') : 0;
    ok(fg !== null && r1 >= 4.5 && r2 >= 4.5,
      'A4.2 (UX-2): ' + sel + ' (' + label + ') >= 4.5:1 vs obie plaszczyzny'
      + ' [fg=' + fg + ' bg=' + (fg ? r1.toFixed(2) : '?') + ' panel=' + (fg ? r2.toFixed(2) : '?') + ']');
  }
}

console.log('');
console.log('universal_colors: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
