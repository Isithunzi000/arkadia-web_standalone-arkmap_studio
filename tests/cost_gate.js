// Harness fali 4 — gate kosztowy ich A* (plan 4.1).
// T1: piny statyczne (run_apps.mjs / report_megatest.mjs / anty-drift repliki vs apk).
// T2: ROWNOWAZNOSC repliki cost_model.mjs z PRAWDZIWA formula _edgeWeight ekstrahowana
//     verbatim z arkmap_studio.html — losowe mapy syntetyczne (LCG), tysiace sciezek.
// T3: logika costGatePairs — scenariusze (a)/(b), skazenie lockami, krawedzie brzegowe.
// Uruchamianie z katalogu glownego repo: node tests/cost_gate.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const RUN = fs.readFileSync(path.join(ROOT, 'tests/megatest/apps/run_apps.mjs'), 'utf8');
const REP = fs.readFileSync(path.join(ROOT, 'tests/megatest/report_megatest.mjs'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

(async () => {

// ═══ T1: piny statyczne ═══
console.log('── T1: piny statyczne ──');
ok(RUN.includes("from './cost_model.mjs'"), 'run_apps.mjs importuje cost_model.mjs');
ok(RUN.includes('perCost') && RUN.includes('costGatePairs(') && RUN.includes('cost_flags'),
  'run_apps.mjs: perCost + costGatePairs + cost_flags wpiète');
ok(RUN.includes('_adjFor().adj'), 'run_apps.mjs: koszt w stronie wagami cache adjacency');
{
  const iMs = RUN.indexOf('const ms = Math.round((performance.now() - t0) * 10) / 10;');
  const iCo = RUN.indexOf('const costOf = p => {');
  ok(iMs > 0 && iCo > iMs, 'koszty liczone PO zatrzymaniu stoperka (zero kontaminacji pomiaru W2)');
}
ok(REP.includes('costGateHtml') && REP.includes('cost_flags') && REP.includes('Gate kosztowy'),
  'report_megatest.mjs: sekcja gate kosztowego + flagi z liczbami');
ok(NEW.includes('const ew = room.exit_weights?.[dir];')
  && NEW.includes('if (ew !== undefined && ew > 0) return ew;')
  && NEW.includes('return Math.max(neighborRoom.weight ?? 1, 1);'),
  'anty-drift: formula _edgeWeight w apce niezmieniona (replika ja zaklada)');
{
  const a = NEW.indexOf('function _adjBuild() {');
  const b = NEW.indexOf('function _adjFor()');
  const blk = (a >= 0 && b > a) ? NEW.slice(a, b) : '';
  ok(blk.includes('exit_locks') && blk.includes('special_exit_locks'),
    'anty-drift: _adjBuild nadal bierze locki z exit_locks/special_exit_locks');
}

// ═══ T2: rownowaznosc repliki z prawdziwa _edgeWeight ═══
console.log('── T2: replika cost_model.mjs vs ekstrahowana _edgeWeight ──');
const { mapCostModel, costGatePairs } = await import(path.join(ROOT, 'tests/megatest/apps/cost_model.mjs'));
ok(typeof mapCostModel === 'function' && typeof costGatePairs === 'function',
  'cost_model.mjs eksportuje mapCostModel + costGatePairs');

// Ekstrakcja verbatim _edgeWeight z apki (kotwice jak w pathfinding_cache.js).
const EA = NEW.indexOf('function _edgeWeight(room, dir, neighborRoom) {');
const EB = NEW.indexOf('\n}\n', EA);
ok(EA >= 0 && EB > EA, 'kotwice _edgeWeight znalezione');
const _edgeWeight = new Function('return ' + NEW.slice(EA, EB + 3))();
ok(_edgeWeight({ exit_weights: { e: 4 } }, 'e', { weight: 9 }) === 4
  && _edgeWeight({ exit_weights: { e: 0 } }, 'e', { weight: 9 }) === 9
  && _edgeWeight({}, 'e', {}) === 1,
  'ekstrahowana _edgeWeight dziala (override / 0->fallback / domyslna 1)');

// Niezalezna referencja: min po dir u->v z uzyciem PRAWDZIWEJ _edgeWeight;
// tainted: pokoj locked na trasie / wszystkie dir zlockowane / krok poza modelem.
function refCostPath(rooms, p) {
  if (!p || p.length < 2) return { cost: p ? 0 : null, tainted: true };
  let cost = 0, tainted = false;
  for (let i = 0; i + 1 < p.length; i++) {
    if (rooms[+p[i]] && rooms[+p[i]].locked) tainted = true;
    if (rooms[+p[i + 1]] && rooms[+p[i + 1]].locked) tainted = true;
    const r = rooms[+p[i]];
    if (!r) return { cost: null, tainted: true };
    const nxt = +p[i + 1], nbr = rooms[nxt];
    const byDir = new Map();
    if (r.exits) for (const d in r.exits) byDir.set(d, r.exits[d]);
    if (r.special_exits) for (const d in r.special_exits) byDir.set(d, r.special_exits[d]);
    let best = Infinity, any = false, allLk = true;
    for (const [d, nid] of byDir) {
      if (!nid || +nid !== nxt) continue;
      if (!nbr) continue;                       // cel poza mapa — pomijany jak w _adjBuild
      any = true;
      const w = _edgeWeight(r, d, nbr);
      if (w < best) best = w;
      const lk = (r.exit_locks || []).includes(d) || (r.special_exit_locks || []).includes(d);
      if (!lk) allLk = false;
    }
    if (!any) return { cost: null, tainted: true };
    if (allLk) tainted = true;
    cost += best;
  }
  return { cost, tainted };
}

function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function genMap(rnd, n) {
  const rooms = {};
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(1000 + i * 7);
  for (const id of ids) {
    const r = { id, x: 0, y: 0, z: 0, user_data: {} };
    if (rnd() < 0.7) r.weight = 1 + Math.floor(rnd() * 3);
    if (rnd() < 0.08) r.locked = true;
    rooms[id] = r;
  }
  const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'up', 'down'];
  for (const id of ids) {
    const r = rooms[id];
    const deg = Math.floor(rnd() * 4);
    if (deg > 0) {
      r.exits = {};
      for (let k = 0; k < deg; k++) {
        const d = dirs[Math.floor(rnd() * dirs.length)];
        const tgt = ids[Math.floor(rnd() * ids.length)];
        if (tgt === id) continue;
        r.exits[d] = tgt;
        if (rnd() < 0.25) (r.exit_weights = r.exit_weights || {})[d] = rnd() < 0.15 ? 0 : Math.floor(rnd() * 5);
        if (rnd() < 0.15) (r.exit_locks = r.exit_locks || []).push(d);
      }
    }
    if (rnd() < 0.2) {
      const d = 'warp' + Math.floor(rnd() * 3);
      const tgt = ids[Math.floor(rnd() * ids.length)];
      if (tgt !== id) {
        (r.special_exits = r.special_exits || {})[d] = tgt;
        if (rnd() < 0.2) (r.special_exit_locks = r.special_exit_locks || []).push(d);
        if (rnd() < 0.2) (r.exit_weights = r.exit_weights || {})[d] = 1 + Math.floor(rnd() * 4);
      }
    }
  }
  return { format: 'arkmap', version: 1, meta: {}, areas: [{ id: 1, name: 'A', rooms: Object.values(rooms) }] };
}

function randomWalk(rnd, roomsMap, ids, maxLen) {
  let cur = ids[Math.floor(rnd() * ids.length)];
  const p = [cur];
  const len = 1 + Math.floor(rnd() * maxLen);
  for (let i = 0; i < len; i++) {
    const r = roomsMap[cur];
    const outs = [];
    if (r && r.exits) for (const d in r.exits) outs.push(r.exits[d]);
    if (r && r.special_exits) for (const d in r.special_exits) outs.push(r.special_exits[d]);
    if (!outs.length || rnd() < 0.15) break;
    cur = outs[Math.floor(rnd() * outs.length)];
    p.push(cur);
  }
  return p;
}

{
  const rnd = lcg(20260828);
  let cmp = 0, mism = 0, taintedSeen = 0, nullSeen = 0;
  const tmp = path.join(os.tmpdir(), 'cost_gate_map.arkmap');
  for (let mI = 0; mI < 40; mI++) {
    const m = genMap(rnd, 40 + Math.floor(rnd() * 120));
    fs.writeFileSync(tmp, JSON.stringify(m));
    const cm = mapCostModel(tmp);
    const roomsMap = {};
    for (const r of m.areas[0].rooms) roomsMap[r.id] = r;
    const ids = m.areas[0].rooms.map(r => r.id);
    for (let k = 0; k < 60; k++) {
      const p = randomWalk(rnd, roomsMap, ids, 12);
      const a = cm.costPath(p), b = refCostPath(roomsMap, p);
      cmp++;
      if (a.tainted) taintedSeen++;
      if (a.cost === null) nullSeen++;
      if (a.cost !== b.cost || a.tainted !== b.tainted) {
        mism++;
        if (mism <= 3) console.log('    MISM para', JSON.stringify(p), 'replika', JSON.stringify(a), 'ref', JSON.stringify(b));
      }
    }
    // losowe sekwencje (kroki poza modelem)
    for (let k = 0; k < 20; k++) {
      const p = Array.from({ length: 2 + Math.floor(rnd() * 5) }, () => ids[Math.floor(rnd() * ids.length)]);
      const a = cm.costPath(p), b = refCostPath(roomsMap, p);
      cmp++;
      if (a.cost === null) nullSeen++;
      if (a.cost !== b.cost || a.tainted !== b.tainted) mism++;
    }
  }
  fs.unlinkSync(tmp);
  ok(mism === 0, `replika ≡ ekstrahowana _edgeWeight: ${cmp} sciezek, 0 rozbieznosci (tainted=${taintedSeen}, null=${nullSeen})`);
}

// ═══ T3: logika costGatePairs ═══
console.log('── T3: scenariusze gate (a) i (b) ──');
{
  // Mapka: 1—2 (w1), 2—3 (w1), 1—3 (w5), pokoj 4 locked z tania trasa 1—4 (w1), 4—3 (w1).
  const mk = locked4 => ({ format: 'arkmap', version: 1, meta: {}, areas: [{ id: 1, name: 'A', rooms: [
    { id: 1, exits: { e: 2, s: 3, w: 4 }, exit_weights: { s: 5 }, user_data: {} },
    { id: 2, exits: { w: 1, e: 3 }, user_data: {} },
    { id: 3, exits: { w: 2, n: 1 }, exit_weights: { n: 5 }, user_data: {} },
    { id: 4, exits: { e: 1 }, special_exits: { hop: 3 }, locked: locked4, user_data: {} },
  ] }] });
  const tmp = path.join(os.tmpdir(), 'cost_gate_t3.arkmap');
  fs.writeFileSync(tmp, JSON.stringify(mk(false)));
  const cm = mapCostModel(tmp);

  // (a) A* == Dijkstra — spójne, zero problemow
  let g = costGatePairs([[1, 3]], [2], [2], [[1, 2, 3]], cm, 'web-real');
  ok(g.problems.length === 0 && g.flags.length === 0, '(a) A*==Dijkstra kosztowo: zero problemow');
  // (a) naruszenie — MUSI flagowac
  g = costGatePairs([[1, 3]], [2], [3], [[1, 2, 3]], cm, 'web-real');
  ok(g.problems.length === 1 && /MUSI/.test(g.problems[0]), '(a) A*!=Dijkstra: problem z "MUSI"');
  // (b) ich A* drozszy/rowny — OK
  g = costGatePairs([[1, 3]], [2], [2], [[1, 3]], cm, 'web-real');
  ok(g.problems.length === 0 && g.checked === 1, '(b) ich trasa drozsza (5>2): OK, para policzona');
  // (b) ich A* tanszy BEZ lockow — czerwona flaga z liczbami
  g = costGatePairs([[1, 3]], [5], [5], [[1, 2, 3]], cm, 'web-plain!');
  ok(g.flags.length === 1 && g.flags[0].their_astar === 2 && g.flags[0].our_dijkstra === 5
    && /czerwona flaga/.test(g.problems[0]) && /web-plain!/.test(g.problems[0]),
    '(b) ich A* tanszy bez lockow: flaga + liczby (2 < 5) + tag silnika');
  // (b) ich trasa przez LOCKED pokoj — oczekiwane, bez flagi
  fs.writeFileSync(tmp, JSON.stringify(mk(true)));
  const cmL = mapCostModel(tmp);
  g = costGatePairs([[1, 3]], [5], [5], [[1, 4, 3]], cmL, 'web-real');
  ok(g.flags.length === 0 && g.expectedLocks === 1 && g.problems.length === 0,
    '(b) ich A* tanszy przez locked pokoj: oczekiwane, zero flag');
  // (b) krok poza modelem wyjsc — nieocenialne, pomijane
  g = costGatePairs([[1, 3]], [5], [5], [[1, 99, 3]], cmL, 'web-real');
  ok(g.flags.length === 0 && g.expectedLocks === 0 && g.problems.length === 0,
    '(b) krok poza modelem (pokoj spoza mapy): para pominieta');
  // puste/niekompletne dane
  g = costGatePairs([[1, 3]], [null], [null], [null], cm, 'web-real');
  ok(g.problems.length === 0 && g.checked === 0, 'pary nieznalezione: pomijane, checked=0');
  g = costGatePairs([[1, 3]], [2], [2], null, cm, 'web-real');
  ok(g.problems.length === 0 && g.checked === 0, 'brak ich sciezek (skeleton bez plain): pomijane');
  // tainted przez lock WYJSCIA (nie pokoju): 4 odblokowany, wyjscie 1->4 zlockowane
  const m2 = mk(false); m2.areas[0].rooms[0].exit_locks = ['w'];
  fs.writeFileSync(tmp, JSON.stringify(m2));
  const cm2 = mapCostModel(tmp);
  g = costGatePairs([[1, 3]], [5], [5], [[1, 4, 3]], cm2, 'web-real');
  ok(g.flags.length === 0 && g.expectedLocks === 1, '(b) tanszy przez zlockowane WYJSCIE: oczekiwane');
  fs.unlinkSync(tmp);
}

})().then(() => {
  console.log(`\n═══ PODSUMOWANIE: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail === 0 ? 0 : 1);
}).catch(e => {
  console.error('WYJATEK: ' + (e && e.stack || e));
  process.exit(1);
});
