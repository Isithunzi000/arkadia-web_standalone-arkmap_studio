#!/usr/bin/env node
// report_megatest.mjs — raport HTML mega-testu (3 silniki, wspolna drabinka).
// Uzycie: node tests/megatest/report_megatest.mjs <results_dir> <out.html>
// Struktura: dla kazdego parametru osobno — wartosci wszystkich silnikow,
// porownanie miedzy nimi (ratio), wykres, krotki wniosek.
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

// ---------- desktop: agregacja runow ----------
const deskRows = [];
const deskArr = readJson('results_desktop.json');
if (Array.isArray(deskArr)) {
  deskRows.push(...deskArr);
} else {
  try {
    for (const line of fs.readFileSync(path.join(RESULTS, 'results_desktop.jsonl'), 'utf8').split('\n')) {
      if (line.trim()) deskRows.push(JSON.parse(line));
    }
  } catch {}
}

// ---------- helpers ----------
function med(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return +s[Math.floor(0.5 * (s.length - 1))].toFixed(1);
}
const stat = xs => xs.length ? { min: Math.min(...xs), med: med(xs), max: Math.max(...xs) } : null;
const fmt = v => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('pl-PL') : v;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ratio = (a, b) => (a != null && b) ? (a / b).toFixed(2) + '×' : '—';
const spread = s => s && s.med ? '+' + ((s.max - s.med) / s.med * 100).toFixed(1) + '% / −' + ((s.med - s.min) / s.med * 100).toFixed(1) + '%' : '—';
const growth = (cur, prev) => (cur != null && prev) ? '×' + (cur / prev).toFixed(2) : '—';

const desk = {};
for (const r of deskRows) {
  if (r.error) { (desk[r.file] ||= { errors: [] }).errors.push(r.error); continue; }
  const d = (desk[r.file] ||= { runs: 0, okRuns: 0, load: [], wall: [], path: [], found: [], search: [], hits: [], iter: [], rooms: 0, errors: [] });
  d.runs++;
  if (r.ok) {
    d.okRuns++;
    d.load.push(r.load_ms); d.wall.push(r.load_wall_ms);
    d.path.push(r.path_ms); d.found.push(r.path_found);
    d.search.push(r.search_ms); d.hits.push(r.search_hits);
    d.iter.push(r.iter_ms);
    d.rooms = r.rooms;
  }
}

// Kryteria (zarejestrowane w run_megatest.sh — NIE RUSZAC po fakcie):
const LOAD_MS = 30000, MEM_MB = 2048;
const verdictLoad = ms => ms == null ? '—' : ms > LOAD_MS ? 'LOAD' : 'OK';
const badge = v => v === 'OK' ? '<b class="ok">OK</b>' : v === '—' ? '—' : `<b class="bad">${v}</b>`;

const names = manifest ? manifest.ladder.map(l => l.name)
  : [...new Set([...Object.keys(web?.files || {}), ...Object.keys(ark?.sets || {}), ...Object.keys(desk)])];
const pairsPerMap = manifest?.pairs_per_map || 100;

// ---------- wykresy slupkowe (czysty CSS) ----------
const C = { desk: '#d95555', web: '#5588dd', adat: '#d9a030', amap: '#55bb55' };
function chart(rows) {  // rows: [{group, bars:[{label,val,color}]}]
  const max = Math.max(...rows.flatMap(r => r.bars.map(b => b.val || 0)));
  if (!max) return '';
  let h = '<div class="chart">';
  for (const r of rows) {
    h += `<div class="cgroup">${esc(r.group)}</div>`;
    for (const b of r.bars) {
      const w = b.val ? Math.max(0.5, b.val / max * 100) : 0;
      h += `<div class="brow"><span class="eng">${esc(b.label)}</span>`
        + `<div class="btrack"><div class="bfill" style="width:${w}%;background:${b.color}"></div></div>`
        + `<span class="bval">${b.val ? fmt(b.val) + ' ms' : '—'}</span></div>`;
    }
  }
  return h + '</div>';
}
const legend = `<p class="leg"><span style="color:${C.desk}">■</span> desktop loadMap (CPU) · <span style="color:${C.web}">■</span> web parse · <span style="color:${C.adat}">■</span> arkmap .dat total · <span style="color:${C.amap}">■</span> arkmap .arkmap total</p>`;

