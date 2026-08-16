// Harness krok A — filtr kierunków planera (kardynalne / +pionowe / wszystkie)
// Snapshot różnicowy: 80c8c90 (stan sprzed filtra). Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const OLD = execSync('git show 80c8c90:arkmap_studio.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) {
  console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
  process.exit(2);
}
const DAT = fs.readFileSync(FIX);

// ── Ekstrakcja verbatim ─────────────────────────────────────────────────────
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

// ── Stuby ───────────────────────────────────────────────────────────────────
function mkState() { return { roomById: {}, roomArea: {}, astarParams: null, editMode: false }; }
function mkWp(dirMode) { return { algorithm: 'dijkstra', dirMode }; }

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── T1: klasyfikacja _dirAllowed — 12 kierunków × 3 tryby + specjalne + nieznany ──
console.log('── T1: klasyfikacja _dirAllowed ──');
{
  const state = mkState(), wp = mkWp('all');
  const api = buildApi(NEW)(state, wp);
  const roomSpec = { special_exits: { 'northwest': 9, 'wespnij sie na gore': 10 } };
  const roomPlain = {};
  const CARD = ['n', 'ne', 'nw', 'e', 'w', 's', 'se', 'sw'];
  const VERT = ['up', 'down', 'in', 'out'];
  for (const mode of ['cardinal', 'vertical', 'all']) {
    wp.dirMode = mode;
    for (const d of CARD) ok(api._dirAllowed(d, roomPlain) === true, `kardynalny ${d} w trybie ${mode}: przechodzi`);
    for (const d of VERT) {
      const exp = mode !== 'cardinal';
      ok(api._dirAllowed(d, roomPlain) === exp, `pionowy ${d} w trybie ${mode}: ${exp ? 'przechodzi' : 'odrzucony'}`);
    }
    for (const s of ['northwest', 'wespnij sie na gore']) {
      const exp = mode === 'all';
      ok(api._dirAllowed(s, roomSpec) === exp, `specjalne "${s}" w trybie ${mode}: ${exp ? 'przechodzi' : 'odrzucone'}`);
    }
    const expU = mode === 'all';
    ok(api._dirAllowed('teleport', roomPlain) === expU, `nieznany klucz w trybie ${mode}: ${expU ? 'przechodzi' : 'odrzucony'}`);
  }
}

// ── Graf syntetyczny ────────────────────────────────────────────────────────
// 1—e→2—e→3 (kardynalne, koszt 2) oraz 1—specjalne→3 (koszt 1)
// 6—up→7 (jedyne połączenie) oraz 8—"teleport" (nieznany klucz)→9
function mkSynthetic() {
  const state = mkState();
  const R = (id, x, y, extra) => { state.roomById[id] = Object.assign({ id, x, y, z: 0 }, extra); state.roomArea[id] = 1; };
  R(1, 0, 0, { exits: { e: 2 }, special_exits: { 'przejdz dalej': 3 } });
  R(2, 2, 0, { exits: { w: 1, e: 3 } });
  R(3, 4, 0, { exits: { w: 2 } });
  R(6, 0, 0, { exits: { up: 7 } });
  R(7, 0, 0, { exits: { down: 6 } });
  R(8, 0, 0, { exits: { teleport: 9 } });
  R(9, 2, 0, {});
  return state;
}

console.log('── T2: graf syntetyczny — filtr zmienia trasę zgodnie z trybem ──');
{
  const state = mkSynthetic();
  state.astarParams = { maxEdgeDist: 4, minEdgeW: 1 };
  const wp = mkWp('all');
  const api = buildApi(NEW)(state, wp);
  const J = JSON.stringify;

  wp.dirMode = 'all';
  ok(J(api.dijkstraPath(1, 3)) === J([1, 3]), 'all: 1→3 bierze skrót specjalny [1,3]');
  wp.dirMode = 'vertical';
  ok(J(api.dijkstraPath(1, 3)) === J([1, 2, 3]), 'vertical: 1→3 objazd kardynalny [1,2,3]');
  wp.dirMode = 'cardinal';
  ok(J(api.dijkstraPath(1, 3)) === J([1, 2, 3]), 'cardinal: 1→3 objazd kardynalny [1,2,3]');

  wp.dirMode = 'cardinal';
  ok(api.dijkstraPath(6, 7) === null, 'cardinal: 6→7 (tylko up) — brak trasy (null)');
  wp.dirMode = 'vertical';
  ok(J(api.dijkstraPath(6, 7)) === J([6, 7]), 'vertical: 6→7 przez up [6,7]');
  wp.dirMode = 'all';
  ok(J(api.dijkstraPath(6, 7)) === J([6, 7]), 'all: 6→7 przez up [6,7]');

  wp.dirMode = 'cardinal';
  ok(api.dijkstraPath(8, 9) === null, 'cardinal: 8→9 (nieznany klucz) — null');
  wp.dirMode = 'vertical';
  ok(api.dijkstraPath(8, 9) === null, 'vertical: 8→9 (nieznany klucz) — null');
  wp.dirMode = 'all';
  ok(J(api.dijkstraPath(8, 9)) === J([8, 9]), 'all: 8→9 przez nieznany klucz [8,9]');

  // A* zgodne z Dijkstrą w każdym trybie (graf syntetyczny)
  wp.algorithm = 'astar';
  for (const mode of ['cardinal', 'vertical', 'all']) {
    wp.dirMode = mode;
    const d = api.dijkstraPath(1, 3), a = api.astarPath(1, 3);
    ok(J(a) === J(d), `A* ≡ Dijkstra na syntetyku, tryb ${mode}`);
  }
  wp.algorithm = 'dijkstra';
}

