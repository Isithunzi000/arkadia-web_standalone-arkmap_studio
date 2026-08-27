# Mega-test: ArkMap Studio vs mudlet-web vs Mudlet desktop

Trzy silniki map na **identycznych plikach wejsciowych**, w **jednej sesji na tej
samej maszynie**. Cel: twarde dane (czas, RAM, limity) pod propozycje formatu
`.arkmap` dla Mudleta.

| Filar | Silnik | Co mierzymy |
|---|---|---|
| ArkMap | silniki z `arkmap_studio.html` (verbatim, jak w perf labie) | W1 parse `.dat`/`.arkmap` (Node) |
| mudlet-web | `mudlet-map-binary-reader@2.0.0` (dokladnie ten pakiet, ktorego uzywa mudlet-web) | W1 parse `.dat` (Node) + tryb streamingowy |
| Mudlet desktop | binarka release (AppImage) + Lua API | W1 `loadMap` (restore+audit+init2D — pelna cena uzytkownika), W2 `getPath`, W3 `searchRoom`/`getRooms`, W4 RAM procesu |

## Jednorazowy setup (5 minut)

1. **Binarka Mudleta** (release 4.22.0): pobierz `Mudlet-4.22.0-linux-x64.AppImage.tar`
   z https://github.com/Mudlet/Mudlet/releases/latest, zweryfikuj sha256 wzgledem
   `SHA256SUMS.txt`, rozpakuj. Jesli AppImage nie startuje (brak FUSE):
   `./Mudlet*.AppImage --appimage-extract` i uzyj `squashfs-root/AppRun`.
2. **Profil `megatest`**: utworzony recznie raz (offline — bez logowania do gry).
3. **Skrypt profilu**: w profilu `megatest` dodaj jeden element typu "script"
   z pojedyncza linia (podmien sciezke na swoja kopie repo):

   ```lua
   dofile("/home/rzuf/repo/tests/megatest/desktop/workload.lua")
   ```

   To cala "instalacja" — cala logika testu zyje w repo i jest wersjonowana.

## Uruchomienie

```bash
MUDLET_BIN=/sciezka/Mudlet-4.22.0.AppImage bash tests/megatest/run_megatest.sh 5
Fazy mozna wybierac z linii polecen: `--only desktop` (albo `--desktop-only`) odpala tylko desktop na istniejacym manifescie i zachowuje wyniki web/arkmap z poprzedniego biegu; `--skip web,arkmap`; `--dry-run` wypisuje plan bez odpalania. `--help` pokazuje wszystko.
```

- `5` = przebiegow na punkt pomiaru (mediana). Domyslnie 5.
- Fazy mozna pomijac: `SKIP_INPUTS=1 SKIP_WEB=1 SKIP_ARKMAP=1 SKIP_DESKTOP=1`.
- Desktop odpala sie z `-platform offscreen --profile megatest --offline`
  (zero polaczen z gra); jesli offscreen nie wstanie, runner sam sprobuje `xvfb-run`.
- Po zakonczeniu: `tests/megatest/results/<data>/` + `docs/megatest_raport_<data>.html`.

## Co gdzie laduje

```
tests/megatest/
  run_megatest.sh        # orkiestrator (fazy: inputs -> manifest -> W -> A -> D -> raport)
  inputs.sh              # wspolna drabinka plikow (reuse generatorow perf labu)
  gen_manifest.mjs       # deterministyczny manifest: drabinka + 100 par pokoi + 3 frazy (seed 20260827)
  desktop/workload.lua   # cala logika po stronie Mudleta (W1/W2/W3)
  desktop/run_desktop.sh # offscreen run, timeout, RAM z /proc, klasyfikacja OK/CRASH
  web/bench_mudletweb.mjs# parse .dat silnikiem mudlet-web
  results/<data>/        # manifest.{lua,json}, results_web.json, results_arkmap_node.json,
                         # results_desktop.json (finalny, czysty JSON — do wklejenia/commitu) + results_desktop.jsonl (postep na zywo), ram_desktop.txt, META.json, MASZYNA.md
```

## Kryteria limitu (zarejestrowane przed pomiarem)

- **CRASH** — pad/timeout procesu (desktop: budzet domyslnie 3600 s na cala drabinke)
- **LOAD** — mediana wczytania > 30 s
- **MEM** — RAM/heap > 2048 MB

## Uwagi metodologiczne (nie ukrywamy)

- Desktop `loadMap` = restore + audit + init widoku 2D — to swiadomie **cena
  uzytkownika**, nie czysty parse (parse desktopu nie jest dostepny z Lua osobno).
- Pary pokoi do `getPath` i frazy do `searchRoom` sa deterministyczne (seed),
  identyczne przy kazdym regenerowaniu manifestu z tych samych plikow.
- K=32: `.dat` nie istnieje (OOM generatora przy eksporcie) — drabinka
  desktop/web konczy sie na ostatnim K, dla ktorego `.dat` istnieje.
- Wyniki `tests/perf/out/` sa regenerowalne (gitignored); faza A nadpisuje tam
  `results_node.json` i kopiuje go do wynikow mega-testu.

## Troubleshooting (lezecje z sesji 2026-08-27)

- **Segfault desktopu tuz po starcie (rc=139, checkpoints koncza sie na `sysload_handler`)** —
  to NIE test. Mudlet przy starcie profilu laduje najnowsza zapisana mape z
  `~/.config/mudlet/profiles/<profil>/map/*.dat` (kod: `mudlet.cpp` -> `Host::loadMap()` ->
  `TMap::restore("")`). Jesli poprzedni run skonczyl sie na stress_16x, profil
  auto-laduje 431 808 pokoi przy kazdym starcie i pada zanim workload ruszy.
  Naprawa: `rm -f ~/.config/mudlet/profiles/megatest/map/*.dat`.
  Profilaktyka: workload konczy na `loadMap` najmniejszej mapy przed `closeMudlet()`,
  wiec profil zostaje lekki (commit 46acd1e).
- **`ram_desktop.txt` = 1 MB (fausz)** — stary sampler szukal procesu `pgrep -x mudlet`,
  a AppImage nazywa sie inaczej (AppRun / .mount_Mudlet_*). Poprawione: pgrep -ix
  mudlet + AppRun + .mount_Mudlet. Wynik RAM z sesji 2026-08-27 jest niepomierzalny
  i swiadomie niecommitniety — raport pokazuje tam "-".
- **AppImage nie ma `-platform offscreen`** (tylko xcb) — runner sam spada na
  `xvfb-run`; na realnym display: `MEGATEST_DISPLAY=1`.
- **`Warning: Unknown option 'offline'`** — Mudlet 4.22 nie zna `--offline`; harmless.
