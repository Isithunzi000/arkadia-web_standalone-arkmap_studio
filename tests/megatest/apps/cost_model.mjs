// cost_model.mjs — fala 4: gate kosztowy mega-testu apps.
// Replika kosztu sciezki w modelu ArkMap Studio liczona NODE-side z pliku .arkmap
// (te same reguly co _edgeWeight/_adjBuild w arkmap_studio.html — pinowane
//  w tests/cost_gate.js, ktory dodatkowo ekstrahuje prawdziwy kod apki
//  anchorami i sprawdza rownowaznosc na losowych mapach syntetycznych).
// Uzywane przez run_apps.mjs i tests/cost_gate.js.
import fs from 'node:fs';

// Zbuduj model z pliku .arkmap:
//   rooms     — id -> room (oba uklady: plaski rooms{} i areas[].rooms[])
//   locked    — Set id pokoi z room.locked
//   costPath(p) — { cost, tainted } dla sekwencji id:
//       koszt kroku u->v = min po dir z exits/special_exits prowadzacych do v
//       (w = exit_weights[dir] > 0 ? exit_weights[dir] : max(waga(v), 1) — jak _edgeWeight);
//       tainted = krok poza modelem wyjsc LUB wszystkie dir u->v zlockowane
//                 LUB ktorykolwiek pokoj sciezki locked LUB pokoj spoza mapy.
//     Min-po-dir i "tainted tylko gdy WSZYSTKIE dir zlockowane" to celowe
//     pobozne zalozenia na korzysc ich silnika — minimalizuja falszywe flagi.
export function mapCostModel(arkmapPath) {
  const m = JSON.parse(fs.readFileSync(arkmapPath, 'utf8'));
  const rooms = new Map();
  const locked = new Set();
  const collect = r => {
    if (!r || r.id == null) return;
    rooms.set(+r.id, r);
    if (r.locked) locked.add(+r.id);
  };
  if (m.rooms) for (const r of Object.values(m.rooms)) collect(r);        // plaski uklad (starsze fixture'y)
  for (const a of m.areas || []) for (const r of a.rooms || []) collect(r); // docelowy uklad

  const exLock = (room, dir) =>
    (room.exit_locks && room.exit_locks.includes(dir)) ||
    (room.special_exit_locks && room.special_exit_locks.includes(dir));

  // Wszystkie dir prowadzace u->v z priorytetem SE>exits przy kolizji klucza
  // (jak put() w _adjBuild: SE nadpisuje wpis exits o tym samym kluczu).
  const stepsTo = (u, v) => {
    const room = rooms.get(+u);
    if (!room) return null;
    const byDir = new Map();
    if (room.exits) for (const d in room.exits) byDir.set(d, room.exits[d]);
    if (room.special_exits) for (const d in room.special_exits) byDir.set(d, room.special_exits[d]);
    const hits = [];
    for (const [d, nid] of byDir) {
      if (!nid || +nid !== +v) continue;
      const nbr = rooms.get(+nid);
      if (!nbr) continue;                                  // cel poza mapa — jak _adjBuild
      const ew = room.exit_weights && room.exit_weights[d];
      const w = (ew !== undefined && ew > 0) ? ew : Math.max(nbr.weight ?? 1, 1);
      hits.push({ w, lk: !!exLock(room, d) });
    }
    return hits;                                           // [] = zaden dir nie prowadzi do v
  };

  const costPath = p => {
    if (!p || p.length < 2) return { cost: p ? 0 : null, tainted: true };
    let cost = 0, tainted = false;
    for (let i = 0; i + 1 < p.length; i++) {
      if (locked.has(+p[i]) || locked.has(+p[i + 1])) tainted = true;      // lock pokoju
      const hits = stepsTo(p[i], p[i + 1]);
      if (!hits || hits.length === 0) return { cost: null, tainted: true }; // krok poza modelem
      if (hits.every(h => h.lk)) tainted = true;                            // lock wyjscia
      cost += Math.min(...hits.map(h => h.w));
    }
    return { cost, tainted };
  };

  return { rooms, locked, costPath };
}

// Gate kosztowy (plan 4.1) dla jednej mapy:
//   pairs          — pary manifestu [[a,b],...]
//   ourDijkstra    — perCost naszego Dijkstry (null = nie znaleziono)
//   ourAstar       — perCost naszego A*
//   theirAstarPaths— paths0 ich A* (tablice id albo null per para)
//   cm             — mapCostModel(fixture)
//   tag            — 'web-real' | 'web-plain!' (do komunikatow)
// Zwraca { problems, flags, checked, expectedLocks }:
//   (a) nasz A* MUSI byc kosztowo == nasz Dijkstra (per para, oba znalezione);
//   (b) ich A* (koszt w NASZYM modelu) MUSI byc >= nasz Dijkstra;
//       mniej + sciezka czysta (bez lockow) => czerwona flaga (wpis do raportu);
//       mniej + sciezka skazona lockami => OCZEKIWANE (ich silnik ignoruje locki pokoi).
export function costGatePairs(pairs, ourDijkstra, ourAstar, theirAstarPaths, cm, tag) {
  const problems = [], flags = [];
  let checked = 0, expectedLocks = 0;
  for (let i = 0; i < pairs.length; i++) {
    const cD = ourDijkstra[i], cA = ourAstar[i];
    if (cD != null && cA != null && cA !== cD)
      problems.push(`para ${pairs[i]}: nasz A* koszt ${cA} != nasz Dijkstra ${cD} — A* MUSI byc kosztowo rowny Dijkstrze`);
    if (cD == null || !theirAstarPaths || !theirAstarPaths[i]) continue;
    checked++;
    const tc = cm.costPath(theirAstarPaths[i]);
    if (tc.cost == null) continue;                       // krok poza naszym modelem — nieocenialne kosztowo
    if (tc.cost < cD) {
      if (tc.tainted) { expectedLocks++; continue; }     // oczekiwane: locki pokoi/wyjsc
      const f = { pair: pairs[i], our_dijkstra: cD, their_astar: tc.cost, engine: tag };
      flags.push(f);
      problems.push(`para ${pairs[i]}: ich A* (${tag}) koszt ${tc.cost} < nasz Dijkstra ${cD}, sciezka BEZ lockow`
        + ' — czerwona flaga: ich silnik znalazl tansza trase na rownych zasadach (dowod do raportu)');
    }
  }
  return { problems, flags, checked, expectedLocks };
}
