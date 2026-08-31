// Harness fali 1 (P1+P2) — cache adjacency planera + admisybilna heurystyka A* cross-area.
// Snapshot różnicowy: bc422338a3b895c3c2dba095faaa677e6f16b801 (stan sprzed fali 1). Uruchamianie z katalogu głównego repo.
//
// Kontrakt cache'u: mutacje mapy MUSZĄ podbijać state.editRev (albo podmienić roomById
// — applyMap tworzy nowy obiekt). Mutacja bez editRev to błąd wywołującego (stale cache).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const OLD = execSync('git show bc422338a3b895c3c2dba095faaa677e6f16b801:arkmap_studio.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) {
  console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
  process.exit(2);
}
const DAT = fs.readFileSync(FIX);

// ── Ekstrakcja verbatim (jak dir_filter) ────────────────────────────────────
function dirsBlock(html) {
  const a = html.indexOf('const DIRS = [');
  const b = html.indexOf("const DIR_BY_IDX");
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice DIRS');
  const eol = html.indexOf('\n', b);
  return html.slice(a, eol);
}
function pathfindingBlock(html) {
  const a = html.indexOf('// Binarny min-heap');
  const b = html.indexOf('// Licz kroki przez special_exits');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice pathfindingu');
  return html.slice(a, b);
}
function formatLayer(html) {
  const a = html.indexOf('// ── constants.js ──');
  const b = html.indexOf('// ── main ──');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice warstwy formatu');
  const c = html.indexOf('const ANSI_PAL = buildAnsiPal();');
  const d = html.indexOf('function buildColorCache');
  if (c < 0 || d < 0 || d <= c) throw new Error('kotwice DEPS');
  return html.slice(a, b) + '\n' + html.slice(c, d);
}

function buildApi(html) {
  const code = dirsBlock(html) + '\n' + pathfindingBlock(html) +
    '\n;return { dijkstraPath, astarPath, findPath, _recomputeAstarParams, _edgeWeight, DIR_BY_SHORT' +
    (html.includes('function _dirAllowed') ? ', _dirAllowed' : '') + ' };';
  return new Function('state', 'wpState', code);
}

function mkState() { return { roomById: {}, roomArea: {}, astarParams: null, editMode: false }; }

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }
const J = JSON.stringify;

// Koszt ścieżki semantyką silnika: per krok MIN waga spośród krawędzi cur→nxt
// (relaksacja bierze najtańszą; przy kolizji kluczy SE>exits — waga i tak z exit_weights[dir]).
function pathCost(state, p) {
  if (!p) return null;
  let c = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const r = state.roomById[p[i]];
    const nxt = +p[i + 1];
    let best = Infinity, found = false;
    const scan = (obj) => {
      if (!obj) return;
      for (const dir in obj) {
        if (+obj[dir] !== nxt) continue;
        found = true;
        const ew = r.exit_weights?.[dir];
        const w = (ew !== undefined && ew > 0) ? ew : Math.max(state.roomById[nxt]?.weight ?? 1, 1);
        if (w < best) best = w;
      }
    };
    scan(r.exits); scan(r.special_exits);
    if (!found) return NaN; // krok nie po krawędzi (hop transportowy) — poza zakresem harnessa
    c += best;
  }
  return c;
}

// Ścieżka valid: każdy krok po dozwolonej krawędzi (istnieje, niezlockowana, klasa OK dla trybu).
function pathValid(state, wp, p) {
  if (!p) return false;
  for (let i = 0; i < p.length - 1; i++) {
    const r = state.roomById[p[i]];
    const nxt = +p[i + 1];
    const xl = new Set(r.exit_locks || []), sl = new Set(r.special_exit_locks || []);
    let okEdge = false;
    const scan = (obj, isSe) => {
      if (!obj) return;
      for (const dir in obj) {
        if (+obj[dir] !== nxt) continue;
        if (xl.has(dir) || sl.has(dir)) continue;
        let allowed;
        if (isSe || (r.special_exits && Object.prototype.hasOwnProperty.call(r.special_exits, dir))) {
          allowed = wp.dirMode === 'all';
        } else {
          const d = { n: 1, ne: 2, e: 3, se: 4, s: 5, sw: 6, w: 7, nw: 8, up: 9, down: 10, in: 11, out: 12 }[dir];
          allowed = d === undefined ? wp.dirMode === 'all' : (d <= 8 ? true : wp.dirMode !== 'cardinal');
        }
        if (allowed) okEdge = true;
      }
    };
    scan(r.exits, false); scan(r.special_exits, true);
    if (!okEdge) return false;
  }
  return true;
}

