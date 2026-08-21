#!/bin/bash
# run.sh — caly benchmark + stress test lokalnie (Arc 18).
# Uzycie: bash tests/perf/run.sh [runs] [heapMB]
#   runs    — przebiegow na punkt pomiaru (domyslnie 10)
#   heapMB  — sufit heapu Node (domyslnie auto: min(6144, 50% RAM))
#   SKIP_GEN=1 / SKIP_NODE=1 / SKIP_BROWSER=1 — pomin faze (np. domkniecie
#   luk po pierwszym przebiegu: SKIP_GEN=1 SKIP_NODE=1 bash tests/perf/run.sh 5)
# Kryteria limitu (zarejestrowane przed pomiarem — NIE RUSZAC po fakcie):
#   CRASH — pad przegladarki/timeout 120 s | LOAD — total.med > 30 s
#   JANK — camera p95 > 50 ms | MEM — heap med > 2048 MB
set -u
cd "$(dirname "$0")/../.."
OUT=tests/perf/out
RUNS="${1:-10}"
RAM_MB=$(free -m | awk 'NR==2{print $2}')   # NR==2 = odpornosc na locale (PL: „Pamiec:")
AUTO_HEAP=$(( RAM_MB / 2 )); [ "$AUTO_HEAP" -gt 6144 ] && AUTO_HEAP=6144
[ "$AUTO_HEAP" -lt 2048 ] && AUTO_HEAP=2048
HEAP="${2:-$AUTO_HEAP}"
PORT=18211

echo "== ArkMap Studio — perf lab =="
echo "RAM: ${RAM_MB} MB | heap Node: ${HEAP} MB | przebiegi/punkt: ${RUNS}"
command -v node >/dev/null || { echo "BRAK node — sudo apt install nodejs"; exit 2; }
[ -f map_master3.dat ] || { echo "pobieram fixture…"; bash tests/fetch-fixture.sh; }
mkdir -p "$OUT"

echo "=== faza 0: baza .arkmap z produkcyjnego fixture ==="
node tools/dat2arkmap.mjs map_master3.dat "$OUT/base.arkmap" || exit 1

echo "=== faza 1: drabinka syntetykow (po jednym K, heap ${HEAP}MB) ==="
for K in 2 4 8 16 32; do
  node --max-old-space-size="$HEAP" tests/perf/gen_stress.mjs "$OUT/base.arkmap" "$OUT" "$K" || { echo "K=$K przerwane — stop drabinki"; break; }
done
ls -la "$OUT"

echo "=== faza 2: czysty parse Node (dat vs arkmap) ==="
node --expose-gc --max-old-space-size="$HEAP" tests/perf/bench_parse.js "$OUT" 20 || exit 1

echo "=== faza 3: przegladarka (load + render + kamera + eksport .dat) ==="
python3 -c 'import websockets' 2>/dev/null || { echo "BRAK python3-websockets — sudo apt install python3-websockets — pomijam faze 3"; echo "Wyniki czesciowe: $OUT/results_node.json"; exit 0; }
CHROME="${CHROMIUM_BIN:-}"
if [ -z "$CHROME" ]; then
  for c in "$PWD/.chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell" "$HOME/.local/chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell" chromium chromium-browser google-chrome; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "BRAK przegladarki — patrz INSTRUKCJA.md (chrome-headless-shell); pomijam faze 3"; echo "Wyniki czesciowe: $OUT/results_node.json"; exit 0; }
echo "przegladarka: $CHROME"
export CHROMIUM_BIN="$CHROME"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1

python3 - "$RUNS" "$PORT" << 'PYEOF'
import json, os, subprocess, sys
RUNS, PORT = int(sys.argv[1]), sys.argv[2]
OUT = 'tests/perf/out'
RES = os.path.join(OUT, 'results_browser.jsonl')
# Budzet punktu pomiaru musi objac WSZYSTKIE zimne przebiegi + kamere + eksport:
# baza 60 s (boot) + 30 s na przebieg; zewnetrzny timeout = budzet + 60 s.
BUDGET_MS = 60000 + RUNS * 30000
TIMEOUT_S = BUDGET_MS // 1000 + 60

