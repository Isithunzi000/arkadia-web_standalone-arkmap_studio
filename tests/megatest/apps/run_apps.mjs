#!/usr/bin/env node
// Faza `apps` mega-testu: natywne silniki w headless Chromium.
//   ArkMap Studio (prawdziwe UI: loadArkmap/loadDat/findPath/wpDoSearch)
//   vs mudlet-map-renderer@2.6.1 + mudlet-map-binary-reader@1.3.0 (ich prawdziwy
//   pipeline: parseMudletMap -> readerFromLoadedMap -> PathFinder).
// Ta sama drabinka, pary i frazy z manifestu (seed), N przebiegow, mediana.
//
// Uzycie: node tests/megatest/apps/run_apps.mjs <RESULTS_DIR> [runs] [--smoke]
//   --smoke: 1 przebieg, tylko pierwszy szczebel drabinki (do weryfikacji harnessa).
//
// Wymaga: npm install w tests/megatest/apps/ oraz Chromium/Chrome
// (CHROME_BIN albo chromium/chromium-browser/google-chrome w PATH).

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

function fail(msg) { console.error('BLAD: ' + msg); process.exit(1); }

// ─── Argumenty ──────────────────────────────────────────────────────────────
const RESULTS = process.argv[2];
if (!RESULTS || !fs.existsSync(path.join(RESULTS, 'manifest.json'))) {
  fail('podaj katalog wynikow z manifest.json — np. node tests/megatest/apps/run_apps.mjs tests/megatest/results/$(date +%F) 5');
}
const SMOKE = process.argv.includes('--smoke');
const RUNS = SMOKE ? 1 : (parseInt(process.argv[3] || '0', 10) || 5);

const manifest = JSON.parse(fs.readFileSync(path.join(RESULTS, 'manifest.json'), 'utf8'));
const ladder = SMOKE ? manifest.ladder.slice(0, 1) : manifest.ladder;
const TERMS = manifest.search_terms;
console.log(`== apps == runs=${RUNS}${SMOKE ? ' (SMOKE)' : ''} szczebli=${ladder.length} par/szczebel=${manifest.pairs_per_map}`);

// ─── Chromium ───────────────────────────────────────────────────────────────
function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
    try { const p = execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (p) return p; } catch {}
  }
  return null;
}
const CHROME = findChrome();
if (!CHROME) fail('nie znaleziono Chromium/Chrome — ustaw CHROME_BIN albo zainstaluj chromium');
const CHROME_VER = execSync(`"${CHROME}" --version`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
console.log(`chrome: ${CHROME_VER}`);

// ─── Serwer statyczny ───────────────────────────────────────────────────────
// /                    -> ROOT repo (arkmap_studio.html, page_webreal.html po sciezce)
// /node_modules/*      -> tests/megatest/apps/node_modules/*
// /file?abs=<sciezka>  -> plik z dysku, TYLKO jesli jest na liscie drabinki manifestu
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.json': 'application/json', '.css': 'text/css', '.dat': 'application/octet-stream',
               '.arkmap': 'application/json', '.map': 'application/json', '.png': 'image/png',
               '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const allowlist = new Set();
for (const item of ladder) { if (item.dat) allowlist.add(path.resolve(item.dat)); if (item.arkmap) allowlist.add(path.resolve(item.arkmap)); }

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/file') {
      const abs = path.resolve(u.searchParams.get('abs') || '');
      if (!allowlist.has(abs)) { res.writeHead(403); res.end('forbidden'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' });
      fs.createReadStream(abs).pipe(res);
      return;
    }
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/arkmap_studio.html';
    let file;
    if (p.startsWith('/node_modules/')) file = path.join(__dirname, p);
    else file = path.join(ROOT, p);
    const norm = path.resolve(file);
    if (!norm.startsWith(ROOT) && !norm.startsWith(path.resolve(__dirname))) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(norm) || !fs.statSync(norm).isFile()) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(norm)] || 'application/octet-stream' });
    fs.createReadStream(norm).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
console.log(`serwer: ${BASE}`);

// ─── Chromium (puppeteer-core) ──────────────────────────────────────────────
const TMP_profile = fs.mkdtempSync(path.join('/tmp', 'apps-chrome-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
         '--js-flags=--expose-gc', '--enable-precise-memory-info',
         `--user-data-dir=${TMP_profile}`],
});

const dblraf = 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))';

