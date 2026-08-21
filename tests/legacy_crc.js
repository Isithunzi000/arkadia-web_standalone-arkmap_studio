// Harness — legacy_crc: wsteczna zgodnosc verifyChecksums z sumami v1 (pliki sprzed v1.38.0).
//
// Arc 16 (repro-first): produkcyjne lustro online map_master3.arkmap (sync 2026-08-19 07:36,
// tooling sprzed v1.38.0) nioslo sumy v1 — bez pola `alg` w meta.checksums. Verifier liczacy
// zawsze formułami v2 zglaszal taki plik jako „plik uszkodzony lub zmieniony recznie"
// (badAreas = WSZYSTKIE, badRooms = 0, fileOk = false — formuła pokoju nie zmienila sie miedzy
// v1 a v2, formuly obszaru i pliku tak). Repro na prawdziwym pliku: 60/60 obszarow.
//
// Formuly v1 zamrozone verbatim z 41671a7^ (referencja ponizej — NIE zmieniac):
//   _crcAreaV1(roomCrcs) = crc32str(roomCrcs.join(''))
//   _crcFileV1(areaCrcs) = crc32str(areaCrcs.join(''))
// v1 pisalo meta.checksums = { file, areas, rooms } — BEZ pola alg.
//
// Uruchamianie z katalogu glownego repo: node tests/legacy_crc.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Ekstrakcja funkcji z arkmap_studio.html (wzorzec harnessu ekstrakcyjnego) ──
function fn(name) {
  const re = new RegExp('function ' + name + '\\b[\\s\\S]*?\\n\\}', 'm');
  const m = HTML.match(re);
  if (!m) throw new Error('kotwica: function ' + name);
  return m[0];
}
const tableM = HTML.match(/const CRC32_TABLE = \(\(\) => \{[\s\S]*?\}\)\(\);/);
if (!tableM) throw new Error('kotwica: CRC32_TABLE');

// Referencyjne formuly v1 (zamrozone). Gdy aplikacja definiuje wlasne _crcAreaV1/_crcFileV1,
// ekstrahujemy JE (one sa testowane); przed fixem podstawiamy referencje, zeby repro bylo
// czystym FAIL-em asercji, a nie bledem ekstrakcji.
const REF_V1 = 'function _crcAreaV1(roomCrcs) { return crc32str(roomCrcs.join(\'\')); }\n' +
               'function _crcFileV1(areaCrcs) { return crc32str(areaCrcs.join(\'\')); }';
function fnOrRef(name) {
  const re = new RegExp('function ' + name + '\\b[\\s\\S]*?\\n\\}', 'm');
  const m = HTML.match(re);
  return m ? m[0] : REF_V1.split('\n').find(l => l.includes('function ' + name)) || '';
}

const SRC = tableM[0] + '\n' + [
  'crc32str', 'stableStringify', '_stripRoomDefaults', '_crcRoom',
  '_stripAreaForCrc', '_crcArea', '_crcFile', 'addChecksums', 'verifyChecksums'
].map(fn).join('\n') + '\n' + fnOrRef('_crcAreaV1') + '\n' + fnOrRef('_crcFileV1') + '\n';
eval(SRC);

// ── Syntetyczna mapa (deterministyczna) ──
function mkMap() {
  return {
    format: 'arkmap', version: 2,
    colors: { env_colors: { '5': [255, 0, 0] }, custom_env_colors: {} },
    areas: [
      { id: 1, name: 'Alfa', user_data: { region: 'north' }, labels: [
          { id: 1, x: 10, y: 20, z: 0, width: 30, height: 12, text: 'A', fg_color: [255,255,255], bg_color: [0,0,0], no_scaling: false, show_on_top: false, pixmap: null }],
        rooms: [
          { id: 101, x: 0, y: 0, z: 0, env: 1, exits: { n: 102 } },
          { id: 102, x: 0, y: 1, z: 0, env: 2, exits: { s: 101 }, weight: 1, stubs: [3] },
          { id: 103, x: 1, y: 1, z: 0, env: 2, exits: {} }] },
      { id: 2, name: 'Beta', rooms: [
          { id: 201, x: 5, y: 5, z: 0, env: 3, exits: { w: 202 } },
          { id: 202, x: 4, y: 5, z: 0, env: 3, exits: { e: 201 } }] }
    ],
    meta: { user_data: {} }
  };
}

// Pieczetowanie v1: pokoje wspolnym _crcRoom (formuła pokoju identyczna v1/v2),
// obszary i plik referencyjnymi formulami v1; meta.checksums BEZ alg (jak pliki sprzed v1.38.0).
function stampV1(map) {
  const rooms = {}, areas = {}, areaCrcs = [];
  for (const area of [...map.areas].sort((a, b) => a.id - b.id)) {
    const rcs = [];
    for (const room of [...area.rooms].sort((a, b) => a.id - b.id)) {
      const c = _crcRoom(room);
      rooms[String(room.id)] = c;
      rcs.push(c);
    }
    const ac = crc32str(rcs.join(''));           // _crcAreaV1 (frozen)
    areas[String(area.id)] = ac;
    areaCrcs.push(ac);
  }
  map.meta.checksums = { file: crc32str(areaCrcs.join('')), areas, rooms };  // _crcFileV1 (frozen), bez alg
  return map;
}

