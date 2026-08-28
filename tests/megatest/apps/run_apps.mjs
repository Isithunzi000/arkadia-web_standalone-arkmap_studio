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
// Ta sama konwencja co perf lab (tests/perf/run.sh): CHROMIUM_BIN/CHROME_BIN ->
// .chrome-hs w repo -> ~/.local/chrome-hs -> systemowe. Pobieranie
// chrome-headless-shell: patrz tests/perf/README.md (jedna komenda).
function findChrome() {
  for (const env of ['CHROMIUM_BIN', 'CHROME_BIN']) {
    if (process.env[env] && fs.existsSync(process.env[env])) return process.env[env];
  }
  const home = process.env.HOME || '';
  for (const c of [
    path.join(ROOT, '.chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell'),
    path.join(home, '.local/chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell'),
  ]) { if (fs.existsSync(c)) return c; }
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
    try { const p = execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (p) return p; } catch {}
  }
  return null;
}
const CHROME = findChrome();
if (!CHROME) fail('nie znaleziono przegladarki — pobierz chrome-headless-shell (tests/perf/README.md) albo ustaw CHROMIUM_BIN');
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
  protocolTimeout: 900000,   // 15 min — applyMap na 432k pokoi moze trwac dlugo
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
         '--js-flags=--expose-gc', '--enable-precise-memory-info',
         `--user-data-dir=${TMP_profile}`],
});

