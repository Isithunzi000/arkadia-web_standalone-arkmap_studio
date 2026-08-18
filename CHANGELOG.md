# Changelog — ArkMap Studio

Dziennik zmian projektu: fixy z audytu (A1–A22), nowe funkcje, automatyka repo. Najnowsze wpisy na górze.

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
