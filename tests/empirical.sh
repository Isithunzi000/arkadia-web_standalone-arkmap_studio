#!/bin/bash
# Testy empiryczne .arkdelta — prawdziwa przegladarka (Chromium headless) + pelna aplikacja.
# Driver: tests/empirical_driver.html (iframe z arkmap_studio.html, scenariusze przez eval).
# Wyniki: linie "R|PASS|id|msg" / "R|FAIL|id|msg" + "SUMMARY|pass=N|fail=M" z dumpowanego DOM.
# Zmienne: ARKTEST_GROUPS (domyslnie SMOKE), ARKTEST_BUDGET (ms virtual-time),
#          CHROMIUM_BIN (domyslnie chromium), ARKTEST_PORT,
#          ARKTEST_REALTIME (grupy na realnym zegarze przez CDP, domyslnie "E15").
# Hardening E15 (2026-08-24): grupy real-time NIE jada pod --virtual-time-budget
# (SW gloduje — zawiechy CI 34af1db/a543243/ea33f85), tylko przez
# tests/empirical_run.py (CDP, czeka na __EMPIRICAL_DONE__; watchdog drivera 90 s
# gwarantuje SUMMARY). Degradacja: brak python3-websockets -> stara sciezka
# virtual-time + ostrzezenie.
set -e
cd "$(dirname "$0")/.."
[ -f map_master3.dat ] || bash tests/fetch-fixture.sh

PORT="${ARKTEST_PORT:-18137}"
CHROME="${CHROMIUM_BIN:-chromium}"
GRPS="${ARKTEST_GROUPS:-SMOKE}"
BUDGET="${ARKTEST_BUDGET:-90000}"
# E20 na realnym zegarze (fala 3): pod --virtual-time-budget lancuch
# click → rAF → eksport PNG → toBlob → toast goni sie z wirtualnym zegarem
# (flake srodowiskowy, zreprodukowany na kodzie sprzed fali 3) — jak E15/SW.
RT_GRPS="${ARKTEST_REALTIME:-E15 E20}"
HAVE_WS=0
python3 -c 'import websockets' 2>/dev/null && HAVE_WS=1
OUT="$(mktemp)"; LOG="$(mktemp)"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true; rm -f "$OUT" "$LOG"' EXIT
sleep 1

FAILED=0
for g in $GRPS; do
  USE_RT=0
  for rg in $RT_GRPS; do [ "$g" = "$rg" ] && USE_RT=1; done
  if [ "$USE_RT" = 1 ] && [ "$HAVE_WS" = 1 ]; then
    echo "=== grupa $g (real clock, CDP) ==="
    timeout "${ARKTEST_TIMEOUT:-420}" python3 tests/empirical_run.py \
      "http://127.0.0.1:$PORT/tests/empirical_driver.html?g=$g&rt=1" \
      "${ARKTEST_RT_TIMEOUT:-150000}" >"$OUT" 2>"$LOG" || true
  else
    if [ "$USE_RT" = 1 ]; then
      echo "uwaga: brak python3-websockets — grupa $g na starej sciezce virtual-time (sudo apt install python3-websockets)" >&2
    fi
    echo "=== grupa $g ==="
    timeout "${ARKTEST_TIMEOUT:-420}" "$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
      --virtual-time-budget="$BUDGET" \
      --dump-dom "http://127.0.0.1:$PORT/tests/empirical_driver.html?g=$g" >"$OUT" 2>"$LOG" || true
  fi
  grep -oE 'R\|(PASS|FAIL|INFO)\|[^<]*' "$OUT" || true
  SUM="$(grep -oE 'SUMMARY\|pass=[0-9]+\|fail=[0-9]+' "$OUT" | tail -1 || true)"
  echo "$SUM"
  if [ -z "$SUM" ]; then
    echo "BRAK SUMMARY — driver nie dopolnal (log chromium: $LOG zachowany do inspekcji)" >&2
    cp "$LOG" "tests/.empirical_chrome_${g}.log"
    FAILED=1
  elif ! echo "$SUM" | grep -q 'fail=0'; then
    FAILED=1
  fi
  echo
done

if [ "$FAILED" -eq 0 ]; then echo "=== EMPIRYCZNE: PASS ==="; else echo "=== EMPIRYCZNE: FAIL ===" >&2; exit 1; fi
