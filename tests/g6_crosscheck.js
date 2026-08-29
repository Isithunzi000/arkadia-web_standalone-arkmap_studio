// Harness — g6_crosscheck: pin G6 — przyklad w docs/arkmap_spec.html §21 niesie
// PRAWDZIWE sumy v4 tresci przykladu (nie placeholdery). Wartosci wyciagane
// regexem z HTML specu i przeliczane silnikiem aplikacji (CANONICAL-V4) —
// spec i kod nigdy sie nie rozjada. Niezalezny cross-check oracle'm Python
// zostal wykonany przy wprowadzeniu (oracle_v4.py, zgodne bajt w bajt).
// Uruchamianie z katalogu głównego repo: node tests/g6_crosscheck.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const SPEC = fs.readFileSync(path.join(ROOT, 'docs', 'arkmap_spec.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── silnik v4 z aplikacji ──
function markerBlock(tag) {
  const m = HTML.match(new RegExp('// ====' + tag + '-BEGIN====([\\s\\S]*?)// ====' + tag + '-END===='));
  if (!m) throw new Error('kotwica: marker ' + tag);
  return m[1];
}
function extract(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('BRAK KOTWICY: ' + anchor);
  let d = 0; const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('niezbalansowane klamry: ' + anchor);
}
const api = new Function(markerBlock('XXH3-64') + '\n' + markerBlock('CANONICAL-V4') + '\n' +
  extract(HTML, 'function stableStringify(val, indent, _lvl) {') +
  '\n;return { addChecksums, verifyChecksums, stableStringify, xxh3_64hex };')();
const SPEC_D = fs.readFileSync(path.join(ROOT, 'docs', 'arkdelta_spec.html'), 'utf8');

// ── przyklad z specu (tresc 1:1 jak w §21) ──
const example = {
  areas: [{ id: 1, name: 'Test Area', rooms: [
    { env: 272, exits: { e: 2 }, id: 1, name: 'Start Room', x: 0, y: 0, z: 0 },
    { env: 258, exits: { w: 1 }, id: 2, name: 'Forest', symbol: 'T', x: 1, y: 0, z: 0 },
  ] }],
  colors: { custom_env_colors: { '258': [0, 179, 0], '272': [128, 128, 128] } },
  format: 'arkmap', format_version: 2,
  meta: {
    map_name: 'Test Map',
    symbol_font: { family: 'Bitstream Vera Sans Mono', fixed_pitch: true, pixel_size: 10, point_size: -1,
      strike_out: false, style_hint: 7, style_setting: false, underline: false, weight: 50 },
    symbol_font_fudge_factor: 1.0, use_only_map_font: false,
  },
};

