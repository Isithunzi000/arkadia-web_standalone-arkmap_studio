#!/usr/bin/env node
// diag_graph_diff.mjs — diagnostyka rozjazdu grafu .dat vs .arkmap.
// Laduje oba pliki, buduje indeksy (workloads_node.cjs), porownuje krawedzie
// pokoj po pokoju i wskazuje, ktore pary z manifestu daja inny wynik A*.
// Read-only, lekki na RAM poza samym wczytaniem mapy.
//
// Uzycie (z katalogu repo, po npm ci w tests/megatest/web):
//   node tests/megatest/diag_graph_diff.mjs <plik.dat> <plik.arkmap> <manifest.json> <nazwa_drabinki>
// np.: node tests/megatest/diag_graph_diff.mjs tests/perf/out/stress_4k.dat tests/perf/out/stress_4k.arkmap tests/megatest/results/2026-08-27/manifest.json stress_4x
import fs from 'node:fs';
import { createRequire } from 'node:module';

const requireWeb = createRequire(new URL('./web/package.json', import.meta.url));
// reader jest ESM-only (brak exports dla require) — import wprost z dist
const { readMapFromBuffer } = await import('./web/node_modules/mudlet-map-binary-reader/dist/index.js');
const { indexFromReaderMap, indexFromArkmap, astar } = requireWeb('../workloads_node.cjs');
if (typeof astar !== 'function') { console.error('workloads_node.cjs nie eksportuje astar'); process.exit(1); }

const [DAT, ARKMAP, MAN, NAME] = process.argv.slice(2);
if (!DAT || !ARKMAP || !MAN || !NAME) {
  console.error('uzycie: diag_graph_diff.mjs <plik.dat> <plik.arkmap> <manifest.json> <nazwa_drabinki>');
  process.exit(2);
}

const raw = fs.readFileSync(DAT);
const datMap = readMapFromBuffer(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
const arkMap = JSON.parse(fs.readFileSync(ARKMAP, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const item = manifest.ladder.find(l => l.name === NAME);
if (!item) { console.error('manifest nie ma pozycji: ' + NAME); process.exit(1); }

const idxDat = indexFromReaderMap(datMap);
const idxArk = indexFromArkmap(arkMap);
console.log(`pokoje: .dat=${idxDat.ids.length} .arkmap=${idxArk.ids.length}`);

// --- diff krawedzi pokoj po pokoju ---
const onlyDat = idxDat.ids.filter(id => !idxArk.byId.has(id));
const onlyArk = idxArk.ids.filter(id => !idxDat.byId.has(id));
console.log(`pokoje tylko w .dat: ${onlyDat.length}, tylko w .arkmap: ${onlyArk.length}`);
if (onlyDat.length) console.log('  przyklady .dat-only:', onlyDat.slice(0, 10).join(', '));
if (onlyArk.length) console.log('  przyklady .arkmap-only:', onlyArk.slice(0, 10).join(', '));

const diffs = [];
for (const id of idxDat.ids) {
  const a = idxDat.byId.get(id), b = idxArk.byId.get(id);
  if (!b) continue;
  const sa = new Set(a.exits), sb = new Set(b.exits);
  const missingInDat = [...sb].filter(t => !sa.has(t));   // .arkmap ma, .dat nie ma
  const extraInDat = [...sa].filter(t => !sb.has(t));     // .dat ma, .arkmap nie ma
  if (missingInDat.length || extraInDat.length || a.locked !== b.locked) {
    diffs.push({ id, missingInDat, extraInDat, lockedDat: a.locked, lockedArk: b.locked,
      exitsDatN: a.exits.length, exitsArkN: b.exits.length });
  }
}
console.log(`pokoje z roznica grafu: ${diffs.length}`);
for (const d of diffs.slice(0, 30)) {
  console.log(`  pokoj ${d.id}: brakuje w .dat -> [${d.missingInDat.join(', ')}] | nadmiar w .dat -> [${d.extraInDat.join(', ')}] | locked dat/ark=${d.lockedDat}/${d.lockedArk} | krawedzi dat/ark=${d.exitsDatN}/${d.exitsArkN}`);
}

// --- ktore pary z manifestu daja inny wynik ---
let div = 0, bothFound = 0;
for (const [from, to] of item.pairs) {
  const fd = astar(idxDat, from, to), fa = astar(idxArk, from, to);
  if (fd && fa) bothFound++;
  if (fd !== fa) {
    div++;
    console.log(`  para (${from} -> ${to}): .dat=${fd ? 'ZNALEZIONA' : 'brak'} .arkmap=${fa ? 'ZNALEZIONA' : 'brak'}`);
  }
}
console.log(`pary: ${item.pairs.length} | zgodne znalezione: ${bothFound} | rozbiezne: ${div}`);