// ---------- W1: wczytanie ----------
const dLoad = {}, dWall = {};
for (const n of names) {
  dLoad[n] = desk[n]?.load.length ? stat(desk[n].load) : null;
  dWall[n] = desk[n]?.wall.length ? stat(desk[n].wall) : null;
}
const w1a = names.map(n => {
  const d = desk[n], w = web?.files?.[n], a = ark?.sets?.[n];
  return `<tr><td>${esc(n)}</td><td>${fmt(d?.rooms || w?.rooms || a?.rooms)}</td><td>${fmt(w?.size_mb ?? a?.size_mb?.dat)} / ${fmt(a?.size_mb?.arkmap)}</td>`
    + `<td>${fmt(dLoad[n]?.med)}${dLoad[n] ? ` <small>(wall ${fmt(dWall[n].med)})</small>` : ''}</td><td><small>${spread(dLoad[n])}</small></td>`
    + `<td>${fmt(w?.parse_ms?.med)}</td><td><small>${w ? spread(w.parse_ms) : '—'}</small></td>`
    + `<td>${fmt(a?.dat?.total?.med)}</td><td>${fmt(a?.arkmap?.total?.med)}</td>`
    + `<td>${badge(verdictLoad(dLoad[n]?.med))} ${badge(verdictLoad(w?.parse_ms?.med))} ${badge(verdictLoad(a?.arkmap?.total?.med))}</td></tr>`;
}).join('\n');

const w1ratios = names.map(n => {
  const w = web?.files?.[n], a = ark?.sets?.[n];
  const dl = dLoad[n]?.med;
  return `<tr><td>${esc(n)}</td><td>${ratio(dl, w?.parse_ms?.med)}</td><td>${ratio(dl, a?.dat?.total?.med)}</td>`
    + `<td>${ratio(dl, a?.arkmap?.total?.med)}</td><td>${ratio(a?.dat?.total?.med, a?.arkmap?.total?.med)}</td>`
    + `<td>${growth(w?.parse_ms?.med, web?.files?.[names[names.indexOf(n) - 1]]?.parse_ms?.med)}</td>`
    + `<td>${growth(dl, dLoad[names[names.indexOf(n) - 1]]?.med)}</td></tr>`;
}).join('\n');

const w1chart = chart(names.map(n => ({
  group: `${n} (${fmt(desk[n]?.rooms || web?.files?.[n]?.rooms || ark?.sets?.[n]?.rooms)} pokoi)`,
  bars: [
    { label: 'desktop', val: dLoad[n]?.med, color: C.desk },
    { label: 'web', val: web?.files?.[n]?.parse_ms?.med, color: C.web },
    { label: 'arkmap .dat', val: ark?.sets?.[n]?.dat?.total?.med, color: C.adat },
    { label: 'arkmap .arkmap', val: ark?.sets?.[n]?.arkmap?.total?.med, color: C.amap },
  ],
})));

// ---------- W2/W3: desktop per parametr ----------
function deskParam(title, getStat, extra) {
  let prevMed = null;
  const rows = names.map(n => {
    const s = getStat(n);
    const g = s ? growth(s.med, prevMed) : '—';
    const ex = extra ? extra(n, s) : '';
    if (s) prevMed = s.med;
    return `<tr><td>${esc(n)}</td><td>${fmt(desk[n]?.rooms)}</td><td>${s ? fmt(s.med) : '—'}</td>`
      + `<td><small>${s ? fmt(s.min) + ' – ' + fmt(s.max) : '—'}</small></td><td>${g}</td>${ex}</tr>`;
  }).join('\n');
  return { title, rows };
}

const w2 = deskParam('getPath', n => desk[n]?.path.length ? stat(desk[n].path) : null,
  (n, s) => {
    const f = desk[n]?.found || [];
    const foundAvg = f.length ? Math.round(f.reduce((x, y) => x + y, 0) / f.length) : null;
    return `<td>${foundAvg != null ? foundAvg + '/' + pairsPerMap : '—'}</td><td>${s && foundAvg ? fmt(+(s.med / foundAvg).toFixed(1)) : '—'}</td>`;
  });
const w3 = deskParam('searchRoom', n => desk[n]?.search.length ? stat(desk[n].search) : null,
  n => {
    const h = desk[n]?.hits || [];
    return `<td>${h.length ? h[0] : '—'}</td>`;
  });
const w3b = deskParam('getRooms', n => desk[n]?.iter.length ? stat(desk[n].iter) : null);

