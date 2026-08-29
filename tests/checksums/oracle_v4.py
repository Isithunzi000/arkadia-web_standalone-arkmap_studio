#!/usr/bin/env python3
# oracle_v4.py — referencyjny enkoder kanoniczny v4 + generator wektorow.
# Zrodlo prawdy dla implementacji JS (ArkMap Studio v1.45.0).
# Zmiany v3 -> v4: prefixy r4/a4/f4; label fg/bg z licznikiem i wszystkimi kanalami
# (alfa objeta); pola obszaru grid_mode/is_zone/zone_area_ref/pos objete suma;
# room.hash objety suma; suma pliku bez globalnego rollupu pokoi (redundantny
# wzgledem rollupow obszarow). Spec normatywny: CANONICAL_V4.md.
# Wymaga: pip install xxhash
# Uzycie: python3 tests/checksums/oracle_v4.py
# Wynik: tests/checksums/vectors_v4.json + tests/checksums/golden_fixture.arkmap

import json
import math
import os
import struct
import sys

import xxhash

DIR_ORDER = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'up', 'down', 'in', 'out']
DIR_SET = set(DIR_ORDER)
QNAN_BITS = 0x7FF8000000000000

HERE = os.path.dirname(os.path.abspath(__file__))


# ---------- prymitywy (little-endian) ----------

def u8(v):
    return struct.pack('<B', v & 0xFF)


def u32(v):
    return struct.pack('<I', v & 0xFFFFFFFF)


def i32(v):
    v = int(v) % (1 << 32)
    if v >= (1 << 31):
        v -= 1 << 32
    return struct.pack('<i', v)


def f64(v):
    v = float(v)
    if math.isnan(v):
        return struct.pack('<Q', QNAN_BITS)
    if v == 0:
        v = 0.0  # -0 -> +0
    return struct.pack('<d', v)


def s_enc(s):
    b = str(s).encode('utf-8')
    return u32(len(b)) + b


def b_enc(v):
    return u8(1 if v else 0)


def utf8_keysort(keys):
    return sorted(keys, key=lambda k: str(k).encode('utf-8'))


def dir_keysort(keys):
    """Najpierw znane kierunki wg DIR_ORDER, potem nieznane UTF-8 bajtowo."""
    known = [d for d in DIR_ORDER if d in keys]
    unknown = utf8_keysort([k for k in keys if k not in DIR_SET])
    return known + unknown


def xxh3_raw(data):
    """Surowe 8 bajtow LE hasha XXH3-64 (do rollupow)."""
    return struct.pack('<Q', xxhash.xxh3_64_intdigest(data, seed=0))


def xxh3_hex(data):
    return format(xxhash.xxh3_64_intdigest(data, seed=0), '016x')


# ---------- enkodery kanoniczne ----------

