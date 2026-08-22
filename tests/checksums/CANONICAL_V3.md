# Kanoniczne kodowanie binarne v3 (sumy kontrolne .arkmap)

Dokument normatywny dla `meta.checksums.alg === 'v3'` w ArkMap Studio.
Wersja: v1.44.0. Status: wiążący.

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
| `i32` | 4 bajty LE, ze znakiem (complement-2); wartości spoza zakresu są obcinane mod 2^32 jak w `|0` |
| `f64` | 8 bajtów LE IEEE-754. Normalizacja przed zapisem: `-0` → `+0`; każdy `NaN` → kanoniczny quiet-NaN o bitach `7ff8000000000000` |
| `str` | `u32` = liczba bajtów UTF-8, potem bajty UTF-8 |
| `bool` | `u8`: 0 lub 1 |
| lista | `u32` = liczba elementów, potem elementy |
| surowy hash | 8 bajtów LE wartości XXH3-64 (do rollupów) |

Porządek kluczy map: UTF-8 bajtowo rosnąco, chyba że zaznaczono inaczej.

## 3. Pokój — prefix domenowy `r3`

Pola w ustalonej kolejności (pole pomijane = nic nie jest zapisywane,
chyba że zaznaczono inaczej):

1. prefix: bajty ASCII `r3`
2. `id` i32; `x` i32; `y` i32; `z` i32; `env` i32
3. `weight` i32 — pomijany gdy `=== 1`
4. `locked` bool — pomijany gdy `false`
5. `hidden` bool — pomijany gdy `false`
6. `symbol` str — pomijany gdy `''`
7. `name` str — pomijany gdy `''`
8. `notes` str — pomijany gdy `''`
9. `exits`: mapa kierunków. Kolejność: najpierw znane kierunki wg
   `_DIFF_DIR_ORDER` (`n,ne,e,se,s,sw,w,nw,up,down,in,out`), potem
   nieznane klucze UTF-8 bajtowo rosnąco. Wpis: klucz str + cel i32.
   Pomijany gdy pusty.
10. `exit_locks`: lista kierunkow (stringi), kolejnosc wg
    `_DIFF_DIR_ORDER`, wpis: klucz str (bez wartosci). Pomijany gdy
    pusty.
11. `doors`: jak (9), wpis: klucz str + wartość str
    (`open`/`closed`/`locked`). Pomijany gdy pusty.
12. `stubs`: jak (10) — lista kierunkow wg `_DIFF_DIR_ORDER`, wpis:
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

Hash pokoju: XXH3-64 nad bajtami 1–18, seed 0.

## 4. Obszar — prefix `a3`

1. prefix: bajty ASCII `a3`
2. `id` i32
3. `name` str
4. `labels`: lista etykiet posortowana po `id` numerycznie rosnąco.
   Etykieta:
   - `id` i32; `x` f64; `y` f64; `z` i32; `width` f64; `height` f64
   - `text` str
   - `fg_color`: 3 × i32 (r, g, b)
   - `bg_color`: 3 × i32
   - `show_on_top` bool (brak → 0); `no_scaling` bool (brak → 0)
   - `pixmap`: `u8` obecności; gdy 1 → str (brak/null → 0)
   Pomijane gdy puste.
5. rollup pokoi: `u32` liczba + surowe hashe (8B LE) pokoi obszaru,
   kolejność po `id` pokoju numerycznie rosnąco.

Hash obszaru: XXH3-64 nad bajtami 1–5. Pola `grid_mode`, `is_zone`,
`zone_area_ref`, `user_data` obszaru nie wchodzą do sumy (parzystość
z v2: `_stripAreaForCrc` hashował tylko id/name/labels/rooms).

## 5. Plik — prefix `f3`

1. prefix: bajty ASCII `f3`
2. `colors.env_colors`: klucze = numeryczne id env, kolejność numeryczna
   rosnąca; wpis: klucz i32 + wartość i32 (0–255).
3. `colors.custom_env_colors`: klucze numerycznie rosnąco; wpis:
   klucz i32 + `u8` liczba składowych (3 lub 4) + składowe i32.
4. rollup obszarów: `u32` liczba + surowe hashe obszarów, kolejność po
   `id` obszaru numerycznie rosnąco.
5. rollup wszystkich pokoi: `u32` liczba + surowe hashe pokoi, kolejność
   po `id` pokoju numerycznie rosnąco (globalnie).

Hash pliku: XXH3-64 nad bajtami 1–5. Sekcje puste kodują się jako
licznik 0 — hash pliku jest zawsze zdefiniowany.

## 6. Zapis w pliku

```
meta.checksums = {
  alg: 'v3',
  file: <16 hex>,
  areas: { "<areaId>": <16 hex>, ... },
  rooms: { "<roomId>": <16 hex>, ... }
}
```

Klucze słowników: `String(id)`. Weryfikacja: dowolny inny `alg`
(brak, `v1`, `v2`, nieznany) → ciche pominięcie (`present:false`
z perspektywy UI, bez ostrzeżeń).
