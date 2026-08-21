// Harness — sync mapy online: tools/dat2arkmap.mjs na przypiętym fixture 0.205.0.
// Pokrywa: CLI, konwersję, złote liczby fixture, wtrysk version/revision,
// zachowanie user_data upstream (lustro), determinizm, walidację fail-closed.
// Uruchamianie z katalogu głównego repo. Wymaga fixture (tests/fetch-fixture.sh).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const TOOL = path.join(ROOT, 'tools', 'dat2arkmap.mjs');

const FIX = path.join(ROOT, 'map_master3.dat');
if (!fs.existsSync(FIX)) {
  console.error('BRAK FIXTURE: map_master3.dat — pobierz: bash tests/fetch-fixture.sh');
  process.exit(2);
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── validate/verifyChecksums z aplikacji (ekstrakcja verbatim) ──────────────
function block(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica: ' + a);
  return HTML.slice(i, j);
}
const apiCode =
  block('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  block('// ── validate.js ──', '// ── checksum.js ──') + '\n' +
  block('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  block('function stableStringify(val, indent, _lvl) {', 'function saveArkmapAs()') + '\n' +
  'return { validate, verifyChecksums };';
const api = new Function('state', apiCode)({ map: null });

// ── Pomocnicze ──────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sync_map-'));
function runTool(args) {
  return spawnSync('node', [TOOL, ...args], { encoding: 'utf8' });
}
const TEST_SHA = '0123456789abcdef0123456789abcdef01234567';

// ── CLI: błędne użycie ──────────────────────────────────────────────────────
console.log('— CLI —');
{
  const r = runTool([]);
  ok(r.status === 2, 'brak argumentów → kod 2 (usage)');
  const r2 = runTool([path.join(TMP, 'brak.dat'), path.join(TMP, 'x.arkmap')]);
  ok(r2.status === 1, 'nieistniejące wejście → kod 1');
  ok(!fs.existsSync(path.join(TMP, 'x.arkmap')), 'nieistniejące wejście → brak pliku wyjściowego');
}
{
  const garbage = path.join(TMP, 'garbage.dat');
  fs.writeFileSync(garbage, Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37 + 11) & 0xff)));
  const out = path.join(TMP, 'garbage.arkmap');
  const r = runTool([garbage, out]);
  ok(r.status === 1, 'śmieciowe wejście → kod 1 (fail-closed)');
  ok(!fs.existsSync(out), 'śmieciowe wejście → brak pliku wyjściowego');
}

// ── Konwersja fixture ───────────────────────────────────────────────────────
console.log('— fixture 0.205.0 —');
ok(fs.statSync(FIX).size === 7847878, 'fixture przypięty (7 847 878 B)');
const OUT1 = path.join(TMP, 'out1.arkmap');
const r1 = runTool([FIX, OUT1, '--version', '0.205.0', '--revision', TEST_SHA]);
ok(r1.status === 0, 'konwersja fixture → kod 0' + (r1.status !== 0 ? ' [stderr: ' + r1.stderr.slice(0, 200) + ']' : ''));
ok(fs.existsSync(OUT1), 'plik wyjściowy istnieje');
const map = JSON.parse(fs.readFileSync(OUT1, 'utf8'));

let rooms = 0, exits = 0, special = 0, cl = 0, sup = 0;
for (const ar of map.areas) for (const r of ar.rooms) {
  rooms++;
  exits += Object.keys(r.exits ?? {}).length;
  special += Object.keys(r.special_exits ?? {}).length;
  for (const v of Object.values(r.custom_lines ?? {})) {
    cl++;
    if (Array.isArray(v.points) && v.points.length === 0) sup++;
  }
}
ok(map.areas.length === 60, 'złota liczba obszarów (60)');
ok(rooms === 26988, 'złota liczba pokoi (26 988)');
ok(exits === 92141, 'złota liczba wyjść (92 141)');
ok(special === 4279, 'złota liczba special_exits (4 279)');
ok(cl === 2779, 'złota liczba custom lines (2 779)');
ok(sup === 108, 'złota liczba supresorów (108)');

// ── Wtrysk i lustro ─────────────────────────────────────────────────────────
console.log('— wtrysk / lustro —');
const ud = map.meta.user_data ?? {};
ok(ud.version === '0.205.0', 'wtrysk --version → meta.user_data.version');
ok(ud.revision === TEST_SHA, 'wtrysk --revision → meta.user_data.revision');
ok(ud.map_sync_version === '430', 'user_data upstream zachowane (map_sync_version=430)');
ok(typeof ud['system.fallback_mapSymbolFont'] === 'string', 'user_data upstream zachowane (system.*)');
{
  const OUT3 = path.join(TMP, 'out3.arkmap');
  const r3 = runTool([FIX, OUT3]);
  ok(r3.status === 0, 'konwersja bez flag → kod 0');
  const ud3 = JSON.parse(fs.readFileSync(OUT3, 'utf8')).meta.user_data ?? {};
  ok(ud3.revision === '5ed22affd9f1f27886199437c20d527971e9af53', 'bez flag: oryginalny revision upstream nietknięty (lustro)');
}

// ── Walidacja i checksumy wyjścia ───────────────────────────────────────────
console.log('— walidacja wyjścia —');
const v = api.validate(map);
ok(v.ok && v.errors.length === 0, 'validate(wyjście): 0 błędów');
ok(v.warnings.length === 0, 'validate(wyjście): 0 ostrzeżeń');
const vc = api.verifyChecksums(map);
ok(vc.present && vc.ok && vc.fileOk, 'verifyChecksums(wyjście): wszystkie zgodne');

// ── Determinizm ─────────────────────────────────────────────────────────────
console.log('— determinizm —');
const OUT2 = path.join(TMP, 'out2.arkmap');
const r2 = runTool([FIX, OUT2, '--version', '0.205.0', '--revision', TEST_SHA]);
ok(r2.status === 0, 'druga konwersja → kod 0');
ok(fs.readFileSync(OUT1).equals(fs.readFileSync(OUT2)), 'dwa przebiegi = bajtowo identyczne wyjście');

// ── Hardening timeoutów (v1.5.36) — asercje strukturalne ───────────────────
console.log('— timeouty (struktura) —');
{
  const WF = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'sync-map.yml'), 'utf8');
  ok(WF.includes('--connect-timeout 30 --max-time 180'), 'workflow: curl z --connect-timeout/--max-time');
  ok((WF.match(/timeout 90 git ls-remote/g) || []).length === 1, 'workflow: timeout 90 na ls-remote (deref tagu)');
  ok(WF.includes('timeout 90 git fetch'), 'workflow: timeout na fetch gałęzi mapa');
  ok(WF.includes('timeout 120 git push'), 'workflow: timeout na force-push');
  ok(WF.includes('timeout-minutes: 10'), 'workflow: siatka job-level 10 min');
  // Arc 16: self-check opublikowanego .arkmap wlasnym verifierem (lustro z sumami v1
  // straszylo userow falszywym „plik uszkodzony" — nigdy wiecej)
  ok(WF.includes('Self-check .arkmap wlasnym verifierem (fail-closed)'), 'workflow: krok self-check obecny');
  ok(WF.indexOf('Self-check .arkmap wlasnym verifierem') > WF.indexOf('Konwersja do .arkmap')
     && WF.indexOf('Self-check .arkmap wlasnym verifierem') < WF.indexOf('- name: index.json'),
     'workflow: self-check PO konwersji, PRZED index.json');
  ok(WF.includes('_crcAreaV1') && WF.includes('verifyChecksums'), 'workflow: self-check ekstrahuje verifier + formuly v1');
  const a = HTML.indexOf('// ─── ONLINE LOAD'), b = HTML.indexOf('// ─── WAYPOINT PLANNER');
  const OL = HTML.slice(a, b);
  ok((OL.match(/new AbortController\(\)/g) || []).length === 2, 'UI: AbortController ×2 (index.json + pliki)');
  ok(OL.includes('ctrl.abort(), 30000'), 'UI: timeout 30 s na index.json');
  ok(OL.includes('ctrl.abort(), 180000'), 'UI: timeout 180 s na pobieranie plików');
  ok((OL.match(/finally \{ clearTimeout\(timer\);/g) || []).length === 2, 'UI: clearTimeout w finally ×2 (bez wycieku timerów; olFetchFile dodatkowo releaseLock — Arc 9)');
  ok((OL.match(/e\.name === 'AbortError'/g) || []).length === 4, 'UI: AbortError → 3 czytelne komunikaty + rethrow w resolve SHA');
}

