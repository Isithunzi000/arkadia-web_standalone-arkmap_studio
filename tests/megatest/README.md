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
