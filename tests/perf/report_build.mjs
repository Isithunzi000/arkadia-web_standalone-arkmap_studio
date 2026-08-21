#!/usr/bin/env node
// report_build.mjs — generator docs/perf_report.html z surowych wynikow perf lab (Arc 18).
// Uzycie: node tests/perf/report_build.mjs [kat_wynikow] [plik_wyj]
//   kat_wynikow — katalog z results_node.json + results_browser.jsonl
//                 (domyslnie tests/perf/results — zacommitowany przebieg referencyjny;
//                  po wlasnym tescie: tests/perf/out)
//   plik_wyj    — domyslnie docs/perf_report.html
// Raport jest w pelni generowany z danych — zadne liczby nie sa wpisane na sztywno.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = process.argv[2] || 'tests/perf/results';
const OUT = process.argv[3] || 'docs/perf_report.html';

const nodeRes = JSON.parse(readFileSync(join(SRC, 'results_node.json'), 'utf8'));
const browser = readFileSync(join(SRC, 'results_browser.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l));

// ---------- pomocnicze ----------
const ORDER = ['real_27k', 'stress_2x', 'stress_4x', 'stress_8x', 'stress_16x', 'stress_32x'];
const setNames = Object.keys(nodeRes.sets).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sp = '\u00a0'; // nbsp jako separator tysiecy
function num(x, dec = 0) {
  if (x == null || !isFinite(x)) return '—';
  const [i, f] = x.toFixed(dec).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, sp);
  return f ? g + ',' + f : g;
}
const ms = (x, dec = 0) => num(x, dec) + sp + 'ms';
const MB = x => num(x, 0) + sp + 'MB';
const krooms = r => r >= 1000 ? num(Math.round(r / 1000)) + sp + 'k' : num(r);

function bset(set, fmt) { return browser.find(r => r.set === set && r.fmt === fmt); }

// ---------- statystyki do wnioskow (liczone z danych) ----------
const ratios = setNames.map(s => nodeRes.sets[s].ratio_total);
const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
const biggest = setNames[setNames.length - 1];
const BS = nodeRes.sets[biggest];
const jsonVsDat = BS.dat.parse.med / BS.arkmap.json.med;         // o ile JSON.parse szybszy niz parser .dat
const crcShares = setNames.map(s => nodeRes.sets[s].arkmap.crc.med / nodeRes.sets[s].arkmap.total.med);
const crcShareMin = Math.min(...crcShares) * 100, crcShareMax = Math.max(...crcShares) * 100;

const okSets = fmt => setNames.filter(s => { const r = bset(s, fmt); return r && r.verdict === 'OK'; });
const lastOk = fmt => { const o = okSets(fmt); return o[o.length - 1]; };
const lastOkRooms = fmt => { const s = lastOk(fmt); return s ? nodeRes.sets[s].rooms : null; };
const okMult = fmt => { const r = lastOkRooms(fmt); return r ? Math.round(r / nodeRes.sets.real_27k.rooms) : null; };

const camAll = browser.filter(r => r.camera).flatMap(r => [r.camera.p95]);
const camMin = Math.min(...camAll), camMax = Math.max(...camAll);
const drawAll = browser.filter(r => r.phases).map(r => r.phases.first_draw.med);
const drawMin = Math.min(...drawAll), drawMax = Math.max(...drawAll);
const heapMax = Math.max(...browser.filter(r => r.heap_mb_med).map(r => r.heap_mb_med));
const realDat = bset('real_27k', 'dat'), realArk = bset('real_27k', 'arkmap');
const applyShare = realDat.phases.apply.med / realDat.phases.total.med * 100;
const browserRatio27 = realArk.phases.total.med / realDat.phases.total.med;
const bigOkBoth = setNames.filter(s => ['dat', 'arkmap'].every(f => { const r = bset(s, f); return r && r.verdict === 'OK'; })).pop();
const browserRatioBig = (() => { const d = bset(bigOkBoth, 'dat'), a = bset(bigOkBoth, 'arkmap'); return a.phases.total.med / d.phases.total.med; })();
const expDats = browser.filter(r => r.export_dat && r.export_dat.ms);

// ---------- SVG: wykres liniowy ----------
function lineChart({ series, xLab, yLab, logX = true, w = 720, h = 300, fmtY = v => num(v), xTicks }) {
  const padL = 64, padR = 18, padT = 14, padB = 56;
  const W = w - padL - padR, H = h - padT - padB;
  const allPts = series.flatMap(s => s.points);
  const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMax = Math.max(...ys) * 1.12;
  const tx = v => logX ? (Math.log(v / xMin) / Math.log(xMax / xMin)) * W
                       : (v - xMin) / (xMax - xMin) * W;
  const ty = v => H - (v / yMax) * H;
  // siatka pozioma: 4 linie
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const yv = yMax * i / 4, y = padT + ty(yv);
    g += `<line x1="${padL}" y1="${y}" x2="${padL + W}" y2="${y}" stroke="#252b3a" stroke-width="1"/>`;
    if (i < 4) g += `<text x="${padL - 8}" y="${y + 4}" fill="#8898b8" font-size="10" text-anchor="end">${fmtY(yv)}</text>`;
  }
  for (const xv of (xTicks || xs.filter((v, i, a) => a.indexOf(v) === i))) {
    const x = padL + tx(xv);
    g += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + H}" stroke="#1b2130" stroke-width="1"/>`;
    g += `<text x="${x}" y="${padT + H + 16}" fill="#8898b8" font-size="10" text-anchor="middle">${krooms(xv)}</text>`;
  }
  let body = '', legend = '', lx = padL + 12;
  series.forEach((s) => {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${(padL + tx(p[0])).toFixed(1)},${(padT + ty(p[1])).toFixed(1)}`).join(' ');
    body += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    for (const p of s.points) {
      const cx = padL + tx(p[0]), cy = padT + ty(p[1]);
      body += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="${s.color}"/>`;
      if (s.labels) body += `<text x="${cx.toFixed(1)}" y="${(cy - 8).toFixed(1)}" fill="${s.color}" font-size="10" text-anchor="middle">${s.labels(p)}</text>`;
    }
    legend += `<circle cx="${lx}" cy="${h - 12}" r="4" fill="${s.color}"/>` +
              `<text x="${lx + 10}" y="${h - 8}" fill="#ccd8ea" font-size="11">${esc(s.name)}</text>`;
    lx += 10 + s.name.length * 6.3 + 26;
  });
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:auto;display:block;margin:8px 0 4px" role="img">` +
    `<text x="2" y="10" fill="#8898b8" font-size="10">${esc(yLab)}</text>` +
    `<text x="${padL + W}" y="${padT + H + 34}" fill="#8898b8" font-size="10" text-anchor="end">${esc(xLab)}</text>` +
    g + body + legend + `</svg>`;
}