ladder = [('real_27k', 'map_master3.dat', f'{OUT}/base.arkmap', 26988)]
for k in (2, 4, 8, 16, 32):
    a, d = f'{OUT}/stress_{k}k.arkmap', f'{OUT}/stress_{k}k.dat'
    if os.path.exists(a):
        ladder.append((f'stress_{k}x', d if os.path.exists(d) else None, a, 26988 * k))

def run_one(path, fmt, exportdat):
    url = (f'http://127.0.0.1:{PORT}/tests/perf/perf_driver.html'
           f'?file=../../{path}&fmt={fmt}&runs={RUNS}&exportdat={exportdat}')
    try:
        p = subprocess.run([sys.executable, 'tests/perf/cdp_run.py', url, str(BUDGET_MS)],
                           capture_output=True, text=True, timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return None, 'CRASH(timeout)'
    line = (p.stdout or '').strip().splitlines()
    line = line[-1] if line else ''
    if line.startswith('PERFJSON|'):
        d = json.loads(line.split('|', 1)[1])
        v = 'OK'
        if d['phases']['total']['med'] > 30000:    v = 'LOAD'
        elif d['camera']['p95'] > 50:              v = 'JANK'
        elif (d.get('heap_mb_med') or 0) > 2048:   v = 'MEM'
        return d, v
    if line.startswith('PERFTIMEOUT'): return None, 'CRASH(timeout)'
    if line.startswith('PERFERR'):     return None, 'ERR(' + line[8:80] + ')'
    return None, 'CRASH(' + line[10:70] + ')'

open(RES, 'w').close()
stopped = {'dat': False, 'arkmap': False}
print(f'{"rozmiar":<10} {"fmt":<7} {"verdict":<14} {"total":>8} {"parse":>7} {"crc":>7} {"apply":>7} {"draw1":>6} {"camP95":>7} {"heap":>6} {"expDat":>10}')
for name, datp, arkp, rooms in ladder:
    for fmt, path in (('dat', datp), ('arkmap', arkp)):
        if stopped[fmt]:
            continue
        if path is None:
            print(f'{name:<10} {fmt:<7} BRAK-PLIKU (pominieto — plik nie zostal wygenerowany)')
            stopped[fmt] = True
            continue
        d, v = run_one(path, fmt, '1' if fmt == 'arkmap' else '0')
        rec = {'set': name, 'fmt': fmt, 'rooms': rooms, 'verdict': v}
        if d:
            rec.update(d)
            ph = d['phases']
            exp = d.get('export_dat')
            expS = (str(exp['ms']) + 'ms') if exp and 'ms' in exp else ('ERR' if exp else '—')
            print(f'{name:<10} {fmt:<7} {v:<14} {ph["total"]["med"]:>8} {ph["parse"]["med"]:>7} {ph["crc"]["med"]:>7} '
                  f'{ph["apply"]["med"]:>7} {(ph["first_draw"]["med"] or 0):>6.1f} {d["camera"]["p95"]:>7} {d.get("heap_mb_med"):>6} {expS:>10}')
        else:
            print(f'{name:<10} {fmt:<7} {v:<14}')
        with open(RES, 'a') as f:
            f.write(json.dumps(rec) + '\n')
        if v != 'OK':
            stopped[fmt] = True
            print(f'  ^ {fmt}: STOP drabinki tego formatu (ostatni zielony = poprzedni rozmiar)')
print('wyniki: ' + RES)
PYEOF

echo "=== KONIEC ==="
echo "Wyniki: $OUT/results_node.json + $OUT/results_browser.jsonl"
echo "Wklej oba pliki do czatu — dostaniesz ladny raport HTML."