// ── Graf syntetyczny cross-area ─────────────────────────────────────────────
// Obszar A: 1—2—3 (e, koszt 1); portal specjalny 3→9; obszar B: 9—8—7 (e).
// Te same współrzędne w A i B (odrębne przestrzenie). Obszar C: 20 — niespójny.
// Pokój 5: 1→5 (n, waga 50 przez exit_weights) i 1→4→5 tanim objazdem (2×1).
function mkSyntheticCross() {
  const state = mkState();
  const R = (id, area, x, y, extra) => {
    state.roomById[id] = Object.assign({ id, x, y, z: 0 }, extra);
    state.roomArea[id] = area;
  };
  R(1, 'A', 0, 0, { exits: { e: 2, n: 5 }, exit_weights: { n: 50 } });
  R(2, 'A', 1, 0, { exits: { w: 1, e: 3 } });
  R(3, 'A', 2, 0, { exits: { w: 2 }, special_exits: { 'przejdz przez portal': 9 } });
  R(4, 'A', 0, 1, { exits: { s: 1, e: 5 } });
  R(5, 'A', 0, 2, { exits: { w: 4 } });
  R(9, 'B', 0, 0, { exits: { e: 8 } });
  R(8, 'B', 1, 0, { exits: { w: 9, e: 7 } });
  R(7, 'B', 2, 0, { exits: { w: 8 } });
  R(20, 'C', 0, 0, {});
  // uzupełnij 1→4: brakująca krawędź n (1 ma n:5 z waga 50; 4 lezy "pod" 1)
  state.roomById[1].exits.s = 4;
  return state;
}

console.log('── T1: syntetyk cross-area — A* (dwupoziomowa) ≡ Dijkstra kosztem, found ≡ stary kod ──');
{
  const wp = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off', avoidLocked: false };
  const sN = mkSyntheticCross(); const aN = buildApi(NEW)(sN, wp); aN._recomputeAstarParams();
  const sO = mkSyntheticCross(); const aO = buildApi(OLD)(sO, { algorithm: 'dijkstra', dirMode: 'all' });

  const dN = aN.dijkstraPath(1, 7), aNPath = aN.astarPath(1, 7);
  const dO = aO.dijkstraPath(1, 7);
  ok(J(dN) === J(dO), '1→7 cross-area: Dijkstra NOWY ≡ STARY bitowo');
  ok(aNPath !== null && pathCost(sN, aNPath) === pathCost(sN, dN),
    `1→7 cross-area: A* koszt ≡ Dijkstra (${pathCost(sN, aNPath)})`);
  ok(aNPath && aNPath.includes(9), '1→7 cross-area: A* przechodzi przez portal (9)');

  // niespójny obszar C: szybkie null (graf obszarów), zgodnie ze starym kodem
  ok(aN.astarPath(1, 20) === null && aN.dijkstraPath(1, 20) === null && aO.dijkstraPath(1, 20) === null,
    '1→20 (obszar niespójny): null w A*/Dijkstrze, zgodnie ze starym');

  // wagi: 1→5 bezpośrednio kosztuje 50 (exit_weights), objazd 1→4→5 kosztuje 2
  const dW = aN.dijkstraPath(1, 5), aW = aN.astarPath(1, 5);
  ok(J(dW) === J([1, 4, 5]), '1→5: objazd tani [1,4,5] (exit_weights.n=50 przegrywa)');
  ok(pathCost(sN, aW) === 2, '1→5: A* koszt 2 (≡ Dijkstra)');

  // dirMode: portal specjalny tylko w 'all'
  wp.dirMode = 'cardinal';
  ok(aN.astarPath(1, 7) === null && aN.dijkstraPath(1, 7) === null, 'cardinal: portal odrzucony — null (oba)');
  wp.dirMode = 'all';
}

