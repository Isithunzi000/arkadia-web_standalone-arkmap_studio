// Harness — walidacja kierunków 1:1 z Delwing (ZAD 13, v1.5.35).
// Złote przypadki z przypiętego fixture 0.205.0: 32 historyczne znalezienia TF,
// z czego 15 ratuje geometria findRoomByExit, 17 zostaje (martwe bindy).
// Jednostkowe: alias gore, pierwszy *, ścisłe osie, ten sam obszar, in/out, stuby.
// Uruchamianie z katalogu głównego repo. Wymaga fixture (tests/fetch-fixture.sh).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) {
  console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
  process.exit(2);
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Ekstrakcja verbatim: konwerter + walidator kierunków ────────────────────
function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica: ' + a);
  return HTML.slice(i, j);
}
const code =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── mudlet_dat.js ──', '// ── dat-to-arkmap.js ──') + '\n' +
  block('// ── dat-to-arkmap.js ──', '// ── arkmap-to-dat.js ──') + '\n' +
  block('// ════ ZAD 13:', 'let _vdLast = null;') + '\n' +
  'return { datToArkmap, _roomDirIssues };';
const state = { roomById: {}, roomArea: {}, areas: new Map() };
const api = new Function('state', code)(state);

// ── Złote przypadki z fixture 0.205.0 ───────────────────────────────────────
// 15 uratowanych geometrią Delwinga (move() → findRoomByExit), 17 martwych.
const GOLDEN_RESCUED = [
  '610|n', '2246|w', '4494|se', '4558|s', '4563|se', '6845|n', '15935|w', '15936|e',
  '21500|w', '22420|n', '22498|s', '22511|s', '22512|s', '24947|n', '25240|sw'
];
const GOLDEN_DEAD = [
  '2835|schody', '6066|oboz', '6535|wyjscie', '8124|wyjscie', '8638|wnetrza wiezy',
  '14775|s', '15491|oboz', '15917|do wyjscia', '16389|gora', '18370|d',
  '19725|szalas', '19734|do wyjscia przez otwor', '22510|se', '22573|arena',
  '23137|s', '23145|n', '24171|ne'
];

console.log('— złote przypadki (fixture 0.205.0) —');
{
  const DAT = fs.readFileSync(FIX);
  const buf = DAT.buffer.slice(DAT.byteOffset, DAT.byteOffset + DAT.byteLength);
  const map = api.datToArkmap(buf);
  for (const ar of map.areas) {
    state.areas.set(ar.id, ar);
    for (const r of ar.rooms) { state.roomById[r.id] = r; state.roomArea[r.id] = ar.id; }
  }
  const flagged = new Set();
  for (const r of Object.values(state.roomById)) {
    const iss = api._roomDirIssues(r);
    if (iss.tf) for (const to of iss.tf.bad) flagged.add(r.id + '|' + to);
  }
  ok(flagged.size === GOLDEN_DEAD.length, `flagowane dokładnie ${GOLDEN_DEAD.length} martwe (jest ${flagged.size})`);
  let deadOk = 0;
  for (const k of GOLDEN_DEAD) if (flagged.has(k)) deadOk++;
  ok(deadOk === GOLDEN_DEAD.length, `wszystkie ${GOLDEN_DEAD.length} martwych nadal flagowane (${deadOk})`);
  let resOk = 0;
  for (const k of GOLDEN_RESCUED) if (!flagged.has(k)) resOk++;
  ok(resOk === GOLDEN_RESCUED.length, `wszystkie ${GOLDEN_RESCUED.length} uratowanych NIEflagowane (${resOk})`);
  let stray = 0;
  for (const k of flagged) if (!GOLDEN_DEAD.includes(k)) stray++;
  ok(stray === 0, 'zero znalezień spoza złotej listy');
}

// ── Jednostkowe: pokoje syntetyczne ─────────────────────────────────────────
console.log('— jednostkowe —');
state.roomById = {}; state.roomArea = {}; state.areas = new Map();
state.areas.set(1, { id: 1, name: 'A', rooms: [] });
state.areas.set(2, { id: 2, name: 'B', rooms: [] });
let _nid = 1000;
function mkRoom(x, y, z, area, extra) {
  const r = { id: ++_nid, x, y, z, exits: {}, ...extra };
  state.roomById[r.id] = r; state.roomArea[r.id] = area;
  return r;
}
function tfBad(r) { const iss = api._roomDirIssues(r); return iss.tf ? iss.tf.bad : []; }