def enc_room(r):
    out = bytearray(b'r4')
    out += i32(r['id']) + i32(r['x']) + i32(r['y']) + i32(r['z']) + i32(r['env'])
    if r.get('weight', 1) != 1:
        out += i32(r['weight'])
    if r.get('locked', False):
        out += b_enc(True)
    if r.get('hidden', False):
        out += b_enc(True)
    for fld in ('symbol', 'name', 'notes'):
        v = r.get(fld, '')
        if v != '':
            out += s_enc(v)

    def dir_map(fld, val_enc):
        m = r.get(fld) or {}
        if not m:
            return b''
        o = bytearray(u32(len(m)))
        for k in dir_keysort(m.keys()):
            o += s_enc(k)
            if val_enc is not None:
                o += val_enc(m[k])
        return bytes(o)

    def dir_list(fld):
        lst = r.get(fld) or []
        if not lst:
            return b''
        o = bytearray(u32(len(lst)))
        for k in dir_keysort(lst):
            o += s_enc(k)
        return bytes(o)

    out += dir_map('exits', i32)
    out += dir_list('exit_locks')
    out += dir_map('doors', s_enc)
    out += dir_list('stubs')

    se = r.get('special_exits') or {}
    if se:
        out += u32(len(se))
        for k in utf8_keysort(se.keys()):
            out += s_enc(k) + i32(se[k])
    sel = r.get('special_exit_locks') or []
    if sel:
        out += u32(len(sel))
        for k in utf8_keysort(sel):
            out += s_enc(k)

    out += dir_map('exit_weights', i32)

    cl = r.get('custom_lines') or {}
    if cl:
        out += u32(len(cl))
        for k in utf8_keysort(cl.keys()):
            e = cl[k]
            out += s_enc(k)
            pts = e.get('points') or []
            out += u32(len(pts))
            for pt in pts:
                out += f64(pt[0]) + f64(pt[1])
            color = e.get('color')
            if color is not None:
                out += u8(1)
                for c in color:
                    out += i32(c)
            style = e.get('style')
            if style is None:
                style = 'solid'
            if style != 'solid':
                out += u8(1) + s_enc(style)
            arrow = e.get('arrow')
            if arrow is None:
                arrow = False
            if arrow:
                out += u8(1)

    tags = r.get('tags') or []
    if tags:
        st = sorted([str(t) for t in tags], key=lambda t: t.encode('utf-8'))
        out += u32(len(st))
        for t in st:
            out += s_enc(t)

    ud = r.get('user_data') or {}
    if ud:
        out += u32(len(ud))
        for k in utf8_keysort(ud.keys()):
            out += s_enc(k) + s_enc(ud[k])

    # v4: hash pokoju z upstream (np. "45:28:0:Wyzima") objety suma
    rh = r.get('hash')
    if isinstance(rh, str) and rh != '':
        out += s_enc(rh)

    return bytes(out)


def enc_label(lb):
    out = bytearray()
    out += i32(lb['id']) + f64(lb['x']) + f64(lb['y']) + i32(lb['z'])
    out += f64(lb['width']) + f64(lb['height'])
    out += s_enc(lb['text'])
    # v4: liczba skladowych + wszystkie kanaly (alfa objeta)
    fg = lb['fg_color'] if isinstance(lb.get('fg_color'), list) else [0, 0, 0]
    bg = lb['bg_color'] if isinstance(lb.get('bg_color'), list) else [0, 0, 0]
    out += u32(len(fg))
    for c in fg:
        out += i32(c)
    out += u32(len(bg))
    for c in bg:
        out += i32(c)
    out += b_enc(lb.get('show_on_top', False))
    out += b_enc(lb.get('no_scaling', False))
    pm = lb.get('pixmap')
    if pm is None or pm == '':
        out += u8(0)
    else:
        out += u8(1) + s_enc(pm)
    return bytes(out)


def enc_area(area, room_hash_by_id):
    out = bytearray(b'a4')
    out += i32(area['id']) + s_enc(area['name'])
    # v4: pola obszaru wczesniej poza suma (presence-guard jak w konwencji pliku)
    if 'grid_mode' in area:
        out += b_enc(area['grid_mode'])
    if 'is_zone' in area:
        out += b_enc(area['is_zone'])
    if 'zone_area_ref' in area:
        out += i32(area['zone_area_ref'])
    if isinstance(area.get('pos'), list):
        out += i32(area['pos'][0]) + i32(area['pos'][1]) + i32(area['pos'][2])
    labels = sorted(area.get('labels') or [], key=lambda l: l['id'])
    if labels:
        out += u32(len(labels))
        for lb in labels:
            out += enc_label(lb)
    ud = area.get('user_data') or {}
    if ud:
        out += u32(len(ud))
        for k in utf8_keysort(ud.keys()):
            out += s_enc(k) + s_enc(ud[k])
    rooms = sorted(area.get('rooms') or [], key=lambda r: r['id'])
    out += u32(len(rooms))
    for r in rooms:
        out += xxh3_raw(enc_room(r))
    return bytes(out)


def enc_colors(colors):
    out = bytearray()
    env = colors.get('env_colors') or {}
    ekeys = sorted(env.keys(), key=lambda k: int(k))
    out += u32(len(ekeys))
    for k in ekeys:
        out += i32(int(k)) + i32(env[k])
    cenv = colors.get('custom_env_colors') or {}
    ckeys = sorted(cenv.keys(), key=lambda k: int(k))
    out += u32(len(ckeys))
    for k in ckeys:
        comps = cenv[k]
        out += i32(int(k)) + u8(len(comps))
        for c in comps:
            out += i32(c)
    return bytes(out)


