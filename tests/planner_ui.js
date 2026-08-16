// Harness v1.5.30 — UX planera: podświetlenia przełączników (selektory atrybutowe),
// sąsiedztwo transportów dla dwukliku, asercje strukturalne CSS/HTML.
// Uruchamianie z katalogu głównego repo. Bez fixture (dane transportowe z HTML).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NEW = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Ekstrakcja verbatim ─────────────────────────────────────────────────────
function transportDefs(html) {
  const a = html.indexOf('const TRANSPORT_DEFS = [');
  if (a < 0) throw new Error('kotwica TRANSPORT_DEFS');
  const e = html.indexOf('];', a);
  if (e < 0) throw new Error('koniec TRANSPORT_DEFS');
  return new Function('return ' + html.slice(a + 'const TRANSPORT_DEFS = '.length, e + 1))();
}
function neighborsFn() {
  const a = NEW.indexOf('function _transportNeighbors(roomId) {');
  const b = NEW.indexOf('// Dijkstra: najkrótsza ścieżka');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice _transportNeighbors');
  return NEW.slice(a, b);
}
function togglesBlock() {
  const a = NEW.indexOf('// Algorytm pathfindingu');
  const b = NEW.indexOf('// Prędkość');
  if (a < 0 || b < 0 || b <= a) throw new Error('kotwice przełączników');
  return NEW.slice(a, b);
}

// ── T1: _transportNeighbors — endpoint / środek / spoza / multi-linia / dedup ──
console.log('── T1: _transportNeighbors ──');
{
  const DEFS = transportDefs(NEW);
  // Prawdziwa linia „Blekitna Wstega - Kreutzhofen": 6429—6621—7233—5207
  const state = { roomById: { 6429: {}, 6621: {}, 7233: {}, 5207: {} } };
  const fn = new Function('state', 'TRANSPORT_DEFS', neighborsFn() + '\n;return _transportNeighbors;')(state, DEFS);
  const n5207 = fn(5207);
  ok(n5207.length === 1 && n5207[0].stopId === 7233, 'endpoint 5207 → 1 kandydat (7233)');
  const n6621 = fn(6621);
  ok(n6621.length === 2 && n6621.some(c => c.stopId === 7233) && n6621.some(c => c.stopId === 6429),
    'środek trasy 6621 → 2 kandydatów (7233, 6429)');
  ok(fn(999999).length === 0, 'pokój spoza transportów → 0 kandydatów');
  ok(n6621.every(c => typeof c.lineName === 'string' && c.lineName.length > 0), 'kandydaci mają nazwę linii');
  // Pokój spoza mapy jako kandydat → odfiltrowany (state.roomById wymagane)
  const state2 = { roomById: { 6621: {} } };
  const fn2 = new Function('state', 'TRANSPORT_DEFS', neighborsFn() + '\n;return _transportNeighbors;')(state2, DEFS);
  ok(fn2(6621).length === 0, 'kandydaci spoza wczytanej mapy odfiltrowani');

  // Syntetyk: multi-linia + deduplikacja
  const SYNT = [
    ['Linia A-B-C', [], null, [[1, 2, 10, null], [2, 3, 10, null]]],
    ['Linia A-D',     [], null, [[1, 4, 10, null], [4, 1, 10, null]]],
    ['Linia dup',     [], null, [[1, 2, 10, null], [2, 1, 10, null]]],
  ];
  const st3 = { roomById: { 1: {}, 2: {}, 3: {}, 4: {} } };
  const fn3 = new Function('state', 'TRANSPORT_DEFS', neighborsFn() + '\n;return _transportNeighbors;')(st3, SYNT);
  const n1 = fn3(1);
  ok(n1.length === 2 && n1.some(c => c.stopId === 2) && n1.some(c => c.stopId === 4),
    'pokój na 2 liniach → 2 kandydatów, deduplikacja (2 z dwóch linii = raz)');
  ok(fn3(2).length === 2 && fn3(2).some(c => c.stopId === 1) && fn3(2).some(c => c.stopId === 3),
    'środek A-B-C → A i C');
}

