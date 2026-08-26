// Harness — straznik XSS/injection (Arc 9, v1.43.1): dane z niezaufanego pliku
// mapy (.arkmap/.arkdelta) nie moga trafic RAW do innerHTML. Repro-first:
// funkcje wyekstrahowane verbatim z arkmap_studio.html, odpalone w Node
// ze stubami DOM, z pokojem o zlosliwych polach. Uruchamianie z katalogu repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function extract(name) {
  const a = HTML.indexOf('function ' + name + '(');
  if (a < 0) throw new Error('kotwica: ' + name);
  const b = HTML.indexOf('\n}\n', a);
  if (b < 0) throw new Error('koniec funkcji: ' + name);
  return HTML.slice(a, b + 3);
}

const PAYLOAD = '<img src=x onerror=alert(1)>';
const PAYLOAD_ESC = '&lt;img src=x onerror=alert(1)&gt;';

// ── scenariusz 1: showRoomInfo — panel pokoju ──────────────────────────────
function runShowRoomInfo() {
  const code = extract('escHtml') + extract('rpRow') + extract('showRoomInfo') + `
    const roomPanel = { classList: { remove(){}, add(){} } };
    const rpTitle = { textContent: '' };
    const rpBody = { _h: '', set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } };
    const state = { editMode: false, roomById: {}, z: 0, editSnapshot: null, editDirty: false };
    const ARKADIA_ENV = {}; const ARKADIA_SYMBOLS = {};
    const envColorCss = () => 'rgb(1,2,3)';
    const populateEditForm = () => {};
    const jumpToRoom = () => {};
    const evil = {
      id: 1, name: 'pokoj', x: 0, y: 0, z: 0,
      exits: { ['${PAYLOAD}']: 2 },
      env: '${PAYLOAD}',
      stubs: ['${PAYLOAD}'],
      doors: { ['${PAYLOAD}']: '${PAYLOAD}' },
      exit_weights: { ['${PAYLOAD}']: 5 },
      exit_locks: ['${PAYLOAD}'],
      special_exits: { ['${PAYLOAD}']: 2 },
    };
    showRoomInfo(evil);
    return rpBody.innerHTML;
  `;
  return new Function(code)();
}

// ── scenariusz 2: showDeleteRoomDialog — dlg-refs-list (r.dir) ─────────────
function runDeleteRefs() {
  const code = extract('escHtml') + extract('showDeleteRoomDialog') + `
    const captured = {};
    const state = { roomById: {
      1: { id: 1, name: 'cel', exits: {}, special_exits: {} },
      2: { id: 2, name: 'zrodlo', exits: {}, special_exits: { ['${PAYLOAD}']: 1 } },
      3: { id: 3, name: 'zrodlo2', exits: { ['${PAYLOAD}']: 1 }, special_exits: {} },
    } };
    const _els = {};
    const document = { getElementById: (id) => (_els[id] = _els[id] || { set innerHTML(v) { captured[id] = v; }, onclick: null }) };
    const openDialog = () => {}; const closeDialog = () => {}; const deleteRoom = () => {};
    showDeleteRoomDialog(1);
    return captured['dlg-refs-list'] || '';
  `;
  return new Function(code)();
}

console.log('— repro: zlosliwy pokoj przez showRoomInfo —');
let htmlInfo = '';
try { htmlInfo = runShowRoomInfo(); } catch (e) { ok(false, 'showRoomInfo wykonanie: ' + e.message); }
if (htmlInfo) {
  ok(!htmlInfo.includes(PAYLOAD), 'panel pokoju: brak surowego <img> z pol pokoju (exits/env/stubs/doors/wagi/locki)');
  ok(htmlInfo.includes(PAYLOAD_ESC), 'panel pokoju: payload widoczny jako escapowany tekst');
}

console.log('— repro: zlosliwa komenda special exit przez dlg-refs-list —');
let htmlRefs = '';
try { htmlRefs = runDeleteRefs(); } catch (e) { ok(false, 'showDeleteRoomDialog wykonanie: ' + e.message); }
if (htmlRefs) {
  ok(!htmlRefs.includes(PAYLOAD), 'dlg-refs-list: brak surowego <img> z komendy special exit (r.dir)');
  ok(htmlRefs.includes(PAYLOAD_ESC), 'dlg-refs-list: payload escapowany');
}

