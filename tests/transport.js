// Harness krok B — transporty (statki/dyliżanse) w planerze: wirtualne krawędzie, kary, hopy
// Snapshot różnicowy: 254ac05 (stan po kroku A, przed transportami). Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const OLD = execSync('git show 254ac05:arkmap_studio.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

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
  return html.slice(a, html.indexOf('\n', b));
}
function pathfindingBlock(html) {
  const a = html.indexOf('// Binarny min-heap');
  const b = html.indexOf('// Licz kroki przez special_exits');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice pathfindingu');
  return html.slice(a, b);
}
function transportDefs(html) {
  const a = html.indexOf('const TRANSPORT_DEFS = ');
  if (a < 0) throw new Error('kotwica TRANSPORT_DEFS');
  const eol = html.indexOf(';\n', a);
  return new Function(html.slice(a, eol) + '; return TRANSPORT_DEFS;')();
}
function formatLayer(html) {
  const a = html.indexOf('// ── constants.js ──');
  const b = html.indexOf('// ── main ──');
  const c = html.indexOf('const ANSI_PAL = buildAnsiPal();');
  const d = html.indexOf('function buildColorCache');
  if (a < 0 || b < 0 || b <= a || c < 0 || d < 0 || d <= c) throw new Error('kotwice warstwy formatu');
  return html.slice(a, b) + '\n' + html.slice(c, d);
}
function buildApi(html, state, wp, defs) {
  const code = dirsBlock(html) + '\n' + pathfindingBlock(html) +
    '\n;return { dijkstraPath, astarPath, findPath, _recomputeAstarParams, _rebuildTransportEdges, _collectPathHops,' +
    ' _edges: () => _transportEdges, _hopsMap: () => _pathHops' +
    (html.includes('function _dirAllowed') ? ', _dirAllowed' : '') + ' };';
  return new Function('state', 'wpState', 'TRANSPORT_DEFS', code)(state, wp, defs);
}

function mkState() { return { roomById: {}, roomArea: {}, astarParams: null, editMode: false }; }

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }
const J = JSON.stringify;

// ── Graf syntetyczny: łańcuch 1—…—50 (49 kroków pieszo), statek 1→50 (20 s) ──
// druga linia: 1→10→20 (po 10 s) — test ride-through i kary raz na pokład
function mkSynthetic() {
  const state = mkState();
  for (let i = 1; i <= 50; i++) {
    const ex = {};
    if (i > 1) ex.w = i - 1;
    if (i < 50) ex.e = i + 1;
    state.roomById[i] = { id: i, x: i * 2, y: 0, z: 0, exits: ex };
    state.roomArea[i] = 1;
  }
  return state;
}
const DEFS_SYN = [
  ['TestShip', ['wsiadz na statek'], 'zejdz ze statku', [[1, 50, 20, 'Port B']]],
  ['TestCoach', ['wsiadz do dyliżansu'], 'wysiadz', [[1, 10, 10, 'Postój A'], [10, 20, 10, 'Postój B']]],
];

console.log('── T1: syntetyk — wybór transportu wg trybu, ride-through, kara raz ──');
{
  const state = mkSynthetic();
  const wp = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off' };
  const api = buildApi(NEW, state, wp, DEFS_SYN);

  // off: czysto pieszo
  api._rebuildTransportEdges();
  let p = api.findPath(1, 50);
  ok(p.length - 1 === 49, `off: 1→50 pieszo 49 kroków (jest ${p.length - 1})`);
  ok(J(api._collectPathHops(p).filter(Boolean)) === J([]), 'off: zero hopów');

  // normal: statek 20×0.5+30 = 40 < 49 → wygrywa
  wp.transportMode = 'normal';
  api._rebuildTransportEdges();
  p = api.findPath(1, 50);
  ok(p.length - 1 === 1 && p[0] === 1 && p[1] === 50, `normal: 1→50 jednym hopem (kroków: ${p.length - 1})`);
  const hops = api._collectPathHops(p).filter(Boolean);
  ok(hops.length === 1 && hops[0].name === 'TestShip' && hops[0].time === 20, 'normal: hop = TestShip, 20 s');
  ok(J(hops[0].board) === J(['wsiadz na statek']) && hops[0].exit === 'zejdz ze statku', 'hop niesie komendy wsiadania/wysiadania');

  // aggressive: 20×0.1+10 = 12
  wp.transportMode = 'aggressive';
  api._rebuildTransportEdges();
  p = api.findPath(1, 50);
  ok(p.length - 1 === 1, 'aggressive: też hop');

  // transport nie jest wymuszany, gdy marsz jest tańszy: 1→20 pieszo = 19 < dyliżans 35/40
  wp.transportMode = 'normal';
  api._rebuildTransportEdges();
  p = api.findPath(1, 20);
  ok(p.length - 1 === 19, `normal: 1→20 marsz 19 kroków wygrywa z dyliżansem (kroków: ${p.length - 1})`);
  ok(J(api._collectPathHops(p).filter(Boolean)) === J([]), 'normal: 1→20 bez hopów (marsz tańszy)');
}