console.log('── T2: unieważnianie cache — editRev++ i podmiana roomById ──');
{
  const wp = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off', avoidLocked: false };
  const state = mkSyntheticCross();
  const api = buildApi(NEW)(state, wp);
  const p1 = api.dijkstraPath(1, 5);
  ok(J(p1) === J([1, 4, 5]), 'przed mutacją: [1,4,5]');
  // mutacja: ścięcie objazdu 4→5 + editRev++ → wygrywa droga bezpośrednia (50)
  delete state.roomById[4].exits.e;
  state.editRev = (state.editRev || 0) + 1;
  const p2 = api.dijkstraPath(1, 5);
  ok(J(p2) === J([1, 5]), 'po editRev++: cache przebudowany, [1,5] (koszt 50)');
  // podmiana roomById (nowa referencja — jak applyMap) bez ruszania editRev
  const fresh = {};
  for (const k in state.roomById) fresh[k] = state.roomById[k];
  fresh[4].exits.e = 5;  // przywrócenie objazdu na nowej referencji... uwaga: to ten sam obiekt pokoju
  state.roomById = fresh;
  const p3 = api.dijkstraPath(1, 5);
  ok(J(p3) === J([1, 4, 5]), 'po podmianie roomById: cache przebudowany (ref-check), [1,4,5]');
  // A* cross-area dwa razy pod rząd — memo areaDist spójne
  const q1 = api.astarPath(1, 7), q2 = api.astarPath(1, 7);
  ok(J(q1) === J(q2) && q1 !== null, 'A* cross-area 2× pod rząd: identyczny wynik (memo areaDist)');
}

