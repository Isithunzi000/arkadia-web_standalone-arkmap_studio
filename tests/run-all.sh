#!/bin/bash
# Uruchamia wszystkie harnessy testowe. Kod wyjścia: 0 = wszystkie przeszły.
set -e
cd "$(dirname "$0")/.."
FAILED=0
for t in tests/a12a14_undo_core.js tests/a13_delete_area.js tests/a7_readbuffer.js tests/a9_pixmap.js tests/dir_filter.js tests/transport.js tests/share_link.js; do
  echo "═══ $t ═══"
  node "$t" || FAILED=1
  echo
done
if [ "$FAILED" -eq 0 ]; then echo "═══ WSZYSTKIE HARNESSY: PASS ═══"; else echo "═══ SĄ FAIL-E ═══"; exit 1; fi
