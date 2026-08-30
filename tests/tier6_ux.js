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
  ok(wrap.includes('state.pristineArkmap = state._loadCheckpointText || _serializeMap();'),
    'B2: wrapper applyMap ustawia bufor przy kazdym wczytaniu (P3a: tekst pliku .arkmap, fallback serialize dla .dat/online)');
  const la = extract(HTML, 'async function loadArkmap(text, filename) {');
  ok(la.includes('state._loadCheckpointText = text;')
    && la.indexOf('state._loadCheckpointText = text;') < la.indexOf('applyMap(map);')
    && la.indexOf('state._loadCheckpointText = text;') > la.indexOf('showValDialog'),
    'B2a: loadArkmap podklada tekst pliku jako checkpoint tuz przed applyMap, PO bramkach walidacji (anulowanie dialogu = brak stash)');
  ok(wrap.includes('state._loadCheckpointText = null;'),
    'B2b: wrapper konsumuje stash i czysci (brak zalegajacego checkpointu dla kolejnych loadow)');
  ok(count('_loadCheckpointText = text;') === 1,
    'B2c: dokladnie jedna sciezka podlozenia checkpointu (tylko loadArkmap) — jest ' + count('_loadCheckpointText = text;'));

  const save = extract(HTML, 'async function _performArkmapSave(onSaved) {');
  // F2.19 (Arc 31, v1.48.3): serializacja na klonie — _serializeMapForSave zamiast _serializeMap.
  // F5 (v1.52.0): wariant z podpisem — _serializeMapForSaveSigned (async, D8).
  ok((save.split('const text = await _serializeMapForSaveSigned()').length - 1) === 1
    && !save.includes('() => _serializeMapForSave') && save.includes('writable.write(text)'),
    'B3: _performArkmapSave serializuje raz (const text, F2.19: na klonie; F5: podpis D8), zero leniwych lambd');
  ok((save.split('state.pristineArkmap = text;').length - 1) === 4,
    'B4: bufor ustawiany przy 4/4 punktow sukcesu zapisu — jest '
    + (save.split('state.pristineArkmap = text;').length - 1));
  // F5 (v1.52.0): rev MUSI byc zrzucony przed awaitem serializacji — inaczej edycja
  // w oknie podpisu (async) wymyka sie bramce T6-F2 i dirty zostaje skasowane mimo
  // ze plik jej nie zawiera (okno utraty danych, flake E14.race).
  ok(save.indexOf('const saveRev = state.editRev || 0;') !== -1
    && save.indexOf('const saveRev = state.editRev || 0;') < save.indexOf('await _serializeMapForSaveSigned()'),
    'B4a: _performArkmapSave — saveRev PRZED await serializacji (T6-F2 szczelne przy podpisie D8)');

  const saveAs = extract(HTML, 'async function _performArkmapSaveAs() {');
  // F2.19 (Arc 31, v1.48.3): serializacja na klonie — _serializeMapForSave zamiast _serializeMap.
  // F5 (v1.52.0): wariant z podpisem — _serializeMapForSaveSigned (async, D8).
  ok((saveAs.split('const text = await _serializeMapForSaveSigned()').length - 1) === 1
    && !saveAs.includes('() => _serializeMapForSave'),
    'B5: _performArkmapSaveAs serializuje raz (luka z audytu planu zamknieta, F2.19: na klonie; F5: podpis D8)');
  ok((saveAs.split('state.pristineArkmap = text;').length - 1) === 2,
    'B6: bufor przy 2/2 punktow sukcesu Zapisz-kopie — jest '
    + (saveAs.split('state.pristineArkmap = text;').length - 1));
  ok(saveAs.indexOf('const saveRev = state.editRev || 0;') !== -1
    && saveAs.indexOf('const saveRev = state.editRev || 0;') < saveAs.indexOf('await _serializeMapForSaveSigned()'),
    'B6a: _performArkmapSaveAs — saveRev PRZED await serializacji (jak B4a)');

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
  // Arc 32 (UX-1): 600 -> 640 pod 5 przyciskow (+Zapisz .html: 594 > 564 content).
  ok(/#val-modal\s*\{[^}]*?width:\s*640px/.test(HTML),
    'B15: #val-modal width:640px (5 przyciskow stopki, +HTML UX-1 ~594px + padding 36px; 520px = przelew)');
  for (const sel of ['#val-modal-footer', '#ol-confirm-footer', '#wp-import-footer', '.edlg-ftr']) {
    const esc = sel.replace(/[.#-]/g, '\\$&');
    const m = HTML.match(new RegExp(esc + '\\s*\\{[^}]*\\}'));
    ok(!!m && /flex-wrap\s*:\s*wrap/.test(m[0]),
      sel + ': flex-wrap:wrap (siatka — przelew lamie sie do wiersza zamiast obcinac)');
  }

  // Arc 29: dlg-suppressors poszerzony pod 5 przyciskow stopki (eksport raportu, regula N3).
  // Pomiar F0: ~604px content przy najdluzszych etykietach sciezki .dat (500px = przelew
  // stopki nowrap). Repro empiryczne: E22.supp-geom. max-width:90vw klasy chroni mobile.
  // Arc 32 (UX-1): 660 -> 720 pod 6 przyciskow (+HTML: 604 + 73 + gap 8 = 685 > 628 content).
  {
    const box = HTML.slice(HTML.indexOf('id="dlg-suppressors"'), HTML.indexOf('id="dlg-suppressors"') + 700);
    ok(box.includes('class="dlg-box wide" style="width:720px"'),
      'B16: dlg-suppressors width:720px (6 przyciskow stopki, +HTML UX-1; 500px = przelew)');
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

  // Arc 33 (v1.49.3): lite linie wyjsc w roomsOnly — obserwacja uzytkownika
  // (2026-08-25): przy fit mapa to same prostokaty, zero topologii. roomsOnly
  // rysuje lekkie linie miedzy srodkami pokoi (jeden batch path = 1x stroke,
  // bez strzalek/daszy/etykiet/stubow/custom lines; dedup par dwukierunkowych).
  // Pokoje rysowane PO wyjsciach, wiec konce linii chowaja sie pod kwadratami.
  // Repro empiryczne: E23.lod.lines.
  ok(/function drawExitsLite\(/.test(HTML),
    'B22a: drawExitsLite zdefiniowane (lite linie wyjsc dla roomsOnly)');
  ok(/if \(_lodFull\) drawExits\(vis, rs\); else if \(_lodMode === 'roomsOnly'\) drawExitsLite\(vis, rs\);/.test(HTML),
    'B22b: draw() wywoluje drawExitsLite w roomsOnly (full zachowuje drawExits)');

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

  // ── F5 (v1.48.3): raport HTML kalki z miniaturami przed/po ──
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
ok(HTML.includes("const APP_VERSION = 'v1.52.3';"), 'V1: pin APP_VERSION v1.52.3');

// ═══ A3.10 (DI-7): touchstart — reset flag na starcie KAZDEGO gestu ═══
console.log('— A3.10 (DI-7): touchstart — reset na starcie kazdego gestu —');
{
  const src = blockSlice("cv.addEventListener('touchstart'", "cv.addEventListener('touchmove'");
  const mk = () => {
    const cv = { addEventListener(t, fn) { this.__h = fn; } };
    const state = { editMode: false, dragging: false, editDraggingRoom: false,
      editDragCurrentX: 0, editDragCurrentY: 0, selected: null, roomById: {}, roomsZ: [],
      canvasMode: 'normal', _paintHover: null };
    let draws = 0;
    const api = new Function('cv', 'state', 'scheduleDraw', 'document',
      '_paintStrokeRevert', 'screenToMap', 'evX', 'evY', '_paintApplyAtScreen',
      'let _touches = {}, _gestureMulti = false, _pinchToolCancelled = false, _lastPinchDist = null, _paintStroke = null;\n'
      + src
      + '\n;return { fire: (e) => cv.__h(e),'
      + ' snap: () => ({ n: Object.keys(_touches).length, multi: _gestureMulti, pinch: _pinchToolCancelled }) };')
      (cv, state, () => { draws++; }, { getElementById: () => null },
       () => {}, () => [0, 0], (t) => t.clientX, (t) => t.clientY, () => {});
    return { fire: api.fire, snap: api.snap, draws: () => draws, state };
  };
  const t = (id, x) => ({ identifier: id, clientX: x, clientY: 0 });
  const ev = (touches, changed) => ({ preventDefault() {}, touches, changedTouches: changed || touches });

  // Gest 1: pinch 2-palcowy — anuluje narzedzie (draws=1); flaga/rejestr zostaja po touchend
  // (touchend w aplikacji nie przycina _touches ani _pinchToolCancelled — symulacja: bez fire)
  const g = mk();
  g.fire(ev([t(1, 0), t(2, 10)]));
  ok(g.snap().multi === true && g.snap().pinch === true && g.draws() === 1,
    'A3.10: gest 1 (pinch) — multi + anulowanie narzedzia (setup)');
  // Gest 2 startuje od 2 palcow: reset flag + swiezy rejestr + PONOWNE anulowanie narzedzia
  g.fire(ev([t(3, 0), t(4, 10)]));
  ok(g.snap().n === 2 && g.snap().multi === true && g.draws() === 2,
    'A3.10 (DI-7): gest 2-palcowy po poprzednim — flagi zresetowane, rejestr swiezy, pinch znowu anuluje'
    + ' (pre-fix: stale flagi, rejestr 4 wpisy, brak anulowania)');
  // Dokladanie palca W TRAKCIE gestu (changed < touches): bez resetu rejestru
  const g2 = mk();
  g2.fire(ev([t(5, 0)]));
  g2.fire(ev([t(5, 0), t(6, 10)], [t(6, 10)]));
  ok(g2.snap().n === 2 && g2.snap().multi === true,
    'A3.10 (DI-7): dokladanie palca w trakcie gestu — bez resetu rejestru (multi-flag zachowana)');
}

// ── B23: domyslna skala interfejsu ──────────────────────────────────────────
// Arc 34 (v1.49.4, obs 7): 105%. Arc 35 (v1.49.5) EWALUACJA 105->100:
// font 13px + stack Consolas/Menlo/DejaVu/Liberation/Courier daje czytelnosc
// bez zoomu; zoom=1 znosi rozjazdy gBCR/computed przy eksporcie i dragach.
console.log('— B23: domyslna skala UI 100% (Arc 35; Arc 34: 105%) —');
{
  ok(HTML.includes('--ui-scale: 1;'),
    'B23a: :root --ui-scale = 1 (Arc 35; Arc 34: 1.05)');
  ok(/id="ui-scale-slider"[^>]*value="100"/.test(HTML) && HTML.includes('>100%</span>'),
    'B23b: suwak startuje na 100 i etykieta 100% (Arc 35; Arc 34: 105)');
  ok(!HTML.includes('saved.uiScale !== 100')
    && HTML.includes("typeof saved.uiScale === 'number' && isFinite(saved.uiScale)"),
    'B23c: loadSettings stosuje zapisana wartosc ZAWSZE (pre-fix: warunek !== 100 zjadalby swiadome 100)');
  ok(HTML.includes('parseInt(_uiScaleSlider.value) || 100'),
    'B23d: saveSettings fallback 100 (Arc 35; Arc 34: 105)');
  ok(HTML.includes('applyUiScale(100)'),
    'B23e: resetAllDefaults wraca do 100 (Arc 35; Arc 34: 105)');
}

// ── B24 (Arc 35, v1.49.5): stack fontu mono + baza 13px ─────────────────────
// Strażnik miny fc-match: 'Cascadia Code' rozwiazuje sie w CI do Noto Sans
// (PROPORCJONALNY) — zlamalby mono-layout. Stack musi zaczynac sie od Consolas
// (CI: Noto Sans Mono, mono 0,6em — najszerszy, wiec overflow lapany w CI
// oznacza luz u usera na wezszym Consolas 0,55em).
console.log('— B24 (Arc 35): stack fontu mono + baza 13px —');
{
  ok(HTML.includes("--font:    Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', 'Courier New', monospace;"),
    'B24a: --font = pelny stack mono zaczynajacy sie od Consolas');
  ok(!HTML.includes('Cascadia'),
    'B24b: ZERO Cascadia w calym pliku (mina fc-match: CI -> Noto Sans proporcjonalny)');
  ok(HTML.includes('font: 13px/1.45 var(--font);'),
    'B24c: baza 13px/1.45 (pre-fix: 12px/1.4)');
  ok(!HTML.includes("font-family: 'Courier New'"),
    'B24d: zero hardkodow CSS na Courier New — wszystko przez var(--font)');
  const n = HTML.split('Consolas,Menlo,"DejaVu Sans Mono","Liberation Mono","Courier New",monospace').length - 1;
  ok(n === 7, 'B24e: stack literalnie we wszystkich 7 miejscach renderera canvas (jest: ' + n + ')');
}

// ── B27 (Arc 37, F-RENDER-2): niezmiennik resetu _lodMode w draw() ──────────
// Reset `_lodMode = 'full'` jest NOSNY: badge chowa updateStatus() na bazie _lodMode,
// wiec reset musi stac PRZED wczesnymi returnami draw() (pusta mapa = _lodMode 'full').
// Przesuniecie resetu za returny wprowadziloby defekt (stary badge na pustej mapie).
{
  const d0 = HTML.indexOf('function draw() {');
  const d1 = HTML.indexOf('\nfunction ', d0 + 10);
  const drawSrc = HTML.slice(d0, d1);
  const iReset = drawSrc.indexOf("_lodMode = 'full';");
  const iReturn = drawSrc.indexOf('return;');
  ok(iReset > 0 && iReturn > 0 && iReset < iReturn,
    'B27: reset _lodMode w draw() PRZED pierwszym return (niezmiennik F-RENDER-2)');
  ok(drawSrc.includes('reset przy wczesnych returnach'),
    'B27b: komentarz dokumentujacy nosnosc resetu obecny');
}

// ── B27c/d (Arc 37, PRACA 14): tooltip badge LOD — krotki, zlamany wierszami ──
// Natywny title (~340 znakow) ucinal sie na Linux Chrome; zatwierdzona wersja
// ma ~150 znakow i jawne zlamania &#10; (nowe wiersze w native tooltip).
{
  const m = HTML.match(/<span id="msb-lod"[^>]*\stitle="([^"]*)"/);
  ok(!!m, 'B27c: badge #msb-lod ma atrybut title');
  const t = m ? m[1] : '';
  ok(t.includes('&#10;'), 'B27c: title LOD zlamany wierszami (&#10;)');
  ok(t.length > 0 && t.length < 200, 'B27d: title LOD krotki (< 200 znakow, jest ' + t.length + ')');
}

console.log('');
console.log(`═══ tier6_ux: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
