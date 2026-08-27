#!/usr/bin/env node
// bench_parse.js — mikro-benchmark Node: parse .dat vs .arkmap (Arc 18).
// Fazy dokladnie jak w apce (niesymetria celowa — .dat nie ma checksumow):
//   .dat    : datToArkmap(buf) + validate(map)                 [loadDat]
//   .arkmap : JSON.parse(text) + validate(map) + verifyChecksums(map)  [loadArkmap]
//
// Uzycie:  node --expose-gc tests/perf/bench_parse.js <out_dir> [N] [manifest.json]
// Wyjscie: <out_dir>/results_node.json
// Opcjonalny manifest (mega-test): doklada W2/W3/W3b (pathfinding/search/
// iteracja — ta sama implementacja Node co bench mudlet-web, workloads_node.cjs)
// liczone na danych z .arkmap. Bez manifestu zachowanie jak dotychczas.
// Metodologia: warm-up 3 (odrzucane), N przebiegow (domyslnie 20), GC miedzy
// przebiegami (--expose-gc), raport: mediana/p95/min/max + heap delta.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) fail(`kotwica ekstrakcji nie znaleziona: ${JSON.stringify(a)}`);
  return HTML.slice(i, j);
}

// Przepis ekstrakcji jak tools/dat2arkmap.mjs + DEPS + stableStringify (serializacja zapisu).
const code =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── validate.js ──', '// ── checksum.js ──') + '\n' +
  block('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  block('// ── mudlet_dat.js ──', '// ── dat-to-arkmap.js ──') + '\n' +
  block('// ── dat-to-arkmap.js ──', '// ── arkmap-to-dat.js ──') + '\n' +
  block('const ANSI_PAL = buildAnsiPal();', 'function buildColorCache') + '\n' +
  block('function stableStringify(val, indent, _lvl) {', 'function saveArkmapAs()') + '\n' +
  'return { datToArkmap, validate, verifyChecksums };';

let api;
try { api = new Function(code)(); }
catch (e) { fail('ekstrakcja/kompilacja bloków: ' + e.message); }
const { datToArkmap, validate, verifyChecksums } = api;

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: +s[0].toFixed(1), med: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}

const OUT_DIR = process.argv[2] || path.join(__dirname, 'out');
const N = parseInt(process.argv[3] || '20', 10);
const WARM = 3;
if (typeof global.gc !== 'function') fail('uruchom z --expose-gc (GC miedzy przebiegami)');
const MANIFEST = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null;
const { indexFromArkmap, runWorkloads } = require('../megatest/workloads_node.cjs');

function benchDat(file) {
  const raw = fs.readFileSync(file);
  const t = { parse: [], validate: [], total: [] };
  for (let i = 0; i < WARM + N; i++) {
    global.gc();
    const h0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const map = datToArkmap(buf);
    const t1 = performance.now();
    const v = validate(map);
    const t2 = performance.now();
    const heap = process.memoryUsage().heapUsed - h0;
    if (!v.ok) fail(`${path.basename(file)}: validate !ok (${(v.errors[0] || {}).message})`);
    if (i >= WARM) {
      t.parse.push(t1 - t0); t.validate.push(t2 - t1); t.total.push(t2 - t0);
      t.heap = heap;
    }
  }
  return { parse: stats(t.parse), validate: stats(t.validate), total: stats(t.total), heap_delta_mb: +(t.heap / 1048576).toFixed(0) };
}

function benchArkmap(file, manItem) {
  const text = fs.readFileSync(file, 'utf8');
  const t = { json: [], validate: [], crc: [], total: [] };
  let crcOk = null, lastMap = null;
  for (let i = 0; i < WARM + N; i++) {
    global.gc();
    const h0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const map = JSON.parse(text);
    const t1 = performance.now();
    const v = validate(map);
    const t2 = performance.now();
    const c = verifyChecksums(map);
    const t3 = performance.now();
    const heap = process.memoryUsage().heapUsed - h0;
    if (!v.ok) fail(`${path.basename(file)}: validate !ok (${(v.errors[0] || {}).message})`);
    if (i === WARM) crcOk = c.ok;   // asercja: pliki generatora maja zgodne sumy
    if (i >= WARM) {
      t.json.push(t1 - t0); t.validate.push(t2 - t1); t.crc.push(t3 - t2); t.total.push(t3 - t0);
      t.heap = heap; lastMap = map;
    }
  }
  const out = { json: stats(t.json), validate: stats(t.validate), crc: stats(t.crc), total: stats(t.total), heap_delta_mb: +(t.heap / 1048576).toFixed(0), checksums_ok: crcOk };
  if (manItem && MANIFEST) {
    const g0 = performance.now();
    const idx = indexFromArkmap(lastMap);
    const graphBuild = performance.now() - g0;
    const wk = runWorkloads(idx, manItem.pairs, MANIFEST.search_terms, N, global.gc);
    out.workloads = { graph_build_ms: +graphBuild.toFixed(1), ...wk };
  }
  return out;
}

function roomsOf(file) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  return m.areas.reduce((s, a) => s + a.rooms.length, 0);
}

const sets = [];
const datFixture = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(datFixture)) fail('brak map_master3.dat — bash tests/fetch-fixture.sh');
sets.push({ name: 'real_27k', dat: datFixture, arkmap: path.join(OUT_DIR, 'base.arkmap') });
for (const k of [2, 4, 8, 16, 32]) {
  const a = path.join(OUT_DIR, `stress_${k}k.arkmap`), d = path.join(OUT_DIR, `stress_${k}k.dat`);
  if (fs.existsSync(a) && fs.existsSync(d)) sets.push({ name: `stress_${k}x`, dat: d, arkmap: a });
}

const os = require('os');
const results = { meta: { tool: 'bench_parse.js', n_runs: N, warmup: WARM, node: process.version, date: new Date().toISOString(), machine: os.cpus()[0].model.trim() + ' / ' + Math.round(os.totalmem() / 1073741824) + ' GB RAM' }, sets: {} };
for (const s of sets) {
  console.log(`— ${s.name} —`);
  const r = {
    rooms: roomsOf(s.arkmap),
    size_mb: { dat: +(fs.statSync(s.dat).size / 1048576).toFixed(1), arkmap: +(fs.statSync(s.arkmap).size / 1048576).toFixed(1) },
    dat: benchDat(s.dat),
    arkmap: benchArkmap(s.arkmap),
  };
  r.ratio_total = +(r.arkmap.total.med / r.dat.total.med).toFixed(2);
  results.sets[s.name] = r;
  console.log(`  .dat    total med=${r.dat.total.med} ms (parse ${r.dat.parse.med} + val ${r.dat.validate.med})`);
  console.log(`  .arkmap total med=${r.arkmap.total.med} ms (json ${r.arkmap.json.med} + val ${r.arkmap.validate.med} + crc ${r.arkmap.crc.med})  ratio=${r.ratio_total}x  crc_ok=${r.arkmap.checksums_ok}`);
}

fs.writeFileSync(path.join(OUT_DIR, 'results_node.json'), JSON.stringify(results, null, 2));
console.log('✓ wyniki: ' + path.join(OUT_DIR, 'results_node.json'));
