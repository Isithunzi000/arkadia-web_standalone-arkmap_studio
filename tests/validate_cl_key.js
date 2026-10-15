// Harness — custom_lines pod kierunkiem/spolecialnym wyjsciem, ktore nie istnieje
// w exits/special_exits (upstream: dir_bind, release 0.252.0 pokoj 20430).
// Mudlet takie dane przechowuje natywnie (customLines to mapa niezalezna od
// exits), wiec walidator sygnalizuje to ostrzezeniem, nie bledem — inaczej
// sync-map (tools/dat2arkmap.mjs, fail-closed) pada na kazdej mapie z dir_bind.
// Ekstrakcja verbatim sekcji validate.js. Uruchamianie z katalogu glownego repo.
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
  'return { validate };';
const { validate } = new Function(code)();

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

const GOOD_FONT = { family: 'Sans', point_size: 12, pixel_size: 12, style_hint: 0, weight: 50,
                    style_setting: false, underline: false, strike_out: false, fixed_pitch: false };
function mapWith(room) {
  return { format: 'arkmap', format_version: 2,
    meta: { map_name: 'M', symbol_font: { ...GOOD_FONT }, symbol_font_fudge_factor: 1, use_only_map_font: false },
    colors: {}, areas: [{ id: 1, name: 'A', rooms: [room, { id: 2, x: 1, y: 0, z: 0, env: 1 }] }] };
}
const BASE_ROOM = { id: 1, x: 0, y: 0, z: 0, env: 1, exits: { e: 2 } };

console.log('— custom_lines: klucz spoza exits/special_exits (dir_bind) —');
{
  const room = { ...BASE_ROOM, custom_lines: { w: { points: [], color: [255, 0, 0] } } };
  const r = validate(mapWith(room));
  ok(r.ok === true, 'points:[] bez wyjscia -> mapa OK (ostrzezenie, nie blad)');
  ok(r.errors.filter(e => e.path.endsWith('custom_lines.w')).length === 0,
     'brak bledu custom_lines.w');
  ok(r.warnings.some(e => e.path.endsWith('custom_lines.w') && e.msg.includes('not in exits')),
     'ostrzezenie custom_lines.w (not in exits)');
}
{
  const room = { ...BASE_ROOM, custom_lines: { w: { points: [[1, 1], [2, 2]] } } };
  const r = validate(mapWith(room));
  ok(r.ok === true, 'linia z punktami bez wyjscia -> mapa OK (ostrzezenie)');
  ok(r.warnings.some(e => e.path.endsWith('custom_lines.w')), 'ostrzezenie dla linii z punktami');
}
console.log('— custom_lines: klucz BEZWZGLEDNIE zly (nie kierunek, nie special) —');
{
  // komenda spoza VALID_DIRS nie pokrywa sie z exits -> nadal ostrzezenie,
  // ale points nie-tablica pozostaje bledem
  const room = { ...BASE_ROOM, custom_lines: { w: { points: 'x' } } };
  const r = validate(mapWith(room));
  ok(r.ok === false, 'points nie-tablica -> nadal blad');
  ok(r.errors.some(e => e.path.endsWith('custom_lines.w.points')), 'blad points zachowany');
}
console.log('— custom_lines: poprawne klucze bez nowych ostrzezen —');
{
  const room = { ...BASE_ROOM, custom_lines: { e: { points: [] }, sciezka: { points: [[1, 1]] } },
                 special_exits: { sciezka: 2 } };
  const r = validate(mapWith(room));
  ok(r.ok === true, 'klucz z exits i special_exits -> OK');
  ok(r.warnings.filter(e => e.path.includes('custom_lines')).length === 0,
     'zero ostrzezen custom_lines dla istniejacych kluczy');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} (${pass} OK, ${fail} FAIL)`);
process.exit(fail === 0 ? 0 : 1);
