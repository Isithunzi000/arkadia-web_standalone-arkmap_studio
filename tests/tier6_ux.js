// Harness Tier 6 (v1.41.0) — UX: D1 dirty przy re-wejsciu w edycje, D2(c) bufor
// „Przywroc ostatni zapis" (pristineArkmap + restoreLastSave + dialogi unsaved,
// D4: wiazania dlg-unsaved-exit przy uspionym GitHub), #18 bramka nadpisania
// importu trasy, #8 delegacja 1-palcowego touch-drag do canvasMode.
// Wzorzec extract/ok jak tier5_audit.js.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  OK', name); }
  else { fail++; console.log('  FAIL', name); }
}
function extract(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('BRAK KOTWICY: ' + anchor);
  if (src.indexOf(anchor) !== src.lastIndexOf(anchor)) throw new Error('kotwica nieunikalna: ' + anchor);
  let d = 0; const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('niezbalansowane klamry: ' + anchor);
}
function blockSlice(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica bloku: ' + a);
  return HTML.slice(i, j);
}
function count(s) { return HTML.split(s).length - 1; }

// ═══ Sekcja A: D1 — startLocalEditMode nie zeruje dirty ═══
console.log('— A: D1 dirty przy re-wejsciu —');
{
  const fn = extract(HTML, 'function startLocalEditMode() {');
  ok(!fn.includes('state.dirty = false'), 'A1: startLocalEditMode NIE zeruje dirty');
  ok(fn.includes('T6/D1'), 'A2: komentarz T6/D1 w ciele funkcji');
  ok(fn.includes("state.dirty ?") && fn.includes('niezapisane zmiany'),
    'A3: wariantowy toast sygnalizuje niezapisane zmiany przy re-wejsciu');
  ok(count('state.editMode = true') === 1,
    'A4: dokladnie jedna sciezka wejscia w editMode (grep-audyt) — jest ' + count('state.editMode = true'));
}