// ── T2: symulacja DOM — permutacje klików, podświetlenia ────────────────────
console.log('── T2: podświetlenia przełączników (permutacje) ──');
{
  // Atrapa DOM: przyciski wg HTML (2 algo, 3 dir, 2 trans, 2 aggro) + wiersz aggro
  function mkBtn(dataset) {
    const classes = new Set(['wp-algo-btn']);
    if (dataset.dir) classes.add('wp-dir-btn');
    if (dataset.trans) classes.add('wp-trans-btn');
    if (dataset.aggro) classes.add('wp-trans-aggro');
    const listeners = {};
    return {
      dataset, disabled: false, title: '',
      classList: {
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        contains: c => classes.has(c),
        toggle: (c, force) => { const on = force === undefined ? !classes.has(c) : !!force; on ? classes.add(c) : classes.delete(c); return on; },
      },
      addEventListener: (ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); },
      click() { (listeners.click || []).forEach(f => f()); },
    };
  }
  const algoBtns = [mkBtn({ algo: 'dijkstra' }), mkBtn({ algo: 'astar' })];
  const dirBtns  = [mkBtn({ dir: 'cardinal' }), mkBtn({ dir: 'vertical' }), mkBtn({ dir: 'all' })];
  const transBtns = [mkBtn({ trans: 'off' }), mkBtn({ trans: 'on' })];
  const aggroBtns = [mkBtn({ aggro: 'normal' }), mkBtn({ aggro: 'aggressive' })];
  const aggroRow = { style: {} };
  const all = [...algoBtns, ...dirBtns, ...transBtns, ...aggroBtns];

  const documentStub = {
    querySelectorAll(sel) {
      if (sel === '.wp-algo-btn[data-algo]') return algoBtns;
      if (sel === '.wp-dir-btn') return dirBtns;
      if (sel === '.wp-trans-btn') return transBtns;
      if (sel === '.wp-trans-aggro') return aggroBtns;
      throw new Error('nieznany selektor w teście: ' + sel);
    },
    getElementById(id) { return id === 'wp-trans-aggro-row' ? aggroRow : null; },
  };

  const wpState = { algorithm: 'dijkstra', dirMode: 'all', transportMode: 'off' };
  const calls = { recalc: 0, redraw: 0 };
  const code = togglesBlock() + '\n;return { wpRefreshDirUI, wpRefreshTransportUI };';
  const api = new Function('document', 'wpState', 'wpRecalcPaths', 'wpRebuildList', 'wpUpdateSummary', 'draw', code)(
    documentStub, wpState,
    () => calls.recalc++, () => {}, () => {}, () => calls.redraw++);

  // Stan początkowy HTML: dijkstra + all + pieszo + normal włączone
  algoBtns[0].classList.add('wp-algo-on');
  dirBtns[2].classList.add('wp-algo-on');
  transBtns[0].classList.add('wp-algo-on');
  aggroBtns[0].classList.add('wp-algo-on');

  const onIn = btns => btns.map(b => b.classList.contains('wp-algo-on'));
  function expectGroups(a, d, t, g, label) {
    ok(JSON.stringify(onIn(algoBtns)) === JSON.stringify(a), `${label}: algo ${a}`);
    ok(JSON.stringify(onIn(dirBtns)) === JSON.stringify(d), `${label}: dir ${d}`);
    ok(JSON.stringify(onIn(transBtns)) === JSON.stringify(t), `${label}: trans ${t}`);
    ok(JSON.stringify(onIn(aggroBtns)) === JSON.stringify(g), `${label}: aggro ${g}`);
  }

  // ZGŁOSZONY BUG: klik A* NIE może zgasić Pieszo
  algoBtns[1].click();
  expectGroups([false, true], [false, false, true], [true, false], [true, false], 'klik A*');
  ok(wpState.algorithm === 'astar', 'klik A*: stan = astar');

  // Klik Pieszo (już aktywny) → no-op, podświetlenia bez zmian
  const recalcBefore = calls.recalc;
  transBtns[0].click();
  expectGroups([false, true], [false, false, true], [true, false], [true, false], 'klik Pieszo (no-op)');
  ok(calls.recalc === recalcBefore, 'klik Pieszo gdy aktywny: bez przeliczenia');

  // Włącz transporty → Normalny widoczny, algo wyłączone (disabled), podświetlenia spójne
  transBtns[1].click();
  expectGroups([false, true], [false, false, true], [false, true], [true, false], 'klik Statki/dyliżanse');
  ok(aggroRow.style.display === 'flex', 'wiersz normalny/agresywny widoczny');
  ok(algoBtns.every(b => b.disabled), 'algo przyciski disabled przy transportach');

  // Agresywny
  aggroBtns[1].click();
  expectGroups([false, true], [false, false, true], [false, true], [false, true], 'klik Agresywny');

  // Klik Dijkstra przy włączonych transportach → NIE może zgasić transportów ani aggro
  algoBtns[0].click();
  expectGroups([true, false], [false, false, true], [false, true], [false, true], 'klik Dijkstra przy transportach');

  // Filtr kierunków → nie rusza reszty
  dirBtns[0].click();
  expectGroups([true, false], [true, false, false], [false, true], [false, true], 'klik Kardynalne');

  // Wyłącz transporty → wraca Pieszo, aggro chowa się
  transBtns[0].click();
  expectGroups([true, false], [true, false, false], [true, false], [false, false], 'klik Pieszo (powrót)');
  ok(aggroRow.style.display === 'none', 'wiersz aggro schowany przy pieszo');
  ok(algoBtns.every(b => !b.disabled), 'algo przyciski odblokowane przy pieszo');

  // Wyczerpujące przejścia: każdy algo × dir × trans × aggro z każdego stanu
  const seqs = [
    [algoBtns[0], dirBtns[0], transBtns[0], aggroBtns[0]],
    [algoBtns[1], dirBtns[1], transBtns[1], aggroBtns[1]],
    [dirBtns[2], transBtns[0], algoBtns[0], aggroBtns[0]],
    [transBtns[1], aggroBtns[1], algoBtns[1], dirBtns[0]],
    [aggroBtns[0], transBtns[0], dirBtns[1], algoBtns[1]],
    [dirBtns[0], algoBtns[0], aggroBtns[1], transBtns[1]],
  ];
  let allOk = true;
  for (const seq of seqs) {
    for (const b of seq) b.click();
    for (const g of [algoBtns, dirBtns, transBtns]) {
      const on = g.filter(b => b.classList.contains('wp-algo-on')).length;
      if (on !== 1) allOk = false;
    }
    // aggro: dokładnie 1 gdy transporty włączone, 0 gdy pieszo (wiersz ukryty)
    const onAggro = aggroBtns.filter(b => b.classList.contains('wp-algo-on')).length;
    if (onAggro !== (wpState.transportMode === 'off' ? 0 : 1)) allOk = false;
  }
  ok(allOk, '6 sekwencji × 4 kliki: zawsze dokładnie 1 włączony w algo/dir/trans, aggro ≡ tryb');

  // Spójność stanu z podświetleniem po każdej sekwencji
  const lastAlgo = algoBtns.findIndex(b => b.classList.contains('wp-algo-on'));
  ok(['dijkstra', 'astar'][lastAlgo] === wpState.algorithm, 'podświetlenie algo ≡ wpState.algorithm');
  const lastDir = dirBtns.findIndex(b => b.classList.contains('wp-algo-on'));
  ok(['cardinal', 'vertical', 'all'][lastDir] === wpState.dirMode, 'podświetlenie dir ≡ wpState.dirMode');
}

