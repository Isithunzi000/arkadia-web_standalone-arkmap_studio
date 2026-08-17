// Harness — sync transportów: tools/sync-transports.mjs (bramka schematu + semantyki).
// Pokrywa: happy path + idempotentność, brak etykiety, etykieta numeryczna, etykieta
// za krótka, osierocony przystanek (bez rozstrzygalnej etykiety), regresyjną walidację
// schematu, oraz invariant semantyczny na realnych TRANSPORT_DEFS z arkmap_studio.html.
// Uruchamianie z katalogu głównego repo. Bez fixture.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'sync-transports.mjs');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function makeSrc(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsync-'));
  for (const sub of ['ships', 'other']) fs.mkdirSync(path.join(dir, sub));
  for (const [sub, name, content] of files) {
    fs.writeFileSync(path.join(dir, sub, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}
function makeHtml() {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'thtml-')), 'studio.html');
  fs.writeFileSync(f, HTML);
  return f;
}
function run(src, html) { return spawnSync('node', [TOOL, src, html], { encoding: 'utf8' }); }

const GOOD_CYCLE = {
  label: 'Linia Testowa', board_commands: ['wsiadz'], exit_command: 'wyladuj',
  stops: [
    { start: 1, destination: 2, time: 10, label: 'Przystanek B' },
    { start: 2, destination: 3, time: 10, label: 'Przystanek C' },
    { start: 3, destination: 1, time: 10, label: 'Przystanek A' },
  ],
};

// ── T1: happy path + idempotentność ─────────────────────────────────────────
console.log('— T1: happy path + idempotentność —');
{
  const src = makeSrc([['ships', 'linia.json', GOOD_CYCLE]]);
  const html = makeHtml();
  const r1 = run(src, html);
  ok(r1.status === 0, 'happy path: exit 0 (cykl z etykietami przechodzi)');
  const out1 = fs.readFileSync(html, 'utf8');
  ok(out1.includes('Linia Testowa') && out1.includes('Przystanek B'), 'happy path: blok trafił do HTML z nazwami');
  const r2 = run(src, html);
  ok(r2.status === 0 && /bez zmian/.test(r2.stdout), 'idempotentność: drugi run = „bez zmian", exit 0');
}

// ── T2: brak etykiety → exit 1, HTML nietknięty ─────────────────────────────
console.log('— T2: bramka — brak etykiety —');
{
  const bad = { label: 'Linia', board_commands: [], stops: [{ start: 1, destination: 2, label: 'Cel' }, { start: 2, destination: 1 }] };
  const src = makeSrc([['ships', 'bad.json', bad]]);
  const html = makeHtml();
  const r = run(src, html);
  ok(r.status === 1 && /brak etykiety przystanku/.test(r.stderr), 'brak label: exit 1 + diagnoza „brak etykiety przystanku"');
  ok(fs.readFileSync(html, 'utf8') === HTML, 'brak label: HTML bajtowo nietknięty (fail-closed)');
}

// ── T3: etykieta numeryczna / za krótka ─────────────────────────────────────
console.log('— T3: bramka — sanity etykiet —');
{
  const num = { label: 'Linia', board_commands: [], stops: [{ start: 1, destination: 2, label: '23669' }, { start: 2, destination: 1, label: 'Cel' }] };
  const r1 = run(makeSrc([['ships', 'num.json', num]]), makeHtml());
  ok(r1.status === 1 && /czysto numeryczna/.test(r1.stderr), 'etykieta „23669": exit 1 + diagnoza „czysto numeryczna"');
  const short = { label: 'Linia', board_commands: [], stops: [{ start: 1, destination: 2, label: 'X' }, { start: 2, destination: 1, label: 'Cel' }] };
  const r2 = run(makeSrc([['ships', 'short.json', short]]), makeHtml());
  ok(r2.status === 1 && /za krótka/.test(r2.stderr), 'etykieta „X": exit 1 + diagnoza „za krótka"');
}

// ── T4: osierocony przystanek (start, który nigdy nie jest celem) ───────────
console.log('— T4: bramka — rozstrzygalność przystanków —');
{
  const orphan = { label: 'Linia', board_commands: [], stops: [{ start: 5, destination: 1, label: 'Cel A' }, { start: 1, destination: 6, label: 'Cel B' }] };
  const r = run(makeSrc([['other', 'orphan.json', orphan]]), makeHtml());
  ok(r.status === 1 && /bez rozstrzygalnej etykiety/.test(r.stderr), 'przystanek #5 tylko jako start: exit 1 + diagnoza „bez rozstrzygalnej etykiety"');
}

// ── T5: regresja schematu (stare reguły działają nadal) ─────────────────────
console.log('— T5: regresja walidacji schematu —');
{
  const r1 = run(makeSrc([['ships', 'broken.json', '{nie json']]), makeHtml());
  ok(r1.status === 1 && /niepoprawny JSON/.test(r1.stderr), 'zepsuty JSON: exit 1 + diagnoza');
  const empty = { label: 'Linia', board_commands: [], stops: [] };
  const r2 = run(makeSrc([['ships', 'empty.json', empty]]), makeHtml());
  ok(r2.status === 1 && /brak przystanków/.test(r2.stderr), 'puste stops: exit 1 + diagnoza');
}

// ── T6: invariant semantyczny na realnych TRANSPORT_DEFS ────────────────────
console.log('— T6: realne TRANSPORT_DEFS przechodzą bramkę semantyczną —');
{
  const BEGIN = '// === TRANSPORT-DATA BEGIN';
  const ib = HTML.indexOf(BEGIN);
  ok(ib >= 0, 'blok TRANSPORT-DATA istnieje w arkmap_studio.html');
  const lineStart = HTML.indexOf('const TRANSPORT_DEFS = ', ib);
  const lineEnd = HTML.indexOf('\n', lineStart);
  const json = HTML.slice(lineStart + 'const TRANSPORT_DEFS = '.length, lineEnd).replace(/;\s*$/, '');
  const defs = JSON.parse(json);
  ok(defs.length >= 1 && defs.every(d => Array.isArray(d[3]) && d[3].length > 0), `realne definicje: ${defs.length} linii, wszystkie z niepustymi legami`);
  const allLabeled = defs.every(d => d[3].every(leg => typeof leg[3] === 'string' && leg[3].length >= 2 && !/^\d+$/.test(leg[3])));
  ok(allLabeled, 'realne definicje: każdy leg ma sensowną etykietę (≥2 znaki, nie numeryczna)');
  const stopLabel = new Map();
  for (const d of defs) for (const leg of d[3]) if (!stopLabel.has(leg[1])) stopLabel.set(leg[1], leg[3]);
  const unresolved = [];
  for (const d of defs) for (const leg of d[3]) for (const id of [leg[0], leg[1]]) if (!stopLabel.has(id)) unresolved.push(id);
  ok(unresolved.length === 0, 'realne definicje: każdy przystanek ma rozstrzygalną etykietę (invariant chooser-a)');
}

console.log(`\ntransports_sync: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
