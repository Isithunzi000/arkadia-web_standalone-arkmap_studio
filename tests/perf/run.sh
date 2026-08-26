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

# Finalizacja automatyczna (Arc 30): META.json + MASZYNA.md + raporty HTML
# generuja sie same na kazdym wyjsciu (tez przy SKIP_BROWSER / braku przegladarki).
# Idempotentne: istniejace META.json/MASZYNA.md (np. recznie nadpisane) zostaja.
# BG="wlasny opis tla" nadpisuje domyslny background; SKIP_REPORT=1 wylacza raporty.
finalize() {
  rc=$?
  [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null || true
  DATE=$(date +%F)
  APPV=$(sed -n "s/.*APP_VERSION = '\([^']*\)'.*/\1/p" arkmap_studio.html | head -1)
  if command -v node >/dev/null && [ -f "$OUT/base.arkmap" ] && [ ! -f "$OUT/META.json" ]; then
    node - "$OUT" "$APPV" "${BG:-Maszyna bez innego obciążenia w trakcie pomiaru.}" <<'NODEEOF'
const fs = require('fs');
const [out, appv, bg] = process.argv.slice(2);
let alg = 'unknown';
for (const f of ['base.arkmap', 'stress_2k.arkmap', 'stress_4k.arkmap', 'stress_8k.arkmap', 'stress_16k.arkmap', 'stress_32k.arkmap']) {
  try { const d = JSON.parse(fs.readFileSync(out + '/' + f, 'utf8')); alg = (d.meta && d.meta.checksums || d.checksums).alg; break; } catch {}
}
const meta = { app_version: appv, checksum_alg: alg, background: bg };
for (const k of [32, 16, 8, 4, 2]) {   // gen_oom: najwieksze K z .arkmap bez .dat
  if (fs.existsSync(`${out}/stress_${k}k.arkmap`) && !fs.existsSync(`${out}/stress_${k}k.dat`)) {
    meta.gen_oom = `K=${k}: przerwanie generatora po zapisaniu .arkmap, przed eksportem .dat.`;
    break;
  }
}
fs.writeFileSync(out + '/META.json', JSON.stringify(meta, null, 1) + '\n');
NODEEOF
    echo "auto: $OUT/META.json"
  fi
  if [ ! -f "$OUT/MASZYNA.md" ]; then
    CPU=$(LC_ALL=C lscpu 2>/dev/null | sed -n 's/^Model name:[[:space:]]*//p' | head -1)
    [ -z "$CPU" ] && CPU=$(sed -n 's/^model name[[:space:]]*:[[:space:]]*//p' /proc/cpuinfo | head -1)
    THR=$(LC_ALL=C lscpu 2>/dev/null | sed -n 's/^CPU(s):[[:space:]]*//p' | head -1)
    CPS=$(LC_ALL=C lscpu 2>/dev/null | sed -n 's/^Core(s) per socket:[[:space:]]*//p' | head -1)
    SCK=$(LC_ALL=C lscpu 2>/dev/null | sed -n 's/^Socket(s):[[:space:]]*//p' | head -1)
    CORES=$(( ${CPS:-1} * ${SCK:-1} ))
    RAM=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)
    OSN=$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -s)
    NODEV=$(command -v node >/dev/null && node --version || echo 'brak')
    BRW='brak (faza 3 pominieta)'
    [ -n "${CHROME:-}" ] && BRW=$("$CHROME" --version 2>/dev/null | head -1)
    REV=$(git rev-parse --short HEAD 2>/dev/null || echo 'kopia bez .git')
    {
      echo "# Maszyna pomiarowa (przebieg $DATE)"
      echo
      echo "- CPU: ${CPU:-nieznane} (${CORES}C/${THR:-?}T)"
      echo "- RAM: ${RAM} MB (heap Node w teście: ${HEAP} MB)"
      echo "- OS: ${OSN} (jądro $(uname -r))"
      echo "- Node: ${NODEV}"
      echo "- Aplikacja: ${APPV:-?} (silnik sum wg META.json)"
      echo "- Przeglądarka: ${BRW}"
      echo "- Repo: ${REV}"
      echo "- Uwaga: ${BG:-Maszyna bez innego obciążenia w trakcie pomiaru.}"
    } > "$OUT/MASZYNA.md"
    echo "auto: $OUT/MASZYNA.md"
  fi
  if [ "${SKIP_REPORT:-0}" != 1 ] && command -v node >/dev/null && [ -f "$OUT/results_node.json" ] && [ -f "$OUT/results_browser.json" ]; then
    node tests/perf/report_build.mjs "$OUT" "docs/raport_wydajnosci_${DATE}.html"       && echo "auto: docs/raport_wydajnosci_${DATE}.html" || true
    LATEST=$(ls -d tests/perf/results/*/ 2>/dev/null | sort | tail -1)
    if [ -n "$LATEST" ]; then
      node tests/perf/report_build.mjs "$OUT" "docs/porownanie_wydajnosci_${DATE}.html" --compare "${LATEST%/}"         && echo "auto: docs/porownanie_wydajnosci_${DATE}.html (vs ${LATEST%/})" || true
    fi
  elif [ "${SKIP_REPORT:-0}" != 1 ] && [ -f "$OUT/results_node.json" ]; then
    echo "raporty: SKIP (brak results_browser.json — faza 3 pominieta; report_build wymaga obu plikow)"
  fi
  exit "$rc"
}
trap finalize EXIT

if [ "${SKIP_GEN:-0}" != 1 ]; then
echo "=== faza 0: baza .arkmap z produkcyjnego fixture ==="
node tools/dat2arkmap.mjs map_master3.dat "$OUT/base.arkmap" || exit 1

echo "=== faza 1: drabinka syntetykow (po jednym K, heap ${HEAP}MB) ==="
for K in 2 4 8 16 32; do
  node --max-old-space-size="$HEAP" tests/perf/gen_stress.mjs "$OUT/base.arkmap" "$OUT" "$K" || { echo "K=$K przerwane — stop drabinki"; break; }
done
ls -la "$OUT"
else
  echo "=== fazy 0-1: SKIP (SKIP_GEN=1) ==="
fi

if [ "${SKIP_NODE:-0}" != 1 ]; then
echo "=== faza 2: czysty parse Node (dat vs arkmap) ==="
node --expose-gc --max-old-space-size="$HEAP" tests/perf/bench_parse.js "$OUT" 20 || exit 1
else
  echo "=== faza 2: SKIP (SKIP_NODE=1) ==="
fi

if [ "${SKIP_BROWSER:-0}" != 1 ]; then
echo "=== faza 3: przegladarka (load + render + kamera + eksport .dat) ==="
python3 -c 'import websockets' 2>/dev/null || { echo "BRAK python3-websockets — sudo apt install python3-websockets — pomijam faze 3"; echo "Wyniki czesciowe: $OUT/results_node.json"; exit 0; }
CHROME="${CHROMIUM_BIN:-}"
if [ -z "$CHROME" ]; then
  for c in "$PWD/.chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell" "$HOME/.local/chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell" chromium chromium-browser google-chrome; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "BRAK przegladarki — patrz tests/perf/README.md (chrome-headless-shell); pomijam faze 3"; echo "Wyniki czesciowe: $OUT/results_node.json"; exit 0; }
echo "przegladarka: $CHROME"
export CHROMIUM_BIN="$CHROME"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
sleep 1

python3 - "$RUNS" "$PORT" << 'PYEOF'
import json, os, subprocess, sys
RUNS, PORT = int(sys.argv[1]), sys.argv[2]
OUT = 'tests/perf/out'
RES = os.path.join(OUT, 'results_browser.json')   # tablica JSON (nie JSONL) — latwiejsze zalaczanie
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

recs = []
json.dump(recs, open(RES, 'w'))   # inicjalizacja: pusta tablica
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
        recs.append(rec)
        # zapis przyrostowy: po kazdym rekordzie nadpisz cala tablice —
        # crash w polowie fazy nie gubi zebranych wynikow
        with open(RES, 'w') as f:
            json.dump(recs, f, ensure_ascii=False, indent=1)
        if v != 'OK':
            stopped[fmt] = True
            print(f'  ^ {fmt}: STOP drabinki tego formatu (ostatni zielony = poprzedni rozmiar)')
print('wyniki: ' + RES)
PYEOF
else
  echo "=== faza 3: SKIP (SKIP_BROWSER=1) ==="
fi

echo "=== KONIEC ==="
echo "Wyniki: $OUT/results_node.json + $OUT/results_browser.json"
echo "META.json, MASZYNA.md i raporty HTML w docs/ wygenerowane automatycznie (SKIP_REPORT=1 wylacza raporty)."