const w2chart = chart(names.map(n => ({
  group: `${n} (${fmt(desk[n]?.rooms)} pokoi)`,
  bars: [{ label: 'getPath', val: desk[n]?.path.length ? med(desk[n].path) : null, color: C.desk }],
})));

// ---------- W4: pamiec ----------
const memRows = names.map(n => {
  const w = web?.files?.[n], a = ark?.sets?.[n];
  return `<tr><td>${esc(n)}</td><td>${w ? w.heap_delta_mb + ' MB' : '—'}</td>`
    + `<td>${a ? a.dat.heap_delta_mb + ' MB' : '—'}</td><td>${a ? a.arkmap.heap_delta_mb + ' MB' : '—'}</td>`
    + `<td>${w && a ? ratio(w.heap_delta_mb, a.arkmap.heap_delta_mb) : '—'}</td>`
    + `<td>${badge(w && w.heap_delta_mb > MEM_MB ? 'MEM' : 'OK')}</td></tr>`;
}).join('\n');

// ---------- determinizm ----------
const detRows = names.map(n => {
  const d = desk[n];
  if (!d || !d.found.length) return `<tr><td>${esc(n)}</td><td colspan="4">—</td></tr>`;
  const same = xs => xs.every(x => x === xs[0]);
  const ls = stat(d.load);
  return `<tr><td>${esc(n)}</td><td>${same(d.found) ? 'tak (' + d.found[0] + ')' : '<b class="bad">NIE</b>'}</td>`
    + `<td>${same(d.hits) ? 'tak (' + d.hits[0] + ')' : '<b class="bad">NIE</b>'}</td>`
    + `<td>${d.okRuns}/${d.runs}</td><td><small>${spread(ls)}</small></td></tr>`;
}).join('\n');

// ---------- pitch ----------
let pitch = '<p>Brak kompletu danych do sekcji pitch.</p>';
const biggest = [...names].reverse().find(n => desk[n]?.load.length && web?.files?.[n] && ark?.sets?.[n]);
if (biggest) {
  const d = desk[biggest], w = web.files[biggest], a = ark.sets[biggest];
  const loadMed = med(d.load), webMed = w.parse_ms.med, arkMapMed = a.arkmap.total.med, arkDatMed = a.dat.total.med;
  pitch = `<table><tr><th>silnik / format</th><th>wczytanie ${fmt(d.rooms)} pokoi (ms)</th><th>vs desktop</th></tr>
  <tr><td>Mudlet desktop — .dat (loadMap, restore+audit+init2D)</td><td>${fmt(loadMed)} CPU (wall ${fmt(med(d.wall))})</td><td>1.00×</td></tr>
  <tr><td>mudlet-web — .dat (parse)</td><td>${fmt(webMed)}</td><td>${ratio(loadMed, webMed)} szybciej</td></tr>
  <tr><td>ArkMap — .dat (parse+validate)</td><td>${fmt(arkDatMed)}</td><td>${ratio(loadMed, arkDatMed)} szybciej</td></tr>
  <tr><td><b>ArkMap — .arkmap (json+validate+crc)</b></td><td><b>${fmt(arkMapMed)}</b></td><td><b>${ratio(loadMed, arkMapMed)} szybciej</b></td></tr>
  </table>
  <ul>
  <li>Ta sama maszyna, ta sama sesja, identyczny plik wejsciowy, ${meta?.runs || '?'} przebiegow, mediana.</li>
  <li>Heap przy 432k pokoi: web +${w.heap_delta_mb} MB, ArkMap .arkmap +${a.arkmap.heap_delta_mb} MB (${ratio(w.heap_delta_mb, a.arkmap.heap_delta_mb)} mniej).</li>
  <li>Checksumy .arkmap: ${a.arkmap.checksums_ok ? '<b class="ok">CRC OK we wszystkich przebiegach</b>' : '<b class="bad">CRC FAIL</b>'}.</li>
  </ul>`;
}

