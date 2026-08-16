// Harness — sync mapy online: tools/dat2arkmap.mjs na przypiętym fixture 0.205.0.
// Pokrywa: CLI, konwersję, złote liczby fixture, wtrysk version/revision,
// zachowanie user_data upstream (lustro), determinizm, walidację fail-closed.
// Uruchamianie z katalogu głównego repo. Wymaga fixture (tests/fetch-fixture.sh).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const TOOL = path.join(ROOT, 'tools', 'dat2arkmap.mjs');

const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) {
  console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
  process.exit(2);
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── validate/verifyChecksums z aplikacji (ekstrakcja verbatim) ──────────────
function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica: ' + a);
  return HTML.slice(i, j);
}
const apiCode =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── validate.js ──', '// ── checksum.js ──') + '\n' +
  block('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  block('function stableStringify(val, indent, _lvl) {', 'function saveArkmapAs()') + '\n' +
  'return { validate, verifyChecksums };';
const api = new Function('state', apiCode)({ map: null });

// ── Pomocnicze ──────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sync_map-'));
function runTool(args) {
  return spawnSync('node', [TOOL, ...args], { encoding: 'utf8' });
}
const TEST_SHA = '0123456789abcdef0123456789abcdef01234567';

// ── CLI: błędne użycie ──────────────────────────────────────────────────────
console.log('— CLI —');
{
  const r = runTool([]);
  ok(r.status === 2, 'brak argumentów → kod 2 (usage)');
  const r2 = runTool([path.join(TMP, 'brak.dat'), path.join(TMP, 'x.arkmap')]);
  ok(r2.status === 1, 'nieistniejące wejście → kod 1');
  ok(!fs.existsSync(path.join(TMP, 'x.arkmap')), 'nieistniejące wejście → brak pliku wyjściowego');
}
{
  const garbage = path.join(TMP, 'garbage.dat');
  fs.writeFileSync(garbage, Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37 + 11) & 0xff)));
  const out = path.join(TMP, 'garbage.arkmap');
  const r = runTool([garbage, out]);
  ok(r.status === 1, 'śmieciowe wejście → kod 1 (fail-closed)');
  ok(!fs.existsSync(out), 'śmieciowe wejście → brak pliku wyjściowego');
}

// ── Konwersja fixture ───────────────────────────────────────────────────────
console.log('— fixture 0.205.0 —');
ok(fs.statSync(FIX).size === 7847878, 'fixture przypięty (7 847 878 B)');
const OUT1 = path.join(TMP, 'out1.arkmap');
const r1 = runTool([FIX, OUT1, '--version', '0.205.0', '--revision', TEST_SHA]);
ok(r1.status === 0, 'konwersja fixture → kod 0' + (r1.status !== 0 ? ' [stderr: ' + r1.stderr.slice(0, 200) + ']' : ''));
ok(fs.existsSync(OUT1), 'plik wyjściowy istnieje');
const map = JSON.parse(fs.readFileSync(OUT1, 'utf8'));

let rooms = 0, exits = 0, special = 0, cl = 0, sup = 0;
for (const ar of map.areas) for (const r of ar.rooms) {
  rooms++;
  exits += Object.keys(r.exits ?? {}).length;
  special += Object.keys(r.special_exits ?? {}).length;
  for (const v of Object.values(r.custom_lines ?? {})) {
    cl++;
    if (Array.isArray(v.points) && v.points.length === 0) sup++;
  }
}
ok(map.areas.length === 60, 'złota liczba obszarów (60)');
ok(rooms === 26988, 'złota liczba pokoi (26 988)');
ok(exits === 92141, 'złota liczba wyjść (92 141)');
ok(special === 4279, 'złota liczba special_exits (4 279)');
ok(cl === 2779, 'złota liczba custom lines (2 779)');
ok(sup === 108, 'złota liczba supresorów (108)');

// ── Wtrysk i lustro ─────────────────────────────────────────────────────────
console.log('— wtrysk / lustro —');
const ud = map.meta.user_data ?? {};
ok(ud.version === '0.205.0', 'wtrysk --version → meta.user_data.version');
ok(ud.revision === TEST_SHA, 'wtrysk --revision → meta.user_data.revision');
ok(ud.map_sync_version === '430', 'user_data upstream zachowane (map_sync_version=430)');
ok(typeof ud['system.fallback_mapSymbolFont'] === 'string', 'user_data upstream zachowane (system.*)');
{
  const OUT3 = path.join(TMP, 'out3.arkmap');
  const r3 = runTool([FIX, OUT3]);
  ok(r3.status === 0, 'konwersja bez flag → kod 0');
  const ud3 = JSON.parse(fs.readFileSync(OUT3, 'utf8')).meta.user_data ?? {};
  ok(ud3.revision === '5ed22affd9f1f27886199437c20d527971e9af53', 'bez flag: oryginalny revision upstream nietknięty (lustro)');
}

// ── Walidacja i checksumy wyjścia ───────────────────────────────────────────
console.log('— walidacja wyjścia —');
const v = api.validate(map);
ok(v.ok && v.errors.length === 0, 'validate(wyjście): 0 błędów');
ok(v.warnings.length === 0, 'validate(wyjście): 0 ostrzeżeń');
const vc = api.verifyChecksums(map);
ok(vc.present && vc.ok && vc.fileOk, 'verifyChecksums(wyjście): wszystkie zgodne');

// ── Determinizm ─────────────────────────────────────────────────────────────
console.log('— determinizm —');
const OUT2 = path.join(TMP, 'out2.arkmap');
const r2 = runTool([FIX, OUT2, '--version', '0.205.0', '--revision', TEST_SHA]);
ok(r2.status === 0, 'druga konwersja → kod 0');
ok(fs.readFileSync(OUT1).equals(fs.readFileSync(OUT2)), 'dwa przebiegi = bajtowo identyczne wyjście');

// ── Posprzątanie ────────────────────────────────────────────────────────────
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\nsync_map: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
