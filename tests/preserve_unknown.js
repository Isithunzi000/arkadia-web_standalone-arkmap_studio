// Harness — preserve_unknown: pin D3 (reguła forward-compatibility).
// Nieznane klucze na KAŻDYM poziomie .arkmap MUSZĄ przetrwać round-trip
// load → save dosłownie (verbatim) i MUSZĄ pozostać poza zakresem sum v4
// (r4/a4/f4). Wyjątek normatywny: checksums.meta (D2) obejmuje CAŁE meta
// — nieznane klucze w meta są objęte integrity (edycja = metaOk:false),
// ale NIE ruszają identity (checksums.file).
// Uruchamianie z katalogu głównego repo: node tests/preserve_unknown.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Ekstrakcja bloków z arkmap_studio.html (technika jak w converters_crc.js) ──
function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica: ' + a);
  return HTML.slice(i, j);
}
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

const pipeCode =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  block('function stableStringify(val, indent, _lvl) {', 'function saveArkmapAs()') + '\n' +
  block('function _canonicalizeMapForSave(map) {', 'function _arkmapSuggestedName() {') + '\n' +
  extract(HTML, 'function applyMap(map) {') + '\n' +
  'return { verifyChecksums, _prepareArkmapForSave, _serializeMap, _serializeMapForSave, applyMap, _computeV4Checksums };';

function makeCtx() {
  const state = { map: null, areas: new Map(), roomById: {}, roomArea: {}, colorCache: {}, filename: 'x.arkmap', z: 0 };
  const dummyEl = () => ({
    classList: { remove() {}, add() {}, toggle() {} },
    disabled: false, innerHTML: '', style: {}, title: '', textContent: '', dataset: {},
  });
  const documentStub = { getElementById: () => dummyEl(), querySelector: () => null };
  const localStorageStub = { removeItem() {}, getItem: () => null, setItem() {} };
  const fn = new Function(
    'state', 'document', 'localStorage', 'searchIn', 'btnSaveArkmap', 'btnSaveDat', 'btnSaveAs2',
    'buildColorCache', 'buildAreaList', '_recomputeAstarParams', 'selectArea', 'escHtml',
    'rebuildLegend',
    '_pixmapCache', '_hopViaCache',
    pipeCode
  );
  const api = fn(
    state, documentStub, localStorageStub, dummyEl(), dummyEl(), dummyEl(), dummyEl(),
    () => { state.colorCache = {}; }, () => {}, () => {}, () => {}, (s) => String(s),
    () => {},
    new Map(), new Map()
  );
  return { state, api };
}

// ── mapa testowa: poprawna v2 + nieznane klucze na każdym poziomie ──────────
const FONT = { family: 'F', fixed_pitch: true, pixel_size: 10, point_size: -1,
               strike_out: false, style_hint: 7, style_setting: false, underline: false, weight: 50 };

function mkMap(withUnknown) {
  const m = {
    format: 'arkmap', format_version: 2,
    meta: {
      map_name: 'D3', symbol_font: { ...FONT }, symbol_font_fudge_factor: 1.0, use_only_map_font: false,
    },
    colors: { env_colors: { 1: 7 } },
    areas: [{
      id: 1, name: 'Obszar',
      rooms: [{ id: 1, x: 0, y: 0, z: 0, env: 1 }],
      labels: [{ id: 1, x: 1.5, y: 2.5, z: 0, width: 10, height: 5, text: 'L',
                 fg_color: [1, 2, 3], bg_color: [4, 5, 6] }],
    }],
  };
  if (withUnknown) {
    m.z_unknown_top = { przyszly: 'format', lista: [1, { a: 'b' }], n: null };
    m.meta.z_unknown_meta = 'przyszła adnotacja';
    m.colors.z_unknown_colors = { eksperyment: [1, 2] };
    m.areas[0].z_unknown_area = { ui: { zakladka: true } };
    m.areas[0].rooms[0].z_unknown_room = 'mechanika z przyszłości 🐉';
    m.areas[0].labels[0].z_unknown_label = 42;
  }
  return m;
}