console.log('── T3: regresja — tryb "all" ≡ brak filtra (stary kod) ──');
{
  const state = mkSynthetic();
  const wpNew = mkWp('all');
  const apiNew = buildApi(NEW)(state, wpNew);
  const stateOld = mkSynthetic();
  const wpOld = { algorithm: 'dijkstra' };
  const apiOld = buildApi(OLD)(stateOld, wpOld);
  const J = JSON.stringify;
  ok(J(apiNew.dijkstraPath(1, 3)) === J(apiOld.dijkstraPath(1, 3)), '1→3: nowy(all) ≡ stary');
  ok(J(apiNew.dijkstraPath(6, 7)) === J(apiOld.dijkstraPath(6, 7)), '6→7: nowy(all) ≡ stary');
  ok(J(apiNew.dijkstraPath(8, 9)) === J(apiOld.dijkstraPath(8, 9)), '8→9: nowy(all) ≡ stary');
}

// ── T4: mapa rzeczywista (fixture map_master3.dat) ──────────────────────────
console.log('── T4: mapa rzeczywista — trasa 17983→18030 (rozpadlina) ──');
{
  const fmt = new Function(formatLayer(NEW) + '\n;return { datToArkmap };')();
  const full = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
  const ark = fmt.datToArkmap(full);
  const state = mkState();
  for (const area of ark.areas) {
    for (const r of (area.rooms || [])) {
      state.roomById[r.id] = r;
      state.roomArea[r.id] = area.id;
    }
  }
  const wp = mkWp('all');
  const api = buildApi(NEW)(state, wp);
  api._recomputeAstarParams();

  const hasSpecialStep = (p) => {
    for (let i = 0; i < p.length - 1; i++) {
      const r = state.roomById[p[i]];
      const nxt = p[i + 1];
      const inNormal = Object.values(r.exits || {}).some(v => +v === nxt);
      const inSpec = Object.values(r.special_exits || {}).some(v => +v === nxt);
      if (inSpec && !inNormal) return true;
    }
    return false;
  };
  const J = JSON.stringify;

  wp.dirMode = 'all';
  const pAll = api.dijkstraPath(17983, 18030);
  ok(pAll !== null && pAll.length - 1 === 25, `all: 25 kroków (jest ${pAll ? pAll.length - 1 : 'null'})`);
  ok(pAll && pAll.includes(18719), 'all: trasa przez wnętrze rozpadliny (18719)');
  ok(pAll && hasSpecialStep(pAll), 'all: zawiera kroki specjalne');

  wp.dirMode = 'cardinal';
  const pCard = api.dijkstraPath(17983, 18030);
  ok(pCard !== null, 'cardinal: trasa istnieje');
  ok(pCard && !pCard.includes(18719), 'cardinal: NIE przechodzi przez 18719');
  ok(pCard && !hasSpecialStep(pCard), 'cardinal: zero kroków specjalnych');
  ok(pCard && pCard.length - 1 > 25, `cardinal: dłuższa niż skrót (jest ${pCard ? pCard.length - 1 : 'null'})`);

  wp.dirMode = 'vertical';
  const pVert = api.dijkstraPath(17983, 18030);
  ok(pVert !== null, 'vertical: trasa istnieje');
  ok(pVert && !pVert.includes(18719), 'vertical: NIE przechodzi przez 18719');
  ok(pVert && !hasSpecialStep(pVert), 'vertical: zero kroków specjalnych');

  // A* vs Dijkstra na trasie rzeczywistej: ten sam KOSZT i końce — identyczna ścieżka nie jest
  // gwarantowana (pre-existing tie-break przy remisach kosztu, potwierdzone na kodzie sprzed filtra:
  // OLD też daje rozjazd na poz. 16: 18231 vs 18232 przy równych 25 krokach).
  for (const mode of ['cardinal', 'vertical', 'all']) {
    wp.dirMode = mode;
    const d = api.dijkstraPath(17983, 18030), a = api.astarPath(17983, 18030);
    ok(a !== null && d !== null && a.length === d.length && a[0] === d[0] && a[a.length - 1] === d[d.length - 1],
      `A* ≡ Dijkstra (koszt i końce), tryb ${mode}`);
  }

  // dyferencjalnie: stary kod ≡ nowy w trybie all (mapa rzeczywista)
  const stateOld = mkState();
  for (const area of ark.areas) for (const r of (area.rooms || [])) { stateOld.roomById[r.id] = r; stateOld.roomArea[r.id] = area.id; }
  const apiOld = buildApi(OLD)(stateOld, { algorithm: 'dijkstra' });
  wp.dirMode = 'all';
  ok(J(api.dijkstraPath(17983, 18030)) === J(apiOld.dijkstraPath(17983, 18030)), 'nowy(all) ≡ stary na trasie rzeczywistej');
}

console.log(`\n═══ PODSUMOWANIE: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
