// Harness — report_export.js: jednolity raport diagnostyczny (Markdown) — v1.45.0 (Arc 20).
// Zasada: kazda lista diagnostyczna ma eksport (schowek + zapis .md). Powierzchnie:
// dialog walidacji pliku (val-modal), walidacja kierunkow (vd-*, ma wlasne od v1.44.x),
// panel recenzji kalki (dp-*), dialogi podwojnych linii (dlg-suppressors*, od v1.45.2).
// Wspolny builder: buildDiagnosticsReport.
// Uruchamianie z katalogu glownego repo: node tests/report_export.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function extract(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('BRAK KOTWICY: ' + anchor);
  let d = 0; const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('niezbalansowane klamry: ' + anchor);
}

// ═══ T1: piny strukturalne — builder + przyciski + okablowanie ═══
console.log('── T1: piny strukturalne (builder, DOM, wiring) ──');
{
  ok(/function buildDiagnosticsReport\(opts\)/.test(HTML), 'globalny builder buildDiagnosticsReport');
  ok(/function _valReportSections\(valRes, chkRes, suppMissing\)/.test(HTML), 'sekcje raportu walidacji pliku (z podwojnymi liniami)');
  ok(/function _deltaReviewReportText\(\)/.test(HTML), 'raport recenzji kalki (_deltaReviewReportText)');
  ok(/function _copyReportToClipboard\(text\)/.test(HTML), 'wspolny kopiowanie→schowek z toastem');

  // DOM: val-modal
  ok(HTML.includes('id="val-btn-copy"') && HTML.includes('id="val-btn-md"'),
     'val-modal: przyciski Kopiuj raport + Zapisz .md w DOM');
  // DOM: panel recenzji kalki
  ok(HTML.includes('id="dp-copy-report"') && HTML.includes('id="dp-save-md"'),
     'panel kalki: przyciski Kopiuj podsumowanie + Zapisz .md w DOM');

  // Wiring
  ok(HTML.includes("document.getElementById('dp-copy-report').addEventListener('click'"),
     'panel kalki: listener kopiowania');
  ok(HTML.includes("document.getElementById('dp-save-md').addEventListener('click'"),
     'panel kalki: listener zapisu .md');
  ok(HTML.includes("btnCopy.addEventListener('click'") || HTML.includes("val-btn-copy'),"),
     'val-modal: listener kopiowania');

  // DOM: dialogi podwojnych linii (Arc 29 — regula N3 objela te powierzchnie)
  ok(HTML.includes('id="supp-copy"') && HTML.includes('id="supp-md"'),
     'dlg-suppressors: przyciski Kopiuj + MD w DOM');
  ok(HTML.includes('id="suppm-copy"') && HTML.includes('id="suppm-md"'),
     'dlg-suppressors-manual: przyciski Kopiuj + MD w DOM');
  ok(HTML.includes("getElementById('supp-copy')") && HTML.includes("getElementById('suppm-copy')"),
     'dialogi suppressorow: wiring eksportu po id (nie po pozycji w stopce)');

  // Nazwy plikow wg konwencji
  ok(HTML.includes("'raport-diagnostyki-' + _reportMapName() + '-' + _reportTs() + '.md'"),
     'nazwa pliku: raport-diagnostyki-<mapa>-<ts>.md');
  ok(HTML.includes("'raport-recenzji-' + _reportMapName() + '-' + _reportTs() + '.md'"),
     'nazwa pliku: raport-recenzji-<mapa>-<ts>.md');
  ok(HTML.includes("'raport-podwojne-linie-' + _reportMapName() + '-' + _reportTs() + '.md'"),
     'nazwa pliku: raport-podwojne-linie-<mapa>-<ts>.md');
}

