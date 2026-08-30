// Harness — watchdog workflow CI (.github/workflows/ci-tests.yml).
// Powstał po flake: run na 3e022ea zabity timeoutem joba (25 min), bo krok
// `playwright install --with-deps chromium` zaciął się na pobieraniu przeglądarki
// (flake sieciowy runnera) i regresja nigdy nie wystartowała. Strażnik pilnuje,
// żeby zabezpieczenia (cache przeglądarki + zapas czasowy) nie zniknęły po cichu
// przy kolejnej edycji workflow. Uruchamianie z katalogu głównego repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Wejście ─────────────────────────────────────────────────────────────────
const YML_PATH = path.join(ROOT, '.github', 'workflows', 'ci-tests.yml');
ok(fs.existsSync(YML_PATH), 'ci-tests.yml istnieje');
const YML = fs.existsSync(YML_PATH) ? fs.readFileSync(YML_PATH, 'utf8') : '';
const RUNALL = fs.readFileSync(path.join(ROOT, 'tests', 'run-all.sh'), 'utf8');

// ── Sufit czasowy joba ──────────────────────────────────────────────────────
console.log('— sufit czasowy —');
{
  const m = YML.match(/timeout-minutes:\s*(\d+)/);
  ok(!!m, 'job ma timeout-minutes');
  ok(m && +m[1] >= 40, `timeout-minutes >= 40 (jest: ${m ? m[1] : 'brak'}) — zapas na miss cache i wolniejszy runner`);
  const r = YML.match(/timeout\s+(\d+)\s+bash tests\/run-all\.sh/);
  ok(!!r, 'krok regresji ma własny timeout na run-all.sh');
  ok(r && +r[1] >= 1200, `timeout regresji >= 1200 s (jest: ${r ? r[1] : 'brak'})`);
}

// ── Cache przeglądarki Playwright ───────────────────────────────────────────
console.log('— cache playwright —');
{
  ok(/uses: actions\/cache@[0-9a-f]{40} # v4/.test(YML), 'krok actions/cache spinowany pełnym SHA z komentarzem # v4');
  ok(YML.includes('path: ~/.cache/ms-playwright'), 'cache obejmuje ~/.cache/ms-playwright (binaria przeglądarki)');
  const pw = YML.match(/playwright@([0-9.]+) install/);
  ok(!!pw, 'krok install deklaruje wersję playwright (playwright@X.Y.Z)');
  const key = YML.match(/key:\s*\$\{\{ runner\.os \}\}-(\S+)/);
  ok(!!key, 'cache ma key z runner.os');
  ok(pw && key && key[1].includes(pw[1]), `klucz cache spięty z wersją playwright (key: ${key ? key[1] : '?'}, install: ${pw ? pw[1] : '?'}) — bump wersji = świeży cache`);
  ok(/npx -y playwright@[0-9.]+ install --with-deps chromium/.test(YML), 'install z --with-deps chromium (deps systemowe z apt niezależnie od cache)');
}

// ── Pinning i struktura (spójność z konwencją repo) ────────────────────────
console.log('— pinning / struktura —');
{
  ok(!/uses: actions\/[^\s]*@v\d/.test(YML), 'żadna akcja nie jest referencją tagową (@vN)');
  const uses = YML.match(/uses: actions\/\S+/g) || [];
  ok(uses.length > 0 && uses.every(u => /@[0-9a-f]{40}$/.test(u)), `każdy uses: spinowany pełnym SHA (${uses.length} akcji)`);
  ok(/concurrency:\s*\n\s*group: ci-tests\s*\n\s*cancel-in-progress: false/.test(YML), 'concurrency: group ci-tests + cancel-in-progress: false (jeden run naraz)');
  ok(/timeout 240 bash tests\/fetch-fixture\.sh/.test(YML), 'fixture pobierany z timeoutem 240 s (przypięty release)');
  ok(/fetch-depth: 0/.test(YML), 'checkout z pełną historią (testy różnicowe robią git show)');
}

// ── Watchdog podpięty do regresji ───────────────────────────────────────────
console.log('— podpięcie —');
{
  ok(RUNALL.includes('tests/ci_workflow.js'), 'run-all.sh uruchamia ci_workflow.js (watchdog nie może zostać osierocony)');
  // Hardening E15 (2026-08-24): runner CDP wymaga python3-websockets w CI
  ok(/pip install websockets==[0-9.]+/.test(YML), 'CI instaluje python3-websockets spinane wersja (E15 real clock przez CDP)');
}

// ── Arc 37 (PRACA 6): run.sh wskazuje istniejaca dokumentacje ───────────────
// INSTRUKCJA.md zostalo wchloniete przez tests/perf/README.md — komunikat
// o braku przegladarki musi wskazywac plik, ktory realnie istnieje w repo.
console.log('— run.sh wskazowka docs —');
{
  const RUNSH = fs.readFileSync(path.join(ROOT, 'tests', 'perf', 'run.sh'), 'utf8');
  const m = RUNSH.match(/BRAK przegladarki — patrz (\S+)/);
  ok(!!m, 'run.sh: komunikat BRAK przegladarki wskazuje plik dokumentacji');
  ok(m && m[1] === 'tests/perf/README.md', 'run.sh: wskazowka = tests/perf/README.md (INSTRUKCJA.md juz nie istnieje)');
  ok(m && fs.existsSync(path.join(ROOT, m[1])), 'run.sh: wskazany plik dokumentacji istnieje w repo');
}

// ── Arc 43 (OP-1): sync-map.yml self-check czyta sumy z koperty v2 (top-level) ──
// Regresja: self-check logowal m.meta.checksums.alg (uklad v1) — TypeError na
// undefined i czerwony run mimo poprawnego pliku (run 33262514408, 2026-08-29).
console.log('— sync-map self-check (koperta v2) —');
{
  const SM_PATH = path.join(ROOT, '.github', 'workflows', 'sync-map.yml');
  ok(fs.existsSync(SM_PATH), 'sync-map.yml istnieje');
  const SM = fs.existsSync(SM_PATH) ? fs.readFileSync(SM_PATH, 'utf8') : '';
  ok(SM.includes('m.checksums.alg'), 'self-check: alg z top-level m.checksums.alg (koperta v2)');
  ok(!SM.includes('m.meta.checksums'), 'self-check: zero odniesien do starego ukladu m.meta.checksums');
  // v1.52.3 (Arc 46): kazdy timeout w sync-map.yml ma jawna adnotacje ::warning (koniec golym exit 124)
  ok(SM.includes('::warning::git ls-remote taga upstream przekroczyl 90 s'),
    'sync-map: ::warning przy timeout git ls-remote (brama, fail-closed)');
  ok(SM.includes('::warning::git fetch origin mapa przekroczyl 90 s — brak odczytu wersji publikowanej, straznik regresji fail-closed'),
    'sync-map (Arc 47): ::warning przy timeout git fetch + fail-closed');
  ok(/timeout 90 git fetch[\s\S]{0,400}?exit 124/.test(SM),
    'sync-map (Arc 47): timeout fetcha ma exit 124 (straznik regresji nie do obejscia; bootstrap rc 128 zostaje fail-open)');
  ok(SM.includes('::warning::git push na refs/heads/mapa przekroczyl 120 s'),
    'sync-map: ::warning przy timeout git push (publish, fail-closed)');
}

console.log(`\nci_workflow: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