{
  // alias gore→up: pokój z wyjściem up, TF "x*gore" → brak znalezienia
  const up = mkRoom(0, 0, 1, 1);
  const r = mkRoom(0, 0, 0, 1, { exits: { up: up.id }, user_data: { team_follow_link: 'x*gore' } });
  ok(tfBad(r).length === 0, 'alias gore→up: klucz wyjścia ratuje');
}
{
  // gore przez geometrię: special_exit dokładnie w górę (ten sam obszar)
  const up = mkRoom(5, 5, 1, 1);
  const r = mkRoom(5, 5, 0, 1, { special_exits: { 'wejdz po drabinie': up.id }, user_data: { team_follow_link: 'x*gore' } });
  ok(tfBad(r).length === 0, 'gore→up: geometria special_exit ratuje (dz===+1, dx=dy=0)');
}
{
  // gore przez geometrię regularnego wyjścia pod INNĄ nazwą (redirect allExits)
  const up = mkRoom(0, 0, 2, 1);
  const r = mkRoom(0, 0, 1, 1, { exits: { 'drabina': up.id }, user_data: { team_follow_link: 'x*gora' } });
  ok(tfBad(r).length === 0, 'gora→up: geometria regularnego wyjścia ratuje');
}
{
  // ścisłość osi: kandydat na północ z dx≠0 NIE ratuje
  const n = mkRoom(1, 1, 0, 1);
  const r = mkRoom(0, 0, 0, 1, { exits: { 'jakies': n.id }, user_data: { team_follow_link: 'x*n' } });
  ok(tfBad(r).length === 1 && tfBad(r)[0] === 'n', 'ścisłe osie: północ z dx≠0 → martwe');
}
{
  // ten sam obszar wymagany: geometria pasuje, ale target w innym obszarze → martwe
  const n = mkRoom(0, 1, 0, 2);
  const r = mkRoom(0, 0, 0, 1, { exits: { 'jakies': n.id }, user_data: { team_follow_link: 'x*n' } });
  ok(tfBad(r).length === 1, 'cross-area: geometria nie ratuje');
}
{
  // północ = +Y w koordynatach .dat: dy>0 ratuje, dy<0 nie
  const n = mkRoom(0, 3, 0, 1);
  const r = mkRoom(0, 0, 0, 1, { exits: { 'jakies': n.id }, user_data: { team_follow_link: 'x*n' } });
  ok(tfBad(r).length === 0, 'orientacja .dat: północ = +Y ratuje');
  const s2 = mkRoom(0, -3, 0, 1);
  const r2 = mkRoom(0, 0, 0, 1, { exits: { 'jakies': s2.id }, user_data: { team_follow_link: 'x*n' } });
  ok(tfBad(r2).length === 1, 'orientacja .dat: dy<0 dla „n" → martwe');
}
{
  // ne wymaga dx>0 ORAZ dy>0 ORAZ dz===0
  const ne = mkRoom(2, 2, 0, 1);
  const r = mkRoom(0, 0, 0, 1, { exits: { 'x': ne.id }, user_data: { team_follow_link: 'a*ne' } });
  ok(tfBad(r).length === 0, 'ne: dx>0, dy>0, dz=0 ratuje');
  const neZ = mkRoom(2, 2, 1, 1);
  const r2 = mkRoom(0, 0, 0, 1, { exits: { 'x': neZ.id }, user_data: { team_follow_link: 'a*ne' } });
  ok(tfBad(r2).length === 1, 'ne: dz≠0 → martwe (oś z ściśle)');
}
{
  // in/out: brak delty → geometria nigdy nie ratuje
  const t = mkRoom(0, 0, 0, 1);
  const r = mkRoom(0, 0, 0, 1, { exits: { 'x': t.id }, user_data: { team_follow_link: 'a*in' } });
  ok(tfBad(r).length === 1, 'in/out: bez klucza wyjścia → martwe (brak geometrii)');
  const r2 = mkRoom(0, 0, 0, 1, { special_exits: { 'in': t.id }, user_data: { team_follow_link: 'a*in' } });
  ok(tfBad(r2).length === 0, 'in/out: klucz special_exit ratuje');
}
{
  // stuby nie ratują (nie są w exits)
  const r = mkRoom(0, 0, 0, 1, { stubs: ['n'], user_data: { team_follow_link: 'x*n' } });
  ok(tfBad(r).length === 1, 'stub „n" bez wyjścia → martwe');
}
{
  // pierwszy * (1:1 Delwing): "a*b*n" → kierunek „b*n", nie „n"
  const n = mkRoom(0, 1, 0, 1);
  const r = mkRoom(0, 0, 0, 1, { exits: { n: n.id }, user_data: { team_follow_link: 'a*b*n' } });
  ok(tfBad(r).length === 1 && tfBad(r)[0] === 'b*n', 'split na pierwszym *: „a*b*n" → kierunek „b*n" (martwe mimo wyjścia n)');
}
{
  // wiszący cel wyjścia (brak pokoju) — bez crashu, martwe
  const r = mkRoom(0, 0, 0, 1, { exits: { 'x': 999999 }, user_data: { team_follow_link: 'a*n' } });
  ok(tfBad(r).length === 1, 'wiszący cel: guard, martwe, bez wyjątku');
}
{
  // Arc 37 (PRACA 12): pusta komenda dir_bind („dir=") to w Mudlecie INTENCJONALNA
  // blokada kierunku (kanoniczne uzycie w skryptach Lua), nie blad — bez flagi.
  const r = mkRoom(0, 0, 0, 1, { user_data: { dir_bind: 'n=&e=otworz brame' } });
  const iss = api._roomDirIssues(r);
  ok(!iss.db && !iss.tf, 'dir_bind: pusta komenda „n=" NIE flagowana (blokada kierunku w Mudlecie)');
  const r2 = mkRoom(0, 0, 0, 1, { user_data: { dir_bind: 'n=otworz wrota', team_follow_link: 'x*zzz' } });
  const iss2 = api._roomDirIssues(r2);
  ok(!iss2.db && iss2.tf && iss2.tf.bad.length === 1 && iss2.tf.bad[0] === 'zzz',
    'dir_bind: niepusta komenda czysta; rozjazd team_follow bez zmian');
  const i = HTML.indexOf('function _roomDirIssues(r){');
  const j = HTML.indexOf('\nfunction ', i + 10);
  ok(i >= 0 && j > i && !HTML.slice(i, j).includes('dir_bind'),
    'straznik: _roomDirIssues bez galezi dir_bind (PRACA 12)');
}
{
  // pokój bez user_data → bez znalezień
  const r = mkRoom(0, 0, 0, 1, {});
  const iss = api._roomDirIssues(r);
  ok(!iss.tf && !iss.db, 'brak user_data → brak znalezień (tf null, db juz nie istnieje)');
}

