#!/usr/bin/env node
// xxh3_fuzz_equiv.js — fuzz rownowaznosci implementacji XXH3-64 z arkmap_studio.html
// (rdzen na parach u32, od Arc 37) przeciw zamrozonej referencji BigInt
// (tests/checksums/xxh3.js, port referencji xxHash v0.8.3).
// Deterministyczny PRNG (LCG) — brak losowosci miedzy przebiegami.
// Zdolnosc detekcji potwierdzona w trakcie rozwoju Arc 37: fuzz wykryl rozjazdy
// znakow int32 w sciezkach len>8 przed normalizacja >>> 0.
// Uruchamianie z katalogu glownego repo: node tests/checksums/xxh3_fuzz_equiv.js
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ref = require(path.join(HERE, 'xxh3.js'));
const html = fs.readFileSync(path.join(HERE, '..', '..', 'arkmap_studio.html'), 'utf8');
const m = html.match(/\/\/ ====XXH3-64-BEGIN====([\s\S]*?)\/\/ ====XXH3-64-END====/);
if (!m) { console.error('FAIL: brak bloku ====XXH3-64==== w arkmap_studio.html'); process.exit(1); }
const app = new Function(m[1] + '\nreturn { xxh3_64, xxh3_64hex };')();

let pass = 0, fail = 0;

// samotest detekcji: porownanie MUSI wykryc rozjazd po skopaniu bajtu
{
  const probe = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const a = ref.xxh3_64hex(probe);
  probe[4] ^= 0xFF;
  const b = app.xxh3_64hex(probe);
  if (a !== b) { pass++; } else { fail++; console.error('FAIL: samotest detekcji — porownanie slepe'); }
}

let seed = 0xC0FFEE;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF);
let nFuzz = 0;
function check(buf, tag) {
  const hRef = ref.xxh3_64hex(buf), hApp = app.xxh3_64hex(buf);
  const bRef = ref.xxh3_64(buf), bApp = app.xxh3_64(buf);
  nFuzz++;
  if (hRef === hApp && bRef === bApp) { pass++; return; }
  fail++;
  console.error('FAIL [' + tag + '] len=' + buf.length + ' ref=' + hRef + ' app=' + hApp);
}
// wszystkie sciezki dlugosci: 0, 1-3, 4-8, 9-16, 17-128 (pod-galeziami), 129-240, 241+ (bloki 1024)
for (let len = 0; len <= 300; len++) {
  for (let r = 0; r < 8; r++) {
    const b = new Uint8Array(len);
    for (let i = 0; i < len; i++) b[i] = rnd() & 0xFF;
    check(b, 'rnd');
  }
}
for (const len of [0, 1, 2, 3, 4, 8, 9, 16, 17, 32, 33, 64, 96, 128, 129, 136, 240, 241, 255,
                   1023, 1024, 1025, 2048, 4097, 65536]) {
  check(new Uint8Array(len), 'zero');
  check(new Uint8Array(len).fill(0xFF), 'ff');
  const s = new Uint8Array(len);
  for (let i = 0; i < len; i++) s[i] = i & 0xFF;
  check(s, 'seq');
}
{ const big = new Uint8Array(256 * 1024); for (let i = 0; i < big.length; i++) big[i] = rnd() & 0xFF; check(big, '256K'); }

console.log('xxh3_fuzz_equiv: ' + nFuzz + ' buforow + samotest — ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