function statsArr(a) {
  const s = [...a].sort((x, y) => x - y);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return { n: s.length, min: r1(s[0]), med: r1(q(0.5)), p95: r1(q(0.95)), max: r1(s[s.length - 1]) };
}
function r1(x) { return Math.round(x * 10) / 10; }

async function heapMb(page) {
  await page.evaluate(() => { if (window.gc) window.gc(); });
  const m = await page.metrics();
  return m.JSHeapUsedSize / 1048576;
}

// ─── ArkMap Studio (prawdziwe UI) ───────────────────────────────────────────
// fmt: 'arkmap' | 'dat'. W1: RUNS zimnych wczytan (swieza strona per run).
// W2/W3/W3b: w ostatniej zaladowanej stronie, RUNS przebiegow, wpState neutralny
// (dijkstra domyslnie + osobny wiersz astar; transport off, kierunki all, locki ON).
async function benchArkmap(item) {
  const loads = [], heaps = [];
  let lastPage = null;
  for (const fmt of ['arkmap', 'dat']) {
    const filePath = fmt === 'arkmap' ? item.arkmap : item.dat;
    const loadsF = [], heapsF = [];
    for (let run = 0; run < RUNS; run++) {
      const page = await browser.newPage();
      await page.goto(`${BASE}/arkmap_studio.html`, { waitUntil: 'load' });
      await page.waitForFunction("typeof findPath==='function' && typeof loadArkmap==='function' && typeof loadDat==='function' && typeof state==='object'", { timeout: 30000 });
      const h0 = await heapMb(page);
      const t = await page.evaluate(async (abs, fmt, dblrafSrc) => {
        const resp = await fetch('/file?abs=' + encodeURIComponent(abs));
        if (!resp.ok) throw new Error('fetch ' + resp.status);
        const t0 = performance.now();
        if (fmt === 'arkmap') {
          const text = await resp.text();
          await loadArkmap(text, abs.split('/').pop());
        } else {
          const buf = await resp.arrayBuffer();
          await loadDat(new File([buf], abs.split('/').pop()));
        }
        await eval(dblrafSrc);   // 2x rAF = pierwsza klatka po applyMap
        const t1 = performance.now();
        if (!state.map) throw new Error('state.map puste po load — mozliwy dialog walidacji (mapa nie jest czysta?)');
        return t1 - t0;
      }, filePath, fmt, dblraf);
      loadsF.push(r1(t));
      heapsF.push(r1((await heapMb(page)) - h0));
      await page.close();
    }
    loads.push({ fmt, ms: statsArr(loadsF), heap_mb: statsArr(heapsF) });
  }

  // Workloady: osobno dla kazdego formatu (kazdy na swiezo zaladowanej stronie).
  const wl = {};
  for (const fmt of ['arkmap', 'dat']) {
    const filePath = fmt === 'arkmap' ? item.arkmap : item.dat;
    const page = await browser.newPage();
    await page.goto(`${BASE}/arkmap_studio.html`, { waitUntil: 'load' });
    await page.waitForFunction("typeof findPath==='function' && typeof state==='object'", { timeout: 30000 });
    await page.evaluate(async (abs, fmt) => {
      const resp = await fetch('/file?abs=' + encodeURIComponent(abs));
      if (fmt === 'arkmap') await loadArkmap(await resp.text(), 'x');
      else await loadDat(new File([await resp.arrayBuffer()], 'x.dat'));
      if (!state.map) throw new Error('load fail');
    }, filePath, fmt);

    const w2 = await page.evaluate((pairs, runs) => {
      const out = {};
      for (const algo of ['dijkstra', 'astar']) {
        wpState.transportMode = 'off'; wpState.dirMode = 'all'; wpState.avoidLocked = true;
        wpState.algorithm = algo;
        const runsOut = [];
        const perPair = [];
        for (let r = 0; r < runs; r++) {
          const t0 = performance.now();
          let found = 0;
          for (const [a, b] of pairs) { const p = findPath(a, b); if (p) found++; if (r === 0) perPair.push(!!p); }
          runsOut.push({ ms: Math.round((performance.now() - t0) * 10) / 10, found });
        }
        out[algo] = { runs: runsOut, perPair };
      }
      return out;
    }, item.pairs, RUNS);

    const w3 = await page.evaluate((terms, runs) => {
      let dd = document.getElementById('wp-dd-0');
      if (!dd) { dd = document.createElement('div'); dd.id = 'wp-dd-0'; document.body.appendChild(dd); }
      const runsOut = [];
      for (let r = 0; r < runs; r++) {
        const t0 = performance.now();
        let hits = 0;
        for (const q of terms) { wpDoSearch(0, q); hits += dd.querySelectorAll('.wp-dd-item').length; }
        runsOut.push({ ms: Math.round((performance.now() - t0) * 10) / 10, hits });
      }
      return runsOut;
    }, TERMS, RUNS);

    const w3b = await page.evaluate((runs) => {
      const runsOut = [];
      for (let r = 0; r < runs; r++) {
        const t0 = performance.now();
        const tab = {};
        for (const [id, room] of Object.entries(state.roomById)) tab[id] = room.name || '';
        runsOut.push({ ms: Math.round((performance.now() - t0) * 10) / 10, keys: Object.keys(tab).length });
      }
      return runsOut;
    }, RUNS);

    wl[fmt] = { w2, w3, w3b };
    await page.close();
  }
  return { loads, wl };
}

