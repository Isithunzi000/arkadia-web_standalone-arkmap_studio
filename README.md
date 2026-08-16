# ArkMap Studio

Samowystarczalna aplikacja przeglądarkowa do podglądu i edycji map gry MUD **Arkadia** — jeden plik HTML, zero zależności, działa też lokalnie i na telefonie.

## Link do aplikacji (GitHub Pages)

**https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/**

## Co to robi

- **Podgląd i edycja mapy Arkadii** — pokoje, wyjścia, etykiety, poziomy, kolory, wyszukiwanie, drag & drop, undo/redo.
- **Import i eksport Mudlet `.dat`** — binarna zgodność z formatem map Mudleta w obie strony.
- **Własny format `.arkmap`** — czytelny JSON przyjazny gitowi (stabilna serializacja, sumy kontrolne CRC).
- **Działa offline** — mapa trzymana lokalnie w przeglądarce, zapis do pliku na dysku.

## Dokumentacja

- [Instrukcja obsługi](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkmap_manual.html)
- [Specyfikacja formatu `.arkmap`](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkmap_spec.html)

## Testy

Harnessy regresyjne Node.js w katalogu [`tests/`](tests/) — szczegóły w [tests/README.md](tests/README.md).

## Licencja

[MIT](LICENSE)
