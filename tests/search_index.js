// Harness fali 5 (P5) — indeks tokenowy searcha planera (wpDoSearch).
// Snapshot roznicowy: 2614e8f (stan sprzed fali 5). Uruchamianie z katalogu glownego repo.
//
// Zlota asercja: STARY wpDoSearch (pelny skan, ekstrahowany verbatim z 2614e8f)
// vs NOWY (kandydaci z indeksu) — bitowo identyczny innerHTML dropdownu i stan
// open na baterii zapytan, na fixture stress_2k (54k pokoi) i na mini-mapie
// brzegowej. Do tego: leniwosc (1 budowa), uniewaznianie (editRev / roomById /
// areas) i zgodnosc po rename zachowania STAREGO.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const OLD = execSync('git show 2614e8f:arkmap_studio.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const FIX = '/mnt/agents/work/repro_repo/tests/perf/out/stress_2k.arkmap';
if (!fs.existsSync(FIX)) { console.error('BRAK FIXTURE: ' + FIX); process.exit(2); }

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Ekstrakcja verbatim ──────────────────────────────────────────────────────
function depsBlock(html) {
  const a = html.indexOf('function escHtml(s) {');
  const b0 = html.indexOf('function escapeRegExp(s) {');
  const b = html.indexOf('\n}\n', b0);
  if (a < 0 || b0 < 0 || b <= b0) throw new Error('kotwice escHtml/escapeRegExp');
  return html.slice(a, b + 3);
}
function oldSearch(html) {
  const a = html.indexOf('function wpDoSearch(idx, query) {');
  const b = html.indexOf('function wpCloseDropdown(idx) {');
  if (a < 0 || b <= a) throw new Error('kotwice wpDoSearch (OLD)');
  return html.slice(a, b);
}
function newSearch(html) {
  const a = html.indexOf('let _wpSearchIdx = null;');
  const b = html.indexOf('function wpCloseDropdown(idx) {');
  if (a < 0 || b <= a) throw new Error('kotwice wpDoSearch (NEW)');
  return html.slice(a, b);
}

// ── Atrapa DOM (dropdown) ────────────────────────────────────────────────────
function mkDoc() {
  const rec = { html: '__INIT__', open: false };
  const el = {
    classList: { add: c => { if (c === 'open') rec.open = true; }, remove: c => { if (c === 'open') rec.open = false; } },
    set innerHTML(v) { rec.html = v; },
    get innerHTML() { return rec.html; },
    querySelectorAll: () => [],
  };
  return { rec, doc: { getElementById: () => el } };
}

// ── Stan z fixture (kolejnosc wstawiania = kolejnosc pliku, jak applyMap) ────
function loadFixtureState() {
  const m = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const roomById = {}, roomArea = {}, areas = new Map();
  for (const a of m.areas || []) {
    areas.set(a.id, { id: a.id, name: a.name });
    for (const r of a.rooms || []) { roomById[r.id] = r; roomArea[r.id] = a.id; }
  }
  return { roomById, roomArea, areas, editRev: 0, map: { meta: {} } };
}

function buildOldApi() {
  return new Function('state', 'document',
    depsBlock(OLD) + '\n' + oldSearch(OLD) + '\n;return { wpDoSearch };');
}
function buildNewApi() {
  return new Function('state', 'document',
    depsBlock(NEW) + '\n' + newSearch(NEW) +
    '\n;return { wpDoSearch, _wpSearchIndex, getBuilds: () => _wpSearchBuilds };');
}

function runQuery(api, state, q) {
  const { rec, doc } = mkDoc();
  // uwaga: document jest parametrem wycinka — podmieniamy per run
  const fn = new Function('state', 'document',
    api.__src + '\n;return { wpDoSearch' + (api.__isNew ? ', _wpSearchIndex, getBuilds: () => _wpSearchBuilds' : '') + ' };');
  const f = fn(state, doc);
  f.wpDoSearch(0, q);
  const out = { html: rec.html, open: rec.open };
  if (api.__isNew) out.builds = f.getBuilds();
  return out;
}

