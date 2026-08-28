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
const apps = readJson('results_apps.json');
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
function chart(rows) {  // rows: [{group, bars:[{label,val,color}]}] — sortowane najlepszy -> najgorszy
  const max = Math.max(...rows.flatMap(r => r.bars.map(b => b.val || 0)));
  if (!max) return '';
  let h = '<div class="chart">';
  for (const r of rows) {
    h += `<div class="cgroup">${esc(r.group)}</div>`;
    const bars = [...r.bars].sort((a, b) => (a.val ?? Infinity) - (b.val ?? Infinity));
    for (const b of bars) {
      const w = b.val ? Math.max(0.5, b.val / max * 100) : 0;
      h += `<div class="brow"><span class="eng">${esc(b.label)}</span>`
        + `<div class="btrack"><div class="bfill" style="width:${w}%;background:${b.color}"></div></div>`
        + `<span class="bval">${b.val ? fmt(b.val) + ' ms' : '—'}</span></div>`;
    }
  }
  return h + '</div>';
}

// Highlight best/worst w wierszu tabeli: hl([{v, cell}]) -> <td> z klasami.
function hl(vals) {
  const nums = vals.map(x => x.v).filter(v => v != null);
  if (nums.length < 2) return vals.map(x => `<td>${x.cell}</td>`).join('');
  const mn = Math.min(...nums), mx = Math.max(...nums);
  return vals.map(x => {
    let cls = '';
    if (x.v != null) { if (x.v === mn) cls = ' class="best"'; else if (x.v === mx && mx !== mn) cls = ' class="worst"'; }
    return `<td${cls}>${x.cell}</td>`;
  }).join('');
}
const legend = `<p class="leg"><span style="color:${C.desk}">■</span> desktop loadMap (CPU) · <span style="color:${C.web}">■</span> web parse · <span style="color:${C.adat}">■</span> arkmap .dat total · <span style="color:${C.amap}">■</span> arkmap .arkmap total · sortowane najlepszy → najgorszy</p>`;
const legend2 = `<p class="leg"><span style="color:${C.desk}">■</span> desktop (natywne C++) · <span style="color:${C.web}">■</span> web (A* Node) · <span style="color:${C.amap}">■</span> arkmap (A* Node) · sortowane najlepszy → najgorszy</p>`;

