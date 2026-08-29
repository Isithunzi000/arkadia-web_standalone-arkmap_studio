// Harness — arkmap_sig: podpis tozsamosci dla .arkmap (F5, lustro D8 z .arkdelta).
// - _arkmapApplySignature: meta.author/author_id/author_pubkey/created + checksums.sig
//   (domena 'arkmap-v2:'); checksums.meta PRZELICZANE po wpisaniu pol autora;
// - _arkmapVerifySignature: stany unsigned/claimed/ok(+idOk)/bad, nigdy nie rzuca;
// - P-LOCK-1: payload podpisu = caly kanoniczny obiekt minus checksums.sig (oba formaty)
//   — obejmuje obce klucze top-level (D3) i wszystkie wpisy checksums;
// - P-LOCK-4: piny jednolitosc nazw/konstrukcji miedzy .arkmap a .arkdelta;
// - flip switch: _identitySignEnabled() (localStorage 'arkmap-sign-files').
// Uruchamianie z katalogu głównego repo: node tests/arkmap_sig.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'checksums', 'golden_fixture.arkmap'), 'utf8'));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Ekstrakcja blokow markierowych + stableStringify ─────────────────────────
function markerBlock(tag) {
  const re = new RegExp('// ====' + tag + '-BEGIN====([\\s\\S]*?)// ====' + tag + '-END====');
  const m = HTML.match(re);
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

// ── Stuby: IndexedDB (rekord tozsamosci) + localStorage (flip switch) ────────
const _idbData = new Map();
globalThis.indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      req.result = {
        objectStoreNames: { contains: () => false },  // F7: v2 zawsze tworzy brakujace store'y
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
const _lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (_lsData.has(k) ? _lsData.get(k) : null),
  setItem: (k, v) => _lsData.set(k, String(v)),
  removeItem: (k) => _lsData.delete(k),
};

const api = new Function(
  markerBlock('XXH3-64') + '\n' + markerBlock('CANONICAL-V4') + '\n' +
  extract(HTML, 'function stableStringify(val, indent, _lvl) {') + '\n' +
  markerBlock('IDENTITY-V1') + '\n' + markerBlock('ARKMAP-SIG') + '\n' +
  ';return { addChecksums, verifyChecksums, stableStringify,' +
  ' _identityCreate, _identityClear, _identityHex, _identityDeriveSeed, _identityKeysFromSeed,' +
  ' _identityFromHex, _identityAuthorId, _identityVerifySig, _sigPayload, _identitySignEnabled,' +
  ' _arkmapApplySignature, _arkmapVerifySignature };'
)();

const PIN_WORDS = ['abecadlo', 'adept', 'adwokat'];  // 3 slowa (domyslna dlugosc kodu)
const PIN_AUTHOR_ID = 'b61e8aca68dde75a';  // liczone ponizej w T0 i pinowane
const freshMap = () => JSON.parse(JSON.stringify(FIXTURE));

(async () => {

// ── T0: pin derywacji dla 3 slow (kanoniczny nick) ───────────────────────────
console.log('── T0: wektor 3-slowy ──');
{
  const seed = await api._identityDeriveSeed('Tester', PIN_WORDS);
  const keys = await api._identityKeysFromSeed(seed);
  const aid = await api._identityAuthorId(keys.pubBytes);
  console.log('    [info] author_id dla tester+3 slowa: ' + aid);
  ok(aid === PIN_AUTHOR_ID, 'author_id (tester, 3 slowa) — zamrozone');
}

// ── T1: brak tozsamosci → zapis bez podpisu ─────────────────────────────────
console.log('── T1: anonimowosc ──');
{
  const m = freshMap();
  api.addChecksums(m);
  const signed = await api._arkmapApplySignature(m);
  ok(signed === false && m.checksums.sig === undefined && m.meta.author === undefined,
     'brak tozsamosci → bez pol autora i bez checksums.sig');
  const v = await api._arkmapVerifySignature(m);
  ok(v.state === 'unsigned', 'weryfikacja: unsigned');
}

// ── T2: podpis end-to-end ────────────────────────────────────────────────────
console.log('── T2: podpis i weryfikacja ──');
let SIGNED = null;
{
  await api._identityCreate('Tester', PIN_WORDS);  // ~1 s (PBKDF2)
  const m = freshMap();
  const signed = await api._arkmapApplySignature(m);
  ok(signed === true, 'aktywna tozsamosc → podpis naniesiony');
  ok(m.meta.author === 'tester' && m.meta.author_id === PIN_AUTHOR_ID && /^[0-9a-f]{64}$/.test(m.meta.author_pubkey),
     'meta autora: nick kanoniczny + author_id (pin T0) + pubkey');
  ok(typeof m.meta.created === 'string' && !isNaN(Date.parse(m.meta.created)), 'meta.created: ISO timestamp');
  ok(/^[0-9a-f]{128}$/.test(m.checksums.sig), 'checksums.sig: 128 hex');
  // checksums.meta MUSI objac pola autora (przeliczone po ich wpisaniu):
  const chk = api.verifyChecksums(m);
  ok(chk.ok === true && chk.fileOk === true && chk.metaOk === true,
     'po podpisie: verifyChecksums ok/fileOk/metaOk wszystkie true');
  const v = await api._arkmapVerifySignature(m);
  ok(v.state === 'ok' && v.author === 'tester' && v.authorId === PIN_AUTHOR_ID && v.idOk === true,
     'weryfikacja: podpis zgodny, autor potwierdzony');
  // Kanonicznosc payloadu: parse/stringify (zmiana kolejnosci kluczy) nie rusza podpisu.
  const reparsed = JSON.parse(api.stableStringify(m));
  const v2 = await api._arkmapVerifySignature(reparsed);
  ok(v2.state === 'ok', 'kanonicznosc: podpis odporny na kolejnosc kluczy w pliku');
  SIGNED = m;
}

// ── T3: ingerencja w tresc → fileOk:false + sig bad ─────────────────────────
console.log('── T3: ingerencja w tresc ──');
{
  const t = JSON.parse(JSON.stringify(SIGNED));
  t.areas[0].rooms[0].name = t.areas[0].rooms[0].name + 'X';
  const chk = api.verifyChecksums(t);
  ok(chk.fileOk === false, 'zmiana pokoju → checksums.file niezgodne');
  const v = await api._arkmapVerifySignature(t);
  ok(v.state === 'bad' && v.author === 'tester', 'zmiana pokoju → podpis bad');
}

// ── T4: ingerencja w meta → metaOk:false, fileOk:true, sig bad ──────────────
console.log('── T4: ingerencja w meta ──');
{
  const t = JSON.parse(JSON.stringify(SIGNED));
  t.meta.map_name = t.meta.map_name + ' (edytowane)';
  const chk = api.verifyChecksums(t);
  ok(chk.metaOk === false && chk.fileOk === true, 'zmiana meta → metaOk:false, identity pliku bez zmian');
  const v = await api._arkmapVerifySignature(t);
  ok(v.state === 'bad', 'zmiana meta → podpis bad (meta objete podpisem)');
}

// ── T5: stany claimed / bad-format / brak klucza ─────────────────────────────
console.log('── T5: stany brzegowe ──');
{
  const cl = JSON.parse(JSON.stringify(SIGNED));
  delete cl.checksums.sig;
  ok((await api._arkmapVerifySignature(cl)).state === 'claimed', 'pola autora bez sig → claimed');
  const badHex = JSON.parse(JSON.stringify(SIGNED));
  badHex.checksums.sig = 'zz' + badHex.checksums.sig.slice(2);
  ok((await api._arkmapVerifySignature(badHex)).state === 'bad', 'sig o zlym formacie → bad');
  const noPub = JSON.parse(JSON.stringify(SIGNED));
  delete noPub.meta.author_pubkey;
  ok((await api._arkmapVerifySignature(noPub)).state === 'bad', 'sig bez author_pubkey → bad');
  const nibble = JSON.parse(JSON.stringify(SIGNED));
  nibble.checksums.sig = nibble.checksums.sig.slice(0, -1) + (nibble.checksums.sig.endsWith('a') ? 'b' : 'a');
  ok((await api._arkmapVerifySignature(nibble)).state === 'bad', 'przeklamany sig → bad');
  ok((await api._arkmapVerifySignature(null)) && true, 'weryfikacja nie rzuca na dziwnym wejsciu');
  const weird = await api._arkmapVerifySignature(42);
  ok(weird && (weird.state === 'unsigned' || weird.state === 'bad'), 'weryfikacja: wejscie nie-obiekt → bez rzutu');
}

// ── T6: P-LOCK-1 — obce klucze top-level objete podpisem ────────────────────
console.log('── T6: P-LOCK-1 (zakres podpisu) ──');
{
  const t = JSON.parse(JSON.stringify(SIGNED));
  t.obcy_top = { x: 1 };  // dolozony PO podpisie
  ok((await api._arkmapVerifySignature(t)).state === 'bad',
     'obcy klucz top-level dolozony po podpisie → bad (objety podpisem)');
  ok(api.verifyChecksums(t).ok === true,
     '…ale checksumy v4 go nie widza (pin rozdzielenia zakresow: sumy ≠ podpis)');
  // Obcy klucz obecny PRZED podpisem: podpisuje sie i weryfikuje poprawnie (D3 zachowane).
  const m2 = freshMap();
  m2.obcy_top = { x: 1 };
  await api._arkmapApplySignature(m2);
  ok((await api._arkmapVerifySignature(m2)).state === 'ok',
     'obcy klucz obecny przed podpisem → podpis spojny (D3 + P-LOCK-1)');
  // Przeklamanie dowolnego wpisu checksums (np. rooms) uniewaznia podpis.
  const t2 = JSON.parse(JSON.stringify(SIGNED));
  const firstRoomKey = Object.keys(t2.checksums.rooms)[0];
  t2.checksums.rooms[firstRoomKey] = 'f'.repeat(16);
  ok((await api._arkmapVerifySignature(t2)).state === 'bad',
     'przeklamany wpis checksums.rooms → bad (wpisy checksums objete podpisem)');
}

// ── T7: separacja domen .arkmap / .arkdelta ──────────────────────────────────
console.log('── T7: separacja domen ──');
{
  const okDomain = await api._identityVerifySig(SIGNED.meta.author_pubkey, SIGNED.checksums.sig,
    api._sigPayload('arkmap-v2:', SIGNED));
  ok(okDomain === true, 'sig weryfikuje sie w domenie arkmap-v2');
  const wrongDomain = await api._identityVerifySig(SIGNED.meta.author_pubkey, SIGNED.checksums.sig,
    api._sigPayload('arkdelta-v3:', SIGNED));
  ok(wrongDomain === false, 'sig NIE weryfikuje sie w domenie arkdelta-v3 (separacja)');
}

// ── T8: flip switch ──────────────────────────────────────────────────────────
console.log('── T8: przelacznik podpisywania ──');
{
  _lsData.set('arkmap-sign-files', '0');
  const m = freshMap();
  const signed = await api._arkmapApplySignature(m);
  ok(signed === false && m.checksums === undefined || (signed === false && !(m.checksums && m.checksums.sig)),
     'flip OFF → zapis anonimowy mimo aktywnej tozsamosci');
  _lsData.delete('arkmap-sign-files');
  ok(api._identitySignEnabled() === true, 'brak wpisu localStorage → domyslnie WLACZONE');
  const m2 = freshMap();
  ok((await api._arkmapApplySignature(m2)) === true, 'flip ON → podpis naniesiony');
  await api._identityClear();
}

// ── T9: P-LOCK-4 — piny jednolitosc nazw miedzy formatami (statyczne) ───────
console.log('── T9: P-LOCK-4 (jednolitosc) ──');
{
  const sigBlock = markerBlock('ARKMAP-SIG');
  const iD = HTML.indexOf('async function _deltaMaybeSign(text) {');
  const dSign = HTML.slice(iD, iD + 900);
  for (const field of ['meta.author =', 'meta.author_id =', 'meta.author_pubkey =', 'meta.created =']) {
    ok(sigBlock.includes(field.replace('meta.', 'arkmap.meta.')) && dSign.includes(field.replace('meta.', 'd.meta.')),
       'jednolite pole: ' + field.trim());
  }
  ok(sigBlock.includes("checksums.sig =") && dSign.includes('checksums.sig ='), 'jednolite miejsce podpisu: checksums.sig');
  ok((HTML.match(/_sigPayload\('arkmap-v2:',/g) || []).length === 2, 'arkmap: sign+verify przez _sigPayload (domena arkmap-v2)');
  ok((HTML.match(/_sigPayload\('arkdelta-v3:',/g) || []).length === 2, 'arkdelta: sign+verify przez _sigPayload (domena arkdelta-v3)');
  ok(sigBlock.includes('arkmap-v2:') && !sigBlock.includes('arkdelta-v3:'), 'domena arkmap-v2 wylacznie w sciezce .arkmap');
}

console.log('');
console.log('WYNIK: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('WYJATEK HARNESSA:', e); process.exit(1); });
