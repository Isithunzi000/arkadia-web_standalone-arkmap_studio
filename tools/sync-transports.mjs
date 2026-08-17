#!/usr/bin/env node
// sync-transports.mjs — generuje blok TRANSPORT-DATA w arkmap_studio.html z definicji
// statków i dyliżansów z Delwing/arkadia-web-client-extension (MIT).
//
// Użycie:   node tools/sync-transports.mjs <katalog-źródłowy> [plik-html]
// Katalog źródłowy musi zawierać podkatalogi ships/ i other/ z plikami .json
// oraz opcjonalnie plik UPSTREAM_SHA z commitem upstreama.
//
// Właściwości: idempotentny (ten sam SHA + te same JSON-e = bajtowo ten sam blok),
// deterministyczny (pliki sortowane, stabilna serializacja), bezpieczny
// (walidacja schematu i semantyki etykiet przystanków — błąd = kod wyjścia 1, HTML nietknięty).

import fs from 'node:fs';
import path from 'node:path';

const srcDir = process.argv[2];
const htmlPath = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'arkmap_studio.html');
if (!srcDir) { console.error('użycie: node tools/sync-transports.mjs <katalog-źródłowy> [plik-html]'); process.exit(2); }

const BEGIN = '// === TRANSPORT-DATA BEGIN (generowane przez tools/sync-transports.mjs — nie edytować ręcznie) ===';
const END = '// === TRANSPORT-DATA END ===';

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

// ── Wczytanie i walidacja ───────────────────────────────────────────────────
const dirs = ['ships', 'other'];
const defs = [];
for (const sub of dirs) {
  const dir = path.join(srcDir, sub);
  if (!fs.existsSync(dir)) fail(`brak katalogu ${dir}`);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort(); // determinizm
  for (const f of files) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { fail(`${sub}/${f}: niepoprawny JSON (${e.message})`); }
    const name = (raw.label ?? f.replace(/\.json$/, '')).trim();
    if (!name) fail(`${sub}/${f}: pusta nazwa/label`);
    if (!Array.isArray(raw.stops) || raw.stops.length === 0) fail(`${sub}/${f}: brak przystanków`);
    const board = raw.board_commands ?? [];
    if (!Array.isArray(board) || board.some(c => typeof c !== 'string')) fail(`${sub}/${f}: board_commands nie jest listą stringów`);
    const exit = typeof raw.exit_command === 'string' && raw.exit_command.trim() ? raw.exit_command.trim() : null;
    const stops = raw.stops.map((s, i) => {
      if (!Number.isInteger(s.start) || s.start <= 0) fail(`${sub}/${f} stop[${i}]: start nie jest dodatnim intem`);
      if (!Number.isInteger(s.destination) || s.destination <= 0) fail(`${sub}/${f} stop[${i}]: destination nie jest dodatnim intem`);
      const time = (typeof s.time === 'number' && s.time > 0) ? s.time : null;
      const label = typeof s.label === 'string' && s.label.trim() ? s.label.trim() : null;
      // Bramka semantyczna: każdy przystanek musi mieć sensowną etykietę (invariant
      // chooser-a: 100% pozycji z nazwą). Odchylenie = anomalia upstream → czerwony
      // workflow, nic nie ląduje w main, auto-issue z diagnozą (sync-transports.yml).
      if (label === null) fail(`${sub}/${f} stop[${i}]: brak etykiety przystanku (label) — anomalia upstream, wymagany przegląd`);
      if (label.length < 2) fail(`${sub}/${f} stop[${i}]: etykieta za krótka („${label}")`);
      if (/^\d+$/.test(label)) fail(`${sub}/${f} stop[${i}]: etykieta czysto numeryczna („${label}") — to numer pokoju, nie nazwa`);
      return [s.start, s.destination, time, label];
    });
    defs.push([name, board, exit, stops]);
  }
}
defs.sort((a, b) => a[0].localeCompare(b[0], 'pl')); // stabilna kolejność niezależna od podkatalogu

// Bramka semantyczna: rozstrzygalność przystanków — symulacja mapy stopLabel z runtime
// (etykieta przystanku pochodzi z legu, którego jest celem). Przystanek występujący
// wyłącznie jako start legu (nigdy cel) pokazałby w chooserze fallback/#ID.
const stopLabel = new Map();
for (const def of defs) for (const leg of def[3]) if (!stopLabel.has(leg[1])) stopLabel.set(leg[1], leg[3]);
for (const def of defs) for (const leg of def[3]) {
  for (const stopId of [leg[0], leg[1]]) {
    if (!stopLabel.has(stopId)) fail(`${def[0]}: przystanek #${stopId} bez rozstrzygalnej etykiety (nigdy nie jest celem legu) — anomalia upstream, wymagany przegląd`);
  }
}

const shaFile = path.join(srcDir, 'UPSTREAM_SHA');
const sha = fs.existsSync(shaFile) ? fs.readFileSync(shaFile, 'utf8').trim() : 'unknown';
if (!/^[0-9a-f]{40}$|^unknown$/.test(sha)) fail(`UPSTREAM_SHA nieprawidłowe: ${sha}`);

// ── Blok ────────────────────────────────────────────────────────────────────
const stopCount = defs.reduce((n, d) => n + d[3].length, 0);
const block = [
  BEGIN,
  `// Źródło: Delwing/arkadia-web-client-extension (licencja MIT) — scripts/ships/*.json + scripts/other/*.json`,
  `// Upstream: ${sha} · linii: ${defs.length} · przystanków: ${stopCount}`,
  '// Format: [nazwa, [komendy wsiadania], komenda wysiadania|null, [[startRoomId, destRoomId, czasS|null, etykieta|null], ...]]',
  `const TRANSPORT_DEFS = ${JSON.stringify(defs)};`,
  END,
].join('\n');

// ── Wymiana bloku w HTML (idempotentnie) ────────────────────────────────────
const html = fs.readFileSync(htmlPath, 'utf8');
const i = html.indexOf(BEGIN), j = html.indexOf(END);
if (i < 0 || j < 0 || j <= i) fail(`brak/uszkodzone markery TRANSPORT-DATA w ${htmlPath}`);
const out = html.slice(0, i) + block + html.slice(j + END.length);
if (out === html) { console.log(`✓ bez zmian (SHA ${sha}, ${defs.length} linii, ${stopCount} przystanków)`); process.exit(0); }
fs.writeFileSync(htmlPath, out);
console.log(`✓ blok zaktualizowany: SHA ${sha}, ${defs.length} linii, ${stopCount} przystanków, blok ${block.length} B`);
