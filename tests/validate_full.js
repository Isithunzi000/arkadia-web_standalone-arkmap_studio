// Harness — pelne pokrycie validate() / validateFont / validateUserData /
// validateLabel / validateArea (Arc 11 WS2). Uzupelnia tier4 T8 (labels-array,
// pixmap base64/cap — tu NIE duplikowane). Ekstrakcja verbatim sekcji validate.js.
// Uruchamianie z katalogu glownego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica: ' + a);
  return HTML.slice(i, j);
}
const code =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── validate.js ──', '// ── checksum.js ──') + '\n' +
  'return { validate, validateFont, validateUserData, validateLabel, validateArea, validateRoom };';
const api = new Function(code)();
const { validate, validateFont, validateUserData, validateLabel, validateArea } = api;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// zbiera bledy z wywolania walidatora
function errsOf(fn, ...args) {
  const errs = [];
  fn(...args, errs);
  return errs;
}
const has = (errs, p, m) => errs.some(e => e.path === p && (m === undefined ? true : e.msg.includes(m)));

const GOOD_FONT = { family: 'Sans', point_size: 12, pixel_size: 12, style_hint: 0, weight: 50,
                    style_setting: false, underline: false, strike_out: false, fixed_pitch: false };
const GOOD_LABEL = { id: 1, x: 0, y: 0, z: 0, width: 4, height: 1.2, text: 'L',
                     fg_color: [1, 2, 3], bg_color: [4, 5, 6] };
const GOOD_ROOM = { id: 1, x: 0, y: 0, z: 0, env: 1 };
const goodMap = () => ({ format: 'arkmap', format_version: 2,
  meta: { map_name: 'M', symbol_font: { ...GOOD_FONT }, symbol_font_fudge_factor: 1, use_only_map_font: false },
  colors: {}, areas: [] });

console.log('— T1: validateFont —');
ok(errsOf(validateFont, GOOD_FONT, 'f').length === 0, 'poprawny font bez bledow');
ok(has(errsOf(validateFont, null, 'f'), 'f', 'must be an object'), 'null -> must be an object');
ok(has(errsOf(validateFont, 'x', 'f'), 'f', 'must be an object'), 'string -> must be an object');
ok(has(errsOf(validateFont, { ...GOOD_FONT, family: 7 }, 'f'), 'f.family', 'string'), 'family nie-string');
ok(has(errsOf(validateFont, { ...GOOD_FONT, point_size: '12' }, 'f'), 'f.point_size', 'number'), 'point_size nie-number');
ok(has(errsOf(validateFont, { ...GOOD_FONT, pixel_size: null }, 'f'), 'f.pixel_size', 'number'), 'pixel_size null');
ok(has(errsOf(validateFont, { ...GOOD_FONT, style_hint: 1.5 }, 'f'), 'f.style_hint', 'integer'), 'style_hint nie-integer');
ok(has(errsOf(validateFont, { ...GOOD_FONT, weight: 'bold' }, 'f'), 'f.weight', 'integer'), 'weight nie-integer');
ok(has(errsOf(validateFont, { ...GOOD_FONT, underline: 1 }, 'f'), 'f.underline', 'boolean'), 'underline nie-boolean');
ok(has(errsOf(validateFont, { ...GOOD_FONT, strike_out: 'no' }, 'f'), 'f.strike_out', 'boolean'), 'strike_out nie-boolean');
ok(has(errsOf(validateFont, { ...GOOD_FONT, fixed_pitch: 0 }, 'f'), 'f.fixed_pitch', 'boolean'), 'fixed_pitch nie-boolean');
ok(has(errsOf(validateFont, { ...GOOD_FONT, style_setting: null }, 'f'), 'f.style_setting', 'boolean'), 'style_setting null');

console.log('— T2: validateUserData —');
ok(errsOf(validateUserData, {}, 'u').length === 0, 'pusty obiekt bez bledow');
ok(errsOf(validateUserData, { k: 'v' }, 'u').length === 0, 'string->string bez bledow');
ok(has(errsOf(validateUserData, null, 'u'), 'u', 'must be an object'), 'null -> blad');
ok(has(errsOf(validateUserData, [1], 'u'), 'u', 'must be an object'), 'tablica -> blad');
ok(has(errsOf(validateUserData, { k: 5 }, 'u'), 'u', 'strings'), 'wartosc nie-string -> blad');

