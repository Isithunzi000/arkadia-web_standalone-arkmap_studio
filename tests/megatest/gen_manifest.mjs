#!/usr/bin/env node
// gen_manifest.mjs — generator manifestu mega-testu (deterministyczny).
// Wejscie: tests/perf/out/base.arkmap + tests/perf/out/stress_{K}k.{arkmap,dat}
//          oraz map_master3.dat (fixture, repo root).
// Wyjscie: <results>/manifest.lua (dla workload.lua) + <results>/manifest.json
//          (dla bench_mudletweb.mjs i raportu).
// Determinizm: staly SEED, pary pokoi i frazy wyszukiwania pochodza w 100%
// z zawartosci plikow wejsciowych — te same pliki => identyczny manifest
// (poza polem "generated", ktore jest tylko informacyjne i nie trafia do .lua).
//
// Uzycie: node tests/megatest/gen_manifest.mjs <results_dir> [runs] [pairs]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PERF_OUT = path.join(ROOT, 'tests', 'perf', 'out');
const SEED = 20260827;

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

const RESULTS = process.argv[2];
if (!RESULTS) fail('uzycie: node tests/megatest/gen_manifest.mjs <results_dir> [runs] [pairs]');
const RUNS = parseInt(process.argv[3] || '5', 10);
const PAIRS = parseInt(process.argv[4] || '100', 10);
if (!(RUNS >= 1 && RUNS <= 50)) fail('runs poza zakresem 1..50: ' + RUNS);
if (!(PAIRS >= 10 && PAIRS <= 1000)) fail('pairs poza zakresem 10..1000: ' + PAIRS);
fs.mkdirSync(RESULTS, { recursive: true });

// mulberry32 — maly, w pelni deterministyczny PRNG (ten sam seed => ten sam ciag).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roomIdsAndNames(arkmapPath) {
  const m = JSON.parse(fs.readFileSync(arkmapPath, 'utf8'));
  const ids = [], names = [];
  for (const a of m.areas) {
    for (const r of a.rooms) {
      ids.push(r.id);
      if (typeof r.name === 'string' && r.name.trim().length >= 3) names.push(r.name.trim());
    }
  }
  return { ids, names };
}

// Pary (a,b): a != b, oba istnieja w TEJ mapie. Stress klony maja remapowane
// ID, wiec pary liczymy per plik z jego wlasnych ID (procedura identyczna,
// seed identyczny => deterministycznie per zawartosc).
function makePairs(ids, n, rng) {
  const pairs = [];
  const len = ids.length;
  if (len < 2) fail('mapa z <2 pokojami — nie da sie losowac par');
  const seen = new Set();
  let guard = 0;
  while (pairs.length < n && guard < n * 100) {
    guard++;
    const a = ids[Math.floor(rng() * len)];
    const b = ids[Math.floor(rng() * len)];
    if (a === b) continue;
    const key = a < b ? a + '|' + b : b + '|' + a;
    if (seen.has(key)) continue;   // bez duplikatow par (kolejnosc w parze bez znaczenia dla A*)
    seen.add(key);
    pairs.push([a, b]);
  }
  return pairs;
}

// Frazy wyszukiwania: 3 rozne nazwy pokoi z mapy bazowej (substring match,
// case-insensitive — semantyka searchRoom). Deterministyczny wybor seedem.
function makeSearchTerms(names, rng) {
  if (!names.length) fail('mapa bazowa bez nazw pokoi — brak fraz do searchRoom');
  const terms = [];
  const used = new Set();
  let guard = 0;
  while (terms.length < 3 && guard < 1000) {
    guard++;
    const t = names[Math.floor(rng() * names.length)];
    if (used.has(t)) continue;
    used.add(t);
    terms.push(t);
  }
  return terms;
}

