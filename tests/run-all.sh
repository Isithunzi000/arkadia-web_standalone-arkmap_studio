#!/bin/bash
# Uruchamia wszystkie harnessy testowe. Kod wyjścia: 0 = wszystkie przeszły.
set -e
cd "$(dirname "$0")/.."
FAILED=0
for t in tests/a12a14_undo_core.js tests/a13_delete_area.js tests/a7_readbuffer.js tests/a9_pixmap.js tests/dir_filter.js tests/transport.js tests/share_link.js tests/planner_ui.js tests/sync_map.js tests/dir_validation.js tests/transports_sync.js tests/converters_crc.js tests/delta.js tests/ui_strings.js tests/ci_workflow.js tests/tier2_state.js tests/tier3_format.js tests/tier4_hardening.js tests/tier5_audit.js tests/tier6_ux.js tests/diff_kalka.js tests/pwa.js tests/xss_sinks.js tests/malformed_dat.js tests/validate_full.js; do
  echo "═══ $t ═══"
  node "$t" || FAILED=1
  echo
done
# Testy empiryczne .arkdelta (prawdziwa przegladarka headless + pelna aplikacja) — wymagany Chromium.
if [ -n "${CHROMIUM_BIN:-}" ] || command -v chromium >/dev/null 2>&1; then
  echo "═══ tests/empirical.sh ═══"
  ARKTEST_GROUPS="SMOKE E0 E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 E11 E12 E13 E14 E16 E17 E18" ARKTEST_BUDGET=300000 ARKTEST_TIMEOUT=420 bash tests/empirical.sh || FAILED=1
  echo
  # E15 dedykowane (PWA/service worker): jedyna grupa czekajaca na REALNY cykl zycia SW,
  # ktory pod virtual-time-budget potrafi zaglodzic na obciazonym hoscie (lekcja Arc 12 +
  # faile CI 34af1db/a543243 — BRAK SUMMARY przy zerze FAIL-i asercji). Dlatego: osobny run
  # z budzetem x2 i do 3 prob. Retry WYLACZNIE na zawieche (BRAK SUMMARY bez R|FAIL) —
  # realny FAIL asercji natychmiast czerwieni run, bez retry. Timeout 300 s/probe, zeby
  # pesymistyczne 3x zawiechy (~15 min) z reszta regresji zmiescily sie w limicie CI 1380 s.
  echo "═══ tests/empirical.sh (E15 dedykowane, retry na zawieche) ═══"
  E15_OK=0
  for attempt in 1 2 3; do
    E15_OUT="$(ARKTEST_GROUPS="E15" ARKTEST_BUDGET=600000 ARKTEST_TIMEOUT=300 bash tests/empirical.sh 2>&1)" && E15_RC=0 || E15_RC=$?
    echo "$E15_OUT"
    if echo "$E15_OUT" | grep -q 'R|FAIL'; then
      echo "E15: realny FAIL asercji — bez retry" >&2; FAILED=1; break
    elif [ "$E15_RC" -eq 0 ]; then
      E15_OK=1; break
    elif echo "$E15_OUT" | grep -q 'BRAK SUMMARY'; then
      echo "E15: zawiecha (proba $attempt/3) — sprzatam i powtarzam" >&2
      pkill -f '[c]hromium' 2>/dev/null || true; sleep 2
    else
      echo "E15: nieoczekiwany blad (rc=$E15_RC) — bez retry" >&2; FAILED=1; break
    fi
  done
  if [ "$E15_OK" -eq 0 ] && [ "$FAILED" -eq 0 ]; then
    echo "E15: 3x zawiecha (flake srodowiska?) — sprawdz tests/.empirical_chrome_E15.log" >&2; FAILED=1
  fi
  echo
else
  echo "═══ tests/empirical.sh: SKIP (brak Chromium — podaj CHROMIUM_BIN albo doinstaluj chromium) ═══"
fi
if [ "$FAILED" -eq 0 ]; then echo "═══ WSZYSTKIE HARNESSY: PASS ═══"; else echo "═══ SĄ FAIL-E ═══"; exit 1; fi
