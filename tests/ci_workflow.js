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
}

console.log(`\nci_workflow: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
