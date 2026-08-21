# Testy ArkMap Studio

Harnessy Node.js dla krytycznych ścieżek `arkmap_studio.html`. Powstały przy fixach audytowych
(A7–A17, szczegóły w dzienniku fixów) i służą jako regresja na przyszłość.

## Wymagania

- Node.js (bez zależności npm)
- repo sklonowane z historią git (snapshoty różnicowe pobierane przez `git show <hash>`)
- fixture `map_master3.dat` w katalogu głównym repo (dla `a7_readbuffer.js`, `dir_filter.js`, `transport.js`, `sync_map.js` i `dir_validation.js`):
  ```bash
  bash tests/fetch-fixture.sh
  ```

## Uruchamianie

Z katalogu głównego repo:

```bash
node tests/a12a14_undo_core.js    # undo: guard ADD_EXIT + prevExit, undo ADD_ROOM bez kasowania wyjść
node tests/a13_delete_area.js     # undo DELETE_AREA: puste kontenery nagrywane i odtwarzane
node tests/a7_readbuffer.js       # ReadBuffer: kontrolowany błąd zamiast RangeError (wymaga fixture)
node tests/a9_pixmap.js           # readQPixMap: parsowanie chunków PNG zamiast skanowania IEND
node tests/dir_filter.js        # planer: filtr kierunków kardynalne/+pionowe/wszystkie (wymaga fixture)
node tests/transport.js         # planer: statki/dyliżanse — wirtualne krawędzie, kary, hopy (wymaga fixture)
node tests/share_link.js        # planer: share-linki ARKMAP2 — 18 permutacji round-trip + ścisła walidacja
node tests/planner_ui.js        # planer UX: podświetlenia przełączników, sąsiedztwo transportów (dwuklik), struktura CSS/HTML
node tests/sync_map.js          # sync mapy online: tools/dat2arkmap.mjs na fixture (wymaga fixture)
node tests/converters_crc.js    # zbieznosc CRC .dat→.arkmap→applyMap→zapis — fundament base.crc kalki (wymaga fixture)
node tests/dir_validation.js    # walidacja kierunków 1:1 z Delwing: złote przypadki + jednostkowe (wymaga fixture)
node tests/transports_sync.js   # sync transportów: bramka semantyczna generatora — etykiety przystanków, fail-closed
node tests/ui_strings.js        # watchdog jezyka UI: zero zargonu (payload/checksum/op/seq) w komunikatach
node tests/ci_workflow.js       # watchdog CI: cache Playwright + sufit timeoutu + pinning w ci-tests.yml
node tests/tier2_state.js       # Tier 2 (v1.37.0): dirty-guard K2/K3, rename SE Q4, W10/W11/W12 + strazniki
node tests/tier3_format.js     # Tier 3 (v1.38.0): CRC v2 W3, hidden/symbolColor W4/Q2, piksmapy W9, cap W17, granica sesji W18
node tests/tier4_hardening.js  # Tier 4 (v1.39.0): walidator kalki K6/K7/S8, kodek .dat W1/W2, C-K5 reszta wg P2, C-locks, S7 undo, W6/W8 planer, piny P1/P3
node tests/tier5_audit.js     # Tier 5 (v1.40.0): fixy audytu AI — __proto__-safe mapy (F1), backlink room.area (F2), suppressor przy addExit (F3), rp-env pendingEnv (F4), placeCtx sid-area + spojnosc classify/apply (F5)
node tests/tier6_ux.js       # Tier 6 (v1.41.0): UX — dirty przy re-wejsciu (D1), Przywroc-ostatni-zapis + bufor pristineArkmap (D2-c), wiazania dlg-unsaved-exit przy uspionym GitHub (D4), bramka importu trasy (#18), touch w canvasMode (#8); empiria: grupa E12
node tests/delta.js          # ARKDELTA: deltaLog, applyDelta/classifyDelta, buildDelta, semantyka sid/id, piny wersji
node tests/diff_kalka.js    # F1 (v1.42.0): generator kalki z diffu map — klasyfikacja zmian, kolejnosc topologiczna, straznicy, piny UI; empiria: grupa E13
node tests/pwa.js            # PWA (v1.43.0): manifest, ikony, rejestracja no-op SW, straznik zakazu cache/fetch
node tests/xss_sinks.js      # XSS (v1.43.1): escHtml na interpolacjach danych z pliku (showRoomInfo, dlg-refs-list)
node tests/malformed_dat.js  # negatywne .dat: obciecia, granice readQString, uszkodzone chunki pixmapy
node tests/validate_full.js  # walidator .arkmap: validateFont/UserData/Label/Area/top-level
node tests/universal_colors.js # uniwersalne kolory (v1.43.3): detekcja Arkadii, golden 51 envId, mapa obca
```

albo wszystkie naraz:

```bash
bash tests/run-all.sh
```

Kod wyjścia: 0 = wszystko OK, 1 = są FAIL-e, 2 = brak fixture.

## Testy empiryczne (prawdziwa przeglądarka)

