#!/bin/bash
# Uruchamia wszystkie harnessy testowe. Kod wyjścia: 0 = wszystkie przeszły.
set -e
cd "$(dirname "$0")/.."
FAILED=0
for t in tests/a12a14_undo_core.js tests/a13_delete_area.js tests/a7_readbuffer.js tests/a9_pixmap.js tests/dir_filter.js tests/transport.js tests/share_link.js tests/planner_ui.js tests/sync_map.js tests/dir_validation.js tests/transports_sync.js tests/converters_crc.js tests/delta.js tests/ui_strings.js tests/ci_workflow.js tests/tier2_state.js tests/tier3_format.js tests/tier4_hardening.js tests/tier5_audit.js tests/tier6_ux.js tests/diff_kalka.js tests/pwa.js tests/xss_sinks.js tests/malformed_dat.js tests/validate_full.js tests/universal_colors.js tests/checksums_v4.js tests/report_export.js tests/checksums/xxh3_golden.js tests/save_dialogs.js tests/fix_batch_v1445.js tests/suppressors_load.js tests/changelog_tags.js tests/perf_counters.js tests/raf_shim.js tests/empirical_runner.js tests/audit_ext.js; do
  echo "═══ $t ═══"
  node "$t" || FAILED=1
  echo
done
# Testy empiryczne .arkdelta (prawdziwa przegladarka headless + pelna aplikacja) — wymagany Chromium.
if [ -n "${CHROMIUM_BIN:-}" ] || command -v chromium >/dev/null 2>&1; then
  echo "═══ tests/empirical.sh ═══"
  # Hardening (2026-08-24, flake ea33f85): DOKLADNIE 1 retry kampanii glownej
  # wylacznie na sygnature CZYSTEJ zawiechy srodowiska (rc!=0 LUB BRAK SUMMARY)
  # **i zero linii R|FAIL w outpucie**. FAIL asercji nigdy nie jest retry'owany
  # ani maskowany — run od razu czerwieni (doktryna jak w bloku E15).
  CAMP_GROUPS="SMOKE E0 E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 E11 E12 E13 E14 E16 E17 E18 E19 E20 E21 E22 E23"
  CAMP_OUT="$(ARKTEST_GROUPS="$CAMP_GROUPS" ARKTEST_BUDGET=300000 ARKTEST_TIMEOUT=420 bash tests/empirical.sh 2>&1)" && CAMP_RC=0 || CAMP_RC=$?
  echo "$CAMP_OUT"
  if [ "$CAMP_RC" -ne 0 ] && ! printf '%s\n' "$CAMP_OUT" | grep -q 'R|FAIL'; then
    echo "kampania: czysta zawiecha (rc=$CAMP_RC, zero FAIL-i asercji) — 1 retry" >&2
    pkill -f '[c]hromium' 2>/dev/null || true; sleep 2
    CAMP_OUT="$(ARKTEST_GROUPS="$CAMP_GROUPS" ARKTEST_BUDGET=300000 ARKTEST_TIMEOUT=420 bash tests/empirical.sh 2>&1)" && CAMP_RC=0 || CAMP_RC=$?
    echo "$CAMP_OUT"
  fi
  [ "$CAMP_RC" -eq 0 ] || FAILED=1
  echo
  # E15 dedykowane (PWA/service worker): jedyna grupa czekajaca na REALNY cykl zycia SW.
  # Hardening 2026-08-24 (flake ea33f85): E15 jedzie na REALNYM zegarze przez CDP
  # (tests/empirical_run.py — routing w empirical.sh po ARKTEST_REALTIME), wiec
  # zrodlowe glodzenie SW pod virtual-time-budget (lekcja Arc 12 + faile CI
  # 34af1db/a543243/ea33f85) jest wyeliminowane; watchdog drivera (90 s) gwarantuje
  # SUMMARY nawet przy zawiesze. Retry 3x zostaje jako siatka na awarie srodowiska:
  # WYLACZNIE na zawieche (BRAK SUMMARY bez R|FAIL) — realny FAIL asercji
  # natychmiast czerwieni run, bez retry. Timeout 300 s/probe > watchdog 90 s
  # + boot runnera (zapas na obciazony host).
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
