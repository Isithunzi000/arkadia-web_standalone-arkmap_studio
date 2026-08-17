#!/bin/bash
# Testy empiryczne .arkdelta — prawdziwa przegladarka (Chromium headless) + pelna aplikacja.
# Driver: tests/empirical_driver.html (iframe z arkmap_studio.html, scenariusze przez eval).
# Wyniki: linie "R|PASS|id|msg" / "R|FAIL|id|msg" + "SUMMARY|pass=N|fail=M" z dumpowanego DOM.
# Zmienne: ARKTEST_GROUPS (domyslnie SMOKE), ARKTEST_BUDGET (ms virtual-time),
#          CHROMIUM_BIN (domyslnie chromium), ARKTEST_PORT.
set -e
cd "$(dirname "$0")/.."
[ -f map_master3.dat ] || bash tests/fetch-fixture.sh

PORT="${ARKTEST_PORT:-18137}"
CHROME="${CHROMIUM_BIN:-chromium}"
GRPS="${ARKTEST_GROUPS:-SMOKE}"
BUDGET="${ARKTEST_BUDGET:-90000}"
OUT="$(mktemp)"; LOG="$(mktemp)"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true; rm -f "$OUT" "$LOG"' EXIT
sleep 1

FAILED=0
for g in $GRPS; do
  echo "=== grupa $g ==="
  timeout "${ARKTEST_TIMEOUT:-420}" "$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --virtual-time-budget="$BUDGET" \
    --dump-dom "http://127.0.0.1:$PORT/tests/empirical_driver.html?g=$g" >"$OUT" 2>"$LOG" || true
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
