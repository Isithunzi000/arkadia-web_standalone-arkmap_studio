# Changelog — ArkMap Studio

Dziennik zmian projektu: fixy z audytu (A1–A22), nowe funkcje, automatyka repo. Najnowsze wpisy na górze.

## v1.45.0 — silnik sum v4, kalka na XXH3-64, raporty diagnostyczne (Arc 20)

Trzy powiazane watki z polishment-audytu silnika: szczelniejszy zakres sum
kontrolnych .arkmap, unifikacja hashy kalki z silnikiem .arkmap i jednolity
eksport raportow diagnostycznych. Bez migracji wstecznej (brak uzytkownikow
formatow posrednich): stare algorytmy i stare wersje kalki sa glosno
odrzucane, zapis przelicza wszystko do nowych formatow.

**Silnik sum .arkmap v4** (zastepuje v3 z v1.44.x):

- Zakres rozszerzony o luki v3: kanal alfa kolorow etykiet (licznik +
  wszystkie kanaly), pola obszaru grid_mode/is_zone/zone_area_ref/pos,
  pole room.hash (identyfikator upstream).
- Prefixy domenowe r4/a4/f4; suma pliku bez globalnego rollupu pokoi
  (redundantny wzgledem rollupow obszarowych).
- verifyChecksums NIGDY nie rzuca: uszkodzone dane -> verifyError, a glos
  ma walidacja strukturalna (sciezka zapisu celowo zostaje fail-loud).
- alg inny niz v4 -> glosny algMismatch (ok:false). Cichy skip bylby
  dziura downgrade'owa: plik ze starymi sumami wygladalby na plik bez sum.
- Nowe listy diagnostyczne: missingAreas, extraRooms, extraAreas
  (sieroty wpisow sum bez obiektow) — kazda niezgodnosc slownikow to
  ok:false.
- Jedno liczenie na wczytanie: verify zwraca computed, ktore reuzywa
  _computeBaseInfo (bez klonu i sortowan — enkoder jest read-only).
- Straznik _CanonBuf: zagniezdzony reset rzuca zamiast cicho psuc bufor.
- Walidator: area.pos musi byc tablica 3 liczb calkowitych (luka).
- Spec normatywny: tests/checksums/CANONICAL_V4.md (zastepuje V3);
  oracle tests/checksums/oracle_v4.py + vectors_v4.json.

**Kalka .arkdelta format_version 2:**

- Sumy kalki zmigrowane z CRC-32 (8 hex) na XXH3-64 (16 hex) nad ta sama
  kanonizacja stableStringify — wspolny helper _deltaChecksums dla
  buildera i walidatora; CRC32_TABLE/crc32str usuniete z aplikacji.
- Pliki kalki v1 glosno odrzucane (bez migracji — kalke tworzy sie
  ponownie); komunikat podaje obslugiwana wersje.
- tests/fixture_demo.arkdelta przeliczone do formatu v2.

**Raporty diagnostyczne (jednolita regula):**

- Kazda lista diagnostyczna ma eksport „Kopiuj do schowka" + „Zapisz
  jako .md" wspolnym builderem buildDiagnosticsReport (Markdown;
  deterministyczny poza data ISO w naglowku; pelne listy bez obciec
  widoku; puste sekcje jako „(brak)").
- Dialog walidacji pliku: „📋 Kopiuj raport" + „⬇ Zapisz raport .md"
  (raport-diagnostyki-<mapa>-<ts>.md) — bledy, ostrzezenia, pelne
  szczegoly sum kontrolnych (badAreas/badRooms/missing/extra/algMismatch).
- Panel recenzji kalki: „📋 Kopiuj podsumowanie" + „⬇ Zapisz raport .md"
  (raport-recenzji-<mapa>-<ts>.md) — liczniki klas + wszystkie operacje
  z klasyfikacja, notatkami i diffami.
- Walidacja kierunkow miala eksport wczesniej (bez zmian; PNG zostaje
  tylko tam). Regula udokumentowana w tests/README.md.

**Testy i CI:**

- Nowe harnessy: tests/checksums_v4.js (oracle, korupcje, zakres v4,
  algMismatch, macierz no-throw, straznik bufora) i tests/report_export.js
  (struktura md, pelne listy, regula kompletnosci powierzchni).
- Zmigrowane: tier3_format, tier4_hardening, delta, sync_map,
  empirical_driver (E9.crc-v4-export), xxh3_golden, save_dialogs i inne
  piny wersji; run-all.sh.
- sync-map.yml: self-check lustra ekstrahuje blok CANONICAL-V4.
- docs: arkmap_spec §15 (alg v4), arkdelta_spec (format 2, XXH3-64,
  glosny odrzut v1), arkmap_manual (raporty, algMismatch).

## Korekta dokumentacji (2026-08-23, bez zmian w kodzie)

Audyt aktualnosci calej dokumentacji wzgledem kodu v1.44.5 wykryl 11 rozjazdow;
wszystkie poprawione wylacznie w tekstach (aplikacja bez zmian, wersja zostaje):

- tests/README.md: grupy empiryczne E0–E18 -> E0–E21 (opisy E19/E20/E21),
  przykladowa komenda ARKTEST_GROUPS zgodna z run-all.sh (E15 dedykowane),
  wiszaca referencja „dziennik fixow" -> CHANGELOG.md.
- NOTICE.md: synchronizacja lustra „codziennie" -> 2x dziennie (sync-map.yml).
- tests/checksums/CANONICAL_V3.md §4: zakres hasha obszaru opisany zgodnie
  z kodem (grid_mode/is_zone/zone_area_ref/pos poza hashem; notka o v2).
- docs/arkmap_spec.html: §14.1 team_follow_link dzielone na PIERWSZYM `*`
  (1:1 z klientem arkadia-web, jak w kodzie); §15 — precyzyjny zakres hasha
  obszaru zamiast zbyt szerokiego „everything except rooms".
- docs/arkdelta_spec.html §1: brama bazy nie odrzuca — mismatch to dialog
  informacyjny z mozliwoscia kontynuacji (spojne z §4).
