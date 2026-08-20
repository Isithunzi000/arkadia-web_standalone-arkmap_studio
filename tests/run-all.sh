#!/bin/bash
# Uruchamia wszystkie harnessy testowe. Kod wyjścia: 0 = wszystkie przeszły.
set -e
cd "$(dirname "$0")/.."
FAILED=0
for t in tests/a12a14_undo_core.js tests/a13_delete_area.js tests/a7_readbuffer.js tests/a9_pixmap.js tests/dir_filter.js tests/transport.js tests/share_link.js tests/planner_ui.js tests/sync_map.js tests/dir_validation.js tests/transports_sync.js tests/converters_crc.js tests/delta.js tests/ui_strings.js tests/ci_workflow.js tests/tier2_state.js tests/tier3_format.js tests/tier4_hardening.js tests/tier5_audit.js tests/tier6_ux.js tests/diff_kalka.js; do
  echo "═══ $t ═══"
  node "$t" || FAILED=1
  echo
done
# Testy empiryczne .arkdelta (prawdziwa przegladarka headless + pelna aplikacja) — wymagany Chromium.
if [ -n "${CHROMIUM_BIN:-}" ] || command -v chromium >/dev/null 2>&1; then
  echo "═══ tests/empirical.sh ═══"
  ARKTEST_GROUPS="SMOKE E0 E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 E11 E12 E13 E14" ARKTEST_BUDGET=300000 ARKTEST_TIMEOUT=420 bash tests/empirical.sh || FAILED=1
  echo
else
  echo "═══ tests/empirical.sh: SKIP (brak Chromium — podaj CHROMIUM_BIN albo doinstaluj chromium) ═══"
fi
if [ "$FAILED" -eq 0 ]; then echo "═══ WSZYSTKIE HARNESSY: PASS ═══"; else echo "═══ SĄ FAIL-E ═══"; exit 1; fi