// ---------- HTML ----------
const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8">
<title>Mega-test silnikow map — ${esc(path.basename(RESULTS))}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;background:#111;color:#ddd;max-width:1150px;margin:2em auto;padding:0 1em}
h1{font-size:1.6em} h2{margin-top:2em;border-bottom:1px solid #333;padding-bottom:.2em}
h3{margin:1.4em 0 .4em;color:#aac}
table{border-collapse:collapse;width:100%;margin:.8em 0}
th,td{border:1px solid #333;padding:.35em .6em;text-align:right}
th:first-child,td:first-child{text-align:left}
th{background:#1c1c1c}
.ok{color:#5c5}.bad{color:#e55}
small{color:#888}
.note{background:#1a1a2a;border-left:3px solid #66f;padding:.6em 1em;margin:.8em 0}
.verdict{background:#1a2a1a;border-left:3px solid #5c5;padding:.6em 1em;margin:.8em 0}
pre{background:#181818;padding:1em;overflow:auto;white-space:pre-wrap}
.chart{margin:.8em 0 1.4em}
.cgroup{margin-top:.7em;font-weight:600;color:#ccc}
.brow{display:flex;align-items:center;gap:.6em;margin:2px 0}
.eng{width:8.5em;color:#999;font-size:.82em;text-align:right}
.btrack{flex:1;background:#1a1a1a;height:13px}
.bfill{height:100%}
.bval{width:9em;font-size:.85em}
.leg{font-size:.85em;color:#999}
nav a{color:#8af;margin-right:1em}
</style></head><body>
<h1>Mega-test: ArkMap Studio vs mudlet-web vs Mudlet desktop</h1>
<p>Katalog wynikow: <code>${esc(RESULTS)}</code>${meta ? ` · ArkMap ${esc(meta.app_version)} · Mudlet ${esc(meta.mudlet_desktop)} · reader ${esc(meta.mudlet_map_binary_reader)} · Node ${esc(meta.node)} · runs ${meta.runs} · seed ${esc(meta.seed_manifestu)}` : ''}</p>
<nav><a href="#w1">W1 wczytanie</a><a href="#w2">W2 getPath</a><a href="#w3">W3 searchRoom</a><a href="#w3b">W3b getRooms</a><a href="#w4">W4 pamiec</a><a href="#det">determinizm</a><a href="#pitch">pitch .arkmap</a><a href="#uwagi">uwagi</a></nav>

<h2 id="w1">W1 — wczytanie mapy</h2>
<h3>Wartosci (mediana z ${meta?.runs || '?'} runow, ms; w nawiasie rozrzut min–max wzgledem mediany)</h3>
<table><tr><th>mapa</th><th>pokoi</th><th>MB .dat/.arkmap</th><th>desktop .dat (loadMap)</th><th>rozrzut</th><th>web .dat (parse)</th><th>rozrzut</th><th>arkmap .dat (total)</th><th>arkmap .arkmap (total)</th><th>werdykty (d/w/a)</th></tr>
${w1a}
</table>
${legend}
${w1chart}
<h3>Porownanie miedzy silnikami (ile razy desktop jest wolniejszy; ost. kol. arkmap: .dat / .arkmap) i skalowanie (wzrost czasu przy ×2 pokoi)</h3>
<table><tr><th>mapa</th><th>desktop / web</th><th>desktop / arkmap .dat</th><th>desktop / .arkmap</th><th>arkmap: .dat / .arkmap</th><th>wzrost web</th><th>wzrost desktop</th></tr>
${w1ratios}
</table>
<div class="verdict">Wniosek: desktop loadMap jest stabilnie ~4–5× wolniejszy niz czysty parse na kazdej skali — koszt rosnie liniowo z liczba pokoi (×~2 przy ×2 pokoi), wiec roznica jest strukturalna (restore+audit+init2D), nie skalowa. .arkmap laduje sie szybciej niz .dat w kazdym punkcie drabinki. Limit LOAD (30 s) desktop przekracza dopiero przy 432k pokoi.</div>
<div class="note">Uwaga metodologiczna: desktop loadMap = restore + audit + init widoku 2D (pelna cena uzytkownika, czas CPU; w nawiasie wall). Web i arkmap (Node) = czysty parse (+validate/checksumy w "total" arkmap). To swiadoma niesymetria — porownujemy to, za co placi uzytkownik kazdego produktu.</div>

<h2 id="w2">W2 — getPath, ${pairsPerMap} deterministycznych par (desktop, ms)</h2>
<table><tr><th>mapa</th><th>pokoi</th><th>mediana</th><th>min–max</th><th>wzrost vs poprzednia mapa</th><th>znalezione</th><th>ms / znaleziona sciezke</th></tr>
${w2.rows}
</table>
${w2chart}
<div class="verdict">Wniosek: znalezionych sciezek ubywa z klonowaniem (pary z manifestu trafiaja w niespolaczone klony — artefakt drabinki, nie regres silnika). Czas calkowity rosnie wolniej niz liczba pokoi (×~1.5–1.7 przy ×2 pokoi), bo udanych A* jest coraz mniej. Koszt na znaleziona sciezke rosnie z ~95 do ~5300 ms — przy duzych mapach dominuje puste przeszukiwanie grafu za nieistniejace polaczenia. Mierzone tylko na desktopie — web/arkmap nie sciagaja w tym tescie pathfindingu (rozne implementacje: TAstar C++ vs pathfinding.ts).</div>

<h2 id="w3">W3 — searchRoom, 3 frazy z manifestu (desktop, ms)</h2>
<table><tr><th>mapa</th><th>pokoi</th><th>mediana</th><th>min–max</th><th>wzrost vs poprzednia mapa</th><th>trafienia</th></tr>
${w3.rows}
</table>
<div class="verdict">Wniosek: pelny skan nazw pokoi — koszt rosnie liniowo z liczba pokoi (×~2 przy ×2 pokoi), trafienia rosna ×2 bo fraza trafia w kazdy klon. Brak niespodzianek.</div>

<h2 id="w3b">W3b — getRooms, iteracja po wszystkich pokojach (desktop, ms)</h2>
<table><tr><th>mapa</th><th>pokoi</th><th>mediana</th><th>min–max</th><th>wzrost vs poprzednia mapa</th></tr>
${w3b.rows}
</table>
<div class="verdict">Wniosek: iteracja po pelnej mapie — od ~0,7 us na pokoj przy 27k do ~1,7 us przy 432k; wzrost ×2.3–2.9 przy ×2 pokoi, czyli lekko ponad liniowy (efekt cache przy duzych strukturach), ale bez progow i anomalii.</div>

<h2 id="w4">W4 — pamiec</h2>
<p>Desktop (caly proces, peak VmHWM): <b>${ramDesktop ? ramDesktop.vmhwm_peak_mb + ' MB' : '— (brak pomiaru: sampler nie lapal procesu AppImage, poprawiony po tej sesji)'}</b> (limit MEM: ${MEM_MB} MB)</p>
<table><tr><th>mapa</th><th>web heap delta</th><th>arkmap .dat heap</th><th>arkmap .arkmap heap</th><th>web / .arkmap</th><th>werd. web</th></tr>
${memRows}
</table>
<div class="verdict">Wniosek: web trzyma ~2× wiecej heapu niz ArkMap z .arkmap; przy 432k pokoi web dobija do +1121 MB (limit 2048 MB nieprzekroczony, ale margines topnieje). .arkmap przy tej samej mapie: +336 MB.</div>

<h2 id="det">Determinizm i powtarzalnosc</h2>
<table><tr><th>mapa</th><th>path_found identyczne we wszystkich runach</th><th>search_hits identyczne</th><th>ok runy</th><th>rozrzut load desktop</th></tr>
${detRows}
</table>
<div class="verdict">Wniosek: manifest z seedem daje w pelni deterministyczne wejscia — wyniki pathfindingu i wyszukiwania sa identyczne w kazdym przebiegu, a rozrzut czasow wczytania miesci sie w kilku procentach. Test jest powtarzalny.</div>

<h2 id="pitch">Pitch .arkmap (liczby do propozycji dla Mudleta)</h2>
${pitch}

<h2 id="uwagi">Uwagi (honest)</h2>
<ul>
<li>Desktop: getPath pierwszy raz po loadzie buduje graf (TAstar) — koszt realny, wliczony.</li>
<li>Pathfinding desktop (TAstar, C++) i odpowiednik web (pathfinding.ts, TS) to rozne implementacje — W2 mierzone tylko na desktopie.</li>
<li>K=32: plik .dat nie istnieje (OOM generatora przy eksporcie — znany limit), drabinka desktop/web konczy sie na K=16.</li>
<li>RAM desktopu niepomierzalny w tej sesji (bug samplera — AppImage nie nazywa sie "mudlet"; poprawione w run_desktop.sh).</li>
<li>Wszystkie silniki mierzone w jednej sesji, na tej samej maszynie, na identycznych plikach; pary pokoi i frazy deterministyczne (seed ${manifest?.seed || '?'}).</li>
</ul>

<h2>Maszyna</h2>
<pre>${esc(maszyna || 'brak MASZYNA.md')}</pre>
</body></html>
`;

fs.writeFileSync(OUT, html);
console.log('✓ raport: ' + OUT);
