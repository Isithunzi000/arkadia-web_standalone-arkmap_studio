#!/bin/bash
# run_desktop.sh — filar "Mudlet desktop" mega-testu (W1/W2/W3 + RAM).
# Odpala binarke Mudleta z -platform offscreen na profilu "megatest"
# (tryb --offline — zero polaczen z gra), workload robi workload.lua
# wg manifestu z gen_manifest.mjs.
#
# Uzycie:  bash tests/megatest/desktop/run_desktop.sh <results_dir> [mudlet_bin]
#          (zwykle posrednio przez tests/megatest/run_megatest.sh)
# Binarka: argument, $MUDLET_BIN, ./squashfs-root/AppRun, ~/Mudlet*.AppImage,
#          ~/Applications/Mudlet*.AppImage, albo mudlet z PATH.
# Fallback: jesli offscreen padnie na starcie, a jest xvfb-run — jeden retry.
# Idempotentne: czysci swoje artefakty w <results_dir> przed startem,
# lock-file blokuje rownolegle uruchomienia, trap zdejmuje lock na wyjsciu.
set -u
cd "$(dirname "$0")/../../.."

RESULTS="${1:?uzycie: run_desktop.sh <results_dir> [mudlet_bin]}"
PROFILE="${MEGATEST_PROFILE:-megatest}"
BUDGET="${MEGATEST_BUDGET:-3600}"   # sufit czasu calego procesu (s)

MAN="$RESULTS/manifest.lua"
[ -f "$MAN" ] || { echo "BRAK $MAN — najpierw node tests/megatest/gen_manifest.mjs $RESULTS"; exit 2; }
mkdir -p "$RESULTS"

# --- binarka ---
BIN="${2:-${MUDLET_BIN:-}}"
if [ -z "$BIN" ]; then
  for cand in "$PWD/squashfs-root/AppRun" \
              "$HOME"/Mudlet*.AppImage \
              "$HOME"/Applications/Mudlet*.AppImage; do
    [ -x "$cand" ] && BIN="$cand" && break
  done
fi
[ -z "$BIN" ] && command -v mudlet >/dev/null && BIN="mudlet"
[ -n "$BIN" ] || { echo "BRAK binarki Mudleta — podaj MUDLET_BIN=/sciezka/Mudlet-4.22.0.AppImage"; exit 2; }
[ -x "$BIN" ] || [ "$BIN" = "mudlet" ] || { echo "binarka niewykonywalna: $BIN (chmod +x? AppImage bez FUSE: --appimage-extract i squashfs-root/AppRun)"; exit 2; }

# --- lock (mkdir jest atomowe) ---
LOCK="$RESULTS/.desktop.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "desktop juz dziala (lock: $LOCK) — poczekaj albo usun stary lock"; exit 3
fi
cleanup() { rm -rf "$LOCK"; [ -n "${SAMPLER:-}" ] && kill "$SAMPLER" 2>/dev/null || true; }
trap cleanup EXIT

# --- idempotentnosc: czyszczenie artefaktow fazy ---
rm -f "$RESULTS/results_desktop.jsonl" "$RESULTS/results_desktop.json" "$RESULTS/desktop.done" "$RESULTS/desktop.error" \
      "$RESULTS/desktop_stdout.log" "$RESULTS/ram_desktop.txt" "$RESULTS/workload_loaded.txt" "$RESULTS/sysload_fired.txt" "$RESULTS/checkpoints.txt"

export MEGATEST_MAN="$MAN"
export MEGATEST_OUT="$RESULTS"

echo "== mega-test: desktop =="
echo "binarka: $BIN"
echo "profil: $PROFILE (offline) | budzet: ${BUDGET}s | wyniki: $RESULTS"