// ── Model Delwinga: mirror assetu release, wersja z tagu (struktura) ───────
console.log('— model Delwinga (struktura) —');
{
  const WF = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'sync-map.yml'), 'utf8');
  ok(WF.includes('api.github.com/repos/Delwing/arkadia-mapa/releases/latest'),
    'brama: gate na releases/latest (źródło prawdy o wersji = tag)');
  ok(WF.includes('releases/download/') && WF.includes('steps.gate.outputs.tag'),
    'pobranie: asset release przypięty do tagu (nie /latest/download — brak wyścigu)');
  ok(!WF.includes('raw.githubusercontent.com/Delwing/arkadia-mapa'),
    'pobranie: surowy master NIE jest źródłem (stempel w masterze bywa stary)');
  ok(WF.includes('stempel w pliku') && WF.includes('!= tag release'),
    'weryfikacja: stempel wersji w .dat == tag (fail-closed)');
  ok(WF.includes('regresja wersji upstream') && WF.includes('sort -V'),
    'guard: regresja wersji (tag starszy niż publikowany) → fail-closed');
  ok(WF.includes('brak releases/latest upstream') && WF.includes('brak assetu map_master3.dat'),
    'fail-closed: brak release / brak assetu = jawny błąd, zero publikacji');
  ok(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*force:/.test(WF) && WF.includes('type: boolean'),
    'workflow_dispatch: input force (boolean) — ręczna przebudowa mirrora');
  ok(WF.includes('if (!idx.version || !idx.revision)'),
    'index.json: wersja/revision wymagane (nigdy null) — fail-closed');
  ok(!WF.includes('process.argv[1] || null'),
    'index.json: brak fallbacku version:null (to on ukrywał wersję w okienku online)');
  ok(WF.includes('refs/tags/$TAG') && WF.includes('refs/tags/$TAG^{}'),
    'deref tagu: ls-remote z ^{} (annotated tag → commit, lightweight → commit)');
}