console.log('— T3: validateLabel — galezie niepokryte przez tier4 T8 —');
ok(errsOf(validateLabel, GOOD_LABEL, 'l').length === 0, 'poprawna etykieta bez bledow');
ok(has(errsOf(validateLabel, null, 'l'), 'l', 'must be an object'), 'null -> must be an object');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, id: 1.5 }, 'l'), 'l.id', 'integer'), 'id nie-integer');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, x: '0' }, 'l'), 'l.x', 'number'), 'x nie-number');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, z: 0.5 }, 'l'), 'l.z', 'integer'), 'z nie-integer');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, width: '4' }, 'l'), 'l.width', 'number'), 'width nie-number');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, height: null }, 'l'), 'l.height', 'number'), 'height null');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, text: 9 }, 'l'), 'l.text', 'string'), 'text nie-string');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, fg_color: [1, 2] }, 'l'), 'l.fg_color'), 'fg_color za krotki');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, bg_color: [256, 0, 0] }, 'l'), 'l.bg_color'), 'bg_color poza 0-255');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, no_scaling: 1 }, 'l'), 'l.no_scaling', 'boolean'), 'no_scaling nie-boolean');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, show_on_top: 'y' }, 'l'), 'l.show_on_top', 'boolean'), 'show_on_top nie-boolean');
ok(has(errsOf(validateLabel, { ...GOOD_LABEL, pixmap: 42 }, 'l'), 'l.pixmap', 'string or null'), 'pixmap nie-string');
ok(errsOf(validateLabel, { ...GOOD_LABEL, pixmap: null }, 'l').length === 0, 'pixmap null dozwolony');
ok(errsOf(validateLabel, { ...GOOD_LABEL, pixmap: '' }, 'l').length === 0, 'pixmap pusty string dozwolony');

console.log('— T4: validateArea — galezie niepokryte przez tier4 T8 —');
ok(has(errsOf(validateArea, null, 'a'), 'a', 'must be an object'), 'null -> must be an object');
ok(has(errsOf(validateArea, { id: 1.5, name: 'A', rooms: [] }, 'a'), 'a.id', 'integer'), 'id nie-integer');
ok(has(errsOf(validateArea, { id: 1, name: 7, rooms: [] }, 'a'), 'a.name', 'string'), 'name nie-string');
ok(has(errsOf(validateArea, { id: 1, name: 'A', rooms: {} }, 'a'), 'a.rooms', 'array'), 'rooms nie-array');
ok(has(errsOf(validateArea, { id: 1, name: 'A', rooms: [], grid_mode: 'yes' }, 'a'), 'a.grid_mode', 'boolean'), 'grid_mode nie-boolean');
ok(has(errsOf(validateArea, { id: 1, name: 'A', rooms: [], is_zone: 1 }, 'a'), 'a.is_zone', 'boolean'), 'is_zone nie-boolean');
ok(has(errsOf(validateArea, { id: 1, name: 'A', rooms: [], zone_area_ref: 1.5 }, 'a'), 'a.zone_area_ref', 'integer'), 'zone_area_ref nie-integer');
ok(has(errsOf(validateArea, { id: 1, name: 'A', rooms: [], user_data: [1] }, 'a'), 'a.user_data'), 'user_data tablica -> blad (delegacja)');
{
  const errs = errsOf(validateArea, { id: 1, name: 'A', rooms: [], labels: [GOOD_LABEL, { ...GOOD_LABEL }] }, 'a');
  ok(has(errs, 'a.labels', 'duplicate label id'), 'duplikat id etykiety');
}
{
  const errs = [], warns = [];
  const ids = validateArea({ id: 1, name: 'A', rooms: [GOOD_ROOM] }, 'a', errs, warns);
  ok(errs.length === 0 && JSON.stringify(ids) === '[1]', 'poprawny pokoj: zero bledow, zwrocone roomIds [1]');
}

