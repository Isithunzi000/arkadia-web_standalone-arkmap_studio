#!/bin/bash
# run_megatest.sh — orkiestrator mega-testu: ArkMap Studio vs mudlet-web
# vs Mudlet desktop na wspolnej drabinie plikow .dat.
#
# Uzycie:  bash tests/megatest/run_megatest.sh [runs]
#   runs — przebiegow na punkt pomiaru (domyslnie 5)
# Srodowisko:
#   MUDLET_BIN=/sciezka/Mudlet-4.22.0.AppImage  — binarka desktopu (faza desktop)
#   MEGATEST_DISPLAY=1 — faza desktop na prawdziwej sesji graficznej (pomija offscreen i xvfb)
#   HEAP=MB — sufit heapu Node (domyslnie auto: min(6144, 50% RAM))
#   SKIP_INPUTS=1 / SKIP_WEB=1 / SKIP_ARKMAP=1 / SKIP_DESKTOP=1 — pomin faze
#   Opcje CLI (nadpisuja env): --only/--skip/--desktop-only/--dry-run — zobacz --help
#   SKIP_REPORT=1 — bez raportu HTML
# Kryteria limitu (zarejestrowane przed pomiarem — NIE RUSZAC po fakcie):
#   CRASH — pad/timeout procesu | LOAD — mediana wczytania > 30 s
#   MEM — RAM/heap mediana lub peak > 2048 MB
# Wszystkie trzy silniki mierzone w JEDNEJ sesji na TEJ SAMEJ maszynie
# (wniosek z anomalii termicznej perf labu 2026-08-27).
set -u
cd "$(dirname "$0")/../.."
# --- argumenty linii polecen ---
# Uzycie: bash tests/megatest/run_megatest.sh [runs] [--only FAZY] [--skip FAZY] [--dry-run]
#   FAZY — lista po przecinku (bez spacji): inputs,manifest,web,arkmap,desktop,report
#   --only desktop — tylko faza desktop (reszta SKIP; report i tak domyka bieg)
#   --desktop-only — skrot do --only desktop
#   --dry-run — wypisuje plan faz i konczy (nic nie kasuje, nic nie mierzy)
# Flagi nadpisuja zmienne SKIP_INPUTS/SKIP_MANIFEST/SKIP_WEB/SKIP_ARKMAP/SKIP_DESKTOP/SKIP_REPORT.
RUNS=""
ONLY=""
SKIPCLI=""
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --only=*)        ONLY="${1#*=}" ;;
    --only)          shift; ONLY="${1:?--only wymaga listy faz}" ;;
    --desktop-only)  ONLY="desktop" ;;
    --skip=*)        SKIPCLI="${1#*=}" ;;
    --skip)          shift; SKIPCLI="${1:?--skip wymaga listy faz}" ;;
    --dry-run)       DRY=1 ;;
    -h|--help)       sed -n '2,16p' "$0"; sed -n '/# --- argumenty linii polecen ---/,/^# Flagi/p' "$0"; exit 0 ;;
    [0-9]*)          RUNS="$1" ;;
    *)               echo "nieznany argument: $1 (zobacz --help)"; exit 2 ;;
  esac
  shift
done
RUNS="${RUNS:-5}"

has_ph() { case ",$1," in *",$2,"*) return 0;; *) return 1;; esac; }
if [ -n "$ONLY" ]; then
  for ph in inputs manifest web arkmap desktop; do
    has_ph "$ONLY" "$ph" || eval "SKIP_$(echo "$ph" | tr '[:lower:]' '[:upper:]')=1"
  done
