# Testy ArkMap Studio

Harnessy Node.js dla krytycznych ścieżek `arkmap_studio.html`. Powstały przy fixach audytowych
(A7–A17, szczegóły w dzienniku fixów) i służą jako regresja na przyszłość.

## Wymagania

- Node.js (bez zależności npm)
- repo sklonowane z historią git (snapshoty różnicowe pobierane przez `git show <hash>`)
- fixture `map_master3.dat` w katalogu głównym repo (dla `a7_readbuffer.js`, `dir_filter.js` i `transport.js`):
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

## Fixture

- `map_master3.dat` — produkcyjna mapa (release 0.205.0 z Delwing/arkadia-mapa),
  **untracked** (`.gitignore`), pobierana skryptem `fetch-fixture.sh`.
- `fixtures/tiny.png` — minimalny PNG 2×2 (79 B), commitowany, dla testów pixmapy.
