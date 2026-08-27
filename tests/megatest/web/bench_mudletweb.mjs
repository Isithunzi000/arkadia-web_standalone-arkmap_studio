#!/usr/bin/env node
// bench_mudletweb.mjs — filar "mudlet-web" mega-testu (W1: parse .dat).
// Mierzony silnik to DOKLADNIE ten, ktorego uzywa mudlet-web:
// mudlet-map-binary-reader (importowany tam w src/map/MudixMapReader.ts).
// Zero stubow w mierzonej sciezce — readMapFromBuffer to produkcyjny parser.
//
// Uzycie:  node --expose-gc tests/megatest/web/bench_mudletweb.mjs <manifest.json> <out.json> [N]
// Wyjscie: <out.json> (mediana/p95/min/max + heap delta; dodatkowo przebieg
//          streamingowy streamRooms — osobny wynik, atut czytelnosci pitchu).
// Deterministyczne: pliki i kolejnosc z manifestu, staly WARM=3, GC miedzy
// przebiegami (--expose-gc, fail-loud gdy brak).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMapFromBuffer, streamRooms } from 'mudlet-map-binary-reader';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { indexFromReaderMap, runWorkloads } = require('../workloads_node.cjs');

// Wersja silnika: wprost z node_modules (exports pakietu nie eksportuje package.json).
const PKG_VERSION = JSON.parse(fs.readFileSync(
  new URL('./node_modules/mudlet-map-binary-reader/package.json', import.meta.url), 'utf8')).version;

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

// self-check: workloads_node.cjs musi byc kompletne (regresja po edycjach)
if (typeof indexFromReaderMap !== 'function' || typeof runWorkloads !== 'function')
  fail('workloads_node.cjs: brak eksportow indexFromReaderMap/runWorkloads');

const MAN = process.argv[2];
const OUT = process.argv[3];
const N = parseInt(process.argv[4] || '5', 10);
if (!MAN || !OUT) fail('uzycie: bench_mudletweb.mjs <manifest.json> <out.json> [N]');
if (typeof global.gc !== 'function') fail('uruchom z --expose-gc (GC miedzy przebiegami)');
const manifest = JSON.parse(fs.readFileSync(MAN, 'utf8'));

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: +s[0].toFixed(1), med: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}

function benchFile(file, item) {
  const raw = fs.readFileSync(file);
  const parse = [], stream = [];
  let heap = 0, rooms = 0, roomsStream = 0, lastMap = null;
  const WARM = 3;
  for (let i = 0; i < WARM + N; i++) {
    global.gc();
    const h0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const map = readMapFromBuffer(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    const t1 = performance.now();
    const n = Object.keys(map.rooms).length;
    if (!n) fail(path.basename(file) + ': parser zwrocil 0 pokoi');
    if (i >= WARM) { parse.push(t1 - t0); heap = process.memoryUsage().heapUsed - h0; rooms = n; lastMap = map; }
  }
  for (let i = 0; i < WARM + N; i++) {
    global.gc();
    const t0 = performance.now();
    let cnt = 0;
    streamRooms(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), () => { cnt++; });
    const t1 = performance.now();
    if (!cnt) fail(path.basename(file) + ': streamRooms zwrocil 0 pokoi');
    if (i >= WARM) { stream.push(t1 - t0); roomsStream = cnt; }
  }
  if (rooms !== roomsStream) fail(path.basename(file) + `: rozjazd pokoi: parse=${rooms} vs stream=${roomsStream}`);
  // W2/W3/W3b: ta sama implementacja Node co w benchu arkmap (workloads_node.cjs).
  const g0 = performance.now();
  const idx = indexFromReaderMap(lastMap);
  const graphBuild = performance.now() - g0;
  const wk = runWorkloads(idx, item.pairs, manifest.search_terms, N, global.gc);
  return {
    rooms,
    size_mb: +(fs.statSync(file).size / 1048576).toFixed(1),
    parse_ms: stats(parse),
    stream_ms: stats(stream),
    heap_delta_mb: +(heap / 1048576).toFixed(0),
    workloads: { graph_build_ms: +graphBuild.toFixed(1), ...wk },
  };
}

const results = {
  meta: {
    tool: 'bench_mudletweb.mjs',
    engine: 'mudlet-map-binary-reader',
    engine_version: PKG_VERSION,
    n_runs: N,
    warmup: 3,
    node: process.version,
    date: new Date().toISOString(),
    machine: os.cpus()[0].model.trim() + ' / ' + Math.round(os.totalmem() / 1073741824) + ' GB RAM',
  },
  files: {},
};

for (const item of manifest.ladder) {
  if (!fs.existsSync(item.dat)) fail('brak pliku z manifestu: ' + item.dat);
  console.log(`— ${item.name} (${item.dat}) —`);
  const r = benchFile(item.dat, item);
  if (r.rooms !== item.rooms) fail(`${item.name}: manifest.rooms=${item.rooms} vs parser=${r.rooms}`);
  results.files[item.name] = r;
  console.log(`  parse med=${r.parse_ms.med} ms (p95 ${r.parse_ms.p95}) | stream med=${r.stream_ms.med} ms | heap +${r.heap_delta_mb} MB | rooms ${r.rooms}`);
  console.log(`  W2 path med=${r.workloads.path_ms.med} ms (found ${r.workloads.path_found}/${item.pairs.length}) | W3 search med=${r.workloads.search_ms.med} ms (hits ${r.workloads.search_hits}) | W3b iter med=${r.workloads.iter_ms.med} ms`);
}

fs.writeFileSync(OUT, JSON.stringify(results, null, 1) + '\n');
console.log('✓ wyniki: ' + OUT);
