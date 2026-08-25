// Harness — checksums_v4: sumy kontrolne XXH3-64 / kanoniczne kodowanie binarne v4.
// Zastępuje checksums_v3.js (alg v3 wycofany w v1.45.0 — Arc 20).
// Metoda: ekstrakcja bloków ====XXH3-64==== / ====CANONICAL-V4==== z arkmap_studio.html
// i weryfikacja przeciw zewnętrznemu oracle: tests/checksums/vectors_v4.json
// (referencyjny enkoder Python + moduł xxhash — tests/checksums/oracle_v4.py).
// Golden fixture: tests/checksums/golden_fixture.arkmap (2 obszary, 12 pokoi, wszystkie
// pola + edge cases v4: room.hash, alfa w labelach, grid_mode/is_zone/zone_area_ref/pos).
// Spec normatywny: tests/checksums/CANONICAL_V4.md.
// Uruchamianie z katalogu głównego repo: node tests/checksums_v4.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const VECTORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'checksums', 'vectors_v4.json'), 'utf8'));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'checksums', 'golden_fixture.arkmap'), 'utf8'));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Ekstrakcja bloków markierowych z arkmap_studio.html ──────────────────────
function markerBlock(tag) {
  const re = new RegExp('// ====' + tag + '-BEGIN====([\\s\\S]*?)// ====' + tag + '-END====');
  const m = HTML.match(re);
  if (!m) throw new Error('kotwica: marker ' + tag);
  return m[1];
}
const api = new Function(
  markerBlock('XXH3-64') + '\n' + markerBlock('CANONICAL-V4') +
  '\n;return { addChecksums, verifyChecksums, _computeV4Checksums, _encodeRoomCanonical, _encodeColorsCanonical,' +
  ' _canonBuf, _V4_DIR_ORDER, xxh3_64, xxh3_64hex };'
)();

function freshMap() { return JSON.parse(JSON.stringify(FIXTURE)); }

// ═══ T1: golden fixture end-to-end przeciw oracle ═══
console.log('── T1: golden fixture — sumy zgodne z oracle (Python/xxhash) ──');
{
  const map = freshMap();
  api.addChecksums(map);
  const cs = map.meta.checksums;
  ok(cs.alg === 'v4', "alg === 'v4'");
  ok(cs.file === VECTORS.golden.file.hash, 'suma pliku zgodna z oracle');
  for (const [id, v] of Object.entries(VECTORS.golden.areas)) {
    ok(cs.areas[id] === v.hash, 'suma obszaru ' + id + ' zgodna z oracle');
  }
  for (const [id, v] of Object.entries(VECTORS.golden.rooms)) {
    ok(cs.rooms[id] === v.hash, 'suma pokoju ' + id + ' zgodna z oracle');
  }
  ok(Object.keys(cs.rooms).length === 12 && Object.keys(cs.areas).length === 2,
     'komplet wpisow: 12 pokoi, 2 obszary');
  ok(/^[0-9a-f]{16}$/.test(cs.file), 'suma pliku: 16 znakow hex');
}

// ═══ T2: kotwice bajtowe kodowania kanonicznego ═══
console.log('── T2: kotwice bajtowe (minimalny pokoj, sekcja colors) ──');
{
  const room1 = FIXTURE.areas[0].rooms.find(r => r.id === 1);
  const enc = api._encodeRoomCanonical(room1);
  const hex = Array.from(enc, b => b.toString(16).padStart(2, '0')).join('');
  ok(hex === VECTORS.golden.minimal_room_enc_hex, 'kodowanie minimalnego pokoju == oracle (bajtowo)');
  ok(hex.startsWith('7234'), "prefix pokoju 'r4' (0x72 0x34)");
  const B = api._canonBuf; B.reset();
  api._encodeColorsCanonical(B, FIXTURE.colors);
  const chex = Array.from(B.bytes(), b => b.toString(16).padStart(2, '0')).join('');
  B.release();
  ok(chex === VECTORS.golden.colors_enc_hex, 'kodowanie colors == oracle (bajtowo)');
}