const oldApi = { __src: depsBlock(OLD) + '\n' + oldSearch(OLD), __isNew: false };
const newApi = { __src: depsBlock(NEW) + '\n' + newSearch(NEW), __isNew: true };

// ═══ T1: zlota bateria na fixture (bitowa identycznosc dropdownu) ═══
console.log('── T1: zlota bateria na fixture stress_2k ──');
{
  const state = loadFixtureState();
  const m = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const realIds = m.areas[1].rooms.slice(0, 3).map(r => r.id);
  const battery = [
    '1', '12', '123', '7', '0',                       // liczbowe podciagi (masa trafien, cap 25)
    'wyzima', 'wyzi', 'mahakam', 'redania',           // nazwy obszarow (1 pkt)
    'lyria i', 'poludniowa redania',                  // wielowyrazowe
    String(realIds[0]),                               // dokladne id
    '0x10', '007', '12abc',                           // krawedzie parseInt (hex / zera / ogonek)
    'zzz-nie-ma-tego',                                // zero trafien
    'wyzima 12345',                                   // area + brak slowa = zero
    'LAS', 'Las',                                     // wielkosc liter
    '  42  ',                                         // trim
    'i',                                              // pojedyncza litera (szerokie)
  ];
  let same = 0, diff = 0;
  for (const q of battery) {
    const a = runQuery(oldApi, state, q);
    const b = runQuery(newApi, state, q);
    if (a.html === b.html && a.open === b.open) same++;
    else {
      diff++;
      if (diff <= 3) {
        console.log('    DIFF dla ' + JSON.stringify(q));
        console.log('    OLD: ' + JSON.stringify((a.html || '').slice(0, 140)) + ' open=' + a.open);
        console.log('    NEW: ' + JSON.stringify((b.html || '').slice(0, 140)) + ' open=' + b.open);
      }
    }
  }
  ok(diff === 0, `bateria ${battery.length} zapytan: bitowo identyczne dropdowny (same=${same})`);
}

// ═══ T2: mini-mapa brzegowa (punct tokeny, pokoje bez nazwy/obszaru) ═══
console.log('── T2: mini-mapa brzegowa ──');
{
  const rooms = [
    { id: 7, name: 'Karczma U-Miły', x: 0, y: 0, z: 0 },
    { id: 8, name: 'Karczma pod Młotem', x: 1, y: 0, z: 0 },
    { id: 9, x: 2, y: 0, z: 0 },                                   // bez nazwy
    { id: 10, name: 'Las Las Las', x: 3, y: 0, z: 0 },             // duplikat tokenu
    { id: 16, name: 'Shrine', x: 4, y: 0, z: 0 },
  ];
  const mk = () => ({
    roomById: Object.fromEntries(rooms.map(r => [r.id, JSON.parse(JSON.stringify(r))])),
    roomArea: { 7: 1, 8: 1, 9: 2, 10: 2 },                          // 16: bez obszaru
    areas: new Map([[1, { id: 1, name: 'Stare Miasto' }], [2, { id: 2, name: 'Puszcza' }]]),
    editRev: 0, map: { meta: {} },
  });
  const battery = [
    'u-miły', '-mi', 'karczma', 'karczma młotem', 'miły',
    'stare', 'puszcza', 'stare karczma',           // area-only, name+area
    'las', 'las las',                              // duplikaty tokenow
    '7', '0x10', '16', 'shrine 16',                // id-match i mieszane
    'miasto 9', 'karczma shrine',                  // brak pelnego dopasowania
  ];
  let same = 0, diff = 0;
  for (const q of battery) {
    const a = runQuery(oldApi, mk(), q);
    const b = runQuery(newApi, mk(), q);
    if (a.html === b.html && a.open === b.open) same++;
    else {
      diff++;
      if (diff <= 3) {
        console.log('    DIFF dla ' + JSON.stringify(q));
        console.log('    OLD: ' + JSON.stringify((a.html || '').slice(0, 160)));
        console.log('    NEW: ' + JSON.stringify((b.html || '').slice(0, 160)));
      }
    }
  }
  ok(diff === 0, `mini-mapa: ${battery.length} zapytan brzegowych identycznych (same=${same})`);
}