// ── T3: asercje strukturalne ────────────────────────────────────────────────
console.log('── T3: struktura HTML/CSS ──');
{
  ok(/#wp-mode-indicator\s*{[^}]*bottom:\s*70px[^}]*left:\s*50%/.test(NEW), 'P1: #wp-mode-indicator wyśrodkowany, bottom 70px');
  ok(/#wp-speed-input\s*{[^}]*width:\s*92px/.test(NEW), 'P5: #wp-speed-input width 92px');
  const drA = NEW.indexOf('function drawRoute()');
  const drB = NEW.indexOf('// ── Overview canvas', drA);
  ok(drA > 0 && drB > drA && !NEW.slice(drA, drB).includes('rgba(80,170,255'), 'P2: drawRoute bez niebieskiego hopa');
  ok(NEW.includes('const segHop = []'), 'P2: minimapka śledzi hopy (segHop)');
  ok(!NEW.includes(".wp-algo-btn:not(.wp-dir-btn)"), 'P3: brak starego selektora :not(.wp-dir-btn)');
  ok((NEW.match(/\.wp-algo-btn\[data-algo\]/g) || []).length === 5, 'P3: 5× selektor [data-algo] (import/handler×2/disable/reset)');
  ok(NEW.includes('function _transportNeighbors(roomId)'), 'P6: _transportNeighbors istnieje');
  ok(NEW.includes('showTransportJumpChooser(cands, sx, sy)'), 'P6: dwuklik → lista wyboru przy ≥2 kandydatach');
  ok(NEW.includes('id = \'tp-jump-chooser\'') || NEW.includes("el.id = 'tp-jump-chooser'"), 'P6: element listy wyboru');
  ok(/#tp-jump-chooser\s*{[^}]*width:\s*max-content/.test(NEW), 'P6: popup autofit (width: max-content, sufit viewport)');
  ok(!/\.tp-jump-item\s*{[^}]*text-overflow/.test(NEW), 'P6: pozycje listy bez ucinania tekstu');
  const rdA = NEW.indexOf('function resetAllDefaults()');
  const rd = NEW.slice(rdA, rdA + 4000);
  ok(rd.includes("wpState.algorithm = 'dijkstra'") && rd.includes("wpState.dirMode = 'all'")
    && rd.includes("wpState.transportMode = 'off'") && rd.includes('wpState.speed = 3'),
    'P7: reset domyślny obejmuje algo/dir/trans/speed');
  ok(rd.includes('wpRefreshDirUI()') && rd.includes('wpRefreshTransportUI()'), 'P7: reset odświeża UI przełączników');
  ok(rd.includes('przełączniki planera'), 'P7: confirm wspomina przełączniki planera');
  // Liczba przycisków w HTML zgodna z atrapa T2
  ok((NEW.match(/data-algo="/g) || []).length === 2, 'HTML: 2 przyciski data-algo');
  ok((NEW.match(/wp-dir-btn[^"]*"\s+data-dir="/g) || []).length === 3, 'HTML: 3 przyciski filtra kierunków (wp-dir-btn)');
  ok((NEW.match(/data-trans="/g) || []).length === 2, 'HTML: 2 przyciski data-trans');
  ok((NEW.match(/data-aggro="/g) || []).length === 2, 'HTML: 2 przyciski data-aggro');
}


// ── T4: v1.5.37 — etykiety przystanków, chooser po nazwach, hopy na minimapce ──
console.log('── T4: v1.5.37 — etykiety / chooser / hop-dash ──');
{
  // Preferencja etykiety przy deduplikacji: leg odwrotny (label null) trafiony
  // PRZED legiem w przód (label) → etykieta i tak wygrywa.
  // Pokój 1 sąsiaduje z 2 przez leg odwrotny (label null) ORAZ leg w przód (label).
  // Leg odwrotny występuje w danych PIERWSZY — stare first-wins gubiło etykietę.
  const SYNT = [
    ['Linia X', [], null, [[2, 1, 10, 'Etykieta Pokoju 1'], [1, 2, 10, 'Etykieta Pokoju 2']]],
  ];
  const st = { roomById: { 1: {}, 2: {} } };
  const fn = new Function('state', 'TRANSPORT_DEFS', neighborsFn() + '\n;return _transportNeighbors;')(st, SYNT);
  const n1 = fn(1);
  ok(n1.length === 1 && n1[0].stopId === 2, 'dedup: ten sam przystanek z legów w obie strony = raz');
  ok(n1[0].label === 'Etykieta Pokoju 2', 'dedup: etykieta wygrywa mimo że leg odwrotny był pierwszy');
  const n2 = fn(2);
  ok(n2.length === 1 && n2[0].stopId === 1 && n2[0].label === 'Etykieta Pokoju 1',
    'leg w przód przed odwrotnym: etykieta obecna, deduplikacja zachowana');

  // Chooser: primary = etykieta → nazwa pokoju → #ID; sufiks linii tylko przy duplikatach
  ok(NEW.includes('return c.label || (r && r.name) || `#${c.stopId}`;'),
    'chooser: pozycja = etykieta docelowego przystanku (fallback nazwa pokoju → #ID)');
  ok(NEW.includes('primaryCount.get(primaries[ci]) > 1'),
    'chooser: sufiks z nazwą linii tylko gdy nazwy docelowe się powtarzają');

  // Minimapka: hopy kropkowane per-segment w obu przejściach (glow + linia główna)
  const ovA = NEW.indexOf('function wpUpdateOverview() {');
  const ovB = NEW.indexOf('// ── Markery WP', ovA);
  const OV = NEW.slice(ovA, ovB);
  ok((OV.match(/ovSeg\(segHop\[i-1\]\)/g) || []).length === 2, 'minimapka: segHop użyty w glow i linii głównej');
  ok(OV.includes('octx.setLineDash([2, 2.5])'), 'minimapka: hop = kreska kropkowana [2, 2.5]');
  ok(OV.includes('octx.setLineDash([]);'), 'minimapka: reset dash po rysowaniu');
}

// ── T5: v1.5.38 — etykiety dla legów odwrotnych (pętle) + kierunek przy duplikatach ──
console.log('── T5: v1.5.38 — pętle: etykiety odwrotne + kierunek ──');
{
  // Syntetyczna pętla A→B→C→A: każdy przystanek ma etykietę z legu, który w nim kończy
  const CYKL = [['Pętla A-B-C', [], null, [[1, 2, 10, 'B'], [2, 3, 10, 'C'], [3, 1, 10, 'A']]]];
  const stC = { roomById: { 1: {}, 2: {}, 3: {} } };
  const fnC = new Function('state', 'TRANSPORT_DEFS', neighborsFn() + '\n;return _transportNeighbors;')(stC, CYKL);
  const n1 = fnC(1);
  ok(n1.length === 2 && n1.every(c => c.label),
    'pętla: obaj kandydaci z etykietami (także z legu odwrotnego)');
  ok(n1.find(c => c.stopId === 2).label === 'B' && n1.find(c => c.stopId === 3).label === 'C',
    'pętla: właściwe etykiety docelowych przystanków');
  ok(n1.find(c => c.stopId === 2).nextLabel === 'C' && n1.find(c => c.stopId === 3).nextLabel === 'A',
    'pętla: nextLabel = kierunek dalszej jazdy z przystanku kandydata');

  // Prawdziwe definicje: pętla Ard Skellig - Faroe - Rozrog (numeryczne nazwy pokoi upstream)
  const DEFS = transportDefs(NEW);
  const stR = { roomById: { 3280: {}, 23669: {}, 10313: {} } };
  const fnR = new Function('state', 'TRANSPORT_DEFS', neighborsFn() + '\n;return _transportNeighbors;')(stR, DEFS);
  const n3280 = fnR(3280);
  ok(n3280.find(c => c.stopId === 23669)?.label === 'Faroe'
    && n3280.find(c => c.stopId === 10313)?.label === 'Ard Skellig',
    'pętla Skellige: „Faroe"/„Ard Skellig" zamiast numerów pokoi');
  ok(fnR(23669).find(c => c.stopId === 10313)?.label === 'Ard Skellig',
    'pętla Skellige: odwrotny kandydat #10313 → „Ard Skellig"');

  // Dwa doki Blaviken: obaj kandydaci „Blaviken", rozróżnieni kierunkiem
  const stB = { roomById: { 2223: {}, 4058: {}, 4061: {} } };
  const fnB = new Function('state', 'TRANSPORT_DEFS', neighborsFn() + '\n;return _transportNeighbors;')(stB, DEFS);
  const nB = fnB(2223);
  const nl = nB.map(c => c.nextLabel).sort();
  ok(nB.length === 2 && nB.every(c => c.label === 'Blaviken')
    && nl[0] === 'Daevon' && nl[1] === 'Novigrad',
    'Blaviken ×2: kandydaci rozróżnieni kierunkiem (Daevon / Novigrad)');

  // Chooser: duplikat na tej samej linii → sufiks „kierunek:", nie nazwa linii
  ok(NEW.includes("line.textContent = (sameLineDup && c.nextLabel) ? '— kierunek: ' + c.nextLabel : '— ' + c.lineName;"),
    'chooser: duplikat na tej samej linii → „— kierunek: …" zamiast nazwy linii');
  ok(NEW.includes('const stopLabel = new Map();')
    && NEW.includes("label: stopLabel.get(leg[0]) || null"),
    'transportNeighbors: mapa stopId→etykieta zasila legi odwrotne');
}
console.log(`\n═══ planner_ui.js: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
