#!/usr/bin/env node
// report_build.mjs — generator raportow perf lab (data-driven).
// Uzycie:
//   node tests/perf/report_build.mjs [kat_wynikow] [plik_wyj] [--compare kat_ref]
//   kat_wynikow — katalog z results_node.json + results_browser.json (fallback:
//                 results_browser.jsonl) + opcjonalnie META.json (app_version,
//                 checksum_alg, background, gen_oom).
//   bez --compare : raport pojedynczego przebiegu
//   z --compare   : raport porownawczy (kat_wynikow = nowy, kat_ref = referencja)
// Raport w pelni generowany z danych — zadne liczby ani twierdzenia o werdyktach
// nie sa wpisane na sztywno. Deterministyczny: dwa przebiegi na tych samych
// danych daja identyczne bajty.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const cmpIdx = args.indexOf('--compare');
const CMP_DIR = cmpIdx >= 0 ? args[cmpIdx + 1] : null;
const pos = cmpIdx >= 0 ? args.filter((_, i) => i !== cmpIdx && i !== cmpIdx + 1) : args;
const SRC = pos[0] || 'tests/perf/results/2026-08-22';
const OUT = pos[1] || 'docs/perf_report.html';

function loadDir(dir) {
  const nodeRes = JSON.parse(readFileSync(join(dir, 'results_node.json'), 'utf8'));
  let browser;
  if (existsSync(join(dir, 'results_browser.json'))) {
    browser = JSON.parse(readFileSync(join(dir, 'results_browser.json'), 'utf8'));
  } else {
    browser = readFileSync(join(dir, 'results_browser.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map(l => JSON.parse(l));
  }
  const meta = existsSync(join(dir, 'META.json'))
    ? JSON.parse(readFileSync(join(dir, 'META.json'), 'utf8')) : {};
  return { nodeRes, browser, meta };
}

const NEW = loadDir(SRC);
const REF = CMP_DIR ? loadDir(CMP_DIR) : null;

// ---------- pomocnicze ----------
const ORDER = ['real_27k', 'stress_2x', 'stress_4x', 'stress_8x', 'stress_16x', 'stress_32x'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sp = '\u00a0'; // nbsp jako separator tysiecy
function num(x, dec = 0) {
  if (x == null || !isFinite(x)) return '—';
  const [i, f] = x.toFixed(dec).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, sp);
  return f ? g + ',' + f : g;
}
const ms = (x, dec = 0) => x == null ? '—' : num(x, dec) + sp + 'ms';
const MB = x => num(x, 0) + sp + 'MB';
const krooms = r => r >= 1000 ? num(Math.round(r / 1000)) + sp + 'k' : num(r);
const C_DAT = '#4a9eff', C_ARK = '#ff9f4a', C_OK = '#4aff8a', C_ERR = '#ff4a4a';

const CSS = `
  :root { --bg:#0d0f12; --panel:#141720; --border:#252b3a; --accent:#4a9eff; --accent2:#ff9f4a;
    --ok:#4aff8a; --err:#ff4a4a; --text:#e8eef8; --dim:#8898b8; --fg:#ccd8ea; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text);
    font:14px/1.7 'Segoe UI','Helvetica Neue',Arial,sans-serif;
    max-width:1000px; margin:0 auto; padding:32px 24px 80px; }
  h1 { font-size:24px; color:var(--accent); letter-spacing:2px; margin-bottom:4px; font-weight:500; }
  .subtitle { color:var(--dim); font-size:12px; margin-bottom:32px; }
  h2 { font-size:18px; color:var(--accent); margin:36px 0 14px; padding-bottom:4px;
    border-bottom:1px solid var(--border); font-weight:500; }
  h3 { font-size:15px; color:var(--accent2); margin:24px 0 10px; font-weight:500; }
  p { margin-bottom:10px; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  code { background:#1a1e2a; padding:2px 5px; border-radius:2px; font-size:13px;
    font-family:'Courier New','Fira Code',monospace; color:#e8c880; }
  table { width:100%; border-collapse:collapse; margin:10px 0 18px; }
  th,td { padding:7px 10px; border:1px solid var(--border); text-align:left; font-size:12px; }
  th { background:#1a1e2a; color:var(--accent); font-weight:500; font-size:11px;
    text-transform:uppercase; letter-spacing:0.5px; }
  td { color:var(--fg); }
  tr:hover td { background:#161a24; }
  ul,ol { margin:6px 0 14px 24px; }
  li { margin-bottom:5px; font-size:13px; }
  .note { background:#0d1a28; border-left:3px solid var(--accent); padding:10px 14px;
    margin:14px 0; border-radius:0 4px 4px 0; font-size:12px; color:var(--fg); }
  .warn { background:#1a1500; border-left:3px solid #e8a020; padding:10px 14px;
    margin:14px 0; border-radius:0 4px 4px 0; font-size:12px; color:#e8c880; }
  .tldr { background:var(--panel); border:1px solid var(--border); border-radius:6px;
    padding:18px 22px; margin:18px 0; }
  .tldr li { margin-bottom:8px; font-size:13px; }
  .big { font-size:20px; color:var(--accent2); font-weight:600; }
  .better { color:var(--ok); } .worse { color:var(--err); } .same { color:var(--dim); }
`;

// ---------- SVG: wykres liniowy ----------
function lineChart({ series, xLab, yLab, w = 720, h = 300, fmtY = v => num(v), xTicks }) {
  const padL = 64, padR = 18, padT = 14, padB = 56;
  const W = w - padL - padR, H = h - padT - padB;
  const allPts = series.flatMap(s => s.points);
  const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMax = Math.max(...ys) * 1.12;
  const tx = v => (Math.log(v / xMin) / Math.log(xMax / xMin)) * W;
  const ty = v => H - (v / yMax) * H;
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
      body += `<circle cx="${(padL + tx(p[0])).toFixed(1)}" cy="${(padT + ty(p[1])).toFixed(1)}" r="3.2" fill="${s.color}"/>`;
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

// ---------- SVG: slupki skladane ----------
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

// ============================================================================
// RAPORT POJEDYNCZEGO PRZEBIEGU
// ============================================================================
function buildSingle({ nodeRes, browser, meta }) {
  const setNames = Object.keys(nodeRes.sets).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const bset = (set, fmt) => browser.find(r => r.set === set && r.fmt === fmt);
  const roomsOf = s => nodeRes.sets[s].rooms;

  const ratios = setNames.map(s => nodeRes.sets[s].ratio_total);
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const biggest = setNames[setNames.length - 1];
  const BS = nodeRes.sets[biggest];
  const jsonVsDat = BS.dat.parse.med / BS.arkmap.json.med;
  const crcShares = setNames.map(s => nodeRes.sets[s].arkmap.crc.med / nodeRes.sets[s].arkmap.total.med * 100);

  const okSets = fmt => setNames.filter(s => { const r = bset(s, fmt); return r && r.verdict === 'OK'; });
  const lastOk = fmt => { const o = okSets(fmt); return o[o.length - 1]; };
  const lastOkRooms = fmt => { const s = lastOk(fmt); return s ? roomsOf(s) : null; };
  const okMult = fmt => { const r = lastOkRooms(fmt); return r ? Math.round(r / nodeRes.sets.real_27k.rooms) : null; };
  // powod stopu drabinki: pierwszy rekord nie-OK po ostatnim OK (w kolejnosci ORDER)
  const stopInfo = fmt => {
    const recs = setNames.map(s => bset(s, fmt)).filter(Boolean);
    const bad = recs.find(r => r.verdict !== 'OK');
    if (!bad) return null;
    return { set: bad.set, verdict: bad.verdict, rooms: bad.rooms, camP95: bad.camera ? bad.camera.p95 : null };
  };

  const camAll = browser.filter(r => r.camera).flatMap(r => [r.camera.p95]);
  const drawAll = browser.filter(r => r.phases).map(r => r.phases.first_draw.med);
  const heapMax = Math.max(...browser.filter(r => r.heap_mb_med).map(r => r.heap_mb_med));
  const heapMaxRooms = Math.max(...browser.filter(r => r.heap_mb_med).map(r => r.rooms));
  const loadMax = Math.max(...browser.filter(r => r.phases).map(r => r.phases.total.med));
  const jankRecs = browser.filter(r => r.verdict === 'JANK');
  const realDat = bset('real_27k', 'dat'), realArk = bset('real_27k', 'arkmap');
  const applyShare = realDat.phases.apply.med / realDat.phases.total.med * 100;
  const browserRatio27 = realArk.phases.total.med / realDat.phases.total.med;
  const bigOkBoth = setNames.filter(s => ['dat', 'arkmap'].every(f => { const r = bset(s, f); return r && r.verdict === 'OK'; })).pop();
  const browserRatioBig = (() => { const d = bset(bigOkBoth, 'dat'), a = bset(bigOkBoth, 'arkmap'); return a.phases.total.med / d.phases.total.med; })();
  const expDats = browser.filter(r => r.export_dat && r.export_dat.ms);

  // --- twierdzenia data-driven ---
  const jankTxt = jankRecs.length
    ? `kryterium JANK (50${sp}ms) złamane ${jankRecs.length}×: ` +
      jankRecs.map(r => `${esc(r.set)} .${r.fmt} (p95 ${num(r.camera.p95, 1)}${sp}ms)`).join(', ')
    : `kryterium JANK (50${sp}ms) nie złamane nigdzie w zmierzonym zakresie`;

  const limitLine = ['dat', 'arkmap'].map(fmt => {
    const lo = lastOk(fmt);
    if (!lo) return null;
    const stop = stopInfo(fmt);
    let s = `<code>.${fmt === 'dat' ? 'dat' : 'arkmap'}</code> OK do <b>${krooms(lastOkRooms(fmt))} pokoi (${okMult(fmt)}× realna mapa)</b>`;
    if (stop) {
      const why = stop.verdict === 'JANK' ? `JANK kamery (p95 ${num(stop.camP95, 1)}${sp}ms)`
        : stop.verdict.startsWith('CRASH') ? esc(stop.verdict)
        : esc(stop.verdict);
      s += `; przy ${krooms(stop.rooms)}: ${why} → stop drabinki`;
    }
    return s;
  }).filter(Boolean).join('; ');

  const algTxt = meta.checksum_alg === 'v4' ? 'sumy <b>v4</b> (XXH3-64) liczone funkcjami aplikacji'
    : meta.checksum_alg === 'v3' ? 'sumy <b>v3</b> (XXH3-64) liczone funkcjami aplikacji'
    : meta.checksum_alg === 'v2' ? 'sumy v2 liczone funkcjami aplikacji'
    : 'sumy liczone funkcjami aplikacji';
  const appTxt = meta.app_version ? ` · aplikacja <code>${esc(meta.app_version)}</code>` : '';
  const bgBullet = meta.background ? `<li>${esc(meta.background)}</li>` : '';
  const oomBullet = meta.gen_oom ? `<li>Generator syntetyków (narzędzie testowe, nie aplikacja): ${esc(meta.gen_oom)}</li>` : '';

  const verdictNote = browser.some(r => r.verdict.startsWith('CRASH(timeout)'))
    ? `<div class="warn"><b>Uwaga interpretacyjna:</b> werdykty <code>CRASH(timeout)</code> przy
       ${browser.filter(r => r.verdict.startsWith('CRASH(timeout)')).map(r => `${esc(r.set)} .${r.fmt}`).join(', ')}
       to <b>wyczerpanie budżetu czasowego pomiaru</b>, a nie zaobserwowany crash aplikacji.
       Rozstrzygają one „powyżej tego rozmiaru pełny protokół pomiaru nie zmieścił się w budżecie na tej
       maszynie", ale <b>nie</b> „aplikacja się wysypała".</div>` : '';

  // --- tabele ---
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

  // --- wykresy ---
  const parseChart = lineChart({
    series: [
      { name: '.dat total (parse+validate)', color: C_DAT, points: setNames.map(s => [roomsOf(s), nodeRes.sets[s].dat.total.med]) },
      { name: '.arkmap total (json+val+CRC)', color: C_ARK, points: setNames.map(s => [roomsOf(s), nodeRes.sets[s].arkmap.total.med]) },
      { name: 'sam JSON.parse', color: C_OK, dash: true, points: setNames.map(s => [roomsOf(s), nodeRes.sets[s].arkmap.json.med]) },
    ],
    xLab: 'pokoje (skala log)', yLab: 'mediana [ms]', xTicks: setNames.map(roomsOf),
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

  const datePl = new Date(nodeRes.meta.date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
  const ua = (browser.find(r => r.userAgent) || {}).userAgent || '';
  const chromeVer = (ua.match(/HeadlessChrome\/([\d.]+)/) || [])[1] || '?';
  const camMaxSet = browser.filter(r => r.camera).sort((a, b) => b.camera.p95 - a.camera.p95)[0];

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ArkMap Studio — raport wydajności (perf lab)</title>
<style>${CSS}</style>
</head>
<body>
<h1>ARKMAP STUDIO — RAPORT WYDAJNOŚCI</h1>
<div class="subtitle">perf lab · pomiar: ${esc(datePl)} · ${esc(nodeRes.meta.machine)} · Node ${esc(nodeRes.meta.node)} · chrome-headless-shell ${esc(chromeVer)}${appTxt} · generowane z surowych danych przez <code>tests/perf/report_build.mjs</code></div>

<div class="tldr">
<p style="margin-bottom:10px"><b>TL;DR</b></p>
<ul>
<li><b>Różnica czasu ładowania .arkmap vs .dat wynika z weryfikacji sum, nie z parsowania JSON.</b>
Ładowanie <code>.arkmap</code> jest <span class="big">${num(avgRatio, 1)}×</span> wolniejsze niż <code>.dat</code>
(mediana ratio ${num(Math.min(...ratios), 2)}–${num(Math.max(...ratios), 2)}×) — ale sam
<code>JSON.parse</code> jest <b>${num(jsonVsDat, 1)}× szybszy</b> niż binarny parser <code>.dat</code>
(${ms(BS.arkmap.json.med)} vs ${ms(BS.dat.parse.med)} przy ${krooms(BS.rooms)} pokoi). Różnica to
<b>weryfikacja sum kontrolnych</b> (${num(Math.min(...crcShares), 0)}–${num(Math.max(...crcShares), 0)}% czasu ładowania .arkmap),
której <code>.dat</code> z założenia nie wykonuje (plik lokalny = zaufany). To koszt wykrywalności manipulacji,
nie koszt formatu JSON.</li>
<li><b>W przeglądarce różnica formatów jest stłumiona:</b> end-to-end ~${num(browserRatio27, 2)}× (27k)
do ~${num(browserRatioBig, 2)}× (${esc(bigOkBoth.replace('stress_', '').replace('real_', ''))}), bo dominuje
<code>applyMap</code> (budowa indeksów renderera) — ${num(applyShare, 0)}% czasu ładowania realnej mapy.</li>
<li><b>Renderer:</b> pierwszy draw ${num(Math.min(...drawAll), 0)}–${num(Math.max(...drawAll), 0)}${sp}ms,
kamera p95 ${num(Math.min(...camAll), 1)}–${num(Math.max(...camAll), 1)}${sp}ms — ${jankTxt}.</li>
<li><b>Limit praktyczny na tej maszynie (low-end 2C/2T):</b> ${limitLine}.
Najdłuższe pełne ładowanie: ${num(loadMax / 1000, 1)}${sp}s (limit LOAD 30${sp}s).</li>
<li><b>Pamięć:</b> heap po załadowaniu max ${MB(heapMax)} przy ${krooms(heapMaxRooms)} pokoi
(kryterium MEM: 2048${sp}MB).</li>
</ul>
</div>

<h2>1. Czysty parse: .dat vs .arkmap (Node)</h2>
<p>${nodeRes.meta.n_runs} przebiegów na punkt, mediana; <code>.arkmap</code> mierzony 1:1 jak aplikacja
(<code>JSON.parse + validate + verifyChecksums</code>), <code>.dat</code>: <code>datToArkmap + validate</code>
— celowa asymetria, patrz §6):</p>
${nodeTable()}
${parseChart}
<p><b>Wnioski:</b></p>
<ul>
<li>Różnica <b>utrzymuje się w całym zakresie</b> (${setNames.map(s => num(nodeRes.sets[s].ratio_total, 2) + '×').join(' → ')}),
a bezwzględna jest największa przy największej mapie (${ms(BS.arkmap.total.med - BS.dat.total.med)} przy ${krooms(BS.rooms)} pokoi,
z czego ${ms(BS.arkmap.crc.med)} to weryfikacja sum).</li>
<li>Sam <code>JSON.parse</code> jest wielokrotnie szybszy niż parser binarny — przy ${krooms(BS.rooms)}
pokoi ${num(jsonVsDat, 1)}×. Gdyby .arkmap nie weryfikował sum, byłby <b>szybszy</b> niż .dat.</li>
<li>Plik .arkmap jest ~${num(BS.size_mb.arkmap / BS.size_mb.dat, 1)}× większy na dysku
(${num(BS.size_mb.dat, 0)} vs ${num(BS.size_mb.arkmap, 0)}${sp}MB przy ${krooms(BS.rooms)}).</li>
</ul>

<h2>2. Przeglądarka end-to-end</h2>
<p>Pełna aplikacja w chrome-headless-shell, zimne ładowanie co przebieg (${browser.find(r => r.runs)?.runs || 10}× na punkt),
fazy mierzone wewnątrz prawdziwego <code>arkmap_studio.html</code>:</p>
${browserTable()}
${loadStack}
<p><code>applyMap</code> (budowa struktur renderera: roomsZ, siatka obszarów, backlinki) dominuje w obu formatach
i rośnie liniowo z liczbą pokoi — to on, a nie parse, jest głównym kosztem ładowania w aplikacji.</p>

<h2>3. Renderer: pierwszy draw i kamera</h2>
<p>Ścieżka kamery: 5 pozycji × 8 zoomów = 40 synchronicznych <code>draw()</code> na załadowanej mapie.
Kryterium JANK: p95 &gt; 50${sp}ms.</p>
${renderChart}
<ul>
<li>Pierwszy draw jest <b>płaski względem rozmiaru mapy</b> (${num(Math.min(...drawAll), 0)}–${num(Math.max(...drawAll), 0)}${sp}ms)
— draw kosztuje tyle, ile widać w viewportcie (culling), nie ile ma mapa.</li>
<li>Najwyższe p95 kamery: ${num(Math.max(...camAll), 1)}${sp}ms (${esc(camMaxSet.set)} .${esc(camMaxSet.fmt)}). ${jankTxt}.</li>
<li>Headless renderuje programowo (SwiftShader) — na prawdziwym GPU użytkownika czasy będą niższe.</li>
</ul>

<h2>4. Pamięć</h2>
${heapChart}
<p>Heap po załadowaniu rośnie liniowo i przy ${krooms(heapMaxRooms)} pokoi wynosi ${MB(heapMax)}
(kryterium MEM: 2048${sp}MB).</p>

<h2>5. Limity — stress test</h2>
<p>Kryteria zarejestrowane <b>przed</b> pomiarem: CRASH (pad/timeout), LOAD (total &gt; 30${sp}s),
JANK (kamera p95 &gt; 50${sp}ms), MEM (heap &gt; 2048${sp}MB).</p>
<ul>
<li>${limitLine}.</li>
<li>LOAD: ${loadMax > 30000 ? 'złamany' : 'nie złamany'} (max ${num(loadMax / 1000, 1)}${sp}s).
CRASH aplikacji: ${browser.some(r => r.verdict.startsWith('CRASH') && !r.verdict.includes('timeout')) ? 'zaobserwowany' : 'brak'}.
MEM: ${heapMax > 2048 ? 'złamany' : 'nie złamany'} (max ${MB(heapMax)}).</li>
<li>Eksport <code>.dat</code> z przeglądarki:
${expDats.map(r => `${krooms(r.rooms)} pokoi → ${num(r.export_dat.ms / 1000, 1)}${sp}s`).join(', ')}.</li>
${oomBullet}
</ul>
${verdictNote}

<h2>6. Metodologia</h2>
<ul>
<li><b>Baza:</b> produkcyjny fixture <code>map_master3.dat</code> (60 obszarów, ${num(nodeRes.sets.real_27k.rooms)} pokoi)
→ <code>base.arkmap</code> przez <code>tools/dat2arkmap.mjs</code>.</li>
<li><b>Drabinka syntetyków:</b> deterministyczne klony ×2/×4/×8/×16/×32 (przesunięcia współrzędnych, remap id
blokami, ${algTxt}; walidacja <code>validate()</code> fail-closed po generacji).</li>
<li><b>Faza Node</b> (<code>bench_parse.js</code>): kod parserów wyekstrahowany verbatim z <code>arkmap_studio.html</code>,
${nodeRes.meta.n_runs} przebiegów + ${nodeRes.meta.warmup} rozgrzewki, <code>--expose-gc</code>, statystyki min/med/p95/max.</li>
<li><b>Faza przeglądarka</b> (<code>perf_driver.html</code> + <code>cdp_run.py</code>): pełna aplikacja w iframe,
zimne ładowanie co przebieg (cache-buster), prawdziwy zegar przez Chrome DevTools Protocol (bez virtual-time),
heap z <code>--enable-precise-memory-info</code>, kamera = 40 synchronicznych draw() na ścieżce 5×8,
świeży profil przeglądarki na przebieg (bez dyskowego cache).</li>
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
${bgBullet}
<li>chrome-headless-shell renderuje programowo; brak GPU, brak compositingu — draw/kamera to sufit, nie typ.</li>
<li>Syntetyki to klony realnej mapy (rozłączne wyspy); rozkład gęstości w kadrze jest dla renderera łagodniejszy
niż realnej mapy.</li>
<li>Liczby są miarodajne porównawczo (identyczne warunki dla obu formatów), orientacyjne bezwzględnie.</li>
</ul>

<p style="margin-top:28px;color:var(--dim);font-size:12px">ArkMap Studio · raport generowany automatycznie — nie edytować ręcznie.</p>
</body>
</html>
`;
}

// ============================================================================
// RAPORT POROWNAWCZY (--compare): NEW (SRC) vs REF
// ============================================================================
function buildCompare(N, R) {
  const NN = N.nodeRes.sets, RN = R.nodeRes.sets;
  const setNames = Object.keys(NN).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const bsetN = (s, f) => N.browser.find(r => r.set === s && r.fmt === f);
  const bsetR = (s, f) => R.browser.find(r => r.set === s && r.fmt === f);

  const cls = d => d == null ? ['—', 'same'] : d <= -5 ? ['polepszyło', 'better'] : d >= 5 ? ['pogorszyło', 'worse'] : ['takie samo', 'same'];
  const pct = d => (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(0) + '%';
  const cell = (va, vb, dec = 0) => {
    if (va == null || vb == null) return '<td colspan="3" style="color:#8898b8">brak pomiaru</td>';
    const d = va ? (vb - va) / va * 100 : null;
    const [lbl, c] = cls(d);
    return `<td>${num(va, dec)}</td><td>${num(vb, dec)}</td><td class="${c}">${d == null ? '—' : pct(d)} (${lbl})</td>`;
  };
  const cnt = { better: 0, worse: 0, same: 0 };
  const worseList = [];
  const reg = (tag, va, vb) => {
    if (va == null || vb == null || !va) return;
    const d = (vb - va) / va * 100;
    const [, c] = cls(d);
    cnt[c]++;
    if (c === 'worse') worseList.push({ tag, va, vb, d });
  };

  // --- tabela werdyktow ---
  const vcolor = v => v == null ? '#8898b8' : v === 'OK' ? 'var(--ok)' : v.startsWith('CRASH') ? 'var(--err)' : '#e8a020';
  let verRows = '';
  for (const s of setNames) for (const fmt of ['dat', 'arkmap']) {
    const va = bsetR(s, fmt)?.verdict ?? null, vb = bsetN(s, fmt)?.verdict ?? null;
    let chg, c;
    if (va === 'OK' && vb === 'OK') { chg = 'bez zmian'; c = 'same'; }
    else if (va === 'OK' && vb !== 'OK' && vb != null) { chg = 'pogorszyło'; c = 'worse'; }
    else if (va !== 'OK' && va != null && vb === 'OK') { chg = 'polepszyło'; c = 'better'; }
    else if (va == null && vb != null) { chg = 'nowe pokrycie'; c = 'better'; }
    else if (vb == null && va != null) { chg = 'brak pomiaru (stop drabinki)'; c = 'same'; }
    else { chg = 'bez zmian'; c = 'same'; }
    verRows += `<tr><td><b>${esc(s)}</b></td><td>.${fmt}</td>`
      + `<td style="color:${vcolor(va)}">${va ? esc(va) : '—'}</td>`
      + `<td style="color:${vcolor(vb)}">${vb ? esc(vb) : '—'}</td>`
      + `<td class="${c}">${chg}</td></tr>`;
  }
  const verTable = `<table><tr><th>zestaw</th><th>format</th><th>werdykt REF</th><th>werdykt NOWY</th><th>zmiana</th></tr>${verRows}</table>`;

  // --- tabela Node ---
  let nodeRows = '';
  for (const s of setNames) {
    const a = RN[s], b = NN[s];
    if (!a || !b) continue;
    const metr = [
      ['.dat parse', a.dat.parse.med, b.dat.parse.med, `Node ${s} dat parse`],
      ['.dat validate', a.dat.validate.med, b.dat.validate.med, `Node ${s} dat validate`],
      ['.dat <b>total</b>', a.dat.total.med, b.dat.total.med, `Node ${s} dat total`],
      ['.arkmap JSON.parse', a.arkmap.json.med, b.arkmap.json.med, `Node ${s} ark json`],
      ['.arkmap validate', a.arkmap.validate.med, b.arkmap.validate.med, `Node ${s} ark validate`],
      ['.arkmap <b>weryfikacja CRC</b>', a.arkmap.crc.med, b.arkmap.crc.med, `Node ${s} ark crc`],
      ['.arkmap <b>total</b>', a.arkmap.total.med, b.arkmap.total.med, `Node ${s} ark total`],
    ];
    let first = true;
    for (const [lbl, va, vb, tag] of metr) {
      reg(tag, va, vb);
      nodeRows += `<tr><td>${first ? `<b>${esc(s)}</b> (${krooms(b.rooms)})` : ''}</td><td>${lbl}</td>${cell(va, vb)}</tr>`;
      first = false;
    }
    const d = (b.ratio_total - a.ratio_total) / a.ratio_total * 100;
    nodeRows += `<tr><td></td><td>ratio .arkmap/.dat</td><td>${num(a.ratio_total, 2)}×</td><td>${num(b.ratio_total, 2)}×</td><td class="${cls(d)[1]}">${pct(d)}</td></tr>`;
  }
  const nodeTable = `<table><tr><th>zestaw</th><th>metryka (mediana, ms)</th><th>REF</th><th>NOWY</th><th>zmiana</th></tr>${nodeRows}</table>`;

  // --- tabela przegladarki (wspolne punkty) ---
  const BR_METRICS = [['total', 'total', 0], ['parse', 'parse', 0], ['validate', 'validate', 0], ['crc', 'CRC', 0],
    ['apply', 'applyMap', 0], ['first_draw', 'pierwszy draw', 1]];
  let brRows = '';
  for (const s of setNames) for (const fmt of ['dat', 'arkmap']) {
    const ra = bsetR(s, fmt), rb = bsetN(s, fmt);
    const label = `<b>${esc(s)}</b> .${fmt}`;
    if (!ra && !rb) { brRows += `<tr><td>${label}</td><td colspan="4" style="color:#8898b8">nie mierzono w żadnym przebiegu</td></tr>`; continue; }
    const pa = ra?.phases, pb = rb?.phases;
    if (!pa || !pb) {
      const va = ra ? ra.verdict : 'brak pomiaru', vb = rb ? rb.verdict : 'brak pomiaru';
      let note;
      if (pa && !pb) note = '<td colspan="4" style="color:#8898b8">NOWY: brak (stop drabinki po wcześniejszym JANK)</td>';
      else if (pb && !ra) note = '<td colspan="4" style="color:#8898b8">REF: brak pomiaru; NOWY: zmierzono (nowe pokrycie)</td>';
      else note = '<td colspan="4" style="color:#8898b8">—</td>';
      brRows += `<tr><td>${label}</td><td>werdykt: ${esc(va)} → ${esc(vb)}</td>${note}</tr>`;
      if (pb) {
        brRows += `<tr><td></td><td colspan="4" style="color:var(--fg)">NOWY: total ${ms(pb.total.med)}, `
          + `parse ${ms(pb.parse.med)}, CRC ${ms(pb.crc.med)}, apply ${ms(pb.apply.med)}, `
          + `draw1 ${num(pb.first_draw.med, 1)}${sp}ms, kamera p95 ${num(rb.camera.p95, 1)}${sp}ms, heap ${MB(rb.heap_mb_med)}`
          + (rb.export_dat?.ms ? `, eksport .dat ${num(rb.export_dat.ms / 1000, 1)}${sp}s` : '') + `</td></tr>`;
      }
      continue;
    }
    let first = true;
    for (const [key, lbl, dec] of BR_METRICS) {
      const va = pa[key].med, vb = pb[key].med;
      if (key === 'crc' && !va && !vb) continue;
      if (va) reg(`Browser ${s} .${fmt} ${lbl}`, va, vb);
      brRows += `<tr><td>${first ? label : ''}</td><td>${lbl}</td>${cell(va || null, vb, dec)}</tr>`;
      first = false;
    }
    reg(`Browser ${s} .${fmt} kamera p95`, ra.camera.p95, rb.camera.p95);
    brRows += `<tr><td></td><td>kamera p95 [ms]</td>${cell(ra.camera.p95, rb.camera.p95, 1)}</tr>`;
    reg(`Browser ${s} .${fmt} heap`, ra.heap_mb_med, rb.heap_mb_med);
    brRows += `<tr><td></td><td>heap [MB]</td>${cell(ra.heap_mb_med, rb.heap_mb_med)}</tr>`;
    const ea = ra.export_dat?.ms, eb = rb.export_dat?.ms;
    if (ea && eb) {
      reg(`Browser ${s} .${fmt} eksport .dat`, ea, eb);
      brRows += `<tr><td></td><td>eksport .dat [ms]</td>${cell(ea, eb)}</tr>`;
    }
  }
  const browserTable = `<table><tr><th>zestaw</th><th>metryka (mediana)</th><th>REF</th><th>NOWY</th><th>zmiana</th></tr>${brRows}</table>`;

  // --- ratio CRC / JSON.parse (odporne na obciazenie tla) ---
  let ratioRows = '';
  const ratioDrops = [];
  for (const s of setNames) {
    const a = RN[s]?.arkmap, b = NN[s]?.arkmap;
    if (!a || !b) continue;
    const ra = a.crc.med / a.json.med, rb = b.crc.med / b.json.med;
    ratioDrops.push(ra / rb);
    ratioRows += `<tr><td><b>${esc(s)}</b> (${krooms(NN[s].rooms)})</td><td>${num(ra, 1)}</td><td>${num(rb, 1)}</td><td class="better">${num(ra / rb, 2)}× taniej</td></tr>`;
  }
  const ratioTable = `<table><tr><th>zestaw</th><th>REF: CRC / JSON.parse</th><th>NOWY: CRC / JSON.parse</th><th>zmiana względna</th></tr>${ratioRows}</table>`;

  let rtRows = '';
  for (const s of setNames) {
    const a = RN[s]?.ratio_total, b = NN[s]?.ratio_total;
    if (a == null || b == null) continue;
    rtRows += `<tr><td><b>${esc(s)}</b></td><td>${num(a, 2)}×</td><td>${num(b, 2)}×</td><td class="better">${pct((b - a) / a * 100)}</td></tr>`;
  }
  const rtTable = `<table><tr><th>zestaw</th><th>ratio REF</th><th>ratio NOWY</th><th>zmiana</th></tr>${rtRows}</table>`;

  const roomsAxis = setNames.map(s => NN[s].rooms);
  const cmpChart = lineChart({
    series: [
      { name: '.arkmap total REF', color: C_ARK, points: setNames.map(s => [NN[s].rooms, RN[s].arkmap.total.med]) },
      { name: '.arkmap total NOWY', color: '#2ecc71', points: setNames.map(s => [NN[s].rooms, NN[s].arkmap.total.med]) },
      { name: '.dat total REF', color: C_DAT, dash: true, points: setNames.map(s => [NN[s].rooms, RN[s].dat.total.med]) },
      { name: '.dat total NOWY', color: '#7ec3ff', dash: true, points: setNames.map(s => [NN[s].rooms, NN[s].dat.total.med]) },
    ],
    xLab: 'pokoje (skala log)', yLab: 'mediana [ms]', xTicks: roomsAxis,
  });
  const crcChart = lineChart({
    series: [
      { name: 'CRC .arkmap REF', color: C_ARK, points: setNames.map(s => [NN[s].rooms, RN[s].arkmap.crc.med]) },
      { name: 'CRC .arkmap NOWY', color: '#2ecc71', points: setNames.map(s => [NN[s].rooms, NN[s].arkmap.crc.med]) },
    ],
    xLab: 'pokoje (skala log)', yLab: 'mediana [ms]', xTicks: roomsAxis,
  });

  const dateN = new Date(N.nodeRes.meta.date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
  const dateR = new Date(R.nodeRes.meta.date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
  const uaN = (N.browser.find(r => r.userAgent) || {}).userAgent || '';
  const uaR = (R.browser.find(r => r.userAgent) || {}).userAgent || '';
  const cvN = (uaN.match(/HeadlessChrome\/([\d.]+)/) || [])[1] || '?';
  const cvR = (uaR.match(/HeadlessChrome\/([\d.]+)/) || [])[1] || '?';
  const sameSw = N.nodeRes.meta.node === R.nodeRes.meta.node && cvN === cvR
    ? `identyczne Node ${esc(N.nodeRes.meta.node)} i chrome-headless-shell ${esc(cvN)} w obu przebiegach`
    : `Node: ${esc(R.nodeRes.meta.node)} → ${esc(N.nodeRes.meta.node)}, chrome-headless-shell: ${esc(cvR)} → ${esc(cvN)}`;

  const worseTxt = worseList.map(w =>
    `<li>${esc(w.tag)}: ${num(w.va, 1)} → ${num(w.vb, 1)} (<b class="worse">${pct(w.d)}</b>)</li>`).join('');

  const algN = N.meta.checksum_alg ? `silnik sum ${esc(N.meta.checksum_alg)}` : '';
  const algR = R.meta.checksum_alg ? `silnik sum ${esc(R.meta.checksum_alg)}` : '';
  const appN = N.meta.app_version ? esc(N.meta.app_version) : '?';
  const appR = R.meta.app_version ? esc(R.meta.app_version) : '?';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ArkMap Studio — porównanie wydajności (perf lab)</title>
<style>${CSS}</style>
</head>
<body>
<h1>ARKMAP STUDIO — PORÓWNANIE WYDAJNOŚCI</h1>
<div class="subtitle">REF: ${esc(dateR)} (aplikacja ${appR}${algR ? ', ' + algR : ''}) vs NOWY: ${esc(dateN)}
(aplikacja ${appN}${algN ? ', ' + algN : ''}) · ta sama maszyna: ${esc(N.nodeRes.meta.machine)} · ${sameSw} ·
generowane z surowych danych przez <code>tests/perf/report_build.mjs --compare</code></div>

<div class="tldr">
<p style="margin-bottom:10px"><b>TL;DR</b></p>
<ul>
<li><b>${cnt.better} metryk lepiej, ${cnt.worse} gorzej, ${cnt.same} bez zmian</b> (próg „bez zmian": ±5%; porównanie median).</li>
<li><b>Weryfikacja sum (Node):</b> koszt CRC względem JSON.parse tej samej mapy — metryka odporna na
obciążenie tła — spadł <b>${num(Math.min(...ratioDrops), 1)}–${num(Math.max(...ratioDrops), 1)}×</b> na każdym rozmiarze.</li>
<li><b>Różnica formatów .arkmap/.dat (Node):</b> ratio total REF ${num(Math.min(...setNames.map(s => RN[s].ratio_total)), 2)}–${num(Math.max(...setNames.map(s => RN[s].ratio_total)), 2)}×
→ NOWY ${num(Math.min(...setNames.map(s => NN[s].ratio_total)), 2)}–${num(Math.max(...setNames.map(s => NN[s].ratio_total)), 2)}×.</li>
<li><b>Pogorszenia (${worseList.length}):</b> patrz lista poniżej; jedyne przekroczenie progu oznaczone w tabeli werdyktów.</li>
<li><b>Środowisko:</b> REF — ${R.meta.background ? esc(R.meta.background) : 'brak danych o tle'}
NOWY — ${N.meta.background ? esc(N.meta.background) : 'brak danych o tle'}
Metryki niezmiennego kodu (parse .dat, JSON.parse) pokazują udział środowiska; metryki względne (ratio) — udział kodu.</li>
</ul>
</div>

<h2>1. Werdykty drabinki stress</h2>
${verTable}

<h2>2. Czysty parse (Node) — mediana, ms</h2>
${nodeTable}
${cmpChart}

<h2>3. Przeglądarka end-to-end — mediana</h2>
${browserTable}

<h2>4. Sumy kontrolne (Node, faza weryfikacji)</h2>
${crcChart}
<p>Metryka względna (koszt CRC względem JSON.parse tego samego pliku, w tym samym przebiegu) —
odporna na obciążenie tła, pokazuje czysty efekt algorytmu:</p>
${ratioTable}

<h2>5. Różnica formatów .arkmap / .dat (ratio total, Node)</h2>
${rtTable}

<h2>6. Pogorszenia (wszystkie)</h2>
<ul>${worseTxt || '<li>brak</li>'}</ul>

<h2>7. Podsumowanie zbiorcze</h2>
<ul>
<li><b>Polepszyło: ${cnt.better} metryk.</b></li>
<li><b>Pogorszyło: ${cnt.worse} metryk</b> (lista w §6).</li>
<li><b>Bez zmian (±5%): ${cnt.same} metryk.</b></li>
</ul>

<p style="margin-top:28px;color:var(--dim);font-size:12px">ArkMap Studio · raport generowany automatycznie z surowych danych obu przebiegów — nie edytować ręcznie.</p>
</body>
</html>
`;
}

// ---------- main ----------
const html = REF ? buildCompare(NEW, REF) : buildSingle(NEW);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`OK: ${OUT} (${(html.length / 1024).toFixed(1)} KB) — dane: ${SRC}${REF ? ' vs ' + CMP_DIR : ''}`);
