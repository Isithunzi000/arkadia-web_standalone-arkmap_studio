#!/usr/bin/env node
// dat2arkmap.mjs — konwersja pliku mapy Mudlet (.dat) do formatu .arkmap.
//
// Konwerter NIE jest tu zduplikowany — bloki są ekstrahowane verbatim
// z arkmap_studio.html po kotwicach tekstowych (ta sama technika co harnessy
// w tests/), więc narzędzie zawsze działa na aktualnym kodzie aplikacji.
//
// Użycie:   node tools/dat2arkmap.mjs <wejście.dat> <wyjście.arkmap> [--version V] [--revision R]
// Opcje:    --version V   — wpisuje meta.user_data.version = V
//           --revision R  — wpisuje meta.user_data.revision = R
//
// Właściwości: deterministyczny (to samo wejście + te same flagi = bajtowo
// ten sam plik; serializacja stableStringify jak przy zapisie w edytorze),
// fail-closed (błąd walidacji = kod wyjścia 1, plik wyjściowy nietknięty),
// lustro (żadnego czyszczenia danych — user_data i reszta przenoszone 1:1).

import fs from 'node:fs';
import path from 'node:path';

const HTML_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'arkmap_studio.html');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
function usage() {
  console.error('użycie: node tools/dat2arkmap.mjs <wejście.dat> <wyjście.arkmap> [--version V] [--revision R]');
  process.exit(2);
}

// ── Argumenty ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const positional = [];
let version = null, revision = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--version')       { version  = args[++i] ?? usage(); }
  else if (args[i] === '--revision') { revision = args[++i] ?? usage(); }
  else if (args[i].startsWith('--')) usage();
  else positional.push(args[i]);
}
if (positional.length !== 2) usage();
const [inPath, outPath] = positional;

// ── Ekstrakcja bloków z arkmap_studio.html ──────────────────────────────────
const html = fs.readFileSync(HTML_PATH, 'utf8');
function block(a, b) {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0 || j <= i) fail(`kotwica ekstrakcji nie znaleziona: ${JSON.stringify(a)}`);
  return html.slice(i, j);
}

const code =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +          // DIRS, FORMAT, CRC32, env
  block('// ── validate.js ──', '// ── checksum.js ──') + '\n' +           // validate()
  block('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +         // _stripRoomDefaults, addChecksums
  block('// ── mudlet_dat.js ──', '// ── dat-to-arkmap.js ──') + '\n' +    // prymitywy .dat
  block('// ── dat-to-arkmap.js ──', '// ── arkmap-to-dat.js ──') + '\n' + // datToArkmap()
  block('function stableStringify(val, indent, _lvl) {', 'function saveArkmapAs()') + '\n' +
  block('function _prepareArkmapForSave() {', 'function _arkmapSuggestedName() {') + '\n' +
  'return { datToArkmap, validate, _prepareArkmapForSave, _serializeMap };';

const state = { map: null };
let api;
try { api = new Function('state', code)(state); }
catch (e) { fail(`ekstrakcja/kompilacja bloków: ${e.message}`); }

// ── Konwersja ───────────────────────────────────────────────────────────────
let raw;
try { raw = fs.readFileSync(inPath); }
catch (e) { fail(`nie można odczytać ${inPath}: ${e.message}`); }

try {
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  state.map = api.datToArkmap(buf);
} catch (e) { fail(`parsowanie .dat: ${e.message}`); }
if (!state.map || !Array.isArray(state.map.areas)) fail('parsowanie .dat: brak struktury areas');

// Lustro: user_data z pliku przenoszone 1:1; dokładamy tylko version/revision.
if (version !== null || revision !== null) {
  const ud = state.map.meta.user_data ?? {};
  if (version  !== null) ud.version  = version;
  if (revision !== null) ud.revision = revision;
  state.map.meta.user_data = ud;
}

// ── Walidacja fail-closed ───────────────────────────────────────────────────
const v = api.validate(state.map);
for (const w of v.warnings) console.error('ostrzeżenie: ' + (w.message ?? w));
if (!v.ok) {
  for (const e of v.errors) console.error('błąd: ' + (e.message ?? e));
  fail(`walidacja: ${v.errors.length} błędów — plik wyjściowy nie zapisany`);
}

// ── Zapis (identyczny jak „Zapisz .arkmap” w edytorze) ─────────────────────
api._prepareArkmapForSave();                    // sortowanie + checksumy (operuje na state.map)
const out = api._serializeMap();                // strip defaults + stableStringify
try { fs.writeFileSync(outPath, out); }
catch (e) { fail(`nie można zapisać ${outPath}: ${e.message}`); }

let rooms = 0;
for (const ar of state.map.areas) rooms += ar.rooms.length;
console.log(`✓ ${inPath} → ${outPath}: ${state.map.areas.length} obszarów, ${rooms} pokoi, ${out.length} znaków`);