# UWAGA: PID ustawiamy przez globalna APP_PID, NIE przez $(launch ...) —
# podstawienie polecenia uruchamia funkcje w podpowloce i wait w rodzicu
# nie zna takiego potomka ("nie jest potomkiem tej powloki", rc=127).
APP_PID=""
launch() {   # $1 = tryb: offscreen|xvfb
  if [ "$1" = "xvfb" ]; then
    timeout --signal=KILL "$BUDGET" xvfb-run -a "$BIN" --profile "$PROFILE" --offline --mirror \
      > "$RESULTS/desktop_stdout.log" 2>&1 &
  else
    timeout --signal=KILL "$BUDGET" "$BIN" -platform offscreen --profile "$PROFILE" --offline --mirror \
      > "$RESULTS/desktop_stdout.log" 2>&1 &
  fi
  APP_PID=$!
}

sample_ram() {   # $1 = pid rodzica; peak VmHWM procesu i dzieci "mudlet"
  local parent=$1 peak=0 cur pid
  sleep 3
  while kill -0 "$parent" 2>/dev/null; do
    for pid in $parent $(pgrep -x mudlet 2>/dev/null); do
      cur=$(awk '/VmHWM/{print $2}' "/proc/$pid/status" 2>/dev/null)
      [ -n "${cur:-}" ] && [ "$cur" -gt "$peak" ] && peak=$cur
    done
    sleep 1
  done
  echo "{\"vmhwm_peak_mb\":$(( peak / 1024 ))}" > "$RESULTS/ram_desktop.txt"
}

launch offscreen
sample_ram "$APP_PID" & SAMPLER=$!
wait "$APP_PID"; RC=$?

# Fallback: offscreen nie wstal (typowy log Qt o platform plugin; AppImage
# Mudleta 4.22 NIE zawiera wtyczki offscreen — tylko xcb) — retry przez xvfb.
if [ ! -f "$RESULTS/desktop.done" ] && [ ! -f "$RESULTS/desktop.error" ] \
   && grep -qiE 'platform plugin|could not load|offscreen' "$RESULTS/desktop_stdout.log" 2>/dev/null; then
  if command -v xvfb-run >/dev/null; then
    echo "offscreen nie wstal (AppImage ma tylko wtyczke xcb) — fallback: xvfb-run -a"
    kill "$SAMPLER" 2>/dev/null; wait "$SAMPLER" 2>/dev/null; SAMPLER=""
    rm -f "$RESULTS/results_desktop.jsonl" "$RESULTS/results_desktop.json" "$RESULTS/desktop_stdout.log" "$RESULTS/ram_desktop.txt" "$RESULTS/checkpoints.txt"
    launch xvfb
    sample_ram "$APP_PID" & SAMPLER=$!
    wait "$APP_PID"; RC=$?
  else
    echo "UWAGA: AppImage nie ma wtyczki offscreen, a xvfb-run nie jest zainstalowany."
    echo "       Do fazy desktop potrzebne: sudo apt install -y xvfb"
  fi
fi

sleep 2  # sampler potrzebuje chwili, zeby dopisac ram_desktop.txt po smierci procesu
kill "$SAMPLER" 2>/dev/null; wait "$SAMPLER" 2>/dev/null; SAMPLER=""

# --- klasyfikacja ---
if [ -f "$RESULTS/desktop.done" ] && [ -f "$RESULTS/results_desktop.json" ]; then
  echo "✓ desktop OK — $(wc -l < "$RESULTS/results_desktop.jsonl") wierszy, wynik: results_desktop.json"
  [ -f "$RESULTS/ram_desktop.txt" ] && echo "  RAM: $(cat "$RESULTS/ram_desktop.txt")"
  exit 0
fi
if [ "$RC" -eq 124 ] || [ "$RC" -eq 137 ]; then
  echo "✗ desktop CRASH: timeout ${BUDGET}s (rc=$RC)"; exit 1
fi
if [ -f "$RESULTS/desktop.error" ]; then
  echo "✗ desktop ERROR: $(cat "$RESULTS/desktop.error")"; exit 1
fi
echo "✗ desktop CRASH: brak desktop.done (rc=$RC) — log: $RESULTS/desktop_stdout.log | checkpointy: $RESULTS/checkpoints.txt"
tail -5 "$RESULTS/desktop_stdout.log" 2>/dev/null
exit 1
