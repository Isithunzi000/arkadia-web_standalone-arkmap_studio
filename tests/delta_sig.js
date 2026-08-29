// Harness — delta_sig: pin readera .arkdelta v3 (faza 5d).
// D1 ops-strict: nieznany klucz w opie/target/payload = odmowa (fail-closed);
// D8: weryfikacja podpisu Ed25519 (ok/bad/claimed/unsigned, idOk) — E2E przez
// prawdziwa sciezke _identityCreate -> _deltaMaybeSign -> validate -> verify;
// D4: ryzyko per-obszar (green/yellow/red) z base.areas;
// kategoria recenzji "z komendami" (_deltaOpHasCommands / _deltaClsItem).
// Uruchamianie z katalogu głównego repo: node tests/delta_sig.js
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

// mini-DOM + IndexedDB in-memory (jak tests/identity_dialog.js)
const registry = new Map();
function makeEl(id) {
  const el = { id, textContent: '', value: '', disabled: false, dataset: {}, style: {}, onclick: null, _html: '',
    addEventListener(ev, f) { el['on' + ev] = f; } };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = v; for (const m of String(v).matchAll(/id="([\w-]+)"/g)) reg(m[1]); },
  });
  return el;
}
function reg(id) { if (!registry.has(id)) registry.set(id, makeEl(id)); return registry.get(id); }
const documentStub = { getElementById: (id) => reg(id) };
const _idbData = new Map();
globalThis.indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      req.result = {
        createObjectStore() {},
        transaction() {
          const tx = { objectStore() { return {
            put(rec, key) { _idbData.set(key, rec); },
            delete(key) { _idbData.delete(key); },
            get(key) { const g = {}; setTimeout(() => { g.result = _idbData.get(key); g.onsuccess && g.onsuccess(); }, 0); return g; },
          }; } };
          setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
          return tx;
        },
      };
      req.onupgradeneeded && req.onupgradeneeded();
      req.onsuccess && req.onsuccess();
    }, 0);
    return req;
  },
};

const deltaCode =
  blockSlice('// ── constants.js ──', '// ── validate.js ──') + '\n' +
  'const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT));\n' +
  extract(HTML, 'function _stripRoomDefaults(room) {') + '\n' +
  blockSlice('// ── checksum.js ──', '// ── mudlet_dat.js ──') + '\n' +
  extract(HTML, 'function stableStringify(val, indent, _lvl) {') + '\n' +
  blockSlice('// ====IDENTITY-V1-BEGIN====', '// ── UI: dialog + wiring') + '\n' +
  '\n;return { validateDeltaText, buildDelta, _deltaChecksums, _deltaMaybeSign, _deltaVerifySignature,' +
  ' _deltaAreaRisk, _deltaOpHasCommands, _deltaClsItem, _identityCreate, _identityClear, stableStringify,' +
  ' _identityDeriveSeed, _identityKeysFromSeed, _identityHex };';
const stateStub = {
  deltaLog: [],
  baseInfo: { crc: 'a'.repeat(16), areas: { '1': 'aaaabbbbccccdddd', '2': '1111222233334444' } },
  map: { areas: [{ id: 1, name: 'Zielony Las' }, { id: 2, name: 'Żółta Grota' }] },
};
const api = new Function('state', 'APP_VERSION', 'document', 'toast', 'download', 'escHtml', 'plPl', deltaCode)(
  stateStub, 'v1.51.0-test', documentStub, () => {}, () => {}, String, (n, one) => n + ' ' + one);

const J = o => JSON.stringify(o);
const PIN_WORDS = ['abecadlo', 'adept', 'adwokat', 'agawa', 'agrafka', 'agregat'];
function mkLog() {
  return [{ type: 'ADD_ROOM', roomId: 100, roomData: { id: 100, x: 0, y: 0, z: 0, name: 'R', env: 258 }, areaId: 1, label: 'Dodanie pokoju' }];
}
function mkDeltaText() {
  return api.buildDelta(mkLog(), { crc: 'a'.repeat(16), areas: { '1': 'aaaabbbbccccdddd', '2': '1111222233334444' } });
}