// rAF w chrome-headless-shell moze nie strzelac (brak pompy klatek) — czekamy
// na pierwsza klatke z twardym sufitem 5 s i rejestrujemy, czy przyszla.
const FRAME_WAIT = `Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true)))),new Promise(r=>setTimeout(()=>r(false),5000))])`;

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
  for (const fmt of ['arkmap', 'dat']) {
    const filePath = fmt === 'arkmap' ? item.arkmap : item.dat;
    const loadsF = [], heapsF = [];
    const valDialogs = [];
    for (let run = 0; run < RUNS; run++) {
      const page = await browser.newPage();
      page.on('console', m => { const t = m.text(); if (t.startsWith('[apps]')) console.log('  page:', t); });
      console.log(`  W1 ${fmt} run ${run + 1}/${RUNS}: goto...`);
      await page.goto(`${BASE}/arkmap_studio.html`, { waitUntil: 'load' });
      await page.waitForFunction("typeof findPath==='function' && typeof loadArkmap==='function' && typeof loadDat==='function' && typeof state==='object'", { timeout: 30000 });
      // Dialog walidacji to interaktywny prompt UI, nie koszt mapy — prawdziwa mapa
      // Arkadii ma ostrzezenia (supresory itp.) i dialog zawiesilby pomiar na kliku.
      // Auto-akceptujemy i REJESTRUJEMY (trafia do wynikow jako val_dialogs).
      await page.evaluate(() => {
        window.__valDialogs = [];
        window.showValDialog = (valRes, chkRes, filename, isFatal, suppMissing) => {
          window.__valDialogs.push({ filename: String(filename), isFatal: !!isFatal,
            errors: (valRes && valRes.errors || []).length, warnings: (valRes && valRes.warnings || []).length,
            crcOk: chkRes && ('ok' in chkRes) ? !!chkRes.ok : null, supp: (suppMissing || []).length });
          return Promise.resolve(true);
        };
      });
      console.log(`  W1 ${fmt} run ${run + 1}/${RUNS}: strona gotowa, load...`);
      const h0 = await heapMb(page);
      const t = await page.evaluate(async (abs, fmt, frameWaitSrc) => {
        console.log('[apps] fetch...');
        const resp = await fetch('/file?abs=' + encodeURIComponent(abs));
        if (!resp.ok) throw new Error('fetch ' + resp.status);
        console.log('[apps] load ' + fmt + '...');
        const t0 = performance.now();
        if (fmt === 'arkmap') {
          const text = await resp.text();
          console.log('[apps] text ok, loadArkmap...');
          await loadArkmap(text, abs.split('/').pop());
        } else {
          const buf = await resp.arrayBuffer();
          console.log('[apps] buf ok, loadDat...');
          await loadDat(new File([buf], abs.split('/').pop()));
        }
        console.log('[apps] load ok, czekam na klatke...');
        const t1 = performance.now();          // koniec applyMap = mapa gotowa
        const frameOk = await eval(frameWaitSrc);  // pierwsza klatka, sufit 5 s
        const t2 = performance.now();
        if (!state.map) throw new Error('state.map puste po load — mozliwy dialog walidacji (mapa nie jest czysta?)');
        // P3b (fala 3): weryfikacja CRC/baseInfo odbywa sie po pierwszej klatce.
        // Hak __arkmapVerifiedAt (performance.now po stronie strony) — sufit 10 s.
        let verifiedAt = null;
        const vDeadline = performance.now() + 10000;
        while (verifiedAt == null && performance.now() < vDeadline) {
          verifiedAt = window.__arkmapVerifiedAt;
          if (verifiedAt == null) await new Promise(r => setTimeout(r, 25));
        }
        return { total_ms: t2 - t0, apply_ms: t1 - t0, frame_ok: frameOk,
                 verified_ms: verifiedAt != null ? verifiedAt - t0 : null };
      }, filePath, fmt, FRAME_WAIT);
      loadsF.push(t);
      heapsF.push(r1((await heapMb(page)) - h0));
      const vd = await page.evaluate(() => window.__valDialogs || []);
      if (vd.length) valDialogs.push(...vd);
      console.log(`  W1 ${fmt} run ${run + 1}/${RUNS}: ${r1(t.total_ms)}ms (apply ${r1(t.apply_ms)}ms, verified ${t.verified_ms != null ? r1(t.verified_ms) + 'ms' : 'MISS'}, klatka ${t.frame_ok ? 'ok' : 'timeout 5s'})${vd.length ? ' DIALOG: ' + JSON.stringify(vd) : ''}`);
      await page.close();
    }
    loads.push({ fmt, ms: statsArr(loadsF.map(x => r1(x.total_ms))),
                 apply_ms: statsArr(loadsF.map(x => r1(x.apply_ms))),
                 verified_ms: statsArr(loadsF.filter(x => x.verified_ms != null).map(x => r1(x.verified_ms))),
                 verified_miss: loadsF.filter(x => x.verified_ms == null).length,
                 frames_ok: loadsF.filter(x => x.frame_ok).length,
                 heap_mb: statsArr(heapsF), val_dialogs: valDialogs });
  }

  // Workloady: tylko na zaladowanym .arkmap — po applyMap model w pamieci jest
  // identyczny dla obu formatow (to sedno paritetu), wiec W2/W3/W3b na .dat
  // daloby te same liczby przy dwojnej cenie. Format rozroznia W1 i W4.
  const wl = {};
  {
    const filePath = item.arkmap;
    const page = await browser.newPage();
    page.on('console', m => { const t = m.text(); if (t.startsWith('[apps]')) console.log('  page:', t); });
    console.log('  workloads: goto...');
    await page.goto(`${BASE}/arkmap_studio.html`, { waitUntil: 'load' });
    await page.waitForFunction("typeof findPath==='function' && typeof state==='object'", { timeout: 30000 });
    await page.evaluate(() => { // auto-akceptacja dialogu walidacji (jak w W1)
      window.showValDialog = () => Promise.resolve(true);
    });
    console.log('  workloads: loadArkmap...');
    await page.evaluate(async (abs) => {
      const resp = await fetch('/file?abs=' + encodeURIComponent(abs));
      console.log('[apps] wl: text ok, loadArkmap...');
      await loadArkmap(await resp.text(), 'x');
      if (!state.map) throw new Error('load fail');
      console.log('[apps] wl: load ok, rooms=' + Object.keys(state.roomById).length);
    }, filePath);
    console.log('  workloads: mapa zaladowana');

    // W2 per (algo, run) — osobne evaluate: dijkstraPath apki na 432k pokoi
    // moze trwac minuty; jedno dlugie evaluate grozi protocolTimeout.
    const w2 = {};
    for (const algo of ['dijkstra', 'astar']) {
      const runsOut = [];
      const perPair = [];
      for (let r = 0; r < RUNS; r++) {
        const res = await page.evaluate((pairs, algo, first) => {
          wpState.transportMode = 'off'; wpState.dirMode = 'all'; wpState.avoidLocked = true;
          wpState.algorithm = algo;
          const t0 = performance.now();
          let found = 0; const pp = [];
          for (const [a, b] of pairs) { const p = findPath(a, b); if (p) found++; if (first) pp.push(!!p); }
          return { ms: Math.round((performance.now() - t0) * 10) / 10, found, pp };
        }, item.pairs, algo, r === 0);
        runsOut.push({ ms: res.ms, found: res.found });
        if (r === 0) perPair.push(...res.pp);
        console.log(`  W2 arkmap ${algo} run ${r + 1}/${RUNS}: ${res.ms}ms found=${res.found}`);
      }
      w2[algo] = { runs: runsOut, perPair };
    }

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

    wl.w2 = w2; wl.w3 = w3; wl.w3b = w3b;
    await page.close();
  }
  return { loads, wl };
}

