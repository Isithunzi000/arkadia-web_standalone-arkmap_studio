// Harness — negatywne wejscia .dat / pixmapa (Arc 11 WS1).
// Kontrakt parsera: kazde uszkodzone/obciete wejscie konczy sie KONTROLOWANYM
// bledem (Error z komunikatem formatu) albo poprawnym sparsem — NIGDY surowym
// RangeError z DataView, NIGDY zawiecha. Uruchamianie z katalogu glownego repo.
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

// Ekstrakcja warstwy formatu (wzorzec a7): constants.js -> main + DEPS.
function formatLayer(html) {
  const a = html.indexOf('// ── constants.js ──');
  const b = html.indexOf('// ── main ──');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice warstwy formatu');
  const c = html.indexOf('const ANSI_PAL = buildAnsiPal();');
  const d = html.indexOf('function buildColorCache');
  if (c < 0 || d < 0 || d <= c) throw new Error('kotwice DEPS');
  return html.slice(a, b) + '\n' + html.slice(c, d);
}
const api = new Function(formatLayer(HTML)
  + '\n;return { ReadBuffer, WriteBuffer, readQString, readQPixMap, readMudletDat, datToArkmap,'
  + ' MUDLET_DAT_MIN_VERSION, MUDLET_DAT_MAX_SUPPORTED_VERSION };')();
const { ReadBuffer, WriteBuffer, readQString, readQPixMap, readMudletDat, datToArkmap } = api;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// Kontrolowana rodzina komunikatow parsera. RangeError / surowe bledy DataView = FAIL.
const CONTROLLED = /Uszkodzony lub obcięty plik \.dat|Nieobsługiwany format|obsługuje do wersji|zbyt stary/;
const RAW = /RangeError|offset is out of|out of bounds|Invalid array length|Invalid string length/i;

function expectThrow(fn, name) {
  try { fn(); }
  catch (e) {
    const msg = String(e && e.message || e);
    ok(CONTROLLED.test(msg) && !RAW.test(msg) && !(e instanceof RangeError),
      name + ' [msg=' + msg.slice(0, 90) + ']');
    return;
  }
  ok(false, name + ' [BRAK WYJATKU — sparsowano bez bledu]');
}
function expectOk(fn, name) {
  try { return { val: fn() }; }
  catch (e) { ok(false, name + ' [nieoczekiwany wyjatek: ' + String(e && e.message || e).slice(0, 90) + ']'); return {}; }
}
function ab(u8) { return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); }

console.log('— T1: spreparowane naglowki —');
expectThrow(() => datToArkmap(new ArrayBuffer(0)), 'pusty bufor (0 B)');
expectThrow(() => datToArkmap(new ArrayBuffer(2)), 'uciety naglowek (2 B)');
{
  const w = new WriteBuffer(); w.writeInt32(20);
  expectThrow(() => datToArkmap(ab(w.toUint8Array())), 'sama wersja, brak ciala (4 B)');
}
{
  const w = new WriteBuffer(); w.writeInt32(api.MUDLET_DAT_MAX_SUPPORTED_VERSION + 1);
  expectThrow(() => datToArkmap(ab(w.toUint8Array())), 'wersja za nowa (MAX+1)');
}
{
  const w = new WriteBuffer(); w.writeInt32(api.MUDLET_DAT_MIN_VERSION - 1);
  expectThrow(() => datToArkmap(ab(w.toUint8Array())), 'wersja za stara (MIN-1)');
}
{
  const w = new WriteBuffer(); w.writeInt32(-7);
  expectThrow(() => datToArkmap(ab(w.toUint8Array())), 'wersja ujemna');
}

console.log('— T2: obciecia fixture (deterministyczne offsety) —');
{
  const LEN = DAT.length;
  const offsets = [1, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987,
    1024, 4096, LEN >>> 2, LEN >>> 1, (3 * LEN) >>> 2, LEN - 100, LEN - 1];
  let threw = 0, parsed = 0;
  for (const off of offsets) {
    const cut = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + off);
    try {
      datToArkmap(cut);
      parsed++;
      ok(false, 'obciecie @' + off + ' sparsowane bez bledu (nieoczekiwane)');
    } catch (e) {
      const msg = String(e && e.message || e);
      threw++;
      ok(CONTROLLED.test(msg) && !RAW.test(msg) && !(e instanceof RangeError),
        'obciecie @' + off + ' [msg=' + msg.slice(0, 70) + ']');
    }
  }
  ok(threw === offsets.length && parsed === 0, 'wszystkie obciecia rzucaja kontrolowanie (' + threw + '/' + offsets.length + ')');
}

