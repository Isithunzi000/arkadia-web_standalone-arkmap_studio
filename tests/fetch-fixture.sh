#!/bin/bash
# Pobiera fixture testowy map_master3.dat (produkcyjna mapa Arkadii z releases upstream).
# Plik jest untracked (.gitignore) — to dane testowe, nie część repo.
set -e
cd "$(dirname "$0")/.."
curl -sfL --retry 3 --connect-timeout 30 --max-time 180 -o map_master3.dat "https://github.com/Delwing/arkadia-mapa/releases/download/0.205.0/map_master3.dat"
echo "Pobrano map_master3.dat ($(stat -c%s map_master3.dat) B)"
