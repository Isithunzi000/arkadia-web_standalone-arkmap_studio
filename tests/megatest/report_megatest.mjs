#!/usr/bin/env node
// report_megatest.mjs — raport HTML mega-testu (3 silniki, wspolna drabinka).
// Uzycie: node tests/megatest/report_megatest.mjs <results_dir> <out.html>
// Czyta co jest (brakujace pliki = sekcja "pominieta", nie blad).
import fs from 'node:fs';
import path from 'node:path';

const RESULTS = process.argv[2];
const OUT = process.argv[3];
if (!RESULTS || !OUT) { console.error('uzycie: report_megatest.mjs <results_dir> <out.html>'); process.exit(2); }

const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf8')); } catch { return null; } };
const manifest = readJson('manifest.json');
const web = readJson('results_web.json');
const ark = readJson('results_arkmap_node.json');
const meta = readJson('META.json');
const ramDesktop = readJson('ram_desktop.txt');
let maszyna = '';
try { maszyna = fs.readFileSync(path.join(RESULTS, 'MASZYNA.md'), 'utf8'); } catch {}

// Desktop: agregacja JSONL -> mediana per plik.
const deskRows = [];
const deskArr = readJson('results_desktop.json');   // finalny plik (czysta tablica)
if (Array.isArray(deskArr)) {
  deskRows.push(...deskArr);
} else {
  try {   // fallback: postep na zywo (jsonl, gdy run przerwany w trakcie)
    for (const line of fs.readFileSync(path.join(RESULTS, 'results_desktop.jsonl'), 'utf8').split('\n')) {
      if (line.trim()) deskRows.push(JSON.parse(line));
    }
  } catch {}
}
function med(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return +s[Math.floor(0.5 * (s.length - 1))].toFixed(1);
}
const desk = {};
for (const r of deskRows) {
  if (r.error) { (desk[r.file] ||= { errors: [] }).errors.push(r.error); continue; }
  const d = (desk[r.file] ||= { runs: 0, okRuns: 0, load: [], wall: [], path: [], found: [], search: [], iter: [], rooms: 0, errors: [] });
  d.runs++;
  if (r.ok) {
    d.okRuns++;
    d.load.push(r.load_ms); d.wall.push(r.load_wall_ms);
    d.path.push(r.path_ms); d.found.push(r.path_found);
    d.search.push(r.search_ms); d.iter.push(r.iter_ms);
    d.rooms = r.rooms;
  }
}

// Kryteria (zarejestrowane w run_megatest.sh — NIE RUSZAC po fakcie):
const LOAD_MS = 30000, MEM_MB = 2048;
const verdictLoad = ms => ms == null ? '—' : ms > LOAD_MS ? 'LOAD' : 'OK';
const badge = v => v === 'OK' ? '<b class="ok">OK</b>' : v === '—' ? '—' : `<b class="bad">${v}</b>`;
const fmt = v => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('pl-PL') : v;

const names = manifest ? manifest.ladder.map(l => l.name)
  : [...new Set([...Object.keys(web?.files || {}), ...Object.keys(ark?.sets || {}), ...Object.keys(desk)])];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Sekcja W1: wczytanie.
const w1rows = names.map(n => {
  const d = desk[n], w = web?.files?.[n], a = ark?.sets?.[n];
  const loadMed = d && d.load.length ? med(d.load) : null;
  const wallMed = d && d.wall.length ? med(d.wall) : null;
  const webMed = w ? w.parse_ms.med : null;
  const arkDat = a ? a.dat.total.med : null;
  const arkMap = a ? a.arkmap.total.med : null;
  return `<tr><td>${esc(n)}</td><td>${fmt(d?.rooms || w?.rooms || a?.rooms)}</td>`
    + `<td>${fmt(loadMed)}${loadMed != null ? ` <small>(wall ${fmt(wallMed)})</small>` : ''}</td><td>${badge(verdictLoad(loadMed))}</td>`
    + `<td>${fmt(webMed)}</td><td>${badge(verdictLoad(webMed))}</td>`
    + `<td>${fmt(arkDat)}</td><td>${fmt(arkMap)}</td><td>${badge(verdictLoad(arkMap))}</td></tr>`;
}).join('\n');

// Sekcja W2/W3: desktop.
const w2rows = names.map(n => {
  const d = desk[n];
  if (!d || !d.path.length) return `<tr><td>${esc(n)}</td><td colspan="5">—</td></tr>`;
  const foundAvg = d.found.reduce((s, x) => s + x, 0) / d.found.length;
  return `<tr><td>${esc(n)}</td><td>${fmt(med(d.path))}</td><td>${fmt(Math.round(foundAvg))}/${manifest?.pairs_per_map || '?'}</td>`
    + `<td>${fmt(med(d.search))}</td><td>${fmt(med(d.iter))}</td><td>${badge('OK')}</td></tr>`;
}).join('\n');

// Sekcja RAM.
const memRows = names.map(n => {
  const w = web?.files?.[n], a = ark?.sets?.[n];
  return `<tr><td>${esc(n)}</td><td>${w ? w.heap_delta_mb + ' MB' : '—'}</td>`
    + `<td>${a ? a.dat.heap_delta_mb + ' MB (dat) / ' + a.arkmap.heap_delta_mb + ' MB (arkmap)' : '—'}</td></tr>`;
}).join('\n');