def enc_file(colors, areas):
    out = bytearray(b'f4')
    out += enc_colors(colors)
    area_entries = []
    for a in areas:
        ah = xxh3_raw(enc_area(a, None))
        area_entries.append((a['id'], ah))
    area_entries.sort(key=lambda t: t[0])
    # v4: bez globalnego rollupu pokoi — redundantny wzgledem rollupow obszarow
    out += u32(len(area_entries))
    for _, h in area_entries:
        out += h
    return bytes(out)


# ---------- kodowanie obiektu meta (prefix 'm4') — checksums.meta, koperta v2 ----------
# Generyczne, rekurencyjne kodowanie wartosci JSON z tagami typow.
# Spec: CANONICAL_V4.md §8. Wektory: vectors_v4_meta.json (osobny plik).

META_MAX_DEPTH = 60


def _enc_meta_value(v, out, depth):
    if depth > META_MAX_DEPTH:
        raise ValueError('meta-canon-depth')
    if v is None:
        out += u8(0)
    elif v is False:
        out += u8(1)
    elif v is True:
        out += u8(2)
    elif isinstance(v, (int, float)):
        # rozroznienie wartosciowe (jak w JS): calkowita w i32 -> tag 3, inaczej f64
        if float(v).is_integer() and -(1 << 31) <= v <= (1 << 31) - 1:
            out += u8(3) + i32(int(v))
        else:
            out += u8(4) + f64(v)
    elif isinstance(v, str):
        out += u8(5) + s_enc(v)
    elif isinstance(v, list):
        out += u8(6) + u32(len(v))
        for item in v:
            _enc_meta_value(item, out, depth + 1)
    elif isinstance(v, dict):
        keys = utf8_keysort(v.keys())
        out += u8(7) + u32(len(keys))
        for k in keys:
            out += s_enc(k)
            _enc_meta_value(v[k], out, depth + 1)
    else:
        out += u8(0)  # typy spoza JSON — deterministycznie jako null


def enc_meta(meta):
    out = bytearray(b'm4')
    m = meta if isinstance(meta, dict) else {}
    keys = utf8_keysort(m.keys())
    out += u32(len(keys))
    for k in keys:
        out += s_enc(k)
        _enc_meta_value(m[k], out, 1)
    return bytes(out)


# ---------- golden fixture ----------

def tiny_png_b64():
    p = os.path.join(HERE, '..', 'fixtures', 'tiny.png')
    if os.path.exists(p):
        import base64
        with open(p, 'rb') as f:
            return base64.b64encode(f.read()).decode('ascii')
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='


