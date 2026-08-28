# ArkMap Studio

Samowystarczalna aplikacja przeglądarkowa do podglądu i edycji map gry MUD **Arkadia** — jeden plik HTML, zero zależności, działa też lokalnie i na telefonie.

## Link do aplikacji (GitHub Pages)

**https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/**

## Co to robi

- **Podgląd i edycja mapy Arkadii** — pokoje, wyjścia, etykiety, poziomy, kolory, wyszukiwanie, drag & drop, undo/redo.
- **Uniwersalność** — otwiera też mapy Mudlet (v17–22) z dowolnego MUD-a: Arkadia jest rozpoznawana automatycznie, mapy obce renderują się z domyślnej palety ANSI i kolorów zapisanych w pliku (1:1 z oficjalnym rendererem Mudleta).
- **Import i eksport Mudlet `.dat`** — binarna zgodność z formatem map Mudleta w obie strony.
- **Własny format `.arkmap`** — czytelny JSON przyjazny gitowi (stabilna serializacja, sumy kontrolne XXH3-64).
- **Kalka zmian `.arkdelta`** — zapisuj same swoje edycje (z sesji albo z różnicy dwóch map) i nanieś je na nowszą wersję mapy upstream przez recenzję z wykrywaniem konfliktów — bez wysyłania całej mapy.
- **Działa offline** — mapa trzymana lokalnie w przeglądarce, zapis do pliku na dysku. **Instalowalna jako aplikacja (PWA)** — ikona na pulpicie/ekranie telefonu, zero cache'owania (no-op service worker).
- **Mapa online** — przycisk „🌐 Pobierz mapę online…" pobiera z gałęzi `mapa` tego repo automatycznie synchronizowane lustro mapy z Delwing/arkadia-mapa (workflow `sync-map.yml`, 2× dziennie), jako `.arkmap` lub `.dat`.

## Dokumentacja

- [Instrukcja obsługi](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkmap_manual.html)
- [Specyfikacja formatu `.arkmap`](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkmap_spec.html)
- [Specyfikacja formatu `.arkdelta`](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkdelta_spec.html) — kalka zmian edycyjnych
- [Raport wydajności](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/perf_report.html) — benchmark `.dat` vs `.arkmap` i stress test renderera (perf lab, [`tests/perf/`](tests/perf/))
  - Przebiegi: [2026-08-22 (silnik v3)](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/raport_wydajnosci_2026-08-22.html), [2026-08-23 (silnik v4)](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/raport_wydajnosci_2026-08-23.html), [2026-08-26 (v1.49.6, silnik v4)](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/raport_wydajnosci_2026-08-26.html), [2026-08-27 (v1.49.7 + fala E)](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/raport_wydajnosci_2026-08-27.html)
  - Porównania: [08-21 vs 08-22](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/porownanie_wydajnosci_2026-08-21_vs_2026-08-22.html), [08-22 vs 08-23](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/porownanie_wydajnosci_2026-08-23.html), [08-23 vs 08-26](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/porownanie_wydajnosci_2026-08-26.html), [08-26 vs 08-27](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/porownanie_wydajnosci_2026-08-27.html)
- [Mega-test silników map — 2026-08-28](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/megatest_raport_2026-08-28.html) — jedna drabinka (27k–432k pokoi): silniki (ArkMap Node, czytnik mudlet-web, Mudlet desktop) + natywne apki w headless Chromium (prawdziwe UI ArkMap Studio vs oryginalny pipeline npm `mudlet-map-renderer`, Mudlet desktop AppImage); wczytanie + pathfinding + przeszukanie + iteracja + pamięć; deterministyczne 100 par pokoi i 3 frazy (seed), 5 przebiegów, jedna maszyna i jedna sesja. Wyróżniki: pełna zgodność found z desktopem na każdym szczeblu; podwójny pomiar wczytania (load + verified — weryfikacja sum kontrolnych dzieje się w tle po pierwszej klatce i nie blokuje UI); gate kosztowy zielony na 101 parach (nasz A\* zawsze równy kosztowo naszemu Dijkstrze, ich A\* nigdy tańszy poza trasami przez locki, które ich silnik ignoruje); A\* ArkMap najszybszy od ~54k pokoi w górę (432k: 248 ms vs 1733 ms ich A\*; na 27k ich A\* minimalnie szybszy: 596 vs 768 ms); szukajka z indeksem tokenowym: 15 ms na 432k pokoi; ujawniony natywny limit stacku mudlet-web — powyżej 50k pokoi czytnik przechodzi w tryb skeleton z pustym `getRooms()`, więc ich pathfinding i iteracja są tam niedostępne ([`tests/megatest/`](tests/megatest/))
- [Changelog](CHANGELOG.md) — dziennik zmian projektu

## Testy

Harnessy regresyjne Node.js w katalogu [`tests/`](tests/) — szczegóły w [tests/README.md](tests/README.md). Pełna regresja biegnie też automatycznie w CI na każdy push do main (workflow `ci-tests.yml`).

## Licencja

[MIT](LICENSE) · atrybucje zasobów zewnętrznych: [NOTICE](NOTICE.md)
