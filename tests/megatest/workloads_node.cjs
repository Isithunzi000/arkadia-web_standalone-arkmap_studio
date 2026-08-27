// workloads_node.cjs — W2/W3/W3b w Node dla mega-testu.
// JEDNA implementacja nad danymi obu silnikow (mudlet-map-binary-reader i
// ArkMap .arkmap) — porownujemy koszt pracy na modelu danych kazdego silnika.
// Desktop ma natywne wywolania (getPath/searchRoom/getRooms, C++) — w raporcie
// to zaznaczone. Semantyka nasladowana z workload.lua:
//   W2  getPath(from,to)   — A* po grafie wyjsc, koszt wejscia = weight pokoju
//                            (domyslnie 1), heurystyka euklidesowa 3D;
//                            zamkniete pokoje (isLocked) i zamkniete wyjscia
//                            (exit_locks / special_exit_locks) pomijane —
//                            jak TAstar w Mudlecie
//   W3  searchRoom(term)   — pelny skan nazw, case-insensitive substring;
//                            raportuje 3 metryki: pokoje (substring),
//                            unikalne nazwy, dokladne dopasowania — bo Mudlet
//                            searchRoom zwraca tabele, a przy pojedynczym
//                            trafieniu numer (nasz harness liczy countKeys)
//   W3b getRooms()         — budowa tabeli id->nazwa + countKeys
// Special exits wliczone jako zwykle krawedzie (TAstar ich uzywa).
'use strict';

// Kolejnosc kierunkow w .dat / readerze (exitLocks sa 1-based wg tej listy).
const DIR_ORDER = ['north', 'northeast', 'northwest', 'east', 'west', 'south',
  'southeast', 'southwest', 'up', 'down', 'in', 'out'];

// idx: { ids: number[], byId: Map<id, {name,x,y,z,weight,locked,exits:number[]}> }

function indexFromReaderMap(map) {   // mudlet-map-binary-reader: map.rooms = Record<id, MudletRoom>
  const ids = [], byId = new Map();
  for (const [idStr, r] of Object.entries(map.rooms)) {
    const id = +idStr;
    const lockSet = new Set((r.exitLocks || []).map(x => DIR_ORDER[x - 1]));
    const exits = [];
    for (const d of DIR_ORDER) { const t = r[d]; if (t > 0 && !lockSet.has(d)) exits.push(t); }
    const specLocks = new Set(r.mSpecialExitLocks || []);
    for (const [cmd, t] of Object.entries(r.mSpecialExits || {})) if (t > 0 && !specLocks.has(cmd)) exits.push(t);
    ids.push(id);
    byId.set(id, { name: r.name || '', x: r.x || 0, y: r.y || 0, z: r.z || 0,
      weight: r.weight > 0 ? r.weight : 1, locked: !!r.isLocked, exits });
  }
  return { ids, byId };
}

function indexFromArkmap(map) {      // .arkmap: areas[].rooms[]; exits po KROTKICH nazwach, exit_locks = krotkie nazwy
  const ids = [], byId = new Map();
  for (const a of map.areas) {
    for (const r of a.rooms) {
      const lockSet = new Set(r.exit_locks || []);
      const exits = [];
      for (const [dir, t] of Object.entries(r.exits || {})) if (t > 0 && !lockSet.has(dir)) exits.push(t);
      const specLocks = new Set(r.special_exit_locks || []);
      for (const [cmd, t] of Object.entries(r.special_exits || {})) if (t > 0 && !specLocks.has(cmd)) exits.push(t);
      ids.push(r.id);
      byId.set(r.id, { name: r.name || '', x: r.x || 0, y: r.y || 0, z: r.z || 0,
        weight: r.weight > 0 ? r.weight : 1, locked: false, exits });
    }
  }
  return { ids, byId };
}