// ═══ T3: kanonizacja — jawne wartości domyślne i kolejność kluczy nie zmieniają sumy ═══
console.log('── T3: kanonizacja (strip-equivalence, shuffled keys, pole wewnetrzne area) ──');
{
  const base = freshMap();
  api.addChecksums(base);
  const hBase = base.meta.checksums.rooms['5'];
  ok(hBase === VECTORS.golden.strip_equivalence.hash, 'pokoj 5: hash zgodny z oracle');

  const explicit = freshMap();
  const r5 = explicit.areas[0].rooms.find(r => r.id === 5);
  // jawne puste kontenery + wartości domyślne + pole wewnetrzne `area`
  const extras = {
    exits: {}, doors: {}, exit_weights: {}, custom_lines: {}, special_exits: {},
    user_data: {}, stubs: [], exit_locks: [], special_exit_locks: [], tags: [],
    locked: false, hidden: false, symbol: '', name: '', notes: '', area: 1,
  };
  // przebudowana kolejność kluczy (odwrotnie)
  const rebuilt = {};
  for (const k of [...Object.keys(r5)].reverse()) rebuilt[k] = r5[k];
  Object.assign(rebuilt, extras);
  explicit.areas[0].rooms[explicit.areas[0].rooms.findIndex(r => r.id === 5)] = rebuilt;
  api.addChecksums(explicit);
  ok(explicit.meta.checksums.rooms['5'] === hBase,
     'jawne domyślne + puste kontenery + przestawione klucze + pole area → ta sama suma');
  ok(explicit.meta.checksums.file === base.meta.checksums.file,
     'suma pliku odporna na te modyfikacje');
}

// ═══ T4: verifyChecksums — OK i wykrywanie korupcji ═══
console.log('── T4: verifyChecksums — OK / korupcja pokoju / obszaru / colors / brak wpisu ──');
{
  const map = freshMap();
  api.addChecksums(map);
  const r0 = api.verifyChecksums(map);
  ok(r0.present === true && r0.ok === true && r0.fileOk === true,
     'świeży plik: present && ok && fileOk');
  ok(r0.computed && r0.computed.alg === 'v4' && r0.computed.file === map.meta.checksums.file,
     'verify zwraca computed (reużycie przez baseInfo — jedno liczenie na load)');

  const mRoom = freshMap(); api.addChecksums(mRoom);
  mRoom.areas[0].rooms.find(r => r.id === 2).name = 'Zmieniona nazwa';
  const r1 = api.verifyChecksums(mRoom);
  ok(r1.ok === false && r1.badRooms.length === 1 && r1.badRooms[0].roomId === 2,
     'zmiana nazwy pokoju → badRooms=[2], ok=false');
  ok(r1.fileOk === false, 'zmiana pokoju → suma pliku też niezgodna (rollup obszaru)');

  const mArea = freshMap(); api.addChecksums(mArea);
  mArea.areas[0].name = 'Zmieniony obszar';
  const r2 = api.verifyChecksums(mArea);
  ok(r2.ok === false && r2.badAreas.length === 1 && r2.badAreas[0].id === 1 && r2.badRooms.length === 0,
     'zmiana nazwy obszaru → badAreas=[1], pokoje czyste');

  const mAud = freshMap(); api.addChecksums(mAud);
  mAud.areas[0].user_data['area-key'] = 'zmieniona wartosc';
  const r2b = api.verifyChecksums(mAud);
  ok(r2b.ok === false && r2b.badAreas.length === 1 && r2b.badAreas[0].id === 1 && r2b.badRooms.length === 0,
     'zmiana user_data obszaru → badAreas=[1] (zakres a4 obejmuje user_data)');
  const mAud2 = freshMap(); api.addChecksums(mAud2);
  delete mAud2.areas[0].user_data;
  const r2c = api.verifyChecksums(mAud2);
  ok(r2c.ok === false && r2c.badAreas.length === 1,
     'usunięcie user_data obszaru → badAreas (obecność też objęta sumą)');

  const mCol = freshMap(); api.addChecksums(mCol);
  mCol.colors.env_colors['2'] = 99;
  const r3 = api.verifyChecksums(mCol);
  ok(r3.ok === false && r3.fileOk === false && r3.badAreas.length === 0 && r3.badRooms.length === 0,
     'zmiana colors → tylko suma pliku niezgodna');

  const mMiss = freshMap(); api.addChecksums(mMiss);
  delete mMiss.meta.checksums.rooms['3'];
  const r4 = api.verifyChecksums(mMiss);
  ok(r4.ok === false && r4.missingRooms.includes(3),
     'brak wpisu pokoju w stored.rooms → missingRooms=[3]');
}

