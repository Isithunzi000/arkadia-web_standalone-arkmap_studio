// Harness A7 (krok 16) — ReadBuffer bounds-checki, kontrolowany błąd zamiast RangeError
// Snapshot różnicowy: 50f37ea (stan sprzed fixa A7). Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const OLD = execSync('git show 50f37ea:arkmap_studio.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) {
  console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
  process.exit(2);
}
const DAT = fs.readFileSync(FIX);

function formatLayer(html) {
  const a = html.indexOf('// ── constants.js ──');
  const b = html.indexOf('// ── main ──');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice warstwy formatu');
  const c = html.indexOf('const ANSI_PAL = buildAnsiPal();');
  const d = html.indexOf('function buildColorCache');
  if (c < 0 || d < 0 || d <= c) throw new Error('kotwice DEPS');
  return html.slice(a, b) + '\n' + html.slice(c, d);
}
const apiNew = new Function(formatLayer(NEW) + '\n;return { ReadBuffer, readQString, readQColor, readMudletDat, datToArkmap };')();
const apiOld = new Function(formatLayer(OLD) + '\n;return { ReadBuffer, readQString, readMudletDat };')();

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// bufor testowy: int8(-5) | uint8(200) | uint16(0x1234) | int32(-123456) | uint32(4000000000) | double(3.14) | bytes 1,2,3
function mkBuf() {
  const b = new ArrayBuffer(1 + 1 + 2 + 4 + 4 + 8 + 3);
  const d = new DataView(b); let o = 0;
  d.setInt8(o, -5); o += 1;
  d.setUint8(o, 200); o += 1;
  d.setUint16(o, 0x1234, false); o += 2;
  d.setInt32(o, -123456, false); o += 4;
  d.setUint32(o, 4000000000, false); o += 4;
  d.setFloat64(o, 3.14, false); o += 8;
  new Uint8Array(b, o).set([1, 2, 3]);
  return b;
}

console.log('── T1: poprawne odczyty — nowy ≡ stary (różnicowo) ──');
{
  function readAll(RB) {
    const r = new RB(mkBuf());
    const out = [r.readInt8(), r.readUInt8(), r.readUInt16(), r.readInt32(), r.readUInt32(), r.readDouble(), [...r.readBytes(3)], r.remaining()];
    return JSON.stringify(out);
  }
  const n = readAll(apiNew.ReadBuffer), o = readAll(apiOld.ReadBuffer);
  ok(n === o, 'identyczne wartości i pozycje końcowe (nowy vs stary)');
  const parsed = JSON.parse(n);
  ok(parsed[0] === -5 && parsed[1] === 200 && parsed[2] === 0x1234 && parsed[3] === -123456 && parsed[4] === 4000000000 && Math.abs(parsed[5] - 3.14) < 1e-12 && parsed[7] === 0, 'wartości zgodne z zapisem');
}

console.log('── T2: obcięty bufor — każdy getter rzuca kontrolowany Error, pos nienaruszony ──');
{
  const cases = [
    ['readInt8', 1], ['readUInt8', 1], ['readUInt16', 2], ['readInt32', 4], ['readUInt32', 4], ['readDouble', 8],
  ];
  let allOk = true, posOk = true, msgOk = true, notRange = true;
  for (const [m, sz] of cases) {
    const r = new apiNew.ReadBuffer(new ArrayBuffer(sz - 1)); // o 1 bajt za mało
    try { r[m](); allOk = false; }
    catch (e) {
      if (e instanceof RangeError) notRange = false;
      if (!/Uszkodzony lub obcięty plik \.dat/.test(e.message)) msgOk = false;
      if (r.pos !== 0) posOk = false;
    }
  }
  const r2 = new apiNew.ReadBuffer(new ArrayBuffer(4));
  r2.readUInt32();
  try { r2.readBytes(1); allOk = false; } catch (e) {
    if (e instanceof RangeError) notRange = false;
    if (!/odczyt 1 B na pozycji 4, plik ma 4 B/.test(e.message)) msgOk = false;
    if (r2.pos !== 4) posOk = false;
  }
  const r3 = new apiNew.ReadBuffer(new ArrayBuffer(4));
  try { r3.readBytes(-1); allOk = false; } catch (e) { if (e instanceof RangeError) notRange = false; }
  ok(allOk, 'wszystkie gettery + readBytes rzucają przy przekroczeniu');
  ok(notRange, 'żaden błąd nie jest RangeError');
  ok(msgOk, 'komunikat kontrolowany z pozycją i rozmiarem pliku');
  ok(posOk, 'pos nienaruszony po rzuceniu (check-then-advance)');
  const r4 = new apiNew.ReadBuffer(new ArrayBuffer(0));
  ok(r4.readBytes(0).length === 0, 'readBytes(0) na pustym buforze działa');
}