console.log('— T5: validate() top-level —');
const v = m => validate(m);
ok(v(goodMap()).ok === true, 'minimalna poprawna mapa: ok=true, zero bledow');
ok(v({ ...goodMap(), format: 'mudlet' }).errors.some(e => e.path === 'format'), 'zly format');
ok(v({ ...goodMap(), format_version: 1 }).errors.some(e => e.path === 'format_version'), 'zla wersja (v1 odrzucana — koperta v2)');
ok(v({ ...goodMap(), format_version: 3 }).errors.some(e => e.path === 'format_version'), 'zla wersja (v3 z przyszlosci odrzucana)');
ok(v({ ...goodMap(), meta: undefined }).errors.some(e => e.path === 'meta' && e.msg === 'required'), 'brak meta');
ok(v({ ...goodMap(), meta: [] }).errors.some(e => e.path === 'meta' && e.msg === 'must be an object'), 'meta tablica');
ok(v({ ...goodMap(), meta: { ...goodMap().meta, map_name: 1 } }).errors.some(e => e.path === 'meta.map_name'), 'map_name nie-string');
ok(v({ ...goodMap(), meta: { ...goodMap().meta, symbol_font: undefined } }).errors.some(e => e.path === 'meta.symbol_font' && e.msg === 'required'), 'brak symbol_font');
ok(v({ ...goodMap(), meta: { ...goodMap().meta, symbol_font: { ...GOOD_FONT, weight: 'x' } } }).errors.some(e => e.path === 'meta.symbol_font.weight'), 'symbol_font delegacja do validateFont');
ok(v({ ...goodMap(), meta: { ...goodMap().meta, symbol_font_fudge_factor: '1' } }).errors.some(e => e.path === 'meta.symbol_font_fudge_factor'), 'fudge_factor nie-number');
ok(v({ ...goodMap(), meta: { ...goodMap().meta, use_only_map_font: 0 } }).errors.some(e => e.path === 'meta.use_only_map_font'), 'use_only_map_font nie-boolean');
ok(v({ ...goodMap(), meta: { ...goodMap().meta, room_id_hash: [] } }).errors.some(e => e.path === 'meta.room_id_hash'), 'room_id_hash tablica');
ok(v({ ...goodMap(), meta: { ...goodMap().meta, room_id_hash: { dev: 'x' } } }).errors.some(e => e.path === 'meta.room_id_hash.dev'), 'room_id_hash wartosc nie-integer');
ok(v({ ...goodMap(), meta: { ...goodMap().meta, user_data: { k: 1 } } }).errors.some(e => e.path === 'meta.user_data'), 'meta.user_data delegacja');
ok(v({ ...goodMap(), colors: null }).errors.some(e => e.path === 'colors' && e.msg === 'required'), 'brak colors');
ok(v({ ...goodMap(), colors: [] }).errors.some(e => e.path === 'colors' && e.msg === 'must be an object'), 'colors tablica');
ok(v({ ...goodMap(), colors: { env_colors: { 1: 256 } } }).errors.some(e => e.path === 'colors.env_colors.1'), 'env_colors poza 0-255');
ok(v({ ...goodMap(), colors: { custom_env_colors: { 200: [1, 2] } } }).errors.some(e => e.path === 'colors.custom_env_colors.200'), 'custom_env_colors nie-RGB');
{
  const r = v({ ...goodMap(), areas: {} });
  ok(r.ok === false && r.errors.some(e => e.path === 'areas'), 'areas nie-array -> ok=false, early return');
}
{
  const a = { id: 1, name: 'A', rooms: [] };
  ok(v({ ...goodMap(), areas: [a, { ...a }] }).errors.some(e => e.msg.includes('duplicate area id')), 'duplikat area id');
}
{
  const a1 = { id: 1, name: 'A', rooms: [GOOD_ROOM] };
  const a2 = { id: 2, name: 'B', rooms: [{ ...GOOD_ROOM }] };
  ok(v({ ...goodMap(), areas: [a1, a2] }).errors.some(e => e.msg.includes('duplicate room id')), 'duplikat room id miedzy obszarami');
}
{
  const a1 = { id: 1, name: 'A', rooms: [{ ...GOOD_ROOM, exits: { n: 999 } }] };
  ok(v({ ...goodMap(), areas: [a1] }).errors.some(e => e.msg.includes('does not exist')), 'exit do nieistniejacego pokoju');
}
{
  const a1 = { id: 1, name: 'A', rooms: [{ ...GOOD_ROOM, special_exits: { 'bierz schody': 'x' } }] };
  ok(v({ ...goodMap(), areas: [a1] }).errors.some(e => e.msg.includes('must be integer roomId')), 'special_exit cel nie-integer');
}
{
  const a1 = { id: 1, name: 'A', rooms: [{ ...GOOD_ROOM, special_exits: { 'bierz schody': 999 } }] };
  ok(v({ ...goodMap(), areas: [a1] }).errors.some(e => e.msg.includes('does not exist')), 'special_exit do nieistniejacego pokoju');
}
{
  const a1 = { id: 1, name: 'A', rooms: [{ id: 1, x: 0, y: 0, z: 0, env: 1 }, { id: 2, x: 1, y: 0, z: 0, env: 1, exits: { w: 1 } }] };
  const r = v({ ...goodMap(), areas: [a1] });
  ok(r.ok === true && r.errors.length === 0, 'mapa z poprawnym linkiem exit: ok=true');
}

console.log('\nvalidate_full: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