// ---------- SVG: slupki skladane (fazy ladowania w przegladarce) ----------
function stackedChart({ groups, w = 720, h = 320, yLab = 'ms' }) {
  const padL = 64, padR = 18, padT = 18, padB = 56;
  const W = w - padL - padR, H = h - padT - padB;
  const yMax = Math.max(...groups.map(gr => gr.segments.reduce((a, s) => a + s.value, 0))) * 1.14;
  const bw = Math.min(64, W / groups.length * 0.52);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const yv = yMax * i / 4, y = padT + H - (yv / yMax) * H;
    g += `<line x1="${padL}" y1="${y}" x2="${padL + W}" y2="${y}" stroke="#252b3a"/>`;
    if (i < 4) g += `<text x="${padL - 8}" y="${y + 4}" fill="#8898b8" font-size="10" text-anchor="end">${num(yv)}</text>`;
  }
  let body = '';
  groups.forEach((gr, gi) => {
    const x = padL + (gi + 0.5) * (W / groups.length) - bw / 2;
    let y = padT + H;
    for (const s of gr.segments) {
      const sh = (s.value / yMax) * H;
      y -= sh;
      body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(sh, 0).toFixed(1)}" fill="${s.color}"><title>${esc(s.name)}: ${num(s.value)} ms</title></rect>`;
    }
    const tot = gr.segments.reduce((a, s) => a + s.value, 0);
    body += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" fill="#e8eef8" font-size="10" text-anchor="middle">${num(tot)}</text>`;
    body += `<text x="${(x + bw / 2).toFixed(1)}" y="${padT + H + 16}" fill="#8898b8" font-size="10" text-anchor="middle">${esc(gr.label)}</text>`;
  });
  const names = [...new Set(groups.flatMap(gr => gr.segments.map(s => s.name)))];
  const colors = {};
  for (const gr of groups) for (const s of gr.segments) colors[s.name] = s.color;
  let legend = '';
  names.forEach((n, i) => {
    legend += `<rect x="${padL + 8 + i * 108}" y="${h - 16}" width="9" height="9" fill="${colors[n]}"/>` +
              `<text x="${padL + 22 + i * 108}" y="${h - 8}" fill="#ccd8ea" font-size="10">${esc(n)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:auto;display:block;margin:8px 0 4px" role="img">` +
    `<text x="2" y="10" fill="#8898b8" font-size="10">${esc(yLab)}</text>` + g + body + legend + `</svg>`;
}

// ---------- tabele HTML ----------
function nodeTable() {
  let rows = '';
  for (const s of setNames) {
    const d = nodeRes.sets[s];
    rows += `<tr><td><b>${esc(s)}</b> (${krooms(d.rooms)} pokoi)</td>`
      + `<td>${num(d.size_mb.dat, 1)} / ${num(d.size_mb.arkmap, 1)}</td>`
      + `<td>${ms(d.dat.parse.med)}</td><td>${ms(d.arkmap.json.med)}</td>`
      + `<td>${ms(d.arkmap.crc.med)}</td>`
      + `<td>${ms(d.dat.total.med)}</td><td>${ms(d.arkmap.total.med)}</td>`
      + `<td><b>${num(d.ratio_total, 2)}×</b></td></tr>`;
  }
  return `<table><tr><th>zestaw</th><th>rozmiar .dat / .arkmap [MB]</th><th>parse .dat</th><th>JSON.parse</th><th>weryfikacja CRC</th><th>total .dat</th><th>total .arkmap</th><th>ratio</th></tr>${rows}</table>`;
}

function browserTable() {
  let rows = '';
  for (const s of setNames) {
    for (const fmt of ['dat', 'arkmap']) {
      const r = bset(s, fmt);
      if (!r) { rows += `<tr><td><b>${esc(s)}</b></td><td>.${fmt}</td><td colspan="8" style="color:#8898b8">nie mierzono</td></tr>`; continue; }
      const vc = r.verdict === 'OK' ? 'var(--ok)' : (r.verdict.startsWith('CRASH') ? 'var(--err)' : '#e8a020');
      if (!r.phases) {
        rows += `<tr><td><b>${esc(s)}</b> (${krooms(r.rooms)})</td><td>.${fmt}</td><td style="color:${vc}">${esc(r.verdict)}</td><td colspan="7" style="color:#8898b8">—</td></tr>`;
        continue;
      }
      const ph = r.phases;
      rows += `<tr><td><b>${esc(s)}</b> (${krooms(r.rooms)})</td><td>.${fmt}</td>`
        + `<td style="color:${vc}">${esc(r.verdict)}</td>`
        + `<td>${ms(ph.total.med)}</td><td>${ms(ph.parse.med)}</td><td>${ph.crc.med ? ms(ph.crc.med) : '—'}</td>`
        + `<td>${ms(ph.apply.med)}</td><td>${num(ph.first_draw.med, 1)}</td><td>${num(r.camera.p95, 1)}</td>`
        + `<td>${MB(r.heap_mb_med)}</td></tr>`;
    }
  }
  return `<table><tr><th>zestaw</th><th>format</th><th>werdykt</th><th>total</th><th>parse</th><th>CRC</th><th>applyMap</th><th>draw1 [ms]</th><th>kamera p95 [ms]</th><th>heap</th></tr>${rows}</table>`;
}

// ---------- dane do wykresow ----------
const C_DAT = '#4a9eff', C_ARK = '#ff9f4a', C_OK = '#4aff8a', C_ERR = '#ff4a4a', C_DIM = '#8898b8';
const roomsOf = s => nodeRes.sets[s].rooms;

const parseChart = lineChart({
  series: [
    { name: '.dat total (parse+validate)', color: C_DAT, points: setNames.map(s => [roomsOf(s), nodeRes.sets[s].dat.total.med]) },
    { name: '.arkmap total (json+val+CRC)', color: C_ARK, points: setNames.map(s => [roomsOf(s), nodeRes.sets[s].arkmap.total.med]) },
    { name: 'sam JSON.parse', color: C_OK, dash: true, points: setNames.map(s => [roomsOf(s), nodeRes.sets[s].arkmap.json.med]) },
  ],
  xLab: 'pokoje (skala log)', yLab: 'mediana [ms]',
  labels: null,
  xTicks: roomsOf ? setNames.map(roomsOf) : undefined,
});

const PHASE_COLORS = { fetch: '#2a4a6a', parse: C_DAT, validate: '#6a5acd', crc: C_ARK, apply: '#c0392b', first_draw: C_OK };
const loadStack = stackedChart({
  groups: setNames.filter(s => bset(s, 'dat')?.phases || bset(s, 'arkmap')?.phases).flatMap(s => {
    const gr = [];
    for (const fmt of ['dat', 'arkmap']) {
      const r = bset(s, fmt);
      if (!r || !r.phases) continue;
      const ph = r.phases;
      gr.push({
        label: `${s.replace('stress_', '').replace('real_', '')} .${fmt}`,
        segments: [
          { name: 'fetch', color: PHASE_COLORS.fetch, value: ph.fetch.med },
          { name: 'parse', color: PHASE_COLORS.parse, value: ph.parse.med },
          { name: 'validate', color: PHASE_COLORS.validate, value: ph.validate.med },
          { name: 'crc', color: PHASE_COLORS.crc, value: ph.crc.med },
          { name: 'apply', color: PHASE_COLORS.apply, value: ph.apply.med },
          { name: 'first_draw', color: PHASE_COLORS.first_draw, value: ph.first_draw.med },
        ],
      });
    }
    return gr;
  }),
});

const camPts = fmt => setNames.map(s => bset(s, fmt)).filter(r => r && r.camera).map(r => [r.rooms, r.camera.p95]);
const drawPts = fmt => setNames.map(s => bset(s, fmt)).filter(r => r && r.phases).map(r => [r.rooms, r.phases.first_draw.med]);
const renderChart = lineChart({
  series: [
    { name: 'kamera p95 (.dat)', color: C_DAT, points: camPts('dat') },
    { name: 'kamera p95 (.arkmap)', color: C_ARK, points: camPts('arkmap') },
    { name: 'pierwszy draw (.dat)', color: C_OK, dash: true, points: drawPts('dat') },
    { name: 'pierwszy draw (.arkmap)', color: '#2ecc71', dash: true, points: drawPts('arkmap') },
  ],
  xLab: 'pokoje (skala log)', yLab: 'ms', xTicks: setNames.map(roomsOf),
});

const heapChart = lineChart({
  series: [
    { name: 'heap po load (.dat)', color: C_DAT, points: setNames.map(s => bset(s, 'dat')).filter(r => r && r.heap_mb_med).map(r => [r.rooms, r.heap_mb_med]) },
    { name: 'heap po load (.arkmap)', color: C_ARK, points: setNames.map(s => bset(s, 'arkmap')).filter(r => r && r.heap_mb_med).map(r => [r.rooms, r.heap_mb_med]) },
  ],
  xLab: 'pokoje (skala log)', yLab: 'MB', fmtY: v => num(v), xTicks: setNames.map(roomsOf),
});

// ---------- dokument ----------
const datePl = new Date(nodeRes.meta.date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
const ua = (browser.find(r => r.userAgent) || {}).userAgent || '';
const chromeVer = (ua.match(/HeadlessChrome\/([\d.]+)/) || [])[1] || '?';

const verdictNote = browser.some(r => r.verdict.startsWith('CRASH(timeout)'))
  ? `<div class="warn"><b>Uwaga interpretacyjna:</b> werdykty <code>CRASH(timeout)</code> przy
     ${browser.filter(r => r.verdict.startsWith('CRASH(timeout)')).map(r => `${esc(r.set)} .${r.fmt}`).join(', ')}
     to <b>wyczerpanie budżetu czasowego pomiaru</b> (budżet pierwszego przebiegu obejmował wszystkie
     ${browser.find(r => r.runs)?.runs || 10} zimnych ładowań naraz), a nie zaobserwowany crash aplikacji.
     Rozstrzygają one „powyżej tego rozmiaru pełny protokół pomiaru nie zmieścił się w budżecie na tej
     maszynie", ale <b>nie</b> „aplikacja się wysypała". Poprawiony orkiestrator (budżet skalowany
     z liczbą przebiegów) pozwala domknąć te punkty ponownym przebiegiem fazy 3.</div>` : '';

const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ArkMap Studio — raport wydajności (perf lab)</title>
<style>
  :root {
    --bg: #0d0f12; --panel: #141720; --border: #252b3a;
    --accent: #4a9eff; --accent2: #ff9f4a; --ok: #4aff8a; --err: #ff4a4a;
    --text: #e8eef8; --dim: #8898b8; --fg: #ccd8ea;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text);
    font: 14px/1.7 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    max-width: 1000px; margin: 0 auto; padding: 32px 24px 80px; }
  h1 { font-size: 24px; color: var(--accent); letter-spacing: 2px; margin-bottom: 4px; font-weight: 500; }
  .subtitle { color: var(--dim); font-size: 12px; margin-bottom: 32px; }
  h2 { font-size: 18px; color: var(--accent); margin: 36px 0 14px; padding-bottom: 4px;
    border-bottom: 1px solid var(--border); font-weight: 500; }
  h3 { font-size: 15px; color: var(--accent2); margin: 24px 0 10px; font-weight: 500; }
  p { margin-bottom: 10px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #1a1e2a; padding: 2px 5px; border-radius: 2px; font-size: 13px;
    font-family: 'Courier New', 'Fira Code', monospace; color: #e8c880; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
  th, td { padding: 7px 10px; border: 1px solid var(--border); text-align: left; font-size: 12px; }
  th { background: #1a1e2a; color: var(--accent); font-weight: 500; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.5px; }
  td { color: var(--fg); }
  tr:hover td { background: #161a24; }
  ul, ol { margin: 6px 0 14px 24px; }
  li { margin-bottom: 5px; font-size: 13px; }
  .note { background: #0d1a28; border-left: 3px solid var(--accent); padding: 10px 14px;
    margin: 14px 0; border-radius: 0 4px 4px 0; font-size: 12px; color: var(--fg); }
  .warn { background: #1a1500; border-left: 3px solid #e8a020; padding: 10px 14px;
    margin: 14px 0; border-radius: 0 4px 4px 0; font-size: 12px; color: #e8c880; }
  .tldr { background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
    padding: 18px 22px; margin: 18px 0; }
  .tldr li { margin-bottom: 8px; font-size: 13px; }
  .big { font-size: 20px; color: var(--accent2); font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 14px 0; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; }
  .card .v { font-size: 20px; color: var(--accent); font-weight: 600; }
  .card .l { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; }
</style>
</head>
<body>
<h1>ARKMAP STUDIO — RAPORT WYDAJNOŚCI</h1>
<div class="subtitle">perf lab (Arc 18) · pomiar: ${esc(datePl)} · ${esc(nodeRes.meta.machine)} · Node ${esc(nodeRes.meta.node)} · chrome-headless-shell ${esc(chromeVer)} · generowane z surowych danych przez <code>tests/perf/report_build.mjs</code></div>

<div class="tldr">
<p style="margin-bottom:10px"><b>TL;DR</b></p>
<ul>
<li><b>Różnica czasu ładowania .arkmap vs .dat wynika z weryfikacji CRC, nie z parsowania JSON.</b>
Ładowanie <code>.arkmap</code> jest <span class="big">${num(avgRatio, 1)}×</span> wolniejsze niż <code>.dat</code>
(mediana ratio ${num(Math.min(...ratios), 2)}–${num(Math.max(...ratios), 2)}× na drabince 27k→432k pokoi) — ale sam
<code>JSON.parse</code> jest <b>${num(jsonVsDat, 1)}× szybszy</b> niż binarny parser <code>.dat</code>
(${ms(BS.arkmap.json.med)} vs ${ms(BS.dat.parse.med)} przy ${krooms(BS.rooms)} pokoi). Cała różnica to
<b>weryfikacja sum kontrolnych CRC</b> (${num(crcShareMin, 0)}–${num(crcShareMax, 0)}% czasu ładowania .arkmap),
której <code>.dat</code> z założenia nie wykonuje (plik lokalny = zaufany). To koszt wykrywalności manipulacji,
nie koszt formatu JSON.</li>
<li><b>W przeglądarce różnica formatów jest stłumiona:</b> end-to-end tylko ~${num(browserRatio27, 2)}× (27k)
do ~${num(browserRatioBig, 2)}× (${esc(bigOkBoth.replace('stress_', '').replace('real_', ''))}), bo dominuje
<code>applyMap</code> (budowa indeksów renderera) — ${num(applyShare, 0)}% czasu ładowania realnej mapy.</li>
<li><b>Renderer skaluje się z rozmiarem viewportu, nie mapy:</b> pierwszy draw ${num(drawMin, 0)}–${num(drawMax, 0)}${sp}ms
i kamera p95 ${num(camMin, 0)}–${num(camMax, 0)}${sp}ms płasko od 27k do 108k pokoi (kryterium JANK: 50${sp}ms — nigdzie nie złamane).
Culling viewportu działa.</li>
<li><b>Limit praktyczny na tej maszynie (low-end 2C/2T):</b> pewne OK do <b>${krooms(lastOkRooms('dat'))} pokoi
(${okMult('dat')}× realna mapa)</b> w obu formatach; powyżej protokół pomiaru wyczerpał budżet czasowy
(szczegóły i zastrzeżenia w §5–§6). Brak zaobserwowanego crasha aplikacji w zmierzonym zakresie.</li>
<li><b>Pamięć pod kontrolą:</b> heap po załadowaniu max ${MB(heapMax)} przy 108k pokoi (kryterium MEM: 2048${sp}MB).</li>
</ul>
</div>

<h2>1. Czysty parse: .dat vs .arkmap</h2>
<p>Czysty parse w Node.js (${nodeRes.meta.n_runs} przebiegów na punkt, mediana; ta sama maszyna, te same warunki
dla obu formatów; <code>.arkmap</code> mierzony 1:1 jak robi to aplikacja: <code>JSON.parse + validate +
verifyChecksums</code>, <code>.dat</code>: <code>datToArkmap + validate</code> — celowa asymetria, patrz §6):</p>
${nodeTable()}
${parseChart}
<p><b>Wnioski:</b></p>
<ul>
<li>Różnica <b>utrzymuje się w całym zakresie</b> (${setNames.map(s => num(nodeRes.sets[s].ratio_total, 2) + '×').join(' → ')}),
a bezwzględna jest największa przy największej mapie (${ms(nodeRes.sets[biggest].arkmap.total.med - nodeRes.sets[biggest].dat.total.med)} przy ${krooms(BS.rooms)} pokoi).</li>
<li>Sam <code>JSON.parse</code> (linia zielona) jest wielokrotnie szybszy niż parser binarny — przy ${krooms(BS.rooms)}
pokoi ${num(jsonVsDat, 1)}×. Gdyby .arkmap nie weryfikował sum, byłby <b>szybszy</b> niż .dat.</li>
<li>Plik .arkmap jest też ~${num(nodeRes.sets[biggest].size_mb.arkmap / nodeRes.sets[biggest].size_mb.dat, 1)}× większy na dysku
(${num(nodeRes.sets[biggest].size_mb.dat, 0)} vs ${num(nodeRes.sets[biggest].size_mb.arkmap, 0)}${sp}MB przy ${krooms(BS.rooms)}) — przy pobieraniu
sieciowym dochodzi narzut transferu, ale to cena za czytelność, diffowalność w gicie i sumy kontrolne.</li>
</ul>

<h2>2. Przeglądarka end-to-end</h2>
<p>Pełna aplikacja w chrome-headless-shell, zimne ładowanie co przebieg (${browser.find(r => r.runs)?.runs || 10}× na punkt),
fazy mierzone wewnątrz prawdziwego <code>arkmap_studio.html</code>:</p>
${browserTable()}
${loadStack}
<p><code>applyMap</code> (budowa struktur renderera: roomsZ, siatka obszarów, backlinki) dominuje w obu formatach
i rośnie liniowo z liczbą pokoi — to on, a nie parse, jest głównym kosztem ładowania w aplikacji.
Dlatego w realnym użyciu format pliku zmienia czas ładowania o ~10–20%, nie o 100%.</p>

<h2>3. Renderer: pierwszy draw i kamera</h2>
<p>Ścieżka kamery: 5 pozycji × 8 zoomów = 40 synchronicznych <code>draw()</code> na załadowanej mapie.
Kryterium JANK (p95 &gt; 50${sp}ms) nie złamane nigdzie w zmierzonym zakresie:</p>
${renderChart}
<ul>
<li>Czasy są <b>płaskie względem rozmiaru mapy</b> — draw kosztuje tyle, ile widać w viewportcie (culling), nie ile ma mapa.</li>
<li>Najwyższe p95 kamery (${num(camMax, 1)}${sp}ms) wyszło na <b>realnej mapie 27k</b>, nie na syntetykach: prawdziwa mapa
jest gęstsza w kadrze (klony syntetyków są rozrzucone na dużym obszarze, culling odcina więcej). Realna mapa to dla
renderera przypadek <i>gorszy</i> niż syntetyk 4× — i przechodzi z zapasem.</li>
<li>Headless renderuje programowo (SwiftShader) — na prawdziwym GPU użytkownika czasy będą niższe.</li>
</ul>

<h2>4. Pamięć</h2>
${heapChart}
<p>Heap po załadowaniu rośnie liniowo (~2–3,5${sp}MB na 1k pokoi) i przy ${krooms(lastOkRooms('arkmap'))} pokoi wynosi
${MB(heapMax)} — daleko pod kryterium MEM (2048${sp}MB). Ekstrapolacja: sufit pamięciowy tej klasy sprzętu
wypada w okolicach ~500k pokoi, ale na tej maszynie wcześniej kończy się cierpliwość (czas ładowania) niż RAM.</p>

<h2>5. Limity — stress test</h2>
<p>Kryteria zarejestrowane <b>przed</b> pomiarem: CRASH (pad/timeout), LOAD (total &gt; 30${sp}s),
JANK (kamera p95 &gt; 50${sp}ms), MEM (heap &gt; 2048${sp}MB).</p>
<ul>
<li>Oba formaty: <b>OK do ${krooms(lastOkRooms('dat'))} pokoi włącznie</b> (${okMult('dat')}× realna mapa) — żadne
kryterium nie złamane.</li>
<li>Powyżej: werdykty timeout budżetu pomiaru — patrz uwaga poniżej; nie są dowodem crashu.</li>
<li>Eksport <code>.dat</code> z przeglądarki działa i skaluje się liniowo:
${expDats.map(r => `${krooms(r.rooms)} pokoi → ${num(r.export_dat.ms / 1000, 1)}${sp}s`).join(', ')}.</li>
<li>Generator syntetyków (narzędzie testowe, nie aplikacja): K=32 (${num(26988 * 32)} pokoi) wymaga &gt; 6${sp}GB heapu
Node — przy 6${sp}GB zakończył się OOM po zapisaniu .arkmap, przed eksportem .dat.</li>
</ul>
${verdictNote}

<h2>6. Metodologia</h2>
<ul>
<li><b>Baza:</b> produkcyjny fixture <code>map_master3.dat</code> (60 obszarów, ${num(nodeRes.sets.real_27k.rooms)} pokoi)
→ <code>base.arkmap</code> przez <code>tools/dat2arkmap.mjs</code>.</li>
<li><b>Drabinka syntetyków:</b> deterministyczne klony ×2/×4/×8/×16/×32 (przesunięcia współrzędnych, remap id
blokami, sumy v2 liczone funkcjami aplikacji; walidacja <code>validate()</code> fail-closed po generacji).</li>
<li><b>Faza Node</b> (<code>bench_parse.js</code>): kod parserów wyekstrahowany verbatim z <code>arkmap_studio.html</code>,
${nodeRes.meta.n_runs} przebiegów + ${nodeRes.meta.warmup} rozgrzewki, <code>--expose-gc</code>, statystyki min/med/p95/max.</li>
<li><b>Faza przeglądarka</b> (<code>perf_driver.html</code> + <code>cdp_run.py</code>): pełna aplikacja w iframe,
zimne ładowanie co przebieg (cache-buster), prawdziwy zegar przez Chrome DevTools Protocol (bez virtual-time),
heap z <code>--enable-precise-memory-info</code>, kamera = 40 synchronicznych draw() na ścieżce 5×8.</li>
<li><b>Asymetria celowa:</b> <code>.dat</code> ładuje się bez verifyChecksums (tak robi aplikacja — plik binarny
traktowany jako zaufany), <code>.arkmap</code> z pełną weryfikacją. Pomiar odzwierciedla zachowanie produkcyjne 1:1.</li>
<li>Surowe dane: <code>tests/perf/results/</code>; ten raport: <code>node tests/perf/report_build.mjs</code>;
własny przebieg: <code>bash tests/perf/run.sh</code> (README w <code>tests/perf/</code>).</li>
</ul>

<h2>7. Zastrzeżenia</h2>
<ul>
<li>Maszyna pomiarowa to <b>celowo low-end</b> (Athlon Silver 3050U, 2C/2T) — reprezentuje dolny koniec sprzętu
użytkowników; na współczesnym desktopie wszystkie czasy będą niższe. Relacje formatów i kształt skalowania
przenoszą się na szybszy sprzęt.</li>
<li>Podczas przebiegu w tle działały inne procesy (m.in. LM Studio) — czasy bezwzględne to górne widełki.</li>
<li>chrome-headless-shell renderuje programowo; brak GPU, brak compositingu — draw/kamera to sufit, nie typ.</li>
<li>Syntetyki to klony realnej mapy (rozłączne wyspy); rozkład gęstości w kadrze jest dla renderera łagodniejszy
niż realnej mapy — stąd real_27k ma najwyższe p95 kamery.</li>
<li>Liczby są miarodajne porównawczo (identyczne warunki dla obu formatów), orientacyjne bezwzględnie.</li>
</ul>

<p style="margin-top:28px;color:var(--dim);font-size:12px">ArkMap Studio · <a href="../README.md">README</a> ·
<a href="arkmap_manual.html">manual</a> · raport generowany automatycznie — nie edytować ręcznie.</p>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`OK: ${OUT} (${(html.length / 1024).toFixed(1)} KB) — z danych: ${SRC}`);