fi
for ph in ${SKIPCLI//,/ }; do
  has_ph "inputs,manifest,web,arkmap,desktop,report" "$ph" || { echo "nieznana faza: $ph"; exit 2; }
  eval "SKIP_$(echo "$ph" | tr '[:lower:]' '[:upper:]')=1"
done
DATE=$(date +%F)
RESULTS=tests/megatest/results/$DATE
RAM_MB=$(free -m | awk 'NR==2{print $2}')   # NR==2 = odpornosc na locale
AUTO_HEAP=$(( RAM_MB / 2 )); [ "$AUTO_HEAP" -gt 6144 ] && AUTO_HEAP=6144
[ "$AUTO_HEAP" -lt 2048 ] && AUTO_HEAP=2048
HEAP="${HEAP:-$AUTO_HEAP}"

echo "== MEGA-TEST: ArkMap vs mudlet-web vs Mudlet desktop =="
echo "wyniki: $RESULTS | runs: $RUNS | heap Node: $HEAP MB"
ph() { [ "${!1:-0}" = 1 ] && echo "SKIP" || echo "RUN"; }
echo "plan faz: inputs=$(ph SKIP_INPUTS) manifest=$(ph SKIP_MANIFEST) web=$(ph SKIP_WEB) arkmap=$(ph SKIP_ARKMAP) desktop=$(ph SKIP_DESKTOP) report=$(ph SKIP_REPORT)"
[ "$DRY" = 1 ] && exit 0
command -v node >/dev/null || { echo "BRAK node"; exit 2; }
mkdir -p "$RESULTS"

# Idempotentnosc: czyscimy WYLACZNIE artefakty faz, ktore pojda w tej sesji —
# pominiete fazy zachowuja wyniki z poprzednich biegow (np. --only desktop).
[ "${SKIP_MANIFEST:-0}" != 1 ] && rm -f "$RESULTS"/manifest.lua "$RESULTS"/manifest.json
[ "${SKIP_WEB:-0}" != 1 ] && rm -f "$RESULTS"/results_web.json
[ "${SKIP_ARKMAP:-0}" != 1 ] && rm -f "$RESULTS"/results_arkmap_node.json
[ "${SKIP_DESKTOP:-0}" != 1 ] && rm -f "$RESULTS"/results_desktop.json "$RESULTS"/results_desktop.jsonl \
      "$RESULTS"/desktop.done "$RESULTS"/desktop.error "$RESULTS"/ram_desktop.txt
if [ "${SKIP_MANIFEST:-0}" = 1 ] && { [ "${SKIP_WEB:-0}" != 1 ] || [ "${SKIP_DESKTOP:-0}" != 1 ]; }; then
  [ -f "$RESULTS/manifest.lua" ] && [ -f "$RESULTS/manifest.json" ] || {
    echo "BLAD: manifest pominiety, ale brak $RESULTS/manifest.lua — najpierw pelny bieg"; exit 1; }
  MRUNS=$(node -e "try{process.stdout.write(String(JSON.parse(require('fs').readFileSync('$RESULTS/manifest.json','utf8')).runs))}catch(e){process.stdout.write('?')}" 2>/dev/null)
  echo "manifest: uzywam istniejacego (runs=$MRUNS, seed 20260827)"
  if [ "$MRUNS" != "?" ] && [ "$MRUNS" != "$RUNS" ]; then
    echo "UWAGA: argument runs=$RUNS zignorowany — pomiar pojedzie wg manifestu (runs=$MRUNS)"
  fi
fi

finalize() {
  rc=$?
  APPV=$(sed -n "s/.*APP_VERSION = '\([^']*\)'.*/\1/p" arkmap_studio.html | head -1)
  MUDLET_V='?'
  if [ -n "${MUDLET_BIN:-}" ] && [ -x "${MUDLET_BIN:-}" ]; then
    MUDLET_V=$("$MUDLET_BIN" --version 2>/dev/null | head -1 | tr -d '\r')
  fi
  if [ ! -f "$RESULTS/META.json" ]; then
    READER_V=$(sed -n 's/.*"mudlet-map-binary-reader": *"\([^"]*\)".*/\1/p' tests/megatest/web/package-lock.json 2>/dev/null | head -1)
    ALG='unknown'
    [ -f tests/perf/out/base.arkmap ] && ALG=$(node -e "const m=JSON.parse(require('fs').readFileSync('tests/perf/out/base.arkmap','utf8'));process.stdout.write((m.meta&&m.meta.checksums||m.checksums).alg)" 2>/dev/null || echo unknown)
    cat > "$RESULTS/META.json" <<EOF
{
 "app_version": "${APPV:-?}",
 "mudlet_desktop": "${MUDLET_V:-?}",
 "mudlet_map_binary_reader": "${READER_V:-?}",
 "node": "$(node --version)",
 "checksum_alg": "$ALG",
 "runs": $RUNS,
 "seed_manifestu": 20260827,
 "note": "W1 desktop = loadMap (restore+audit+init2D, pelna cena uzytkownika); W1 web/arkmap = czysty parse Node; pary i frazy deterministyczne (manifest)."
}
EOF
    echo "auto: $RESULTS/META.json"
  fi
  if [ ! -f "$RESULTS/MASZYNA.md" ]; then
    CPU=$(LC_ALL=C lscpu 2>/dev/null | sed -n 's/^Model name:[[:space:]]*//p' | head -1)
    [ -z "$CPU" ] && CPU=$(sed -n 's/^model name[[:space:]]*:[[:space:]]*//p' /proc/cpuinfo | head -1)
    THR=$(LC_ALL=C lscpu 2>/dev/null | sed -n 's/^CPU(s):[[:space:]]*//p' | head -1)
    CPS=$(LC_ALL=C lscpu 2>/dev/null | sed -n 's/^Core(s) per socket:[[:space:]]*//p' | head -1)
    SCK=$(LC_ALL=C lscpu 2>/dev/null | sed -n 's/^Socket(s):[[:space:]]*//p' | head -1)
    CORES=$(( ${CPS:-1} * ${SCK:-1} ))
    RAM=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)
    OSN=$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -s)
    REV=$(git rev-parse --short HEAD 2>/dev/null || echo 'kopia bez .git')
    {
      echo "# Maszyna pomiarowa (mega-test $DATE)"
      echo
      echo "- CPU: ${CPU:-nieznane} (${CORES}C/${THR:-?}T)"
      echo "- RAM: ${RAM} MB (heap Node w teście: ${HEAP} MB)"
      echo "- OS: ${OSN} (jądro $(uname -r))"
      echo "- Node: $(node --version)"
      echo "- Mudlet desktop: ${MUDLET_V:-?}"
      echo "- Aplikacja: ${APPV:-?}"
      echo "- Repo: ${REV}"
      echo "- Uwaga: maszyna bez innego obciążenia w trakcie pomiaru; wszystkie silniki w jednej sesji."
    } > "$RESULTS/MASZYNA.md"
    echo "auto: $RESULTS/MASZYNA.md"
  fi
  if [ "${SKIP_REPORT:-0}" != 1 ]; then
    node tests/megatest/report_megatest.mjs "$RESULTS" "docs/megatest_raport_${DATE}.html" \
      && echo "auto: docs/megatest_raport_${DATE}.html" || echo "raport: niepowodzenie (nie blokuje przebiegu)"
  fi
  exit "$rc"
}
trap finalize EXIT