console.log('— T3: readQString — granice i sentinele —');
{
  const w = new WriteBuffer(); w.writeUInt32(0x7FFFFFFF);
  expectThrow(() => readQString(new ReadBuffer(ab(w.toUint8Array()))), 'byteLen 0x7FFFFFFF');
}
{
  const w = new WriteBuffer(); w.writeUInt32(0xFFFFFFFE);  // NIE sentinel (sentinelem jest FFFFFFFF)
  expectThrow(() => readQString(new ReadBuffer(ab(w.toUint8Array()))), 'byteLen 0xFFFFFFFE (nie-sentinel)');
}
{
  const w = new WriteBuffer(); w.writeUInt32(6); w.writeBytes(new Uint8Array([0, 65, 0]));  // 6 B zadeklarowane, 3 B dane
  expectThrow(() => readQString(new ReadBuffer(ab(w.toUint8Array()))), 'byteLen 6, dane 3 B');
}
{
  const w = new WriteBuffer(); w.writeUInt32(0);
  const r = expectOk(() => readQString(new ReadBuffer(ab(w.toUint8Array()))), 'byteLen 0 (kontrola)');
  if (r.val !== undefined) ok(r.val === '', 'byteLen 0 -> pusty string');
}
{
  const w = new WriteBuffer(); w.writeUInt32(0xFFFFFFFF);
  const r = expectOk(() => readQString(new ReadBuffer(ab(w.toUint8Array()))), 'sentinel FFFFFFFF (kontrola)');
  if (r.val !== undefined) ok(r.val === '', 'sentinel FFFFFFFF -> pusty string');
}

console.log('— T4: readQPixMap — uszkodzone chunki i granice —');
const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
{
  const w = new WriteBuffer(); w.writeUInt32(1); w.writeBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  const r = new ReadBuffer(ab(w.toUint8Array()));
  const out = expectOk(() => readQPixMap(r), 'nie-PNG po naglowku');
  if (out.val) ok(out.val.length === 0 && r.pos === 4, 'nie-PNG -> pusty + rollback pozycji do startPos');
}
{
  const w = new WriteBuffer(); w.writeUInt32(1); w.writeBytes(new Uint8Array([1, 2, 3]));
  const r = new ReadBuffer(ab(w.toUint8Array()));
  const out = expectOk(() => readQPixMap(r), 'remaining < 8 po naglowku');
  if (out.val) ok(out.val.length === 0, 'remaining < 8 -> pusty (bez odczytu sig)');
}
{
  const w = new WriteBuffer(); w.writeUInt32(1); w.writeBytes(new Uint8Array(PNG_SIG));
  w.writeUInt32(0x7FFFFFFF);  // chunk len absurdalny
  expectThrow(() => readQPixMap(new ReadBuffer(ab(w.toUint8Array()))), 'PNG sig + chunk len 0x7FFFFFFF');
}
{
  const w = new WriteBuffer(); w.writeUInt32(1); w.writeBytes(new Uint8Array(PNG_SIG));
  w.writeUInt32(16); w.writeBytes(new Uint8Array([0x49, 0x44, 0x41, 0x54, 1, 2]));  // IDAT, dane uciete
  expectThrow(() => readQPixMap(new ReadBuffer(ab(w.toUint8Array()))), 'PNG sig + uciety chunk IDAT');
}
{
  // poprawny PNG (tiny) + 4 dodatkowe bajty za IEND — parser musi skonczyc na IEND
  const tiny = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'tiny.png')));
  const w = new WriteBuffer(); w.writeUInt32(1); w.writeBytes(tiny); w.writeUInt32(0xDEADBEEF);
  const r = new ReadBuffer(ab(w.toUint8Array()));
  const out = expectOk(() => readQPixMap(r), 'tiny.png + trailing 4 B');
  if (out.val) {
    ok(out.val.length === tiny.length && out.val.every((b, i) => b === tiny[i]),
      'zwrocono dokladnie bajty PNG (bez trailing)');
    ok(r.readUInt32() === 0xDEADBEEF, 'pozycja strumienia za IEND (kolejny odczyt nienaruszony)');
  }
}

console.log('— T5: readMudletDat — uszkodzone struktury —');
{
  const w = new WriteBuffer(); w.writeInt32(20); w.writeUInt32(0x40000000);  // envColors count absurdalny
  expectThrow(() => readMudletDat(ab(w.toUint8Array())), 'envColors count 0x40000000 + EOF');
}
{
  // poprawny przednio strumienia (puste mapy), potem areaCount=2 bez ciala
  const w = new WriteBuffer();
  w.writeInt32(20);
  w.writeUInt32(0); w.writeUInt32(0); w.writeUInt32(0); w.writeUInt32(0); w.writeUInt32(0);  // 5 pustych QMap
  w.writeUInt32(0xFFFFFFFF);  // QFont: family null
  for (let i = 0; i < 12; i++) w.writeInt32(0);  // reszta fontu + fudge + flaga + areaCount... ucinamy w srodku
  expectThrow(() => readMudletDat(ab(w.toUint8Array())), 'puste mapy + uciete przed obszarami');
}
{
  const w = new WriteBuffer(); w.writeInt32(20); w.writeInt32(-1);  // ujemny count pierwszej mapy
  try {
    readMudletDat(ab(w.toUint8Array()));
    ok(true, 'envColors count -1: petla pominieta, dalszy parse kontrolowany (brak egzorcyzmow)');
  } catch (e) {
    const msg = String(e && e.message || e);
    ok(CONTROLLED.test(msg) && !(e instanceof RangeError), 'envColors count -1 -> kontrolowany blad [msg=' + msg.slice(0, 70) + ']');
  }
}

console.log('\nmalformed_dat: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