// Drabinka: real_27k zawsze wymagany; stress_* opcjonalne (warn, nie fail).
const ladder = [];
const realDat = path.join(ROOT, 'map_master3.dat');
const realArk = path.join(PERF_OUT, 'base.arkmap');
if (!fs.existsSync(realDat)) fail('brak map_master3.dat — bash tests/fetch-fixture.sh');
if (!fs.existsSync(realArk)) fail('brak tests/perf/out/base.arkmap — bash tests/megatest/inputs.sh');
ladder.push({ name: 'real_27k', dat: realDat, arkmap: realArk });

for (const k of [2, 4, 8, 16, 32]) {
  const a = path.join(PERF_OUT, `stress_${k}k.arkmap`);
  const d = path.join(PERF_OUT, `stress_${k}k.dat`);
  if (fs.existsSync(a) && fs.existsSync(d)) {
    ladder.push({ name: `stress_${k}x`, dat: d, arkmap: a });
  } else if (fs.existsSync(a) && !fs.existsSync(d)) {
    console.warn(`! stress_${k}x: .arkmap jest, .dat brak — pomijam w mega-teście (znany limit generatora dla K=32)`);
  } else {
    console.warn(`! stress_${k}x: brak plikow — pomijam (bash tests/megatest/inputs.sh zeby dogenerowac)`);
  }
}
if (ladder.length < 2) console.warn('! drabinka tylko z real_27k — mega-test bedzie skromny; rozwaz inputs.sh');

// Pary per plik + frazy z mapy bazowej.
for (const item of ladder) {
  const { ids, names } = roomIdsAndNames(item.arkmap);
  item.rooms = ids.length;
  item.pairs = makePairs(ids, PAIRS, mulberry32(SEED));
  if (item.name === 'real_27k') {
    if (!names.length) fail('real_27k bez nazw pokoi');
    item._names = names;   // roboczo, do fraz; nie trafia do manifestu
  } else {
    delete item._names;
  }
}
const searchTerms = makeSearchTerms(ladder[0]._names, mulberry32(SEED ^ 0x5EED));
delete ladder[0]._names;

const manifest = {
  version: 1,
  seed: SEED,
  runs: RUNS,
  pairs_per_map: PAIRS,
  generated: new Date().toISOString(),
  ladder: ladder.map(({ name, dat, arkmap, rooms, pairs }) => ({ name, dat, arkmap, rooms, pairs })),
  search_terms: searchTerms,
};

// Serializacja Lua (manifest.lua czytany przez dofile w workload.lua).
function luaStr(s) {
  return '"' + String(s).replace(/[\\"\n\r]/g, c => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r' }[c])) + '"';
}
const L = [];
L.push('-- Wygenerowane przez tests/megatest/gen_manifest.mjs — NIE EDYTOWAC RECZNIE.');
L.push('-- Regeneracja: node tests/megatest/gen_manifest.mjs <results_dir>');
L.push('return {');
L.push(`  version = ${manifest.version},`);
L.push(`  seed = ${manifest.seed},`);
L.push(`  runs = ${manifest.runs},`);
L.push('  ladder = {');
for (const it of manifest.ladder) {
  L.push(`    { name = ${luaStr(it.name)}, dat = ${luaStr(it.dat)}, rooms = ${it.rooms}, pairs = {`);
  const pairChunks = [];
  for (let i = 0; i < it.pairs.length; i += 10) {
    pairChunks.push('      ' + it.pairs.slice(i, i + 10).map(p => `{${p[0]},${p[1]}}`).join(',') + ',');
  }
  L.push(pairChunks.join('\n'));
  L.push('    } },');
}
L.push('  },');
L.push('  search_terms = {');
for (const t of manifest.search_terms) L.push(`    ${luaStr(t)},`);
L.push('  },');
L.push('}');
fs.writeFileSync(path.join(RESULTS, 'manifest.lua'), L.join('\n') + '\n');
fs.writeFileSync(path.join(RESULTS, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

console.log(`✓ manifest: ${ladder.length} plikow, ${PAIRS} par/mapę, ${RUNS} przebiegow, frazy: ${searchTerms.map(t => JSON.stringify(t)).join(', ')}`);
console.log('  ' + path.join(RESULTS, 'manifest.lua'));
console.log('  ' + path.join(RESULTS, 'manifest.json'));
