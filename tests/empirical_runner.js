// Harness — straznik hardeningu zawiesz empirycznych (flake CI ea33f85,
// 2026-08-24). Pinuje mechanizm: E15 na realnym zegarze przez CDP
// (tests/empirical_run.py), watchdog drivera gwarantujacy SUMMARY, retry
// kampanii glownej WYLACZNIE na czysta zawieche (zero R|FAIL), zaleznosc
// websockets w workflow. Bez tego straznika ktos moze "uproscic" mechanizm
// z powrotem do virtual-time i przywrocic flake. Uruchamianie z katalogu repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SH = fs.readFileSync(path.join(ROOT, 'tests', 'empirical.sh'), 'utf8');
const RUNALL = fs.readFileSync(path.join(ROOT, 'tests', 'run-all.sh'), 'utf8');
const DRIVER = fs.readFileSync(path.join(ROOT, 'tests', 'empirical_driver.html'), 'utf8');
const RUNNER = fs.readFileSync(path.join(ROOT, 'tests', 'empirical_run.py'), 'utf8');
const YML = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci-tests.yml'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

console.log('— driver: marker + watchdog real-time —');
{
  ok(DRIVER.includes('window.__EMPIRICAL_DONE__ = true;'),
    'finish() ustawia __EMPIRICAL_DONE__ (marker dla runnera CDP)');
  ok(/function finish\(\) \{\s*if \(window\.__EMPIRICAL_DONE__\) return;/.test(DRIVER),
    'finish() idempotentne (watchdog + runAll nie dubluja SUMMARY)');
  ok(DRIVER.includes('const ARK_RT_WATCHDOG_MS = 90000;'),
    'watchdog 90 s (runner CDP ma timeout 150 s > watchdog — watchdog odpala pierwszy)');
  ok(DRIVER.includes("get('rt') === '1'") && DRIVER.includes('_curScenario'),
    'watchdog uzbrajany tylko w trybie ?rt=1 + nazywa wiszacy scenariusz');
}

console.log('— runner CDP (tests/empirical_run.py) —');
{
  ok(RUNNER.includes('__EMPIRICAL_DONE__ === true'),
    'runner czeka na marker __EMPIRICAL_DONE__ (realny zegar, nie virtual-time)');
  ok(RUNNER.includes('document.documentElement.outerHTML'),
    'runner zwraca outerHTML (format identyczny jak --dump-dom — grep bez zmian)');
  ok(RUNNER.includes("'--remote-debugging-port=0'") && RUNNER.includes('import websockets'),
    'runner przez CDP + websockets');
  ok(!RUNNER.includes("'--virtual-time-budget'"),
    'runner NIE przekazuje flagi --virtual-time-budget (root cause flake wyeliminowany)');
}

console.log('— routing w empirical.sh —');
{
  ok(SH.includes('ARKTEST_REALTIME:-E15'),
    'grupy real-time sterowane zmienna ARKTEST_REALTIME (domyslnie E15)');
  ok(SH.includes('tests/empirical_run.py') && SH.includes('&rt=1'),
    'grupy real-time routowane do runnera CDP z ?rt=1');
  ok(SH.includes("import websockets") && SH.includes('starej sciezce virtual-time'),
    'degradacja bez python3-websockets: stara sciezka + ostrzezenie (nic nie znika cicho)');
}

console.log('— retry kampanii glownej w run-all.sh —');
{
  ok(RUNALL.includes('czysta zawiecha') && RUNALL.includes("grep -q 'R|FAIL'"),
    'retry kampanii WYLACZNIE na czysta zawieche (bramka zero R|FAIL)');
  ok(/for attempt in 1 2 3/.test(RUNALL),
    'blok E15 zachowuje 3 proby na zawieche (siatka nad root-cause fixem)');
}

console.log('— workflow CI —');
{
  const m = YML.match(/pip install websockets==([0-9.]+)/);
  ok(!!m, 'CI instaluje python3-websockets spinane wersja (jak playwright)');
  ok(m && m[1] === '15.0.1', 'websockets==15.0.1 (zweryfikowane w sandboxie 2026-08-24)');
}

console.log('— podpiecie —');
{
  ok(RUNALL.includes('tests/empirical_runner.js'),
    'run-all.sh uruchamia empirical_runner.js (straznik nie moze zostac osierocony)');
}

console.log('');
console.log(`═══ empirical_runner: ${pass} OK, ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