// ── T3: mapa rzeczywista — dyferencjał pełnej macierzy ─────────────────────
console.log('── T3: mapa rzeczywista — macierz trybów × algorytmów, NOWY vs STARY ──');
{
  const fmt = new Function(formatLayer(NEW) + '\n;return { datToArkmap };')();
  const full = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
  const ark = fmt.datToArkmap(full);
  const mkReal = () => {
    const s = mkState();
    for (const area of ark.areas) for (const r of (area.rooms || [])) { s.roomById[r.id] = r; s.roomArea[r.id] = area.id; }
    return s;
  };
  const ids = [];
  for (const area of ark.areas) for (const r of (area.rooms || [])) ids.push(r.id);
  ids.sort((a, b) => a - b);

  // deterministyczny LCG (seed 20260827) — pary powtarzalne między maszynami
  let seed = 20260827;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  const pairs = [];
  while (pairs.length < 200) {
    const a = ids[(rnd() * ids.length) | 0], b = ids[(rnd() * ids.length) | 0];
    if (a !== b) pairs.push([a, b]);
  }

  const sN = mkReal(); const wpN = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off', avoidLocked: false };
  const aN = buildApi(NEW)(sN, wpN); aN._recomputeAstarParams();
  const sO = mkReal(); const wpO = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off', avoidLocked: false };
  const aO = buildApi(OLD)(sO, wpO); aO._recomputeAstarParams();

  // T3a: 200 par, tryb all — Dijkstra NOWY≡STARY bitowo; A* koszt ≡ Dijkstra; found ≡ STARY
  let foundD = 0, foundA = 0, crossArea = 0;
  let bad = 0;
  for (const [a, b] of pairs) {
    if (sN.roomArea[a] !== sN.roomArea[b]) crossArea++;
    const dN = aN.dijkstraPath(a, b), dO = aO.dijkstraPath(a, b);
    if (J(dN) !== J(dO)) { bad++; console.log(`    ROZBIEZNOSC Dijkstra ${a}→${b}`); continue; }
    const aNPath = aN.astarPath(a, b), aOPath = aO.astarPath(a, b);
    if ((aNPath === null) !== (aOPath === null)) { bad++; console.log(`    ROZBIEZNOSC found A* ${a}→${b}`); continue; }
    if (dN) foundD++;
    if (aNPath) {
      foundA++;
      const cA = pathCost(sN, aNPath), cD = pathCost(sN, dN);
      if (cA !== cD) { bad++; console.log(`    ROZBIEZNOSC kosztu A* vs D ${a}→${b}: ${cA} vs ${cD}`); continue; }
      if (!pathValid(sN, wpN, aNPath)) { bad++; console.log(`    NIEPOPRAWNA sciezka A* ${a}→${b}`); continue; }
    }
  }
  ok(bad === 0, `T3a: 200 par 'all' — Dijkstra bitowo ≡ STARY, A* koszt ≡ Dijkstra, found ≡ STARY (rozbieznosci: ${bad})`);
  console.log(`    info: found D=${foundD}/200, A=${foundA}/200, cross-area=${crossArea}/200`);

  // T3b: macierz dirMode × avoidLocked na 40 parach — Dijkstra NOWY≡STARY, A* koszt ≡ Dijkstra
  bad = 0;
  for (const mode of ['cardinal', 'vertical', 'all']) {
    for (const al of [true, false]) {
      wpN.dirMode = mode; wpN.avoidLocked = al;
      wpO.dirMode = mode; wpO.avoidLocked = al;
      for (const [a, b] of pairs.slice(0, 40)) {
        const dN = aN.dijkstraPath(a, b), dO = aO.dijkstraPath(a, b);
        if (J(dN) !== J(dO)) { bad++; console.log(`    ROZBIEZNOSC D [${mode}/al=${al}] ${a}→${b}`); continue; }
        const pA = aN.astarPath(a, b);
        if ((pA === null) !== (dN === null)) { bad++; console.log(`    ROZBIEZNOSC found A* [${mode}/al=${al}] ${a}→${b}`); continue; }
        if (pA && pathCost(sN, pA) !== pathCost(sN, dN)) { bad++; console.log(`    ROZBIEZNOSC kosztu A* [${mode}/al=${al}] ${a}→${b}`); }
      }
    }
  }
  wpN.dirMode = 'all'; wpN.avoidLocked = false;
  ok(bad === 0, 'T3b: macierz 3 tryby × 2 avoidLocked × 40 par — zero rozbieznosci');

  // T3c: determinizm — drugi egzemplarz API (świeży cache) daje bitowo to samo
  const sN2 = mkReal(); const aN2 = buildApi(NEW)(sN2, { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off', avoidLocked: false });
  aN2._recomputeAstarParams();
  let det = true;
  for (const [a, b] of pairs.slice(0, 30)) {
    if (J(aN2.dijkstraPath(a, b)) !== J(aN.dijkstraPath(a, b))) { det = false; break; }
    if (J(aN2.astarPath(a, b)) !== J(aN.astarPath(a, b))) { det = false; break; }
  }
  ok(det, 'T3c: determinizm — świeży cache ≡ rozgrzany (30 par × 2 algorytmy)');
}

// ── T4: piny statyczne fali 1 ───────────────────────────────────────────────
console.log('── T4: piny statyczne ──');
{
  const astarBody = NEW.slice(NEW.indexOf('function astarPath(fromId, toId) {'), NEW.indexOf('// Dispatcher'));
  ok(!astarBody.includes('return dijkstraPath(fromId, toId)'),
    'pin: A* bez fallbacku do Dijkstry na ścieżce głównej (zastąpiony heurystyką dwupoziomową)');
  ok(astarBody.includes('_areaDistances(cache, aTo)'), 'pin: A* cross-area korzysta z grafu obszarów');
  ok(NEW.includes('let _adjCache = null;') && NEW.includes('function _adjBuild() {') && NEW.includes('function _adjFor() {'),
    'pin: maszyneria cache adjacency obecna');
  const dijBody = NEW.slice(NEW.indexOf('function dijkstraPath(fromId, toId) {'), NEW.indexOf('function _recomputeAstarParams'));
  ok(!dijBody.includes('Object.assign(allExits') && !dijBody.includes('.sort((a, b) => a[1] - b[1])'),
    'pin: dijkstraPath bez merge+sort per pop (P1 w pętli: cache)');
  ok(dijBody.includes('if (room.locked && wpState.avoidLocked && cur !== fromId) continue;')
    && dijBody.includes('if (wpState.avoidLocked && nbr.locked) continue;'),
    'pin: guardy F2.15/N6 bez zmian (pop-guard przed breakiem + relaksacja)');
}

console.log(`\n═══ PODSUMOWANIE: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