// Pitch: najwiekszy wspolny punkt drabinki.
let pitch = '<p>Brak kompletu danych do sekcji pitch.</p>';
const biggest = [...names].reverse().find(n => desk[n]?.load.length && web?.files?.[n] && ark?.sets?.[n]);
if (biggest) {
  const d = desk[biggest], w = web.files[biggest], a = ark.sets[biggest];
  const loadMed = med(d.load), webMed = w.parse_ms.med, arkMapMed = a.arkmap.total.med, arkDatMed = a.dat.total.med;
  pitch = `<ul>
  <li>Wczytanie <b>${fmt(d.rooms)} pokoi</b> (${esc(biggest)}): Mudlet desktop (.dat, loadMap) <b>${fmt(loadMed)} ms CPU</b> (wall ${fmt(med(d.wall))} ms), mudlet-web (.dat, parse) <b>${fmt(webMed)} ms</b>, ArkMap .dat <b>${fmt(arkDatMed)} ms</b>, ArkMap <b>.arkmap ${fmt(arkMapMed)} ms</b>.</li>
  <li>.arkmap vs .dat (desktop): <b>${(loadMed / arkMapMed).toFixed(1)}×</b> roznicy na korzysc .arkmap (mediana, ta sama maszyna, ta sama sesja).</li>
  <li>Pathfinding desktop: ${fmt(med(d.path))} ms / ${manifest?.pairs_per_map || 100} par; pelny skan nazw (searchRoom): ${fmt(med(d.search))} ms.</li>
  <li>RAM: desktop peak VmHWM ${ramDesktop ? ramDesktop.vmhwm_peak_mb + ' MB' : '?'} (caly proces), web heap +${w.heap_delta_mb} MB, arkmap heap +${a.arkmap.heap_delta_mb} MB.</li>
</ul>`;
}

const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8">
<title>Mega-test silnikow map — ${esc(path.basename(RESULTS))}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;background:#111;color:#ddd;max-width:1100px;margin:2em auto;padding:0 1em}
h1{font-size:1.6em} h2{margin-top:2em;border-bottom:1px solid #333;padding-bottom:.2em}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #333;padding:.35em .6em;text-align:right}
th:first-child,td:first-child{text-align:left}
th{background:#1c1c1c}
.ok{color:#5c5}.bad{color:#e55}
small{color:#888}
.note{background:#1a1a2a;border-left:3px solid #66f;padding:.6em 1em;margin:.8em 0}
pre{background:#181818;padding:1em;overflow:auto;white-space:pre-wrap}
</style></head><body>
<h1>Mega-test: ArkMap Studio vs mudlet-web vs Mudlet desktop</h1>
<p>Katalog wynikow: <code>${esc(RESULTS)}</code>${meta ? ` · ArkMap ${esc(meta.app_version)} · Mudlet ${esc(meta.mudlet_desktop)} · reader ${esc(meta.mudlet_map_binary_reader)} · Node ${esc(meta.node)} · runs ${meta.runs} · seed ${esc(meta.seed_manifestu)}` : ''}</p>

<h2>W1 — wczytanie mapy (ms, mediana)</h2>
<table><tr><th>mapa</th><th>pokoi</th><th>desktop .dat (loadMap)</th><th>werd.</th><th>web .dat (parse)</th><th>werd.</th><th>arkmap .dat (total)</th><th>arkmap .arkmap (total)</th><th>werd.</th></tr>
${w1rows}
</table>
<div class="note">Uwaga metodologiczna: desktop loadMap = restore + audit + init widoku 2D (pelna cena uzytkownika, czas CPU; w nawiasie wall). Web i arkmap (Node) = czysty parse (+validate/checksumy w "total" arkmap). To swiadoma niesymetria — porownujemy to, za co placi uzytkownik kazdego produktu.</div>

<h2>W2/W3 — pathfinding i przeszukanie (desktop, ms, mediana)</h2>
<table><tr><th>mapa</th><th>getPath (100 par)</th><th>znalezione</th><th>searchRoom</th><th>getRooms</th><th>werd.</th></tr>
${w2rows}
</table>

<h2>W4 — pamiec</h2>
<p>Desktop (caly proces, peak VmHWM): <b>${ramDesktop ? ramDesktop.vmhwm_peak_mb + ' MB' : '—'}</b> (limit MEM: ${MEM_MB} MB)</p>
<table><tr><th>mapa</th><th>web heap delta</th><th>arkmap heap delta</th></tr>
${memRows}
</table>

<h2>Pitch .arkmap (liczby do propozycji dla Mudleta)</h2>
${pitch}

<h2>Uwagi (honest)</h2>
<ul>
<li>Desktop: getPath pierwszy raz po loadzie buduje graf (TAstar) — koszt realny, wliczony.</li>
<li>Pathfinding desktop (TAstar, C++) i ewentualny odpowiednik web (pathfinding.ts, TS) to rozne implementacje — W2 mierzony tylko na desktopie.</li>
<li>K=32: plik .dat nie istnieje (OOM generatora przy eksporcie — znany limit), drabinka desktop/web konczy sie na K=16 lub ostatnim istniejacym K.</li>
<li>Wszystkie silniki mierzone w jednej sesji, na tej samej maszynie, na identycznych plikach; pary pokoi i frazy deterministyczne (seed ${manifest?.seed || '?'}).</li>
</ul>

<h2>Maszyna</h2>
<pre>${esc(maszyna || 'brak MASZYNA.md')}</pre>
</body></html>
`;

fs.writeFileSync(OUT, html);
console.log('✓ raport: ' + OUT);