def build_fixture():
    pm = tiny_png_b64()
    rooms_a = [
        # 1: pokoj absolutnie domyslny (same wymagane pola)
        {'id': 1, 'x': 0, 'y': 0, 'z': 0, 'env': 1},
        # 2: pelny pokoj — kazde pole, unicode, wszystkie kontenery
        {
            'id': 2, 'x': -17, 'y': 42, 'z': -3, 'env': 260,
            'weight': 7, 'locked': True, 'hidden': True,
            'symbol': '@', 'name': 'Karczma „Pod Złotym Smokiem” 🐉',
            'notes': 'zażółć gęślą jaźń — notatka testowa',
            'exits': {'n': 1, 'se': 3, 'bogusdir': 99},
            'exit_locks': ['n', 'se'],
            'doors': {'n': 'locked', 'se': 'open'},
            'stubs': ['w', 'up'],
            'special_exits': {'wejdź do piwnicy': 5, 'uciekaj': 1},
            'special_exit_locks': ['uciekaj'],
            'exit_weights': {'n': 1, 'se': 12},
            'custom_lines': {
                'n': {'points': [[0.0, 0.0], [1.5, 2.25], [3.0, -4.5]],
                      'color': [255, 32, 0], 'style': 'dashed',
                      'arrow': True},
                'uciekaj': {'points': [],
                            'style': None, 'arrow': None},
            },
            'tags': ['quest', 'sklep', '⚓'],
            'user_data': {'klucz z ogonkami ąę': 'wartość 🧭', 'zz': '1'},
            # v4: hash pokoju z upstream objety suma
            'hash': '45:28:0:Karczma Pod Złotym Smokiem',
        },
        # 3: wagi i pojedyncze wyjscie
        {'id': 3, 'x': 5, 'y': 5, 'z': 0, 'env': 4,
         'exits': {'nw': 2}, 'exit_weights': {'nw': 3}},
        # 4: custom_lines minimalny (bez color/style/arrow — pominiete)
        {'id': 4, 'x': 9, 'y': 1, 'z': 0, 'env': 2,
         'custom_lines': {'e': {'points': [[0.0, 0.0], [0.5, 0.5]]}},
         'exits': {'e': 1}},
        # 5: cel special_exits
        {'id': 5, 'x': -4, 'y': -8, 'z': -1, 'env': 3, 'weight': 2},
        # 6: puste kontenery jawnie wpisane (po strip = domyslny)
        {'id': 6, 'x': 1, 'y': 2, 'z': 0, 'env': 1,
         'exits': {}, 'doors': {}, 'exit_weights': {}, 'custom_lines': {},
         'special_exits': {}, 'user_data': {}, 'stubs': [],
         'exit_locks': [], 'special_exit_locks': [],
         'tags': [], 'weight': 1, 'locked': False, 'hidden': False,
         'symbol': '', 'name': '', 'notes': ''},
    ]
    rooms_b = [
        # 101: duze id, z gleboko ujemne
        {'id': 101, 'x': 1000000, 'y': -1000000, 'z': -2147483648,
         'env': 0, 'notes': 'skrajne wspolrzedne'},
        # 102: custom_lines z arrow=True i style='dotted'
        {'id': 102, 'x': 7, 'y': 7, 'z': 7, 'env': 7,
         'exits': {'down': 103},
         'custom_lines': {'down': {'points': [[1.0, 1.0]],
                                   'style': 'dotted', 'arrow': True}}},
        # 103: special_exits z kluczami do sortowania UTF-8
        {'id': 103, 'x': 0, 'y': 0, 'z': 5, 'env': 8,
         'special_exits': {'z': 101, 'ą': 102, 'a': 5},
         'exits': {'down': 101}},
        # 104: exit_locks/stubs
        {'id': 104, 'x': 2, 'y': 3, 'z': 5, 'env': 8,
         'exits': {'up': 103}, 'exit_locks': ['up'],
         'stubs': ['n', 's']},
        # 105: user_data numeryczne klucze (stringi w JSON)
        {'id': 105, 'x': 8, 'y': 8, 'z': 5, 'env': 9,
         'user_data': {'10': 'dziesiec', '2': 'dwa'}},
        # 106: domyslny
        {'id': 106, 'x': 11, 'y': 12, 'z': 5, 'env': 9},
    ]
    labels_a = [
        {'id': 2, 'x': 10.5, 'y': -20.25, 'z': 0, 'width': 100.0,
         'height': 30.5, 'text': 'Drugi label (sort po id)',
         'fg_color': [255, 255, 255], 'bg_color': [0, 0, 0]},
        {'id': 1, 'x': -0.0, 'y': 1.5, 'z': -2, 'width': 50.0,
         'height': 12.25, 'text': 'Label z -0.0 i pixmap',
         'fg_color': [255, 0, 0], 'bg_color': [0, 0, 255],
         'show_on_top': True, 'no_scaling': True, 'pixmap': pm},
        # v4: 4 kanaly (alfa) — w v3 kanal alfa uciekal poza sume
        {'id': 3, 'x': 3.0, 'y': 4.0, 'z': 0, 'width': 20.0,
         'height': 10.0, 'text': 'Label z alfa',
         'fg_color': [255, 255, 255, 128], 'bg_color': [0, 0, 0, 64]},
    ]
    fixture = {
        'format': 'arkmap',
        'format_version': 2,
        'meta': {
            'name': 'golden-fixture-v4',
            'source_file': 'golden_fixture.dat',
        },
        'colors': {
            # klucze "2" i "10" — kolejnosc numeryczna, nie leksykalna
            'env_colors': {'10': 7, '2': 15},
            'custom_env_colors': {'2': [255, 128, 0], '10': [1, 2, 3, 4]},
        },
        'areas': [
            # user_data: klucze wymuszajace porzadek bajtowy UTF-8 (a < zz < ą)
            {'id': 1, 'name': 'Obszar Testowy ąę', 'rooms': rooms_a,
             'labels': labels_a,
             # v4: grid_mode i pos objete suma obszaru
             'grid_mode': True, 'pos': [12, -34, 5],
             'user_data': {'zz': '1', 'ą-key': 'wartość 🧭',
                           'area-key': 'area-val'}},
            {'id': -5, 'name': 'Ujemny obszar', 'rooms': rooms_b,
             'labels': [],
             # v4: is_zone i zone_area_ref objete suma obszaru
             'is_zone': True, 'zone_area_ref': 1},
        ],
    }
    return fixture