(async () => {

// ═══ T1: ops-strict (D1) — zamkniety zbior pol ═══
console.log('── T1: ops-strict ──');
{
  const good = mkDeltaText();
  ok(api.validateDeltaText(good).ok === true, 'kalka z buildDelta przechodzi (klucze producenta legalne)');
  const withExtra = (fn) => {
    const d = JSON.parse(good); fn(d);
    d.checksums = api._deltaChecksums(d.meta, d.ops);  // checksum zgodny — strict nie polega na checksumie
    return api.validateDeltaText(api.stableStringify(d));
  };
  let r = withExtra(d => { d.ops[0].noscope = 1; });
  ok(r.ok === false && /nieznane pole "noscope"/.test(r.errors.join(' ')), 'odmowa: obcy klucz na poziomie opu');
  r = withExtra(d => { d.ops[0].target.weird = 1; });
  ok(r.ok === false && /nieznane pole "weird"/.test(r.errors.join(' ')), 'odmowa: obcy klucz w target');
  r = withExtra(d => { d.ops[0].payload.surprise = 1; });
  ok(r.ok === false && /nieznane pole "surprise"/.test(r.errors.join(' ')), 'odmowa: obcy klucz w payload');
  r = withExtra(d => { d.ops[0].payload.room.user_data = { bind: 'n' }; });  // dane uzytkownika w room — legalne
  ok(r.ok === true, 'dane uzytkownika wewnatrz room (user_data.bind) NIE sa strict');
  // Klucze opcjonalne producenta v3 — legalne:
  const mv = JSON.parse(api.stableStringify({ format: 'arkdelta', format_version: 3,
    meta: { ops_count: 1, base: { crc: 'a'.repeat(16) } },
    ops: [{ seq: 1, type: 'MOVE_ROOM', target: { roomId: 5 }, payload: { fromX: 1, fromY: 2, fromZ: 0, toX: 3, toY: 4, toZ: 0 }, label: '' }] }));
  mv.checksums = api._deltaChecksums(mv.meta, mv.ops);
  ok(api.validateDeltaText(api.stableStringify(mv)).ok === true, 'MOVE_ROOM z opcjonalnymi from* — legalne');
  const de = JSON.parse(api.stableStringify({ format: 'arkdelta', format_version: 3,
    meta: { ops_count: 1, base: { crc: 'a'.repeat(16) } },
    ops: [{ seq: 1, type: 'DELETE_EXIT', target: { roomId: 5, dir: 'n' }, payload: { exitId: 9 }, label: '' }] }));
  de.checksums = api._deltaChecksums(de.meta, de.ops);
  ok(api.validateDeltaText(api.stableStringify(de)).ok === true, 'DELETE_EXIT z opcjonalnym exitId — legalne');
  const ec = JSON.parse(api.stableStringify({ format: 'arkdelta', format_version: 3,
    meta: { ops_count: 1, base: { crc: 'a'.repeat(16) } },
    ops: [{ seq: 1, type: 'EDIT_ENV_COLOR', target: { envId: 258 }, payload: { oldColor: [1, 2, 3], newColor: [4, 5, 6] }, label: '' }] }));
  ec.checksums = api._deltaChecksums(ec.meta, ec.ops);
  ok(api.validateDeltaText(api.stableStringify(ec)).ok === true, 'EDIT_ENV_COLOR z opcjonalnym oldColor — legalne');
}

// ═══ T2: podpis D8 — E2E przez prawdziwa sciezke ═══
console.log('── T2: weryfikacja podpisu ──');
{
  ok(api.validateDeltaText(mkDeltaText()).ok, 'kalka anonimowa — walidacja ok');
  const anonRes = await api._deltaVerifySignature(JSON.parse(mkDeltaText()));
  ok(anonRes.state === 'unsigned', 'kalka anonimowa → unsigned');

  await api._identityCreate('Zbyszek', PIN_WORDS);  // ~1 s (PBKDF2)
  const signedText = await api._deltaMaybeSign(mkDeltaText());
  ok(signedText !== mkDeltaText(), '_deltaMaybeSign podpisuje przy aktywnej tozsamosci');
  const sd = JSON.parse(signedText);
  ok(sd.meta.author === 'Zbyszek' && sd.meta.author_id === 'efb8e5c9678554c4' && /^[0-9a-f]{64}$/.test(sd.meta.author_pubkey),
     'meta autora: nick + author_id (pin) + pubkey');
  ok(/^[0-9a-f]{128}$/.test(sd.checksums.sig), 'checksums.sig: 128 hex');
  ok(api.validateDeltaText(signedText).ok === true, 'podpisana kalka przechodzi walidacje (sig poza zakresem file)');
  const vOk = await api._deltaVerifySignature(sd);
  ok(vOk.state === 'ok' && vOk.author === 'Zbyszek' && vOk.authorId === 'efb8e5c9678554c4' && vOk.idOk === true,
     'weryfikacja: podpis zgodny, autor potwierdzony');

  const tamp = JSON.parse(signedText);
  tamp.checksums.sig = tamp.checksums.sig.slice(0, -1) + (tamp.checksums.sig.endsWith('a') ? 'b' : 'a');
  ok(api.validateDeltaText(api.stableStringify(tamp)).ok === true, 'przeklamany sig NADAL przechodzi walidacje (nie odmawiamy)');
  const vBad = await api._deltaVerifySignature(tamp);
  ok(vBad.state === 'bad' && vBad.author === 'Zbyszek', 'przeklamany sig → bad (glosne ostrzezenie, nie odmowa)');

  const claimed = JSON.parse(signedText);
  delete claimed.checksums.sig;
  claimed.checksums = api._deltaChecksums(claimed.meta, claimed.ops);
  const vCl = await api._deltaVerifySignature(claimed);
  ok(vCl.state === 'claimed' && vCl.author === 'Zbyszek', 'pola autora bez sig → claimed (deklaracja bez dowodu)');
  ok(api.validateDeltaText(api.stableStringify(claimed)).ok === true, 'claimed przechodzi walidacje');

  const noPub = JSON.parse(signedText);
  const keepSig = noPub.checksums.sig;
  delete noPub.meta.author_pubkey;
  noPub.checksums = Object.assign(api._deltaChecksums(noPub.meta, noPub.ops), { sig: keepSig });
  const vNp = await api._deltaVerifySignature(noPub);
  ok(vNp.state === 'bad', 'sig bez author_pubkey → bad');

  // idOk=false: sig zgodny z kluczem, ale deklarowany author_id inny — wymaga
  // przeliczenia checksums.file i nowego podpisu (meta.author_id wchodzi do file).
  const wrongId = JSON.parse(signedText);
  wrongId.meta.author_id = '0'.repeat(16);
  wrongId.checksums = api._deltaChecksums(wrongId.meta, wrongId.ops);
  const seed = await api._identityDeriveSeed('Zbyszek', PIN_WORDS);
  const keys = await api._identityKeysFromSeed(seed);
  wrongId.checksums.sig = api._identityHex(await keys.sign(new TextEncoder().encode('arkdelta-v3:' + wrongId.checksums.file)));
  const vW = await api._deltaVerifySignature(wrongId);
  ok(vW.state === 'ok' && vW.idOk === false && vW.authorId === 'efb8e5c9678554c4',
     'podpis zgodny, ale author_id nie pasuje do klucza → idOk=false');
  await api._identityClear();
}

// ═══ T3: ryzyko per-obszar (D4) ═══
console.log('── T3: ryzyko per-obszar ──');
{
  const d = JSON.parse(mkDeltaText());  // base.areas: 1/2 zgodne z mapa i baseInfo
  const risks = api._deltaAreaRisk(d);
  ok(risks && risks.length === 2 && risks.every(r => r.cls === 'green'), 'oba obszary nietkniete → green');
  ok(risks[0].name === 'Zielony Las' && risks[1].name === 'Żółta Grota', 'nazwy obszarow z zywej mapy');
  d.meta.base.areas['1'] = 'ffffeeee00001111';  // zmiana sumy obszaru 1
  const r2 = api._deltaAreaRisk(d);
  ok(r2.find(r => r.id === '1').cls === 'yellow' && r2.find(r => r.id === '2').cls === 'green',
     'zmieniona suma obszaru → yellow');
  d.meta.base.areas['3'] = 'aaaabbbbccccdddd';  // obszar 3 nie istnieje na mapie
  const r3 = api._deltaAreaRisk(d);
  ok(r3.find(r => r.id === '3').cls === 'red' && r3.find(r => r.id === '3').name === '#3',
     'brak obszaru na mapie → red (nazwa awaryjna #id)');
  delete d.meta.base.areas;
  ok(api._deltaAreaRisk(d) === null, 'brak sum per-obszar w kalce → null (stary producent)');
}

// ═══ T4: kategoria „z komendami" ═══
console.log('── T4: operacje z komendami ──');
{
  const plain = { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: { id: 'd:1', x: 0, y: 0, name: 'R', env: 258 } }, label: '' };
  ok(api._deltaOpHasCommands(plain) === false, 'zwykly ADD_ROOM — bez komend');
  const withSe = JSON.parse(J(plain));
  withSe.payload.room.special_exits = { 'open grate;d': 55 };
  ok(api._deltaOpHasCommands(withSe) === true, 'special_exits w pokoju → komendy');
  const withBind = JSON.parse(J(plain));
  withBind.payload.room.user_data = { bind: 'n' };
  ok(api._deltaOpHasCommands(withBind) === true, 'user_data.bind → komendy');
  const withGate = JSON.parse(J(plain));
  withGate.payload.room.user_data = { gate: 'karczma' };
  ok(api._deltaOpHasCommands(withGate) === true, 'user_data.gate → komendy');
  const emptyUd = JSON.parse(J(plain));
  emptyUd.payload.room.user_data = { drinkable: '1', bind: '' };
  ok(api._deltaOpHasCommands(emptyUd) === false, 'pusty bind / drinkable → bez komend');
  ok(api._deltaOpHasCommands({ type: 'DELETE_SPECIAL_EXIT', payload: { cmd: 'x' } }) === true,
     'DELETE_SPECIAL_EXIT → zawsze komendy (payload.cmd to komenda)');
  const editPair = { type: 'EDIT_ROOM', payload: { before: { id: 5, name: 'A' }, after: { id: 5, name: 'A', user_data: { walk_pre_cmd: 'look' } } } };
  ok(api._deltaOpHasCommands(editPair) === true, 'komenda dodana w after (EDIT_ROOM) → komendy');
  const item = api._deltaClsItem(withSe, 'ok', '');
  ok(item.cmds === true && item.cls === 'ok', '_deltaClsItem niesie flage cmds do panelu recenzji');
}

console.log('');
console.log('WYNIK: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('WYJATEK HARNESSA:', e); process.exit(1); });