console.log('── T2: dokładność kosztów krawędzi ──');
{
  const state = mkSynthetic();
  const wp = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'normal' };
  const api = buildApi(NEW, state, wp, DEFS_SYN);
  api._rebuildTransportEdges();
  const e1 = api._edges().get(1) || [];
  const ship = e1.find(e => e.to === 50 && e.hop.name === 'TestShip');
  const coachDirect = e1.find(e => e.to === 10);
  const coachThrough = e1.find(e => e.to === 20);
  ok(ship && ship.cost === 20 * 0.5 + 30, `normal: statek 1→50 = 40 (jest ${ship && ship.cost})`);
  ok(coachDirect && coachDirect.cost === 10 * 0.5 + 30, `normal: dyliżans 1→10 = 35 (jest ${coachDirect && coachDirect.cost})`);
  ok(coachThrough && coachThrough.cost === 20 * 0.5 + 30, `normal: dyliżans 1→20 przez A = 40, kara raz (jest ${coachThrough && coachThrough.cost})`);
  wp.transportMode = 'aggressive';
  api._rebuildTransportEdges();
  const shipA = (api._edges().get(1) || []).find(e => e.to === 50);
  ok(shipA && shipA.cost === 20 * 0.1 + 10, `aggressive: statek 1→50 = 12 (jest ${shipA && shipA.cost})`);
  wp.transportMode = 'off';
  api._rebuildTransportEdges();
  ok(api._edges().size === 0, 'off: zero krawędzi transportowych');
}

console.log('── T3: wymuszenie Dijkstry przy transportach ──');
{
  const state = mkSynthetic();
  const wp = { algorithm: 'astar', dirMode: 'all', transportMode: 'normal' };
  const api = buildApi(NEW, state, wp, DEFS_SYN);
  state.astarParams = { maxEdgeDist: 2, minEdgeW: 1 };
  api._rebuildTransportEdges();
  const viaFind = api.findPath(1, 50);
  const viaDijk = api.dijkstraPath(1, 50);
  ok(J(viaFind) === J(viaDijk), 'findPath z algorithm=astar + transport on → wynik ≡ dijkstraPath');
  ok(viaFind.length - 1 === 1, '…czyli hop (Dijkstra wybrany mimo astar)');
}

console.log('── T4: mapa rzeczywista — Ancelmus: Kraina Zgromadzenia → Nuln → Kreutzhofen ──');
{
  const defs = transportDefs(NEW);
  const fmt = new Function(formatLayer(NEW) + '\n;return { datToArkmap };')();
  const full = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
  const ark = fmt.datToArkmap(full);
  const state = mkState();
  for (const area of ark.areas) for (const r of (area.rooms || [])) { state.roomById[r.id] = r; state.roomArea[r.id] = area.id; }
  const wp = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off' };
  const api = buildApi(NEW, state, wp, defs);

  const hasNonWalkStep = (p) => {
    for (let i = 0; i < p.length - 1; i++) {
      const r = state.roomById[p[i]];
      const nxt = p[i + 1];
      const inNormal = Object.values(r.exits || {}).some(v => +v === nxt);
      const inSpec = Object.values(r.special_exits || {}).some(v => +v === nxt);
      if (!inNormal && !inSpec) return true;
    }
    return false;
  };

  // off: 6621 → 7233 pieszo (Kraina Zgromadzenia → Nuln)
  api._rebuildTransportEdges();
  const pOff = api.findPath(6621, 7233);
  ok(pOff !== null, 'off: trasa piesza 6621→7233 istnieje');
  ok(pOff && !hasNonWalkStep(pOff), 'off: same kroki piesze (brak hopów)');
  const offSteps = pOff ? pOff.length - 1 : 0;

  // normal: hop Ancelmusem
  wp.transportMode = 'normal';
  api._rebuildTransportEdges();
  const pOn = api.findPath(6621, 7233);
  const hopsOn = api._collectPathHops(pOn).filter(Boolean);
  const anc = hopsOn.find(h => h.from === 6621 && h.to === 7233);
  ok(!!anc, 'normal: hop 6621→7233 (Kraina Zgromadzenia → Nuln) w trasie');
  ok(anc && anc.board.includes('wsiadz na statek') && anc.exit === 'zejdz ze statku',
    `hop niesie komendy statku (linia: ${anc && anc.name})`);
  ok(pOn && pOn.length - 1 < offSteps, `normal: trasa krótsza w krokach (${pOn.length - 1} < ${offSteps})`);

  // ride-through: 6621 → 5207 (Kreutzhofen) przez Nuln — jeden hop, kara raz
  const pThrough = api.findPath(6621, 5207);
  const hopsThrough = api._collectPathHops(pThrough).filter(Boolean);
  const rt = hopsThrough.find(h => h.from === 6621 && h.to === 5207);
  ok(!!rt, 'ride-through: jeden hop 6621→5207 (bez wysiadania w Nuln)');
  ok(rt && J(rt.via) === J(['Nuln']) && rt.time === 87, `ride-through: via=[Nuln], czas 87 s (jest: ${rt && rt.time}, via=${rt && J(rt.via)})`);

  // hop przecina pustkę: pokoje 6621 i 7233 nie są sąsiadami na mapie
  const rA = state.roomById[6621], rB = state.roomById[7233];
  const distGeo = Math.hypot(rB.x - rA.x, rB.y - rA.y);
  ok(distGeo > 10, `hop geometrycznie daleki (${Math.round(distGeo)} j.) — render jako przerywana`);
}