# ---------- wektory sanity XXH3-64 ----------

def sanity_vectors():
    vecs = []
    lengths = [0, 1, 2, 3, 4, 5, 8, 16, 31, 32, 33, 64, 65, 100, 127,
               128, 129, 136, 200, 224, 240, 241, 512, 1024, 2048, 2368]
    for n in lengths:
        data = bytes(((i * 31 + 17) & 0xFF) for i in range(n))
        vecs.append({'name': 'bytes_%d' % n, 'input_hex': data.hex(),
                     'hash': xxh3_hex(data)})
    utf = 'zażółć gęślą jaźń 🐉⚓'
    vecs.append({'name': 'utf8_ogonki_emoji',
                 'input_hex': utf.encode('utf-8').hex(), 'hash': xxh3_hex(utf.encode('utf-8'))})
    return vecs


# ---------- main ----------

def main():
    fixture = build_fixture()
    colors = fixture['colors']
    areas = fixture['areas']

    room_vecs = {}
    for a in areas:
        for r in a['rooms']:
            enc = enc_room(r)
            room_vecs[str(r['id'])] = {
                'hash': xxh3_hex(enc), 'enc_len': len(enc)}
    area_vecs = {}
    for a in areas:
        enc = enc_area(a, None)
        area_vecs[str(a['id'])] = {'hash': xxh3_hex(enc), 'enc_len': len(enc)}
    file_enc = enc_file(colors, areas)
    file_vec = {'hash': xxh3_hex(file_enc), 'enc_len': len(file_enc)}

    # surowe kodowanie pokoju #1 (minimalnego) jako kotwica bajtowa
    minimal_room_hex = enc_room(areas[0]['rooms'][0]).hex()
    # surowe kodowanie sekcji colors jako kotwica bajtowa
    colors_hex = enc_colors(colors).hex()

    # dowod kanonizacji: pokoj 5 w wersji z jawnie wpisanymi
    # wartosciami domyslnymi i pustymi kontenerami + przestawiona
    # kolejnosc kluczy => hash musi byc identyczny jak pokoju 5
    import copy
    base5 = next(r for r in areas[0]['rooms'] if r['id'] == 5)
    explicit5 = copy.deepcopy(base5)
    explicit5.update({
        'exits': {}, 'doors': {}, 'exit_weights': {}, 'custom_lines': {},
        'special_exits': {}, 'user_data': {}, 'stubs': [],
        'exit_locks': [], 'special_exit_locks': [], 'tags': [],
        'locked': False, 'hidden': False, 'symbol': '', 'name': '',
        'notes': '', 'area': 1,  # pole wewnetrzne — ignorowane
    })
    shuffled5 = dict(reversed(list(explicit5.items())))
    h_base = xxh3_hex(enc_room(base5))
    h_expl = xxh3_hex(enc_room(explicit5))
    h_shuf = xxh3_hex(enc_room(shuffled5))
    assert h_base == h_expl == h_shuf, (h_base, h_expl, h_shuf)
    strip_equiv = {'room_id': 5, 'hash': h_base,
                   'explicit_defaults_equal': True,
                   'shuffled_keys_equal': True}

    vectors = {
        'algorithm': 'XXH3-64', 'seed': 0, 'hex_len': 16,
        'sanity': sanity_vectors(),
        'golden': {
            'file': file_vec,
            'areas': area_vecs,
            'rooms': room_vecs,
            'minimal_room_enc_hex': minimal_room_hex,
            'colors_enc_hex': colors_hex,
            'strip_equivalence': strip_equiv,
        },
    }
    out_v = os.path.join(HERE, 'vectors_v4.json')
    with open(out_v, 'w', encoding='utf-8') as f:
        json.dump(vectors, f, ensure_ascii=False, indent=2, sort_keys=True)

    # ── wektory kodowania meta (prefix 'm4') — OSOBNY plik (vectors_v4.json zamrożony) ──
    meta_enc = enc_meta(fixture['meta'])
    meta_edge = []
    edge_cases = [
        ('empty', {}),
        ('int_i32', {'a': 1}),
        ('int_boundaries', {'min': -2147483648, 'max': 2147483647}),
        ('int_beyond_i32_as_f64', {'big': 1099511627776}),          # 2^40 → tag 4
        ('float_noninteger', {'a': 1.5}),
        ('float_integral_as_i32', {'a': 2.0}),                      # 2.0 → tag 3 (reguła wartości)
        ('neg_zero_as_pos', {'a': -0.0}),                           # -0 → +0
        ('bools_null', {'t': True, 'f': False, 'n': None}),
        ('unicode', {'s': 'zażółć gęślą jaźń 🐉'}),
        ('nested_array', {'arr': [1, 'x', None, [2]]}),
        ('nested_object_keysorted', {'o': {'b': 1, 'a': 2, 'ą': 3}}),
        ('fixture_like', {'name': 'golden-fixture-v4', 'source_file': 'golden_fixture.dat'}),
    ]
    for name, obj in edge_cases:
        e = enc_meta(obj)
        meta_edge.append({'name': name, 'enc_hex': e.hex(), 'hash': xxh3_hex(e)})
    meta_vectors = {
        'algorithm': 'XXH3-64', 'seed': 0, 'hex_len': 16,
        'domain_prefix': 'm4',
        'golden': {'meta': {'hash': xxh3_hex(meta_enc), 'enc_len': len(meta_enc)},
                   'meta_enc_hex': meta_enc.hex()},
        'edge': meta_edge,
    }
    out_vm = os.path.join(HERE, 'vectors_v4_meta.json')
    with open(out_vm, 'w', encoding='utf-8') as f:
        json.dump(meta_vectors, f, ensure_ascii=False, indent=2, sort_keys=True)

    # golden fixture jako kompletny plik .arkmap (bez checksums —
    # sumy dopisze aplikacja podczas testu)
    out_f = os.path.join(HERE, 'golden_fixture.arkmap')
    with open(out_f, 'w', encoding='utf-8') as f:
        json.dump(fixture, f, ensure_ascii=False, indent=1)
        f.write('\n')

    print('file :', file_vec['hash'], '(%d B enc)' % file_vec['enc_len'])
    for aid, v in sorted(area_vecs.items(), key=lambda t: int(t[0])):
        print('area %s: %s (%d B)' % (aid, v['hash'], v['enc_len']))
    for rid, v in sorted(room_vecs.items(), key=lambda t: int(t[0])):
        print('room %s: %s (%d B)' % (rid, v['hash'], v['enc_len']))
    print('meta :', meta_vectors['golden']['meta']['hash'],
          '(%d B enc)' % meta_vectors['golden']['meta']['enc_len'])
    print('sanity vectors:', len(vectors['sanity']))
    print('meta edge vectors:', len(meta_vectors['edge']))
    print('written:', out_v)
    print('written:', out_vm)
    print('written:', out_f)


if __name__ == '__main__':
    main()