// ═══ T4b: zakres v4 — pola nowo objęte sumą (luki v3 zamknięte) ═══
console.log('── T4b: zakres v4 — room.hash / alfa labela / grid_mode / is_zone / zone_area_ref / pos ──');
{
  const mHash = freshMap(); api.addChecksums(mHash);
  mHash.areas[0].rooms.find(r => r.id === 2).hash = '99:99:9:Podmieniony';
  const rh = api.verifyChecksums(mHash);
  ok(rh.ok === false && rh.badRooms.length === 1 && rh.badRooms[0].roomId === 2,
     'zmiana room.hash → badRooms=[2] (v3 tego nie widział)');

  const mAlfa = freshMap(); api.addChecksums(mAlfa);
  mAlfa.areas[0].labels.find(l => l.id === 3).fg_color[3] = 255;
  const ra = api.verifyChecksums(mAlfa);
  ok(ra.ok === false && ra.badAreas.length === 1 && ra.badAreas[0].id === 1,
     'zmiana kanału alfa labela → badAreas=[1] (v3 widział tylko RGB)');

  for (const [fld, val] of [['grid_mode', false], ['pos', [0, 0, 0]]]) {
    const m = freshMap(); api.addChecksums(m);
    m.areas[0][fld] = val;
    const r = api.verifyChecksums(m);
    ok(r.ok === false && r.badAreas.length === 1 && r.badAreas[0].id === 1,
       'zmiana area.' + fld + ' → badAreas=[1]');
  }
  for (const [fld, val] of [['is_zone', false], ['zone_area_ref', 999]]) {
    const m = freshMap(); api.addChecksums(m);
    m.areas[1][fld] = val;
    const r = api.verifyChecksums(m);
    ok(r.ok === false && r.badAreas.length === 1 && r.badAreas[0].id === -5,
       'zmiana area.' + fld + ' → badAreas=[-5]');
  }
}

// ═══ T4c: spójność słowników — missingAreas / extraRooms / extraAreas (głośno) ═══
console.log('── T4c: missingAreas / extraRooms / extraAreas → ok:false ──');
{
  const mMissA = freshMap(); api.addChecksums(mMissA);
  delete mMissA.meta.checksums.areas['-5'];
  const r1 = api.verifyChecksums(mMissA);
  ok(r1.ok === false && r1.missingAreas.length === 1 && r1.missingAreas[0].id === -5
     && r1.missingAreas[0].name === 'Ujemny obszar',
     'brak wpisu obszaru → missingAreas=[{id:-5,name}]');

  const mXtraR = freshMap(); api.addChecksums(mXtraR);
  mXtraR.meta.checksums.rooms['777'] = 'deadbeefdeadbeef';
  const r2 = api.verifyChecksums(mXtraR);
  ok(r2.ok === false && r2.extraRooms.length === 1 && r2.extraRooms[0] === '777',
     'sierota w stored.rooms → extraRooms=[777]');

  const mXtraA = freshMap(); api.addChecksums(mXtraA);
  mXtraA.meta.checksums.areas['888'] = 'deadbeefdeadbeef';
  const r3 = api.verifyChecksums(mXtraA);
  ok(r3.ok === false && r3.extraAreas.length === 1 && r3.extraAreas[0] === '888',
     'sierota w stored.areas → extraAreas=[888]');

  // deterministyczny porządek sierot (bajtowy po kluczu-stringu)
  const mSort = freshMap(); api.addChecksums(mSort);
  mSort.meta.checksums.rooms['10'] = 'a'.repeat(16);
  mSort.meta.checksums.rooms['9'] = 'b'.repeat(16);
  const r4 = api.verifyChecksums(mSort);
  ok(JSON.stringify(r4.extraRooms) === JSON.stringify(['10', '9']),
     "extraRooms w porządku bajtowym kluczy ('10' < '9')");
}

