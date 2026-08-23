# Kanoniczne kodowanie binarne v4 (sumy kontrolne .arkmap)

Dokument normatywny dla `meta.checksums.alg === 'v4'` w ArkMap Studio.
Wersja: v1.45.0. Status: wiążący. Zastępuje CANONICAL_V3.md (alg v3
wycofany — brak migracji, zapis przelicza sumy do v4).

Zmiany v3 → v4:

1. prefixy domenowe `r4` / `a4` / `f4`,
2. etykieta: `fg_color`/`bg_color` z licznikiem składowych i WSZYSTKIMI
   kanałami (kanał alfa objęty sumą; w v3 uciekał),
3. obszar: objęte pola `grid_mode`, `is_zone`, `zone_area_ref`, `pos`
   (w v3 pozostawały poza sumą — rozjazd względem v2),
4. pokój: objęte pole `hash` (identyfikator upstream, np.
   `45:28:0:Wyzima`),
5. plik: usunięty globalny rollup pokoi (był redundantny względem
   rollupów obszarowych: pokój → obszar → plik),
6. weryfikacja NIGDY nie rzuca (uszkodzone dane → `verifyError`,
   głos ma walidacja strukturalna); alg inny niż `v4` → głośny
   `algMismatch` (cichy skip byłby dziurą downgrade'ową).

## 1. Cel i właściwości

Kodowanie kanoniczne przekształca obiekt pokoju / obszaru / pliku w jeden,
jednoznacznie zdeterminowany ciąg bajtów, z którego liczona jest suma
XXH3-64 (seed 0, wynik 16 znaków hex małymi literami). Kodowanie:

- jest funkcją czystą wyłącznie pól merytorycznych obiektu,
- nie zależy od kolejności kluczy w JSON, białych znaków ani reprezentacji
  liczb w tekście źródłowym,
- nie wykonuje głębokich kopii ani serializacji pośrednich (JSON),
- normalizuje wartości domyślne identycznie jak `_stripRoomDefaults`
  (pomija to, co strip pomija).

Zmiana dowolnego merytorycznego pola zmienia sumę. Zmiana formatowania
pliku JSON — nie.

## 2. Prymitywy (little-endian)

| Prymityw | Kodowanie |
|---|---|
| `u8` | 1 bajt |
| `u32` | 4 bajty LE, bez znaku |
| `i32` | 4 bajty LE, ze znakiem (complement-2); wartości spoza zakresu są obcinane mod 2^32 jak w `\|0` |
| `f64` | 8 bajtów LE IEEE-754. Normalizacja przed zapisem: `-0` → `+0`; każdy `NaN` → kanoniczny quiet-NaN o bitach `7ff8000000000000` |
| `str` | `u32` = liczba bajtów UTF-8, potem bajty UTF-8 |
| `bool` | `u8`: 0 lub 1 |
| lista | `u32` = liczba elementów, potem elementy |
| surowy hash | 8 bajtów LE wartości XXH3-64 (do rollupów) |

Porządek kluczy map: UTF-8 bajtowo rosnąco, chyba że zaznaczono inaczej.

Uwaga domenowa (i32): współrzędne, identyfikatory i liczniki w formacie
.arkmap są z założenia 32-bitowe (format .dat Mudlet przechowuje je jako
int32). Kodowanie `i32` obcina wartości spoza zakresu mod 2^32 (jak `|0`)
— jest to celowa zgodność z domeną, nie obsługa wartości 64-bitowych;
walidator odrzuca nie-liczby i niecałkowite w polach całkowitych.

## 3. Pokój — prefix domenowy `r4`

Pola w ustalonej kolejności (pole pomijane = nic nie jest zapisywane,
chyba że zaznaczono inaczej):

1. prefix: bajty ASCII `r4`
2. `id` i32; `x` i32; `y` i32; `z` i32; `env` i32
3. `weight` i32 — pomijany gdy `=== 1`
4. `locked` bool — pomijany gdy `false`
5. `hidden` bool — pomijany gdy `false`
6. `symbol` str — pomijany gdy `''`
7. `name` str — pomijany gdy `''`
8. `notes` str — pomijany gdy `''`
9. `exits`: mapa kierunków. Kolejność: najpierw znane kierunki wg
   `_V4_DIR_ORDER` (`n,ne,e,se,s,sw,w,nw,up,down,in,out`), potem
   nieznane klucze UTF-8 bajtowo rosnąco. Wpis: klucz str + cel i32.
   Pomijany gdy pusty.
10. `exit_locks`: lista kierunkow (stringi), kolejnosc wg
    `_V4_DIR_ORDER`, wpis: klucz str (bez wartosci). Pomijany gdy
    pusty.
11. `doors`: jak (9), wpis: klucz str + wartość str
    (`open`/`closed`/`locked`). Pomijany gdy pusty.
12. `stubs`: jak (10) — lista kierunkow wg `_V4_DIR_ORDER`, wpis:
    klucz str. Pomijany gdy pusty.
13. `special_exits`: klucze UTF-8 bajtowo rosnąco, wpis: klucz str +
    cel i32. Pomijany gdy pusty.
14. `special_exit_locks`: lista komend (stringi), kolejnosc UTF-8
    bajtowo rosnaco, wpis: str (bez wartosci). Pomijany gdy pusty.
15. `exit_weights`: jak (9), wpis: klucz str + i32. Pomijany gdy pusty.
16. `custom_lines`: klucze UTF-8 bajtowo rosnąco. Wpis:
    - klucz str
    - `points`: `u32` liczba punktów + punkty (f64, f64) — lista PŁASKA
      `[x,y]` par. Puste `points` (`[]`) = supresor linii wyjścia —
      kodowane jako licznik 0 (odróżnialne od braku wpisu!).
    - `color`: pomijany gdy nieobecny; gdy obecny: `u8=1` + 3 × i32
    - `style`: po normalizacji `null → 'solid'`; pomijany gdy `'solid'`,
      inaczej `u8=1` + str
    - `arrow`: po normalizacji `null → false`; pomijany gdy `false`,
      inaczej `u8=1`
    Pomijany gdy pusty.
17. `tags`: lista, wartości UTF-8 bajtowo rosnąco, wpis: str. Pomijany
    gdy pusty.
18. `user_data`: klucze UTF-8 bajtowo rosnąco, wpis: klucz str +
    wartość str. Pomijany gdy pusty.
19. `hash` str — identyfikator pokoju z upstream (np. `45:28:0:Wyzima`),
    pomijany gdy nie-string lub pusty. Nowość v4.

Hash pokoju: XXH3-64 nad bajtami 1–19, seed 0.

## 4. Obszar — prefix `a4`

1. prefix: bajty ASCII `a4`
2. `id` i32
3. `name` str
4. pola opcjonalne obszaru (presence-guard: obecność klucza = zapis,
   niezależnie od wartości; nieobecność = pominięcie). Nowość v4:
   - `grid_mode` bool — zapisywany gdy klucz obecny
   - `is_zone` bool — zapisywany gdy klucz obecny
   - `zone_area_ref` i32 — zapisywany gdy klucz obecny
   - `pos` — gdy tablica: 3 × i32
5. `labels`: lista etykiet posortowana po `id` numerycznie rosnąco.
   Etykieta:
   - `id` i32; `x` f64; `y` f64; `z` i32; `width` f64; `height` f64
   - `text` str
   - `fg_color`: `u32` liczba składowych + składowe i32 (WSZYSTKIE
     kanały, w tym alfa — zmiana v4)
   - `bg_color`: jak wyżej
   - `show_on_top` bool (brak → 0); `no_scaling` bool (brak → 0)
   - `pixmap`: `u8` obecności; gdy 1 → str (brak/null → 0)
   Pomijane gdy puste.
   Tolerancja (weryfikacja biegnie przed dialogiem walidacji, plik może
   być uszkodzony): `fg_color`/`bg_color` niebędące tablicą → kodowane
   jako `[0,0,0]`; pusty `pixmap` (`''`) → traktowany jak nieobecny.
   Walidator takie wartości odrzuci — kodowanie jest tu wyłącznie
   deterministyczne, nie normatywne.
6. `user_data`: klucze UTF-8 bajtowo rosnąco, wpis: klucz str +
   wartość str. Pomijany gdy pusty.
7. rollup pokoi: `u32` liczba + surowe hashe (8B LE) pokoi obszaru,
   kolejność po `id` pokoju numerycznie rosnąco.

Hash obszaru: XXH3-64 nad bajtami 1–7.

## 5. Plik — prefix `f4`

1. prefix: bajty ASCII `f4`
2. `colors.env_colors`: klucze = numeryczne id env, kolejność numeryczna
   rosnąca; wpis: klucz i32 + wartość i32 (0–255).
3. `colors.custom_env_colors`: klucze numerycznie rosnąco; wpis:
   klucz i32 + `u8` liczba składowych (3 lub 4) + składowe i32.
4. rollup obszarów: `u32` liczba + surowe hashe obszarów, kolejność po
   `id` obszaru numerycznie rosnąco.

Hash pliku: XXH3-64 nad bajtami 1–4. Sekcje puste kodują się jako
licznik 0 — hash pliku jest zawsze zdefiniowany. Zmiana v4: brak
globalnego rollupu pokoi (sekcja 5 z v3) — pokój jest już objęty
hashem swojego obszaru, a obszar hashem pliku.

## 6. Zapis w pliku

```
meta.checksums = {
  alg: 'v4',
  file: <16 hex>,
  areas: { "<areaId>": <16 hex>, ... },
  rooms: { "<roomId>": <16 hex>, ... }
}
```

Klucze słowników: `String(id)`.

## 7. Weryfikacja (verifyChecksums)

- Brak sekcji sum → `present:false` (cicho: świeże/zaimportowane pliki).
- `alg` inny niż `v4` (w tym brak pola) → `present:true, ok:false,
  algMismatch` — GŁOŚNO (zmiana v4; cichy skip byłby dziurą
  downgrade'ową: plik ze starymi sumami wyglądałby na plik bez sum).
- Weryfikacja NIGDY nie rzuca: wyjątek liczenia na uszkodzonych danych
  → `ok:false, verifyError:true` (głos ma walidacja strukturalna).
- Raportuje: `badAreas`, `badRooms` (zmieniona treść), `missingRooms`,
  `missingAreas` (obiekt bez wpisu sumy), `extraRooms`, `extraAreas`
  (sieroty: wpis sumy bez obiektu; porządek bajtowy kluczy-stringów).
  Każda z tych niezgodności → `ok:false`.
- Zwraca też `computed` (pełny zestaw policzonych sum) do reużycia przez
  `_computeBaseInfo` — jedno liczenie na wczytanie pliku.
- Asymetria celowa: ścieżka wczytania jest niezawodna (no-throw),
  ścieżki zapisu (`addChecksums`, `_computeBaseInfo`, kalka) są
  fail-loud — wyjątek tam oznacza bug aplikacji, nie dane usera.