// ═══ T3: leniwosc + uniewaznianie + zgodnosc po rename ═══
console.log('── T3: leniwosc i uniewaznianie ──');
{
  const state = loadFixtureState();
  const { rec, doc } = mkDoc();
  const fn = new Function('state', 'document',
    newApi.__src + '\n;return { wpDoSearch, _wpSearchIndex, getBuilds: () => _wpSearchBuilds };');
  const f = fn(state, doc);
  f.wpDoSearch(0, 'wyzima');
  f.wpDoSearch(0, 'mahakam');
  ok(f.getBuilds() === 1, 'dwie szukania = jedna budowa indeksu (leniwy, warm)');
  state.editRev++;
  f.wpDoSearch(0, 'wyzima');
  ok(f.getBuilds() === 2, 'editRev++ → przebudowa przy kolejnym szukaniu');
  state.roomById = Object.assign({}, state.roomById);
  f.wpDoSearch(0, 'wyzima');
  ok(f.getBuilds() === 3, 'podmiana roomById → przebudowa');
  state.areas = new Map(state.areas);
  f.wpDoSearch(0, 'wyzima');
  ok(f.getBuilds() === 4, 'podmiana areas → przebudowa');
  f.wpDoSearch(0, 'wyzima');
  ok(f.getBuilds() === 4, 'bez mutacji → brak przebudowy');

  // rename pokoju i obszaru (jak commitRoomEdit / EDIT_AREA → pushUndo → editRev++)
  const someId = +Object.keys(state.roomById)[100];
  state.roomById[someId].name = 'Zzzq-Unikatowo';
  state.areas.get(2).name = 'Nowa Puszcza Zzzq';
  state.editRev++;
  const strip = h => (h || '').replace(/<[^>]+>/g, '');   // highlight owija match w <em>
  // Uwaga: 'zzz-q' NIE jest substringiem 'zzzq-unikatowo' (po zzz jest q, potem myslnik) —
  // uzywamy 'zzzq-u': substring przecina granice tokenu, stary trafia substringowo, nowy przez token.
  const q1 = runQuery(oldApi, state, 'zzzq-u');       // STARY: zawsze pelny skan
  const q2 = runQuery(newApi, state, 'zzzq-u');       // NOWY: musi zobaczyc rename
  ok(q1.html === q2.html && strip(q1.html).includes('Zzzq-Unikatowo'),
    'po rename pokoju: NOWY == STARY i trafia nowa nazwe');
  const q3 = runQuery(oldApi, state, 'nowa puszcza');
  const q4 = runQuery(newApi, state, 'nowa puszcza');
  ok(q3.html === q4.html && q4.open === true && !q4.html.includes('Brak wyników'),
    'po rename obszaru: NOWY == STARY i trafia nowa nazwe obszaru');
}

// ═══ T4: wydajnosc (info + miekki assert) ═══
console.log('── T4: wydajnosc na fixture ──');
{
  const state = loadFixtureState();
  const queries = ['wyzima', 'mahakam', '1234', 'lyria i', 'poludniowa redania', '777'];
  // Trwale instancje (jak w apce): indeks/koncery przezywaja miedzy zapytaniami.
  const mkFn = (api) => new Function('state', 'document', api.__src + '\n;return { wpDoSearch };')
    (state, mkDoc().doc);
  const oldF = mkFn(oldApi), newF = mkFn(newApi);
  const bench = (f, reps) => {
    const times = [];
    for (let r = 0; r < reps; r++) {
      const t0 = performance.now();
      for (const q of queries) f.wpDoSearch(0, q);
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[Math.floor(reps / 2)];
  };
  const tOld = bench(oldF, 3);
  const tNew = bench(newF, 3);   // pierwszy rep zawiera budowe indeksu — mediana z 3 go pomija
  console.log(`  STARY: ${tOld.toFixed(1)} ms / bateria, NOWY: ${tNew.toFixed(1)} ms (x${(tOld / tNew).toFixed(1)})`);
  ok(tNew <= tOld * 1.5, 'NOWY nie wolniejszy niz 1.5x STAREGO (oczekiwane: znacznie szybszy)');
}

console.log(`\n═══ PODSUMOWANIE: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