// ═══ Sekcja B: D2(c) — bufor + restoreLastSave + dialogi ═══
console.log('— B: D2(c) Przywroc ostatni zapis —');
{
  ok(count('pristineArkmap:     null') === 1, 'B1: pristineArkmap w state init (count==1)');

  const wrap = extract(HTML, 'applyMap = function(map) {');
  ok(wrap.includes('state.pristineArkmap = _serializeMap();'),
    'B2: wrapper applyMap ustawia bufor przy kazdym wczytaniu');

  const save = extract(HTML, 'function _performArkmapSave(onSaved) {');
  ok((save.split('const text = _serializeMap()').length - 1) === 1
    && !save.includes('() => _serializeMap()') && save.includes('writable.write(text)'),
    'B3: _performArkmapSave serializuje raz (const text), zero leniwych lambd');
  ok((save.split('state.pristineArkmap = text;').length - 1) === 4,
    'B4: bufor ustawiany przy 4/4 punktow sukcesu zapisu — jest '
    + (save.split('state.pristineArkmap = text;').length - 1));

  const saveAs = extract(HTML, 'function _performArkmapSaveAs() {');
  ok((saveAs.split('const text = _serializeMap()').length - 1) === 1
    && !saveAs.includes('() => _serializeMap()'),
    'B5: _performArkmapSaveAs serializuje raz (luka z audytu planu zamknieta)');
  ok((saveAs.split('state.pristineArkmap = text;').length - 1) === 2,
    'B6: bufor przy 2/2 punktow sukcesu Zapisz-kopie — jest '
    + (saveAs.split('state.pristineArkmap = text;').length - 1));

  const rest = extract(HTML, 'function restoreLastSave() {');
  ok(rest.includes('if (!state.pristineArkmap || !state.map) return;'),
    'B7: restoreLastSave guard braku bufora');
  ok(rest.includes('try { map = JSON.parse(state.pristineArkmap); }') && rest.includes('catch'),
    'B8: parse w try/catch — blad = stan nietkniety');
  ok(rest.includes('applyMap(map)') && rest.includes('_arkmapFileHandle = fh'),
    'B9: pelna podmiana przez applyMap + zachowanie handle pliku');
  ok(rest.includes('state.pendingEnv = null;'),
    'B10: restore czysci pendingEnv (T5/F4 — wrapper go nie rusza)');

  ok(count('class="dlg-cancel dlg-restore"') === 2 && count('dlg-restore') === 4,
    'B11: przycisk Przywroc w obu dialogach (2 markup + 2 listenery) — markup '
    + count('class="dlg-cancel dlg-restore"') + ', total ' + count('dlg-restore'));
  ok(count('Wyjdź — zachowaj w pamięci') === 2,
    'B12: jednoznaczne etykiety Wyjdz-zachowaj w obu dialogach');

  const wireExit = blockSlice("const unsavedExit = document.getElementById('dlg-unsaved-exit');",
    '// dlg-lock-expired buttons');
  ok(wireExit.includes("querySelector('.dlg-abandon')") && wireExit.includes("querySelector('.dlg-restore')")
    && wireExit.includes("querySelector('.dlg-save')") && wireExit.includes("querySelector('.btn-edit')")
    && wireExit.includes("openDialog('dlg-compose-pr')"),
    'B13: dlg-unsaved-exit — wszystkie 4 przyciski zwiazane (D4, naprawa martwych)');

  // D4: blokada GitHub nietknieta
  ok(count('edlg-gh-disabled') >= 1 && HTML.includes('pointer-events:none')
    && count('githubSession = true') === 0,
    'B14: GitHub dalej uspiony — zero sciezek githubSession=true, kafelki zablokowane');
  // Arc 15: szerokosci ciasnych aktywnych okien (straznik przed regresem)
  for (const [did, w] of [['dlg-exit-bidirectional', 'width:400px'],
                          ['dlg-unsaved-local', 'width:600px'],
                          ['dlg-unsaved-exit', 'width:700px']]) {
    const box = HTML.slice(HTML.indexOf('id="' + did + '"'), HTML.indexOf('id="' + did + '"') + 200);
    ok(box.includes('class="dlg-box narrow" style="' + w + '"'), did + ': ' + w + ' (przyciski w 1 rzedzie)');
    ok(!box.includes('max-width'), did + ': brak max-width na boksie (chroni klasowe 90vw)');
  }

  // v1.45.1: geometria val-modal + siatka wrap na stopkach flex-end.
  // Klasa buga: stopka nowrap + justify-content:flex-end = przy przelewie przyciski
  // wypychane sa w LEWO i obcinane na krawedzi okna (overflow:hidden na #val-modal).
  // Zgloszenie usera: „Kopiuj raport" na krawedzi po dodaniu 2 przyciskow raportu.
  // Repro empiryczne: E9.valmodal-geom (FAIL na 520px, PASS po fixie).
  ok(/#val-modal\s*\{[^}]*?width:\s*600px/.test(HTML),
    'B15: #val-modal width:600px (stopka 4 przyciski ~536px + padding 36px; 520px = przelew)');
  for (const sel of ['#val-modal-footer', '#ol-confirm-footer', '#wp-import-footer', '.edlg-ftr']) {
    const esc = sel.replace(/[.#-]/g, '\\$&');
    const m = HTML.match(new RegExp(esc + '\\s*\\{[^}]*\\}'));
    ok(!!m && /flex-wrap\s*:\s*wrap/.test(m[0]),
      sel + ': flex-wrap:wrap (siatka — przelew lamie sie do wiersza zamiast obcinac)');
  }

  // Arc 29: dlg-suppressors poszerzony pod 5 przyciskow stopki (eksport raportu, regula N3).
  // Pomiar F0: ~604px content przy najdluzszych etykietach sciezki .dat (500px = przelew
  // stopki nowrap). Repro empiryczne: E22.supp-geom. max-width:90vw klasy chroni mobile.
  {
    const box = HTML.slice(HTML.indexOf('id="dlg-suppressors"'), HTML.indexOf('id="dlg-suppressors"') + 700);
    ok(box.includes('class="dlg-box wide" style="width:660px"'),
      'B16: dlg-suppressors width:660px (5 przyciskow stopki; 500px = przelew)');
  }

  // Arc 31 F2: LOD roomsOnly — progi z pomiaru probe_lod (2026-08-23, trasa
  // kamery, plaszczyzna 518 pokoi): kroki p95 maja cellPx <= 8.81. Kaskada
  // czytelnosci przy oddalaniu: exits <0.5, suppressors <0.35, etykiety <0.3.
  // Wskaznik: forma krotka „LOD" — decyzja na liczbach z probe_geom (luz
  // w #msb-info przy najdluzszym zestawie pol = 94 px; „LOD: tylko pokoje"
  // ~104 px = ciasno). Repro empiryczne: E23.lod / E23.lod-geom.
  ok(HTML.includes('const LOD_MIN_CELL_PX = 9;'),
    'B17: prog czytelnosci strzalki cellPx 9 (przy 8.81 strzalka ~4 px = szum subpikselowy)');
  ok(HTML.includes('const LOD_ROOMS_BUDGET = 200;'),
    'B18: budzet 200 pokoi ~600 prymitywow wyjsc ~1.5-2 ms (F0: exits+stubs+cl = 30-40% klatki przy 518)');
  ok(HTML.includes('id="msb-lod"'),
    'B19: wskaznik LOD w pasku statusu (#msb-info, forma krotka + tooltip)');

  // Arc 31 F3: LOD raster — drugi prog przy ekstremalnych oddaleniach.
  // Przy cellPx < 3 pokoj (0.65 * cellPx) ma < 2 px: geometria wektorowa
  // (obrys, wypelnienie, antyaliasing krawedzi) kosztuje wiecej niz sam
  // piksel — ImageData w rozdzielczosci komorki + drawImage nearest-neighbor
  // daje identyczny obraz przy O(1) blit zamiast O(n) fillRect. Repro: E23.raster.
  ok(HTML.includes('const LOD_RASTER_CELL_PX = 3;'),
    'B20: prog rastra cellPx 3 (pokoj < 2 px — wektor drozszy niz piksel)');
  ok(HTML.includes('_rasterInvalidate();') &&
     /function buildRoomsZ\([\s\S]*?_rasterInvalidate\(\);/.test(HTML) &&
     /function buildColorCache\([\s\S]*?_rasterInvalidate\(\);/.test(HTML),
    'B21: uniewaznienie rastra podpieciete w buildRoomsZ i buildColorCache');

  // Arc 31 F4: CullIndex — uniform grid nad PUNKTAMI pokoi (custom lines
  // rysowane per pokoj z vis, nie wchodza do indeksu). Fallback liniowy <256:
  // skan 255 pokoi to mikrosekundy — indeks sie nie oplaca. Komorka 16x16
  // komorek mapy: plaszczyzna 1520 pokoi (najwieksza w fixture, area 52 z 0)
  // to ~10x10 cel ~ 15 pokoi/cela; viewport full-zoom (~63x39 komorek) czyta
  // ~4x3 cel ~ 180 kandydatow zamiast skanu 1520. Repro: E23.cull.
  ok(HTML.includes('const CULL_INDEX_MIN = 256;'),
    'B22: fallback liniowy dla malych plaszczyzn (<256 pokoi = skan trywialny)');
  ok(HTML.includes('const CULL_GRID_CELLS = 16;'),
    'B23: komorka siatki 16x16 komorek mapy (1520 pokoi -> ~180 kandydatow vs pelny skan)');
  ok(/function buildRoomsZ\([\s\S]*?_buildCullIndex\(\);/.test(HTML) &&
     HTML.includes('const vis = _cullQuery(rooms, vx0, vx1, vy0, vy1);'),
    'B24: indeks budowany w buildRoomsZ (kazda mutacja) + draw() culluje przez _cullQuery');

  // ── F5 (v1.48.2): raport HTML kalki z miniaturami przed/po ──
  ok(HTML.includes('id="dp-save-html"') && HTML.includes('⬇ Zapisz raport .html'),
    'B25: 7. przycisk stopki panelu kalki — bramka F5-geom (sonda 2026-08-24): dluga etykieta nie zmienia liczby rzedow wrap (2 przy 560 px, 3 przy 448 px) — szerokosc panelu bez zmian');
  ok(HTML.includes('const DELTA_THUMB_CAP = 60;') && HTML.includes('.slice(0, DELTA_THUMB_CAP)'),
    'B26: cap miniaturek 60 — grupy ponad cap tekstowo');
  ok(/finally \{\n    _deltaGhosts = savedGhosts;\n    _rasterInvalidate\(\);/.test(HTML),
    'B27: render „po" izoluje raster F3 i duchy (finally: restore + uniewaznienie)');

  // Plan H (audyt zewnetrzny 2026-08-24): hartowanie kosmetyczne, zero zmian
  // zachowania. H1: hipotetyczny wyjatek w srodku iteracji drawRooms nie
  // zostawia wisiacego ctx.save() (wyciek globalAlpha faded na kolejne klatki).
  ok(/ctx\.save\(\);\n    try \{   \/\/ Plan H \(H1/.test(HTML) &&
     /\n    \} finally \{\n      ctx\.restore\(\);   \/\/ ZAD7: domknij ctx\.save\(\) pokoju/.test(HTML),
    'B28: H1 — drawRooms: save per pokoj pod try, restore w finally (wyjatek nie wycieka globalAlpha)');
}

// ═══ Sekcja C: #18 — bramka potwierdzenia importu trasy ═══
console.log('— C: #18 import trasy —');
{
  ok(count('let _wpImportPending = null;') === 1, 'C1: deklaracja _wpImportPending (count==1)');

  const closeFn = extract(HTML, 'function wpImportClose() {');
  ok(closeFn.includes('_wpImportPending = null;') && closeFn.includes("textContent = 'Importuj trasę'"),
    'C2: wpImportClose resetuje bramke (pokrywa cancel/X/overlay/Escape)');

  const inputIdx = HTML.indexOf("document.getElementById('wp-import-textarea').addEventListener('input'");
  ok(inputIdx > 0 && HTML.slice(inputIdx, inputIdx + 400).includes('_wpImportPending = null;'),
    'C3: zmiana kodu w textarei resetuje bramke');

  const handler = blockSlice('// Importuj trasę — logika', '_wpImportApply(res);');
  ok(handler.includes('wpHasActiveRoute() && _wpImportPending !== code')
    && handler.includes("'Nadpisz'") && !handler.includes('wpState.waypoints = newWps'),
    'C4: handler confirm: bramka wpHasActiveRoute+pending, bez bezposredniego nadpisania');

  const applyFn = extract(HTML, 'function _wpImportApply(res) {');
  ok(applyFn.includes('wpImportClose();') && applyFn.includes('wpState.waypoints = newWps;'),
    'C5: _wpImportApply wydzielone: zamyka modal (reset bramki) i aplikuje trase');
  ok(count('_wpImportApply(res);') === 1 && count('function _wpImportApply(res) {') === 1,
    'C6: dokladnie jedno wywolanie i jedna definicja _wpImportApply');
}

// ═══ Sekcja D: #8 — touch delegowany do canvasMode ═══
console.log('— D: #8 touch —');
{
  const tstart = blockSlice("cv.addEventListener('touchstart'", "cv.addEventListener('touchmove'");
  ok(tstart.includes('_paintStroke = new Map();') && tstart.includes('_paintApplyAtScreen(evX(t0), evY(t0))'),
    'D1: touchstart — paint rozpoczyna pociagniecie i maluje pierwszy pokoj');
  ok(tstart.includes('state.editDraggingRoom = true;') && tstart.includes('r.id === state.selected'),
    'D2: touchstart — drag na zaznaczonym pokoju = przesuwanie (hit Chebyshev 0.525)');
  ok(tstart.includes('state.dragging = true;'),
    'D3: touchstart — pan zostaje domyslny (viewer/cl-drawing/puste pole)');

  const tmove = blockSlice("cv.addEventListener('touchmove'", "cv.addEventListener('touchend'");
  ok(tmove.includes('if (_paintStroke !== null) { _paintApplyAtScreen(evX(t), evY(t)); return; }'),
    'D4: touchmove — paint drag maluje zamiast panowac');
  ok(tmove.includes('state.editDraggingRoom && state.selected')
    && tmove.includes('state.ox += t.clientX - state.dragX;'),
    'D5: touchmove — delegacja room-drag PRZED zachowanym panem');

  const tend = blockSlice("cv.addEventListener('touchend'", "cv.addEventListener('touchcancel'");
  ok(tend.includes('_paintStrokeCommit()') && tend.indexOf('_paintStrokeCommit()') < tend.indexOf('_lastTap'),
    'D6: touchend — commit paint przed detekcja tap (mirror mouseup: return po commicie)');
  ok(tend.includes('_tryMoveRoomWithPolicy(room, toX, toY, { force: false,')
    && tend.includes("moveRes === 'blocked'"),
    'D7: touchend — commit MOVE_ROOM z force:false (brak Shift na touch) + obsluga blocked');

  const tcancel = blockSlice("cv.addEventListener('touchcancel'", "cv.addEventListener('wheel'");
  ok(tcancel.includes('_paintStrokeRevert()') && tcancel.includes('state.editDraggingRoom = false;'),
    'D8: touchcancel — sprzata oba stany bez mutacji mapy');

  ok(count('Math.hypot(t2.clientX - t1.clientX') === 1 && tmove.includes('_lastPinchDist = dist;'),
    'D9: pinch-to-zoom nienaruszony (pin regresji)');
}

// ═══ Sekcja E (audyt Arc 8 / D-C3, D-C4): cheat sheet + dialog online vs kod ═══
console.log('— E: D-C3/D-C4 — cheat sheet i dialog online —');
{
  // D-C3: sync-map.yml cron 2x dziennie (17 5 + 0 21 UTC) — dialog nie moze mowic "codziennie"
  ok(!HTML.includes('od\u015Bwie\u017Cane codziennie'),
    'E1: dialog online — brak "odswiezane codziennie" (cron 2x/dobe)');
  ok(HTML.includes('od\u015Bwie\u017Cane dwa razy dziennie'),
    'E2: dialog online — "odswiezane dwa razy dziennie"');
  // D-C4a: keydown 11474/11481 obsluguje Delete ORAZ Backspace (pokoj i etykieta)
  ok(HTML.includes('Delete / Backspace'), 'E3: cheat sheet — alias Backspace przy Delete');
  ok(HTML.includes('Usu\u0144 zaznaczony pok\u00F3j / etykiet\u0119'),
    'E4: cheat sheet — Delete usuwa pokoj lub etykiete');
  // D-C4b: ctx-room (markup ~3954) ma "Ustaw pozycje (x/y/z)", nie pozycje "wyjscie"
  ok(!HTML.includes('Edytuj / wyj\u015Bcie / przenie\u015B / usu\u0144'),
    'E5: cheat sheet — stary opis menu pokoju usuniety');
  ok(HTML.includes('Edytuj / pozycja / przenie\u015B / usu\u0144'),
    'E6: cheat sheet — menu pokoju: edytuj/pozycja/przenies/usun');
  // D-C4c: ctx-empty ma tez "Dodaj etykiete tutaj"
  ok(HTML.includes('Dodaj pok\u00F3j / etykiet\u0119 / edytuj obszar'),
    'E7: cheat sheet — menu pustego: pokoj/etykieta/obszar');
  // D-C4d: wariant viewer (ctx-viewer: Wysrodkuj widok tutaj)
  ok(HTML.includes('Puste (podgl\u0105d)'),
    'E8: cheat sheet — wariant viewer menu kontekstowego');
}

// ── Arc 9: dlg-load-during-edit — przyciski po id, nie po kolejnosci DOM ──
{
  for (const id of ['btn-lde-cancel', 'btn-lde-discard', 'btn-lde-save'])
    ok(HTML.includes('id="' + id + '"'), 'LDE: przycisk ' + id + ' ma stabilne id w HTML');
  ok(!HTML.includes("dlgLDE.querySelectorAll('button')"),
    'LDE: JS nie destrukturyzuje przyciskow po kolejnosci DOM');
  ok((HTML.match(/getElementById\('btn-lde-save'\)/g) || []).length === 2,
    'LDE: oba call-site (online + lokalny) selektuja saveBtn po id');
}

// ── A31 (Arc 31, audyt zewnetrzny, fala 1): renderer/cache — invalidacja + higiena ctx ──
{
  ok((HTML.match(/_rasterInvalidate\(\);/g) || []).length >= 10,
    'A31-F1.8: invalidacja rastra we wszystkich sciezkach mutacji env/symbol/hidden (6 nowych + istniejace)');
  const m = HTML.match(/function drawRoomsRaster\(\) \{[\s\S]*?\n\}/);
  ok(!!m && m[0].includes('ctx.save()') && m[0].includes('ctx.restore()'),
    'A31-F1.10: drawRoomsRaster — ctx.save/restore wokol blitu (imageSmoothingEnabled nie wycieka)');
}

// ── Pin wersji ──
ok(HTML.includes("const APP_VERSION = 'v1.48.2';"), 'V1: pin APP_VERSION v1.48.2');

console.log('');
console.log(`═══ tier6_ux: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