// ═══ T1b (A4.1, UX-1): eksport HTML we wszystkich raportach; PNG z walidacji OUT ═══
console.log('── T1b (A4.1, UX-1): eksport HTML wszedzie ──');
{
  // Statyczne obecnosci: 4 nowe przyciski + wspolny builder + PNG usuniete
  ok(HTML.includes('id="vd-html"') && !HTML.includes('id="vd-png"'),
     'A4.1: walidacja kierunkow — vd-html w DOM, vd-png usuniety (UX-1)');
  ok(HTML.includes('id="val-btn-html"') && HTML.includes('id="supp-html"') && HTML.includes('id="suppm-html"'),
     'A4.1: przyciski HTML w val-modal + obu dialogach suppressorow');
  ok(/function _reportHtmlDoc\(opts\)/.test(HTML) && !/function vdDownloadPng\(/.test(HTML),
     'A4.1: wspolny builder _reportHtmlDoc; vdDownloadPng usuniety');
  ok(HTML.includes("getElementById('supp-html')") && HTML.includes("getElementById('suppm-html')")
    && HTML.includes("getElementById('val-btn-html')") && HTML.includes("$('vd-html')"),
     'A4.1: wiring wszystkich 4 przyciskow HTML po id');
  ok(HTML.includes("'.html', 'text/html'") || (HTML.match(/'text\/html'/g) || []).length >= 4,
     'A4.1: eksporty HTML przez saveWithDialog z mime text/html');

  // Behawioralny: _reportHtmlDoc — te same linie co .md, escapowanie dynamicznego tekstu
  // (guard kotwicy: pre-fix buildera nie ma — czysty FAIL zamiast wyjatku ekstrakcji)
  if (!/function _reportHtmlDoc\(opts\)/.test(HTML)) {
    ok(false, 'A4.1: HTML zawiera sekcje/linie raportu (pre-fix: brak _reportHtmlDoc)');
    ok(false, 'A4.1: dynamiczny tekst escapowany (pre-fix: brak _reportHtmlDoc)');
    ok(false, 'A4.1: dokument samodzielny (pre-fix: brak _reportHtmlDoc)');
  } else {
    const code =
      extract(HTML, 'function escHtml(s) {') + '\n' +
      extract(HTML, 'function _reportHtmlDoc(opts) {') + '\n' +
      'return _reportHtmlDoc;';
    const doc = new Function(code)();
    const text = '=== Rozjazdy team_follow (2) ===\n1. #100  Obszar <nazwa> & "cudzyslow"\n   zle: n, e';
    const html = doc({ title: 'Raport testowy', filename: 'm.arkmap', version: 'vX', dateIso: '2026-01-01', text });
    ok(html.includes('Rozjazdy team_follow (2)') && html.includes('#100  Obszar'),
       'A4.1: HTML zawiera sekcje/linie raportu (te same linie co .md)');
    ok(html.includes('&lt;nazwa&gt; &amp; &quot;cudzyslow&quot;') && !html.includes('<nazwa>'),
       'A4.1: dynamiczny tekst escapowany (escHtml — zero miniatur, zero HTML z raportu)');
    ok(html.startsWith('<!DOCTYPE html>') && html.includes('ArkMap Studio'),
       'A4.1: dokument samodzielny (DOCTYPE + brand)');
  }
}

// ═══ T2: buildDiagnosticsReport — struktura md, determinizm, puste sekcje ═══
console.log('── T2: buildDiagnosticsReport (funkcjonalnie) ──');
{
  const code =
    extract(HTML, 'function _reportTs() {') + '\n' +
    extract(HTML, 'function buildDiagnosticsReport(opts) {') + '\n' +
    'return { buildDiagnosticsReport };';
  const api = new Function('APP_VERSION', code)('v1.48.3');

  const opts = {
    title: 'Raport testowy', filename: 'm.arkmap',
    sections: [
      { title: 'Sekcja A', lines: ['linia 1', 'linia 2'] },
      { title: 'Pusta', lines: [] },
    ],
  };
  const r1 = api.buildDiagnosticsReport(opts);
  const r2 = api.buildDiagnosticsReport(opts);
  const strip = s => s.split('\n').filter(l => !l.startsWith('- Data: ')).join('\n');
  ok(strip(r1) === strip(r2), 'deterministyczny poza linia daty ISO');
  ok(r1.split('\n')[0] === '# Raport testowy — ArkMap Studio', 'naglowek H1 z tytulem');
  ok(r1.includes('- Plik: m.arkmap'), 'naglowek: plik');
  ok(r1.includes('- Wersja aplikacji: v1.48.3'), 'naglowek: wersja aplikacji');
  ok(/- Data: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(r1), 'naglowek: data ISO');
  ok(r1.includes('## Sekcja A') && r1.includes('linia 1\nlinia 2'), 'sekcja z liniami');
  ok(r1.includes('## Pusta\n\n(brak)'), 'pusta sekcja → (brak)');
  ok(api.buildDiagnosticsReport({}).includes('# Raport diagnostyczny — ArkMap Studio'),
     'domyslny tytul przy braku opts.title');
}

// ═══ T3: _valReportSections — pelne listy, sortowanie, wszystkie klasy sum ═══
console.log('── T3: _valReportSections (funkcjonalnie) ──');
{
  const code =
    extract(HTML, 'function _suppLine(m) {') + '\n' +
    extract(HTML, 'function _suppSort(missing) {') + '\n' +
    extract(HTML, 'function _valReportSections(valRes, chkRes, suppMissing) {') + '\nreturn { _valReportSections };';
  const api = new Function(code)();

  const valRes = { ok: false,
    errors: [{ path: 'z', msg: '1' }, { path: 'a', msg: '2' }],
    warnings: [{ path: 'w', msg: '3' }] };
  const chkFull = { present: true, ok: false, fileOk: false,
    badAreas: [{ id: 2, name: 'B' }, { id: 1, name: 'A' }],
    badRooms: [{ roomId: 9, areaId: 1, areaName: 'A' }],
    missingRooms: [11, 3, 5], missingAreas: [{ id: 7, name: 'C' }],
    extraRooms: ['4', '2'], extraAreas: ['9', '8'] };

  const secs = api._valReportSections(valRes, chkFull);
  ok(secs.length === 4, '4 sekcje: bledy / ostrzezenia / sumy / podwojne linie');
  ok(secs[0].title === 'Błędy walidacji (2)', 'tytul sekcji bledow z licznikiem');
  ok(secs[0].lines[0] === 'a: 2' && secs[0].lines[1] === 'z: 1', 'bledy sortowane path+msg');
  ok(secs[1].lines.length === 1, 'ostrzezenia przeniesione');
  const cl = secs[2].lines;
  ok(cl[0].includes('NIEZGODNA'), 'suma pliku niezgodna — pierwsza linia');
  ok(cl.filter(l => l.startsWith('Obszar zmieniony')).length === 2, 'badAreas: PELNA lista (bez obciec)');
  ok(cl.some(l => l.startsWith('Pokój zmieniony: 9')), 'badRooms: pelna lista');
  ok(cl.some(l => l === 'Pokoje bez sumy kontrolnej (3): 3, 5, 11'), 'missingRooms sortowane numerycznie');
  ok(cl.some(l => l.startsWith('Obszar bez sumy kontrolnej: C')), 'missingAreas z nazwa');
  ok(cl.some(l => l === 'Sieroty w sumach pokoi (2): 4, 2'), 'extraRooms (kolejnosc z verify)');
  ok(cl.some(l => l === 'Sieroty w sumach obszarów (2): 9, 8'), 'extraAreas (kolejnosc z verify)');

  const rAlg = api._valReportSections(valRes, { present: true, ok: false, algMismatch: 'v3' });
  ok(rAlg[2].lines[0].includes('alg "v3"'), 'algMismatch: glosna linia z alg');
  const rErr = api._valReportSections(valRes, { present: true, ok: false, verifyError: true });
  ok(rErr[2].lines[0].includes('Nie można zweryfikować'), 'verifyError: czytelna linia');
  const rNone = api._valReportSections(valRes, { present: false, ok: true });
  ok(rNone[2].lines[0].includes('Brak sekcji sum'), 'brak sum: informacyjnie');
  const rOk = api._valReportSections({ errors: [], warnings: [] },
    { present: true, ok: true, fileOk: true, badAreas: [], badRooms: [], missingRooms: [], missingAreas: [], extraRooms: [], extraAreas: [] });
  ok(rOk[2].lines[0] === 'Suma kontrolna pliku: zgodna', 'zdrowy plik: zgodna');

  // Sekcja 4: podwojne linie (Arc 29) — pelna lista, sortowanie, pusta = (brak) w builderze
  const suppIn = [
    { roomA: 12, dir: 'e', roomB: 20, oppDir: 'w' },
    { roomA: 3, dir: 'n', roomB: 9, oppDir: 's' },
  ];
  const secs2 = api._valReportSections(valRes, chkFull, suppIn);
  ok(secs2.length === 4, 'sekcja podwojnych linii zawsze obecna (4. z 4)');
  ok(secs2[3].title === 'Podwójne linie (2)', 'tytul sekcji podwojnych z licznikiem');
  ok(secs2[3].lines.length === 2, 'podwojne linie: PELNA lista (bez obciec)');
  ok(secs2[3].lines[0].startsWith('Pokój #3') && secs2[3].lines[1].startsWith('Pokój #12'),
     'podwojne linie sortowane numerycznie po roomA');
  ok(secs2[3].lines[0].includes('(dir=n → #9)') && secs2[3].lines[0].includes('dir=s'),
     'linia podwojnej: dir + pokoj docelowy + kierunek domkniecia');
  const secs3 = api._valReportSections(valRes, chkFull, []);
  ok(secs3[3].title === 'Podwójne linie (0)' && secs3[3].lines.length === 0,
     'brak podwojnych: sekcja obecna z pusta lista (builder wypisze (brak))');
  const secs4 = api._valReportSections(valRes, chkFull);
  ok(secs4[3].title === 'Podwójne linie (0)', 'brak argumentu suppMissing = pusta sekcja (load .dat legacy)');
}

// ═══ T4: _deltaReviewReportText — podsumowanie + per-op klasyfikacja ═══
console.log('── T4: _deltaReviewReportText (funkcjonalnie) ──');
{
  const code =
    extract(HTML, 'function _reportTs() {') + '\n' +
    extract(HTML, 'function buildDiagnosticsReport(opts) {') + '\n' +
    extract(HTML, 'const _DELTA_CLS_BADGE = {') + '\n' +
    extract(HTML, 'function _arkdeltaBaseNote(base) {') + '\n' +
    'let _deltaReview = null;\n' +
    extract(HTML, 'function _deltaReviewReportText() {') + '\n' +
    'return { _deltaReviewReportText, set rv(v) { _deltaReview = v; } };';
  const state = { filename: 'mapa-testowa.arkmap', map: null };
  const api = new Function('APP_VERSION', 'state', code)('v1.48.3', state);

  api.rv = null;
  ok(api._deltaReviewReportText() === '', 'brak otwartej recenzji → pusty tekst (guard)');

  api.rv = {
    delta: { meta: { base: null }, ops: [] },
    items: [
      { seq: 1, label: 'Dodaj pokój', type: 'ADD_ROOM', cls: 'ok', checked: true },
      { seq: 2, label: 'Edytuj pokój 10', type: 'EDIT_ROOM', cls: 'hard', checked: true, note: 'mapa nowsza' },
      { seq: 3, label: 'Usuń pokój 11', type: 'DELETE_ROOM', cls: 'done', checked: false, session: true },
      { seq: 4, label: 'Przesuń pokój 12', type: 'MOVE_ROOM', cls: 'impossible', checked: false, note: 'zajęta komórka' },
    ],
  };
  const t = api._deltaReviewReportText();
  ok(t.includes('# Raport recenzji kalki .arkdelta'), 'naglowek raportu recenzji');
  ok(t.includes('- Plik: mapa-testowa.arkmap'), 'plik biezacej mapy w naglowku');
  ok(t.includes('Operacji w kalce: 4'), 'podsumowanie: liczba opow');
  ok(t.includes('Do naniesienia: 1 · Konflikty: 1 · Zrobione: 1 · Niewykonalne: 1'),
     'podsumowanie: liczniki klas');
  ok(t.includes('[#1] Dodaj pokój — do naniesienia'), 'per-op: klasa ok');
  ok(t.includes('[#2] Edytuj pokój 10 — konflikt — mapa nowsza'), 'per-op: klasa hard + notatka');
  ok(t.includes('[#3] Usuń pokój 11 — już na mapie (naniesione z kalki)'), 'per-op: done sesyjne rozroznione');
  ok(t.includes('[#4] Przesuń pokój 12 — niewykonalne — zajęta komórka'), 'per-op: impossible + powod');
}

// ═══ T5: regla kompletnosci — kazda powierzchnia diagnostyczna ma eksport ═══
console.log('── T5: regla kompletnosci powierzchni ──');
{
  // vd-* (walidacja kierunkow) miala eksport wczesniej — pin, ze nikt go nie usunal
  ok(HTML.includes('id="vd-copy"') || HTML.includes('vdCopyReport') || /vd-copy/.test(HTML),
     'vd-*: eksport raportu kierunkow nadal obecny');
  ok(/vd.*\.md|walidacja-kierunkow/.test(HTML), 'vd-*: zapis .md raportu kierunkow nadal obecny');
  // piec powierzchni z raportem: val-modal, vd-*, dp-*, dlg-suppressors, dlg-suppressors-manual
  ok(HTML.includes('id="val-btn-copy"') && /vd-copy|vdCopyReport/.test(HTML) && HTML.includes('id="dp-copy-report"')
     && HTML.includes('id="supp-copy"') && HTML.includes('id="suppm-copy"'),
     'wszystkie 5 powierzchni diagnostycznych ma eksport do schowka');
}

// ═══ T6: raport HTML kalki z miniaturami przed/po (Arc 31 F5, v1.48.3) ═══
console.log('── T6: raport HTML kalki (struktura + funkcjonalnie) ──');
{
  // — piny strukturalne —
  ok(/function _deltaBuildShadow\(/.test(HTML), 'ekstrakcja cienia: _deltaBuildShadow (rdzen kalki nietkniet — klasyfikacja bez zmian)');
  {
    const cd = extract(HTML, 'function classifyDelta(delta) {');
    ok(cd.includes('_deltaBuildShadow('), 'classifyDelta korzysta z _deltaBuildShadow (wspoldzielony cien)');
  }
  ok(/function _deltaThumbGroups\(/.test(HTML), 'grupowanie miniaturek: _deltaThumbGroups');
  ok(/function _deltaRenderComparison\(/.test(HTML), 'render pary przed/po: _deltaRenderComparison');
  // Plan H (audyt zewnetrzny 2026-08-24, H2): przypisanie duchow grupy WEWNATRZ
  // try — hipotetyczny wyjatek w mk()/_rasterInvalidate() nie zostawia duchow
  // wlaczonych na glownej mapie (restore w finally).
  ok(/const c2 = mk\(\);\n  try \{\n    _deltaGhosts = new Set\(group\.seqs\);/.test(HTML),
     'H2: duchy grupy ustawiane wewnatrz try (restore w finally gwarantowany)');
  ok(/function _deltaHtmlDoc\(/.test(HTML), 'czysty builder dokumentu: _deltaHtmlDoc');
  ok(/function _deltaReviewReportHtml\(/.test(HTML), 'wejscie raportu HTML: _deltaReviewReportHtml');
  ok(/const DELTA_THUMB_CAP = 60;/.test(HTML), 'cap miniaturek 60 (reszta tekstowo)');
  ok(HTML.includes('.slice(0, DELTA_THUMB_CAP)'), 'cap stosowany przy grupach (slice)');
  ok(HTML.includes('id="dp-save-html"'), 'panel kalki: przycisk Zapisz raport .html w DOM');
  ok(HTML.includes('⬇ Zapisz raport .html'), 'etykieta dluga — spojna z siostrzanym „Zapisz raport .md" (pomiar: koszt 0)');
  ok(HTML.includes("document.getElementById('dp-save-html').addEventListener('click'"),
     'panel kalki: listener zapisu .html');
  ok(HTML.includes("'raport-recenzji-' + _reportMapName() + '-' + _reportTs() + '.html'"),
     'nazwa pliku: raport-recenzji-<mapa>-<ts>.html');
  ok(HTML.includes("'html':     { 'text/html': ['.html'] }"), 'saveWithDialog: acceptMap dla .html');

  // — funkcjonalnie: czysty builder _deltaHtmlDoc —
  const capConst = HTML.match(/const DELTA_THUMB_CAP = \d+;/);
  ok(capConst && capConst[0] === 'const DELTA_THUMB_CAP = 60;', 'stala cap wyekstrahowana z HTML (60)');
  const code =
    extract(HTML, 'function escHtml(') + '\n' +
    capConst[0] + '\n' +
    extract(HTML, 'function _deltaHtmlDoc(opts) {') + '\n' +
    'return { _deltaHtmlDoc };';
  const api = new Function(code)();

  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const opts = {
    title: 'Raport recenzji kalki .arkdelta', filename: 'm.arkmap',
    version: 'v1.48.3', dateIso: '2026-08-24T12:00:00.000Z',
    summaryLines: ['Operacji w kalce: 2', 'Do naniesienia: 1'],
    opLines: ['- [#1] Dodaj pokoj — do naniesienia', '- [#2] Usun pokoj — konflikt'],
    thumbs: [
      { label: 'Obszar 5, z=0 — opy #1', before: PNG, after: PNG + 'AA' },
      { label: 'zepsuty src', before: 'javascript:alert(1)', after: PNG },
    ],
    thumbTruncated: 3,
  };
  const h1 = api._deltaHtmlDoc(opts);
  const h2 = api._deltaHtmlDoc(opts);
  ok(h1 === h2, 'determinizm bajtow dla tych samych danych wejsciowych');
  ok(h1.startsWith('<!DOCTYPE html>'), 'dokument zaczyna sie od DOCTYPE');
  ok(h1.includes('<html lang="pl">') && h1.includes('<meta charset="utf-8">'), 'lang=pl + charset utf-8 (file:// bez serwera)');
  ok(h1.includes('Raport recenzji kalki .arkdelta — ArkMap Studio'), 'naglowek 1:1 z .md (tytul + ArkMap Studio)');
  ok(h1.includes('Wersja aplikacji: v1.48.3') && h1.includes('Data: 2026-08-24T12:00:00.000Z'),
     'naglowek 1:1 z .md (wersja + data ISO)');
  ok(h1.includes('Operacji w kalce: 2') && h1.includes('- [#1] Dodaj pokoj — do naniesienia'),
     'tresc 1:1 z .md (podsumowanie + linie opow)');
  ok(h1.includes('<img src="data:image/png;base64,'), 'miniatura osadzona jako PNG dataURL');
  const imgCount = (h1.match(/<img src=/g) || []).length;
  ok(imgCount === 3, 'para przed/po = 2 img; miniatura z niebezpiecznym src odrzucona (' + imgCount + ')');
  ok(!h1.includes('javascript:alert(1)'), 'src spoza data:image/png;base64 nigdy nie trafia do dokumentu');
  ok(h1.includes('3') && /bez miniatur|tekstowo/.test(h1), 'nota o grupach ponad cap (reszta tekstowo)');

  const evil = Object.assign({}, opts, {
    summaryLines: ['<img src=x onerror=alert(1)>'],
    opLines: ['- [#9] <script>alert(2)</scr' + 'ipt>'],
    thumbs: [{ label: '<b>etykieta</b>', before: PNG, after: PNG }],
    thumbTruncated: 0,
  });
  const he = api._deltaHtmlDoc(evil);
  ok(!he.includes('<img src=x onerror=alert(1)>') && he.includes('&lt;img src=x onerror=alert(1)&gt;'),
     'escapowanie linii podsumowania (jak w raportach md — escHtml)');
  ok(!he.includes('<script>alert(2)</' + 'script>'), 'escapowanie linii opow (brak surowego script)');
  ok(!he.includes('<b>etykieta</b>') && he.includes('&lt;b&gt;etykieta&lt;/b&gt;'), 'escapowanie etykiety miniatury');

  ok(api._deltaHtmlDoc({ title: 't', filename: 'f', version: 'v', dateIso: 'd', summaryLines: [], opLines: [], thumbs: [], thumbTruncated: 0 })
     .includes('(brak)'), 'puste sekcje → (brak) — paritet z buildDiagnosticsReport');
}

// ═══ A4.6 (UX-6): raport HTML recenzji — async z yieldami rAF, output 1:1 ═══
console.log('── A4.6 (UX-6): async eksport HTML recenzji ──');
const ASYNC_PINS_RE = [];
{
  // — statyczne —
  const hasAsync = /async function _deltaReviewReportHtml\(onProgress\) \{/.test(HTML);
  ok(hasAsync,
    'A4.6 (UX-6): _deltaReviewReportHtml async z callbackiem postepu (pre-fix: sync w handlerze kliku)');
  const fnSrc = hasAsync ? extract(HTML, 'async function _deltaReviewReportHtml(onProgress) {')
    : (HTML.includes('function _deltaReviewReportHtml() {') ? extract(HTML, 'function _deltaReviewReportHtml() {') : '');
  ok(/await new Promise\(r => requestAnimationFrame\(r\)\)/.test(fnSrc),
    'A4.6 (UX-6): yield rAF per grupa miniaturek (pre-fix: 60 grup synchronicznie = zwiecha + wypalenie transient activation)');
  ok(fnSrc.includes('scheduleDraw();'),
    'A4.6: call-site scheduleDraw zachowany w async wersji (raf_shim B1 bez zmian liczb)');
  ok(HTML.includes('Liczenie miniaturek… ') && /btn\.disabled = true/.test(HTML),
    'A4.6 (UX-6): handler dp-save-html — disable przycisku + label postepu X/Y (pre-fix: brak)');
}
{
  // — funkcjonalnie: golden tresci + licznik yieldy (guard kotwicy: czysty FAIL pre-fix) —
  const hasAsync = /async function _deltaReviewReportHtml\(onProgress\) \{/.test(HTML);
  if (!hasAsync) {
    ok(false, 'A4.6 (UX-6): output bajtowo 1:1 ze sync semantyka (pre-fix: brak async wersji)');
    ok(false, 'A4.6 (UX-6): licznik yieldy rAF >= 1 przy >1 grupie (pre-fix: brak yieldow)');
  } else {
    const capConst = HTML.match(/const DELTA_THUMB_CAP = \d+;/)[0];
    const code =
      extract(HTML, 'const _DELTA_CLS_BADGE = {') + '\n'
      + capConst + '\n'
      + extract(HTML, 'function escHtml(') + '\n'
      + extract(HTML, 'function _deltaHtmlDoc(opts) {') + '\n'
      + extract(HTML, 'function _arkdeltaBaseNote(base) {') + '\n'
      + 'let _deltaReview = null;\n'
      + extract(HTML, 'async function _deltaReviewReportHtml(onProgress) {') + '\n'
      + 'return { report: _deltaReviewReportHtml, doc: _deltaHtmlDoc, set rv(v) { _deltaReview = v; } };';
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const groupsStub = [
      { areaId: 5, z: 0, seqs: [1, 2] },
      { areaId: 5, z: 1, seqs: [3] },
    ];
    const state = { filename: 'mapa-testowa.arkmap', areas: new Map([[5, { name: 'Obszar 5' }]]) };
    let yields = 0;
    class DateStub { toISOString() { return '2026-08-25T00:00:00.000Z'; } }
    const api = new Function('APP_VERSION', 'state', '_deltaThumbGroups', '_deltaRenderComparison',
      'scheduleDraw', 'requestAnimationFrame', 'Date', code)
      ('vTEST', state, () => groupsStub, () => ({ before: PNG, after: PNG }),
        () => {}, (cb) => { yields++; setTimeout(() => cb(0), 0); }, DateStub);
    api.rv = {
      delta: { meta: { base: null }, ops: [] },
      items: [
        { seq: 1, label: 'Dodaj pokój', type: 'ADD_ROOM', cls: 'ok', checked: true },
        { seq: 2, label: 'Edytuj pokój 10', type: 'EDIT_ROOM', cls: 'hard', checked: true, note: 'mapa nowsza' },
        { seq: 3, label: 'Usuń pokój 11', type: 'DELETE_ROOM', cls: 'done', checked: false, session: true },
        { seq: 4, label: 'Przesuń pokój 12', type: 'MOVE_ROOM', cls: 'impossible', checked: false, note: 'zajęta komórka' },
      ],
    };
    // Golden: sync referencja semantyki pre-fix na tym samym ekstrahowanym _deltaHtmlDoc
    const refLines = [
      '- [#1] Dodaj pokój — do naniesienia',
      '- [#2] Edytuj pokój 10 — konflikt — mapa nowsza',
      '- [#3] Usuń pokój 11 — już na mapie (naniesione z kalki)',
      '- [#4] Przesuń pokój 12 — niewykonalne — zajęta komórka',
    ];
    const refThumbs = groupsStub.map(g => ({
      label: 'Obszar 5, z=' + g.z + ' — opy ' + g.seqs.map(s => '#' + s).join(', '),
      before: PNG, after: PNG,
    }));
    const expected = api.doc({
      title: 'Raport recenzji kalki .arkdelta',
      filename: 'mapa-testowa.arkmap',
      version: 'vTEST',
      dateIso: '2026-08-25T00:00:00.000Z',
      summaryLines: [
        'Operacji w kalce: 4',
        'Do naniesienia: 1 · Konflikty: 1 · Zrobione: 1 · Niewykonalne: 1',
        'Baza kalki: Kalka bez informacji o wersji mapy, na której ją zapisano.',
      ],
      opLines: refLines,
      thumbs: refThumbs,
      thumbTruncated: 0,
    });
    ASYNC_PINS_RE.push((async () => {
      const progress = [];
      const out = await api.report((d, t) => progress.push([d, t]));
      ok(out === expected,
        'A4.6 (UX-6): output bajtowo identyczny ze sync golden (ta sama zawartosc, inna mechanika)');
      ok(yields >= 1,
        'A4.6 (UX-6): licznik yieldy rAF >= 1 przy 2 grupach (pre-fix: 0 — petla synchroniczna)');
      ok(JSON.stringify(progress) === JSON.stringify([[1, 2], [2, 2]]),
        'A4.6 (UX-6): callback postepu X/Y per grupa (1/2, 2/2)');
      api.rv = null;
      ok(await api.report() === '', 'A4.6: brak otwartej recenzji -> pusty string (guard, regresja)');
    })());
  }
}

Promise.all(ASYNC_PINS_RE).then(() => {
  console.log('report_export: ' + pass + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
});