// Deterministyczny min-heap po (f, id).
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    this.k.push(key); this.v.push(val);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] < this.k[i] || (this.k[p] === this.k[i] && this.v[p] <= this.v[i])) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop() {
    const topK = this.k[0], topV = this.v[0];
    const lk = this.k.pop(), lv = this.v.pop();
    if (this.k.length) {
      this.k[0] = lk; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && (this.k[l] < this.k[m] || (this.k[l] === this.k[m] && this.v[l] < this.v[m]))) m = l;
        if (r < this.k.length && (this.k[r] < this.k[m] || (this.k[r] === this.k[m] && this.v[r] < this.v[m]))) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return [topK, topV];
  }
}

function astar(idx, from, to) {
  const R = idx.byId;
  const a = R.get(from), b = R.get(to);
  if (!a || !b || a.locked || b.locked) return false;
  const h = id => {
    const r = R.get(id);
    const dx = r.x - b.x, dy = r.y - b.y, dz = (r.z - b.z) * 2;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  const g = new Map([[from, 0]]);
  const open = new MinHeap();
  open.push(h(from), from);
  const closed = new Set();
  while (open.size) {
    const [, u] = open.pop();
    if (u === to) return true;
    if (closed.has(u)) continue;
    closed.add(u);
    const gu = g.get(u);
    for (const v of R.get(u).exits) {
      const rv = R.get(v);
      if (!rv || rv.locked || closed.has(v)) continue;
      const ng = gu + rv.weight;
      if (ng < (g.get(v) ?? Infinity)) { g.set(v, ng); open.push(ng + h(v), v); }
    }
  }
  return false;
}

function runPath(idx, pairs) {       // W2: jedna probka = czas wszystkich par
  const t0 = performance.now();
  let found = 0;
  for (const [from, to] of pairs) if (astar(idx, from, to)) found++;
  return { ms: performance.now() - t0, found };
}

function runSearch(idx, terms) {     // W3: jedna probka = czas wszystkich fraz
  const t0 = performance.now();
  let rooms = 0, exact = 0;
  const names = new Set();
  for (const q of terms) {
    const needle = String(q).toLowerCase();
    for (const id of idx.ids) {
      const low = idx.byId.get(id).name.toLowerCase();
      if (low.includes(needle)) { rooms++; names.add(low); }
      if (low === needle) exact++;
    }
  }
  return { ms: performance.now() - t0, rooms, names: names.size, exact };
}

function runIter(idx) {              // W3b: budowa id->nazwa + countKeys (jak getRooms)
  const t0 = performance.now();
  const out = {};
  for (const id of idx.ids) out[id] = idx.byId.get(id).name;
  let n = 0;
  for (const _ in out) n++;
  return { ms: performance.now() - t0, rooms: n };
}

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: +s[0].toFixed(1), med: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}

// Pelny pakiet W2/W3/W3b: n probek kazdego, GC miedzy probkami (global.gc).
function runWorkloads(idx, pairs, terms, n, gc) {
  const path = [], search = [], iter = [];
  let found = -1, sRooms = -1, sNames = -1, sExact = -1, rooms = 0;
  for (let i = 0; i < n; i++) {
    if (gc) gc();
    const p = runPath(idx, pairs);
    path.push(p.ms);
    if (found < 0) found = p.found;
    else if (p.found !== found) throw new Error(`path_found niedeterministyczne: ${p.found} vs ${found}`);
    const s = runSearch(idx, terms);
    search.push(s.ms);
    if (sRooms < 0) { sRooms = s.rooms; sNames = s.names; sExact = s.exact; }
    else if (s.rooms !== sRooms || s.names !== sNames || s.exact !== sExact)
      throw new Error(`search niedeterministyczne: ${s.rooms}/${s.names}/${s.exact} vs ${sRooms}/${sNames}/${sExact}`);
    const it = runIter(idx);
    iter.push(it.ms); rooms = it.rooms;
  }
  return { path_ms: stats(path), path_found: found,
    search_ms: stats(search), search_hits: sRooms,   // search_hits = pokoje (back-compat)
    search_rooms: sRooms, search_names: sNames, search_exact: sExact,
    iter_ms: stats(iter), rooms_iter: rooms };
}

module.exports = { indexFromReaderMap, indexFromArkmap, runWorkloads, stats };
