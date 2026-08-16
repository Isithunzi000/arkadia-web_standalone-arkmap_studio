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
node tests/dir_validation.js    # walidacja kierunków 1:1 z Delwing: złote przypadki + jednostkowe (wymaga fixture)
```

albo wszystkie naraz:

```bash
bash tests/run-all.sh
```

Kod wyjścia: 0 = wszystko OK, 1 = są FAIL-e, 2 = brak fixture.

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
