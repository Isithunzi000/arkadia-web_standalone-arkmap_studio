#!/usr/bin/env node
// gen_stress.mjs — generator syntetycznych map stresowych (Arc 18).
// Klony produkcyjnej bazy .arkmap z offsetami wspolrzednych, remap ID,
// checksumy v2, serializacja bajtowo jak zapis edytora (funkcje ekstrahowane
// verbatim z arkmap_studio.html). Klony = rozlaczne wyspy (swiadome
// uproszczenie — koszt renderu skaluje sie liniowo z pokojami).
//
// Uzycie: node tests/perf/gen_stress.mjs <baza.arkmap> <kat_wyj> [K,K,...]
// Domyslna drabinka K: 2,4,8,16,32 (x26988 pokoi = 54k ... 864k).
// .dat best-effort: przy braku RAM pomijany (zmierzy go driver w przegladarce).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) fail(`kotwica ekstrakcji nie znaleziona: ${JSON.stringify(a)}`);
  return HTML.slice(i, j);
}

const code =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── validate.js ──', '// ── checksum.js ──') + '\n' +
  block('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  block('// ── mudlet_dat.js ──', '// ── dat-to-arkmap.js ──') + '\n' +
  block('// ── dat-to-arkmap.js ──', '// ── arkmap-to-dat.js ──') + '\n' +
  block('// ── arkmap-to-dat.js ──', '// ── main ──') + '\n' +
  // DEPS z warstwy main: buildAnsiPal + ANSI_PAL + ansiPaletteRgb (wola go arkmapToDat).
  block('const ANSI_PAL = buildAnsiPal();', 'function buildColorCache') + '\n' +
  block('function stableStringify(val, indent, _lvl) {', 'function saveArkmapAs()') + '\n' +
  block('function _prepareArkmapForSave() {', 'function _arkmapSuggestedName() {') + '\n' +
  'return { validate, arkmapToDat, _prepareArkmapForSave, _serializeMap };';

const state = { map: null };
let api;
try { api = new Function('state', code)(state); }
catch (e) { fail('ekstrakcja/kompilacja bloków: ' + e.message); }

const [basePath, outDir, kArg] = process.argv.slice(2);
if (!basePath || !outDir) {
  console.error('użycie: node tests/perf/gen_stress.mjs <baza.arkmap> <kat_wyj> [K,K,...]');
  process.exit(2);
}
const KS = (kArg ? kArg.split(',') : ['2', '4', '8', '16', '32']).map(Number);
if (KS.some(k => !Number.isInteger(k) || k < 1)) fail('K musi być dodatnią liczbą całkowitą');

const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
if (!Array.isArray(base.areas)) fail('baza: brak areas');
let baseRooms = 0;
for (const a of base.areas) baseRooms += a.rooms.length;

// Bloki remapujace — ze stalym zapasem ponad realne zakresy (baza: room id 1..27209).
const ROOM_BLOCK = 10_000_000;
const AREA_BLOCK = 1_000;   // area id' = k*AREA_BLOCK + indeks pozycyjny (id moga byc ujemne!)

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const a of base.areas) for (const r of a.rooms) {
  if (r.x < minX) minX = r.x; if (r.x > maxX) maxX = r.x;
  if (r.y < minY) minY = r.y; if (r.y > maxY) maxY = r.y;
}
const W = maxX - minX + 10, H = maxY - minY + 10;   // +10 marginesu miedzy klonami

function buildCloned(K) {
  const cols = Math.ceil(Math.sqrt(K));
  const areas = [];
  for (let k = 0; k < K; k++) {
    for (let idx = 0; idx < base.areas.length; idx++) {
      const a = base.areas[idx];
      const ac = JSON.parse(JSON.stringify({ ...a, rooms: undefined }));
      ac.id = k === 0 ? a.id : k * AREA_BLOCK + idx;
      const offX = (k % cols) * W, offY = Math.floor(k / cols) * H;
      ac.rooms = a.rooms.map(r => {
        const c = { ...r, id: r.id + k * ROOM_BLOCK, x: r.x + offX, y: r.y + offY };
        if (r.exits) {
          const ex = {};
          for (const [dir, tgt] of Object.entries(r.exits)) ex[dir] = tgt + k * ROOM_BLOCK;
          c.exits = ex;
        }
        return c;
      });
      areas.push(ac);
    }
  }
  const meta = JSON.parse(JSON.stringify(base.meta));
  delete meta.checksums;               // przeliczone nizej przez _prepareArkmapForSave
  return { ...JSON.parse(JSON.stringify({ ...base, areas: undefined, meta: undefined })), meta, areas };
}

fs.mkdirSync(outDir, { recursive: true });
console.log(`baza: ${baseRooms} pokoi, ${base.areas.length} obszarów; drabinka K: ${KS.join(', ')}`);

for (const K of KS) {
  let map;
  try { map = buildCloned(K); }
  catch (e) { console.log(`⚠ K=${K}: budowa klonów przerwana (${e.message}) — stop drabinki`); break; }
  const rooms = K * baseRooms, areasN = K * base.areas.length;

  const seen = new Set();
  for (const a of map.areas) for (const r of a.rooms) {
    if (seen.has(r.id)) fail(`K=${K}: kolizja room id ${r.id}`);
    seen.add(r.id);
  }
  if (seen.size !== rooms) fail(`K=${K}: liczba pokoi ${seen.size} != ${rooms}`);

  const v = api.validate(map);
  if (!v.ok) fail(`K=${K}: walidacja: ${(v.errors[0] || {}).message}`);

  // Zapis .arkmap — bajtowo jak „Zapisz .arkmap" w edytorze (checksumy v2 + sort + stable).
  let arkmapStr;
  try {
    state.map = map;
    api._prepareArkmapForSave();
    arkmapStr = api._serializeMap();
    fs.writeFileSync(path.join(outDir, `stress_${K}k.arkmap`), arkmapStr);
  } catch (e) { console.log(`⚠ K=${K}: serializacja .arkmap przerwana (${e.message}) — stop drabinki`); break; }

  // Zapis .dat — ta sama funkcja co „Eksportuj Mudlet .dat" w apce. Best-effort:
  // przy braku pamieci pomijamy (eksport zmierzy driver w przegladarce).
  let datMB = null;
  try {
    const datBytes = api.arkmapToDat(map);
    fs.writeFileSync(path.join(outDir, `stress_${K}k.dat`), Buffer.from(datBytes));
    datMB = (datBytes.length / 1e6).toFixed(1);
  } catch (e) {
    console.log(`⚠ K=${K}: eksport .dat offline pominięty (${e.message}) — zmierzy go driver`);
  }

  console.log(`✓ K=${K}: ${rooms} pokoi, ${areasN} obszarów  ` +
    `.arkmap=${(arkmapStr.length / 1e6).toFixed(1)} MB  .dat=${datMB === null ? 'POMINIĘTY (RAM)' : datMB + ' MB'}`);
}
console.log('gotowe — artefakty w ' + outDir);