// ─── web-real (mudlet-map-renderer, ich prawdziwy pipeline) ─────────────────
// W1: RUNS zimnych wczytan (swieza strona per run): parse + materialize + graf.
// W2: ich PathFinder, dijkstra (ich domyslna) + astar; SWIEZA instancja per run
//     (ich findPath ma cache per instancja). W3: N/A (brak natywnego API — kod).
// W3b: getRooms() -> id->name.
// SKELETON (auto powyzej 50k pokoi): SkeletonMapReader.getRooms() zwraca [] —
// udowodnione w kodzie (dist/SkeletonMapReader-*.js: "getRooms() { return []; }").
// Ich MapGraph.buildGraph iteruje getRooms(), wiec graf jest PUSTY: PathFinder
// i iteracja sa natywnie N/A. Mierzymy wtedy dodatkowo wymuszony plain
// (parseMudletMap(buf, {mode:'plain'})) jako wiersz INFORMACYJNY — pokazuje,
// co ich silnik potrafi, gdyby nie natywne ograniczenie trybu.
async function webW2(page, item, tag) {
  // per (algo, run) — osobne evaluate (jak po stronie arkmap): ich Dijkstra
  // na 432k pokoi tez moze przekroczyc protocolTimeout w jednym calu.
  const w2 = {};
  for (const algo of ['dijkstra', 'astar']) {
    const runsOut = [];
    let paths0 = null;
    for (let r = 0; r < RUNS; r++) {
      const res = await page.evaluate((pairs, algo) => window.__wr.path(pairs, algo, 1)[0], item.pairs, algo);
      runsOut.push({ ms: res.ms, found: res.found });
      if (r === 0) paths0 = res.paths;
      console.log(`  W2 webreal${tag} ${algo} run ${r + 1}/${RUNS}: ${res.ms}ms found=${res.found}`);
    }
    w2[algo] = { runs: runsOut, paths0 };
  }
  return w2;
}

async function benchWebreal(item) {
  const loads = [], heaps = [];
  let w2 = null, w3b = null, mode0 = null, sanityFound = null;
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
      mode0 = w1.mode;
      console.log(`  web-real: tryb natywny=${mode0}, getRooms()=${w1.rooms}`);
      if (mode0 === 'skeleton') {
        // Sanity: jeden run dijkstry na pustym grafie — MUSI dac found=0.
        const res = await page.evaluate((pairs) => window.__wr.path(pairs, 'dijkstra', 1)[0], item.pairs);
        sanityFound = res.found;
        console.log(`  web-real: skeleton — PathFinder natywnie N/A (sanity found=${sanityFound})`);
      }
    }
    await page.close();
  }
  const out = {
    w1: { parse_ms: statsArr(loads.map(l => l.parse_ms)),
          materialize_ms: statsArr(loads.map(l => l.materialize_ms)),
          graph_ms: statsArr(loads.map(l => l.graph_ms)),
          total_ms: statsArr(loads.map(l => l.total_ms)),
          mode: mode0, rooms_reader: loads[0].rooms },
    heap_mb: statsArr(heaps),
    w2: null, w3b: null,
  };
  if (mode0 === 'skeleton') {
    out.sanity_found = sanityFound;
    // Wymuszony plain — wiersz informacyjny (NIE natywny): pelny reader + PathFinder.
    console.log('  web-real: wymuszony plain (informacyjnie)...');
    const page = await browser.newPage();
    try {
      await page.goto(`${BASE}/tests/megatest/apps/page_webreal.html`, { waitUntil: 'load' });
      await page.waitForFunction('window.__wrReady === true', { timeout: 60000 });
      const loadsP = [], heapsP = [];
      let w2p = null, w3bp = null;
      for (let run = 0; run < RUNS; run++) {
        const pg = run === 0 ? page : await browser.newPage();
        if (run > 0) {
          await pg.goto(`${BASE}/tests/megatest/apps/page_webreal.html`, { waitUntil: 'load' });
          await pg.waitForFunction('window.__wrReady === true', { timeout: 60000 });
        }
        const h0 = await heapMb(pg);
        const w1 = await pg.evaluate(async (abs) => {
          const resp = await fetch('/file?abs=' + encodeURIComponent(abs));
          if (!resp.ok) throw new Error('fetch ' + resp.status);
          const bytes = new Uint8Array(await resp.arrayBuffer());
          return await window.__wr.load(bytes, { mode: 'plain' });
        }, item.dat);
        loadsP.push(w1);
        heapsP.push(r1((await heapMb(pg)) - h0));
        console.log(`  W1 webreal-plain run ${run + 1}/${RUNS}: ${w1.total_ms}ms (rooms=${w1.rooms})`);
        if (run === 0) {
          w2p = await webW2(pg, item, '-plain');
          w3bp = await pg.evaluate((runs) => window.__wr.iter(runs), RUNS);
        }
        if (run > 0) await pg.close();
      }
      out.plain_forced = {
        w1: { parse_ms: statsArr(loadsP.map(l => l.parse_ms)),
              materialize_ms: statsArr(loadsP.map(l => l.materialize_ms)),
              graph_ms: statsArr(loadsP.map(l => l.graph_ms)),
              total_ms: statsArr(loadsP.map(l => l.total_ms)),
              mode: loadsP[0].mode, rooms_reader: loadsP[0].rooms },
        heap_mb: statsArr(heapsP),
        w2: w2p, w3b: w3bp,
      };
    } catch (e) {
      // np. OOM przy 432k pokoi — zapisujemy stan, nie wywalamy fazy
      console.warn('  ! web-real plain wymuszony niedostepny: ' + e.message);
      out.plain_forced = { error: String(e.message || e) };
    }
    await page.close().catch(() => {});
  } else {
    // plain natywnie: pelne W2/W3b na tej samej (swiezej) stronie
    const page = await browser.newPage();
    await page.goto(`${BASE}/tests/megatest/apps/page_webreal.html`, { waitUntil: 'load' });
    await page.waitForFunction('window.__wrReady === true', { timeout: 60000 });
    await page.evaluate(async (abs) => {
      const resp = await fetch('/file?abs=' + encodeURIComponent(abs));
      const bytes = new Uint8Array(await resp.arrayBuffer());
      await window.__wr.load(bytes);
    }, item.dat);
    w2 = await webW2(page, item, '');
    w3b = await page.evaluate((runs) => window.__wr.iter(runs), RUNS);
    await page.close();
    out.w2 = w2; out.w3b = w3b;
  }
  return out;
}

