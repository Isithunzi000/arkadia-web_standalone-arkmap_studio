// Harness A9 (krok 17) — readQPixMap parsuje chunki PNG zamiast skanować IEND
// Snapshot różnicowy: 507ce47367dd523948f66d507f162e61672c159a (stan sprzed fixa A9). Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const OLD = execSync('git show 507ce47367dd523948f66d507f162e61672c159a:arkmap_studio.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const TINY_PNG = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'tiny.png')));

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
for (const a of ['class ReadBuffer {', 'function readQPixMap(r) {', 'function writeQPixMap(w, bytes) {']) {
  if (NEW.indexOf(a) !== NEW.lastIndexOf(a)) throw new Error('kotwica nieunikalna: ' + a);
}
function build(html) {
  const code = [
    extract(html, 'class ReadBuffer {'),
    extract(html, 'class WriteBuffer {'),
    extract(html, 'function readQPixMap(r) {'),
    extract(html, 'function writeQPixMap(w, bytes) {'),
  ].join('\n');
  return new Function(code + '\n;return { ReadBuffer, WriteBuffer, readQPixMap, writeQPixMap };')();
}
const apiNew = build(NEW);
const apiOld = build(OLD);

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }
const eqBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function mkPixBuf(payload) {
  const b = new Uint8Array(4 + payload.length);
  new DataView(b.buffer).setUint32(0, 1, false);
  b.set(payload, 4);
  return b.buffer;
}
function chunk(typeStr, data) {
  const out = new Uint8Array(8 + data.length + 4);
  const d = new DataView(out.buffer);
  d.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = typeStr.charCodeAt(i);
  out.set(data, 8);
  d.setUint32(8 + data.length, 0xA5A5A5A5, false); // CRC dowolne — parser nie waliduje (jak Mudlet)
  return out;
}
const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
function concat(...arrs) {
  const t = arrs.reduce((s, a) => s + a.length, 0);
  const o = new Uint8Array(t); let off = 0;
  for (const a of arrs) { o.set(a, off); off += a.length; }
  return o;
}

console.log('── T1: prawdziwy PNG (2×2) — odczyt 1:1, pos za IEND+CRC, round-trip ──');
{
  const buf = mkPixBuf(TINY_PNG);
  const r = new apiNew.ReadBuffer(buf);
  const got = apiNew.readQPixMap(r);
  ok(eqBytes(got, TINY_PNG), 'odczytane bajty ≡ oryginalny PNG (' + got.length + ' B)');
  ok(r.pos === 4 + TINY_PNG.length, 'pos = koniec PNG (za IEND+CRC)');
  const w = new apiNew.WriteBuffer();
  apiNew.writeQPixMap(w, got);
  const bytes = w.toUint8Array();
  const r2 = new apiNew.ReadBuffer(bytes.buffer);
  ok(eqBytes(apiNew.readQPixMap(r2), TINY_PNG), 'round-trip write→read identyczny');
}

console.log('── T2: bajty "IEND" wewnątrz danych IDAT — NOWY odporny, STARY ucina ──');
{
  const ihdrData = new Uint8Array([0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]);
  const idatData = new Uint8Array([0x78, 0x9C, 0x49, 0x45, 0x4E, 0x44, 0x11, 0x22, 0x33]); // "IEND" w środku IDAT
  const png = concat(PNG_SIG, chunk('IHDR', ihdrData), chunk('IDAT', idatData), chunk('IEND', new Uint8Array(0)));
  const gotNew = apiNew.readQPixMap(new apiNew.ReadBuffer(mkPixBuf(png)));
  const gotOld = apiOld.readQPixMap(new apiOld.ReadBuffer(mkPixBuf(png)));
  ok(eqBytes(gotNew, png), 'NOWY: pełny PNG (' + gotNew.length + ' B) — false positive zignorowany');
  ok(gotOld.length < png.length, 'STARY: uciął w połowie IDAT (' + gotOld.length + ' z ' + png.length + ' B) — dawny bug potwierdzony');
}

console.log('── T3: dane po IEND — oba kończą na IEND+CRC, pos poprawny ──');
{
  const trailing = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
  const payload = concat(TINY_PNG, trailing);
  const r = new apiNew.ReadBuffer(mkPixBuf(payload));
  const got = apiNew.readQPixMap(r);
  ok(eqBytes(got, TINY_PNG), 'pixmapa ≡ PNG bez ogona');
  ok(r.pos === 4 + TINY_PNG.length, 'pos za IEND+CRC, ogon nietknięty');
}

console.log('── T4: nie-PNG → pusty wynik + rewind (nowy ≡ stary) ──');
{
  const junk = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99]);
  const rN = new apiNew.ReadBuffer(mkPixBuf(junk));
  const rO = new apiOld.ReadBuffer(mkPixBuf(junk));
  const gN = apiNew.readQPixMap(rN), gO = apiOld.readQPixMap(rO);
  ok(gN.length === 0 && gO.length === 0, 'oba zwracają puste');
  ok(rN.pos === 4 && rO.pos === 4, 'oba robią rewind do pozycji po nagłówku');
  const almost = concat(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x00]), TINY_PNG);
  const gN2 = apiNew.readQPixMap(new apiNew.ReadBuffer(mkPixBuf(almost)));
  ok(gN2.length === 0, 'NOWY: niepełna sygnatura (4/8) → odrzucenie');
}

console.log('── T5: PNG ucięty w środku chunku → NOWY kontrolowany błąd, STARY ciche śmieci ──');
{
  const cut = TINY_PNG.slice(0, TINY_PNG.length - 10);
  let eNew = null;
  try { apiNew.readQPixMap(new apiNew.ReadBuffer(mkPixBuf(cut))); } catch (e) { eNew = e; }
  ok(eNew && !(eNew instanceof RangeError) && /Uszkodzony lub obcięty/.test(eNew.message), 'NOWY: kontrolowany błąd formatu');
  let gOld = null;
  try { gOld = apiOld.readQPixMap(new apiOld.ReadBuffer(mkPixBuf(cut))); } catch (e) { /* może rzucić */ }
  ok(gOld !== null && gOld.length > cut.length - 10, 'STARY: pochłaniał strumień po cichu (zwrócił ' + (gOld ? gOld.length : 'rzucił') + ' B)');
}

console.log('── T6: liczniki kotwic ──');
{
  const cnt = (s, sub) => s.split(sub).length - 1;
  ok(cnt(NEW, 'audyt A9') === 1, 'komentarz audyt A9 ×1, jest: ' + cnt(NEW, 'audyt A9'));
  ok(cnt(NEW, 'Szukaj chunku IEND') === 0, 'stare skanowanie usunięte');
  ok(/const APP_VERSION = 'v1\.\d+\.\d+';/.test(NEW), 'APP_VERSION obecne');
  ok(cnt(OLD, 'Szukaj chunku IEND') === 1, 'snapshot 507ce47367dd523948f66d507f162e61672c159a miał stare skanowanie');
  ok(cnt(NEW, 'r._need(len + 4)') === 1, 'guard A7 użyty w pętli chunków');
}

console.log(`\n═══ WYNIK: ${pass} OK / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
