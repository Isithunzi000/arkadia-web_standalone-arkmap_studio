# Perf lab — benchmark i stress test wydajności (Arc 18)

Narzędzia pomiarowe ArkMap Studio: porównanie formatów `.dat` vs `.arkmap` oraz
drabinka stress testu (limit skalowania). **Nie są częścią regresji** (`run-all.sh`
ich nie odpala — to pomiar czasochłonny, do uruchomienia ręcznie).

Wyniki przebiegu referencyjnego (2026-08-21, AMD Athlon Silver 3050U 2C/2T, 30 GB RAM,
Node v20.20.1, chrome-headless-shell 152): [`results/`](results/) + opis maszyny
[`results/MASZYNA.md`](results/MASZYNA.md). Wygenerowany z nich raport:
[`docs/perf_report.html`](../../docs/perf_report.html)
([online](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/perf_report.html)).

## Co mierzą fazy

1. **Faza 2 (Node, bez przeglądarki)** — czysty parse `.dat` vs `.arkmap` dokładnie
   tak jak w apce (binarka: `datToArkmap`+walidacja; JSON: `JSON.parse`+walidacja+
   weryfikacja CRC — `.dat` nie ma CRC, stąd celowa asymetria). Odpowiedź na pytanie
   „ile traci .arkmap vs .dat".
2. **Faza 3 (Chromium, realny zegar przez CDP)** — pełne wczytanie w apce z fazami
   (fetch/parse/walidacja/CRC/applyMap/pierwszy render), trasa kamery
   (5 pozycji × 8 zoomów, p95 klatki), heap, eksport `.dat`.
3. **Drabinka stress** — syntetyczne mapy 54k → 864k pokoi (deterministyczne klony
   produkcyjnej Arkadii, remap id blokami, sumy v2). Stop per format przy pierwszym
   złamanym kryterium (zarejestrowane przed pomiarem):
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
- `report_build.mjs` — generator raportu HTML z surowych wyników (żadna liczba
  w raporcie nie jest wpisana ręcznie)
- `results/` — zacommitowany przebieg referencyjny (surowe dane + opis maszyny)
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
```

(bez argumentów generator używa zacommitowanego przebiegu `tests/perf/results/`).

## Uwagi

- Skrypty nie modyfikują repo poza `tests/perf/out/` i nie wysyłają nic nigdzie —
  serwer http to `python3 -m http.server` na localhost, tylko na czas fazy 3.
- Generator przy dużych K potrafi zająć kilka-kilkanaście minut i zeżreć pamięć
  (OOM przy K=32 z heapem 6 GB — to samo w sobie wynik stress testu narzędzia).
- Na czyste liczby zamknij na czas testu ciężkie programy.