// ─── web-real (mudlet-map-renderer, ich prawdziwy pipeline) ─────────────────
// W1: RUNS zimnych wczytan (swieza strona per run): parse + materialize + graf.
// W2: ich PathFinder, dijkstra (ich domyslna) + astar; SWIEZA instancja per run
//     (ich findPath ma cache per instancja). W3: N/A (brak natywnego API — kod).
// W3b: getRooms() -> id->name.
async function benchWebreal(item) {
  const loads = [], heaps = [];
  let w2 = null, w3b = null;
  for (let run = 0; run < RUNS; run++) {
    const page = await browser.newPage();
    await page.goto(`${BASE}/tests/megatest/apps/page_webreal.html`, { waitUntil: 'load' });
    await page.waitForFunction('window.__wrReady === true', { timeout: 60000 });
    const h0 = await heapMb(page);
    const w1 = await page.evaluate(async (abs) => {
      const resp = await fetch('/file?abs=' + encodeURIComponent(abs));
      if (!resp.ok) throw new Error('fetch ' + resp.status);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      return await window.__wr.load(bytes);
    }, item.dat);
    loads.push(w1);
    heaps.push(r1((await heapMb(page)) - h0));

    if (run === 0) {
      w2 = await page.evaluate((pairs, runs) => {
        const out = {};
        for (const algo of ['dijkstra', 'astar']) {
          const runsOut = window.__wr.path(pairs, algo, runs);
          out[algo] = { runs: runsOut.map(({ ms, found }) => ({ ms, found })),
                        paths0: runsOut[0].paths };
        }
        return out;
      }, item.pairs, RUNS);
      w3b = await page.evaluate((runs) => window.__wr.iter(runs), RUNS);
    }
    await page.close();
  }
  return {
    w1: { parse_ms: statsArr(loads.map(l => l.parse_ms)),
          materialize_ms: statsArr(loads.map(l => l.materialize_ms)),
          graph_ms: statsArr(loads.map(l => l.graph_ms)),
          total_ms: statsArr(loads.map(l => l.total_ms)),
          mode: loads[0].mode },
    heap_mb: statsArr(heaps),
    w2, w3b,
  };
}

// ─── Gate semantyczny ───────────────────────────────────────────────────────
// 1) apps_arkmap found MUSI sie zgadzac z desktopem (paritet potwierdzony wczesniej).
// 2) web-real IGNORUJE locki pokoi (potwierdzone w kodzie: zero isLocked w bundlu),
//    wiec moze znalezc wiecej — ale kazda rozbieznosc musi wynikac ze sciezki
//    przez locked pokoj. Inna rozbieznosc = BLAD testu.
function lockedSet(item) {
  const m = JSON.parse(fs.readFileSync(item.arkmap, 'utf8'));
  const s = new Set();
  for (const r of Object.values(m.rooms || {})) if (r.locked) s.add(r.id);
  return s;
}

function gate(item, arkWl, webWl, deskFound) {
  const problems = [];
  const arkFound = arkWl.arkmap.w2.dijkstra.perPair;
  const webPaths = webWl.w2.dijkstra.paths0;
  const locked = lockedSet(item);
  if (deskFound != null) {
    const af = arkFound.filter(Boolean).length;
    if (af !== deskFound) problems.push(`arkmap found=${af} != desktop found=${deskFound}`);
  }
  for (let i = 0; i < item.pairs.length; i++) {
    const a = arkFound[i], w = !!webPaths[i];
    if (a && !w) problems.push(`para ${item.pairs[i]}: arkmap znalazl, web-real NIE — nieoczekiwane`);
    if (!a && w) {
      const przezLocked = webPaths[i].some(id => locked.has(id));
      if (!przezLocked) problems.push(`para ${item.pairs[i]}: web-real znalazl, arkmap nie, a sciezka NIE idzie przez locked — nieoczekiwane`);
    }
  }
  return problems;
}