// ═══ T5: alg != v4 → GŁOŚNO (algMismatch); brak sum → cicho ═══
console.log('── T5: algMismatch głośny (v1/v2/v3/v9), brak sum cichy ──');
{
  const mNone = freshMap();
  const r0 = api.verifyChecksums(mNone);
  ok(r0.present === false && r0.ok === true && r0.algMismatch === undefined,
     'brak checksums → present:false, ok:true, bez algMismatch');

  const mV1 = freshMap();
  mV1.meta.checksums = { file: 'deadbeef', areas: {}, rooms: {} };   // v1: bez pola alg
  const r1 = api.verifyChecksums(mV1);
  ok(r1.present === true && r1.ok === false && r1.algMismatch === 'undefined',
     'alg v1 (brak pola alg) → głośny algMismatch="undefined"');

  const mV3 = freshMap();
  mV3.meta.checksums = { alg: 'v3', file: 'deadbeefdeadbeef', areas: {}, rooms: {} };
  const r2 = api.verifyChecksums(mV3);
  ok(r2.present === true && r2.ok === false && r2.fileOk === false && r2.algMismatch === 'v3',
     'alg v3 (poprzedni) → głośny algMismatch="v3", ok:false (brak cichego skipu)');

  const mV9 = freshMap();
  mV9.meta.checksums = { alg: 'v9', file: 'deadbeefdeadbeef', areas: {}, rooms: {} };
  const r3 = api.verifyChecksums(mV9);
  ok(r3.present === true && r3.ok === false && r3.algMismatch === 'v9',
     'alg v9 (przyszły) → głośny algMismatch="v9" (odporność na downgrade/upgrade)');
}

// ═══ T5b: verifyChecksums NIGDY nie rzuca (biegnie przed dialogiem walidacji) ═══
console.log('── T5b: no-throw matrix — uszkodzone dane → verifyError, nie wyjątek ──');
{
  const cases = [
    ['labels jako obiekt (nie array)', m => { m.areas[0].labels = { 0: { id: 1 } }; }],
    ['rooms jako obiekt', m => { m.areas[0].rooms = { 0: { id: 1 } }; }],
    ['exits jako array', m => { m.areas[0].rooms[1].exits = [1, 2]; }],
    ['custom_lines punkt jako skalar', m => { m.areas[0].rooms[1].custom_lines.n.points = [5]; }],
    ['user_data wartosc nie-string', m => { m.areas[0].rooms[1].user_data = { k: 42 }; }],
    ['room.id jako string', m => { m.areas[0].rooms[1].id = 'abc'; }],
    ['area.pos niekompletne', m => { m.areas[0].pos = [1]; }],
    ['labels fg_color jako skalar', m => { m.areas[0].labels[0].fg_color = 7; }],
  ];
  for (const [name, mutate] of cases) {
    const m = freshMap();
    api.addChecksums(m);
    mutate(m);
    let threw = false, res = null;
    try { res = api.verifyChecksums(m); }
    catch (e) { threw = true; }
    ok(!threw && res && res.present === true && typeof res.ok === 'boolean',
       'bez rzutu: ' + name + (res && res.verifyError ? ' (verifyError)' : ''));
  }
}

