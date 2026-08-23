#!/usr/bin/env node
// xxh3_golden.js — weryfikacja implementacji XXH3-64 przeciw wektorom
// z tests/checksums/vectors_v4.json (oracle Python/xxhash, oracle_v4.py).
// Testuje OBIE kopie, jesli istnieja: dev (tests/checksums/xxh3.js) oraz blok
// markerowy ====XXH3-64==== wpisany w arkmap_studio.html (kod produkcyjny).
// Uruchamianie z katalogu glownego repo: node tests/checksums/xxh3_golden.js
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const vectors = JSON.parse(fs.readFileSync(path.join(HERE, 'vectors_v4.json'), 'utf8'));

let pass = 0, fail = 0;
function runSet(label, impl) {
  let p = 0, f = 0;
  for (const v of vectors.sanity) {
    const bytes = Uint8Array.from(Buffer.from(v.input_hex, 'hex'));
    const got = impl.xxh3_64hex(bytes);
    if (got === v.hash) { p++; } else { f++; console.error(`  FAIL [${label}] ${v.name}: got ${got}, want ${v.hash}`); }
  }
  const anchor = impl.xxh3_64hex(new Uint8Array(0));
  if (anchor === '2d06800538d394c2') { p++; } else { f++; console.error(`  FAIL [${label}] empty-string anchor: ${anchor}`); }
  console.log(`  ${label}: ${p} OK, ${f} FAIL`);
  pass += p; fail += f;
}

let tested = 0;
const devPath = path.join(HERE, 'xxh3.js');
if (fs.existsSync(devPath)) {
  runSet('dev xxh3.js', require(devPath));
  tested++;
}
const htmlPath = path.join(HERE, '..', '..', 'arkmap_studio.html');
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/\/\/ ====XXH3-64-BEGIN====([\s\S]*?)\/\/ ====XXH3-64-END====/);
  if (m) {
    runSet('arkmap_studio.html (blok ====XXH3-64====)',
           new Function(m[1] + '\nreturn { xxh3_64, xxh3_64hex };')());
    tested++;
  }
}
if (!tested) { console.error('FAIL: nie znaleziono zadnej implementacji XXH3-64'); process.exit(1); }
console.log(`xxh3_golden: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