console.log('── T5: regresja — transport off ≡ kod z 254ac05 (mapa rzeczywista) ──');
{
  const defs = transportDefs(NEW);
  const fmt = new Function(formatLayer(NEW) + '\n;return { datToArkmap };')();
  const full = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
  const ark = fmt.datToArkmap(full);
  const mkReal = () => {
    const s = mkState();
    for (const area of ark.areas) for (const r of (area.rooms || [])) { s.roomById[r.id] = r; s.roomArea[r.id] = area.id; }
    return s;
  };
  const stNew = mkReal();
  const apiNew = buildApi(NEW, stNew, { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off' }, defs);
  const stOld = mkReal();
  const apiOld = new Function('state', 'wpState', dirsBlock(OLD) + '\n' + pathfindingBlock(OLD) +
    '\n;return { dijkstraPath, astarPath, findPath };')(stOld, { algorithm: 'dijkstra', dirMode: 'all' });
  for (const [a, b] of [[6621, 7233], [17983, 18030], [6621, 5207]]) {
    ok(J(apiNew.findPath(a, b)) === J(apiOld.findPath(a, b)), `off: ${a}→${b} nowy ≡ stary`);
  }
}

console.log('── A3.2 (DI-2): krawędzie transportowe respektują avoidLocked ──');
{
  // Lancuch 1—…—50 pieszo + statek 1→50 (20 s; w normal 20×0.5+30=40 < 49 — wygrywa).
  // Pokoj 50 zablokowany. Pop-guard tnie tylko EKSPANSJE z locked — bez guarda
  // w relaksie transportowym cel statkiem zostawal w prev/dist i sciezka byla
  // „znaleziona" mimo avoidLocked.
  const st = mkSynthetic();
  st.roomById[50].locked = true;
  const wpOn = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'normal', avoidLocked: true };
  const apiOn = buildApi(NEW, st, wpOn, DEFS_SYN);
  apiOn._rebuildTransportEdges();
  ok(apiOn.findPath(1, 50) === null,
    'A3.2 (DI-2): avoidLocked ON -> cel locked statkiem = null (pre-fix: sciezka przez hop mimo blokady)');
  ok(apiOn.findPath(1, 49) !== null,
    'A3.2 (DI-2): avoidLocked ON -> pieszo do odblokowanego sasiada nadal dziala (regresja)');
  const st2 = mkSynthetic();
  st2.roomById[50].locked = true;
  const wpOff = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'normal', avoidLocked: false };
  const apiOff = buildApi(NEW, st2, wpOff, DEFS_SYN);
  apiOff._rebuildTransportEdges();
  ok(J(apiOff.findPath(1, 50)) === J([1, 50]),
    'A3.2 (DI-2): avoidLocked OFF -> statek do locked przepuszczony [1,50] (regresja)');
}

console.log(`\n═══ PODSUMOWANIE: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