// ─── Petla glowna ───────────────────────────────────────────────────────────
const deskRows = (() => { try { return JSON.parse(fs.readFileSync(path.join(RESULTS, 'results_desktop.json'), 'utf8')); } catch { return null; } })();
if (!deskRows) console.warn('! brak results_desktop.json — gate arkmap==desktop wylaczony (tylko gate lockow)');

const out = {
  meta: {
    tool: 'apps (natywne silniki w headless Chromium)',
    n_runs: RUNS, date: new Date().toISOString(),
    chrome: CHROME_VER, node: process.version,
    packages: { 'mudlet-map-renderer': '2.6.1', 'mudlet-map-binary-reader': '1.3.0' },
    note: 'arkmap: prawdziwe UI (findPath/wpDoSearch, wpState neutralny). web-real: ich reader+MapReader+PathFinder; W3 N/A (brak natywnego API); PathFinder cache neutralizowany swieza instancja per run. web-real ignoruje locki pokoi (kod) — rozbieznosci found przez locked pokoje sa OCZEKIWANE.',
  },
  sets: {},
};

let gateFails = 0;
for (const item of ladder) {
  console.log(`— ${item.name} (${item.rooms} pokoi) —`);
  const t0 = Date.now();
  const ark = await benchArkmap(item);
  const web = await benchWebreal(item);
  const deskFound = deskRows ? (deskRows.filter(r => r.file === item.name)[0]?.path_found ?? null) : null;

  const problems = gate(item, ark.wl, web, deskFound);
  for (const p of problems) { console.error('  GATE: ' + p); gateFails++; }

  const wlStats = w => ({
    w2: Object.fromEntries(Object.entries(w.w2).map(([algo, d]) => [algo, { ms: statsArr(d.runs.map(r => r.ms)), found: d.runs[0].found }])),
    w3: { ms: statsArr(w.w3.map(r => r.ms)), hits: w.w3[0].hits },
    w3b: { ms: statsArr(w.w3b.map(r => r.ms)), keys: w.w3b[0].keys },
  });
  out.sets[item.name] = {
    rooms: item.rooms,
    arkmap: Object.fromEntries(ark.loads.map(l => [l.fmt === 'arkmap' ? 'arkmap_file' : 'dat_file', { load_ms: l.ms, heap_mb: l.heap_mb }]))
      , arkmap_wl: { arkmap: wlStats(ark.wl.arkmap), dat: wlStats(ark.wl.dat) },
    webreal: {
      w1: web.w1, heap_mb: web.heap_mb,
      w2: Object.fromEntries(Object.entries(web.w2).map(([algo, d]) => [algo, { ms: statsArr(d.runs.map(r => r.ms)), found: d.runs[0].found }])),
      w3b: { ms: statsArr(web.w3b.map(r => r.ms)), keys: web.w3b[0].keys },
    },
    gate: { problems: problems.length, desk_found: deskFound,
            arkmap_found: ark.wl.arkmap.w2.dijkstra.perPair.filter(Boolean).length,
            webreal_found: web.w2.dijkstra.runs[0].found },
  };
  console.log(`  arkmap .arkmap load=${out.sets[item.name].arkmap.arkmap_file.load_ms.med}ms .dat=${out.sets[item.name].arkmap.dat_file.load_ms.med}ms | web-real=${web.w1.total_ms.med}ms (${web.w1.mode}) | found: arkmap=${out.sets[item.name].gate.arkmap_found} web=${out.sets[item.name].gate.webreal_found} desk=${deskFound} | ${Date.now() - t0}ms`);
}

fs.writeFileSync(path.join(RESULTS, 'results_apps.json'), JSON.stringify(out, null, 1));
console.log(`\nwyniki: ${path.join(RESULTS, 'results_apps.json')}`);

await browser.close();
server.close();
fs.rmSync(TMP_profile, { recursive: true, force: true });
if (gateFails) fail(`gate semantyczny: ${gateFails} problemow — patrz wyzej`);
console.log('OK — faza apps zakonczona, gate zielony');
