# Perf lab — benchmark i stress test wydajności (Arc 18)

Narzędzia pomiarowe ArkMap Studio: porównanie formatów `.dat` vs `.arkmap` oraz
drabinka stress testu (limit skalowania). **Nie są częścią regresji** (`run-all.sh`
ich nie odpala — to pomiar czasochłonny, do uruchomienia ręcznie).

Zacommitowane przebiegi (ta sama maszyna: AMD Athlon Silver 3050U 2C/2T, 30 GB RAM,
Node v20.20.1, chrome-headless-shell 152):

- **2026-08-21** (referencyjny, aplikacja przed v1.44.0, silnik sum v2):
  [`results/2026-08-21/`](results/2026-08-21/) — raport:
  [`docs/perf_report.html`](../../docs/perf_report.html)
  ([online](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/perf_report.html)).
- **2026-08-22** (aplikacja v1.44.2, silnik sum v3):
  [`results/2026-08-22/`](results/2026-08-22/) — raporty:
  [`docs/raport_wydajnosci_2026-08-22.html`](../../docs/raport_wydajnosci_2026-08-22.html)
  (niezależny) oraz
  [`docs/porownanie_wydajnosci_2026-08-21_vs_2026-08-22.html`](../../docs/porownanie_wydajnosci_2026-08-21_vs_2026-08-22.html)
  (porównawczy).

Każdy katalog przebiegu zawiera `results_node.json`, `results_browser.json`
(starsze: `.jsonl`), `MASZYNA.md` (opis maszyny) i `META.json` (wersja aplikacji,
silnik sum, tło pomiaru — czytane przez generator raportu).

## Co mierzą fazy

1. **Faza 2 (Node, bez przeglądarki)** — czysty parse `.dat` vs `.arkmap` dokładnie
   tak jak w apce (binarka: `datToArkmap`+walidacja; JSON: `JSON.parse`+walidacja+
   weryfikacja CRC — `.dat` nie ma CRC, stąd celowa asymetria). Odpowiedź na pytanie
   „ile traci .arkmap vs .dat".
2. **Faza 3 (Chromium, realny zegar przez CDP)** — pełne wczytanie w apce z fazami
   (fetch/parse/walidacja/CRC/applyMap/pierwszy render), trasa kamery
   (5 pozycji × 8 zoomów, p95 klatki), heap, eksport `.dat`.
3. **Drabinka stress** — syntetyczne mapy 54k → 864k pokoi (deterministyczne klony
   produkcyjnej Arkadii, remap id blokami, sumy liczone funkcjami aplikacji — wersja
   silnika zależy od wersji aplikacji: przebieg 2026-08-21 = v2, 2026-08-22 = v3).
   Stop per format przy pierwszym złamanym kryterium (zarejestrowane przed pomiarem):
   CRASH (pad/timeout) · LOAD > 30 s · JANK p95 > 50 ms · MEM > 2 GB.

## Pliki

- `gen_stress.mjs` — generator drabinki syntetyków (ekstrakcja verbatim funkcji
  z `arkmap_studio.html`; walidacja `validate()` fail-closed po generacji)
- `bench_parse.js` — mikro-benchmark parse w Node (statystyki min/med/p95/max, `--expose-gc`)
- `perf_driver.html` — driver przeglądarkowy (ładuje prawdziwą apke w iframe,
  mierzy fazy na realnym zegarze — bez virtual-time)
- `cdp_run.py` — launcher Chrome DevTools Protocol (czeka na koniec pomiaru,
  wykrywa pad karty)
- `run.sh` — orkiestrator faz 0–3
- `report_build.mjs` — generator raportów HTML z surowych wyników (żadna liczba
  ani twierdzenie o werdyktach nie jest wpisane ręcznie; tryb porównawczy
  `--compare`; deterministyczny — dwa przebiegi dają identyczne bajty)
- `results/` — zacommitowane przebiegi (podkatalogi per data: surowe dane,
  opis maszyny, META.json)
- `out/` — artefakty lokalnych przebiegów (gitignored; mapy stress do ~450 MB)

## Uruchomienie

```bash
sudo apt install nodejs python3-websockets   # + przegladarka, patrz nizej
bash tests/perf/run.sh                        # z katalogu glownego repo
```