// ── straznicy zrodla — wewnatrz wyekstrahowanych funkcji (nie caly plik) ───
console.log('— straznicy zrodla —');
const srcInfo = extract('showRoomInfo');
const srcRefs = extract('showDeleteRoomDialog');
ok(!srcInfo.includes('>${d}</span>'), 'straznik: klucz wyjscia nie renderowany raw (>${d}</span>)');
ok(!srcInfo.includes('`${d}:${s}`') && !srcInfo.includes('`${d}:${w}`'), 'straznik: drzwi/wagi nie raw (${d}:${s}/${d}:${w})');
ok(!srcInfo.includes('r.exit_locks.join'), 'straznik: exit_locks nie raw join');
ok(!srcInfo.includes('r.stubs.join'), 'straznik: stubs nie raw join');
ok((srcInfo.match(/escHtml\(r\.env\)/g) || []).length >= 2, 'straznik: envLabel — escHtml(r.env) w obu galeziach');
ok(!srcRefs.includes('(${r.dir})'), 'straznik: dlg-refs-list — r.dir nie raw');
ok((srcRefs.match(/escHtml\(r\.dir\)/g) || []).length >= 1, 'straznik: dlg-refs-list — escHtml(r.dir)');

// ── A31-F1.12 (Arc 31, audyt zewnetrzny): openCLEditor — klucz custom_lines poza inline onclick ──
{
  const srcCL = extract('openCLEditor');
  ok(!/onclick="[^"]*'\$\{/.test(srcCL), 'A31-F1.12: openCLEditor — zero interpolacji stringa w atrybucie onclick');
  ok(!/onclick="[^"]*startClDrawingExisting/.test(srcCL), 'A31-F1.12: startClDrawingExisting nie jest inline handlerem');
  ok(/startClDrawingExisting\(dir\)/.test(srcCL), 'A31-F1.12: wiring programowy startClDrawingExisting(dir)');
}

// ── Arc 37 (PRACA 2): toast() — piny regresji escapowania + feature nowrap ──
// Stan zweryfikowany na starcie arca: toast() JUZ escapuje &<> i dopiero potem
// dokleja nowrap-spany — piny pilnuja, zeby ten kontrakt nie zniknal i zeby
// feature nie zostal zlamany (np. przez naiwna podmiane innerHTML->textContent).
console.log('— Arc 37: toast() escapowanie + nowrap —');
function runToast(msg) {
  const code = extract('toast') + `
    const toastEl = { _h: '', set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
                      className: '', style: {} };
    let toastTimer = null;
    toast(${JSON.stringify(msg)});
    return toastEl.innerHTML;
  `;
  return new Function(code)();
}
{
  const htmlToast = runToast(PAYLOAD);
  ok(!htmlToast.includes(PAYLOAD), 'toast: brak surowego <img> (escapowanie aktywne)');
  // Uwaga: nowrap-regex owija tez nawiasy WEWNATRZ escapowanego tekstu — pelny PAYLOAD_ESC
  // nie musi byc ciaglym substringiem; asercja na escapowany poczatek payloadu.
  ok(htmlToast.includes('&lt;img src=x'), 'toast: payload escapowany (&lt;img...)');
  const htmlNw = runToast('Załadowano [5] waypointów');
  ok(htmlNw.includes('<span style="white-space:nowrap">[5]</span>'),
    'toast: feature nowrap-spanow nienaruszony ([...] owijane)');
  const srcToast = extract('toast');
  ok(!srcToast.includes('toastEl.innerHTML = msg;'), 'straznik: toast bez golego przypisania innerHTML = msg');
  const assignIdx = srcToast.indexOf('toastEl.innerHTML = msg');
  const escIdx = srcToast.indexOf(".replace(/&/g, '&amp;')");
  ok(assignIdx >= 0 && escIdx > assignIdx, 'straznik: przypisanie innerHTML z lancuchem escapowania');
}


// ── Arc 37 (PRACA 5 + fala E): escHtml filtruje kontrolne C0 poza \t \n \r oraz DEL \x7f ──
// Kontrolne (np. \x00, \x1f) w polach mapy nie niosa informacji, a psuja
// layout/parsowanie DOM — escHtml je wycina. \t \n \r zostaja (legitne w opisach).
{
  const escHtml = new Function(extract('escHtml') + '; return escHtml;')();
  ok(escHtml('a\x00b\x1fc') === 'abc', 'escHtml: wycina kontrolne \x00 \x1f');
  ok(escHtml('a\x7fb') === 'ab', 'escHtml: wycina DEL \x7f');
  ok(escHtml('a\tb\nc\rd') === 'a\tb\nc\rd', 'escHtml: zachowuje \t \n \r');
  ok(escHtml(PAYLOAD) === PAYLOAD_ESC, 'escHtml: escapowanie &<> bez zmian');
}

console.log('\nxss_sinks.js: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