// ─── Gate semantyczny ───────────────────────────────────────────────────────
// 1) apps_arkmap found MUSI sie zgadzac z desktopem (paritet potwierdzony wczesniej).
// 2) web-real IGNORUJE locki pokoi (potwierdzone w kodzie: zero isLocked w bundlu),
//    wiec moze znalezc wiecej — ale kazda rozbieznosc musi wynikac ze sciezki
//    przez locked pokoj. Inna rozbieznosc = BLAD testu.
// 3) SKELETON (auto >50k pokoi): ich getRooms()=[] (kod), graf pusty, pathfinding
//    natywnie N/A — found=0 to stan OCZEKIWANY, nie rozbieznosc. Gate parowy
//    stosujemy wtedy do wiersza wymuszonego plain (jego semantyka = plain).
function lockedSet(item) {
  const m = JSON.parse(fs.readFileSync(item.arkmap, 'utf8'));
  const s = new Set();
  const add = r => { if (r.locked) s.add(r.id); };
  if (m.rooms) for (const r of Object.values(m.rooms)) add(r);           // plaski uklad (starsze fixture'y)
  for (const a of m.areas || []) for (const r of a.rooms || []) add(r);  // docelowy uklad: areas[].rooms[]
  return s;
}

function gate(item, arkWl, webWl, deskFound) {
  const problems = [];
  const arkFound = arkWl.w2.dijkstra.perPair;
  const locked = lockedSet(item);
  if (deskFound != null) {
    const af = arkFound.filter(Boolean).length;
    if (af !== deskFound) problems.push(`arkmap found=${af} != desktop found=${deskFound}`);
  }
  const skeleton = webWl.w1.mode === 'skeleton';
  if (skeleton) {
    if (webWl.sanity_found !== 0) problems.push(`skeleton: sanity found=${webWl.sanity_found} != 0 — pusty graf to stan oczekiwany`);
  }
  const webPaths = skeleton
    ? (webWl.plain_forced && webWl.plain_forced.w2 ? webWl.plain_forced.w2.dijkstra.paths0 : null)
    : webWl.w2.dijkstra.paths0;
  const tag = skeleton ? 'web-plain!' : 'web-real';
  if (!webPaths) { if (!skeleton) problems.push('brak sciezek web-real do gate'); }
  else for (let i = 0; i < item.pairs.length; i++) {
    const a = arkFound[i], w = !!webPaths[i];
    if (a && !w) problems.push(`para ${item.pairs[i]}: arkmap znalazl, ${tag} NIE — nieoczekiwane`);
    if (!a && w) {
      const przezLocked = webPaths[i].some(id => locked.has(id));
      if (!przezLocked) problems.push(`para ${item.pairs[i]}: ${tag} znalazl, arkmap nie, a sciezka NIE idzie przez locked — nieoczekiwane`);
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
    note: 'arkmap: prawdziwe UI (findPath/wpDoSearch, wpState neutralny). web-real: ich reader+MapReader+PathFinder; W3 N/A (brak natywnego API); PathFinder cache neutralizowany swieza instancja per run. web-real ignoruje locki pokoi (kod) — rozbieznosci found przez locked pokoje sa OCZEKIWANE. Powyzej 50k pokoi natywny auto-mode przechodzi w skeleton: SkeletonMapReader.getRooms()=[] (kod), wiec PathFinder/iteracja sa natywnie N/A — wowczas mierzymy wymuszony plain jako wiersz informacyjny (plain_forced).',
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
  const skeleton = web.w1.mode === 'skeleton';
  const w2sum = w2 => w2 ? Object.fromEntries(Object.entries(w2).map(([algo, d]) => [algo, { ms: statsArr(d.runs.map(r => r.ms)), found: d.runs[0].found }])) : null;
  const w3bsum = w3b => w3b ? { ms: statsArr(w3b.map(r => r.ms)), keys: w3b[0].keys } : null;
  const webFound = skeleton
    ? (web.plain_forced && web.plain_forced.w2 ? web.plain_forced.w2.dijkstra.runs[0].found : null)
    : web.w2.dijkstra.runs[0].found;
  out.sets[item.name] = {
    rooms: item.rooms,
    arkmap: Object.fromEntries(ark.loads.map(l => [l.fmt === 'arkmap' ? 'arkmap_file' : 'dat_file',
      { load_ms: l.ms, apply_ms: l.apply_ms, verified_ms: l.verified_ms, verified_miss: l.verified_miss, frames_ok: l.frames_ok, heap_mb: l.heap_mb }]))
      , arkmap_wl: { arkmap: wlStats(ark.wl) },
    webreal: skeleton ? {
      w1: web.w1, heap_mb: web.heap_mb, sanity_found: web.sanity_found,
      w2: null, w3b: null,   // natywnie N/A: getRooms()=[] w skeleton (kod)
      plain_forced: web.plain_forced && web.plain_forced.w1 ? {
        w1: web.plain_forced.w1, heap_mb: web.plain_forced.heap_mb,
        w2: w2sum(web.plain_forced.w2), w3b: w3bsum(web.plain_forced.w3b),
      } : { error: (web.plain_forced && web.plain_forced.error) || 'niedostepny' },
    } : {
      w1: web.w1, heap_mb: web.heap_mb,
      w2: w2sum(web.w2),
      w3b: w3bsum(web.w3b),
    },
    gate: { problems: problems.length, desk_found: deskFound,
            arkmap_found: ark.wl.w2.dijkstra.perPair.filter(Boolean).length,
            webreal_found: skeleton ? 0 : webFound,
            webplain_found: skeleton ? webFound : null },
  };
  console.log(`  arkmap .arkmap load=${out.sets[item.name].arkmap.arkmap_file.load_ms.med}ms .dat=${out.sets[item.name].arkmap.dat_file.load_ms.med}ms | web-real=${web.w1.total_ms.med}ms (${web.w1.mode})${skeleton ? ' +plain=' + (web.plain_forced && web.plain_forced.w1 ? web.plain_forced.w1.total_ms.med + 'ms' : 'N/A') : ''} | found: arkmap=${out.sets[item.name].gate.arkmap_found} web=${out.sets[item.name].gate.webreal_found}${skeleton ? ' webplain=' + webFound : ''} desk=${deskFound} | ${Date.now() - t0}ms`);
}

fs.writeFileSync(path.join(RESULTS, 'results_apps.json'), JSON.stringify(out, null, 1));
console.log(`\nwyniki: ${path.join(RESULTS, 'results_apps.json')}`);

await browser.close();
server.close();
fs.rmSync(TMP_profile, { recursive: true, force: true });
if (gateFails) fail(`gate semantyczny: ${gateFails} problemow — patrz wyzej`);
console.log('OK — faza apps zakonczona, gate zielony');
