#!/bin/bash
# inputs.sh — przygotowanie wspolnych danych wejsciowych mega-testu.
# Reuzywa generatorow perf labu (zero duplikacji kodu silnikow):
#   map_master3.dat          <- tests/fetch-fixture.sh (untracked)
#   tests/perf/out/base.arkmap      <- tools/dat2arkmap.mjs
#   tests/perf/out/stress_Kk.{arkmap,dat} <- tests/perf/gen_stress.mjs
# Idempotentne: istniejace pliki zostaja, brakujace sa dogenerowywane.
# K=32: .dat swiadomie NIE powstaje (OOM generatora — udokumentowany limit);
# brak stress_32k.dat to stan oczekiwany, nie blad.
set -u
cd "$(dirname "$0")/../.."
OUT=tests/perf/out

RAM_MB=$(free -m | awk 'NR==2{print $2}')   # NR==2 = odpornosc na locale
AUTO_HEAP=$(( RAM_MB / 2 )); [ "$AUTO_HEAP" -gt 6144 ] && AUTO_HEAP=6144
[ "$AUTO_HEAP" -lt 2048 ] && AUTO_HEAP=2048
HEAP="${HEAP:-$AUTO_HEAP}"

echo "== mega-test: inputs (heap Node ${HEAP} MB) =="
command -v node >/dev/null || { echo "BRAK node — sudo apt install nodejs"; exit 2; }
[ -f map_master3.dat ] || { echo "pobieram fixture…"; bash tests/fetch-fixture.sh || exit 1; }
mkdir -p "$OUT"

if [ ! -f "$OUT/base.arkmap" ]; then
  echo "— base.arkmap z map_master3.dat —"
  node tools/dat2arkmap.mjs map_master3.dat "$OUT/base.arkmap" || exit 1
fi

for K in 2 4 8 16 32; do
  if [ -f "$OUT/stress_${K}k.arkmap" ] && { [ -f "$OUT/stress_${K}k.dat" ] || [ "$K" -eq 32 ]; }; then
    continue   # komplet (dla K=32 wystarczy .arkmap — .dat to znany limit)
  fi
  echo "— stress_${K}k —"
  node --max-old-space-size="$HEAP" tests/perf/gen_stress.mjs "$OUT/base.arkmap" "$OUT" "$K" \
    || { echo "K=$K przerwane — stop drabinki (starsze K zostaja)"; break; }
done

ls -la "$OUT"
echo "✓ inputs gotowe"