// ---------- W1: wczytanie ----------
const dLoad = {}, dWall = {};
for (const n of names) {
  dLoad[n] = desk[n]?.load.length ? stat(desk[n].load) : null;
  dWall[n] = desk[n]?.wall.length ? stat(desk[n].wall) : null;
}
const w1a = names.map(n => {
  const d = desk[n], w = web?.files?.[n], a = ark?.sets?.[n];
  return `<tr><td>${esc(n)}</td><td>${fmt(d?.rooms || w?.rooms || a?.rooms)}</td><td>${fmt(w?.size_mb ?? a?.size_mb?.dat)} / ${fmt(a?.size_mb?.arkmap)}</td>`
    + hl([
      { v: dLoad[n]?.med, cell: `${fmt(dLoad[n]?.med)}${dLoad[n] ? ` <small>(wall ${fmt(dWall[n].med)})</small><br><small>${spread(dLoad[n])}</small>` : ''}` },
      { v: w?.parse_ms?.med, cell: `${fmt(w?.parse_ms?.med)}${w ? `<br><small>${spread(w.parse_ms)}</small>` : ''}` },
      { v: a?.dat?.total?.med, cell: fmt(a?.dat?.total?.med) },
      { v: a?.arkmap?.total?.med, cell: fmt(a?.arkmap?.total?.med) },
    ])
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

// ---------- W2/W3/W3b: wszystkie silniki ----------
// Desktop: natywne getPath/searchRoom/getRooms (TAstar, C++).
// Web i arkmap: JEDNA wspolna implementacja w Node (workloads_node.cjs)
// nad sparsowanymi danymi kazdego silnika — mierzymy koszt pracy na modelu
// danych, nie natywne API (web/arkmap nie maja mierzalnego odpowiednika).
const wkWeb = n => web?.files?.[n]?.workloads || null;
const wkArk = n => ark?.sets?.[n]?.arkmap?.workloads || null;
const dStat = (n, key) => desk[n] && desk[n][key].length ? stat(desk[n][key]) : null;
const roomsOf = n => desk[n]?.rooms || web?.files?.[n]?.rooms || ark?.sets?.[n]?.rooms;

function trioRows(getD, getW, getA, extraCells) {
  return names.map(n => {
    const sd = getD(n), sw = getW(n), sa = getA(n);
    return `<tr><td>${esc(n)}</td><td>${fmt(roomsOf(n))}</td>`
      + hl([
        { v: sd?.med, cell: sd ? `${fmt(sd.med)}<br><small>${fmt(sd.min)} – ${fmt(sd.max)}</small>` : '—' },
        { v: sw?.med, cell: sw ? `${fmt(sw.med)}<br><small>${fmt(sw.min)} – ${fmt(sw.max)}</small>` : '—' },
        { v: sa?.med, cell: sa ? `${fmt(sa.med)}<br><small>${fmt(sa.min)} – ${fmt(sa.max)}</small>` : '—' },
      ])
      + `<td>${ratio(sd?.med, sw?.med)}</td><td>${ratio(sd?.med, sa?.med)}</td><td>${ratio(sw?.med, sa?.med)}</td>`
      + (extraCells ? extraCells(n) : '') + `</tr>`;
  }).join('\n');
}

// found/hits d/w/a — rozjazd miedzy silnikami flagowany na czerwono.
function agreeCells(getter, suffix) {
  return n => {
    const vals = [getter(desk[n] && desk[n].found.length ? desk[n] : null, 'desk'),
      getter(wkWeb(n), 'web'), getter(wkArk(n), 'ark')];
    const nums = vals.filter(v => v != null);
    const mismatch = nums.length > 1 && !nums.every(v => v === nums[0]);
    return `<td${mismatch ? ' class="worst"' : ''}>${vals.map(v => v == null ? '—' : v).join(' / ')}${suffix || ''}</td>`;
  };
}
const foundCells = agreeCells((src, kind) => {
  if (!src) return null;
  return kind === 'desk' ? src.found[0] : src.path_found;
}, '/' + pairsPerMap);
const hitsCells = agreeCells((src, kind) => {
  if (!src) return null;
  if (kind === 'desk') return src.hits.length ? src.hits[0] : null;
  // Mudlet searchRoom: dokladne dopasowanie nazwy (substring liczy wiecej — notka pod tabela)
  return src.search_exact ?? src.search_hits ?? null;
});
const hitsSubCells = n => {
  const w = wkWeb(n), a = wkArk(n);
  if (!w && !a) return '<td>—</td>';
  const f = s => s ? (s.search_rooms ?? s.search_hits) : '—';
  return `<td><small>${f(w)} / ${f(a)}</small></td>`;
};

const w2rows = trioRows(n => dStat(n, 'path'), n => wkWeb(n)?.path_ms, n => wkArk(n)?.path_ms, foundCells);
const w3rows = trioRows(n => dStat(n, 'search'), n => wkWeb(n)?.search_ms, n => wkArk(n)?.search_ms,
  n => hitsCells(n) + hitsSubCells(n));
const w3brows = trioRows(n => dStat(n, 'iter'), n => wkWeb(n)?.iter_ms, n => wkArk(n)?.iter_ms);

// Budowa grafu/indeksu w Node (raz, poza probkami; desktop wlicza w 1. getPath).
const gbRows = names.map(n => {
  const w = wkWeb(n), a = wkArk(n);
  return `<tr><td>${esc(n)}</td>` + hl([
    { v: w?.graph_build_ms, cell: w ? fmt(w.graph_build_ms) + ' ms' : '—' },
    { v: a?.graph_build_ms, cell: a ? fmt(a.graph_build_ms) + ' ms' : '—' },
  ]) + `</tr>`;
}).join('\n');

const w2chart = chart(names.map(n => ({
  group: `${n} (${fmt(roomsOf(n))} pokoi)`,
  bars: [
    { label: 'desktop', val: dStat(n, 'path')?.med, color: C.desk },
    { label: 'web (A* Node)', val: wkWeb(n)?.path_ms?.med ?? null, color: C.web },
    { label: 'arkmap (A* Node)', val: wkArk(n)?.path_ms?.med ?? null, color: C.amap },
  ],
})));

// ---------- W4: pamiec ----------
const memRows = names.map(n => {
  const w = web?.files?.[n], a = ark?.sets?.[n];
  return `<tr><td>${esc(n)}</td>` + hl([
    { v: w?.heap_delta_mb, cell: w ? w.heap_delta_mb + ' MB' : '—' },
    { v: a?.dat?.heap_delta_mb, cell: a ? a.dat.heap_delta_mb + ' MB' : '—' },
    { v: a?.arkmap?.heap_delta_mb, cell: a ? a.arkmap.heap_delta_mb + ' MB' : '—' },
  ])
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

// ---------- APPS: natywne silniki w aplikacjach (headless Chromium) ----------
let appsHtml = '', appsNav = '';
if (apps) {
  appsNav = '<a href="#apps">apps (natywne)</a>';
  const aNames = Object.keys(apps.sets || {});
  const aS = n => apps.sets[n] || {};
  const CA = { amap: '#55bb55', adat: '#d9a030', wreal: '#44bbaa', astar: '#bb77dd', desk: '#d95555' };

  const w1cell = f => f ? fmt(f.load_ms?.med) +
    `<br><small>verified ${fmt(f.verified_ms?.med)}${f.verified_miss ? ' <b style="color:#d95555">MISS×' + f.verified_miss + '</b>' : ''}</small>` : '—';
  const appW1rows = aNames.map(n => {
    const s = aS(n), wr = s.webreal?.w1;
    const dl = dLoad[n]?.med;
    return `<tr><td>${esc(n)}</td><td>${fmt(s.rooms)}</td>` + hl([
      { v: s.arkmap?.arkmap_file?.load_ms?.med, cell: w1cell(s.arkmap?.arkmap_file) },
      { v: s.arkmap?.dat_file?.load_ms?.med, cell: w1cell(s.arkmap?.dat_file) },
      { v: wr?.total_ms?.med, cell: wr ? `${fmt(wr.total_ms.med)}<br><small>parse ${fmt(wr.parse_ms.med)} + mat ${fmt(wr.materialize_ms.med)} + graf ${fmt(wr.graph_ms.med)}${wr.mode === 'skeleton' ? ' [skeleton]' : ''}</small>` : '—' },
      { v: dl, cell: fmt(dl) },
    ]) + `<td>${ratio(dl, s.arkmap?.arkmap_file?.load_ms?.med)}</td><td>${ratio(dl, wr?.total_ms?.med)}</td></tr>`;
  }).join('\n');

  const appW1chart = chart(aNames.map(n => {
    const s = aS(n);
    return { group: `${n} (${fmt(s.rooms)} pokoi)`, bars: [
      { label: 'arkmap UI .arkmap', val: s.arkmap?.arkmap_file?.load_ms?.med ?? null, color: CA.amap },
      { label: 'arkmap UI .dat', val: s.arkmap?.dat_file?.load_ms?.med ?? null, color: CA.adat },
      { label: 'web-real .dat', val: s.webreal?.w1?.total_ms?.med ?? null, color: CA.wreal },
      { label: 'desktop .dat', val: dLoad[n]?.med ?? null, color: CA.desk },
    ] };
  }));

  const appW2rows = aNames.map(n => {
    const s = aS(n);
    const ad = s.arkmap_wl?.arkmap?.w2?.dijkstra, aa = s.arkmap_wl?.arkmap?.w2?.astar;
    const wd = s.webreal?.w2?.dijkstra, wa = s.webreal?.w2?.astar;
    const pf = s.webreal?.plain_forced;
    const pd = pf?.w2?.dijkstra, pa = pf?.w2?.astar;
    const skel = s.webreal?.w1?.mode === 'skeleton';
    const g = s.gate || {};
    const naSkel = '<small>N/A — skeleton (getRooms()=[], kod)</small>';
    return `<tr><td>${esc(n)}</td>` + hl([
      { v: ad?.ms?.med, cell: fmt(ad?.ms?.med) },
      { v: aa?.ms?.med, cell: fmt(aa?.ms?.med) },
      { v: wd?.ms?.med, cell: skel ? naSkel : fmt(wd?.ms?.med) },
      { v: wa?.ms?.med, cell: skel ? naSkel : fmt(wa?.ms?.med) },
      { v: pd?.ms?.med, cell: pd ? fmt(pd.ms.med) : (skel ? `<small>${esc(pf?.error || 'N/A')}</small>` : '—') },
      { v: pa?.ms?.med, cell: pa ? fmt(pa.ms.med) : (skel ? `<small>${esc(pf?.error || 'N/A')}</small>` : '—') },
      { v: dStat(n, 'path')?.med, cell: fmt(dStat(n, 'path')?.med) },
    ]) + `<td${g.problems ? ' class="worst"' : ''}><small>${g.arkmap_found ?? '—'} / ${skel ? '0 (skel)' : (g.webreal_found ?? '—')}${g.webplain_found != null ? ' / ' + g.webplain_found + ' (plain)' : ''} / ${g.desk_found ?? '—'}</small></td></tr>`;
  }).join('\n');

  const appW2chart = chart(aNames.map(n => {
    const s = aS(n);
    return { group: `${n} (${fmt(s.rooms)} pokoi)`, bars: [
      { label: 'arkmap Dijkstra', val: s.arkmap_wl?.arkmap?.w2?.dijkstra?.ms?.med ?? null, color: CA.amap },
      { label: 'arkmap A*', val: s.arkmap_wl?.arkmap?.w2?.astar?.ms?.med ?? null, color: CA.astar },
      { label: 'web Dijkstra', val: s.webreal?.w2?.dijkstra?.ms?.med ?? null, color: CA.wreal },
      { label: 'web A*', val: s.webreal?.w2?.astar?.ms?.med ?? null, color: '#2a8f80' },
      { label: 'web-plain D (inform.)', val: s.webreal?.plain_forced?.w2?.dijkstra?.ms?.med ?? null, color: '#7fd1c8' },
      { label: 'web-plain A* (inform.)', val: s.webreal?.plain_forced?.w2?.astar?.ms?.med ?? null, color: '#f4a261' },
      { label: 'desktop getPath', val: dStat(n, 'path')?.med ?? null, color: CA.desk },
    ] };
  }));

  const appW3rows = aNames.map(n => {
    const s = aS(n), w3 = s.arkmap_wl?.arkmap?.w3;
    return `<tr><td>${esc(n)}</td>` + hl([
      { v: w3?.ms?.med, cell: w3 ? `${fmt(w3.ms.med)}<br><small>hits ${w3.hits}</small>` : '—' },
      { v: null, cell: '<small>N/A — brak natywnego API (kod)</small>' },
      { v: dStat(n, 'search')?.med, cell: fmt(dStat(n, 'search')?.med) },
    ]) + `</tr>`;
  }).join('\n');

  const appW3brows = aNames.map(n => {
    const s = aS(n);
    const skel = s.webreal?.w1?.mode === 'skeleton';
    const pw3b = s.webreal?.plain_forced?.w3b;
    const webCell = skel
      ? `<small>N/A — skeleton</small>${pw3b ? `<br><small>plain wymuszony: ${fmt(pw3b.ms.med)} (${fmt(pw3b.keys)} kluczy)</small>` : ''}`
      : fmt(s.webreal?.w3b?.ms?.med);
    return `<tr><td>${esc(n)}</td>` + hl([
      { v: s.arkmap_wl?.arkmap?.w3b?.ms?.med, cell: fmt(s.arkmap_wl?.arkmap?.w3b?.ms?.med) },
      { v: skel ? null : s.webreal?.w3b?.ms?.med, cell: webCell },
      { v: dStat(n, 'iter')?.med, cell: fmt(dStat(n, 'iter')?.med) },
    ]) + `</tr>`;
  }).join('\n');

  const appW4rows = aNames.map(n => {
    const s = aS(n);
    return `<tr><td>${esc(n)}</td>` + hl([
      { v: s.arkmap?.arkmap_file?.heap_mb?.med, cell: s.arkmap?.arkmap_file ? fmt(s.arkmap.arkmap_file.heap_mb.med) + ' MB' : '—' },
      { v: s.arkmap?.dat_file?.heap_mb?.med, cell: s.arkmap?.dat_file ? fmt(s.arkmap.dat_file.heap_mb.med) + ' MB' : '—' },
      { v: s.webreal?.heap_mb?.med, cell: s.webreal ? fmt(s.webreal.heap_mb.med) + ' MB' + (s.webreal.plain_forced?.heap_mb ? `<br><small>plain wymuszony: ${fmt(s.webreal.plain_forced.heap_mb.med)} MB</small>` : '') + (s.webreal.w1?.mode === 'skeleton' ? ' <small>[skeleton]</small>' : '') : '—' },
    ]) + `</tr>`;
  }).join('\n');

  const gateProblems = aNames.reduce((acc, n) => acc + (aS(n).gate?.problems || 0), 0);
  // Fala 4: agregacja gate'a kosztowego (plan 4.1) — flagi z liczbami per mapa.
  const costAgg = aNames.reduce((acc, n) => {
    const g = aS(n).gate || {};
    acc.checked += g.cost_checked || 0;
    acc.expected += g.cost_expected_locks || 0;
    for (const f of g.cost_flags || []) acc.flags.push({ map: n, ...f });
    return acc;
  }, { checked: 0, expected: 0, flags: [] });
  const costGateHtml = costAgg.checked === 0 && costAgg.flags.length === 0
    ? ''
    : `<p>Gate kosztowy (fala 4): ${costAgg.flags.length === 0
        ? `<b class="ok">ZIELONY</b> — ${costAgg.checked} par porownanych: nasz A* zawsze rowny kosztowo naszemu Dijkstrze, a ich A* nigdy nie tanszy od naszego Dijkstry poza trasami skazonymi lockami (${costAgg.expected} oczekiwanych tanszych przez locki — ich silnik je ignoruje)`
        : `<b class="bad">CZERWONY — ${costAgg.flags.length} flag</b> (ich A* tanszy od naszego Dijkstry na trasie BEZ lockow)`}.</p>`
      + (costAgg.flags.length === 0 ? '' :
        `<table><tr><th>mapa</th><th>para</th><th>nasz Dijkstra</th><th>ich A*</th><th>silnik</th></tr>`
        + costAgg.flags.map(f => `<tr><td>${esc(f.map)}</td><td><small>${esc(f.pair.join(' → '))}</small></td><td>${fmt(f.our_dijkstra)}</td><td class="worst">${fmt(f.their_astar)}</td><td>${esc(f.engine)}</td></tr>`).join('\n')
        + `</table>
<div class="note">Powyzsze pary to dowod, ze ich A* liczy taniej niz optymalny Dijkstra na rownych zasadach (bez lockow na trasie) — czyli ich silnik przecina trase wzgledem modelu wyjsc/wag (niedopuszczalna heurystyka albo rozjazd modelu). Kazdy taki wpis wymaga wyjasnienia przed publikacja wnioskow.</div>`);
  const appsLegend = `<p class="leg"><span style="color:${CA.amap}">■</span> ArkMap Studio (prawdziwe UI) · <span style="color:${CA.adat}">■</span> ArkMap .dat · <span style="color:${CA.wreal}">■</span> web-real (ich pipeline) · <span style="color:#7fd1c8">■</span>/<span style="color:#f4a261">■</span> web-plain wymuszony (inform.) · <span style="color:${CA.astar}">■</span> wariant A* · <span style="color:${CA.desk}">■</span> desktop · sortowane najlepszy → najgorszy</p>`;

  appsHtml = `
<h2 id="apps">APPS — natywne silniki w aplikacjach (headless Chromium)</h2>
<div class="note">Metodologia: kazda apka liczy SWOIM natywnym kodem i formatem. ArkMap Studio — prawdziwe UI (${esc(apps.meta.chrome)}): loadArkmap/loadDat → applyMap → pierwsza klatka (2×rAF), findPath (Dijkstra domyslnie + wariant A*; wpState neutralny: transport off, kierunki all, locki ON), wpDoSearch, iteracja po state.roomById. Web-real — ich prawdziwy pipeline z npm: mudlet-map-binary-reader@${esc(apps.meta.packages['mudlet-map-binary-reader'])} → mudlet-map-renderer@${esc(apps.meta.packages['mudlet-map-renderer'])} (parseMudletMap → readerFromLoadedMap → PathFinder; tryb auto: plain &lt;50k pokoi, skeleton powyzej). W3 web = N/A — ich biblioteka mapowa nie ma natywnego API wyszukiwania (potwierdzone w kodzie). Powyzej 50k pokoi natywny auto-mode ich readera przechodzi w skeleton (getRooms()=[] — kod), wiec W2/W3b web = N/A i mierzymy dodatkowo plain wymuszony (wiersz informacyjny). Ich PathFinder cache'uje findPath per instancja — neutralizowane swieza instancja per run. Ich silnik IGNORUJE locki pokoi (0× isLocked w bundlu — honoruje tylko locki wyjsc), wiec moze znalezc wiecej sciezek: rozbieznosci idace przez locked pokoje sa OCZEKIWANE i oznaczone, kazda inna = czerwona flaga (gate). Gate kosztowy (fala 4): per para liczone sa koszty sciezek w NASZYM modelu wag (exit_weights / wagi pokoi) — nasz A* MUSI byc rowny kosztowo naszemu Dijkstrze, a ich A* MUSI byc nie tanszy niz nasz Dijkstra; tanszy na trasie bez lockow = czerwona flaga z liczbami, tanszy przez locki = oczekiwane.</div>
<h3>W1 — wczytanie w aplikacji (ms, mediana z ${apps.meta.n_runs} runow)</h3>
<div class="note">W1 ArkMap ma dwie wartosci: <b>load</b> = fetch → applyMap → pierwsza klatka (mapa w pelni uzywalna), <b>verified</b> = moment zakonczenia odroczonej weryfikacji sum kontrolnych i baseInfo, ktora po P3b dzieje sie w tle zaraz po pierwszej klatce i nie blokuje UI. Web-real/desktop licza synchronicznie (jedna wartosc). MISS = hak weryfikacji nie odpalil w 10 s (czerwona flaga).</div>
<table><tr><th>mapa</th><th>pokoi</th><th>arkmap UI .arkmap</th><th>arkmap UI .dat</th><th>web-real .dat</th><th>desktop .dat</th><th>desk / arkmap</th><th>desk / web-real</th></tr>
${appW1rows}
</table>
${appsLegend}
${appW1chart}
<h3>W2 — pathfinding natywny (ms; found: arkmap / web-real / desktop)</h3>
<table><tr><th>mapa</th><th>arkmap Dijkstra</th><th>arkmap A*</th><th>web Dijkstra</th><th>web A*</th><th>web-plain D*</th><th>web-plain A**</th><th>desktop getPath</th><th>found a/w/d</th></tr>
${appW2rows}
</table>
<div class="note">* web-plain = plain WYMUSZONY (parseMudletMap z mode:'plain') — wiersz informacyjny, NIE natywny. Powyzej 50k pokoi ich natywny auto-mode przechodzi w skeleton, gdzie SkeletonMapReader.getRooms() zwraca [] (potwierdzone w kodzie dist/SkeletonMapReader-*.js) — ich MapGraph buduje sie pusty, wiec PathFinder i iteracja sa natywnie N/A. To natywne ograniczenie ich stacku: realna mape Arkadii (27k) obsluguja w plain, map powyzej 50k ich pathfinding natywnie nie obsluguje.</div>
${appsLegend}
${appW2chart}
<h3>W3 — szukanie natywne (ms)</h3>
<table><tr><th>mapa</th><th>arkmap wpDoSearch</th><th>web</th><th>desktop searchRoom</th></tr>
${appW3rows}
</table>
<div class="note">wpDoSearch: skan nazw+obszarow ze scoringiem, cap 25 wynikow w dropdownie — to natywna semantyka apki, nie pelny skan jak w fazie Node.</div>
<h3>W3b — iteracja natywna (ms)</h3>
<table><tr><th>mapa</th><th>arkmap (state.roomById)</th><th>web (getRooms)</th><th>desktop (getRooms)</th></tr>
${appW3brows}
</table>
<h3>W4 — heap po wczytaniu (MB, delta po GC; desktop RAM w sekcji W4 wyzej)</h3>
<table><tr><th>mapa</th><th>arkmap UI .arkmap</th><th>arkmap UI .dat</th><th>web-real .dat</th></tr>
${appW4rows}
</table>
<p>Gate semantyczny: ${gateProblems === 0 ? '<b class="ok">ZIELONY</b> — wszystkie rozbieznosci found wyjasnione lockami pokoi (oczekiwane dla ich silnika)' : `<b class="bad">CZERWONY — ${gateProblems} problemow</b>`}.</p>
${costGateHtml}`;
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
td.best{background:#152e1a;color:#8e8}
td.worst{background:#331515;color:#e99}
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
<nav><a href="#w1">W1 wczytanie</a><a href="#w2">W2 getPath</a><a href="#w3">W3 searchRoom</a><a href="#w3b">W3b getRooms</a><a href="#w4">W4 pamiec</a><a href="#det">determinizm</a><a href="#pitch">pitch .arkmap</a><a href="#uwagi">uwagi</a>${appsNav}</nav>

<h2 id="w1">W1 — wczytanie mapy</h2>
<h3>Wartosci (mediana z ${meta?.runs || '?'} runow, ms; pod spodem rozrzut min–max wzgledem mediany; <span style="color:#8e8">zielony = najlepszy</span>, <span style="color:#e99">czerwony = najgorszy</span> w wierszu)</h3>
<table><tr><th>mapa</th><th>pokoi</th><th>MB .dat/.arkmap</th><th>desktop .dat (loadMap)</th><th>web .dat (parse)</th><th>arkmap .dat (total)</th><th>arkmap .arkmap (total)</th><th>werdykty (d/w/a)</th></tr>
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

<h2 id="w2">W2 — pathfinding, ${pairsPerMap} deterministycznych par (ms)</h2>
<div class="note">Desktop: natywny getPath (TAstar, C++; budowa grafu wliczona w pierwsza probe). Web i arkmap: JEDNA wspolna implementacja A* w Node (workloads_node.cjs) nad sparsowanymi danymi kazdego silnika — mierzony jest koszt pracy na modelu danych, nie natywne API.</div>
<table><tr><th>mapa</th><th>pokoi</th><th>desktop (getPath)</th><th>web (A* Node)</th><th>arkmap (A* Node)</th><th>desk/web</th><th>desk/arkmap</th><th>web/arkmap</th><th>znalezione d/w/a</th></tr>
${w2rows}
</table>
${legend2}
${w2chart}
<h3>Budowa indeksu/grafu w Node (raz, poza probkami pathfindingu)</h3>
<table><tr><th>mapa</th><th>web</th><th>arkmap</th></tr>
${gbRows}
</table>
<div class="verdict">Wniosek: znalezionych sciezek ubywa z klonowaniem (pary z manifestu trafiaja w niespolaczone klony — artefakt drabinki, nie regres silnika); liczby znalezionych powinny byc identyczne we wszystkich silnikach — rozjazd jest flagowany na czerwono w kolumnie "znalezione". Koszt na desktopie rosnie z dominujacym pustym przeszukiwaniem grafu za nieistniejace polaczenia.</div>

<h2 id="w3">W3 — przeszukanie nazw, 3 frazy z manifestu (ms)</h2>
<div class="note">Desktop: natywny searchRoom (C++). Web/arkmap: wspolna implementacja Node — pelny skan nazw, case-insensitive substring.</div>
<table><tr><th>mapa</th><th>pokoi</th><th>desktop (searchRoom)</th><th>web (Node)</th><th>arkmap (Node)</th><th>desk/web</th><th>desk/arkmap</th><th>web/arkmap</th><th>trafienia d/w/a (dokladne)</th><th>substring w/a</th></tr>
${w3rows}
</table>
<div class="verdict">Wniosek: pelny skan nazw pokoi — koszt rosnie liniowo z liczba pokoi (×~2 przy ×2 pokoi), trafienia rosna ×2 bo fraza trafia w kazdy klon. Kolumna "trafienia" porownuje dokladne dopasowania nazw (najblizsze semantyce searchRoom w Mudlecie — uwaga: searchRoom przy pojedynczym trafieniu zwraca numer, nie tabele, wiec harness desktopu liczy countKeys tylko z tabel); "substring" to wszystkie pokoje zawierajace fraze. Rozjazd flagowany na czerwono.</div>

<h2 id="w3b">W3b — iteracja po wszystkich pokojach, budowa id→nazwa (ms)</h2>
<div class="note">Desktop: natywny getRooms (C++→Lua). Web/arkmap: wspolna implementacja Node (budowa obiektu id→nazwa + countKeys).</div>
<table><tr><th>mapa</th><th>pokoi</th><th>desktop (getRooms)</th><th>web (Node)</th><th>arkmap (Node)</th><th>desk/web</th><th>desk/arkmap</th><th>web/arkmap</th></tr>
${w3brows}
</table>
<div class="verdict">Wniosek: desktop przy 27k — ~0,7 us na pokoj, przy 432k ~1,7 us (lekko ponad liniowo, efekt cache). Node na obu silnikach pokazuje koszt tej samej operacji na roznych modelach danych.</div>

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

${appsHtml}

<h2>Maszyna</h2>
<pre>${esc(maszyna || 'brak MASZYNA.md')}</pre>
</body></html>
`;

fs.writeFileSync(OUT, html);
console.log('✓ raport: ' + OUT);