// ── Arc 34 (v1.49.4, obs 3): akceptacje w undo/redo, selektor wycięty ────────
console.log('— Arc 34 (obs 3): akceptacje = wpis undo, jedno źródło (meta) —');
{
  const fnSlice = (anchor) => {
    const i = HTML.indexOf(anchor);
    if (i < 0) return '';
    const j = HTML.indexOf('\n}', i);
    return j < 0 ? '' : HTML.slice(i, j + 2);
  };
  ok(!HTML.includes('vd-store') && !HTML.includes('vd-migrate') && !HTML.includes('vd-clearacc'),
    'obs3: brak selektora źródła i przycisków migracji/czyszczenia w HTML i JS (pre-fix: obecne)');
  ok(!HTML.includes('function _acceptStore') && !HTML.includes('_vdMigrate') && !HTML.includes('_vdClearAccepts'),
    'obs3: funkcje trybu przegladarki wyciete (pre-fix: _acceptStore/_vdMigrate/_vdClearAccepts)');
  ok(!HTML.includes('arkmap_accept_store') || HTML.match(/arkmap_accept_store/g).length === 1,
    'obs3: klucz arkmap_accept_store tylko jako legacy wipe w applyMap');
  const asave = fnSlice('function _acceptSave(arr){');
  ok(asave.length > 0 && !asave.includes('localStorage') && asave.includes('meta.accepted_dir_issues'),
    'obs3: _acceptSave meta-only, bez localStorage (pre-fix: gałąź browser)');
  ok((HTML.match(/case 'ACCEPT_DIR_ISSUES'/g) || []).length === 2,
    'obs3: case ACCEPT_DIR_ISSUES w obu dyspozytorach (undo + redo)');
  const vacc = fnSlice('function _vdAccept(it){');
  ok(vacc.includes("pushUndo({ type:'ACCEPT_DIR_ISSUES'") && vacc.includes('before') && vacc.includes('after')
    && vacc.includes('state.redoStack = [];') && vacc.includes('updateUndoRedoUI()'),
    'obs3: _vdAccept przez pushUndo (before/after, idioma call-site)');
  const vunacc = fnSlice('function _vdUnaccept(it){');
  ok(vunacc.includes("pushUndo({ type:'ACCEPT_DIR_ISSUES'"),
    'obs3: _vdUnaccept przez pushUndo');
  // — Arc 37 fala E (R2): _issueKeys bez martwego parametru type (zawsze 'tf') —
  const ikeys = fnSlice('function _issueKeys(it){');
  const keysFmt = ikeys.length > 0 && JSON.stringify(
    new Function(ikeys + '; return _issueKeys;')()({ id: 5, bad: ['N ', 's'] })
  ) === JSON.stringify(['tf:5:n', 'tf:5:s']);
  ok(keysFmt,
    'falaE: _issueKeys(it) — format kluczy tf:id:value bez zmian (kompatybilnosc meta.accepted_dir_issues)');
  ok(!HTML.includes("_issueKeys('tf'") && !HTML.includes('_issueKeys(type'),
    'falaE: brak starych wywolan _issueKeys z parametrem type (pre-fix: 3 call site-y)');
  ok((HTML.match(/_issueKeys\(it\)/g) || []).length === 4,
    'falaE: _issueKeys(it) — definicja + 3 call site-y (count == 4)');
  const reset = fnSlice('function resetAllDefaults() {');
  ok(!reset.includes('_wasFileAcceptSrc') && !reset.includes("k !== 'arkmap_accepted_dir_issues'"),
    'obs3: resetAllDefaults bez logiki źródła akceptacji i bez wyjątku klucza');
  ok(HTML.includes("localStorage.removeItem('arkmap_accept_store')"),
    'obs3: applyMap czyści legacy klucz arkmap_accept_store');
  // — strażnik pustej kalki + lustro typow eksportowalnych —
  ok(HTML.includes('const _DELTA_EXPORTABLE = new Set(['),
    'obs3: _DELTA_EXPORTABLE zadeklarowany (lustro caseow buildDelta)');
  const sd = fnSlice('function saveDelta() {');
  ok(sd.includes('_DELTA_EXPORTABLE.has(e.type)'),
    'obs3: saveDelta odmawia eksportu, gdy 0 eksportowalnych opow (pre-fix: kalka z samych akceptacji = pusty plik)');
  // — pin anty-drift: zbior _DELTA_EXPORTABLE === case'e buildDelta —
  const bd = HTML.includes('function buildDelta(log, base) {')
    ? block('function buildDelta(log, base) {', '// Serializacja kalki z zadanych opow') : '';
  const bdCases = new Set([...bd.matchAll(/case '([A-Z_]+)'/g)].map(m => m[1]));
  const expM = HTML.match(/const _DELTA_EXPORTABLE = new Set\(\[([\s\S]*?)\]\);/);
  const expSet = new Set(expM ? [...expM[1].matchAll(/'([A-Z_]+)'/g)].map(m => m[1]) : []);
  const diffAB = [...bdCases].filter(t => !expSet.has(t));
  const diffBA = [...expSet].filter(t => !bdCases.has(t));
  ok(bdCases.size === 25 && expSet.size === 25 && diffAB.length === 0 && diffBA.length === 0,
    'obs3 anty-drift: _DELTA_EXPORTABLE === case buildDelta (25 typow; rozjezdne: '
    + (diffAB.concat(diffBA).join(',') || 'brak') + ')');
}

console.log(`\ndir_validation: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