- docs/arkmap_manual.html: symbol dowolnej dlugosci (nie „max 2 znaki");
  41 linii transportowych (27 statkow + 14 ladowych, nie 28/13); eksport .dat
  dziala takze w trybie edycji (nie „wymaga wyjscia").

## v1.44.5 — fixy z audytu zewnetrznego Arc 26 + kosmetyka z Arc 25 (R1, K1, K2, K3)

Jeden realny defekt i trzy pozycje kosmetyczne — wszystkie z audytu zewnetrznego
dwoma silnikami (Arc 25: 60 findings -> 0 realnych; Arc 26: 91 findings -> 1 realny).
Audyt Arc 26 domknal pokrycie: cala powierzchnia aplikacji (520 funkcji) zostala
przeaudytowana zewnetrznie; nieaudytowana pozostaje wylacznie uspiona integracja
GitHub (swiadomie nietknieta).

- R1 (realny): startClDrawingExisting nie ustawialo state.clRoom — edycja punktow
  istniejacej custom line na canvasie byla martwa (drawCLInProgress i
  commitCLDrawing odrzucaly przez guard clRoom). Fix: jedna linia.
- K1: saveWithDialog — guard na null z dataFn (np. toBlob) w obu galeziach
  (FSAPI + fallback): toast bledu zamiast zapisu pliku o tresci „null".
- K2: handlery odczytu plikow (fiArkmap, drag&drop, fiArkdelta) — rejection
  file.text() konczy sie toastem z nazwa pliku zamiast ciszy w konsoli.
- K3: hideExitDetail czysci tez state._activeSpecialExit — podswietlenie
  wyjscia specjalnego nie zostaje na mapie po zamknieciu szczegolow.

Testy: nowy harness tests/fix_batch_v1445.js (24 asercje: ekstrakty verbatim
+ piny strukturalne), nowe scenariusze empiryczne E19 (pelny flow edycji CL:
punkt -> commit -> undo), E20 (toBlob null), E21 (rejection file.text()).
Regresja: 30 harnessow Node + empiria SMOKE–E21.

## v1.44.4 — dialogi zapisu dla wszystkich plikow + smart-nazwy + harness checkSuppressors

Kazdy plik wychodzacy z aplikacji zapisuje sie przez okno z edytowalna nazwa
(natywne showSaveFilePicker przez helper saveWithDialog; fallback poza Chromium
= klasyczny download z sugerowana nazwa — bez zmian). Motywacja: identyczne
sztywne nazwy kalek krzyzowych → przegladarkowe dopiski „(1)(2)" i zgubiony plik.

- saveWithDialog: acceptMap +4 wpisy (arkdelta, md, png, svg); gałąz generyczna
  zostaje jako safety-net.
- Kalka: kalkaSave / saveDelta / saveDeltaRemainder przez saveWithDialog
  (lokalne toasty out — toast „✓ Zapisano: …" w helperze).
- Smart-nazwa kalki z diffu: kalka-<src>-<cel>--<fmtA>-do-<fmtB>.arkdelta
  (formaty z rozszerzen surowych nazw, przed sanityzacja; regula awaryjna
  deterministyczna: rozszerzenie brak/spoza {dat, arkmap, json} → wzorzec
  bez sufiksu; zero timestampow). _arkdeltaSuggestedName() bez zmian.
- Eksport obrazu mapy: finalize (PNG i SVG) oraz SVG z panelami przez
  saveWithDialog; triggerDownload usuniety (po weryfikacji zerowych referencji).
- Eksporty walidacji kierunkow: saveWithDialog + smart-nazwa
  walidacja-kierunkow-<mapa>-<ts>.md/.png (<mapa> = sanityzowane
  meta.map_name, fallback „mapa"); fix naglowka PNG — zahardkodowane
  „map_master3" zastapione realna nazwa mapy.
- Nowy harness tests/save_dialogs.js: sekcja A — macierz 16 przypadkow
  checkSuppressors (domkniecie luki testowej), sekcja B — piny strukturalne
  7 sciezek zapisu + wpisy acceptMap + zero golych download( poza helperem +
  brak triggerDownload, sekcja C — pin wersji.
- Empiria: E5.save-flow i E16.* wymuszaja fallback helpera
  (showSaveFilePicker = undefined — headless picker wisialby wiecznie);
  pin toastu E5 „Zapisano:"; E13.guard.fname z sufiksem formatow.
- Regresja: 29 harnessow Node + empiria SMOKE–E18, wszystko PASS.

## v1.44.3 — perf lab: przebieg v3 + raporty, konwencja .json, generator data-driven, fix lepkiej flagi minimapki

Drugi przebieg laboratorium wydajnosci (2026-08-22, ta sama maszyna co
referencja: Athlon Silver 3050U, Node v20.20.1, chrome-headless-shell 152,
bez obciazenia w tle) — pierwszy pomiar aplikacji z silnikiem sum v3.

- Aplikacja: kasowanie lepkiej flagi _mmDragging przy ruchu z puszczonym
  przyciskiem (audyt A23 — guard przycisku z v1.44.2 zwracal bez czyszczenia;
  kosmetyka, zero zmiany zachowania w normalnym torze).
- tests/perf/results/: przebiegi w podkatalogach per data (2026-08-21 =
  referencja v2, 2026-08-22 = nowy pomiar v3) + META.json (wersja aplikacji,
  silnik sum, tlo pomiaru) + MASZYNA.md per przebieg.
- run.sh: wyniki przegladarki jako results_browser.json (tablica JSON
  nadpisywana przyrostowo po kazdym rekordzie) zamiast .jsonl — koniec
  recznego zmieniania rozszerzenia przy zalaczaniu. Generator czyta oba
  formaty (fallback .jsonl dla starych katalogow).
- report_build.mjs: w pelni data-driven (werdykty, limity, powody stopu
  drabinki, notki tla/OOM z META.json — zero twardych twierdzen) + tryb
  porownawczy --compare (tabela werdyktow, metryki REF->NEW z klasyfikacja
  ±5%, analiza CRC/JSON.parse odporna na obciazenie tla). Deterministyczny
  (dwa przebiegi = identyczne bajty).
- docs/: regeneracja perf_report.html (liczby bez zmian, kod generujacy
  nowy) + nowe raporty: raport_wydajnosci_2026-08-22.html (niezalezny)
  i porownanie_wydajnosci_2026-08-21_vs_2026-08-22.html.
- Wynik porownania (skrot): 77 metryk lepiej / 3 gorzej / 3 bez zmian;
  CRC Node 14,3 s -> 7,8 s przy 432k pokoi (v2 -> v3); ratio formatow
  1,55-2,61x -> 1,24-1,50x; jedyne przekroczenie progu: kamera p95
  stress_4x .dat 26,3 -> 54,8 ms (renderer nietkniety — do weryfikacji
  przy kolejnym przebiegu).
- Regresja: 28 harnessow Node + empiria SMOKE-E18, wszystko PASS.

## v1.44.2 — fixy z audytu zewnetrznego Arc 21/22 (rdzen, zapis, kalka, planer, input)

Audyty zewnetrzne (DeepInfra; Qwen3-Coder-30B + DeepSeek-V4-Pro, rownolegle):
Arc 21 — renderer/edycja/undo/.dat/applyMap/share-link (73 findingsy,
0 realnych defektow); Arc 22 — zapis-eksport/kalka-apply/planer-A*/input
(64 findingsy, 3 realne defekty). Lacznie 232 surowe findingsy w 4 rundach
-> 4 realne defekty. Fixy i utwardzenia z Arc 22:

- A22/D1: zawieszony drag pokoju — guard (e.buttons & 1) w mousemove +
  dokumentowy mouseup anuluje drag zamiast commitowac z niewiarygodnej
  pozycji kursora (pokrywa tez Delete w trakcie dragu).
- A22/D2: zawieszony drag minimapy — guard (e.buttons & 1) w mousemove
  (mouseup poza oknem przegladarki nie dociera do dokumentu).
- A22/D3: wpRemove dekrementuje activeIdx przy usuwaniu waypointa sprzed
  aktywnego (splice przesuwa ogony).
- A22/C1: wpDecodeRoute — twardy limit dlugosci kodu ARKMAP2 (64k),
  fail-closed przed atob.
- A22/C2: commitRoomEdit — nieblokujacy toast przy kolizji wspolrzednych
  z formularza (spojnie z commitMoveRoomToArea).
- A22/C3: fallback zapisu .arkmap — catch z toastem (brak unhandled
  rejection; dirty zostaje — bezpieczny kierunek).
- Dopiski-decyzje w kodzie: legalnosc kolizji miedzyobszarowych,
  izolacja per-op w applyDelta (zamiast rollbacku), eksport .dat nie
  jest punktem kontrolnym dirty.
- Testy: nowy T7 w checksums_v3 — pin NaN-kanoniczny (NaN/undefined w
  custom lines -> bajtowo identyczne kodowanie; straznik klasy bledu
  z Arc 19). Spec: tolerancja pol labeli (CANONICAL_V3.md), doprecyzowanie
  "16 lowercase hex" (arkdelta_spec).

## v1.44.1 — korekta zakresu a3: user_data obszaru w sumie (Arc 20)

Audyt zewnetrzny silnika v3 (DeepInfra, Qwen3-Coder-30B, 8 partii):
17 findingsow, z czego 16 falszywych (udowodnionych kodem/repro —
m.in. rzekome bledy XXH3 obalone wektorami golden na granicach sciezek
129/240/241/512/1024/2048/2368 B). W triage wykryty realny defekt:
kodowanie a3 pomijalo user_data obszaru, a v2 (_stripAreaForCrc)
hashowal caly obiekt obszaru bez rooms — cicha redukcja zakresu
plus niescisle twierdzenia w docs (§15 Scope, CHANGELOG v1.44.0).

- _encodeAreaCanonical: + user_data obszaru (klucze UTF-8 bajtowo,
  str+str, pomijane gdy puste) — pozycja po labels, przed rollupem.
  Pelna parzystosc zakresu z v2: model obszaru .arkmap to wylacznie
  id, name, labels, user_data, rooms.
- CANONICAL_V3.md §4: nowy punkt 5 (user_data), rollup -> 6, nota
  o zakresie sprostowana (v2 hashowal wszystko poza rooms).
- Oracle + zloty fixture: obszar 1 ma user_data z kluczami
  wymuszajacymi porzadek bajtowy (a < zz < ą-key); regeneracja
  wektorow (zmienily sie tylko hash obszaru 1 i pliku).
- Wektory sanity XXH3: +136/200/224 (wnetrze zakresu 129–240) —
  27 wektorow, xxh3_golden 56 OK.
- checksums_v3 T4: +2 asercje (mutacja i usuniecie user_data obszaru
  -> badAreas) — dziura domknieta w regresji na stale (43 OK).
- Konsekwencja jawna: pliki v3 zapisane przez v1.44.0 (istnialo
  wylacznie lustro online, zero uzytkownikow) przeliczone nowym
  kodowaniem — lustro gałęzi mapa opublikowane ponownie.
- Docs: arkmap_spec §15 pkt 2 + nota Scope + wiersz §22 o korekcie.
- Regresja: 28 harnessow Node + empiria SMOKE–E18, wszystko PASS.

## v1.44.0 — silnik sum kontrolnych v3: XXH3-64 + kodowanie kanoniczne (Arc 19)

Wymiana całego silnika sum kontrolnych na podstawie pomiarow z laboratorium
wydajnosci (Arc 18): weryfikacja CRC-32/stableStringify byla jedynym
istotnym kosztem ladowania .arkmap. Nowy silnik: kodowanie kanoniczne
binarne (deterministyczny format bajtowy, normatywnie:
tests/checksums/CANONICAL_V3.md) + XXH3-64 (seed 0, czysty port JS
na BigInt zgodny z referencja xxHash v0.8.3, sciezka WASM
opcjonalna w przyszlosci). Jedyna zapisywana i weryfikowana wersja
to alg: "v3"; formuly v1/v2 i dispatch zostaly usuniete.

- Wydajnosc: weryfikacja 432k pokoi 14,3 s → ~1,4-1,7 s (~8,5x);
  realna mapa (26988 pokoi) ~447 ms.
- Kodowanie kanoniczne: i32/f64 little-endian (-0 → +0, kazdy NaN lub
  nie-liczba → kanoniczny quiet-NaN 7ff8000000000000), stringi
  length-prefixed UTF-8, klucze map w ustalonym porzadku domenowym
  (kierunki n,ne,e,se,s,sw,w,nw,up,down,in,out; pozostale klucze UTF-8
  bajtowo; klucze numeryczne rosnaco). Prefiksy domen r3/a3/f3;
  rollup-y z surowych 8-bajtowych hashy LE; zapis 16 znakow hex.
- Wartosci domyslne pomijane w kodowaniu (strip-equivalence
  udowodnione testem T3): reprezentacja w pamieci nie wplywa na sume.
- verifyChecksums: weryfikuje wylacznie v3; brak alg, v1, v2 i kazda
  inna wartosc → ciche pominiecie (nigdy falszywy alarm). Toast
  bez dopisku przy pominieciu; dialog z notka o nieznanym alg.
- Konsekwencje akceptowane (brak uzytkownikow formatow v1/v2):
  stare kalki .arkdelta (base.crc 8-hex) nie pasuja do map
  przeliczonych do v3 — odmowa na bramce bazy; aplikacje >= v1.43.7
  traktuja v3 jako nieznany alg (ciche OK); starsze zglaszalyby
  falszywa niezgodnosc. .arkdelta zachowuje CRC-32 dla wlasnych sum
  (checksums.file/ops) — to osobny format.
- Lustro: map_master3.arkmap na galezi mapa przeliczone do v3
  (self-check wlasnym verifierem OK, 60 obszarow / 26988 pokoi;
  produkcja serwuje alg v3). sync-map.yml: self-check przepisany na
  ekstrakcje blokow markerowych (====XXH3-64==== / ====CANONICAL-V3====)
  — konwerter tools/dat2arkmap.mjs podaza automatycznie.
- Testy: tests/checksums/ — laboratorium v3: spec CANONICAL_V3.md,
  oracle referencyjny oracle_v3.py (Python, bitowa zgodnosc z JS),
  24 wektory sanity + kotwica XXH3-64("") = 2d06800538d394c2,
  zloty fixture (12 pokoi, wszystkie pola i przypadki brzegowe).
  tests/checksums_v3.js (41 asercji) zastepuje tests/legacy_crc.js;
  xxh3_golden.js weryfikuje zarowno kopie deweloperska jak i blok
  markerowy w HTML (2 x 25). Driver empiryczny: E9.crc-v3-export,
  SMOKE.load.crc na 16 hex. Regresja: 28/28 harnessow Node,
  empiryczna SMOKE + E0-E18: 789 PASS / 0 FAIL.
- Spec: arkmap_spec §15 przepisany normatywnie na v3 (+ wiersz w
  tabeli §22); arkdelta_spec §4: identycznosc bazy wg alg v3;
  manual: odwolania do CRC-32 zaktualizowane do XXH3-64.

## v1.43.7 — legacy sumy v1 + przeliczone lustro online (Arc 16)

Zgloszenie usera: „Pobierz online → .arkmap" pokazywalo falszywe
„Suma kontrolna pliku: niezgodna" (60/60 obszarow, 0 pokoi). Przyczyna:
produkcyjne lustro (sync 2026-08-19 07:36, tooling sprzed v1.38.0) nioslo
legacy sumy v1 (meta.checksums bez pola alg), a verifyChecksums ignorowal
alg i liczyl zawsze formulami v2 — obszary i plik „niezgodne", pokoje OK
(formuła pokoju identyczna v1/v2). Repro bitowe na pliku produkcyjnym.

- verifyChecksums rozdziela po stored.alg: v2 jak dotad; brak alg →
  zamrozone formuly v1 (_crcAreaV1/_crcFileV1 verbatim z 41671a7^ — NIE
  ZMIENIAC) z flaga legacy; nieznany alg → neutralne pominiecie.
  Korupcja w pliku v1 nadal wykrywana (pokoje, rollup obszarow); limit
  formatu: v1 nie kryl pol obszaru — zapis podnosi sumy do v2.
- Dialog: legacy-OK → „OK (starszy format v1 — przeliczy sie przy
  zapisie)"; toast „[✓ suma kontrolna v1]"; nieznany alg → notka.
- Lustro: map_master3.arkmap na galezi mapa przeliczony toolingiem v2
  (commit 904653e; zawartosc mapy identyczna poza meta.checksums,
  index.json: arkmap_size + synced_at). Produkcja serwuje alg v2.
- sync-map.yml: krok self-check — opublikowany .arkmap musi przechodzic
  wlasny verifyChecksums (fail-closed; symulowany krok CI zielony).
- Nowy harness tests/legacy_crc.js (18 asercji, repro-first: 9 FAIL →
  fix → PASS). Piny self-checka w sync_map.js. Spec §15: semantyka alg;
  manual: notka o starszych plikach.
- run-all.sh: domknieta luka od Arc 13 (universal_colors.js nie byl w
  petli!) + legacy_crc.js — regresja to teraz 27 harnessow.
- Docs (Arc 17): spec §15 — usunieta stara nota o legacy mismatch
  (sprzeczna z dispatchem alg) + odeslanie w „Verification"; §22 Format
  Changelog: wiersz o wersjonowaniu alg; README: punkt o PWA.
- Perf lab (Arc 18): tests/perf/ — generator drabinki syntetykow
  (54k-864k pokoi, deterministyczny, sumy v2 funkcjami aplikacji),
  benchmark parse Node, driver przegladarki na CDP (realny zegar),
  orkiestrator run.sh, generator raportu. Wynik referencyjny
  (Athlon Silver 3050U 2C/2T): .arkmap laduje sie 1,6-2,6x wolniej niz
  .dat — ale wylacznie przez weryfikacje CRC (sam JSON.parse jest ~3,4x
  SZYBSZY niz parser binarny); renderer plaski do 108k pokoi (draw
  21-25 ms, kamera p95 14-37 ms); oba formaty OK do 4x realnej mapy.
  Raport: docs/perf_report.html + surowe dane tests/perf/results/.
  Bez zmian w aplikacji (same testy + docs).

## v1.43.6 — szersze ciasne okna aktywne (Arc 15)

Audyt UX okien (kontynuacja Arc 14): przyciski stopki nie miescily sie
w jednym rzedzie w trzech oknach narrow (360 px). Fix inline `width`
(wzorzec z Arc 14 — klasowe `max-width:90vw` dalej chroni mobile):

- `dlg-exit-bidirectional` → 400 px (przyciski 334 px — dotad drugi
  spadal o ~6 px);
- `dlg-unsaved-local` → 600 px (3 przyciski, 551 px);
- `dlg-unsaved-exit` → 700 px (4 przyciski, 653 px; dialog dormant —
  tylko sesja GitHub, ktora jest uspiona; fix czysto kosmetyczny,
  zero ingerencji w logike integracji).

Piny strukturalne w tests/tier6_ux.js (szerokosc + brak max-width
na boksach) strzega przed regresem. Reszta okien audytu czysta:
stopki maja flex-wrap, sinki dynamiczne maja word-break/ellipsis.

## v1.43.5 — szersze okienko tworzenia kalki (Arc 14)

Dialog „Stworz kalke mapy" renderowal sie na 420 px mimo zamierzonych
740 px: boks mial inline `max-width:740px`, ale klasa `.dlg-box` ustawia
sztywne `width:420px`, wiec max-width nigdy nie zadzialal (martwy zamysl).
Fix: inline `width:740px` — klasowe `max-width:90vw` dalej chroni waskie
ekrany i mobile. Tytuly kart z notkami w nawiasach, rzad przyciskow
i wiersz formatu mieszcza sie teraz w jednej linii; dlugie komunikaty
statusu zawijaja sie czysto do 2 linii (min-height statusu projektowo
na 2 linie). Pin strukturalny w tests/diff_kalka.js strzeze szerokosci
przed regresem.

## v1.43.4 — poprawki jezykowe PL (ortografia/gramatyka) + hardening E15

Audyt jezyka polskiego w dokumentacji i UI (zgloszenie usera):

- „nanos" → „nanies" (README, kalka .arkdelta) — forma „nanóś" nie istnieje;
  imperfektywne „nanoś" / perfektywne „nanieś"; w UI obowiazuje slownictwo
  „do naniesienia", stad „nanieś".
- „pokojów" → „pokoi" (dopelniacz l.mn. od „pokój") — 7x manual + 2x UI
  aplikacji (okno O programie, lista niezgodnych sum) + 4x komentarze.
- „dylizans" → „dyliżans" (manual, nawigacja). Uwaga: regex klasyfikacji
  transportow w kodzie (`/woz|dylizans|powoz/`) to DANE upstream w ASCII —
  swiadomie nietkniety (pin planner_ui.js).
- „pod warunkiem że" → „pod warunkiem, że" (przecinek).
- Podtytul manuala bez numeru wersji (byl nieaktualny: 1.5.42) — juz sie
  nie zestarzeje.
- FAQ: z miekkie sformulowania o integracji GitHub (uśpiona na zawsze —
  decyzja usera 2026-08-21): pytanie o prace offline i o wspolprace.

Tooling (commit 0993729): hardening flake E15 w run-all.sh — blok
dedykowany poza glowna lista grup, retry tylko na zawieche (BRAK SUMMARY
bez R|FAIL), potwierdzone zielonym runem CI 0993729.

## v1.43.3 — uniwersalne kolory + parity wizualny 1:1 z Delwingiem (Arc 13)

ArkMap Studio otwiera teraz dowolna mape Mudlet (v17-22) z dowolnego MUD-a,
zachowujac pelne bezpieczenstwo renderu Arkadii. Weryfikacja 1:1 wzgledem
ekosystemu Delwinga (mudlet-map-binary-reader, mudlet-map-renderer,
mudlet-web w org Mudleta): paleta xterm-256, mapowanie envId 8->ANSI 0 /
16->ANSI 8, fallback rgb(114,1,0), kolor symboli z luminancji, drzwi
zielone/zolte/czerwone, strzalki jednokierunkowe, custom lines — wszystko
zgodne; stuby od tej wersji tez 1:1 (pelna linia jasnoszara, 0.5 jednostki
za krawedz pokoju, bez dash).

- Detekcja isArkadiaMap(): map_sync_version w user_data, „arkadia" w nazwie
  mapy/pliku albo >=2 sygnaturowe envId (>255). Tabela ARKADIA_ENVS za bramka
  — mapy obce renderuja sie z ANSI + env_colors/custom_env_colors z pliku.
  Mapa arkadiaska .dat sama nosi wszystkie swoje kolory (mCustomEnvColors
  51/51 == ARKADIA_ENVS), wiec bramka nic nie zmienia dla realnej Arkadii
  (golden bit-for-bit: 51 envId 1:1).
- UI per mapa: legenda, palety malowania, selecty env i dialog kolorow
  pokazuja arkadiaska tabele tylko dla Arkadii; dla map obcych — uzywane/
  zdefiniowane envId z generycznymi nazwami „env N".
- Nowy pokoj: domyslne env 258 tylko dla Arkadii, dla map obcych 1.
- Nazwa mapy z .dat: fallback „Arkadia" tylko gdy detekcja pozytywna, inaczej
  „Mapa Mudlet".
- Testy: nowy harness tests/universal_colors.js (30 asercji: macierz
  detekcji, golden 51 envId, mapa obca, piny strukturalne) + E18 empiria
  (syntetyczna mapa obca przez realny loadArkmap: kolory ANSI, legenda bez
  „Las", stub solid #e1e1e1, powrot do fixture .dat w trybie arkadiaskim).

## v1.43.2 — serializacja pobran online (Arc 12)

Wariant 2 (blokada + toast): rownolegle pobierania mapy online mogly sie
wyscigowac — dwa kliki (dialog online / dwie strony kalki) odpalaly dwa
transfery naraz, a wskazniki postepu nadpisywaly sie wzajemnie. Fix:
globalna flaga _olActiveLabel (etykieta aktywnego transferu) + guard na
wejsciu wszystkich 3 loaderow (olLoadArkmap, olLoadDat, _kalkaOnlineLoad) —
drugie pobieranie w trakcie trwania pierwszego jest odmawiane pomaranczowym
toastem z dynamiczna nazwa pliku („Trwa pobieranie: <plik> — poczekaj na
zakonczenie"); flaga zdejmowana w finally (sukces, blad, abort, przerwanie
walidacji). Repro-first: E17 najpierw FAIL 1/6, po fixie PASS 6/6. Nazwa
pliku z jednego zrodla (const OL_F) — zero hardcode w komunikacie.

## v1.43.1 — fixy z wielkiego audytu k2.7-code (Arc 9: XSS + sync + PWA docs)

Wielki run audytowy (13 partii, 5 tematow: PWA, XSS/injection, pokrycie testowe,
sync online, mobile UX): 41 znalezisk -> 14 realnych po triage (weryfikacja pelnym
odczytem funkcji; 27 falszywych, m.in. halucynacja CSS hamburgera, „statyczna
paleta env z pliku", „writer .dat bez testow" — golden T2b istnieje).

- **XSS — showRoomInfo (medium x4)**: panel pokoju interpolowal dane z niezaufanego
  pliku RAW do innerHTML: klucze wyjsc, drzwi, wagi, exit_locks, stubs, r.env
  (obie galezie envLabel). Wektor: spreparowany .arkmap + non-fatal walidacja
  kierunkow (user moze wczytac mimo bledow). Fix: escHtml na wszystkich 6
  interpolacjach. .dat nie podatny (kierunki z tabeli binarnej).
- **XSS — dlg-refs-list (high model -> realne medium)**: model mylil zmienna
  (sn JEST escapowane), ale pelny odczyt wykazal raw ${r.dir} — komenda
  special exit z cudzego pliku w innerHTML listy pokoi przychodzacych.
  Fix: escHtml(r.dir).
- **sync-transports.yml (high)**: komentarz `# sync-F1 ...` wewnatrz $(...)
  polykal zamykajacy nawias i reszte linii (bash: unexpected EOF — potwierdzone
  empirycznie). Kroki auto-issue/auto-close byly zepsute od narodzin; nie
  wykryte, bo biegna tylko przy anomalii danych upstream. Fix: komentarz na
  wlasnej linii (2x). Pin regexowy w sync_map.js (kazda linia z $( bez # poza
  cudzyslowami).
- **sync-map.yml (medium)**: brama releases/latest bez uwierzytelnienia —
  limit 60/h per IP na wspoldzielonych runnerach mogl falszywie zglosic brak
  release. Fix: Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}.
- **olFetchFile (low)**: finally czyszcil tylko timer; dodane
  reader.releaseLock() (reader wyniesiony do zasiegu finally).
- **dlg-load-during-edit (low)**: przyciski po kolejnosci DOM -> stabilne id
  (btn-lde-cancel/discard/save), oba call-site (online + lokalny) po
  getElementById.
- **PWA (low x3)**: manifest +id (stabilna tozsamosc) i +lang: pl; head
  +apple-mobile-web-app-title „ArkMap" (iOS: krotka etykieta ikony).
- **Manual sekcja 25 (docs x3)**: doprecyzowanie „zawsze najswiezsza wersja" —
  Pages serwuje max-age=600 (do ~10 min HTTP cache, twardy reload Ctrl+Shift+R);
  notka o wymogu HTTPS przy instalacji; Android — sciezka „Zainstaluj
  aplikacje" obok „Dodaj do ekranu glownego".
- **Falszywy alarm (wyroznic)**: „push bez timeout w sync-transports.yml" —
  push MA timeout 120 (linia 76). „Przycisk Zapisz bez await/catch" —
  saveArkmap ma wewnetrzne try/catch z toastem (Arc 7).
- **Testy**: nowy harness tests/xss_sinks.js (repro-first: verbatim-extrakcja
  showRoomInfo/showDeleteRoomDialog + zlosliwy pokoj w Node ze stubami DOM,
  11 asercji) w run-all.sh (23 harnesy). Piny: sync_map.js (+4), tier6_ux.js
  (+5 LDE), pwa.js (+6). Aktualizacja pinu clearTimeout w sync_map.js
  (nowy ksztalt finally).
- Odroczone swiadomie: screenshots w manifescie, serializacja rownoleglych
  olFetchFile (wymaga decyzji UX), negatywne testy malformed .dat/pixmapa,
  harnesy validate()/eksportu PNG/SVG — lista dziur z pokrycia w
  /mnt/agents/work/audyt-arc9/triage.md.

## v1.43.0 — PWA: instalowalnosc (manifest + no-op service worker + ikony)

ArkMap Studio jako Progressive Web App, wariant A (wzorcowy no-op, jak w kliencie
Delwinga): aplikacje da sie zainstalowac z poziomu przegladarki (Chrome/Edge/Android,
Dodaj do ekranu glownego na iOS) i uruchamiac w osobnym oknie bez paska adresu.
Swiadomie BEZ offline: service worker nie cache'uje nic, wiec produkcja zawsze
serwuje najswiezsza wersje, a testy empiryczne (headless Chromium) nie sa narazone
na serwowanie starego HTML z cache. Zero nowych pinow wersji — manifest i sw.js
celowo nie zawieraja numeru wersji.

- **manifest.webmanifest** (root repo): name „ArkMap Studio", short_name „ArkMap",
  start_url ./arkmap_studio.html, display standalone, theme/background = --bg
  (#0d0f12) z CSS apki, ikony 192/512 + maskable 512 (bezpieczna strefa 72%).
- **sw.js** (root repo): no-op — install -> skipWaiting, activate -> clients.claim.
  Zero cache, zero handlera fetch (od Chrome 108 instalowalnosc nie wymaga fetch).
- **arkmap_studio.html**: <head> — link manifest, theme-color, apple-touch-icon 180,
  apple-mobile-web-app-capable, favicony 16/32 (pierwszy favicon w historii apki);
  rejestracja SW z cichym catch, bez gate na hostname (SW nic nie robi — empiryka
  go nie zauwaza, file:// failuje w catch).
- **icons/**: nowa ikona „AMS z korytarzy" (litery zlozone z korytarzy i swiecacych
  wezlow mapy, bursztyn na #0f1116), eksporty 512/192/180/maskable-512/favicon-32/16.
- **tests/pwa.js**: nowy harness (24 asercje) — parsowanie i kompletnosc manifestu,
  wymiary plikow ikon (IHDR), skladnia sw.js (node --check), straznik no-op
  (brak caches./fetch), tagi w <head>, rejestracja SW, zgodnosc theme_color z --bg.
  Dopisany do run-all.sh (22 harnesy Node).
- **docs/arkmap_manual.html**: nowy akapit „Instalacja jako aplikacja (PWA)".

## v1.42.2 — audyt dokumentacji vs kod (kimi-k2.7-code) + fixy

Audyt zgodnosci trzech dokumentow (manual PL, spec .arkmap EN, spec .arkdelta EN)
z kodem: 9 partii, 46 znalezisk, z czego 21 potwierdzonych w kodzie i zfixowanych,
25 falszywych alarmow udokumentowanych. 3 fixy kodu (z pinami), 17 fixow dokumentacji,
1 fix tooling (run-all.sh). Kazdy fix kodu ma pin w harnessie Node (tier3/tier6).

- **D-C1 (kod, medium)**: writer .dat — custom line bez pola color zapisowywala sie
  jako czarna [0,0,0], podczas gdy spec .arkmap (par.10) i reader (datToArkmap)
  definiuja default czerwony [255,0,0]. Fix: buildRoom uzywa toQColor(cl.color ||
  [255,0,0]). Pin: tier3_format.js T6 (zachowanie buildRoom + straznik zrodla).
- **D-C3 (kod, low)**: dialog pobierania online mowil „odswiezane codziennie",
  a cron sync-map.yml biegnie 2x dziennie (17 5 + 0 21 UTC). Fix: tekst dialogu.
  Pin: tier6_ux.js E1-E2.
- **D-C4 (kod, low)**: cheat sheet — brak aliasu Backspace przy Delete (kod obsluguje
  oba klawisze dla pokoju i etykiety), nieaktualne pozycje menu kontekstowego
  (pokoj: „Ustaw pozycje" zamiast „wyjscie"; puste: brak „Dodaj etykiete";
  brak wariantu viewer „Wysrodkuj widok"). Pin: tier6_ux.js E3-E8.
- **D-doc (spec .arkmap)**: par.15 opisywal algorytm CRC v1 — kod od v1.38.0 liczy
  v2 (a2:/f2:, pola kanoniczne obszaru, tablice colors, alg:'v2'); przepisany opis
  + notka o wersjonowaniu algorytmu i scope. par.6: brakujace pole hidden w tabeli
  Room Object (round-trip przez userData system.hidden w .dat v20).
- **D-doc (spec .arkdelta)**: par.5 — dopisane reguly kanoniczne (tablice prymitywow
  <=8 el. inline, jak w .arkmap par.16); par.9 — ksztalt wyniku apply z appliedSeqs
  oraz guard DELETE_AREA na obszar domyslny (areaId <= 0 zawsze skip).
- **D-doc (manual)**: intro — trzy formaty zamiast dwoch (dopisany .arkdelta);
  par.3 — sidebar bez legendy (legenda jest w cheat sheet); par.6 — przyciski
  „Wczytaj .arkdelta…" i „Stworz kalke mapy…", dialog „Podwojne linie wyjscia"
  przy eksporcie .dat, przycisk „+ Nowy obszar" (tylko tryb edycji); par.4 — dialog
  „Aktywna sesja edycji" przy wczytywaniu (online i lokalnym) z niezapisanymi
  zmianami; par.21 — dwa przyciski zapisu po nalozeniu kalki („Zapisz naniesione
  zmiany…" + „Zapisz reszte kalki…"); par.23 — hierarchia Esc z krokiem stawiania
  pozycji z kalki i doprecyzowanym warunkiem dirty (zaznaczony pokoj z edycjami),
  notka o guardach Ctrl+S (modal / drag) w par.20 i par.23.
- **Falszywy alarm (wyroznic)**: zgloszenie „validate() nie egzekwuje regul par.17
  spec .arkmap" (636/638/639/641) — kod egzekwuje wszystkie cztery jako ERRORY
  (validateRoom), silniej niz zaproponowane warnings. Bez zmian w kodzie.
- **Tooling**: run-all.sh dopisuje grupe E14 do regresji empirycznej (README juz
  ja deklarowal — dryf z v1.42.1).

## v1.42.1 — fixy z rozszerzonego audytu zewnetrznego (kimi-k2.7-code)

Audyt 4 partii (kalka F1, Tier 6, planer/transporty, sync online): 12 znalezisk,
z czego 8 potwierdzonych repro w harnessie i zfixowanych, 4 falszywe alarmy
udokumentowane. Kazdy fix ma pin empiryczny (nowa grupa E14, 17 asercji).

- **T6-F2 (high)**: async save — edycja wykonana W TRAKCIE zapisu (miedzy snapshotem
  a koncem await) nie jest juz mylnie oznaczana jako zapisana: licznik edycji
  (editRev) przy kazdym dirty=true; dirty kasowane tylko gdy zapis obywal sie bez
  edycji wspolbieznych. pristineArkmap zawsze = faktycznie zapisany tekst.
- **T6-F3**: fallback po bledzie zapisu przez handle — nowy handle z dialogu jest
  zachowywany, a etykieta przycisku zapisu odswiezana (takze po anulowaniu).
- **T6-F4**: applyMap porzuca trwajace pociagniecie pedzla (bez revertu — mapa juz
  podmieniona); wczesniej stroke przezyl podmiane przy editMode=false.
- **F1-1**: escHtml nazwy pliku i komunikatow bledow w statusach dialogu kalki
  (XSS nazwa pliku, np. <img onerror>).
- **F1-5**: reopen dialogu kalki uniewaznia cache resolve online (_kalkaOl).
- **F3-01**: import trasy (ARKMAP2) synchronizuje widocznosc panelu planera z DOM.
- **F3-02**: escHtml atrybutu title odcinka z transportem (dane TRANSPORT_DEFS).
- **sync-F1**: sync-transports.yml — auto-issue przy anomalii upstream faktycznie
  powstaje (jq '.[0].number // empty'; wczesniej pusta lista dawala string "null"
  i galaz tworzaca issue nigdy sie nie wykonywala).
- Higiena: klamry w non-FSAPI save-as (T6-F1 — sciezka falsy byla nieosiagalna).

## v1.42.0 — F1: generator kalki z diffu map (narzedzie standalone)

- **Nowe narzedzie „Stworz kalke mapy…"** (przycisk ⇄ pod „Wczytaj .arkdelta…", zawsze
  aktywne — nie wymaga trybu edycji): porownuje dwie mapy (zrodlowa i docelowa) i generuje
  z roznicy gotowa kalke .arkdelta do pobrania. Kazda strona: wczytanie z pliku
  (.arkmap/.dat) albo pobranie online z naszego mirroru (arkmap/dat). Kalka przechodzi
  autowalidacje przed zapisem; nazwa pliku kalka-<zrodlo>-<cel>.arkdelta.
- **Silnik diffMaps**: pelny slownik operacji z lakonicznymi polskimi etykietami —
  dodanie/edycja/usuniecie pokoju, obszaru, etykiety, wyjscia, custom line; przesuniecia
  pokoi (w tym cykle rozbijane jednym fallbackiem EDIT_ROOM), przeniesienia miedzy
  obszarami, malowanie grupowane w PAINT_BATCH, zmiany kolorow env. Kolejnosc emisji
  topologiczna (najpierw obszary i nowe pokoje, potem kasowania, ruchy, operacje
  pokojowe, malowanie, etykiety). Porownanie na kanonie pokoi (phantom-defaults:
  z=0, env null, puste kontenery) — mapa .dat vs .arkmap tej samej tresci daje pusta kalke.
- **Straznicy**: ostrzezenie o niespokrewnionych mapach (malo wspolnych ID — kalka i tak
  powstaje), twarda blokada przy limitach walidatora (5000 zmian / 8 MB), komunikat
  „Mapy sa identyczne" dla pustej kalki. Narzedzie nie dotyka wczytanej mapy ani
  historii edycji — tworzy wylacznie plik do pobrania.
- **Refaktory pod generator** (kompatybilne wstecz, bajt-w-bajt te same wyniki):
  buildDelta(log, base) i _computeBaseInfo(map) z parametrami opcjonalnymi,
  olFetchFile z opcjonalnym celem postepu.
- **Fix**: snapshot „before" opow EDIT_ROOM/EDIT_EXIT bierze pozycje x/y/z z wlasciwej
  strony diffu (zrodlo dla ruchu-fallbacku cyklu i edycji resid, cel dla EDIT_EXIT po
  MOVE_ROOM) — wczesniej klasyfikator falszywie zglaszal konflikt „pokoj zmienil sie
  od zapisu kalki" przy kalkach z cyklami przesuniec (np. zamiana miejsc dwoch pokoi).
- **Testy**: nowy harness tests/diff_kalka.js (74 OK: klasyfikacja, etykiety, kolejnosc,
  round-trip, piny UI) + grupa empiryczna E13 (5 scenariuszy, 37 asercji: pusta kalka,
  online hermetycznie, straznik pokrewienstwa, swap end-to-end, killer buildapply —
  chirurgia 13 rodzajow zmian na fixture master3, diff → kalka → apply → rownosc
  kanoniczna map). Golden writera bez zmian (7845726/65da3512).

## v1.41.0 — Tier 6: UX — dirty przy re-wejsciu, „Przywroc ostatni zapis", import trasy, touch

- **D1:** startLocalEditMode nie zeruje juz state.dirty — flaga jest utrzymywana przez
  mutacje (pushUndo choke point), zapis .arkmap i applyMap; wyjscie z edycji zachowuje
  zmiany, wiec re-wejscie pokazuje prawde. Wariantowy toast: „— masz niezapisane zmiany".
- **D2 (wariant c):** nowy bufor state.pristineArkmap = kanoniczna serializacja mapy
  w ostatnim punkcie kontrolnym (kazde wczytanie przez wrapper applyMap + kazdy zapis
  w _performArkmapSave i _performArkmapSaveAs — serializacja raz, wynik trafia do bufora
  przy wszystkich 6 punktach sukcesu). Nowa funkcja restoreLastSave(): pelna podmiana
  mapy z bufora przez applyMap (deltaLog pusty, dirty=false, wyjscie z edycji), handle
  pliku zachowany, pendingEnv czyszczony, parse w try/catch. Oba dialogi unsaved maja
  trzeci przycisk „Przywroc ostatni zapis", a "Wyjdz do podgladu" przemianowane na
  jednoznaczne "Wyjdz — zachowaj w pamieci". Semantyka: restore = ostatni zapis,
  nie poczatek sesji (kalka deltaLog przepada jak przy swiezym wczytaniu pliku).
- **D4:** dlg-unsaved-exit (sesja GitHub) mial martwe przyciski (tylko inline
  closeDialog) — zwiazane wszystkie 4 (Wyjdz/Przywroc/Zapisz/Wyslij PR). Blokada
  GitHub celowo NIETKNIETA: edlg-gh-*, startGithubSession stub i gating githubSession
  bez zmian; dialog wciaz nieosigalny w runtime, naprawa to higiena kodu uspionego.
- **#18:** import trasy z aktywna trasa wymaga potwierdzenia — pierwszy klik uzbraja
  przycisk „Nadpisz" (klucz trescia kodu), drugi aplikuje; zmiana kodu, Anuluj, X,
  overlay i Escape resetuja bramke (wpImportClose). Bez aktywnej trasy import dziala
  od razu. Cialo ladowania wydzielone do _wpImportApply(res).
- **#8:** 1-palcowy touch-drag delegowany do logiki canvasMode zamiast zawsze panowac:
  paint maluje pociagnieciem (commit/revert jak mysz, touchcancel sprzata), drag
  zaznaczonego pokoju przesuwa go (hit Chebyshev 0.525, commit przez
  _tryMoveRoomWithPolicy z force:false + obsluga blocked), w pozostalych trybach pan
  bez zmian; pinch i tap nietkniete. Znane ograniczenie: drag/resize etykiet na touch
  poza zakresem (mysz bez zmian).
- **Testy:** nowy harness tier6_ux.js (33 OK: A-D + pin wersji), empiria grupa E12
  (5 scenariuszy, 26 asercji: dirty-reentry, restore z fixpointem i wariantem mid-save,
  dialogi z wymuszona flaga githubSession tylko w driverze, bramka importu + regresja
  bez aktywnej trasy, touch syntetyczny: pan/paint/room-drag/pinch). Pelna regresja:
  20 harnessow node + SMOKE E0-E12 = 693 PASS empirii, 0 FAIL. Golden writera .dat
  bez zmian (len 7845726, crc 65da3512).

## v1.40.0 — Tier 5: fixy z audytu AI (kimi-k2.7-code, 34 znaleziska, 7 realnych)

Pelny audyt kodu przez kimi-k2.7-code (7 chunkow, ~403k tokenow in) + reczna weryfikacja
kazdego znaleziska w kodzie: 7 realnych defektow naprawionych, 27 odpartych z dowodami
(falszywe pozytywy albo znane decyzje projektowe P1-P5).

- **Fix F1 (audyt #3/#24/#25/#26):** klucz "__proto__" w mapach QString klucz→wartosc
  (userData, mSpecialExitLocks, exitWeights/doors) ginal cicho przy imporcie .dat/.arkmap
  i w edytorach (zwykly assign na plain object jest w JS ignorowany). Nowy helper
  _setMapKey (defineProperty, enumerable/writable/configurable) w readQMapSU/SS/SI,
  edytorze user_data pokoju i obszaru, pendingach i commicie special exits.
- **Fix F2 (audyt #32):** _replaceRoomData odtwarza redundantny backlink room.area
  z kanonu state.roomArea — sciezki delty (EDIT_ROOM/EDIT_EXIT) i Porzuc nie gubia go
  w modelu. Weryfikacja W1: writer .dat bierze obszar z area.rooms[] przez buildRoom,
  wiec zapis .dat/.arkmap nietkniety (golden writera bez zmian: len 7845726, crc 65da3512).
- **Fix F3 (audyt #27):** martwy suppressor (custom_lines[dir] z pustymi points)
  kasowany przy dodaniu wlasnego exit w tym kierunku — wczesniej ukrywal jego linie
  na renderze. Panel (pendingExitTarget w commitRoomEdit; undo pokryte snapshotem
  pokoju) i canvas (commitAddExit: entry ADD_EXIT niesie prevSupCL/prevOppSupCL,
  undo przywraca, redo kasuje — jedna jednostka undo).
- **Fix F4 (audyt #1):** select rp-env nie mutuje juz r.env na zywo — zmiana idzie
  do state.pendingEnv (dirty, live preview koloru przez _envOf w roomColor/minimap),
  commitRoomEdit konsumuje ja w normalnym batchu undo, Porzuc czysci. Kalka/deltaLog
  i undo widza teraz zmiane env spojnie z reszta pol formularza. Chipy palety env
  dzialaja bez zmian (dispatch change → ten sam kanal).
- **Fix F5 (audyt #34, zwezone po weryfikacji W3):** _deltaPlaceCtx zwraca kontekst
  stawiania dla ADD_ROOM do obszaru-kalki (sid), gdy ADD_AREA tego obszaru jest
  zaznaczone i wykonalne — Autopozycja/Recznie dzialaja (taken/cellFree/findFreeCell
  sa sid-spojne). Oryginalne znalezisko mylilo resA classifyDelta (ma fallback
  sidShArea — cien symuluje apply i wykrywa kolizje miedzyopowe; potwierdzone
  testem E3) z resA warstwy duchow; realna czesc = brak pozycjonowania. Galaz
  "obszar z kalki" w classifyDelta udokumentowana jako defensywna/nieosiagalna.
- **Testy:** nowy harness tier5_audit.js (44 OK: A1-A7, B1-B4, C1-C8, D1-D8d,
  E1-E12); empiria E11 (2 scenariusze, 8 asercji: rp-env nomut/commit/undo/porzuc,
  suppressor add/undo/redo); delta.js +2 (placeCtx sid-area; pin starego zachowania
  zaktualizowany — zamierzona zmiana F5); run-all.sh: 19 harnessow + grupy SMOKE E0-E11.

## v1.39.0 — walidator kalki twardnieje (typy/sid/glebokosc), kodek .dat czyta ujemne id, reszta kalki bez autopozycji

- **Przyczyna:** scalony audyt (Tier 4: K6/K7/S8, W1/W2, C-K5/C-locks, S2/S3/S5/S6/S7, Q5/W6/W8 + decyzje wlasciciela P1-P5) — 15 potwierdzonych defektow w 4 grupach: (K6) walidator .arkdelta sprawdzal ksztalt opow (schemat pol), ale NIE typy wartosci — toX:"abc", kolor 999 czy roomId:{} przechodzily walidacje i wywalaly sie dopiero przy nanoszeniu albo cicho psuly mape; (K7) ADD_ROOM/ADD_AREA/ADD_LABEL ze zwyklym numerem zamiast identyfikatora kalki (d:N) przechodzily — anonimowe adds lamaly kontrakt define-before-use; (S8) skaner kalki (_deltaScanDeep) rekurencyjny bez limitu glebokosci — bomba 100+ poziomow zabijala zakladke (stack overflow) przy samej walidacji; (W1/W2) kodek .dat czytal liste pokoi obszaru (readQListU) i klucze rawSpecialExits (readQMMUS) jako uint32 — pokoj o ujemnym id (legalny int32 w formacie Mudleta) wczytywal sie jako 4294967294, a special exit do ujemnego id gubil cel; (C-K5) „Zapisz reszte" serializowal R.delta.ops z NANIESIONYMI override'ami — autopozycje wymyslone przez program (how:'auto') cicho przeciekaly do pliku uzytkownika i wracaly przy nastepnym otwarciu jako „jego" decyzje; (C-locks) buildRoom emitowal mSpecialExitLocks jako roomId (liczby), a writer-rekonstrukcja sprawdzala lockSet.has(cmd) po stringach — locki special exitow byly niezapisywalne mina latentna; (S5) pierwszy z trzech handlerow drag panelu planera nie mial guarda wpLocked — LOCK nie blokowal przeciagania za naglowek; (S6) 6 golego localStorage.removeItem bez try/catch — wyjatek storage (prywatny tryb Safari, QuotaExceeded) przerywal applyMap/merge/czyszczenie w pol akcji; (S7) undo ADD_CL/ADD_SUPPRESSOR/AUTO_FIX zostawialo pusty kontener custom_lines {} w pokoju, ktory go nigdy nie mial — kalka eksportowala sztuczny pusty obiekt; (S2/S3) validateArea rzucal TypeError na labels-bedacym-obiektem zamiast zwrocic blad walidacji, a validateLabel przyjmowal uszkodzony base64 (wykrywal sie dopiero przy eksporcie .dat) i pixmapy bez limitu rozmiaru; (Q5) martwy guard `if (targetId === -1) continue;` po zmapowaniu stubow — nigdy niespelniony, mylacy czytelnika; (W6) wpEncodeRoute kodowal trase bez walidacji id (0/-2/2.5 produkowaly uszkodzony link zamiast odmowy); (W8) planer budowal allExits przez Object.assign — wyjscia specjalne przeciazaly zwykle o tej samej nazwie kierunku, trasa mogla isc nie ta krawedzia.
- **Fix:** K6: _deltaValidateOpTypes — per-typ sprawdzanie referencji (int32 lub sid d:N, przyjmujemy ujemne: Default Area = -1), wspolrzednych (finite, <2^31), kolorow (0-255), obiektow/tablic/stringow, komunikaty po polsku z nazwa pola; K7: ADD_* bez sid → czytelny blad „nowy obiekt musi miec identyfikator kalki (np. d:1)"; S8: _DELTA_MAX_DEPTH 60, oba skany w validateDeltaText owiniete try/catch → „zbyt gleboko zagniezdzona struktura" (kontrakt „Nigdy nie rzuca" dotrzymany). W1: readMudletArea/writeMudletArea uzywaja readQListI/writeQListI dla a.rooms (int32); W2: readQMMUS czyta klucz readInt32 — ujemne id pokoi i special exits do nich przezywaja roundtrip; zapis bez zmian bajtowych dla id >= 0 (bramka bajtowa: wyjscie writera identyczne z v1.38.0, crc 65da3512). C-K5 (decyzja P2, wariant srodkowy): openDeltaReview zapamietuje originalOps (gleboka kopia), _deltaRemainderOps serializuje ORYGINALNE opy + wylacznie reczne przesuniecia (how:'manual') — „co wymyslil czlowiek zapisujemy, co wymyslil program nie"; autopozycje sa sesyjne. C-locks: buildRoom emituje mSpecialExitLocks jako liste KOMEND (stringow) zgodnie z semantyka v21 — mina rozbrojona. E8: exitWeights normalizowane do krotkich kierunkow (northeast→ne). S5: guard wpLocked w pierwszym handlerze drag (teraz wszystkie 3). S6: 6 removeItem owinietych try/catch. S7: pushUndo ADD_CL/ADD_SUPPRESSOR/AUTO_FIX niesie hadContainer; undo kasuje kontener tylko gdy go nie bylo (hadContainer === false) i jest pusty. S2: validateArea sprawdza Array.isArray(labels) przed petlami (2 miejsca). S3: validateLabel wymaga poprawnego base64 (atob) i cap 4 MB. Q5: martwy guard usuniety (komentarz dokumentuje). W6: wpEncodeRoute fail-closed na niecalkowitych/ujemnych id. W8: 3 callsite'y planera z jawna kolejnoscia assign (special_exits > exits, zero zmiany zachowania — udokumentowana). Decyzje wlasciciela: P1 locked-cel planera ZOSTAJE (swiadoma roznica z Mudletem, pin w harnessie); P3 stretch<<8 ZOSTAJE (celowa zgodnosc bajtowa, pin); P4 alpha custom lines OLANE calkowicie (nawet bez backlogu); P5 waypointy zamkniete definitywnie bez feature'u. Odchylenie od planu: scenariusz „dat-roundtrip golden bajt-w-bajt wzgledem fixture" zastapiony fixpointem + goldenem writera — fixture pisal Mudlet i nasz writer normalizuje kolejnosci (np. stubs) juz od v1.38.0, wiec bajtowa zgodnosc z fixture nigdy nie trzymala; wlasciwa bramka to bajtowa zgodnosc writerow v1.38.0≡v1.39.0 (sprawdzona: PASS).
- **Testy (w tym samym commicie):** nowy harness tests/tier4_hardening.js (67 asercji: T1 walidator fixture/sid/typy/glebokosc, T2 kodek signed roundtrip + bajty, T2b golden writera fixpoint+crc, T3 buildRoom locki/wagi, T4 reszta wg P2, T5 undo S7 x5, T6 dijkstra W8, T7 W6 fail-closed, T8 validateArea/validateLabel, T9 piny P1/P3/S5/S6/Q5/S7/S8/wersje, T10 bramka buildDelta). 5 nowych scenariuszy empirycznych E10 (21 asercji): E10.delta-validate (fixture przechodzi, toX string odrzucony, ADD bez sid odrzucony, bomba glebokosci bez rzutu), E10.remainder-p2 (autopozycja nie przecieka, manualna przecieka, naniesione wypadaja), E10.wp-lock-drag (odblokowany przesuwa, LOCK nie), E10.undo-cl-container (pusty kontener sprzatany, istniejacy nietkniety), E10.dat-roundtrip (fixpoint bajtowy + golden len/crc v1.38.0). Grupa E10: 21 PASS / 0 FAIL.
- Regresja lokalna: pelny `run-all.sh` PASS (18 harnessow node + kampania empiryczna SMOKE+E0–E10, 0 FAIL).

## v1.38.0 — sumy kontrolne v2 widza wiecej, hidden/symbolColor utrzymane, kalka zawsze kompletna

- **Przyczyna:** scalony audyt (Tier 3: W3/W4/Q2/W9/W17/W18, czesciowo z zewnetrznego audytu) — 4 grupy defektow: (W3) sumy kontrolne CRC v1 obejmowaly TYLKO pokoje — zmiana nazwy obszaru, etykiet czy palety kolorow przechodzila bez echa („Suma kontrolna pliku: OK" na zmienionym pliku), dwa puste obszary byly nierozroznialne (crc pustej listy identyczny), a pokoj bez wpisu w sumach byl cichym OK; (W4/Q2) flaga hidden (v22+) i symbolColor (v21+) nie mialy pola w writerze v20 — wczytanie i zapis mapy cicho gubil obie wlasciwosci; (W9) klucz cache obrazkow etykiet to samo label.id — podmiana pixmapy pod tym samym id albo kolizja id miedzy obszarami renderowala stary obrazek; (W17) cap historii cofania (50) byl rozproszony w 31 miejscach, a zaproponowany zewnetrznie fix z deltaLog.shift() obcinalby glowe logu eksportu — kalka po 51+ operacjach cicho niekompletna wzgledem bazy; (W18) wyjscie z trybu edycji nie robilo granicy sesji, a wariant czyszczacy deltaLog otwieralby te sama cicha niekompletnosc kalki (mapa zachowuje edycje po wyjsciu, wiec wyzerowany log = eksport bez opow sprzed wyjscia).
- **Fix:** W3: nowy algorytm sum v2 (jeden, bez migracji — swiadoma cena: stare .arkmap pokaza raz dialog walidacji, re-eksport naprawia; stare .arkdelta dostana „z innej wersji", recenzja dziala). _crcArea liczy 'a2:' + id + metadane obszaru (nazwa, kolory, pozycja, etykiety sortowane po id) + crc pokojow; _crcFile liczy 'f2:' + paleta kolorow + crc obszarow; alg: 'v2' w meta.checksums. verifyChecksums: pokoj bez wpisu laduje w nowym missingRooms → ok:false + linia w dialogu („Pokoje bez sumy kontrolnej: N (plik zmieniony bez przeliczenia sum)"). W4/Q2: kanal przez user_data — _datConvertRoom czyta raw.hidden (v22+) i userData['system.hidden'] (read-back v20) do room.hidden; symbolColor zapisuje fallback '#rrggbb' w user_data['system.fallback_symbol_color'] (nie nadpisuje istniejacego klucza, render czyta symbolColorFor); buildRoom emituje out.hidden gdy true; writeMudletRoom dopisuje 'system.hidden'='1'; validateRoom: hidden musi byc boolean. W9: _getPixmapImage kluczuje cache przez areaId + label.id + dlugosc + hash FNV-1a tresci pixmapy (_hash8). W17: 31 inline-capow usunietych; cap 50 w jednym choke point pushUndo; deltaLog NIGDY nie scinany (kalka = pełny log sesji, eksport zawsze kompletny wzgledem bazy); komentarze pol state dokumentuja asymetrie (undoStack = zeszyt cofania z kapturem, deltaLog = zeszyt eksportu pelny). W18 v2: exitEditMode czysci undoStack/redoStack (granica sesji zabija cofanie), deltaLog przezywa tak dlugo jak mapa — zeruje go tylko applyMap; re-wejscie w edycje: Ctrl+Z no-op, a kalka niesie opy sesji 1+2.
- **Testy (w tym samym commicie):** nowy harness tests/tier3_format.js (48 asercji: determinizm v2, strip hidden:false, rozroznialnosc pustych obszarow, wrazliwosc na nazwe/etykiety/kolory, sort labeli, addChecksums/verify z missingRooms, konwerter hidden/symbolColor round-trip, _hash8, cap choke-point, LIFO ogona, exitEditMode, strazniki + piny wersji). tests/delta.js +T12 (baseInfo crc v2: etykiety/kolory zmieniaja tozsamosc bazy kalki, _deltaBaseCheck null/mismatch) i przepisane strazniki capa (dokladnie 1x w pushUndo, 0x deltaLog.shift) — 268 asercji. 4 nowe scenariusze empiryczne E9 (20 asercji): E9.capsession (51 opow: undo 50/dziennik 51/kalka 51 + baza, undo spojne), E9.exitreset (wyjscie z dialogiem niezapisanych, cofanie zabite, dziennik przezywa, Ctrl+Z po re-wejsciu no-op, kalka sesji 1+2 kompletna), E9.crc-v2-export (alg v2 w pliku, verify ok, mutacja etykiety → badAreas, brak klucza → missingRooms), E9.hidden-roundtrip (model/raw/system.hidden/symbolColor fallback). Grupa E9: 20 PASS / 0 FAIL.
- Regresja lokalna: pelny `run-all.sh` PASS (17 harnessow node + kampania empiryczna SMOKE+E0–E9, 0 FAIL).

## v1.37.0 — utrata danych UX: dirty-guard przy skokach, rename SE z retargetem, wiszacy areaId

- **Przyczyna:** scalony audyt (Tier 2: K2/K3/Q4/W10/W11/W12) — 6 miejsc cicho gubilo dane albo zostawialo niespojny stan: (K2) fitRouteToView kasowal niezapisane pole formularza przy przeskoku za trasa do innego obszaru („Silently discard pending edits"); (K3) commitMoveRoomToArea prewencyjnie czyszcil editDirty/editSnapshot przed jumpToRoom, omijajac kanoniczny guard — ginela niezapisana edycja, takze INNEGO pokoju; (Q4) rename specjalnego wyjscia wykrywany tylko po tym samym celu — jednoczesna zmiana nazwy i celu kasowala doors/wage/custom line bezpowrotnie; (W10) state.selectedRoom NIGDY nie bylo przypisywane (0 przypisan w pliku) — sync snapshotu po „Ustaw pozycje" martwy (Porzuc cofal zatwierdzona pozycje, falszywy licznik dirty) i martwy _refreshOpenRoomWarn; (W11) undo ADD_AREA nie naprawialo state.areaId po nawigacji commita → wiszacy areaId; (W12) `if (first) selectArea(first)` przy DELETE_AREA traktowalo id 0 (Default Area) jako falsy → wiszacy areaId, gdy default zostawal jedynym obszarem.
- **Fix:** K2/K3: powrot do kanonicznego wzorca showDirtyConfirm (jak selectArea / skok do pokoju z wyszukiwarki) — prompt tylko gdy formularz realnie brudny; ogon fitRouteToView w domknieciu _finishFit, zeby fit wykonal sie na NOWYM obszarze po decyzji uzytkownika; w commitMoveRoomToArea guard na nawigacji (przeniesienie zostaje — bylo zatwierdzone dialogiem). Q4: dokladne sledzenie rename po stronie edytora (nowy state.pendingSERenames, zapis w update() wiersza z kolapsem lancucha A→B→C, czyszczenie jak pendingSpecialExits); commitRoomEdit pyta najpierw mape, potem stara heurystyke po celu (fallback), na koncu kasuje; migracja metadanych target-wins per-pole. W10: selectedRoom → state.selected (snapshot kluczowany po selected). W11: wpis undo ADD_AREA niesie prevAreaId; undo/redo naprawiaja areaId wylacznie gdy wiszacy (bez szarpania widokiem). W12: first !== undefined w commit i redo.
- **Testy (w tym samym commicie):** nowy harness tests/tier2_state.js (33 asercje: W12 commit+redo na Default Area id 0, W11 prevAreaId/fallback/no-yank, K3 zachowanie dirty i odlozona nawigacja, 15 straznikow strukturalnych + pin wersji). 6 nowych scenariuszy empirycznych E5 (38 asercji): E5.dirty-movearea (guard widoczny, dirty zachowane, Porzuc cofa formularz a nie przeniesienie), E5.dirty-routefit (guard, fit po Porzuc na nowym obszarze, crc bez zmian), E5.se-rename (rename+retarget przez prawdziwe inputy DOM → migracja doors/wagi/CL, undo/redo), E5.undo-addarea, E5.setpos-sync (snapshot sync, brak falszywego dirty, Porzuc nie cofa pozycji), E5.warnrefresh. Grupa E5: 114 PASS / 0 FAIL.
- Regresja lokalna: pelny `run-all.sh` PASS (16 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).

## v1.36.0 — rozjazd recenzja↔wykonanie kalki: seed done-SID, DELETE_AREA 0, ADD_EXIT dwukierunkowy, resR

- **Przyczyna:** zewnetrzny audyt (scalony: GPT + Qwen, 4 znalezienia Tier 1) wykazal rozjazdy miedzy klasyfikatorem kalki (classifyDelta, symulacja na cieniu mapy) a wykonaniem (applyDelta): (W13) operacja „done" (np. ADD_AREA na istniejacej nazwie) nie seedowala mapowan SID, wiec zalezny ADD_ROOM po SID dostawal `undefined` i byl falszywie pomijany mimo zielonej recenzji; (W15) DELETE_AREA na obszar domyslny (id ≤ 0) — commitDeleteArea odmawial milczaco (toast), a applyDelta liczyl to jako sukces i wpisywal do deltaLog; (W16) klasyfikator ADD_EXIT nie liczyl zajetosci kierunku przeciwnego u celu, wiec „ok" rozjezdzalo sie z odmowa guarda F5 w wykonaniu (mapa bez zmian mimo obietnicy recenzji), a jednokierunkowe istniejace wyjscie klasyfikowal „ok" zamiast „done/hard"; (W14) PAINT_BATCH i AUTO_FIX_SUPPRESSORS uzywaly surowego `ch.roomId` zamiast `resR(...)`, wiec operacje na swiezo dodanych pokojach (SID) byly falszywie „impossible".
- **Fix:** F1: applyDelta dostal opcjonalny parametr `seedSids`; jedyny produkcyjny caller `_deltaApplyReviewed` buduje seed z map klasyfikacji (`R.items.sidRoomId/sidAreaId/sidLabelId` — same rozwiazania done→live-id); wykonany ADD nadpisuje seed (wykonanie wygrywa). F2: klasyfikator DELETE_AREA na aid ≤ 0 → „impossible" (obszar domyslny); applyDelta ma guard ≤ 0 → skip i honoruje zwrot commitDeleteArea (teraz jawny `false` na 3 sciezkach odmowy, `true` po sukcesie; wywolania z UI ignoruja zwrot — wstecznie zgodne). F3: klasyfikator ADD_EXIT liczy dokladnie to co wykonanie — pelna para dwukierunkowa → „done", istnieje tylko w jedna strone → „hard" (napraw recznie), zajety kierunek przeciwny u celu → „hard" (Zastosuj pominie — mapa bez zmian); sam guard F5 bez zmian. F4: wszystkie dostepy do pokojow po roomId w PAINT_BATCH i AUTO_FIX_SUPPRESSORS (klasyfikator + _sim) przez `resR(...)`.
- **Testy (w tym samym commicie):** nowa sekcja T11 w tests/delta.js (23 asercje: W13 done-by-name + zalezny ADD_ROOM z seedem/bez, re-klasyfikacja done/done; W15 klasyfikacja impossible + apply 0/1 + obszar zyje; W16 hard kierunek przeciwny / done pelna para / hard jednokierunkowe; W14 PAINT_BATCH + AUTO_FIX po SID ok; asercje strukturalne + 3 piny wersji). Nowy scenariusz empiryczny E8.tier1 (12 asercji): sciezka produkcyjna end-to-end przez panel (kalka ADD_AREA done + ADD_ROOM → openDeltaReview → _deltaApplyReviewed z seedem → pokoj w zywym obszarze, maskowanie done, deltaLog 1 wpis, drugie Zastosuj idempotentne, undoAll do bazy) + DELETE_AREA obszaru domyslnego przez panel (impossible, 0/1, obszar nietkniety, deltaLog pusty).
- Regresja lokalna: pelny `run-all.sh` PASS (15 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).

## v1.35.0 — etykiety kalki zachowane przy re-eksporcie dla 6 typow opow

- **Przyczyna:** „Zapisz naniesione zmiany" (re-eksport z logu undo) gubil customowe `op.label` z kalki dla 6 typow opow: ADD_EXIT, DELETE_EXIT, MOVE_ROOM, MOVE_ROOM_TO_AREA, DELETE_ROOM, DELETE_AREA (zgłoszone z testow recznych — re-eksport uzytkownika mial auto-etykiety na 8 opach). Pozostale typy przekladaly etykiete kalki (`label: op.label` w applyDelta), ale te 6 ida przez niskopoziomowe funkcje commit* (wspoldzielone z reczna edycja), ktore generowaly wlasne auto-etykiety i nadpisywaly etykiete kalki we wpisie undo — a `buildDelta` bierze `e.label` wlasnie z tego wpisu.
- **Fix:** 6 funkcji (`deleteRoom`, `commitDeleteArea`, `commitMoveRoomToArea`, `commitAddExit`, `commitDeleteExit`, `commitMoveRoom`) dostalo opcjonalny parametr etykiety i zasade `entry.label = op.label || auto`. applyDelta przekazuje `op.label` kalki; sciezki recznej edycji wywoluja bez parametru, wiec auto-etykiety zostaja jak byly. Re-eksport niesie teraz etykiety kalki round-trip dla wszystkich typow opow.
- **Testy (w tym samym commicie):** nowy scenariusz empiryczny E8.labelkeep (5 asercji): 6 niezaleznych opow (po jednym na typ) budowanych na zywej mapie z rozpoznawczymi etykietami CUSTOM-*, apply na czystej bazie (6/6 naniesione, 0 pominiete), wpisy undo niosa etykiety kalki, re-eksport buildDelta zachowuje je round-trip, undoAll wraca do bazy. 19 asercji strukturalnych w tests/delta.js (sygnatury z etykieta, fallbacki `label || auto`, wywolania z `op.label`, emisja `e.label` w buildDelta).
- Regresja lokalna: pelny `run-all.sh` PASS (15 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).

## v1.34.0 — caly UI kalki prostym, laickim polskim tekstem (zero zargonu)

- **Przyczyna:** komunikaty kalki i walidacji plikow mowily zargonem technicznym (zglaszone z testow recznych): „payload", „checksum", „CRC-32", „op", „opy", „ops_count", „seq", „parsowania JSON", „upstream", „→ meta", „master" jako fallback wersji. Normalny uzytkownik nie wie, co to „op" albo „payload".
- **Fix:** pelna przeczyszczka stringow UI. Walidacja kalki: „Nie mozna odczytac pliku — uszkodzony lub to nie jest plik kalki", „liczba operacji w naglowku (X) nie zgadza sie z zawartoscia (Y)", „numeracja nie jest po kolei", „niekompletne dane (brak celu/tresci/brak: POLE)" z mapa pol na polskie nazwy (`_DELTA_FIELD_PL`: roomId→pokoj, dir→kierunek, before→stan przed itd.), lokalizacja bledu „operacja #N". Sumy kontrolne: „nie zgadza sie z suma kontrolna", import „Suma kontrolna pliku: OK / niezgodna / Niezgodne sumy kontrolne / brak sum kontrolnych". Dialog innej wersji: „nakladanie na nowsza wersje mapy", „sygnatura" zamiast „crc", „kazda operacja z kalki zostanie sprawdzona", „Kalka pasuje do wczytanej mapy" / „Kalka bez informacji o wersji mapy, na ktorej ja zapisano". Tosty: „Brak reszty — cala kalka naniesiona", „Zapisano reszte kalki (N operacji)" z poprawna odmiana przez `plPl`, „to operacja usuwania — nie ma czego pokazac". Kolizje: „odznacz te operacje" / „Zastosuj pominie te operacje". Reszta: „.arkmap → meta" → „w pliku .arkmap", fallback wersji online „master" → „wersja nieznana", „Błąd parsowania JSON" → „Nie mozna odczytac pliku…". Pisownia „kalka" (nie „kałka") takze w komentarzach.
- **Testy (w tym samym commicie):** nowy harness-straznik `tests/ui_strings.js` (13 asercji): skan wszystkich stringow UI (681 literaly z polskimi znakami, tooltipy, teksty miedzy znacznikami) pod katem 12 zakazanych tokenow (payload, checksum, CRC, ops_count, parsowania, upstream, kałk, → meta, seq, op, opy, op #) + globalny zakaz „kałk" w calym pliku + asercje konkretnych nowych komunikatow. Straznik dopiety do `run-all.sh` i `tests/README.md` — regresja zargonu = czerwony build. Asercje w `tests/delta.js` i kampanii empirycznej (E4.format, E4.integrity) przepiete na nowe komunikaty.
- Regresja lokalna: pelny `run-all.sh` PASS (15 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).

## v1.33.0 — karta zbiorcza kalki: zawsze po kliku w item, odswiezanie, jednolite „Pokaz"

- **Przyczyna:** karta szczegolow (#dp-card) pokazywala sie wylacznie z przycisku „Efekt" i trybu stawiania — klik wiersza itemu robil tylko skok na mapie, wiec po przejsciu na inny item karta zostawala z danymi poprzedniego (zgłoszone z testow recznych). Do tego „Efekt" obok „Ukryj" byl niejednoznaczny, a opy bez tabeli roznic chowaly karte zamiast pokazac cokolwiek.
- **Fix:** klik wiersza = skok na mapie ORAZ karta szczegolow (bez ducha — duch nadal z przycisku). Karta sledzi otwarty item (`_deltaCardSeq`) i jest odswiezana przy kazdej mutacji panelu (checkbox, autopozycja, override, Zastosuj, filtry) — nie moze zostac stara. Opy bez tabeli roznic/kolizji dostaja wiersze zapasowe (`_deltaFallbackRows` + `_DELTA_TYPE_PL`: typ operacji po polsku, pole/pokoj/obszar/zrodlo→cel), wiec karta jest ZAWSZE. Przycisk „Efekt" → jednolite „Pokaz" (para z „Ukryj"); roznica done (realny obiekt) vs ok/hard (duch-podglad) wyjasniona w tooltipie. Przy okazji: literowka „kalka chce" w karcie kolizji.
- **Testy (w tym samym commicie):** nowy scenariusz E8.cardrefresh (6 asercji: klik=karta bez ducha, przelaczenie na inny item, autopozycja nie zostawia starej karty, tracking seq, filtr nie gubi karty) + E8.confcard.fallback (wiersze zapasowe dla op bez szczegolow — odwrocenie dawnego hide-empty). Asercje strukturalne w tests/delta.js (klik=karta, fallback, refresh, typy PL). Wszystkie lookup-y przycisku w kampanii empirycznej na „Pokaz".
- Regresja lokalna: pelny `run-all.sh` PASS (14 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).

## repo — sync mapy na model Delwinga: wersja z tagu release, nie ze stempla mastera

- **Przyczyna:** mirror pobieral surowego mastera upstream, ktory NIE jest artefaktem dystrybucyjnym — jego wewnetrzny stempel wersji (user_data.version w .dat) bywa stary (master @e999896 niosl „0.204.0" przy tresci release 0.205.0; roznica master↔asset to 36 bajtow samego stempla). Do tego krok `ver` szukal tagu NA commicie mastera, wiec `index.json` wychodzil z `version: null` — okienko pobierania online pokazywalo „mapa master · @…" bez numeru wersji, a aplikacja spadala na zastarzaly stempel z pliku (naglowek „v0.204.0" przy swiezej mapie). U Delwinga artefaktem jest zawsze RELEASE (auto-release stempluje plik przy kazdej zmianie mapy), a zrodlem prawdy o wersji jest tag releases/latest — klient Dargotha w ogóle nie czyta wersji z pliku.
- **Fix:** `sync-map.yml` przepisany na model Delwinga. Brama na tag `releases/latest` (ten sam tag = cisza). Pobranie assetu `map_master3.dat` przypietego do tagu (`releases/download/<tag>/…` — brak wyscigu z nowym release w trakcie runu). Weryfikacja fail-closed: stempel w pliku == tag (parsowanie przez tools/dat2arkmap.mjs). Guard regresji semver: tag starszy niz publikowany = stop (np. gdyby upstream usunal release). `index.json` zawsze z wersja (fail-closed przy pustej) — okienko online i naglowek aplikacji pokaza prawdziwa wersje bez zmian w kodzie apki (olLoadDat juz wbija version/revision z index.json do user_data). Nowy input `force` przy workflow_dispatch (reczna przebudowa; regresji nie omija). Publikacja bez zmian: max 2 snapshoty, force-push na `mapa`.
- **Testy (w tym samym commicie):** 10 nowych asercji strukturalnych w `tests/sync_map.js` (gate na releases/latest, asset przypiety do tagu, zakaz raw master, weryfikacja stempla, guard regresji, fail-closed bez release/assetu, input force, index.json bez null, deref tagu ^{}). Flow przetestowane end-to-end na zywym upstreamie: tag 0.205.0, asset 7 847 878 B, stempel zgodny, index.json z uczciwa wersja.
- Repo-only: bez zmian w aplikacji, bez podbicia wersji.

## repo — CI: cache Chromium + sufit joba 40 min (flake instalacji zabil run regresji)

- **Przyczyna:** run regresji na commicie v1.32.0 zostal zabity timeoutem joba (25 min) — krok `playwright install --with-deps chromium` zacial sie na pobieraniu przegladarki (flake sieciowy runnera) i regresja nigdy nie wystartowala; run wyszedl „cancelled" mimo zdrowego kodu (lokalna regresja przed pushem byla zielona).
- **Fix:** krok `actions/cache` (SHA-pin z komentarzem wersji, konwencja repo) na `~/.cache/ms-playwright`, klucz spiety z wersja playwright — na cache-hicie instalacja Chromium schodzi z minut do sekund, a flake pobierania przestaje istniec. Sufit joba `timeout-minutes` 25 → 40 jako zapas na miss cache i wolniejszy runner; krok regresji zachowuje wlasny `timeout 1380`.
- **Testy (w tym samym commicie):** nowy harness `tests/ci_workflow.js` (17 asercji fail-closed: sufit joba, krok cache z SHA-pin, spojnosc wersji playwright klucz↔install, brak referencji tagowych akcji, timeout regresji, concurrency, podpiecie do run-all.sh). Harness dopiety do `run-all.sh` (14 harnessow node); `tests/README.md` zaktualizowany.
- Repo-only: bez zmian w aplikacji, bez podbicia wersji.

## v1.32.0 — eksport .dat dostepny w trybie edycji + ostrzezenie o brudnym formularzu

- **Przyczyna:** przycisk „Eksportuj Mudlet .dat" byl wylaczany w trybie edycji („Wyjdź z edycji aby eksportować") — czysta decyzja UI, zadnej technicznej przeszkody (eksport czyta zywy state.map, zmiany z edycji sa w nim natychmiast po commicie).
- **Fix:** eksport .dat odblokowany w trybie edycji (tooltip wyjasnia zasade). Jedyna rzecz, ktora NIE wchodzi do pliku, to niezapisane zmiany z otwartego formularza pokoju — po eksporcie z brudnym formularzem toast: „Wyeksportowano .dat bez N niezapisanych zmian z formularza pokoju #id — zapisz formularz i wyeksportuj ponownie". Licznik `_editDirtyCount` porownuje 8 pol formularza (nazwa/env/symbol/waga/x/y/z/notatki) ze snapshotem edycji. CSS „not-allowed" usuniety.
- **Testy (w tym samym commicie):** nowy scenariusz E8.editexport (5 asercji: przycisk odblokowany + tooltip, licznik 2 zbrudzonych pol, toast ostrzegawczy z liczba, licznik 0 po commicie). Scenariusz wymusza sciezke fallback pobierania (headless Chromium ma showSaveFilePicker — dialog czekalby wiecznie).
- Regresja lokalna: pelny `run-all.sh` PASS (13 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.31.0 — dwa przyciski zapisu: naniesione zmiany + reszta kalki (M7)

- **Przyczyna:** „Zapisz zaktualizowana kalke" zapisywal SESJE (deltaLog = to, co naniesiono recznie i z panelu), a nie nienaniesiona reszte kalki — uzytkownik zapisywal plik myslac, ze ma w nim konflikty do pozniejszego rozstrzygniecia, a one znikaly (wykryte na eksportach z testow recznych).
- **Fix:** rozszczepienie na dwa przyciski z jednoznacznymi nazwami. „Zapisz naniesione zmiany" = dotychczasowe saveDelta (sesja, tooltip wyjasnia). Nowy „Zapisz reszte kalki (N)" = opy kalki jeszcze NIE naniesione (konflikty, niewykonalne, odznaczone) z oryginalnymi payloadami/labelkami i oryginalnym meta.base kalki; override'y pozycji rozstrzygniete przez uzytkownika sa zachowane. Serializacja `_deltaSerializeOps` przenumerowuje seq do ciaglych 1..N (walidator odrzuca nieciagle) i liczy checksumy na nowo; plik przechodzi validateDeltaText. Przycisk pokazuje liczbe N na zywo i chowa sie, gdy reszta pusta. Opy „done" z wejscia (mapa miala to przed kalka) nie wchodza do reszty.
- **Testy (w tym samym commicie):** nowy scenariusz E8.remainder (6 asercji: 35 przed apply, 7 po apply = 3 konflikty + 4 niewykonalne, liczba na przycisku, roundtrip serializacji przez validateDeltaText z seq 1..7 i oryginalnymi labelkami, ukrycie przy pustej reszcie). Watchdog zlapal prawdziwy bug projektowy: seq nieciagle w reszcie (walidator fail-closed) → przenumerowanie.
- Regresja lokalna: pelny `run-all.sh` PASS (13 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.30.0 — naming: „pusta custom line" zamiast „tlumika", filtr „Zrobione"

- **Przyczyna:** „tlumik"/„suppressor" to zargon aplikacji — w Mudletcie taki termin nie istnieje; mechanika to pusta custom line (0 punktow) w przeciwnym kierunku, ktora wycisza rysowanie domyslnej linii wyjscia. Uzytkownik czytal „tlumik" i nie wiedzial, co to jest. Filtr „Bez roboty" byl niejednoznaczny (brzmial jak „nic nie trzeba", a nie „efekt juz jest").
- **Fix:** user-facing „tlumik"/„suppressor" → „pusta custom line" (notatka konfliktu ADD_SUPPRESSOR + statyczne placeholdery dialogow walidatora; dynamiczne tresci i etykiety warstw mowily juz „puste custom lines"/„podwojne linie"). Filtr done: „Bez roboty" → „Zrobione" (+ tooltip markera ✓). Tooltip „Zapisz zaktualizowana kalke": „Zapisuje zmiany naniesione w tej sesji (nie nienaniesione opy kalki)". Fixture tests/fixture_demo.arkdelta: label op36 bez „tlumika" (checksumy przeliczone funkcjami aplikacji). Nazwy wewnetrzne (funkcje, typy opow, klasy CSS) bez zmian — to identyfikatory, nie UI.
- **Testy (w tym samym commicie):** nowy scenariusz E8.naming (4 asercje: ADD_SUPPRESSOR na zajetym kierunku = hard z notatka o pustej custom line, tooltip dp-rebase, label op36 w fixture). E7.texts.filter-label: „Zrobione".
- Regresja lokalna: pelny `run-all.sh` PASS (13 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.29.0 — „Pokaz" przy opach zrobionych: podswietlenie realnego obiektu (M6d)

- **Przyczyna:** op naniesiony (done) mial dalej przycisk „Efekt", ktory pokazywal DUCHA — podglad tego, co kalka chciala zrobic. Po naniesieniu to bez sensu: uzytkownik chce zobaczyc realny obiekt na mapie, nie hipotetyczny efekt.
- **Fix:** wiersze done dostaja przycisk „Pokaz" zamiast „Efekt": skok do obiektu + stale podswietlenie REALNEGO pokoju na zywej mapie (pelna zielona ramka + znacznik ✓, bez kreskowania — odroznienie od duchow). Warstwa `_deltaRealHl` (seq -> pozycja na zywo), czyszczona razem z duchami (`_deltaGhostReset`, zamkniecie panelu, nowa kalka). „Ukryj" chowa podswietlenie. Op bez zywej geometrii (np. usuwanie) = czytelny toast zamiast pustego skoku. Opy ok/hard zachowuja „Efekt" i duchy bez zmian.
- **Testy (w tym samym commicie):** nowy scenariusz E8.realshow (6 asercji: done → „Pokaz", hard → „Efekt", podswietlenie na zywych wspolrzednych pokoju, brak ducha, Ukryj chowa, brak geometrii = bez podswietlenia i bez wyjatku). tests/delta.js: asercja literalu przycisku zaktualizowana do wariantu M6d.
- Regresja lokalna: pelny `run-all.sh` PASS (13 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.28.0 — karta szczegolow konfliktu: tabela parametr | aktualnie | w kalka (M6c)

- **Przyczyna:** diff konfliktu/edycji renderowal sie wielkim tekstem na kanwie mapy (przy duchu) — nieczytelny, zaslanial mape, bez podzialu na to co jest na mapie a co niesie kalka.
- **Fix:** na kanwie zostala zwarta odznaka „ΔN" (liczba zmienionych parametrow), a pelne szczegoly laduja w karcie w panelu recenzji: tabela z kolumnami „parametr | aktualnie na mapie | w kalce", zawijanie dlugich wartosci, przewijanie, zamykana krzyzykiem i razem z duchem (przycisk Ukryj). Karta pokazuje tez wiersze kontekstowe: dla ADD_EXIT w zajetym kierunku — kierunek + aktualny i docelowy cel; dla kolizji pozycyjnej ADD_ROOM/MOVE_ROOM — pole, okupant (#N) i intencja kalki. Dane diffu przeszly na strukture wierszy `_deltaRoomDiffRows` ({parametr, przed, po}); `_deltaRoomDiff` zostal jako cienki wrapper zwracajacy te same stringi co wczesniej (kompatybilnosc E7.diff).
- **Testy (w tym samym commicie):** nowy scenariusz E8.confcard (7 asercji: karta EDIT_ROOM z wierszem nazwa + wartosci mapa/kalka, karta ADD_EXIT z kierunkiem i celami, karta kolizji z okupantem #13 i intencja, op bez szczegolow nie otwiera karty, powrot karty po Efekt, Ukryj chowa karte razem z duchem). tests/delta.js: stub `_deltaCardHide` w kontekscie node (funkcja karty mieszka w warstwie UI; zachowanie testowane empirycznie).
- Regresja lokalna: pelny `run-all.sh` PASS (13 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.27.0 — opy pominiete przy Zastosuj: auto-odznaczenie + trwaly dopisek (M6b)

- **Przyczyna:** konflikt z twardym guardem (np. zajety kierunek, zajete pole) po „Zastosuj" zostawal zaznaczony na liscie — kolejne „Zastosuj" mielilo go bez efektu („Naniesiono: 0 · Pominieto: 1"), a przycisk i liczniki klamaly, ze jest cos do zrobienia.
- **Fix:** warstwa sesyjna `_deltaSkippedSeqs` (jak `_deltaAppliedSeqs` dla naniesionych): opy skipniete przez guard przy Zastosuj traca zaznaczenie i dostaja trwaly dopisek do notatki „pominięte przy ostatnim Zastosuj". Zostaja w Konfliktach (konflikt jest nadal aktywny), ale nie wspinaja sie w kolejne Zastosuj — uzytkownik moze je swiadomie odznaczyc/zaznaczyc/rozstrzygnac. Przycisk spada do „Zastosuj zaznaczone (0)" i wylacza sie. Czyszczenie przy otwarciu nowej kalki i zamknieciu panelu.
- **Testy (w tym samym commicie):** nowy scenariusz E8.skipflag (6 asercji: flagi odznaczenia + dopisek, przycisk (0)/disabled, trwalosc dopisku przy kolejnych apply, ponowne zaznaczenie → znowu skip → dopisek bez duplikatu). E6.reapply: checked1/checked3 = [] + asercja trwalosci dopisku (3 opy).
- Regresja lokalna: pelny `run-all.sh` PASS (13 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.26.0 — MOVE_ROOM z guardem zajetosci: Zastosuj juz nie naklada pokoi (M6a)

- **Przyczyna:** klasyfikator oznaczal kolizje pozycyjne ADD_ROOM i MOVE_ROOM tak samo (konflikt, do rozstrzygniecia przez Autopozycje/Recznie), ale wykonawca traktowal je roznie: ADD_ROOM mial zywotny guard zajetosci (skip, zero mutacji), a MOVE_ROOM nie — zwykle „Zastosuj" przenosilo pokoj na zajete pole i nakladalo pokoje na siebie (potwierdzone eksportami .arkmap z testow: #14 wyladowal na #13).
- **Fix:** applyDelta MOVE_ROOM dostal ten sam fail-closed guard co ADD_ROOM (zajeta komorka docelowa → skip „komorka docelowa zajeta", zero mutacji; sciezka override autopozycji/recznej bez zmian). Notatka konfliktu MOVE_ROOM ujednolicona z ADD_ROOM: „pole docelowe (x,y,z) jest zajete przez pokoj #N — kolizja; wybierz Autopozycje / Recznie albo odznacz op".
- **Testy (w tym samym commicie):** nowy scenariusz E8.moveguard (8 asercji: zwykly apply nie rusza #14, zero stacku na #13, op zostaje konfliktem; po autopozycji #14 laduje na pozycji zastepczej i klasa przechodzi w done). Macierz E2 MOVE_ROOM.conflict: applied=0/skipped=1 + post-check braku stacku. E3.occupied-override: op3 MOVE na zajete pole = skip (semantyka „stack jak drag" wycofana). E6.reapply/E7.texts/E7.marks: liczniki po apply (28 naniesionych, guardy 28/29/33). run-all.sh: dopiete grupy E7/E8.
- Regresja lokalna: pelny `run-all.sh` PASS (13 harnessow node + kampania empiryczna SMOKE+E0–E8, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## repo — katalog uploads/ na wrzutki spoza czatu

- **Zmiana:** dodany przez wlasciciela katalog `uploads/` (z `uploads.txt`) sluzy do przekazywania plikow, ktorych nie da sie wrzucic do czatu. Paczka `map_master3.zip` (eksporty .arkmap z testow panelu kalki + zapisane kalki) zostala przejrzana i usunieta z repo — katalog i plik informacyjny zostaja na przyszlosc.
- Repo-only: bez zmian w aplikacji, bez podbicia wersji.

## v1.25.0 — panel recenzji kalki ze zmiennym rozmiarem (M5e)

- **Przyczyna:** panel miał sztywną szerokość 560px i max-wysokość 62vh — przy długich kalkach (dziesiątki opów z notatkami i diffami) lista wymagała ciągłego przewijania, a szeroki ekran pozostawał niewykorzystany.
- **Fix:** uchwyt w prawym dolnym rogu (gradientowe „zadrapania", podświetlenie na hover) — przeciąganie zmienia szerokość i wysokość z clampami: min 360×220 (bez absurdów), max 92vw × 80vh; po ręcznym przesunięciu panelu dodatkowy clamp do dolnej krawędzi okna. Współistnieje z dotychczasowym przeciąganiem za nagłówek (osobne handlery, brak kolizji).
- **Testy (w tym samym commicie):** nowy scenariusz E7.resize (3 asercje na syntetycznych MouseEventach: wzrost o +120/+60 px, clamp minimalny, clamp maksymalny).
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E7, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.24.0 — panel kalki: czytelne przyciski na podświetlonym wierszu + pigułka autopozycji (M5d)

- **Przyczyna:** mini-przyciski wiersza („Efekt"/„Ukryj"/„Autopozycja"/„Ręcznie") dziedziczyły `background:none` i przygaszony `--dim` z `.vd-btn` — na podświetlonym wierszu zlewały się z tłem. Wynik autopozycji to był goły tekst w kolorze akcentu.
- **Fix:** `.dp-row .dp-mini` z własnym tłem i jaśniejszą ramką (wzmocnione na hoverze wiersza i przycisku), hover wiersza minimalnie mocniejszy, chip pozycji zastępczej jako pigułka (ramka + tło akcentu + pogrubienie).
- **Testy (w tym samym commicie):** nowy scenariusz E7.contrast (3 asercje na stylach obliczonych: własne tło i jasny tekst przycisku, pigułka autopozycji po `_deltaAutoplace`).
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E7, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.23.0 — panel kalki: checkbox tylko tam, gdzie jest decyzja + czytelna legenda (M5c)

- **Przyczyna:** wiersze „niewykonalne" miały wyszarzony checkbox (martwy element sugerujący możliwość zaznaczenia), a „naniesione" — aktywny, choć klikanie nic nie dawało. Próbki kolorów w legendzie duchów to był glif „■" w tekście — mikry i ledwo widoczny.
- **Fix:** checkbox renderowany tylko przy klasach decyzyjnych (do naniesienia / konflikt). Przy „niewykonalne" statyczny marker ⊘, przy „bez roboty" marker ✓ (z podpowiedzią w title). Legenda: glify zastąpione próbkami 12×12 px (rozmiar checkboxa) z zaokrągleniem i obramowaniem.
- **Testy (w tym samym commicie):** nowy scenariusz E7.marks (8 asercji: liczba checkboxów = tylko ok/hard, zero wyszarzonych, markery ⊘/✓, 4 próbki legendy o realnym rozmiarze 12px, stan po apply: checkboxy tylko przy 2 konfliktach, 30 markerów ✓).
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E7, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.22.0 — teksty panelu kalki po ludzku: co się stanie, gdy zaznaczę i zastosuję (M5b)

- **Przyczyna:** notatki klasyfikacji były pisane językiem silnika („pokój zmieniony upstream — naniosę wersję z kalki", „guard odmówi"), a klasa „naniesione" zlewała dwa różne stany: mapa miała to przed kalką vs panel przed chwilą naniösł — użytkownik nie wiedział, co jest juz załatwione i co zrobi „Zastosuj".
- **Fix:**
  - Wszystkie notatki konfliktów mówią wprost o skutku: „Zastosuj nadpisze go wersją z kalki", „Zastosuj pominie ten op (mapa bez zmian)", „Zastosuj nałoży pokoje na siebie (albo wybierz Autopozycję / Ręcznie)", „Zastosuj usunie go mimo to" itd.
  - „już naniesione" → „już na mapie" (w tym wariantach: „to samo pole i nazwa → pokój #N", „zmieniane pola zgodne", „obszar/etykieta już jest na mapie").
  - Badge done rozróżnia źródło: „już na mapie" (było przed kalką) vs „naniesione ✓" (panel naniósł w tej sesji — flaga `it.session` z warstwy `_deltaAppliedSeqs`).
  - Filtr „Naniesione" → „Bez roboty" (grupuje oba źródła done).
  - Explainer pod filtrami: „Zastosuj" nanosi tylko zaznaczone; konflikt = mapa zmieniła się od zapisu kalki, notatka mówi co się stanie.
- **Testy (w tym samym commicie):** nowy scenariusz E7.texts (7 asercji: treści notatek konfliktów, badge „już na mapie", przemianowany filtr, explainer, 29× badge „naniesione ✓" po apply). Flip konstrukcyjny w tests/delta.js: asercja ADD_EXIT hard trzymała się starego tekstu „guard" → nowy „pominie ten op" (wykryte przez harness — system zadziałał).
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E7, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.21.0 — diff-wizualizacja kalki: edycje i wyjścia wreszcie widać (M5)

- **Przyczyna:** duchy EDIT_ROOM/EDIT_EXIT to było gołe podświetlenie kwadratu pokoju — zero informacji, CO się zmienia. Duchy wyjść nie rysowały się wcale, gdy drugi koniec był pokojem kalki w nowym obszarze (sid bez rozwiązania → brak geometrii), a gdy się rysowały, były cienką przerywaną linią bez kierunku — nierozróżnialną od prawdziwego wyjścia. Klik w wiersz „Dodanie obszaru" nie robił nic.
- **Fix:**
  - `_deltaRoomDiff(before, after, resolve)` — czytelna lista zmian (nazwa/env/symbol/waga/ukrycie/pozycja, wyjścia ±/zamiana, wyjścia specjalne, custom lines, drzwi, zamki, wagi wyjść, user_data); sid-y celów tłumaczone na numeryczne id z klasyfikacji.
  - Wiersz panelu: linia diffu pod etykietą opu edycji — widać zmianę bez włączania ducha.
  - Duch edycji: podświetlenie + etykieta z diffem przy pokoju (max 3 linie + licznik).
  - Duch wyjścia: grubsza linia, grot strzałki na końcu, podpis kierunku (`+n` / `−n`) w połowie. Fallback: cel w nierozwiązywalnym obszarze kalki → stub-strzałka w kierunku wyjścia na znanym końcu; źródło nierozwiązywalne → podświetlenie celu.
  - ok-ADD_AREA: klik w wiersz pokazuje toast z nazwą i liczbą pokoi w kalce (obszar powstaje dopiero po Zastosuj; done-ADD_AREA jak dawniej skacze do obszaru).
- **Testy (w tym samym commicie):** nowy scenariusz E7.diff (9 asercji: diff opów EDIT_ROOM/EDIT_EXIT z demo-kalki, linie diffu w panelu, duch hl+diff, pełny duch wyjścia z kierunkiem, geometria dla celu z kalki, stub dla nierozwiązywalnego obszaru, areaInfo + toast dla ADD_AREA).
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E7, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.20.0 — fix buga #12: powtórne „Zastosuj" z panelu recenzji zalewało stos undo

- **Przyczyna (3 silniki, potwierdzone empirycznie na fixture + demo-kalce 36-op):** po „Zastosuj" panel re-klasyfikował opy z cienia sekwencyjnego, który maskuje stan done dla opów nadpisujących się wzajemnie w obrębie kalki — 13 opów wracało jako zaznaczone, a 6 z nich nanosiło się przy każdym kolejnym kliku (+6 wpisów undo na klik, aż do capa 50, wypychając prawdziwą historię edycji): (1) opy CL/etykiet nadpisywane przez późniejsze opy tej samej kalki (cień odtwarza je od zera — wcześniejsze wiecznie „ok"), w tym ADD_LABEL dokładający duplikat etykiety przy każdym replayu; (2) para ADD_AREA+DELETE_AREA tego samego obszaru oscylowała (co klik tworzyła i kasowała obszar); (3) twarde guardy (zajęta komórka/kierunek) zostawały zaznaczone wiecznie (skip bez szkody).
- **Fix:** warstwa sesyjna `_deltaAppliedSeqs` — `applyDelta` zwraca listę realnie naniesionych seq (`appliedSeqs`); panel oznacza je po re-klasyfikacji jako done z notatką „naniesione z tej kalki", odznacza na zawsze i wyklucza z puli `only` przy kolejnych apply. Panel ufa własnemu apply bardziej niż ponownemu wyliczeniu z cienia. Zestaw czyszczony przy otwarciu nowej kalki i zamknięciu panelu.
- **Testy (w tym samym commicie):** nowy scenariusz E6.reapply (watchdog) — fixture + `tests/fixture_demo.arkdelta` (36 opów, wszystkie klasy), trzy kliki „Zastosuj" przez realny przycisk panelu: apply1 nanosi dokładnie 29 (skipuje tylko twarde guardy 28/33), apply2/apply3 = ZERO nowych wpisów undo, klasy zamrożone, zaznaczone zostają tylko nierozstrzygnięte konflikty, 29 opów z notatką „naniesione z tej kalki".
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E6, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.19.0 — guard zajętości pola przy dodawaniu pokoju + kolizja przy przeniesieniu między obszarami

- **Przyczyna:** `addRoomAtPosition` (klik „Dodaj pokój tutaj") nie miał żadnego guarda — cicho stawiał nowy pokój na zajętym polu (ta sama klasa cichego stacku co F5 w kałkach). `commitMoveRoomToArea` mógł wylądować na zajętej pozycji w docelowym obszarze bez żadnej informacji.
- **Fix:**
  - `addRoomAtPosition`: blokada zawsze (przez `_roomCollisionAt`) — zero mutacji, zero undo, toast wskazujący kolidujący pokój. Świadomie **bez wymuszenia Shift** (spójnie z F5: dodawanie wymaga wolnej komórki; nałożenie można uzyskać przeniesieniem z Shiftem — v1.17.0).
  - `commitMoveRoomToArea`: po przeniesieniu sprawdzana kolizja na docelowej pozycji (wprost po `toArea.rooms`, niezależnie od nawigacji) — toast ostrzegawczy zamiast czystego sukcesu. Celowo **nieblokujące**: użytkownik jawnie wybrał obszar docelowy, a blokowanie całego przeniesienia przez jedną komórkę byłoby gorszym UX.
- **Testy (w tym samym commicie):** nowy scenariusz E5.add-guard (7 asercji: blokada na zajętym z zerowym śladem, kontrolne dodanie na wolnym, konstrukcja kolizji międzyobszarowej + toast). Flip konstrukcyjny: `_e3Text` (builder kalki E3) opierał się na cichym stacku — dwa `addRoomAtPosition(9999,9999)`; zastąpione dedykowanym `_e3CommitAddRoom` (wpis undo/deltaLog identyczny jak w `addRoomAtPosition`, guard pomijany jawnie). Wykryte przez istniejące watchdogi E3 (21 asercji) — system zadziałał zgodnie z założeniem.
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E6, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.18.0 — podgląd kolizji podczas przeciągania pokoju (czerwony cel = zajęty)

- **Przyczyna:** guard z v1.17.0 blokuje drop na zajęte pole, ale podczas samego przeciągania użytkownik nie widział, że celuje w zajętą komórkę — dowiadywał się dopiero z toastu po upuszczeniu.
- **Fix:** nowy getter `_editDragCollision()` (to samo źródło prawdy co polityka ruchu: `_roomCollisionAt`), użyty w podglądzie dragu w `drawRooms` — cel zajęty = czerwona, grubsza ramka z krzyżykiem (zamiast pomarańczowej). Podgląd na żywo, w rytm mousemove.
- **Testy (nowy scenariusz w tym samym commicie):** E5.move-guard-preview (5 asercji) — getter zwraca kolidujący pokój dla zajętego celu, null dla wolnego, null poza dragiem; stan po teście posprzątany.
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E6, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.17.0 — guard zajętości pola przy przenoszeniu pokoju (drag + strzałki)

- **Przyczyna:** przenoszenie pokoju w edycji (drag myszką i strzałki) pozwalało po cichu położyć pokój na zajętym polu — jedyną informacją był ulotny toast po fakcie, a nałożenie zostawało na mapie.
- **Fix:** nowy helper `_roomCollisionAt(x, y, z, excludeId)` (na `roomsZ` — z natury zawężone do bieżącego obszaru i poziomu) i wspólna polityka `_tryMoveRoomWithPolicy(room, toX, toY, opts)` zwracająca `'moved' | 'forced' | 'blocked' | 'noop'`. Obie ścieżki ruchu przepięte na politykę:
  - **Drag:** drop na zajęte pole = **blokada** — pokój wraca na start, zero śladu (brak wpisu undo/deltaLog, crc bez zmian), panel pozycji wraca do współrzędnych źródłowych; toast z podpowiedzią „przytrzymaj Shift, aby wymusić". **Shift przy upuszczeniu = wymuszenie** (nałożenie dozwolone, toast informacyjny zostaje).
  - **Strzałki:** blokada zawsze — Shift pozostaje krokiem ×5 (nie może być jednocześnie wymuszeniem); wymuszenie dostępne tylko myszką. Toast bez podpowiedzi o Shift.
  - Wyrównanie warunku `z` w strzałkach (stara pętla nie sprawdzała poziomu) — **kosmetyka, zero zmiany zachowania**: `roomsZ` i tak zawiera wyłącznie pokoje z bieżącego `state.z`.
- **Świadomie bez zmian:** kałki (.arkdelta) — panel oznacza kolizję MOVE jako konflikt przed naniesieniem, surowy apply to tryb force; poza zakresem tego kroku.
- **Testy (nowy scenariusz w tym samym commicie):** E5.move-guard (20 asercji) — kolizja samokonstruowana (niezależna od zawartości fixture): kontrakt helpera (hit / excludeId / wolna komórka), noop bez śladu, moved+undo, blocked z zerowym śladem (undo/deltaLog/crc), forced+undo, semantyka strzałek (blocked + toast bez Shifta), crc końcowy = baza.
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E6, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.16.0 — fix O1: dialog usuwania pokoju — jedno źródło prawdy dla handlera confirm

- **Przyczyna:** przyciski „Usuń pokój" obu dialogów (`dlg-delete-room`, `dlg-delete-room-refs`) miały dwa nakładające się wiringi: inicjalizacyjny (`deleteRoom(state.selected)`) i właściwy, ustawiany przy każdym otwarciu w `showDeleteRoomDialog(roomId)` (domknięcie na roomId). Dziś wygrywał właściwy (późniejszy zapis), ale inicjalizacyjny był latentną pułapką: jakakolwiek przyszła ścieżka otwierająca dialog bez rebinding spowodowałaby usunięcie aktualnie zaznaczonego pokoju zamiast tego z dialogu (utrata danych).
- **Fix:** usunięty wiring inicjalizacyjny obu dialogów; jedynym źródłem handlera confirm jest `showDeleteRoomDialog` (domknięcie na roomId). Zachowanie runtime bez zmian — fix strukturalny + watchdog.
- **Testy (nowy scenariusz w tym samym commicie):** E5.del-o1 (7 asercji) — otwarcie dialogu dla pokoju A, zmiana zaznaczenia na B, klik „Usuń pokój" → usuwany jest A, B nietknięty, deltaLog +1 DELETE_ROOM, dialog zamknięty.
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node + kampania empiryczna SMOKE+E0–E6, 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.15.0 — fix F1: klasyfikator z cieniem stanu (symulacja sekwencji opów w classifyDelta)

- **Przyczyna:** `classifyDelta` oceniał każdy op wyłącznie wobec stanu sprzed kalki. Opy zależne od wcześniejszych opów tej samej kalki (sekwencje: add→edit→delete, sid-y z ADD_ROOM/ADD_AREA/ADD_LABEL) były degradowane (hard/impossible) lub klasyfikowane niespójnie z realnym wykonaniem; panelowy re-apply rozbiegał stan (crc rósł z każdym apply).
- **Fix:** klasyfikator buduje cień stanu (głęboki klon `roomById`/`roomArea`/`areas`/`colors` z przełinkowaniem `area.rooms` do klonów) i po sklasyfikowaniu każdego opu symuluje jego surowe wykonanie na cieniu (`_sim`, z lustrzanymi guardami: zajętość komórki F5, guard wyjść A12, skip EDIT_CL F3, no-move F6). Sid-y rozwiązują cienie map (`sidShRoom/sidShArea/sidShLabel`, świeże id powyżej live max); DELETE_AREA/EDIT_AREA rozwiązują sid przez `resA`. Lokalna mapa kierunków przeciwnych `_DELTA_OPP` (klasyfikator nie zależy od globali aplikacji).
- **Efekty:** E1.roundtrip — wszystkie 27 opów kalki klasyfikowane „ok" (dawne degradacje sekwencyjne EDIT_CL / DELETE_SUPPRESSOR / EDIT_EXIT / DELETE_AREA zniknęły); przy re-apply DELETE_AREA i DELETE_SUPPRESSOR są rozstrzygalne; **panelowy drugi apply zbiega do tego samego stanu** (crc2 == crc1 — spójny replay, nie rozjazd). Surowy apply (force, bez klasyfikacji) celowo bez zmian — poza zakresem F1.
- **Testy (flipy w tym samym commicie):** E1.roundtrip (cls-ok27, cls-knownseq), E1.idempotent (done 13→12/27; impossible-set 6→4 typy; panel 3/5→6/5; panel-diverges→panel-converges); delta.js T8 rozszerzony o opy 24–29 (EDIT_ROOM hard, ADD_EXIT ok/hard, MOVE_ROOM ok/done/hard-kolizja — klasyfikowane na cieniu po wcześniejszych opach).
- Regresja lokalna: pełny `run-all.sh` PASS (13 harnessów node, w tym delta.js: 212 asercji; kampania empiryczna SMOKE+E0–E6 — 0 FAIL).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.14.0 — fix F2 (część klasyfikatora): done-detection EDIT_ROOM/EDIT_EXIT po zmienianych polach

- **Przyczyna:** klasyfikator EDIT_ROOM/EDIT_EXIT rozpoznawał „done" tylko przy pełnej zgodności live == after. Gdy późniejszy op tej samej kalki (np. EDIT_EXIT) zmienił inne pola tego pokoju, wcześniejszy op wracał jako „hard" i panelowy re-apply nadpisywał te późniejsze zmiany (rozjazd stanu przy drugim apply).
- **Fix:** nowy helper `_deltaEffectApplied(live, before, after)` — porównuje wyłącznie pola zmieniane przez op (diff before→after); zgodność na nich = „done (zmieniane pola zgodne)". Rozjazd na polach niezmienianych nie blokuje done; rozjazd na polach zmienianych → jak dotychczas (hard/ok).
- **Świadomie bez zmian (udokumentowane asercjami):** delete-opy na nieobecnych celach klasyfikowane „impossible" (re-apply = skip, zero mutacji — idempotentne z natury); pary sekwencyjne wewnątrz kalki (add-then-delete CL/tłumika, etykiety sid-area) — to wymaga symulacji kolejnych opów w klasyfikatorze (osobny krok).
- **Testy (flipy w tym samym commicie):** E1.idempotent done 12→13/27 (EDIT_ROOM), panelowy drugi apply 4→3 (EDIT_ROOM już nie re-aplikowany), nowa asercja impossible-set (6 delete-opów); delta.js +2 asercje jednostkowe `_deltaEffectApplied` (done mimo rozjazdu na innych polach / nie-done przy rozjazdu na zmienianym).
- Regresja lokalna: **667 OK / 0 FAIL** (13 harnessów node) + **436 OK / 0 FAIL** (kampania empiryczna SMOKE+E0–E6).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.13.0 — fix F3: applyDelta EDIT_CL skipuje nieistniejącą CL (zbieżność classify↔apply)

- **Przyczyna:** klasyfikator oceniał edycję nieistniejącej custom line jako „impossible" (panel odznaczał op), ale surowe `applyDelta` tworzyło CL „po cichu" — rozjazd klasyfikacji i wykonania.
- **Fix (`applyDelta`, case EDIT_CL):** brak `custom_lines[dir]` → skip „custom line nie istnieje" (jak DELETE_CL / DELETE_SUPPRESSOR). Dodanie CL z kalki pozostaje w gestii ADD_CL.
- **Testy (flip w tym samym commicie):** E2.EDIT_CL.del — apply 1/0 → 0/1, CL nie powstaje. Pozostałe komórki EDIT_CL (clean/mod/conflict) i E1 bez zmian (w E1 CL istnieje z wcześniejszego ADD_CL kalki).
- Regresja lokalna: **665 OK / 0 FAIL** (13 harnessów node) + **435 OK / 0 FAIL** (kampania empiryczna SMOKE+E0–E6).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.12.0 — fix F5/F4: applyDelta ADD_ROOM nie stackuje na zajętej komórce (guard na żywo)

- **Przyczyna:** żywotny guard zajętości istniał tylko na ścieżce override („pozycja zastępcza zajęta"); surowy ADD_ROOM (bez override'u) aplikował się na zajętej komórce i tworzył stos pokoi (F4/F5).
- **Fix (`applyDelta`, case ADD_ROOM):** po normalizacji współrzędnych sprawdzane `_deltaRoomAt(area, x, y, z)` — zajęta komórka → skip „komórka docelowa zajęta", zero mutacji, sid nie rejestrowany (kaskadowe skipy opów zależnych przez istniejący mechanizm nieznanego sid). Spójne ze ścieżką override i z klasą „hard" klasyfikatora.
- **Polityka MOVE bez zmian:** MOVE_ROOM na zajętą komórkę nadal się wykonuje (jak drag w UI) — udokumentowane asercją E3.occupied-override.f6-noop.
- **Testy (flipy w tym samym commicie):** E2.ADD_ROOM.conflict (apply 1/0 → 0/1; post: brak stosu, zostaje tylko upstream), E3.occupied-override (nowa asercja skip2 z powodem; f5-stack: 2→1 pokój; applied 3→2, skipped 1→2). E1.idempotent bez zmian (drugi apply ADD_ROOM ląduje w zduplikowanym obszarze na wolnej komórce).
- Regresja lokalna: **665 OK / 0 FAIL** (13 harnessów node) + **435 OK / 0 FAIL** (kampania empiryczna SMOKE+E0–E6; E3 +1 asercja).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.11.0 — fix F7: przycisk „Wczytaj .arkdelta…" odlokowany w trybie edycji

- **Przyczyna:** `btn-load-arkdelta` miał trwały atrybut `disabled` w markup i żadne miejsce w kodzie go nie odlokowywało — jedyny UI-owy punkt wejścia wczytywania kalki był martwy (handler `#fi-arkdelta` change działał poprawnie, co potwierdziła grupa E4).
- **Fix:** `updateEditUI()` przełącza `disabled = !editMode` (+ tytuł-podpowiedź poza edycją). Handler kliku nadal broni się sam (toast „Wczytanie kalki wymaga trybu edycji") — podwójny guard.
- **Testy:** flip watchdogów E4.guard (aktywny w edycji; disabled poza edycją przez `updateEditUI`; klik poza edycją → guard toast; zero dialogów) + nowa asercja node (wiring w `updateEditUI`).
- Regresja lokalna: **665 OK / 0 FAIL** (13 harnessów node) + **434 OK / 0 FAIL** (kampania empiryczna SMOKE+E0–E6).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.10.0 — fix F6: applyDelta MOVE_ROOM realnie przenosi pokój (apply = undo = redo)

- **Przyczyna:** `commitMoveRoom` jest data-only (sam wpis undo) — w realnym UI handler draga mutuje pozycję pokoju PRZED commitem, a `applyDelta` tego nie robił. Efekt: op MOVE_ROOM z kalki był cichym no-op — `applied` rósł, deltaLog i rebase rejestrowały ruch, ale pokój zostawał w miejscu, a `redoAction` po `undoAction` ruch materializował (apply != redo).
- **Fix (`applyDelta`, case MOVE_ROOM):** mutacja pozycji przed commitem (wzorzec 1:1 z handlera draga: zapis from, ustaw room.x/y/z, commit) + `buildRoomsZ()` po ruchu + skip „pokój już jest na tej pozycji" dla opu bez ruchu (wcześniej: no-move guard w `commitMoveRoom` milkł, a `applied` i tak rósł).
- **Polityka zajętości MOVE bez zmian (udokumentowana):** MOVE na zajętą komórkę wykonuje się — tak jak drag w UI (toast o kolizji, brak guardu). Asercja E3.occupied-override.f6-noop dokumentuje stack.
- **Testy (flip watchdogów F6 w tym samym commicie):** E3.apply.op3-f6/op3-f6-origin (pokój realnie na pozycji zastępczej), E3.apply.log (deltaLog zgodny z realnym ruchem), E3.rebase.f6-stays (MOVE działa też na czystej bazie), E3.occupied-override.f6-noop (stack 2 na zajętej — udokumentowany), E6.redo-f6.* (apply przenosi, undo cofa, redo przywraca — spójne). Skutki uboczne spójne z fixem: E1.idempotent done-coverage 11→12/27 (MOVE_ROOM wykrywany jako done przy re-klasyfikacji), drugi apply panelowy 5→4, surowy drugi apply 22→21 (no-move skip) — watchdogi F2 zaktualizowane do nowych liczb; kalki budowane w E1/E2 mutują pozycję przed `commitMoveRoom` (wzorzec draga), co naprawia E1.roundtrip.crc.
- **Pinezki wersji:** `tests/delta.js` 3x → v1.10.0.
- Regresja lokalna: **665 OK / 0 FAIL** (13 harnessów node) + **434 OK / 0 FAIL** (kampania empiryczna SMOKE+E0–E6, Chromium headless).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## Kampania empiryczna kalki .arkdelta (E0–E6) — 434 asercje w prawdziwej przeglądarce (bez zmian w aplikacji)

- **Harness empiryczny (`tests/empirical_driver.html` + `tests/empirical.sh`):** driver ładuje PEŁNĄ aplikację w iframe (ten sam origin przez lokalny http.server) i wykonuje scenariusze przez most eval — prawdziwe commity, prawdziwe handlery DOM (file input, menu kontekstowe, przyciski panelu), zero mocków. Wyniki jako linie `R|PASS/FAIL|id|msg` w dumpowanym DOM; runner: Chromium headless (`--virtual-time-budget`), fixture `map_master3.dat` (release 0.205.0). Grupy i pokrycie:
  - **SMOKE (12):** boot, dostępność funkcji rdzenia, załadowanie fixture.
  - **E0 (17):** równoważność wejścia .dat vs .arkmap — identyczny crc stanu, identyczna klasyfikacja, identyczny odcisk po apply, identyczne baseCheck (format wejściowy nie robi różnicy — zmierzone, nie założone).
  - **E1 (13):** roundtrip wszystkich 25 typów opów (27 opów przez prawdziwe commity) — delta walidna, apply 27/27, crc po apply == crc po commitach (bezstratność).
  - **E2 (216):** pełna macierz 25 typów × 4 stany upstream (czysty / zmodyfikowany / usunięty / konflikt = 100 komórek, 90 realnych + 10 uzasadnionych N/A) — klasyfikacja + apply + post-stan per komórka.
  - **E3 (70):** kolizje pozycji — autopozycja zweryfikowana niezależną wyrocznia spiralną (determinizm, rozłączność komórek wsadu, wolność na żywo), ręczne wskazanie przez prawdziwe zdarzenia canvas (mousedown/mouseup/contextmenu/Escape), apply z override'ami (efektywne współrzędne w deltaLog i rebazie), zajęty override → skip „pozycja zastępcza zajęta" bez mutacji.
  - **E4 (46):** pliki adversarial przez prawdziwy `#fi-arkdelta` change: śmieci/nie-JSON/ucięty JSON/zła wersja, nadpisany op (lokalizacja `#n` w komunikacie), nadpisana suma zbiorcza, nieznany typ, nieciągłe seq, zły ops_count, klucz `__proto__`, odwołanie forward do sid, limity 8 MB / 5000 opów, pusta kalka, mismatch i nobase przez dialog. Żaden odrzucony plik nie tknie stanu mapy.
  - **E5 (37):** UI end-to-end — zapis kalki przyciskiem (przechwyt Bloba, walidacja treści), wczytanie → panel → filtry → checkboxy → „Zastosuj zaznaczone" (tylko zaznaczone, re-klasyfikacja do done), menu kontekstowe canvasu (dodaj/usuń pokój) z liczeniem wywołań commitów (dokładnie 1×).
  - **E6 (23):** przeploty undo/redo z apply — undo cofa apply kalki wpis po wpisie (deltaLog lustrzany), LIFO z lokalnymi commitami, nowy commit czyści redoStack.
- **Watchdogi (asercje odwrotne):** znane odstępstwa bieżącego zachowania są skodyfikowane jako asercje opisujące stan faktyczny — padną, gdy klasyfikator/apply się poprawi, wymuszając aktualizację oczekiwań: F1 (klasyfikator per-op, bez symulacji wcześniejszych opów kalki — np. EDIT_CL po ADD_CL = impossible), F2 (ponowne apply tej samej kalki nie jest w pełni idempotentne — done-coverage 11/27, panelowa druga aplikacja dywerguje), F3 (applyDelta EDIT_CL tworzy CL mimo klasy impossible), F4/F5 (ADD_ROOM bez override na zajętej komórce nakłada się — guard działa tylko dla pozycji zastępczych), F6 (applyDelta MOVE_ROOM to ciche no-op — `commitMoveRoom` jest data-only i applyDelta nie mutuje pozycji; `applied` rośnie, deltaLog/rebase rejestrują ruch, a redo po undo ruch materializuje), F7 (przycisk „Wczytaj .arkdelta…" ma trwały `disabled` w markup — żadne miejsce w kodzie go nie odlokowuje; handler `#fi-arkdelta` change działa poprawnie).
- **CI:** `tests/run-all.sh` odpala kampanię empiryczną po harnessach node (SKIP bez Chromium), `ci-tests.yml` instaluje Chromium headless przez Playwright i wydłuża bramkę czasową joba do 25 min.
- Regresja lokalna: **434 OK / 0 FAIL** (SMOKE+E0–E6) + **665 OK / 0 FAIL** (13 harnessów node).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.9.0 — kalka .arkdelta: dialog version-mismatch, re-klasyfikacja po wczytaniu mapy, manual

- **Dialog version-mismatch (`dlg-arkdelta-mismatch`):** wczytanie kalki zapisanej na innej wersji mapy (crc bazy != crc wczytanej mapy) otwiera modal z porównaniem wersji (wersja/revision + prefiks crc kalki vs mapy) i przypomnieniem zasad recenzji — przyciski „Kontynuuj recenzję" (otwiera panel) / „Anuluj" (kalka odrzucona, toast). Wariant „nobase" dla plikow bez informacji o bazie. Baza zgodna = prosto do panelu, zero szumu. Decyzja czysta funkcja `_deltaBaseCheck(base)` (null / mismatch / nobase).
- **Re-klasyfikacja panelu po wczytaniu nowej mapy (M4 polish):** wrapper `applyMap` — gdy panel recenzji jest otwarty, po wczytaniu mapy klasyfikacja jest liczona ponownie wzgledem nowej mapy (+ odswiezona notka bazy). Flow „wczytaj kalke → wczytaj nowszy upstream → zastosuj" pokazuje aktualne klasy zamiast wygaslych. Stan M3 (duchy/override'y) resetowany jak dotychczas.
- **Manual (`docs/arkmap_manual.html`):** nowa sekcja „21. Kalka zmian .arkdelta" (czym jest, typowy scenariusz, okno recenzji per klasa, duchy, kolizje z autopozycja/recznie, rebase, bezpieczenstwo) + renumeracja sekcji 21–25 → 22–26 i wpis w TOC + podsekcja .arkdelta w „Obslugiwane formaty plikow" + 2 pytania FAQ (kalka na nowszej wersji; zajete pole docelowe).
- **Drobne:** link „Dokumentacja uzytkownika" w dialogu O projekcie (relatywny `docs/arkmap_manual.html` — dziala na Pages i lokalnie); dopisek w specie .arkdelta (§9): pozycje zastepcze sa decyzja sesji i nigdy nie wchodza do formatu, rebase eksportuje efektywne wspolrzedne.
- **Testy:** `tests/delta.js` — sekcja T10 (18 asercji: baseCheck 3 klasy, struktura dialogu i kolejnosc wiringu, hak applyMap, link about, manual — sekcja/TOC/numeracja ciagla 1–26/formaty/FAQ, dopisek specu) → 203 asercje w harnessie.
- Regresja: **665 OK / 0 FAIL** (13 harnessow).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.8.0 — kalka .arkdelta: warstwa duchów (podglad efektu per op) + rozwiazywanie kolizji pozycji

- **Warstwa duchów `_drawDeltaGhosts` (warstwa 7b draw()):** czysto addytywny render (save/restore, zero mutacji stanu) efektu wybranych opow kalki na tle biezacej mapy. Geometria liczona czysta funkcja `_deltaGhostGeoms(delta, items, seqs, overrides)` — deterministyczna (kolejnosc = rosnace seq), per-op (nie symulacja kumulatywna). Glify: ADD_ROOM = zarys pokoju (zielony wolne / bursztyn kolizja / niebieski pozycja zastepcza), MOVE_ROOM = szary zarys „stad" + kolorowy „dokad" + strzalka, DELETE_ROOM = czerwony przekreslony zarys, ADD_EXIT/DELETE_EXIT/DELETE_SPECIAL_EXIT = przerywana linia (zielona/czerwona; koniec na pokoju kalki podaza za override), EDIT_*/CL/tlumiki/PAINT_BATCH/AUTO_FIX = bursztynowe podswietlenie, etykiety = ramka + tekst. Filtr widocznosci: biezacy obszar + poziom Z.
- **Przyciski per pozycja w panelu recenzji:** „Efekt" (pokaz ducha + nawigacja do obszaru/poziomu/pozycji przez selectArea/selectZ/centerViewOnMap) i „Ukryj" przy kazdym opie z geometria; typy bez geometrii (obszary, META, kolory env) bez przycisku; niewykonalne wylaczone. Legenda kolorow nad lista.
- **Kolizje pozycji (ADD_ROOM/MOVE_ROOM z flaga `coll` w klasyfikatorze):** dwa tryby rozwiazania, oba zapisuja sesyjny override `seq -> {x, y, how}` (NIE trafia do pliku .arkdelta ani deltaLog):
  - **Autopozycja** — `_deltaFindFreeCell`: deterministyczna spirala Manhattan r=0..25 (w pierscieniu sztywny porzadek: rosnaco po dy, potem dx) do najblizszej wolnej komorki w tym samym obszarze i Z; wolna = poza zajetymi na zywo (`_deltaBuildOcc` — swiezy Set per wywolanie, zero uniewazniania cache) ORAZ poza `taken` (komorki zarezerwowane przez inne zaznaczone opy kalki z override'ami — dwie kolizje nigdy nie dostana tej samej komorki; kolejnosc seq = determinizm). Wlasna komorka MOVE_ROOM nie liczy sie jako zajeta. Brak miejsca w promieniu 25 → op zostaje konfliktem z notka.
  - **Recznie** — tryb stawiania `deltaPlacing`: przechwyt mousedown/mouseup/contextmenu przed handlerami edytora (klik < 5px = postaw; prawy/Esc = anuluj), celownik pod kursorem (zielony/czerwony kwadrat wg wolnego pola, wspolrzedne walidowane na zywo), walidacja `_deltaCellFree` (zywa mapa + taken). Zero interferencji z klikami edytora — tryb istnieje tylko z panelu recenzji.
- **Apply z override'ami — `applyDelta(delta, onlySeq, overrides)`:** override aplikowany na przetlumaczonym klonie opu tuz przed commitem, z **re-walidacja fail-closed** na zywej mapie (zajeta komorka zastepcza → skip „pozycja zastepcza zajeta", zero mutacji). Efektywne wspolrzedne trafiaja do entry undo i deltaLog → undo/redo dziala zgodnie z tym, co widac, a rebase („Zapisz zaktualizowana kalke") eksportuje kalke juz z poprawionymi pozycjami. Po apply: re-klasyfikacja z efektywnymi wspolrzednymi (`_deltaApplyOverridesToOps`) — done-match na faktycznej pozycji (idempotencja petli zachowana), stan M3 czyszczony. Undo/redo/replay nietkniete — nadal jeden atomowy commit przez istniejaca sciezke.
- **Czyszczenie stanu sesyjnego:** `_deltaGhostReset()` przy otwarciu nowej kalki, zamknieciu panelu, apply i wczytaniu mapy (wrapper applyMap).
- **Testy:** `tests/delta.js` — nowa sekcja T9 (50 asercji: flagi coll + mapy sid w items, spirala — dokladny porzadek pierscieni/determinizm x3/taken/R_MAX=25→null/selfRoomId, wsadowosc autopozycji, _deltaCellFree/_deltaPlaceCtx, geometria duchow per kind + podazanie linii za override + brak geometrii dla impossible i obszaru kalki, zero mutacji mapy (checksum przed==po), reset stanu, apply z override do mapy/undo/deltaLog, patch ops bez ruszania oryginalu, re-klasyfikacja→done, override uniewazniony→skip bez mutacji, asercje strukturalne hakow UI) → 185 asercji w harnessie.
- Regresja: **647 OK / 0 FAIL** (13 harnessow).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.7.0 — okno recenzji kalki .arkdelta: klasyfikator, filtry, wybór opów, rebase

- **Klasyfikator `classifyDelta`:** każdy op kalki klasyfikowany względem bieżącej mapy (bez ruszania stanu) do 4 klas: **do naniesienia** (ok), **konflikt** (hard — cel zmieniony upstream, kolizja pola, zajęty kierunek; nanosi się mimo to), **naniesione** (done — add-matching: to samo pole i nazwa / live == after / identyczna etykieta/kolor), **niewykonalne** (impossible — cel usunięty upstream, brak obszaru/pokoju/etykiety, łańcuchowo: odwołanie do niewykonalnego obiektu kalki). Porównania pokoi spec-clean (`_deltaRoomCmp`, bez id — sid-owe snapshoty nieporównywalne → klasa neutralna). sid-y rozwiązywane do numerycznych id, gdy ADD dopasowany jako „naniesione".
- **Panel recenzji `#delta-panel`** (nienmodalny, drag — lany z panelu walidacji kierunków): notka o zgodności bazy, 5 klawiszy filtrow z licznikami (Wszystkie/Do naniesienia/Konflikty/Naniesione/Niewykonalne), wiersze z checkboxami (domyślnie: ok+konflikt zaznaczone, naniesione odznaczone, niewykonalne wyszarzone), klik w wiersz → skok na mapie (`jumpToRoom` / selectArea + centerViewOnMap), stopka „✓ Zastosuj zaznaczone (N)".
- **Apply z wyborem:** `applyDelta(delta, onlySeq)` — nanosi tylko zaznaczone opy, odznaczone pomija milcząco; po apply re-klasyfikacja (naniesione → „naniesione") i przycisk **„💾 Zapisz zaktualizowaną kalkę…"** (rebase = ponowny zapis z nową bazą — naniesione opy są w deltaLog, więc eksport sam się aktualizuje). Stary dialog potwierdzenia zastąpiony panelem; `dlg-arkdelta` zostaje dla błędów walidacji (strict refuse bez zmian).
- **Testy:** `tests/delta.js` — nowa sekcja T8 (42 asercje: klasyfikacja wszystkich klas per typ opu, domyślne zaznaczenia, skoki, apply z onlySeq, re-klasyfikacja po apply = idempotentność, struktura panelu/flow) → 135 asercji w harnessie.
- Regresja: **597 OK / 0 FAIL** (13 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## Dokumentacja — specyfikacja formatu .arkdelta

- **`docs/arkdelta_spec.html` (nowy):** pełna specyfikacja formatu v1 w stylistyce specu .arkmap — overview i cele (determinizm, anonimowe dodatki, fail-closed, undo nietknięte), struktura meta/ops/checksums, tożsamość bazy (crc liczone przy wczytaniu + version/revision), serializacja kanoniczna i CRC-32 (zbiorczy + per-op z lokalizacją uszkodzeń), sid `d:N` (define-before-use, żywotność, reuse id), tabela 25 typów operacji (target/payload), łańcuch walidacji, semantyka apply (tłumaczenie sid, świeże id, commity z guardami, skip z powodem, integracja z undo, rebase = ponowny zapis), wersjonowanie, kompletny przykład.
- **Bez zmian w aplikacji:** `arkmap_studio.html` nietknięty (brak bumpu wersji).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.6.0 — format .arkdelta (kalka zmian): eksport, walidacja fail-closed, czyste apply

- **Nowy format `.arkdelta`:** deterministyczna delta edycyjna — eksport pełnego logu operacji (`state.deltaLog`) do pliku z kanonicznym JSON-em (`stableStringify`) i hierarchicznymi checksumami CRC-32 (zbiorczy `checksums.file` + per-op `checksums.ops`). Meta: `format: "arkdelta"`, `format_version: 1`, `ops_count`, `base` (crc wariantu bazowego liczone RAZ przy wczytaniu mapy przez `_computeBaseInfo()` + opcjonalnie `version`/`revision` z `meta.user_data`), `app_version`. Nowe pokoje/obszary/etykiety są w pliku **anonimowe** — symboliczne sid `d:N` (define-before-use), przy nakładaniu dostają świeże numery (max+1) jak obiekty z kalki.
- **Eksport `buildDelta()`:** jeden przebieg z mapami ŻYWYCH sid (ADD zakłada, DELETE zdejmuje) — edytor liczy nowe id jako max+1 z aktualnego stanu, więc add-po-delete re-używa id; sid per wystąpienie, nie per id (inaczej duplikat definicji przy walidacji). Referencje geometryczne (exits/special_exits, targety, obszary, etykiety) przepisywane na sid przez `rwRoom`/`rId`/`aId`/`lId`; pokoje w spec-clean klonie (`_deltaStripRoom` = omission convention specu). Undo/redo nietknięte — eksport tylko czyta deltaLog.
- **Przyciski:** „◈ Zapisz .arkdelta…" pod przyciskami walidacji (aktywny tylko gdy są zmiany — hook `_arkdeltaUpdateSaveBtn()` w `updateUndoRedoUI`, deltaLog>0 lub redoStack>0), „Wczytaj .arkdelta…" pod przyciskami zapisu (guard: tryb edycji + wczytana mapa).
- **Walidacja `validateDeltaText` — fail-closed, strict refuse z diagnostyką:** limit 8 MB → JSON → znacznik formatu → wersja formatu → CRC zbiorczy (przy niezgodności lokalizacja per-op: „op #17, #23 nie zgadza się z sumą kontrolną") → ops_count → ciągłość seq → schema per typ (25 typów opów) → VALID_DIRS → sanitizacja kluczy (`__proto__`/`constructor`/`prototype`) → integralność sid (definicja własna opu przed skanem użyć, define-before-use, brak duplikatów). Uszkodzony plik = odmowa z listą komunikatów, nic nie jest wczytywane.
- **Apply `applyDelta` (ścieżka czysta M1):** sidMap + monotoniczne liczniki świeżych id (pokoje/obszary globalnie, etykiety per obszar), tłumaczenie `_deltaTranslate` z defensywnym skanem osieroconych sid. Per op: programowe commity z guardami (`deleteRoom`, `commitDeleteArea`, `commitMoveRoomToArea`, `commitAddExit` z post-check guarda, `commitMoveRoom`, `commitDeleteExit`) tam gdzie istnieją; poza tym rekonstrukcja entry + `_dispatchRedo` + `_deltaPush`. Każdy op w try/catch — pominięte zbierane z seq + powodem po polsku; naniesione wchodzą do historii undo jak zwykłe edycje (undo/redo/replay nietknięte). Dialog potwierdzenia z notką o zgodności bazy (`_arkdeltaBaseNote`: crc + wersja/revision).
- **Okno recenzji z klasyfikatorem i ghost-layer kolizji** (autopozycja/ręczna pozycja) — milestone'y M2/M3; M1 dostarcza czystą ścieżkę: nanieś co się da, pomiń z powodem.
- **Testy:** `tests/delta.js` +78 asercji (sekcje T2–T7: determinizm eksportu bajtowo i cross-context, kształt pliku/sid/spec-clean, round-trip walidacji, reuse id po delete, 17 odmów strict refuse, apply z przepisaniem sid na świeże id, pomijanie z powodami, baseInfo/struktura UI). Harness złapał 2 realne bugi przed commitem: duplikaty sid przy reuse id (przebudowa na żywe mapy) i fałszywe „użycie bez definicji" dla sid własnego opu (kolejność w walidatorze). Fix w 3 starych harnessach: regex APP_VERSION `v1.5.x` → `v1.x.x`.
- Regresja: **556 OK / 0 FAIL** (13 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.43 — deltaLog: pełny log edycji bez capu 50 (fundament eksportu .arkdelta)

- **`state.deltaLog`:** równoległy, niezależny log wszystkich operacji edycji, zasilany w choke-poincie `pushUndo` (+1 linia) i mirrorowany w `undoAction`/`undoToIndex`/`redoAction`/`redoAll`/`cancelRoomEdit` (po 1 linii) oraz resetowany w wrapperze `applyMap`. Motywacja: cap 50 wpisów undoStack (inline przy ~30 miejscach wywołań) silently ucinałby początek długich sesji edycyjnych — dla eksportu delty to nie do przyjęcia. Zachowanie undo/redo bez zmian: cap, UI historii, `undoToIndex` działają identycznie; deltaLog jest wyłącznie czytany przez eksport.
- **Testy:** nowy harness `tests/delta.js` — sekcja T1 (16 asercji: mirror push/undo/redo/undoToIndex/undoAll, przepełnienie capu (60 operacji → deltaLog 60, undoStack 50), cichy pop A11', reset przy wczytaniu, cap nigdy nie dotyka deltaLog). `tests/run-all.sh`: +1 harness (13 łącznie).
- Regresja: **478 OK / 0 FAIL** (13 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## Testy — harness converters_crc (fundament pod base.crc formatu .arkdelta)

- **Nowy harness `tests/converters_crc.js` (11 asercji):** determinizm konwersji `.dat → .arkmap` (dwa przebiegi `tools/dat2arkmap.mjs` z tymi samymi flagami dają bajtowo identyczny plik), round-trip `.arkmap → applyMap → _serializeMap` (re-serializacja po wczytaniu bajtowo identyczna z plikiem — `meta.checksums.file` stabilny), weryfikowalność checksumów po round-tripie, czułość CRC na zmianę treści mapy. Własność „CRC liczone po wczytaniu == CRC pliku źródłowego" jest fundamentem tożsamości bazy dla planowanego formatu `.arkdelta` (delta edycyjna nanoszona na nowsze wersje mapy).
- **Bez zmian w aplikacji:** `arkmap_studio.html` nietknięty (brak bumpu wersji). `tests/run-all.sh`: +1 harness (12 łącznie).
- Regresja: **462 OK / 0 FAIL** (12 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.42 — „⊙ Pokaż trasę" fituje via-path (pokoje drogi przejazdów lądowych)

- **Fix logiki fitu:** v1.5.40 fitowała fragment trasy w bieżącym regionie liczony ze skompresowanej ścieżki (kroki piesze + punkty wsiadania/wysiadania); v1.5.41 dodała rysowanie via-path, ale fit o nim nie wiedział. Efekt na demie 7275→6433: w Averlandzie fit obejmował **2 pokoje**, gdy fizycznie narysowana trasa to **82 pokoje** tego obszaru. Teraz `fitRouteToView` dokłada do `routeIds` pokoje `_hopViaRooms` każdego hopu — fit geometry == geometria rysowana. Skutek uboczny: obszar czysto pośredni (przejezdny dyliżans, bez waypointa) też dopasowuje widok do fragmentu drogi. Statki bez zmian (via = null).
- **Testy:** `tests/planner_ui.js` +1 asercja strukturalna (fit uwzględnia via-path) → 112 asercji. Regresja: **451 OK / 0 FAIL** (11 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.41 — dyliżans przez pokoje drogi (via-path), typografia „O programie", uczciwy progres pobierania

- **Via-path przejazdów lądowych:** dyliżans/wóz/powóz (rozpoznawane po komendach wsiadania z TRANSPORT_DEFS: `woz|dylizans|powoz` — 14 linii) rysowany jest kropkowaną łamaną przez realne pokoje drogi między kolejnymi przystankami. `_hopViaRooms(hop)` odtwarza łańcuch przystanków z DEFS (hop.via trzyma tylko etykiety), liczy pieszą Dijkstrą ścieżkę między każdą parą (wszystkie kierunki, bez transportów — trasa wagonu jest fizyczna, nie zależy od filtrów planera) i skleja; cache per `linia|from>to`, czyszczony w `wpRecalcPaths` (edycje) i `applyMap` (nowa mapa). Rysowanie per-subsegment z widocznością obszar+poziom — przejazd „przechodzi" przez obszary pośrednie. Ring z etykietą przy jednym widocznym końcu zostaje. Statki (27 linii) bez via-path — prosta kreska/ring jak dotychczas; minimapka planera dostaje tę samą geometrię. Via-path czysto poglądowy: koszt hopu liczony z czasów linii bez zmian. Weryfikacja na realnych danych: 70/85 legów ma pieszą ścieżkę; linia z dema (Nuln—Blekitna Wstega) 5/5.
- **Modal „O programie":** szerokość 480 → 520px; `text-wrap: pretty` na opisie/licencji/linkach; nazwy formatów w `<strong>` z `nowrap` (koniec pękania „Mudlet / .dat"); licencja bez sztywnego `<br>` (naturalny flow, `<br>` tylko przed Copyright); ikony linków przy pierwszej linii (`flex-start` + `flex-shrink: 0`).
- **Progres pobierania online — fix buga gzip:** raw.githubusercontent serwuje tekstowy `.arkmap` z `content-encoding: gzip` — `content-length` był rozmiarem skompresowanym (2,5 MB), a reader liczył bajty po dekompresji (13,7 MB) → procent leciał do ~540%. Teraz `total` pochodzi z `index.json` (`olIndex.arkmap_size`/`dat_size` — dialog i tak je ma), `content-length` zostaje fallbackiem, procent clampowany do 100%. Do tego cienki pasek postępu pod tekstem (`#ol-confirm-bar`), resetowany przy otwarciu i błędach.
- **Testy:** `tests/planner_ui.js` — nowa sekcja T7 (13 asercji: via-path na syntetycznej mapie — pełny łańcuch pokoi, cache, statek → null, cel poza DEFS → null, przywracanie filtrów; klasyfikacja na realnych DEFS; asercje strukturalne) + aktualizacja T6 (pętla via-steps w minimapce) → 111 asercji. `tests/sync_map.js` — sekcja v1.5.41 (11 asercji: expectedSize, clamp, pasek, typografia modala) → 60 asercji. Regresja: **450 OK / 0 FAIL** (11 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.40 — hop-markery na mapie, fit trasy do regionu, „jesteś tu" na minimapce, pełna lista przystanków

- **Przejazdy transportowe widoczne na mapie głównej:** dotychczas hop (przejazd dyliżansem/statkiem) rysował się tylko, gdy oba przystanki były w bieżącym regionie — przesiadki między obszarami były niewidoczne. Teraz, gdy widoczny jest dokładnie jeden koniec hopu, rysuje się kropkowany ring wokół przystanku z etykietą „🚢 → cel" (wsiadanie) albo „🚢 ← linia" (wysiadanie).
- **⊙ Pokaż trasę dopasowuje widok do regionu:** fit obejmuje fragment trasy w bieżącym obszarze i poziomie (padding 4 pokoje) zamiast całej trasy na mapie świata; gdy trasy w bieżącym regionie nie ma — przenosi do obszaru i poziomu pierwszego waypointa.
- **Minimapka planera śledzi viewport:** fragment trasy widoczny aktualnie w głównym oknie jest podświetlony na zielono (podwójny obrys: glow + linia główna, z kropkowaniem na hopach); odświeżanie przez `requestAnimationFrame` w pętli `draw()`, tylko gdy planer ma trasę.
- **Dwuklik na pokoju transportowym = pełna lista przystanków:** nowy helper `_transportLineStops` składa dla każdej linii przechodzącej przez pokój listę wszystkich przystanków w kolejności jazdy (dedup po `stopId`, etykiety z legów docelowych — ta sama semantyka co `_transportNeighbors`); okienko `showTransportStopChooser` grupuje linie nagłówkami, bieżący przystanek ma znacznik „— tu jesteś" (`.tp-jump-here`), kliknięcie skacze do celu (z potwierdzeniem przy niezapisanej edycji). Stary chooser „sąsiedni przystanek" (`_transportNeighbors` / `showTransportJumpChooser`) zostaje w kodzie — jest pokryty testami.
- **Dokumentacja (manual):** dwuklik = pełna lista przystanków ze znacznikiem „— tu jesteś"; ring + etykieta dla hopów z jednym widocznym końcem; ⊙ Pokaż trasę dopasowuje do bieżącego regionu; zielone śledzenie viewportu na minimapce planera; doprecyzowana uwaga o pokojach `locked` — planer pomija je przy rozwijaniu ścieżki, ale dopuszcza jako cel (świadoma różnica względem Mudlet `getPath`, które zwraca `false` dla celu locked).
- **Testy:** `tests/planner_ui.js` — asercja P6 przepięta na nowy chooser; nowa sekcja T6 (19 asercji: `_transportLineStops` na realnych TRANSPORT_DEFS — kolejność wzdłuż legów, dedup, dokładnie jeden „here", łańcuchowość, przystanki wieloliniowe; asercje strukturalne hop-markerów, hooka minimapki, fitu regionu i CSS) → 97 asercji w harnessie. Regresja: **425 OK / 0 FAIL** (11 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## Dokumentacja: dryfy po automatyzacji (bez bumpu APP_VERSION)

- Audyt dokumentacji po commicie automatyzacji: `tools/sync-transports.mjs` nagłówek — „walidacja schematu" → „walidacja schematu i semantyki etykiet przystanków"; README + manual (Metoda 3) — „codziennie synchronizowane lustro" → „automatycznie synchronizowane (2× dziennie)"; README (sekcja Testy) + `tests/README.md` (nowa sekcja „CI") — wzmianka o automatycznej regresji `ci-tests.yml` na każdy push do main.
- **Bez bumpu APP_VERSION** — `arkmap_studio.html` nietknięte (docs + komentarz). Regresja: **406 OK / 0 FAIL** (11 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## Automatyzacja: bramka semantyczna transportów + auto-issue, sonda 2×/d, CI regresji (bez bumpu APP_VERSION)

- **Bramka semantyczna w generatorze** (`tools/sync-transports.mjs`): obok walidacji schematu trzy nowe reguły fail-closed — etykieta wymagana na każdym legu; sanity etykiet (nie czysto numeryczna, min. 2 znaki); rozstrzygalność przystanków (symulacja mapy `stopLabel` z runtime — przystanek nigdy niebędący celem legu = anomalia). Werdykt: czerwony workflow, HTML nietknięty, nic nie ląduje na main.
- **Auto-issue w `sync-transports.yml`:** porażka walidacji ⇒ workflow sam zakłada issue z diagnozą i linkiem do runu (deduplikacja po labelu `sync-transports`: kolejne runy dopisują komentarz, nie mnożą issue); po ustaniu anomalii run sam zamyka issue. Dotyczy wyłącznie porażki walidacji danych — błędy sieci/clone są przejściowe i nie generują szumu. Wywołania `gh` z `|| true`: porażka notyfikacji nigdy nie maskuje werdyktu bramki. `permissions` + `issues: write` (GITHUB_TOKEN per-run, zero nowych sekretów).
- **Sonda transportów 2×/d:** cron `47 4` + `47 20` UTC (06:47 i 22:47 PL latem) — rozjeżdżone z sondą mapy (05:17/21:00); wieczorny slot za szczytem commitów upstream klienta (aktywność 09–02 PL; same definicje transportów: 10 commitów w historii).
- **Nowy workflow `ci-tests.yml`:** push na main (w tym automatyczne commity sond) ⇒ pełna regresja: checkout z pełną historią (testy różnicowe robią `git show`), fixture przypięty do release 0.205.0, timeouty na fixture (240 s) i regresję (420 s), `contents: read`, concurrency bez równoległych runów. Bramka semantyczna jest ścianą, CI jest siecią.
- **`fetch-fixture.sh`:** curl + `--retry 3 --connect-timeout 30 --max-time 180`.
- **Testy:** nowy harness `tests/transports_sync.js` (14 asercji: happy path + idempotentność, brak/numeryczna/za krótka etykieta, osierocony przystanek, regresja schematu, invariant na realnych TRANSPORT_DEFS); `sync_map.js`: strażnik pinowania obejmuje `ci-tests.yml` (6 pinów SHA); `run-all.sh` + `tests/README.md` zaktualizowane. Weryfikacja generatora na realnym upstream (sparse clone): blok bajtowo identyczny z repo — nowe reguły przepuszczają aktualne dane (41 linii, 156 przystanków). Regresja: **406 OK / 0 FAIL** (11 harnessów).
- **Bez bumpu APP_VERSION** — `arkmap_studio.html` nietknięte.
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## Sync mapy 2×/d + doprecyzowanie dokumentacji (bez bumpu APP_VERSION)

- **Workflow `sync-map.yml`:** drugi cron `0 21 * * *` obok porannego `17 5 * * *` — sync 2× dziennie. Pory dobrane analizą 198 commitów `map_master3.dat` z Delwing/arkadia-mapa (2022–2026): aktywność upstream koncentruje się w 09–23 PL ze szczytem 20–22 PL, noc 03–08 PL jest martwa. Wieczorny run 21:00 UTC (23:00 PL latem / 22:00 zimą) domyka dzień tuż za szczytem; poranny łapie commity nocne. Średnie opóźnienie lustra commit→sync spada z ~13,6 h do ~6,9 h (symulacja na ostatnim roku; worst case 22 h → 14 h). Koszt zerowy — brama na SHA: pusty run = cisza.
- **Spec (`docs/arkmap_spec.html` §7):** kolumna „Map vector [dx, dy]" → „Screen vector [dx, dy]" + notka o dwóch układach: wektory tabeli są ekranowe (północ = −Y przy renderowaniu, konwencja klienta), współrzędne pliku `.arkmap`/`.dat` trzymają północ = **+Y** (odsyłacz do §6). Usunięta dwuznaczność §6 vs §7.
- **tests/README.md:** nowa sekcja „Walidacja E2E na silniku Mudlet (mudix) — procedura ręczna": wystawienie eksportu (scratch-branch + raw URL), profil offline w mudix, komendy `downloadFile`/`loadMap`, złote wyniki (60 area / 26988 pokoi, exits pokoju 746, nazwa), kontrola wizualna, sprzątanie brancha; notki: błędy `generic_mapper` niezwiązane, szybka alternatywa npm `mudlet-map-binary-reader`.
- **Bez bumpu APP_VERSION** — `arkmap_studio.html` nietknięte (docs + workflow). Testy: pełna regresja **392 OK / 0 FAIL** (harnessy bez zmian — brak asercji pinujących cron).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.39 — okienko pobierania online: ładne łamanie linii + NOTICE.md z atrybucjami

- **Okienko „🌐 Pobierz mapę online":** linia sync-info łamała się brzydko (data pękała między datą a godziną, nazwa repo w połowie). Teraz sync-info to 3 segmenty `nowrap` w kontenerze flex (`mapa master · @rev` / `sync data` / rozmiary) — łamanie wyłącznie między segmentami; data bez sekund (`timeStyle: 'short'`); `.ol-src` z `nowrap` (nazwa repo w całości); opis bez sztywnego `<br>`; szerokość okna 380 → 420px (`max-width:92vw`); `min-height` pod sync-info — okno nie skacze przy ładowaniu.
- **NOTICE.md (nowy plik):** bare minimum atrybucji — dane mapy = lustro `Delwing/arkadia-mapa` (upstream bez licencji), TRANSPORT_DEFS z `Delwing/arkadia-web-client-extension` (MIT wg package.json upstream) z pełnym tekstem zgody MIT i copyright Delwing. README linkuje NOTICE z sekcji Licencja.
- **Testy:** `tests/sync_map.js` +7 asercji strukturalnych (reguła `#ol-sync-info`, nowrap `.ol-src`, brak sztywnego `<br>`, segmenty + data bez sekund, szerokość, NOTICE: oba credit-y + tekst MIT) → 49 asercji. Regresja: **392 OK / 0 FAIL** (10 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.38 — chooser transportów: etykiety na trasach okrężnych + kierunek przy duplikatach

- **Etykiety dla legów odwrotnych:** `_transportNeighbors` buduje mapę `stopId → etykieta` (etykieta legu, którego przystanek jest celem) i zasila nią kandydatów z legów odwrotnych. Na 4 pętlach statkowych (Ard Skellig–Faroe–Rozrog, Novigrad–Blaviken–Daevon, Novigrad–Oxenfurt–Bialy Most, Obawa zach.–Novigrad–Obawa srod.–Scala) 14 pozycji chooser-a przestaje pokazywać fallback — w tym dwa gołe numery pokoi („23669", „10313" — numeryczne nazwy w danych upstream, lustra nie ruszamy) — a zamiast tego nazwy przystanków („Faroe", „Ard Skellig", „Obawa srod.", „Blaviken"…). Wszystkie 120 przystanków ma etykietę w danych, więc po tej zmianie **każda** z 98 pozycji chooser-a to nazwa przystanku.
- **Kierunek przy duplikatach na tej samej linii:** dwa doki Blaviken (jeden płynie do Novigradu, drugi do Daevon) pokazywały się identycznie — przy duplikacie nazwy na tej samej linii sufiks to teraz „— kierunek: …" (kandydaci dostają `nextLabel` = etykieta następnego przystanku na trasie). Duplikat na różnych liniach = nadal sufiks z nazwą linii.
- **Testy:** `tests/planner_ui.js` +8 asercji (syntetyczna pętla: etykiety odwrotne + nextLabel; prawdziwe definicje: Skellige „Faroe"/„Ard Skellig", Blaviken ×2 z kierunkami; struktura chooser-a i mapy etykiet). Regresja: **385 OK / 0 FAIL** (10 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.37 — pinning SHA akcji, spójna migawka pobierania online, hopy na minimapce, chooser po nazwach przystanków

- **Workflow:** wszystkie akcje (`actions/checkout` ×3, `actions/setup-node`) spinowane pełnym SHA commita zamiast ruchomego tagu `@v4` (komentarz `# v4` zachowuje czytelność). Tag to wskaźnik, który właściciel repo akcji może podmienić — SHA jest niezmiennicze (rekomendacja OpenSSF i GitHuba). W `sync-transports.yml` doszły ziarniste timeouty: `timeout 180` na clone upstream, `timeout 120` na push.
- **Pobieranie online (TOCTOU):** dialog najpierw rozwiązuje tip gałęzi `mapa` przez API GitHub, a `index.json` i oba pliki pobiera z niezmienniczych URL-i `raw/<sha>/…` — spójna migawka, brak wyścigu z nowym syncem między sprawdzeniem a pobraniem. Gdy API nie odpowiada (rate limit, sieć), fallback na URL-e gałęziowe; prawdziwy timeout (AbortError) nie jest maskowany fallbackiem.
- **Minimapka planera:** odcinki transportowe (hopy) rysowane kropkowaną linią `[2, 2.5]` w obu przejściach (glow + linia główna) — dotychczas tablica `segHop[]` była liczona, ale nigdy nieużyta. Na mapie głównej hopy były kropkowane już wcześniej.
- **Skok po linii transportowej (dwuklik):** lista wyboru pokazuje nazwę DOCELOWEGO przystanku (etykieta z definicji linii; fallback: nazwa pokoju → `#ID`) zamiast pełnej trasy linii — klikasz cel z nazwy. Nazwa linii dokładana tylko wtedy, gdy nazwy docelowe powtarzają się wśród kandydatów. Deduplikacja sąsiadów preferuje kandydata z etykietą (stare first-wins gubiło etykietę, gdy pierwszy trafiony był leg odwrotny).
- **Testy:** `tests/planner_ui.js` +8 asercji (preferencja etykiet na syntetycznych definicjach, struktura chooser-a, hop-dash w podglądzie trasy), `tests/sync_map.js` +7 asercji (regex pinningu SHA, brak referencji `@vN`, timeouty sync-transports, resolve-sha + fallback w UI). Regresja: **377 OK / 0 FAIL** (10 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.36 — timeouty sieciowe: workflow sync-map i pobieranie online w UI

- **Workflow `sync-map.yml`:** ziarniste timeouty na wszystkich operacjach sieciowych — curl z `--connect-timeout 30 --max-time 180`, `timeout 90` na obu `git ls-remote` i na `git fetch` gałęzi `mapa`, `timeout 120` na force-push. Zawieszone połączenie = szybki czerwony run zamiast wypalania 10-minutowego timeoutu joba (siatka job-level zostaje jako ostateczność). Fail-closed bez zmian: żaden timeout nie publikuje niczego.
- **UI pobierania online:** `fetch()` w przeglądarce nie ma domyślnego timeoutu — dodany `AbortController`: 30 s na `index.json`, 180 s na transfer plików (13,7 MB przy słabym 3G ≈ 110 s). `AbortError` mapowany na czytelne komunikaty (timeout / kopia nie gotowa / brak połączenia); po błędzie przyciski odblokowują się jak dotychczas.
- **Testy:** `tests/sync_map.js` +10 asercji strukturalnych pilnujących timeoutów w workflow i UI → 35 asercji. Regresja: **362 OK / 0 FAIL** (11 harnessów).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.35 — codzienny sync mapy do gałęzi `mapa` + walidacja kierunków 1:1 z Delwing

- **Sync mapy (nowy workflow `sync-map.yml`):** cron 05:17 UTC + ręczny dispatch. Brama na SHA mastera Delwing/arkadia-mapa — ten sam commit = cisza (zero commitów). Przy zmianie: pobranie `map_master3.dat` przypięte do SHA, konwersja do `.arkmap` nowym narzędziem `tools/dat2arkmap.mjs` (ekstrakcja verbatim konwertera z `arkmap_studio.html`, zero zależności, wyjście bajtowo jak zapis w edytorze — sortowanie + checksumy + stableStringify, walidacja fail-closed), publikacja na gałęzi `mapa` (max 2 snapshoty: bieżący + `prev/`, force-push jednym commitem) + `index.json` (version/revision/synced_at/rozmiary). Lustro: bez czyszczenia błędów mapy upstream.
- **UI:** przycisk „Wczytaj mapę online" zastąpiony „🌐 Pobierz mapę online…" — dialog z informacją o synchronizacji (wersja, @commit, data, rozmiary z `index.json`) i wyborem formatu `.arkmap` / `.dat` z gałęzi `mapa` (raw.githubusercontent ma CORS `*`). `.arkmap` idzie ścieżką `loadArkmap` (walidacja + checksumy, jak plik z dysku), `.dat` jest konwertowany na bieżąco ze wtryskiem version/revision z index.json. Kopia niegotowa → komunikat i zablokowane przyciski. Dirty-guardy bez zmian.
- **Walidacja kierunków 1:1 z Delwing:** alias `gore→up`; `team_follow_link` dzielone na pierwszym `*` (walidator i panel Skrypty); fallback geometryczny `move()`/`findRoomByExit` (MapHelper.ts) — ten sam obszar, osie ściśle (składowa 0 = dokładnie 0), wyjścia specjalne i zwykłe. Flagi tylko dla naprawdę martwych bindów: na fixture 0.205.0 z 32 znalezień zostaje 17 (15 ratuje geometria). Bez warstwy „soft" — to, co działa w kliencie, nie jest zgłaszane.
- **Testy:** nowe harnessy `tests/sync_map.js` (25 asercji: CLI, złote liczby fixture, wtrysk version/revision, lustro user_data, determinizm, walidacja wyjścia, fail-closed) i `tests/dir_validation.js` (21 asercji: 32 złote przypadki z fixture + jednostkowe: gore, pierwszy *, ścisłe osie, cross-area, in/out, stuby, wiszące cele). Regresja: **352 OK / 0 FAIL** (11 harnessów).
- **Znana uwaga:** bajtowy roundtrip `.dat→.arkmap→.dat` dla pliku upstream NIE jest identyczny (kolejność QSet/QHash w plikach Mudleta); treściowo bezstratny (kanonicznie równy po posortowaniu list stubów/locków). Byte-identyczność z manuala dotyczy plików zapisywanych przez ArkMap.
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.34 — dialog „O programie": usunięte 3 linki

- Usunięte linki: „Mapa online" (przeglądarka mapy), „arkadia-mapa" (dane mapy), „mudlet-map-reader" (plugin Mudlet) — wszystkie trzy prowadziły do zasobów projektu arkadia-mapa.
- Zostało 10 linków. Czysty markup, JS/CSS nietknięte. Testy: regresja **306 OK / 0 FAIL**.
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.33 — dialog „O programie": linki projektowe + czyszczenie opisów

- **Nowe linki** (po „ArkMap Studio"): Standalone Tools — kalendarze Ishtar/Imperium i denominacja monet; Klient Dargoth plugins — kalendarze Ishtar/Imperium, Truwer; Oficjalny klient WWW — kalendarze Ishtar/Imperium; Oficjalny klient WWW — Truwer.
- **Czyszczenie opisów:** usunięte dopiski „(Delwing)" ×3 i „na GitHub" ×1 — docelowy serwis widać po kliknięciu.
- Czysty markup (4 bloki `<a class="about-link">`), JS/CSS nietknięte. Testy: regresja **306 OK / 0 FAIL**.
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.32 — atrybucja, dokumentacja, CHANGELOG.md, hardening Actions

- **Atrybucja:** ujednolicona na wyłącznie „Isithunzi" — sidebar (lewy górny róg), dialog „O programie" (linia autora, copyright, „o autorach" → „o autorze"), stopki manuala i specyfikacji.
- **Manual:** doprecyzowana różnica A* vs Dijkstra (remisy kosztu — A* może wybrać inną, równie krótką trasę); domyślny stan „Pokaż puste custom lines" = OFF (zgodnie z kodem); sekcja mobilna: kod ARKMAP2; tabela Nawigacja: dwa nowe wiersze dwukliku (skok do innego obszaru, skok po linii transportowej); „autorów" → „autora" w opisie sidebara; wersja w podtytule → 1.5.32. Spec: nagłówek Version 1.1 i stopka z ujednoliconą atrybucją.
- **CHANGELOG.md w root:** import dziennika fixów (wcześniej prowadzonego poza repo), najnowsze wpisy na górze; README linkuje do CHANGELOG.md. Od tej wersji każdy commit zawiera swój wpis.
- **Hardening Actions (oba workflowy):** `timeout-minutes: 10` (zawieszony clone/checkout nie pali domyślnych 6 h limitu joba); `concurrency` per workflow z `cancel-in-progress: false` (równoległe runy — np. cron + ręczny dispatch — nie odbijają się na pushu i nie dają fałszywie czerwonego runu); w syncu liczniki linii/przystanków w treści commita odporne na brak dopasowania (`|| true` + `${VAR:-?}` — poprawne także przy wielu dopasowaniach pod pipefail).
- **Testy:** pełna regresja **306 OK / 0 FAIL** (harnessy nietknięte — zmiany nie dotykają logiki); walidacja: YAML obu workflowów sparsowane, `bash -n` wszystkich 5 bloków run, dry-run keepalive (repo żyje → cisza).
- Commit: wpis w tym samym commicie co zmiany (hash w `git log`).

## v1.5.31 — popup wyboru przystanku: autofit (commit 4e3c910)

Popup „🚢 Skocz do przystanku" ucinał długie nazwy (ellipsis przy max-width: 320px). Fix: `width: max-content` (szerokość dopasowana do najdłuższej pozycji), sufit `max-width: calc(100vw - 16px)` + `overflow-x: auto` na wypadek ekstremalnie długiej nazwy; usunięte `text-overflow: ellipsis`. Pozycjonowanie przy kursorze już trzymało popup w granicach ekranu. Harness planner_ui.js: +2 asercje strukturalne (autofit, brak ucinania) → 62 asercje. Regresja: **306 OK / 0 FAIL**.

## v1.5.30 — UX planera: 7 poprawek (commit adc0b0e)

- **P1 — napis „✏ tryb planowania"** zasłaniał minimapę podglądu trasy (`#wp-overview` w lewym dolnym rogu). Przeniesiony: wyśrodkowany w poziomie względem ekranu (`left: 50%; transform: translateX(-50%)`), `bottom: 70px` — nad strefą toasta/baneru (24px). Mobile bez zmian (ukryty).
- **P2 — hopy transportowe** były niebieskie przerywane i niewidoczne na minimapce. Teraz: kolor trasy (pomarańczowy), linia **kropkowana** (gęsty dash + okrągły lineCap) — na mapie tam, gdzie oba przystanki w bieżącym regionie/poziomie (dyliżans: tak; statek między regionami: bez zmian), w podglądzie trasy zawsze (rysowanie segmentami z `segHop[]`).
- **P3 — podświetlenia przełączników (bug):** selektor `.wp-algo-btn:not(.wp-dir-btn)` w handlerze Dijkstra/A* łapał też przyciski transportów i gasił im `wp-algo-on` (puste `dataset.algo`). To samo w imporcie share-linka. Fix: wszystkie 4 wystąpienia → `.wp-algo-btn[data-algo]`; każda grupa (algo/dir/trans/aggro) odświeża wyłącznie siebie. Zweryfikowane wyczerpująco symulacją DOM: zgłoszony przypadek (klik A* gasił Pieszo) + 6 sekwencji × 4 kliki — zawsze dokładnie 1 włączony przycisk w każdej widocznej grupie, stan ≡ podświetlenie.
- **P5 — spinner prędkości** ucinał „10.1": `#wp-speed-input` 68px → 92px, padding-right 22px → 18px.
- **P6 — dwuklik na pokoju transportowym** nic nie robił (połączenia linii są wirtualne, nie ma ich w `exits`). Nowy fallback w `handleDblClick` + czysta funkcja `_transportNeighbors(roomId)` (deduplikacja, filtr po wczytanej mapie): 1 sąsiedni przystanek → skok (z dirty-check edycji); ≥2 (środek A-B-C lub pokój na kilku liniach) → lista wyboru przy kursorze (Esc/klik poza zamyka). Zmiana guardu: `!_lastCrossExits.length` już nie ucina dwukliku — pokoje bez cross-exitów też działają.
- **P7 — „↺ Przywróć ustawienia domyślne"** nie ruszało planera. Teraz resetuje: algorytm → Dijkstra, filtr kierunków → wszystkie, transporty → pieszo, prędkość → 3 + odświeża UI wszystkich grup i przelicza trasę; confirm wspomina przełączniki planera.
- **Testy:** nowy `tests/planner_ui.js` (60 asercji: sąsiedztwo transportów na prawdziwej linii i syntetyku, symulacja DOM przełączników, asercje strukturalne). Pełna regresja: **304 OK / 0 FAIL** (8 harnessów).
- **Uwaga:** krok D (18f437d) wypchnął się bez bumpa APP_VERSION (plik nadal miał v1.5.28) — naprawione skokiem do v1.5.30.

## Krok D — share-linki v2 (v1.5.29, commit 18f437d)

Nowy, czysty format kodu trasy kodujący WSZYSTKIE ustawienia planera — bez kompatybilności wstecznej (nie było starych linków w obiegu).

- **Format `ARKMAP2:<algo><dir><trans>:<base64>`** — trzy pozycyjne znaki: algo `d`/`a` (Dijkstra/A*), dir `k`/`p`/`w` (kardynalne/+pionowe/wszystkie), trans `p`/`n`/`g` (pieszo/normalny/agresywny). Pokrywa wszystkie 2×3×3 = 18 permutacji. Payload = base64 CSV roomId (bez zmian).
- **Ścisła walidacja `wpDecodeRoute`:** zły prefiks (w tym stary `ARKMAP:`), złe kody flag, zła liczba znaków, nie-base64, nie-liczbowe/ujemne/zerowe/niecałkowite ID, leading zero, puste tokeny — wszystko odrzucane (`null` → jasny toast). Nieistniejące w mapie pokoje nadal miękko pomijane z licznikiem (jak dotychczas).
- **Import stosuje wszystkie trzy parametry:** algorithm + dirMode + transportMode, odświeża wszystkie przełączniki UI (algo + nowy helper `wpRefreshDirUI()` + istniejący `wpRefreshTransportUI()`) i przelicza trasę.
- **Testy:** nowy harness `tests/share_link.js` — 56 asercji: round-trip 18 permutacji, struktura formatu, determinizm encode/decode, 21 przypadków śmieciowych odrzucanych, walidacja ID przeciw mapie, asercje strukturalne okablowania importu.
- **Regresja:** wszystkie 7 harnessów — **244 OK / 0 FAIL** (25+26+20+17+74+26+56).
- Manual: sekcje „Kod trasy" i „Import trasy" opisują format ARKMAP2 i znaczenie kodów.

## Krok C — (1f11537, bez zmian w HTML) — GitHub Actions: sync transportów + keepalive

Automatyka repo, zero ingerencji w aplikację (bez bumpa APP_VERSION).
- **sync-transports.yml** (cron 04:17 UTC + workflow_dispatch): sparse-clone upstreama (ships/ + other/), short-circuit po SHA (ten sam = cisza), generator `tools/sync-transports.mjs` z walidacją schematu (błąd = czerwony run, nic nie merguje), `git diff --quiet` jako druga linia obrony, commit prosto na main z metką `@<short-sha> (N linii, M przystanków)`.
- **keepalive.yml** (cron niedziela 03:23 UTC + workflow_dispatch): commit z timestampem w `.github/KEEPALIVE` tylko gdy repo śpi > 30 dni — pilnuje 60-dniowego limitu uśpienia schedulów GitHuba.
- **Weryfikacja:** YAML sparsowane, logika keepalive na sucho (repo świeże → cisza), short-circuit na sucho (SHA równe → bez zmian), token z uprawnieniem Workflows (push workflow przeszedł), **próba generalna end-to-end**: ręczny dispatch synca → run zielony, zero nowych commitów (poprawna ścieżka „bez zmian").

## Krok B — v1.5.28 (0f29c84) — Planer: transporty (statki/dyliżanse) wg modelu Delwinga

Nowa funkcja: przełącznik **Pieszo / Statki-dyliżanse** + sub-tryb **Normalny / Agresywny** w planerze trasy.
- **Dane:** 41 linii (28 statków + 13 dyliżansów) z Delwing/arkadia-web-client-extension (MIT), bundlowane inline w bloku `TRANSPORT-DATA` (8.4 KB kompaktowo; upstream 6d9bb01). Generator `tools/sync-transports.mjs`: sortowane pliki, walidacja schematu (błąd = kod 1, HTML nietknięty), idempotentny (ten sam SHA = bajtowo ten sam blok). Przygotowany pod dzienną Akcję (krok C).
- **Graf:** `_rebuildTransportEdges()` — krawędzie dla każdego spójnego podfragmentu linii (ride-through bez wysiadania, kara raz na pokład); koszt = Σczas×ratio + kara (normal: 30/0.5, agresywny: 10/0.1 — wartości Delwinga). Walidacja ID przeciw roomById (obca mapa → brak krawędzi). Leniva przebudowa w `wpRecalcPaths` (odporna na editMode).
- **Pathfinding:** hopy relaksowane w `dijkstraPath` po pętli wyjść (poza filtrem kierunków); `_pathHops` rejestruje hop per target, kasowany gdy lepszy marsz wyprzedzi hop. Z transportami `findPath` wymusza Dijkstrę (heurystyka A* niedopuszczalna przy hopach — jak u Delwinga); przyciski algo przygaszone z tooltipem.
- **Prezentacja:** hop = niebieska linia przerywana na mapie; odcinek `N kroków · 🚢 M` z tooltipem (linia, czas, przez); podsumowanie: kroki piesze + transporty z czasem; ETA = kroki×speed + Σ czasów hopów.
- **Weryfikacja na mapie rzeczywistej:** Kraina Zgromadzenia→Nuln: pieszo 81 kroków → z transportem 1 hop (Błękitna Wstęga–Kreutzhofen); ride-through 6621→5207 przez Nuln jednym hopem 87 s, kara raz.
- **Testy:** `tests/transport.js` (26 asercji: wybór wg trybu, dokładność kosztów, kara raz, wymuszenie Dijkstry, mapa rzeczywista, regresja off≡254ac05). Regresja łącznie 188 OK / 0 FAIL.

## Krok A — v1.5.27 (254ac05) — Planer: filtr kierunków (kardynalne / +pionowe / wszystkie)

Nowa funkcja (poza audytem): 3-stanowy filtr kierunków w planerze trasy.
- **Model:** `wpState.dirMode` (`cardinal | vertical | all`, domyślnie `all` = zachowanie 1:1 sprzed zmiany). Helper `_dirAllowed(dir, room)`: wyjście specjalne (klucz istniejący w `special_exits`, także gdy nazwany długą nazwą kierunku jak „northwest") przechodzi tylko w trybie `all`; zwykłe idx 1–8 (n…nw) w każdym trybie; idx 9–12 (up/down/in/out) w `vertical` i `all`; nieznany klucz — bezpiecznie tylko `all`.
- **Pathfinding:** guard `_dirAllowed` w identycznej pętli krawędzi `dijkstraPath` i `astarPath` (po sprawdzeniu locków). `_recomputeAstarParams` nietknięte — min/max po większym zbiorze krawędzi zachowuje dopuszczalność heurystyki A*.
- **UI:** blok „Kierunki" w panelu planera (Kardynalne / + Pionowe / Wszystkie) między „Algorytm" a „Kod trasy"; selektory algorytmu zawężone do `.wp-algo-btn:not(.wp-dir-btn)` (także przy imporcie share-linka), żeby kontrolki się nie gryzły.
- **Weryfikacja na mapie rzeczywistej:** trasa 17983→18030 — `all`: 25 kroków przez rozpadlinę (18719); `cardinal`: 29 kroków drogą, bez 18719, zero kroków specjalnych.
- **Uwaga udokumentowana:** A* i Dijkstra mogą dać różne ścieżki o równym koszcie (tie-break przy remisach) — zachowanie pre-existing, potwierdzone dyferencjalnie na kodzie sprzed filtra; harness asertuje koszt i końce, nie identyczność tablic.
- **Testy:** nowy harness `tests/dir_filter.js` (74 asercje: klasyfikacja 45, graf syntetyczny, regresja all≡stary kod, mapa rzeczywista); regresja łącznie 162 OK / 0 FAIL.
- Pliki: `arkmap_studio.html` (+~45 linii), `docs/arkmap_manual.html` (tabela filtra), `tests/dir_filter.js` (nowy), `tests/run-all.sh`, `tests/README.md`.

## Commit dodatkowy — README.md ✅
- Commit: `b3cde1b` na main (+27). Bez bumpu — docs-only.
- Treść wg wzorca z `arkadia-web_standalone-tools`: czym jest ArkMap Studio, link do aplikacji na GitHub Pages, 4 punkty „co to robi", linki do manuala i specyfikacji (przez Pages, nie podgląd źródła), notka o testach, licencja MIT.
- Linki zweryfikowane przed commitem: aplikacja + oba docsy odpowiadają 200 na `isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/`.

## Commit dodatkowy — harnessy testowe w repo ✅
- Commit: `f940f35` na main (9 plików, +749). **Bez bumpu APP_VERSION** — `arkmap_studio.html` nietknięte (udowodnione pustym diffem).
- Zawartość `tests/`: `a12a14_undo_core.js`, `a13_delete_area.js`, `a7_readbuffer.js`, `a9_pixmap.js`, `run-all.sh`, `fetch-fixture.sh`, `README.md`, `fixtures/tiny.png`; `.gitignore` dla `map_master3.dat`.
- Cechy wersji repo: ścieżki względne repo, snapshoty różnicowe pobierane przez `git show <hash>` (50f37ea / c84da83 / 45aee0f / fb8e013), sprawdzanie wersji odpięte od numeru (regex), fixture z czytelnym błędem + skryptem pobierającym (przypięty release 0.205.0).
- Weryfikacja z poziomu repo: **88 OK / 0 FAIL** (25 + 26 + 20 + 17), runner `bash tests/run-all.sh` → PASS.
- Harnessy a11 (dirty/save) i ur_core_new (zamrożony baseline dispatcherów) nie są w repo — opisy w tym dzienniku pozwalają je odtworzyć, gdyby były potrzebne.

## Krok 17 (Fala 4) — A9: readQPixMap parsuje chunki PNG ✅ — WSZYSTKIE 21 FINDINGÓW ZAMKNIĘTYCH
- Commit: `0df3a20` na main, wersja v1.5.25 → **v1.5.26**. Diff: 1 plik (+16/−15).
- Zmiana: `readQPixMap` przepisane — pełna 8-bajtowa sygnatura PNG (dawniej 4) + pętla po strukturze chunków (uint32 length | typ | data | CRC, koniec na IEND) zamiast skanowania bajtów za sekwencją „IEND". Pomijanie data+CRC przez guard `_need` z kroku 16 → uszkodzona pixmapa = kontrolowany błąd importu zamiast cichego pochłonięcia strumienia. Rewind nie-PNG przez `r.pos = startPos` (równoważny). Writer nietknięty, spec nietknięty (strategia odczytu .dat nie jest specyfikowana).
- Testy (harness a9, ekstrakcja verbatim; PNG testowy wygenerowany PIL-em): **17/17 OK** — T1: prawdziwy PNG odczytany 1:1 + round-trip; T2 różnicowy: bajty „IEND" wewnątrz IDAT — NOWY pełny PNG (66 B), STARY ucinał (51 B, dawny bug potwierdzony); T3: dane po IEND — ogon nietknięty, pos poprawny; T4: nie-PNG → rewind (nowy ≡ stary), niepełna sygnatura 4/8 → NOWY odrzuca; T5 różnicowy: PNG ucięty w środku chunku — NOWY kontrolowany błąd, STARY ciche śmieci; T6: liczniki kotwic.
- Regresja: harness a7 po reticie bazy różnicowej na snapshot pre-A7 (50f37ea) + aktualizacji oczekiwań T6 (_need ×9, audyt A7 ×2, wersja odpięta od numeru) → **20/20 OK**; node --check obu `<script>` OK.
- Baseline: commit `0df3a20`. **Audyt A1–A22 (21 po deduplikacji) — wszystkie findingi obsłużone.**

## Krok 16 (Fala 4) — A7: ReadBuffer z bounds-checkami ✅
- Commit: `c84da83` na main, wersja v1.5.24 → **v1.5.25**. Diff: 1 plik (+15/−8).
- Zmiana: jeden hunk w `ReadBuffer` — nowa metoda `_need(n)` rzuca kontrolowany `Error` („Uszkodzony lub obcięty plik .dat: odczyt N B na pozycji P, plik ma M B") gdy `n < 0` lub `n > remaining()`; wszystkie 6 getterów DataView + `readBytes` przepięte przez guard **przed** przesunięciem `pos` (check-then-advance — pozycja nienaruszona przy błędzie, dawna cicha desynchronizacja usunięta). Komunikat trafia do istniejącego toastu w catchu `loadDat` — zero zmian poza klasą. Spec nietknięty (jakość komunikatu, nie obietnica formatu).
- Fixture `map_master3.dat`: release 0.205.0, 7 847 878 B, untracked (poza repo, pobierany skryptem `tests/fetch-fixture.sh`).
- Testy (harness a7, ekstrakcja verbatim warstwy formatu + DEPS): **20/20 OK** — T1: odczyty poprawne identyczne nowy≡stary; T2: wszystkie gettery + readBytes na obciętym buforze → kontrolowany Error (nigdy RangeError), komunikat z pozycją/rozmiarem, pos nietknięty, readBytes(0) działa; T3: QString z byteLen=2GB → kontrolowany błąd, null/empty → "" bez zmian; T4: **8 deterministycznych obcięć produkcyjnego pliku — STARY: 8× RangeError, NOWY: 8× kontrolowany polski komunikat**; T5: nieobcięty plik: 26988 pokoi, 60 obszarów, 19 wpisów mRoomIdHash; T6: liczniki kotwic. node --check obu `<script>` OK.
- Baseline następnego kroku: commit `c84da83`.

## Krok 15 (Fala 4) — A13: undo DELETE_AREA odtwarza puste kontenery ✅
- Commit: `50f37ea` na main, wersja v1.5.23 → **v1.5.24**. Diff: 1 plik (+31/−4).
- Problem: trzy polityki w trzech miejscach — commit doFn kasował tylko kontenery, które sam opróżnił; redo dispatcher kasował WSZYSTKIE puste (5 typów + exits/special_exits) bez zapisu; undo nie odtwarzał pustych wcale. Cykl commit→undo→redo→undo gubił uprzednio puste kontenery na stałe.
- Decyzja: **wyrównanie commit do redo + nagrywanie + przywracanie**. (1) doFn: usunięte kasowanie opróżnionych exits/special_exits z pętli czyszczących; (2) doFn: nowy blok zbiorczy kasujący wszystkie puste kontenery 7 typów w pokojach spoza obszaru z nagraniem `{roomId, container}` do `state._lastRemovedEmptyContainers`; (3) entry DELETE_AREA dostaje pole `removedEmptyContainers` (wzorzec `_lastCleanedCrossExits`); (4) undo DELETE_AREA: pętla odtwarzająca puste kontenery (`{}` / `[]` dla locków) ze strażnikiem `||` (nie nadpisuje kontenerów odtworzonych przez cleanedExits); (5) redo dispatcher bez zmian — po wyrównaniu commit ≡ redo, entry z commitu wystarcza na wszystkie cykle.
- Wpadka w trakcie: edycja 2 urwała klamrę zamykającą zewnętrzną pętlę czyszczącą (blok zbiorczy wszedł do środka pętli) — wykryte natychmiast weryfikacją struktury, poprawione przed testami; node --check i harness potwierdziły.
- Testy (harness a13, ekstrakcja verbatim): **26/26 OK** — T1: 7 pustych kontenerów nagrane i odtworzone (deep-equal, typy: locki = tablice); T2: pełny cykl commit→undo→redo→undo z wyjściem cross-area z pełnymi metadanymi (cl/door/waga/lock/specLock) — undo ≡ oryginał, redo ≡ post-commit, drugi undo ≡ oryginał; T3: różnicowy — NOWY commit kasuje puste (jak redo) i undo je odtwarza, STARY redo kasował bez zapisu → utrata na stałe (zdemonstronowane źródło A13); T4: entry legacy bez pola → undo bez crasha; T5: liczniki kotwic; T6: smoke regresji dispatcherów (A12/A14 z kroku 14 na tym samym ekstrakcie — deep-equal).
- Porównania deep-equal kanoniczne (sortowane klucze) + obszary jako zbiory — kolejność map.areas po undo i kolejność kluczy po restore to istniejące zachowanie poza scope'm (zapis sortuje przez stableStringify).
- Krok 15 dotyka wyłącznie DELETE_AREA — regresję pokrywa T6.
- Baseline następnego kroku: commit `50f37ea`.

## Krok 14 (Fala 4) — A12 + A14: latentne strażniki rdzenia undo ✅
- Commit: `45aee0f` na main, wersja v1.5.22 → **v1.5.23**. Diff: 1 plik (+23/−10).
- **A12** — `commitAddExit`: (1) dwa guardy odmowne z toastem ⚠ — zajęty kierunek źródła LUB zajęty kierunek powrotny przy bidi → return bez mutacji i bez wpisu undo (operacja atomowa); (2) entry ADD_EXIT zapisuje `prevExit`/`prevOppExit` (po guardzie zawsze undefined — defense in depth na przyszłe źródła wpisów); (3) undo ADD_EXIT przywraca `prevExit`/`prevOppExit` gdy zdefiniowane + sprząta pusty kontener `exits` po usunięciu (ścisła odwrotność — pokój bez wyjść przed operacją nie ma po undo pustego `exits:{}`).
- **A14** — undo ADD_ROOM: usunięta pętla czyszcząca reverse-exity (zwykłe + specjalne) z innych pokoi. Uzasadnienie: entry ADD_ROOM pushowane w chwili tworzenia pokoju (świeże ID, 2 call-site'y sprawdzone), kolejność LIFO gwarantuje że wyjścia do pokoju schodzą ze stosu wcześniej → pętla była martwym kodem, ale destrukcyjnym (redo ADD_ROOM wstawia tylko roomData, skasowane wyjścia przepadały). Gdyby kiedyś powstała ścieżka z auto-wyjściami, wiszące wyjście wykryje walidator — ciche kasowanie byłoby nieodwracalne. Wariant „zapisuj usuwane w entry + przywracaj w redo" odrzucony (wymagałby mutowania entry w czasie undo — złożoność dla nieosiągalnej ścieżki).
- Recon potwierdził strażników UI w obu call-site'ach commitAddExit (13794: przycisk „Dodaj" ukryty dla zajętych + bidi oferowane tylko gdy wolne; 14705: filtr zajętych w masowych powrotnych) — ale oba przechodzą przez asynchroniczny dialog, więc guard w rdzeniu był konieczny (ryzyko latentne).
- Testy (harness a12a14, ekstrakcja verbatim przez kotwice): **26/26 OK** — T1 guard źródła (zero mutacji/undo, toast); T2 guard powrotny (atomowość); T3/T4 happy path jednokierunkowy+bidi ze ścisłą odwrotnością (deep-equal, brak pustych kontenerów); T5 dispatcher przywraca prevExit/prevOppExit z ręcznie złożonego entry; T6 różnicowy stary/nowy (git show HEAD): NOWY zachowuje wyjścia „z boku stosu", STARY je kasował; T7 normalny LIFO undo×2 → deep-equal; T8 liczniki kotwic (korekta oczekiwań po grepie: audyt A12 ×3, prevExit ×4 — błąd w oczekiwaniach, nie w kodzie). node --check obu `<script>` OK.
- Regresja: a11 ALL PASS; ur_core_new 21/4 — FAIL-e to ten sam baseline (DELETE_ROOM/EDIT_ROOM/ADD_EXIT bidi/DELETE_AREA — zamrożona kopia starego dispatchera w harnessie, dokumentująca właśnie klaster A12/A13/A14; A12 i A14 zamknięte tym krokiem w realnym pliku, A13 = krok 15).
- Baseline następnego kroku: commit `45aee0f`.

## Krok 13 (Fala 4) — A17: guard w loadArkmap na poprawny JSON niebędący mapą ✅
- Commit: `fb8e013` na main, wersja v1.5.21 → **v1.5.22**. Diff: 2 hunki (+2/−1).
- Zmiana: guard `if (!map || typeof map !== 'object')` z toastem błędu zaraz po parsowaniu — null/prymitywy nie dochodzą do validate (TypeError → nieobsłużony rejection zamieniony na komunikat). Tablice celowo przechodzą guard — obsługuje je normalna ścieżka walidacji (dialog), bez crasha.
- Recon: wszystkie 4 wejścia wczytywania leją przez loadArkmap → jeden guard pokrywa wszystko.
- Testy: T2 harness verbatim 7/7 (null/42/"tekst"/true → toast + validate nie wołane; wadliwy JSON → stara ścieżka nietknięta; {} → dialog walidacji; poprawna mapa → applyMap); T3 regresja a11 ALL PASS + ur_core 21/4 baseline; node --check OK.
- Baseline następnego kroku: commit `fb8e013`.

## Krok 12 (Fala 4) — A16: saveArkmap wołane ze stringiem/Eventem ✅
- Commit: `d9964c0` na main, wersja v1.5.20 → **v1.5.21**. Diff: 4 hunki (+4/−4).
- Zmiany: (1) listener przycisku Zapisz — wrapper `() => saveArkmap()` (Event nie leci jako onSaved); (2) Ctrl+S — usunięty ignorowany `fname`, `saveArkmap()` (nazwa z _arkmapSuggestedName, zachowanie bez zmian); (3) guard na wejściu saveArkmap: `typeof onSaved !== 'function' → undefined` — pokrywa wszystkie 4 downstream `if (onSaved) onSaved()`; (4) bump wersji.
- Recon: 8 call-site'ów, 2 wadliwe; saveArkmapAs bez parametrów — Event ignorowany, nieszkodliwe (notatka).
- Testy: T2 harness verbatim 7/7 (Event→undefined, string→undefined, funkcja przechodzi referencyjnie, brak arg, ścieżka przez dialog suppressorów dziedziczy normalizację, legalna funkcja przez dialog); T1 liczniki OK; T3 regresja a11 ALL PASS + ur_core 21/4 baseline; node --check OK.
- Baseline następnego kroku: commit `d9964c0`.

## Krok 11 (Fala 3) — A4: orphan custom line attrs — tylko dokumentacja ✅ — FALA 3 ZAMKNIĘTA
- Commit: `23825e3` na main. **Bez bumpu APP_VERSION** (kod nietknięty — md5 studio identyczne z bazą, udowodnione).
- Recon odwrócił rekomendację z audytu: (1) Mudlet sam usuwa orphan style/arrow/color przy wczytaniu mapy (`TRoom::audit` — „points — the master element"), więc te ~52 wpisy to martwe artefakty; (2) sugestia audytu „przenoś jako points:[] + style" była błędna — pusta tablica to suppressor CHOWAJĄCY domyślną linię, konwersja zmieniałaby rendering; (3) edytor ArkMap nigdy nie tworzy orphanów (openCLEditor wymaga wpisu z punktami). Wniosek: przenoszenie = przechowywanie śmieci → udokumentowane odrzucanie.
- Zmiany (tylko spec, 2 hunki): §10 nowy podrozdział „Orphan style/arrow entries"; §19 — orphan przeniesiony do „Normalizations" (5→6), „Known limitations" zastąpione zdaniem zamykającym (od v1.1 brak znanych utrat danych).
- Testy: T1 normalizacje 6/6, limitations = zdanie zamykające, §10 notka obecna; T2 parser OK, kotwice całe; T3 dokładnie 2 hunki; T4 md5 studio + manual identyczne z bazą.
- Baseline następnego kroku: commit `23825e3`.

## Krok 10 (Fala 3) — A3: wagi wyjść = 1 zachowane przy imporcie ✅
- Commit: `79ddae3` na main, wersja v1.5.19 → **v1.5.20**. Diff: studio 2 hunki (+3/−2), spec 2 hunki.
- Zmiana kod: `_datConvertRoom` — usunięte `w !== 1 &&` (jedyny drop w całym pliku; warunek istnienia wyjścia zostaje, zgodnie z §17). Eksport był już czysty (passthrough 5729–5730/5275), edytor już pisał explicite (14529–14534), pathfinding respektuje jawną 1 (9100) — zero zmian tam.
- Zmiana spec: §7 — waga 1 dozwolona i znacząca (w .dat brak wpisu = 0; ArkMap zachowuje jawne 1 z importu i edytora; w routing ArkMap brak wpisu = waga pokoju docelowego); §19 limitations 2→1.
- Testy na produkcyjnym pliku 9/9: nowy import = dokładnie 17 wpisów z wagą 1 (m.in. pokój 6628), stary = 0; łącznie 11794 = 11777 + 17, pozostałe wagi identyczne; round-trip 17/17 odtworzone w .dat; walidator: produkcyjny import OK, waga 0 odrzucana; przyrost kontenerów 2180→2190 (10 pokoi dostało kontener tylko z wagami=1, 7 wpisów doszło do istniejących).
- Regresja: a11 ALL PASS, ur_core 21/4 baseline, node --check OK, spec parser OK, manual nietknięty.
- Baseline następnego kroku: commit `79ddae3`.

## Krok 9 (Fala 3) — A2: meta.room_id_hash w spec v1.1 + oba kierunki ✅
- Commit: `d18723b` na main, wersja v1.5.18 → **v1.5.19**. Diff: studio 4 hunki (+10/−3), spec 4 hunki.
- Zmiany kod: (1) `datToArkmap` — meta dostaje `room_id_hash` (warunkowo, puste pomijane); (2) `arkmapToDat` — `mRoomIdHash: arkmap.meta?.room_id_hash ?? {}` zamiast `{}` na sztywno; (3) walidator — opcjonalny check typu obiekt string→int; (4) bump wersji.
- Zmiany spec: §3 wiersz room_id_hash; nagłówek Version 1 → **1.1**; §17 reguła walidacyjna; §19 „Known limitations" 3→2 (pozycja mRoomIdHash usunięta — naprawiona).
- Kluczowy fakt z recon: parser i writer .dat **już** czytały/pisały mRoomIdHash — gubienie było tylko w 2 miejscach konwersji.
- Testy: 15/15 na produkcyjnym `map_master3.dat` — import: 19 wpisów (m.in. Delwing, Dargoth), deep-equal z oryginałem; round-trip: eksport→reparse daje identyczną zawartość; metryka bajtowa: delta dokładnie 442 B = blok hash w UTF-16 (writer QString = uint32 + UTF-16LE); pusty hash → pole pomijane; walidator: OK/string/nie-int/brak pola. Korekty harnessa w trakcie: kolejność kluczy po reparsee kanoniczna (writeQMapSI sortuje) → porównanie bez względu na kolejność; validate() zwraca {ok, errors, warnings}, err() → {path, msg}; zależność ansiPaletteRgb+ANSI_PAL dołączona verbatim.
- Regresja: a11 ALL PASS, ur_core 21/4 baseline, node --check OK, spec parser OK, manual nietknięty.
- Baseline następnego kroku: commit `d18723b`.

## Krok 8 (Fala 3) — A10: symbol pokoju 1:1 z Mudletem (kod + spec) ✅
- Commit: `322e2ea` na main, wersja v1.5.17 → **v1.5.18**. Diff: studio 3 hunki (+24/−15), spec 1 hunk (§6).
- Zmiany: (1) renderer drawRooms — usunięte `slice(0, 2)`; pełny tekst symbolu; szerokość liczona arytmetycznie (monospace 0.6 em/znak, emoji >0xFFFF = 1.0, po code points); 1–2 znaki = stara formuła bez zmian (`max(7, round(rs·0.7/0.52))`); 3+ znaki = `min(round(rs·0.52), floor(rs/szerokość))`, poniżej 7 px → nie rysujemy (zasada Mudleta); (2) pole rp-symbol — usunięte maxlength="2", nowy title; (3) spec §6 — brak limitu długości + opis zachowania renderera + zalecenie 1–2 znaków.
- Testy: T1 harness różnicowy verbatim (stary blok z git show vs nowy) — 10/10: regresja 1–2 znaki identyczna dla rs 10..100 co do parametrów wywołań; 3 znaki pełne z ciągłością rozmiaru (0.52rs); 10 znaków dopasowane (floor(rs/6)); 30 znaków przy małym pokoju → zero fillText, save/restore sparowane; fallback_symbol w całości; emoji = 1 code point × 1.0 szerokości; T2 slice(0,2)=0, maxlength=0, wersja OK; T3 node --check OK, spec parser OK, kotwice całe; T4 a11 ALL PASS, ur_core 21/4 baseline, manual nietknięty.
- Recon kompletności: ucinanie było w DOKŁADNIE 1 miejscu (6745), maxlength w 1 (2462); panel pokoju pokazuje pełny symbol (bez zmian); walidator sprawdza tylko typ — zgodnie z Mudletem, bez zmian; eksport PNG nie rysuje symboli osobno.
- Świadomie nie kopiowane z Mudleta: pixmap cache, fudge factor, fallback glifów (robi przeglądarka).
- Baseline następnego kroku: commit `322e2ea`.

## Decyzja projektowa (krok 8) — A10 w wersji „1:1 z Mudletem"
- Odrzucona redakcyjna droga 1 dla A10; wybrane **zrównanie zachowania z Mudletem** (kod + spec).
- Fakty z recon Mudleta (src/T2DMap.cpp, addSymbolToPixmapCache): brak limitu długości symbolu; czcionka dopasowywana do kwadratu pokoju (pompuj w górę aż nie wychodzi, cofnij o krok); jeśli nie mieści się nawet przy minimalnym rozmiarze (4pt) — nic nie rysuje; za mały pokój (<8px) — nic nie rysuje.
- Zakres kroku 8: (1) renderer (linia ~6745) — usunąć slice(0,2), dopasowanie rozmiaru czcionki arytmetycznie (monospace → szerokość = znaki × stała), za długi → nie rysuj; (2) pole rp-symbol (linia 2462) — usunąć maxlength="2", poprawić title; (3) spec §6 — brak limitu + opis zachowania renderera.
- Świadomie NIE kopiujemy: pixmap cache, fudge factor, fallback na znak zastępczy (przeglądarka robi sama). 1:1 = zasady, nie piksele.
- Kolejność Fali 3 po zmianie: krok 8 = A10 (kod+spec), krok 9 = A2 (spec v1.1 + room_id_hash), krok 10 = A3 (wagi=1), krok 11 = A4 (orphan style).

## Krok 7 (Fala 3) — A1+A5+A6+A8: redakcja spec (docs-only) ✅
- Commit: `c128df2` na main. **Bez bumpu APP_VERSION** (aplikacja nietknięta; md5 arkmap_studio.html identyczne z bazą — udowodnione w T4).
- Zakres zmieniony decyzją projektową w trakcie: A10 wycofane z kroku 7 — staje się krokiem 8 jako zmiana KODOWA „1:1 z Mudletem" (patrz niżej). Krok 7 = 3 edycje w `docs/arkmap_spec.html`.
- Zmiany: (1) §1 — obietnica bitowa zawężona do plików w kanonicznym układzie Qt (pisanych przez ArkMap), zewnętrzne = bezstratne semantycznie + link do §19; (2) §19 — to samo zawężenie + nowy podrozdział „Normalizations on .dat import" (5 pozycji: kolejność kluczy, bounds obszarów, 4dp na custom lines, label spec=0→czarny, QString null vs pusty) + „Known limitations" (3 pozycje: mRoomIdHash, wagi=1, orphan style/arrow — kroki 9–11 będą je usuwać); (3) §10 — „Precision: 4 decimal places max" zastąpione opisem, gdzie dzieje się zaokrąglenie (import .dat, sub-piksel).
- Testy: T1 stare sformułowania zniknęły (0 wystąpień), nowe obecne (canonical Qt layout ×2), listy 5/3; T2 parser HTML OK, zero kotwic bez celu, zero zduplikowanych id; T3 dokładnie 3 hunki, tylko spec; T4 md5 studio + manual identyczne z bazą.
- Baseline następnego kroku: commit `c128df2`.

## Krok 6 (Fala 2) — A19: akceptacje walidatora bez dirty ✅ — FALA 2 ZAMKNIĘTA
- Commit: `a24907e` na main, wersja v1.5.16 → **v1.5.17**. Diff: +3/−2 (dokładnie 3 hunki).
- Zmiany (2 linie): (1) `_acceptSave` gałąź file — `state.dirty = true` wewnątrz `if (state.map)` (pokrywa `_vdAccept` i `_vdUnaccept`, oba idą przez `_acceptSave`); (2) `_vdMigrate` — `state.dirty = true` po merge do meta.
- Recon: wyczerpujący grep potwierdził, że to jedyne 2 miejsca mutacji `state.map.meta` w pliku. Walidator osiągalny tylko w edit mode (`#edit-toolbar` pod `#app.edit-mode`) — load-guardy `state.editMode && state.dirty` działają bez zmian. Świadomie bez dirty: gałąź browser, `_vdClearAccepts`, select `vd-store` (tylko localStorage, nie mutują pliku).
- Testy: T1 liczniki (`state.dirty = true` 6→8, `state.dirty` 19→21, wersja OK); T2 `_acceptSave` verbatim 4 scenariusze (file+arr, file+pusty, file bez mapy, browser) — 8/8; T3 `_vdMigrate` verbatim 3 scenariusze (happy path z dedupem, brak akceptacji, brak mapy) — 8/8; T4 regresja: a11 ALL PASS, ur_core 21 OK / 4 znane FAIL = baseline; node --check OK. Razem 16/16 + regresja czysta.
- Incydent w trakcie: harness bez zależności `_acceptStore` → ReferenceError; poprawione ekstrakcją verbatim zależności (ta sama lekcja co `_replaceRoomData` w kroku 4).
- Poza scope'm: undo dla akceptacji (osobny feature); poszerzanie guardów poza editMode (niepotrzebne — fakt z recon).
- Baseline następnego kroku: commit `a24907e`, md5 liczony na starcie kroku 7.

## Decyzje projektowe (Fala 3) — zatwierdzone
- **A1 → droga A (korekta obietnicy):** przeredagować §1 spec — „bitowo identyczny dla plików w kanonicznym układzie Qt / zapisanych przez ArkMap" + katalog świadomych normalizacji. NIE robimy bezstratnego importu bajtowego. Przy okazji redakcyjnie domknięte A6 i A10.
- **A2 → naprawić:** dodać `meta.room_id_hash` (object string→int) do spec v1.1 + przenosić w obu kierunkach (datToArkmap + arkmapToDat). 19 wpisów w produkcyjnym pliku.
- Kolejność Fali 3 po zamknięciu Fali 2: (1) A1+A6+A10 redakcja spec, (2) A2 spec v1.1 + kodek, (3) A3 wagi=1, (4) A4 orphan style.

## Krok 5 (Fala 2) — A18: brak beforeunload → utrata pracy przy zamknięciu karty ✅
- Commit: `b59435f` na main, wersja v1.5.15 → **v1.5.16**. Diff: +9/−1 (dokładnie 2 hunki).
- Zmiana: nowy listener `window.addEventListener('beforeunload', …)` po globalnym handlerze klawiatury (przed sekcją UNDO/REDO BUTTONS). Ostrzeżenie gdy `state.dirty || state.editDirty` — obie flagi już istniały i są utrzymywane (dirty z kroku 4; editDirty = formularz pokoju, reszta kodu traktuje go jako niezapisaną pracę).
- Semantyka: celowo BEZ bramki editMode — dirty nie jest kasowane przy wyjściu z trybu edycji (tylko w 6 punktach zapisu), więc jedyny możliwy false positive to „edytowałem → wyszedłem z trybu → zamykam kartę" (bezpieczny).
- Recon: 0 wystąpień beforeunload przed zmianą; kotwica `});\n\n// ── UNDO/REDO BUTTONS` unikalna.
- Testy: T1 harness na verbatim handlerze — 6/6 OK (dirty→preventDefault+returnValue; czyste→brak reakcji; samo editDirty→ostrzeżenie); T2 `'beforeunload'`=1, `state.dirty`=19 (korekta oczekiwania 18→19: nowy handler sam referencjonuje flagę — jedyny przyrost); T3 `node --check` OK; T4 regresja kroku 4: a11_harness ALL PASS, ur_core_new 21 OK / 4 FAIL = identycznie z udokumentowanym baseline'em.
- Poza scope'm: A19 (akceptacje walidatora) = krok 6; semantyka dirty/editDirty nietknięta; brak beforeunload pod import/eksport (audyt nie wymagał).
- Baseline następnego kroku: commit `b59435f`, md5 liczony na starcie kroku 6.

## Krok 4 (Fala 2) — A11' (A11+A15): dirty tracking na fladze state.dirty ✅
- Commit: `439da95` na main, wersja v1.5.14 → **v1.5.15**. Diff: +65/−44.
- Model: flaga `state.dirty` ustawiana przy każdej zmianie stosu undo, kasowana wyłącznie po potwierdzonym zapisie. `_savedAtUndoIndex` usunięty całkowicie (0 wystąpień).
- Choke point: nowy `pushUndo(entry)` — 31 miejsc przemianowanych skryptem z asercjami; **2 pushe w redoAction/redoAll wykluczone** (rename tam rozsadziłby redo — pułapka wykryta w recon).
- Set-true także w: undoAction, redoAction, undoToIndex, redoAll, cichy pop w cancelRoomEdit (6 punktów — scenariusz „save→undo" zmienia treść bez pusha; pułapka nr 2 z recon).
- Clear: 6 success-pointów zapisu (Save: handle/handle-fallback/FSAPI/download; SaveAs: FSAPI + dopięty `.then` na download, który go nie miał); clear PRZED onSaved (latentny TypeError A16 nie pominie cleara). Resety: startLocalEditMode + wrapper applyMap.
- Testy: T1 liczniki (31/2/0/4/6/8); T2 5 scenariuszy zapisu na verbatim `_performArkmapSave` (AbortError zostawia dirty — A15 zamknięte; onSaved rzucający nie pomija cleara); T3 łańcuch pushUndo→save→undo→dirty (A11 zamknięte); T4 regresja odwrotności undo/redo **identyczna z baseline audytu** (21 OK + 4 znane: 3 artefakty testowe + udokumentowane A13 — dispatchery byte-identyczne); T5 node --check OK, diff przejrzany.
- Semantyka konserwatywna udokumentowana w kodzie: undo do stanu zapisanego nadal daje dirty=true (bezpieczny false positive).
- Haczyk dla kroku 6 (A19): `_acceptSave` ustawi `state.dirty = true`.
- Baseline następnego kroku: commit `439da95`.

## Krok 3 (Fala 1) — A22: gh_token walidowany przy starcie mimo martwego UI ✅
- Commit: `44c62c8` na main, wersja v1.5.13 → **v1.5.14**. **FALA 1 ZAMKNIĘTA.**
- Zmiana: IIFE `restoreGitHub` → `purgeStaleGitHubToken` — zero sieci przy starcie; stale token usuwany z localStorage (+ console.info). Martwy kod OAuth/PR zostaje (decyzja projektu).
- Recon wykazał: `state._ghToken`/`_ghUser` są write-only (żadna funkcjonalność ich nie czyta); requesty „Wczytaj mapę online" są publiczne i niezależne od tokena — nietknięte.
- Testy: T1 pre potwierdził fetch z `Authorization: token …` przy starcie; post: fetch nie wołany, token usuwany, brak tokena = no-op, wyjątek localStorage połknięty; T4: dokładnie 1 wystąpienie `api.github.com/user` (martwy handler PAT — świadomie); `node --check` OK.
- Pominięte jako redundantne (inwariant udokumentowany): `resetAllDefaults` + `gh_token` — po purge przy starcie token nie może istnieć w runtime (jedyny setter w martwym UI).
- Baseline następnego kroku: commit `44c62c8`.

## Krok 2 (Fala 1) — A21: escHtml bez cudzysłowów + sink w cl-editor ✅
- Commit: `4f04ea7` na main, wersja v1.5.12 → **v1.5.13**.
- Zmiany (3 linie): (1) `escHtml` += `"`→`&quot;` — zamyka wszystkie 16 sinków atrybutowych naraz; (2) linia 14030 `CL dir=${dir}` → `escHtml(dir)` — surowy sink znaleziony w recon kroku (komenda special exit przez dataset → innerHTML).
- Recon potwierdził bezpieczeństwo globalnej zmiany: 47 użyć escHtml, zero w atrybutach w apostrofach, zero w JS-stringach w atrybutach; `_vdEsc` bez zmian (5 użyć, tylko treść tekstowa).
- Testy: T1/T2 unit na verbatim escHtml (korpus 20 stringów — formalny dowód, że jedyna zmiana to `"`→`&quot;`); T3 E2E w prawdziwym parserze Chromium — pre-fix breakout (ucięty value + atrybut onfocus na wszystkich 3 elementach), post-fix pełny round-trip payloadu i zero obcych atrybutów; T4 sink 14030; T5 diff = dokładnie 3 linie, `node --check` OK.
- Incident w trakcie: równoległe edycje tego samego pliku się rozjechały (wyścig zapisów) — wykryte przez harness (T1/T2 FAIL), poprawione sekwencyjnie. Wniosek procesowy: edycje jednego pliku tylko sekwencyjnie.
- Poza scope'm (notatka): `value="${col}"` (14033) — latentne, wymaga override'u walidacji (crafted cl.color).
- Baseline następnego kroku: commit `4f04ea7`.

## Krok 1 (Fala 1) — A20: XSS w sbMapInfo ✅
- Commit: `6ebd3d0` na main, wersja v1.5.11 → **v1.5.12** (BUILD_DATE liczy się w runtime).
- Zmiana: 1 linia — escapowanie na joinie w `sbMapInfo.innerHTML` (`applyMap`, była linia 6036). Pokrywa `ver`/`rev`/`state.filename` i przyszłe składowe.
- Testy (harness na verbatim bloku z pliku): T1/T2 payloady `<img onerror>`/`<svg onload>` escapowane; T3 benign output bitowo identyczny z baseline (zero regresji wizualnej); T4 `& < >` escapowane; `node --check` obu bloków script OK.
- Poza scope'm (świadomie): `.title` (property — bezpieczne), cudzysłowy (krok 2/A21).
- Baseline następnego kroku: commit `6ebd3d0`, md5 pliku liczony na starcie kroku 2.