console.log('— L1: plik z sumami v1 (legacy, brak alg) —');
{
  const r = verifyChecksums(stampV1(mkMap()));
  ok(r.present === true, 'L1a: sumy obecne');
  ok(r.ok === true, 'L1b: poprawny plik v1 NIE jest falszywie odrzucany (repro Arc 16)');
  ok(r.legacy === true, 'L1c: wynik oznaczony legacy:true');
  ok(r.fileOk === true, 'L1d: fileOk dla v1 liczone formula v1');
  ok(r.badAreas.length === 0 && r.badRooms.length === 0 && r.missingRooms.length === 0,
     'L1e: zero falszywych badAreas/badRooms/missingRooms');
}

console.log('— L2: korupcja w pliku v1 NADAL wykrywana —');
{
  const m = stampV1(mkMap());
  m.areas[0].rooms[1].x = 999;                     // reczna zmiana pokoju po pieczetowaniu
  const r = verifyChecksums(m);
  ok(r.ok === false && r.badRooms.length === 1 && r.badRooms[0].roomId === 102,
     'L2a: zepsuty pokoj w pliku v1 → badRooms=1 (roomId 102)');
  ok(r.fileOk === false, 'L2b: rollup pliku v1 lapie korupcje pokoju');
}
{
  // v1 NIE krylo pol obszaru (name/labels/user_data) — CRC obszaru = tylko rollup CRC pokoi.
  // Zmiana nazwy obszaru jest w v1 niewykrywalna z definicji formatu (zamrozone, nie naprawialne
  // bez lamania wszystkich starych plikow) — dlatego legacy-OK mowi „przeliczy sie przy zapisie"
  // (zapis podnosi sumy do v2, ktore pola obszaru kryje).
  const m = stampV1(mkMap());
  m.areas[0].name = 'Alfa ZMIENIONA';
  const r = verifyChecksums(m);
  ok(r.ok === true, 'L2c: v1 — zmiana nazwy obszaru niewykrywalna (limit formatu, swiadomy)');
}
{
  const m = stampV1(mkMap());
  m.areas[0].rooms.pop();                          // usuniety pokoj 103 → rollup obszaru sie rozjezdza
  const r = verifyChecksums(m);
  ok(r.ok === false && r.badAreas.length === 1 && r.badAreas[0].id === 1,
     'L2c2: v1 — usuniety pokoj → badAreas=[1] (rollup obszaru wykrywa, dokladnie jeden)');
}
{
  const m = stampV1(mkMap());
  m.areas[1].rooms.push({ id: 203, x: 9, y: 9, z: 0, env: 3, exits: {} });  // dopisany pokoj bez sumy
  const r = verifyChecksums(m);
  ok(r.missingRooms.includes(203), 'L2d: v1 — pokoj bez wpisu w stored.rooms = missingRooms (T3/W3)');
}

console.log('— L3: sciezka v2 bez zmian —');
{
  const m = addChecksums(mkMap());
  ok(m.meta.checksums.alg === 'v2', 'L3a: addChecksums pisze alg:v2');
  const r = verifyChecksums(m);
  ok(r.ok === true && !r.legacy, 'L3b: poprawny plik v2 → ok, bez legacy');
  const c = addChecksums(mkMap());
  c.areas[1].rooms[0].env = 99;
  const r2 = verifyChecksums(c);
  ok(r2.ok === false && r2.badRooms.length === 1, 'L3c: korupcja v2 nadal wykrywana');
}

console.log('— L4: nieznany alg → neutralne pominiecie, nie straszenie —');
{
  const m = addChecksums(mkMap());
  m.meta.checksums.alg = 'v9';
  const r = verifyChecksums(m);
  ok(r.ok === true && r.unknownAlg === 'v9', 'L4a: alg v9 → ok:true + unknownAlg (pominiete)');
  ok(r.fileOk === true, 'L4b: alg v9 → fileOk:true (brak falszywej niezgodnosci)');
}

console.log('— L5: piny strukturalne —');
{
  ok(/stored\.alg/.test(HTML), 'L5a: verifyChecksums rozdziela po stored.alg');
  ok(/function _crcAreaV1/.test(HTML) && /function _crcFileV1/.test(HTML),
     'L5b: zamrozone formuly v1 obecne w aplikacji');
  ok(/legacy/.test(fn('verifyChecksums')), 'L5c: verifyChecksums zwraca flage legacy');
}

console.log('');
console.log('═══ legacy_crc: ' + pass + ' OK, ' + fail + ' FAIL ═══');
process.exit(fail ? 1 : 0);