if [ "${SKIP_INPUTS:-0}" != 1 ]; then
  bash tests/megatest/inputs.sh || exit 1
else
  echo "=== inputs: SKIP ==="
fi

if [ "${SKIP_MANIFEST:-0}" != 1 ]; then
  echo "=== manifest ==="
  node tests/megatest/gen_manifest.mjs "$RESULTS" "$RUNS" || exit 1
else
  echo "=== manifest: SKIP (istniejacy z poprzedniego biegu) ==="
fi

if [ "${SKIP_WEB:-0}" != 1 ]; then
  echo "=== faza W: mudlet-web (mudlet-map-binary-reader) ==="
  (cd tests/megatest/web && npm ci --no-audit --no-fund) || { echo "npm ci niepowodzenie"; exit 1; }
  node --expose-gc --max-old-space-size="$HEAP" \
    tests/megatest/web/bench_mudletweb.mjs "$RESULTS/manifest.json" "$RESULTS/results_web.json" "$RUNS" || exit 1
else
  echo "=== faza W: SKIP ==="
fi

if [ "${SKIP_ARKMAP:-0}" != 1 ]; then
  echo "=== faza A: arkmap (parse Node — istniejacy harness perf labu) ==="
  # bench_parse.js zapisuje results_node.json do katalogu z mapami
  # (tests/perf/out — gitignored, regenerowalny); kopiujemy do wynikow mega-testu.
  node --expose-gc --max-old-space-size="$HEAP" tests/perf/bench_parse.js tests/perf/out "$RUNS" "$RESULTS/manifest.json" || exit 1
  cp tests/perf/out/results_node.json "$RESULTS/results_arkmap_node.json"
else
  echo "=== faza A: SKIP ==="
fi

if [ "${SKIP_DESKTOP:-0}" != 1 ]; then
  echo "=== faza D: Mudlet desktop (offscreen + Lua) ==="
  bash tests/megatest/desktop/run_desktop.sh "$RESULTS" || exit 1
else
  echo "=== faza D: SKIP ==="
fi

echo "== mega-test zakonczony =="