Opcjonalnie: `bash tests/perf/run.sh 10 6144` (przebiegi/punkt, heap Node MB;
domyślnie heap = auto min(6144, 50% RAM)). Domknięcie luk po pierwszym przebiegu
bez ponownej generacji: `SKIP_GEN=1 SKIP_NODE=1 bash tests/perf/run.sh 5`.
Fazy można też pominąć zmiennymi `SKIP_GEN=1` / `SKIP_NODE=1` / `SKIP_BROWSER=1`.

**Przeglądarka (faza 3)** — na Ubuntu 24.04 chromium z apt to snap, a snap bywa
kapryśny. Zalecany oficjalny **chrome-headless-shell** Google (zwykły binarny):

```bash
mkdir -p .chrome-hs && cd .chrome-hs && \
URL=$(python3 -c "import json,urllib.request; d=json.load(urllib.request.urlopen('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json')); print([x['url'] for x in d['channels']['Stable']['downloads']['chrome-headless-shell'] if x['platform']=='linux64'][0])") && \
wget -q "$URL" -O chs.zip && unzip -q chs.zip && rm chs.zip && cd ..
```

`run.sh` sam go znajdzie (`.chrome-hs/` w repo → systemowe chromium/google-chrome;
albo `CHROMIUM_BIN=/sciezka/do/binarki`).

## Raport z własnego przebiegu

```bash
node tests/perf/report_build.mjs tests/perf/out docs/perf_report.html
# raport porownawczy z zacommitowanym przebiegiem referencyjnym:
node tests/perf/report_build.mjs tests/perf/out docs/porownanie.html \
  --compare tests/perf/results/2026-08-21
```

(bez argumentów generator używa zacommitowanego przebiegu `tests/perf/results/2026-08-22/`).
`run.sh` zapisuje wyniki przeglądarki jako `results_browser.json` (tablica JSON,
nadpisywana przyrostowo po każdym rekordzie); generator czyta też starsze pliki
`.jsonl`. Do `tests/perf/out/` warto dorzucić własne `META.json` (wzór:
`results/2026-08-22/META.json`) — generator wplecie wersję aplikacji, silnik sum
i warunki tła w raport.

## Przebieg v4 (silnik sum v4, aplikacja >= v1.45.0)

Narzędzia ekstrahują funkcje sum verbatim z `arkmap_studio.html` — drabinka i
benchmark automatycznie liczą **alg v4** (zweryfikowane smoke K=2: wygenerowana
mapa ma `alg: v4`, `bench_parse` raportuje `crc_ok=true`). Kompletny przebieg
na cichej maszynie (jak poprzednie):

```bash
bash tests/fetch-fixture.sh          # jesli brak map_master3.dat
bash tests/perf/run.sh 5             # pelny re-benchmark v4 (fazy 0-3)
# opcjonalnie domkniecie samych luk drabinki przegladarki (dawna „faza 3"):
SKIP_GEN=1 SKIP_NODE=1 bash tests/perf/run.sh 5
```

Po przebiegu, PRZED generowaniem raportu, dopisz `tests/perf/out/META.json`:

```json
{
  "app_version": "v1.45.2",
  "checksum_alg": "v4",
  "background": "Maszyna bez innego obciążenia w trakcie pomiaru."
}
```

Raporty (niezależny + porównawczy z ostatnim zacommitowanym):

```bash
node tests/perf/report_build.mjs tests/perf/out docs/raport_wydajnosci_<data>.html
node tests/perf/report_build.mjs tests/perf/out docs/porownanie_wydajnosci_<data>.html \
  --compare tests/perf/results/2026-08-22
```

Do commita: `tests/perf/results/<data>/` (results_node.json, results_browser.json,
MASZYNA.md, META.json), oba raporty w `docs/` oraz wpis przebiegu na liscie
u gory tego README. Uwaga: `results/` NIE jest gitignored — wyniki commitujemy
swiadomie; `out/` jest gitignored (artefakty robocze).

## Uwagi

- Skrypty nie modyfikują repo poza `tests/perf/out/` i nie wysyłają nic nigdzie —
  serwer http to `python3 -m http.server` na localhost, tylko na czas fazy 3.
- Generator przy dużych K potrafi zająć kilka-kilkanaście minut i zużyć dużo
  pamięci (OOM przy K=32 z heapem 6 GB — to również wynik stress testu narzędzia).
- Na czyste liczby zamknij na czas testu ciężkie programy.