// ── v1.5.37: pinning SHA akcji + timeouty transports + TOCTOU w UI ──────────
console.log('— v1.5.37: pinning / transports / TOCTOU (struktura) —');
{
  const wfs = ['sync-map.yml', 'sync-transports.yml', 'keepalive.yml', 'ci-tests.yml']
    .map(f => fs.readFileSync(path.join(ROOT, '.github', 'workflows', f), 'utf8'));
  const ALL = wfs.join('\n');
  ok(!/uses: actions\/[^\s]*@v\d/.test(ALL), 'workflow: żadna akcja nie jest referencją tagową (@vN)');
  const pins = ALL.match(/uses: actions\/(checkout|setup-node)@[0-9a-f]{40} # v4/g) || [];
  ok(pins.length === 6, 'workflow: 6× akcja spinowana SHA z komentarzem # v4 (checkout×4, setup-node×2)');
  const TR = wfs[1];
  ok(TR.includes('timeout 180 git clone'), 'sync-transports: timeout 180 na clone upstream');
  ok(TR.includes('timeout 120 git push'), 'sync-transports: timeout 120 na push');

  const a = HTML.indexOf('// ─── ONLINE LOAD'), b = HTML.indexOf('// ─── WAYPOINT PLANNER');
  const OL = HTML.slice(a, b);
  ok(OL.includes("api.github.com/repos/Isithunzi000/arkadia-web_standalone-arkmap_studio/commits/mapa"),
    'UI: resolve tipa gałęzi mapa przez API (TOCTOU)');
  ok(OL.includes("if (e.name === 'AbortError') throw e;") && OL.includes('return MAPA_RAW_URL;'),
    'UI: fallback na URL-e gałęziowe, AbortError nie jest maskowany');
  ok((OL.match(/olBaseUrl \+ /g) || []).length === 3, 'UI: index.json i oba pliki po URL-ach przypiętych do SHA');
}

// ── v1.5.39: okienko online (segmenty/nowrap/szerokość) + NOTICE.md ─────────
console.log('— v1.5.39: okienko online + NOTICE (struktura) —');
{
  const syncCss = (HTML.match(/#ol-sync-info\s*{[^}]*}/) || [''])[0];
  ok(/display:\s*flex/.test(syncCss) && /flex-wrap:\s*wrap/.test(syncCss) && /min-height:\s*15px/.test(syncCss),
    'okienko: #ol-sync-info ma regułę flex/wrap/min-height (brak skakania, łamanie między segmentami)');
  ok(/\.ol-src\s*{[^}]*white-space:\s*nowrap/.test(HTML), 'okienko: nazwa repo w opisie nowrap');
  const bodyA = HTML.indexOf('id="ol-confirm-body"'), bodyB = HTML.indexOf('id="ol-confirm-footer"');
  ok(!HTML.slice(bodyA, bodyB).includes('—<br>'), 'okienko: opis bez sztywnego łamania <br>');
  ok(HTML.includes("timeStyle: 'short'") && (HTML.match(/<span>mapa <strong>|<span>sync \${when}<\/span>/g) || []).length === 2,
    'okienko: sync-info z segmentów span, data bez sekund');
  ok(/#ol-confirm\s*{[^}]*width:\s*420px[^}]*max-width:\s*92vw/.test(HTML), 'okienko: szerokość 420px / 92vw');

  const notice = fs.readFileSync(path.join(ROOT, 'NOTICE.md'), 'utf8');
  ok(notice.includes('github.com/Delwing/arkadia-mapa') && notice.includes('github.com/Delwing/arkadia-web-client-extension'),
    'NOTICE.md: atrybucje obu źródeł upstream (mapa + transporty)');
  ok(notice.includes('Permission is hereby granted') && notice.includes('Copyright © Delwing'),
    'NOTICE.md: tekst zgody MIT z copyright Delwing');
}

// ── v1.5.41: progres pobierania (gzip bug) + modal O programie (typografia) ──
console.log('— v1.5.41: progres pobierania + modal O programie (struktura) —');
{
  // Bug: raw.githubusercontent gzipuje tekstowy .arkmap — content-length jest rozmiarem
  // skompresowanym, reader liczy bajty po dekompresji → procent > 100%. Fix: total z index.json.
  ok(HTML.includes('async function olFetchFile(url, label, expectedSize, prog)'),
    'progres: olFetchFile przyjmuje expectedSize (rozmiar z index.json); prog = cel postepu (F1)');
  ok(HTML.includes('const _prg = (prog && prog.prg) || olConfirmPrg;') &&
     HTML.includes('const _bar = prog ? (prog.bar || null) : olConfirmBar;'),
    'progres: bez prog cel postepu = ol-confirm (zachowanie domyslne zachowane)');
  ok(HTML.includes('Number.isFinite(expectedSize) ? expectedSize : (contentLength ? parseInt(contentLength) : null)'),
    'progres: expectedSize nadrzędne względem content-length (fallback zostaje)');
  ok(HTML.includes('Math.min(100, Math.round(loaded / total * 100))'),
    'progres: procent clampowany do 100%');
  ok(HTML.includes("olFetchFile(olBaseUrl + OL_F, OL_F, olIndex?.arkmap_size)") &&
     HTML.includes("olFetchFile(olBaseUrl + OL_F, OL_F, olIndex?.dat_size)"),
    'progres: oba loadery przekazują rozmiary z olIndex (nazwa pliku z const OL_F — v1.43.2)');
  ok(HTML.includes('<div id="ol-confirm-bar"><div id="ol-confirm-bar-fill"></div></div>') &&
     /#ol-confirm-bar-fill\s*{[^}]*background:\s*var\(--accent\)/.test(HTML),
    'progres: pasek postępu (markup + CSS)');
  ok(HTML.includes("if (_bar) _bar.style.width = pct + '%';"),
    'progres: pasek aktualizowany w pętli pobierania (przez _bar — domyslnie olConfirmBar)');

  // Modal O programie: łamanie tekstu
  ok(/#about-modal\s*{[^}]*width:\s*520px/.test(HTML), 'O programie: szerokość 520px');
  ok(/\.about-desc strong\s*{[^}]*white-space:\s*nowrap/.test(HTML),
    'O programie: nazwy formatów (strong) bez pękania w pół frazy');
  ok((HTML.match(/text-wrap:\s*pretty/g) || []).length >= 3,
    'O programie: text-wrap pretty na opisie/licencji/linkach');
  const licA = HTML.indexOf('MIT License');
  const licB = HTML.indexOf('Copyright © 2026 Isithunzi', licA);
  ok(!HTML.slice(licA, licB).includes('open source.<br>'),
    'O programie: licencja bez sztywnego <br> (naturalny flow)');
  ok(/\.about-link\s*{[^}]*align-items:\s*flex-start/.test(HTML),
    'O programie: ikona linku przy pierwszej linii (flex-start)');
}

// ── Arc 9: fixy audytu sync (v1.43.1) ──────────────────────────────────────
console.log('— Arc 9: sync-transports.yml / brama / olFetchFile —');
{
  const WT = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'sync-transports.yml'), 'utf8');
  // komentarz # wewnatrz $(...) polyka zamykajacy nawias -> bash EOF error (Arc 9, sync HIGH)
  for (const line of WT.split('\n')) {
    const open = line.indexOf('$(');
    if (open < 0) continue;
    // # poza cudzyslowami po $( = komentarz polykajacy reszte linii (bash)
    const bare = line.slice(open).replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    ok(!/\s#/.test(bare), 'sync-transports.yml: brak komentarza # wewnatrz $() — linia: ' + line.trim().slice(0, 60));
  }
  const WM = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'sync-map.yml'), 'utf8');
  ok(/curl[^\n]*Authorization: Bearer \$\{\{ secrets\.GITHUB_TOKEN \}\}/.test(WM) || /Authorization: Bearer/.test(WM),
    'sync-map.yml: brama releases/latest uwierzytelniona GITHUB_TOKEN (limit 60/h -> 1000/h)');
  ok(/timeout 120 git push/.test(WT), 'sync-transports.yml: push opakowany timeout 120 (fail-fast)');
  // olFetchFile: releaseLock w finally (higiena strumienia przy abort/timeout)
  const i = HTML.indexOf('async function olFetchFile');
  const j = HTML.indexOf('\n}\n', i);
  const OL = HTML.slice(i, j);
  ok(/finally[\s\S]*releaseLock/.test(OL), 'olFetchFile: reader.releaseLock() w finally');
}

// ── v1.43.2: serializacja pobrań online (Arc 12, wariant 2: blokada + toast) ──
console.log('— v1.43.2: serializacja pobran online —');
{
  ok((HTML.match(/let _olActiveLabel = null;/g) || []).length === 1,
    'serializacja: flaga _olActiveLabel zadeklarowana raz (null = wolne)');
  ok((HTML.match(/if \(_olActiveLabel !== null\)/g) || []).length === 3,
    'serializacja: guard na wejściu wszystkich 3 loaderów (olLoadArkmap/olLoadDat/_kalkaOnlineLoad)');
  ok((HTML.match(/finally \{ _olActiveLabel = null; \}/g) || []).length === 3,
    'serializacja: flaga zdejmowana w finally ×3 (sukces/błąd/abort/przerwanie walidacji)');
  ok((HTML.match(/toast\('⚠ Trwa pobieranie: ' \+ _olActiveLabel \+ ' — poczekaj na zakończenie'\)/g) || []).length === 3,
    'serializacja: komunikat z dynamiczną nazwą pliku ×3 (zero hardcode)');
  ok(HTML.includes("const OL_F = 'map_master3.arkmap';") && HTML.includes("const OL_F = 'map_master3.dat';"),
    'serializacja: nazwa pliku z jednego źródła (const OL_F) w obu loaderach dialogu online');
}

// ── Posprzątanie ────────────────────────────────────────────────────────────
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\nsync_map: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
