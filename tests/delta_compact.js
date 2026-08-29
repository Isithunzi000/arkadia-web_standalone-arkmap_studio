// Harness — delta_compact: pin D5 (kompaktowanie logu, spec .arkdelta §8) + D8-writer.
// 6 regul skladania, warunek referencyjny (graf zaleznosci, nie sasiedztwo seq),
// etykieta ostatniego skladnika, seq przenumerowane, idempotentnosc, izolacja wejscia.
// Uruchamianie z katalogu głównego repo: node tests/delta_compact.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function blockSlice(a, b) {
  const i = HTML.indexOf(a), j = HTML.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('kotwica bloku: ' + a);
  return HTML.slice(i, j);
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
const deltaCode =
  blockSlice('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  'const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT));\n' +
  extract(HTML, 'function _stripRoomDefaults(room) {') + '\n' +
  blockSlice('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  extract(HTML, 'function stableStringify(val, indent, _lvl) {') + '\n' +
  blockSlice('// === ARKDELTA START ===', '// ── UI: dialog + wiring') + '\n' +
  '\n;return { _compactDeltaOps, _deltaSerializeOps, buildDelta, _deltaChecksums, stableStringify };';
const api = new Function('state', 'APP_VERSION', 'document', 'toast', 'download', 'escHtml', 'plPl', deltaCode)(
  { deltaLog: [] }, 'v1.51.0-test', { getElementById: () => null }, () => {}, () => {}, String, (n, one) => n + ' ' + one);

const J = o => JSON.stringify(o);
const cp = ops => api._compactDeltaOps(ops.map(o => JSON.parse(JSON.stringify(o))));
const room = (id, name, x, y, extra) => Object.assign({ id, x, y, z: 0, name: name || ('R' + id), env: 258 }, extra || {});
const ed = (id, b, a, label) => ({ seq: 0, type: 'EDIT_ROOM', target: { roomId: id }, payload: { before: b, after: a }, label: label || '' });

// ═══ T1: reguła 1 — lancuch EDIT_ROOM/EDIT_EXIT: pierwszy before, ostatni after ═══
console.log('── T1: regula 1 (lancuch EDIT_*) ──');
{
  const r = cp([ed(10, room(10, 'A', 0, 0), room(10, 'B', 0, 0), 'e1'),
                ed(10, room(10, 'B', 0, 0), room(10, 'C', 0, 0), 'e2'),
                ed(10, room(10, 'C', 0, 0), room(10, 'D', 0, 0), 'e3')]);
  ok(r.length === 1 && J(r[0].payload.before) === J(room(10, 'A', 0, 0)) && J(r[0].payload.after) === J(room(10, 'D', 0, 0)),
     'lancuch 3x EDIT_ROOM → 1 op (pierwszy before, ostatni after)');
  ok(r[0].label === 'e3' && r[0].seq === 1, 'etykieta ostatniego skladnika + seq przenumerowane');
  const mix = cp([ed(10, room(10, 'A', 0, 0), room(10, 'B', 0, 0), 'r1'),
                  { seq: 0, type: 'EDIT_EXIT', target: { roomId: 10 }, payload: { before: room(10, 'B', 0, 0), after: room(10, 'C', 0, 0) }, label: 'x1' }]);
  ok(mix.length === 1 && mix[0].type === 'EDIT_ROOM' && J(mix[0].payload.after) === J(room(10, 'C', 0, 0)),
     'lancuch mieszany EDIT_ROOM+EDIT_EXIT → 1 op (typ pierwszego skladnika)');
  const nop = cp([ed(10, room(10, 'A', 0, 0), room(10, 'B', 0, 0)),
                  ed(10, room(10, 'B', 0, 0), room(10, 'A', 0, 0))]);
  ok(nop.length === 0, 'before == after po zlozeniu → op znika');
  const other = cp([ed(10, room(10, 'A', 0, 0), room(10, 'B', 0, 0)), ed(11, room(11, 'A', 1, 1), room(11, 'B', 1, 1))]);
  ok(other.length === 2, 'rozne pokoje → brak skladania');
}

// ═══ T2: reguła 2 — ADD + edycje/przesuniecia tego sid → pojedynczy ADD ═══
console.log('── T2: regula 2 (ADD ze stanem koncowym) ──');
{
  const add = { seq: 0, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room('d:1', 'N', 0, 0) }, label: 'add' };
  const r = cp([add, ed('d:1', room('d:1', 'N', 0, 0), room('d:1', 'N2', 0, 0), 'edit'),
                { seq: 0, type: 'MOVE_ROOM', target: { roomId: 'd:1' }, payload: { fromX: 0, fromY: 0, fromZ: 0, toX: 5, toY: 6, toZ: 1 }, label: 'move' }]);
  ok(r.length === 1 && r[0].type === 'ADD_ROOM' && r[0].payload.room.name === 'N2'
     && r[0].payload.room.x === 5 && r[0].payload.room.y === 6 && r[0].payload.room.z === 1 && r[0].label === 'move',
     'ADD_ROOM + EDIT + MOVE → pojedynczy ADD ze stanem koncowym');
  const rArea = cp([{ seq: 0, type: 'ADD_AREA', target: { areaId: 'd:1' }, payload: { area: { id: 'd:1', name: 'A', rooms: [], labels: [] } }, label: 'aa' },
                    { seq: 0, type: 'EDIT_AREA', target: { areaId: 'd:1' }, payload: { name: 'A2', user_data: { k: 'v' }, beforeName: 'A', beforeUserData: {} }, label: 'ea' }]);
  ok(rArea.length === 1 && rArea[0].type === 'ADD_AREA' && rArea[0].payload.area.name === 'A2'
     && rArea[0].payload.area.user_data.k === 'v' && rArea[0].label === 'ea',
     'ADD_AREA + EDIT_AREA → ADD z koncowa nazwa/user_data');
  const rLbl = cp([{ seq: 0, type: 'ADD_LABEL', target: { areaId: 1 }, payload: { label: { id: 'd:2', text: 'L', x: 0, y: 0, z: 0, width: 4, height: 1 } }, label: 'al' },
                   { seq: 0, type: 'EDIT_LABEL', target: { areaId: 1, labelId: 'd:2' }, payload: { before: { id: 'd:2', text: 'L' }, after: { id: 'd:2', text: 'L2' } }, label: 'el' },
                   { seq: 0, type: 'MOVE_LABEL', target: { areaId: 1, labelId: 'd:2' }, payload: { fromX: 0, fromY: 0, toX: 3, toY: 4 }, label: 'ml' },
                   { seq: 0, type: 'RESIZE_LABEL', target: { areaId: 1, labelId: 'd:2' }, payload: { fromX: 3, fromY: 4, fromW: 4, fromH: 1, toX: 3, toY: 4, toW: 8, toH: 2 }, label: 'rl' }]);
  ok(rLbl.length === 1 && rLbl[0].type === 'ADD_LABEL' && rLbl[0].payload.label.text === 'L2'
     && rLbl[0].payload.label.x === 3 && rLbl[0].payload.label.width === 8 && rLbl[0].payload.label.height === 2
     && rLbl[0].label === 'rl',
     'ADD_LABEL + EDIT + MOVE + RESIZE → ADD z koncowym stanem etykiety');
  const rCl = cp([{ seq: 0, type: 'ADD_CL', target: { roomId: 10, dir: 'n' }, payload: { cl: { points: [[0, 0]] } }, label: 'ac' },
                  { seq: 0, type: 'EDIT_CL', target: { roomId: 10, dir: 'n' }, payload: { before: { points: [[0, 0]] }, after: { points: [[0, 0], [1, 1]], color: [1, 2, 3] } }, label: 'ec' }]);
  ok(rCl.length === 1 && rCl[0].type === 'ADD_CL' && rCl[0].payload.cl.points.length === 2 && rCl[0].label === 'ec',
     'ADD_CL + EDIT_CL → ADD z koncowa geometria');
}

// ═══ T3: reguły 3-5 — MOVE chain, EDIT_ENV_COLOR, ADD+DELETE znika ═══
console.log('── T3: reguly 3-5 ──');
{
  const mv = cp([{ seq: 0, type: 'MOVE_ROOM', target: { roomId: 12 }, payload: { fromX: 0, fromY: 0, fromZ: 0, toX: 1, toY: 1, toZ: 0 }, label: 'm1' },
                 { seq: 0, type: 'MOVE_ROOM', target: { roomId: 12 }, payload: { fromX: 1, fromY: 1, fromZ: 0, toX: 2, toY: 2, toZ: 0 }, label: 'm2' }]);
  ok(mv.length === 1 && mv[0].payload.fromX === 0 && mv[0].payload.toX === 2 && mv[0].payload.toY === 2 && mv[0].label === 'm2',
     'regula 3: lancuch MOVE_ROOM → pierwszy from*, ostatni to*');
  const ec = cp([{ seq: 0, type: 'EDIT_ENV_COLOR', target: { envId: 262 }, payload: { oldColor: [1, 1, 1], newColor: [2, 2, 2] }, label: 'c1' },
                 { seq: 0, type: 'EDIT_ENV_COLOR', target: { envId: 262 }, payload: { oldColor: [2, 2, 2], newColor: [3, 3, 3] }, label: 'c2' },
                 { seq: 0, type: 'EDIT_ENV_COLOR', target: { envId: 300 }, payload: { oldColor: [9, 9, 9], newColor: [8, 8, 8] }, label: 'c3' }]);
  ok(ec.length === 2 && J(ec[0].payload) === J({ oldColor: [1, 1, 1], newColor: [3, 3, 3] }) && ec[0].label === 'c2'
     && ec[1].target.envId === 300,
     'regula 4: EDIT_ENV_COLOR per envId (pierwszy old, ostatni new); rozne envId nie scalane');
  const van = cp([{ seq: 0, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room('d:1', 'X', 0, 0) }, label: 'a' },
                  { seq: 0, type: 'DELETE_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room('d:1', 'X', 0, 0) }, label: 'd' },
                  { seq: 0, type: 'ADD_SUPPRESSOR', target: { roomId: 10, dir: 'n' }, payload: {}, label: 's1' },
                  { seq: 0, type: 'DELETE_SUPPRESSOR', target: { roomId: 10, dir: 'n' }, payload: {}, label: 's2' },
                  { seq: 0, type: 'MOVE_ROOM', target: { roomId: 5 }, payload: { fromX: 0, fromY: 0, fromZ: 0, toX: 1, toY: 0, toZ: 0 }, label: 'm' }]);
  ok(van.length === 1 && van[0].type === 'MOVE_ROOM' && van[0].seq === 1 && van[0].label === 'm',
     'regula 5: pary ADD+DELETE (pokoj, suppressor) znikaja; seq przenumerowane');
}

// ═══ T4: reguła 6 — PAINT_BATCH ═══
console.log('── T4: regula 6 (PAINT_BATCH) ──');
{
  const single = cp([{ seq: 0, type: 'PAINT_BATCH', target: {}, payload: { changes: [
    { roomId: 10, beforeEnv: 1, beforeSymbol: '', afterEnv: 2, afterSymbol: '*' },
    { roomId: 10, beforeEnv: 2, beforeSymbol: '*', afterEnv: 3, afterSymbol: '#' },
    { roomId: 11, beforeEnv: 1, beforeSymbol: '', afterEnv: 2, afterSymbol: '' }] }, label: 'p1' }]);
  ok(single.length === 1 && single[0].payload.changes.length === 2
     && single[0].payload.changes[0].beforeEnv === 1 && single[0].payload.changes[0].afterEnv === 3
     && single[0].payload.changes[0].afterSymbol === '#',
     'kolaps per roomId w obrebie jednego batcha (pierwszy before, ostatni after)');
  const merged = cp([{ seq: 0, type: 'PAINT_BATCH', target: {}, payload: { changes: [{ roomId: 10, beforeEnv: 1, beforeSymbol: '', afterEnv: 2, afterSymbol: '' }] }, label: 'p1' },
                     { seq: 0, type: 'PAINT_BATCH', target: {}, payload: { changes: [{ roomId: 10, beforeEnv: 2, beforeSymbol: '', afterEnv: 5, afterSymbol: 'x' }, { roomId: 12, beforeEnv: 1, beforeSymbol: '', afterEnv: 2, afterSymbol: '' }] }, label: 'p2' }]);
  ok(merged.length === 1 && merged[0].payload.changes.length === 2 && merged[0].label === 'p2'
     && merged[0].payload.changes[0].beforeEnv === 1 && merged[0].payload.changes[0].afterEnv === 5,
     'dwa batche scalone (bez posrednich referencji), per-room kolaps, etykieta ostatniego');
}

// ═══ T5: warunek referencyjny — posredni op z referencja blokuje skladanie ═══
console.log('── T5: warunek referencyjny ──');
{
  const clean = cp([ed(10, room(10, 'A', 0, 0), room(10, 'B', 0, 0), 'a'),
                    ed(11, room(11, 'A', 1, 1), room(11, 'B', 1, 1), 'b'),
                    ed(10, room(10, 'B', 0, 0), room(10, 'C', 0, 0), 'c')]);
  ok(clean.length === 2 && clean[0].payload.after.name === 'C',
     'bez posredniej referencji: lancuch sklada sie mimo braku sasiedztwa seq');
  // posredni op referencjuje pokoj 10 (exits w after) → lancuch pokoju 10 zablokowany
  const blocked = cp([ed(10, room(10, 'A', 0, 0), room(10, 'B', 0, 0), 'a'),
                      ed(11, room(11, 'A', 1, 1), room(11, 'B', 1, 1, { exits: { w: 10 } }), 'b'),
                      ed(10, room(10, 'B', 0, 0), room(10, 'C', 0, 0), 'c')]);
  ok(blocked.length === 3, 'posrednia referencja (exits → 10) blokuje skladanie lancucha pokoju 10');
  // posredni DELETE_ROOM blokuje lancuch cl tego pokoju
  const clBlocked = cp([{ seq: 0, type: 'ADD_CL', target: { roomId: 7, dir: 'n' }, payload: { cl: { points: [[0, 0]] } }, label: 'a' },
                        { seq: 0, type: 'DELETE_ROOM', target: { roomId: 7, areaId: 1 }, payload: { room: room(7, 'X', 0, 0) }, label: 'd' },
                        { seq: 0, type: 'EDIT_CL', target: { roomId: 7, dir: 'n' }, payload: { before: { points: [[0, 0]] }, after: { points: [[9, 9]] } }, label: 'e' }]);
  ok(clBlocked.length === 3, 'DELETE_ROOM miedzy ADD_CL a EDIT_CL blokuje lancuch cl (graf, nie sasiedztwo)');
  // para ADD+DELETE NIE znika, gdy posredni op referencjuje obiekt
  const noVanish = cp([{ seq: 0, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room('d:1', 'X', 0, 0) }, label: 'a' },
                       { seq: 0, type: 'ADD_EXIT', target: { sourceId: 10, dir: 's' }, payload: { targetId: 'd:1', bidirectional: false }, label: 'e' },
                       { seq: 0, type: 'DELETE_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room('d:1', 'X', 0, 0) }, label: 'd' }]);
  ok(noVanish.length === 3, 'posredni ADD_EXIT do d:1: para ADD+DELETE NIE znika (warunek referencyjny)');
}

// ═══ T6: wlasnosci — idempotentnosc, izolacja wejscia, integracja z builderami ═══
console.log('── T6: idempotentnosc / izolacja / integracja ──');
{
  const src = [ed(10, room(10, 'A', 0, 0), room(10, 'B', 0, 0), 'a'),
               ed(10, room(10, 'B', 0, 0), room(10, 'C', 0, 0), 'b'),
               { seq: 0, type: 'PAINT_BATCH', target: {}, payload: { changes: [{ roomId: 10, beforeEnv: 1, beforeSymbol: '', afterEnv: 2, afterSymbol: '' }] }, label: 'p' }];
  const snapshot = J(src);
  const once = api._compactDeltaOps(src);
  ok(J(src) === snapshot, 'wejscie NIE jest mutowane');
  ok(J(api._compactDeltaOps(once)) === J(once), 'idempotentnosc: compact(compact(x)) === compact(x)');
  ok(once.length === 2 && once.every((o, i) => o.seq === i + 1), 'seq ciagle 1..N po kompaktowaniu');

  // integracja: buildDelta sklada lancuch z logu edycji
  const st = { roomById: {}, areas: new Map() };
  const r10 = room(10, 'R10', 0, 0);
  const after1 = room(10, 'R10a', 0, 0), after2 = room(10, 'R10b', 0, 0);
  const text = api.buildDelta([
    { type: 'EDIT_ROOM', roomId: 10, before: r10, after: after1, label: 'pierwsza edycja' },
    { type: 'EDIT_ROOM', roomId: 10, before: after1, after: after2, label: 'druga edycja' },
  ], { crc: 'a'.repeat(16), areas: { 1: 'b'.repeat(16) } });
  const d = JSON.parse(text);
  ok(d.format === 'arkdelta' && d.format_version === 3 && d.meta.format === undefined,
     'buildDelta: koperta v3 (top-level format/format_version)');
  ok(d.ops.length === 1 && d.ops[0].payload.after.name === 'R10b' && d.ops[0].label === 'druga edycja',
     'buildDelta: lancuch EDIT z logu zlozony (D5 w producentcie)');
  ok(d.meta.ops_count === 1 && d.meta.base.areas['1'] === 'b'.repeat(16),
     'ops_count po kompaktowaniu; base.areas (D4) przeniesione do meta.base');
  const dcs = api._deltaChecksums(d.meta, d.ops);
  ok(d.checksums.file === dcs.file, 'checksums.file spojne z trescia koperty v3');
  ok(d.checksums.sig === undefined, 'bez tozsamosci: brak checksums.sig (stan anonimowy)');
  ok(d.meta.author === undefined && d.meta.created === undefined, 'bez tozsamosci: brak pol proweniencji (stan anonimowy)');

  // _deltaSerializeOps: kompaktowanie + koperta v3
  const t2 = api._deltaSerializeOps([
    { seq: 7, type: 'EDIT_ROOM', target: { roomId: 10 }, payload: { before: r10, after: after1 }, label: 'x' },
    { seq: 9, type: 'EDIT_ROOM', target: { roomId: 10 }, payload: { before: after1, after: after2 }, label: 'y' },
  ], { crc: 'c'.repeat(16) });
  const d2 = JSON.parse(t2);
  ok(d2.format_version === 3 && d2.ops.length === 1 && d2.ops[0].seq === 1 && d2.ops[0].label === 'y'
     && d2.meta.ops_count === 1, '_deltaSerializeOps: kompaktowanie + seq 1..N + koperta v3');
}

console.log('delta_compact: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