console.log('── T3: readQString — spreparowany byteLen + null/empty zachowane ──');
{
  const huge = new ArrayBuffer(4); new DataView(huge).setUint32(0, 0x7FFFFFFF, false);
  let e1 = null;
  try { apiNew.readQString(new apiNew.ReadBuffer(huge)); } catch (e) { e1 = e; }
  ok(e1 && !(e1 instanceof RangeError) && /Uszkodzony lub obcięty/.test(e1.message), 'byteLen=2GB → kontrolowany błąd');
  const nul = new ArrayBuffer(4); new DataView(nul).setUint32(0, 0xFFFFFFFF, false);
  const emp = new ArrayBuffer(4); new DataView(emp).setUint32(0, 0, false);
  ok(apiNew.readQString(new apiNew.ReadBuffer(nul)) === '' && apiNew.readQString(new apiNew.ReadBuffer(emp)) === '', 'null i empty → "" (bez zmian)');
  const s = new ArrayBuffer(8); const dv = new DataView(s);
  dv.setUint32(0, 4, false); dv.setUint16(4, 65, false); dv.setUint16(6, 66, false);
  ok(apiNew.readQString(new apiNew.ReadBuffer(s)) === 'AB', 'poprawny QString dekodowany');
}

console.log('── T4: pełny parser na obciętym map_master3.dat — nigdy RangeError ──');
{
  const full = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
  const offsets = [64, 100, 1000, 5000, 20000, 100000, Math.floor(DAT.byteLength / 2), DAT.byteLength - 1];
  let rangeErrNew = 0, controlledNew = 0, silentNew = 0, rangeErrOld = 0, threwOld = 0;
  for (const off of offsets) {
    const trunc = full.slice(0, off);
    try { apiNew.readMudletDat(trunc); silentNew++; }
    catch (e) { if (e instanceof RangeError) rangeErrNew++; else if (/Uszkodzony lub obcięty/.test(e.message)) controlledNew++; }
    try { apiOld.readMudletDat(trunc); }
    catch (e) { threwOld++; if (e instanceof RangeError) rangeErrOld++; }
  }
  console.log(`  [info] NOWY: kontrolowane=${controlledNew} ciche=${silentNew} RangeError=${rangeErrNew} | STARY: rzucał=${threwOld}/${offsets.length} RangeError=${rangeErrOld}`);
  ok(rangeErrNew === 0, 'NOWY: zero RangeError na 8 obcięciach');
  ok(controlledNew >= 6, 'NOWY: >= 6 kontrolowanych błędów, jest: ' + controlledNew);
  ok(rangeErrOld >= 4, 'STARY: RangeError potwierdzone jako dawne zachowanie, jest: ' + rangeErrOld);
}

console.log('── T5: sanity — nieobcięty plik parsuje się poprawnie ──');
{
  const full = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
  const raw = apiNew.readMudletDat(full);
  const arkmap = apiNew.datToArkmap(full);
  const roomCount = Object.keys(raw.rooms || {}).length;
  console.log(`  [info] pokoi=${roomCount} obszarów=${(raw.areas && Object.keys(raw.areas).length)} hash=${Object.keys(raw.mRoomIdHash || {}).length}`);
  ok(roomCount > 10000, 'pokoi > 10000, jest: ' + roomCount);
  ok(Object.keys(raw.mRoomIdHash || {}).length > 0, 'mRoomIdHash parsowany');
  ok(arkmap && arkmap.format === 'arkmap', 'datToArkmap → format arkmap');
}

console.log('── T6: liczniki kotwic ──');
{
  const cnt = (s, sub) => s.split(sub).length - 1;
  console.log('  [info] _need(: ' + cnt(NEW, '_need(') + ', audyt A7: ' + cnt(NEW, 'audyt A7'));
  ok(cnt(NEW, '_need(') === 9, '_need: definicja + 7 wywołań + 1 w readQPixMap (krok 17), jest: ' + cnt(NEW, '_need('));
  ok(cnt(NEW, 'audyt A7') === 2, 'audyt A7 ×2 (ReadBuffer + wzmianka w readQPixMap z kroku 17)');
  ok(/const APP_VERSION = 'v1\.\d+\.\d+';/.test(NEW), 'APP_VERSION obecne');
  ok(cnt(OLD, '_need(') === 0, 'snapshot 50f37ea nie miał _need');
}

console.log(`\n═══ WYNIK: ${pass} OK / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