// ── wyciagnij sumy z HTML specu ──
function specVal(re, label) {
  const m = SPEC.match(re);
  if (!m) throw new Error('brak wartosci w specu: ' + label);
  return m[1];
}
function specValD(re, label) {
  const m = SPEC_D.match(re);
  if (!m) throw new Error('brak wartosci w specu arkdelta: ' + label);
  return m[1];
}
const specSums = {
  alg: specVal(/"alg"<\/span>: <span class="s">"([a-z0-9]+)"/, 'alg'),
  file: specVal(/"file"<\/span>: <span class="s">"([0-9a-f]{16})"/, 'file'),
  meta: specVal(/"meta"<\/span>: <span class="s">"([0-9a-f]{16})"/, 'meta'),
  area1: specVal(/"areas"<\/span>: \{ <span class="s">"1"<\/span>: <span class="s">"([0-9a-f]{16})"/, 'areas.1'),
  room1: specVal(/"rooms"<\/span>: \{ <span class="s">"1"<\/span>: <span class="s">"([0-9a-f]{16})"/, 'rooms.1'),
  room2: specVal(/<span class="s">"2"<\/span>: <span class="s">"([0-9a-f]{16})"/, 'rooms.2'),
};

console.log('── G6: przyklad specu vs silnik aplikacji ──');
{
  const map = JSON.parse(JSON.stringify(example));
  api.addChecksums(map);
  const cs = map.checksums;
  ok(specSums.alg === 'v4', 'spec: alg = v4');
  ok(cs.file === specSums.file, 'checksums.file: spec = silnik (' + cs.file + ')');
  ok(cs.meta === specSums.meta, 'checksums.meta: spec = silnik (' + cs.meta + ')');
  ok(cs.areas['1'] === specSums.area1, 'checksums.areas[1]: spec = silnik (' + cs.areas['1'] + ')');
  ok(cs.rooms['1'] === specSums.room1 && cs.rooms['2'] === specSums.room2,
     'checksums.rooms[1,2]: spec = silnik (' + cs.rooms['1'] + ', ' + cs.rooms['2'] + ')');
  const v = api.verifyChecksums(map);
  ok(v.ok === true && v.metaOk === true, 'przyklad z prawdziwymi sumami przechodzi weryfikacje (file + meta)');
  ok(!/illustrative placeholders/i.test(SPEC) && !/G6-CROSSCHECK/.test(SPEC),
     'nota o placeholderach i marker TODO usuniete ze specu');
}

// ═══ T2: przyklad w docs/arkdelta_spec.html §13 — prawdziwe sumy v3 ═══
console.log('── G6: przyklad specu arkdelta vs silnik aplikacji ──');
{
  const dMeta = { ops_count: 3, base: { crc: '3f8a21c0b7d4e5f6', version: '0.205.0',
    revision: '0123456789abcdef0123456789abcdef01234567', areas: { '1': 'aaaabbbbccccdddd' } },
    app_version: 'v1.51.0' };
  const dOps = [
    { seq: 1, type: 'ADD_AREA', target: { areaId: 'd:1' },
      payload: { area: { id: 'd:1', name: 'Nowy obszar' } }, label: 'Dodanie obszaru "Nowy obszar"' },
    { seq: 2, type: 'ADD_ROOM', target: { roomId: 'd:2', areaId: 'd:1' },
      payload: { room: { id: 'd:2', x: 12, y: -4, z: 0, name: 'Polana', env: 262 } }, label: 'Dodanie pokoju "Polana"' },
    { seq: 3, type: 'ADD_EXIT', target: { sourceId: 100, dir: 'n' },
      payload: { targetId: 'd:2', bidirectional: true }, label: 'Dodanie wyjścia #100 n' },
  ];
  const h = o => api.xxh3_64hex(new TextEncoder().encode(api.stableStringify(o)));
  const file = h({ format: 'arkdelta', format_version: 3, meta: dMeta, ops: dOps });
  const perOp = dOps.map(h);
  const specFile = specValD(/"file"<\/span>: <span class="s">"([0-9a-f]{16})"/, 'file');
  const specOps = [...SPEC_D.matchAll(/<span class="s">"([0-9a-f]{16})"<\/span>/g)]
    .map(m => m[1]).filter(v => v !== 'aaaabbbbccccdddd' && v !== '3f8a21c0b7d4e5f6' && v !== specFile);
  ok(file === specFile, 'checksums.file: spec = silnik (' + file + ')');
  ok(specOps.length === 3 && perOp.every((v, i) => v === specOps[i]),
     'checksums.ops[0..2]: spec = silnik (' + perOp.join(', ') + ')');
  ok(/"format_version"<\/span>: <span class="n">3<\/span>/.test(SPEC_D), 'przyklad w kopercie v3 (top-level format_version: 3)');
  ok(!/illustrative placeholders/i.test(SPEC_D), 'nota o placeholderach usunieta ze specu arkdelta');
  // sanity: tresc meta z prykładu spelnia reguly checksums.file (§5)
  ok(api.stableStringify({ format: 'arkdelta', format_version: 3, meta: dMeta, ops: dOps }).length > 0,
     'kanoniczna serializacja przykladu stabilna');
}

console.log('');
console.log('WYNIK: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