// Porownanie semantyczne: stableStringify kanonizuje kolejnosc kluczy,
// wiec "verbatim" = te same klucze/wartosci (glebokie rownanie po sortowaniu).
function canonStr(v) {
  if (Array.isArray(v)) return '[' + v.map(canonStr).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonStr(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

// ═══ T1: round-trip load → save zachowuje nieznane klucze verbatim ═══
console.log('── T1: unknown keys przetrwaly round-trip (wszystkie poziomy) ──');
{
  const { state, api } = makeCtx();
  api.applyMap(JSON.parse(JSON.stringify(mkMap(true))));
  const out = JSON.parse(api._serializeMapForSave());
  ok(canonStr(out.z_unknown_top) === canonStr({ przyszly: 'format', lista: [1, { a: 'b' }], n: null }),
     'top-level: klucz nieznany przetrwal verbatim (zagnieżdżenie, null)');
  ok(out.meta.z_unknown_meta === 'przyszła adnotacja', 'meta: klucz nieznany przetrwal');
  ok(JSON.stringify(out.colors.z_unknown_colors) === JSON.stringify({ eksperyment: [1, 2] }), 'colors: klucz nieznany przetrwal');
  ok(JSON.stringify(out.areas[0].z_unknown_area) === JSON.stringify({ ui: { zakladka: true } }), 'obszar: klucz nieznany przetrwal');
  ok(out.areas[0].rooms[0].z_unknown_room === 'mechanika z przyszłości 🐉', 'pokój: klucz nieznany przetrwal (unicode)');
  ok(out.areas[0].labels[0].z_unknown_label === 42, 'label: klucz nieznany przetrwal');
  ok(out.format === 'arkmap' && out.format_version === 2, 'koperta v2 w zapisie (format + format_version)');
  ok(out.checksums && out.checksums.alg === 'v4' && !out.meta.checksums,
     'sumy na top-level; meta.checksums nie istnieje');
}

// ═══ T2: zakres sum — unknown keys poza r4/a4/f4, wewnatrz checksums.meta ═══
console.log('── T2: zakres sum v4 — identity stabilne, integrity meta objeta ──');
{
  const ctx1 = makeCtx(), ctx2 = makeCtx();
  ctx1.api.applyMap(JSON.parse(JSON.stringify(mkMap(false))));
  ctx2.api.applyMap(JSON.parse(JSON.stringify(mkMap(true))));
  const cs1 = ctx1.api._computeV4Checksums(ctx1.state.map);
  const cs2 = ctx2.api._computeV4Checksums(ctx2.state.map);
  ok(cs1.file === cs2.file, 'checksums.file (identity) identyczne z/bez unknown keys');
  ok(cs1.areas['1'] === cs2.areas['1'] && cs1.rooms['1'] === cs2.rooms['1'],
     'sumy obszaru/pokoju identyczne z/bez unknown keys (poza zakresem a4/r4)');
  ok(cs1.meta !== cs2.meta,
     'checksums.meta (integrity) ROZNA — nieznane klucze w meta sa objete (D2)');

  // weryfikacja pliku z unknown keys: ok, a edycja unknown-key w meta → metaOk:false
  ctx2.api._prepareArkmapForSave();
  const r0 = ctx2.api.verifyChecksums(ctx2.state.map);
  ok(r0.present && r0.ok && r0.metaOk === true, 'plik z unknown keys: verify ok + metaOk:true');
  ctx2.state.map.meta.z_unknown_meta = 'edytowane poza edytorem';
  const r1 = ctx2.api.verifyChecksums(ctx2.state.map);
  ok(r1.ok === true && r1.metaOk === false,
     'edycja unknown-key w meta → metaOk:false, ok bez zmian (identity nietkniete)');
}

// ═══ T3: determinizm — dwa zapisy tej samej mapy z unknown keys bajtowo równe ═══
console.log('── T3: determinizm serializacji z unknown keys ──');
{
  const { state, api } = makeCtx();
  api.applyMap(JSON.parse(JSON.stringify(mkMap(true))));
  const a = api._serializeMapForSave();
  const b = api._serializeMapForSave();
  ok(a === b, 'dwa zapisy → bajtowo identyczne (unknown keys w sortowaniu, stabilne)');
  ok(a.indexOf('z_unknown_top') > -1 && a.indexOf('"z_unknown_top"') < a.indexOf('"meta"') === false,
     'unknown top-level key serializowany w porządku sortowanym (po format_version, przed meta)');
}

console.log('preserve_unknown: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