Oprócz harnessów Node.js regresja obejmuje testy empiryczne: `tests/empirical.sh` odpala
pełną aplikację w headless Chromium (driver: `tests/empirical_driver.html` — iframe z
`arkmap_studio.html`, scenariusze przez eval) i wykonuje scenariusze pogrupowane w
`SMOKE` oraz `E0`–`E18` (m.in. kalka .arkdelta end-to-end, generator kalki z diffu map, roundtrip .dat, planer,
walidacja kierunków, UI, syntetyczne zdarzenia dotyku, a także: PWA runtime (E15), eksport PNG/SVG przez
prawdziwe UI (E16), serializacja pobrań online (E17), uniwersalne kolory dla map spoza Arkadii (E18)).
`run-all.sh` odpala je automatycznie po harnessach Node.js.

```bash
ARKTEST_GROUPS="SMOKE E0 E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 E11 E12 E13 E14 E15 E16 E17 E18" \
ARKTEST_BUDGET=300000 ARKTEST_TIMEOUT=420 bash tests/empirical.sh
```

Zmienne: `ARKTEST_GROUPS` (domyślnie `SMOKE`), `ARKTEST_BUDGET` (budżet virtual-time
przeglądarki, ms), `ARKTEST_TIMEOUT` (limit sekund na grupę, domyślnie 420),
`CHROMIUM_BIN`, `ARKTEST_PORT`. Wymaga fixture `map_master3.dat` (pobierany
automatycznie przez `fetch-fixture.sh`). Wyniki: linie `R|PASS|...` / `R|FAIL|...`
+ `SUMMARY|pass=N|fail=M` per grupa.

## CI

Workflow `.github/workflows/ci-tests.yml` odpala **pełną regresję automatycznie na każdy
push do main** (w tym automatyczne commity sond sync-map/sync-transports): checkout z pełną
historią (testy różnicowe robią `git show`), fixture pobierany przez `fetch-fixture.sh`
(przypięty release 0.205.0), timeouty na pobranie i regresję. Czerwony run = commit
coś złamał — bramka semantyczna generatora transportów to osobna, wcześniejsza linia obrony.

## Jak to działa

- Harnessy **wyekstrahowują kod verbatim** z `arkmap_studio.html` kotwicami tekstowymi
  (`extract()` + liczenie klamer) i wykonują go w `new Function` ze stubami DOM/stanu.
  Żadnych numerów linii — kotwice muszą występować dokładnie raz.
- Testy różnicowe porównują zachowanie z kodem sprzed fixa, pobieranym przez
  `git show <commit>:arkmap_studio.html` (hashe zapisane w nagłówkach plików).
- **Liczniki kotwic** (sekcje „T5/T6/T8") są przypięte do bieżącego stanu kodu —
  gdy świadomie zmieniasz odpowiedni fragment, zaktualizuj też oczekiwania w harnessie.
  To celowe: liczniki wykrywają niezapowiedziany drift.

## Walidacja E2E na silniku Mudlet (mudix) — procedura ręczna

Harnessy powyżej sprawdzają konwerter `.dat` ↔ `.arkmap` statycznie. Ostateczny test —
załadowanie naszego eksportu w **prawdziwym silniku Mudlet (WASM)** — wykonuje się ręcznie
przez Mudlet Web: https://delwing.github.io/mudix/ (legacy deployment; rozwój przeniesiony
do Mudlet/mudlet-web).

1. Wygeneruj eksport: w edytorze „Zapisz jako Mudlet .dat" (albo użyj fixture).
2. Wystaw plik pod publicznym URL-em z CORS — najprościej scratch-branch w tym repo
   i adres `raw.githubusercontent.com/.../plik.dat` (CORS `*`).
3. W mudix utwórz profil — działa offline, bez połączenia z MUD-em. Alias `lua`
   pochodzi z preinstalowanego pakietu run-lua-code.
4. W command line:
   - `lua downloadFile('test.dat', '<url>')` → `true`
   - `lua loadMap('test.dat')` → `true`
   - liczba obszarów/pokoi: pętla po `getAreaTable()` — **uwaga: zwraca mapę
     nazwa→id, iteruj po wartościach**; złoty wynik: **60 area / 26988 pokoi**
   - spot-check: `getRoomExits(746)` → `south:47, east:2206, north:747`;
     `getRoomName(746)` → „Placyk w centrum miasta, Bialy Most # Woz Oxenfurt - Wyzima"
5. Kontrola wizualna: widok Map renderuje obszar (np. Wyzima, ID 1).
6. Sprzątanie: usuń scratch-branch z remote.

Uwagi:

- Błędy `generic_mapper` w konsoli mudix są niezwiązane z mapą (profil offline).
- Szybka alternatywa bez przeglądarki: cross-check parserem npm
  `mudlet-map-binary-reader` (ESM-only; `readMapFromBuffer(Uint8Array)` — nie
  ArrayBuffer) — odczyt oryginału i naszego eksportu musi być identyczny.

## Fixture

- `map_master3.dat` — produkcyjna mapa (release 0.205.0 z Delwing/arkadia-mapa),
  **untracked** (`.gitignore`), pobierana skryptem `fetch-fixture.sh`.
- `fixtures/tiny.png` — minimalny PNG 2×2 (79 B), commitowany, dla testów pixmapy.