// ═══ T6: piny strukturalne ═══
console.log('── T6: piny strukturalne ──');
{
  const chkBlock = HTML.slice(HTML.indexOf('// ── checksum.js ──'), HTML.indexOf('// ── mudlet_dat.js ──'));
  ok(!/_crcRoom|_crcArea|_crcFile|_stripAreaForCrc/.test(chkBlock),
     'sekcja checksum bez formuł v1/v2 (_crcRoom/_crcArea/_crcFile)');
  ok(!/a2:|f2:|a3:|f3:/.test(chkBlock), 'sekcja checksum bez prefiksów a2/f2/a3/f3');
  ok(chkBlock.includes("alg: 'v4'"), "sekcja checksum zawiera alg: 'v4'");
  ok(!/crc32str|CRC32_TABLE/.test(HTML),
     'crc32str/CRC32_TABLE usunięte z calego HTML (.arkdelta na XXH3-64 od v1.45.0)');
  ok(/function _deltaChecksums\(meta, ops\)/.test(HTML),
     '.arkdelta liczy checksums przez _deltaChecksums (XXH3-64 + stableStringify)');
  ok(/const ARKDELTA_FORMAT_VERSION = 2;/.test(HTML),
     'ARKDELTA_FORMAT_VERSION = 2 (stare wersje kalki glosno odrzucane)');
  const dd = HTML.match(/const _DIFF_DIR_ORDER = \[([^\]]*)\];/);
  ok(!!dd, 'znaleziono _DIFF_DIR_ORDER');
  if (dd) {
    const diffOrder = eval('[' + dd[1] + ']');
    ok(JSON.stringify(diffOrder) === JSON.stringify(api._V4_DIR_ORDER),
       '_V4_DIR_ORDER === _DIFF_DIR_ORDER (strażnik rozjazdu)');
  }
  ok(HTML.includes("const APP_VERSION = 'v1.49.6';"), 'pin: APP_VERSION v1.49.6');
}

// ═══ T7: pin NaN-kanoniczny — klasa błędu z Arc 19 (NaN-payload provenance) ═══
// Dowolny NaN / undefined / nie-liczba we polu f64 MUSI dac identyczne bajty
// kanoniczne (cichy NaN 7ff8000000000000) — bez wzgledu na provenance danych
// (DAT vs JSON.parse). Regresja tej rownowaznosci = powrot buga z Arc 19 f3b.
console.log('── T7: pin NaN-kanoniczny (NaN/undefined w CL → identyczne bajty) ──');
{
  const mk = v => ({ id: 900, x: 1, y: 2, z: 0, env: 1, weight: 1, name: 'nan-pin',
    custom_lines: { n: { points: [[3.25, v], [4, 5]], color: [255, 0, 0], style: 'dash', arrow: true } } });
  const encNaN  = api._encodeRoomCanonical(mk(NaN));
  const encUnd  = api._encodeRoomCanonical(mk(undefined));
  const hexNaN = Array.from(encNaN, b => b.toString(16).padStart(2, '0')).join('');
  const hexUnd = Array.from(encUnd, b => b.toString(16).padStart(2, '0')).join('');
  ok(hexNaN === hexUnd, 'CL z NaN i CL z undefined → bajtowo identyczne kodowanie');
  ok(hexNaN.includes('0000000000f87f'), 'kodowanie zawiera kanoniczny cichy NaN (7ff8000000000000 LE)');
  // hash rowniez stabilny: dwie mapy rozniace sie tylko NaN vs undefined → ta sama suma pokoju
  const mN = freshMap(); mN.areas[0].rooms.push(mk(NaN));
  const mU = freshMap(); mU.areas[0].rooms.push(mk(undefined));
  api.addChecksums(mN); api.addChecksums(mU);
  ok(mN.meta.checksums.rooms['900'] === mU.meta.checksums.rooms['900'],
     'suma pokoju odporna na provenance NaN (DAT vs JSON.parse)');
}

// ═══ T8: strażnik bufora — zagnieżdżony reset rzuca (bug-class _canonBuf) ═══
console.log('── T8: _CanonBuf — strażnik zagnieżdżenia reset/release ──');
{
  const B = api._canonBuf;
  B.reset();
  let threw = false;
  try { B.reset(); } catch (e) { threw = /zagniedzone/.test(e.message); }
  B.release();
  ok(threw, 'reset w trakcie kodowania → wyjątek (zamiast cichej korupcji bufora)');
  B.reset(); B.release();
  let ok2 = true;
  try { B.reset(); B.u8(1); } finally { B.release(); }
  ok(ok2, 'po release bufor znowu używalny');
}

console.log('checksums_v4: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
