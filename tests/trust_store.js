// Harness — trust_store: lokalny TOFU (F7, spec .arkdelta §9).
// - IndexedDB 'arkmap-identity' v2: store 'trust' obok 'identity'; upgrade v1->v2
//   zachowuje dane i dotwarza brakujace store'y;
// - _trustCheck: new/same/conflict (read-only, nigdy nie rzuca);
// - _trustNote: zapis tylko nowych/zgodnych; konflikt NIGDY nie nadpisuje;
//   count/firstSeen/lastSeen;
// - piny statyczne polityki: _trustNote wolane wylacznie przy zgodnym podpisie
//   (ok + idOk), deklaracje (claimed) tylko czytaja; konsumenci obu formatow.
// Uruchamianie z katalogu głównego repo: node tests/trust_store.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── Wersjonowany stub IndexedDB: v1 (sam 'identity') -> upgrade v2 (+ 'trust') ──
const _stores = new Map();   // storeName -> Map(key -> rec)
let _dbVersion = 0;          // "istniejaca" wersja bazy
function _mkDb() {
  return {
    objectStoreNames: { contains: (n) => _stores.has(n) },
    createObjectStore(n) { if (!_stores.has(n)) _stores.set(n, new Map()); },
    transaction(store) {
      if (!_stores.has(store)) _stores.set(store, new Map());
      const m = _stores.get(store);
      const tx = {
        objectStore() {
          return {
            put(rec, key) { m.set(key, rec); },
            delete(key) { m.delete(key); },
            get(key) { const g = {}; setTimeout(() => { g.result = m.get(key); g.onsuccess && g.onsuccess(); }, 0); return g; },
          };
        },
      };
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
      return tx;
    },
  };
}
globalThis.indexedDB = {
  open(name, version) {
    const req = {};
    setTimeout(() => {
      req.result = _mkDb();
      if (version > _dbVersion) { _dbVersion = version; req.onupgradeneeded && req.onupgradeneeded(); }
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

// Ekstrakcja: IDENTITY-V1 (kanonikalizacja + _identityDb) + TRUST-STORE.
const i0 = HTML.indexOf('// ====IDENTITY-V1-BEGIN====');
const i1 = HTML.indexOf('// ====REGISTRY-CLIENT-BEGIN====');
const i2 = HTML.indexOf('// ====TRUST-STORE-BEGIN====');
const i3 = HTML.indexOf('// ====TRUST-STORE-END====');
if (i0 < 0 || i1 < 0 || i2 < 0 || i3 < 0 || !(i0 < i1 && i1 < i2 && i2 < i3))
  throw new Error('markry blokow IDENTITY-V1/REGISTRY-CLIENT/TRUST-STORE');
const code = HTML.slice(i0, i1) + HTML.slice(i2, i3) +
  '\n;return { _trustCheck, _trustNote, _identityStore, _identityLoad };';
const M = new Function(code)();

const PUB_A = 'a'.repeat(64), PUB_B = 'b'.repeat(64);

(async () => {
  // ── T0: piny statyczne polityki ──
  console.log('── T0: piny ──');
  ok(HTML.includes("indexedDB.open('arkmap-identity', 2)"), "T0: baza tozsamosci w wersji 2 (store 'trust')");
  ok(HTML.includes("db.createObjectStore('trust')") && HTML.includes("objectStoreNames.contains('trust')"),
    'T0: upgrade v1->v2 dotwarza store trust warunkowo (dane identity nietkniete)');
  const noteCalls = HTML.match(/await _trustNote\(/g) || [];
  ok(noteCalls.length === 2, 'T0: _trustNote wolane w 2 konsumentach (.arkmap + .arkdelta) — jest ' + noteCalls.length);
  const guardCalls = HTML.match(/state === 'ok' && [a-zA-Z._]*idOk !== false\)\s*\n?\s*await _trustNote\(/g) || [];
  ok(guardCalls.length === 2,
    'T0: oba zapisy trustu pod bramka ok+idOk (claimed nigdy nie zasila trustu)');
  ok((HTML.match(/_trustCheck\(/g) || []).length === 3, 'T0: odczyt trustu: definicja + 2 konsumentow');

  // ── T1: upgrade v1 -> v2 zachowuje identity ──
  console.log('── T1: upgrade bazy ──');
  {
    _dbVersion = 1; _stores.clear(); _stores.set('identity', new Map([['current', { nick: 'ala' }]]));
    // pierwsze uzycie przez _trustCheck otwiera baze w v2 -> upgrade dotwarza 'trust'
    const st = await M._trustCheck('ktoś', PUB_A);
    ok(st === 'new' && _stores.has('trust') && _stores.has('identity'), 'T1: upgrade v1->v2 dotworzyl trust, identity zostalo');
    ok(_stores.get('identity').get('current').nick === 'ala', 'T1: rekord identity przetrwal upgrade');
  }

  // ── T2: check/note — cykl TOFU ──
  console.log('── T2: cykl TOFU ──');
  {
    _dbVersion = 0; _stores.clear();
    ok(await M._trustCheck('Zbigniew', PUB_A) === 'new', 'T2: nieznany nick -> new');
    await M._trustNote('Zbigniew', PUB_A, 'id'.padEnd(16, '0'));
    ok(await M._trustCheck('zbigniew', PUB_A) === 'same', 'T2: po note -> same (nick kanonikalizowany)');
    ok(await M._trustCheck('ZBIGNIEW', PUB_A) === 'same', 'T2: wielkosc liter bez znaczenia');
    const rec = _stores.get('trust').get('zbigniew');
    ok(rec && rec.nick === 'zbigniew' && rec.pubkeyHex === PUB_A && rec.count === 1
      && rec.firstSeen && rec.lastSeen === rec.firstSeen, 'T2: rekord: nick/pubkey/count=1/firstSeen=lastSeen');
    await new Promise(r => setTimeout(r, 5));
    await M._trustNote('zbigniew', PUB_A, 'id'.padEnd(16, '0'));
    const rec2 = _stores.get('trust').get('zbigniew');
    ok(rec2.count === 2 && rec2.firstSeen === rec.firstSeen && rec2.lastSeen >= rec.firstSeen,
      'T2: kolejny note: count++, firstSeen zachowany, lastSeen odswiezony');
  }

  // ── T3: konflikt — nigdy nie nadpisuje ──
  console.log('── T3: konflikt ──');
  {
    _dbVersion = 0; _stores.clear();
    await M._trustNote('ewa', PUB_A, null);
    ok(await M._trustCheck('ewa', PUB_B) === 'conflict', 'T3: inny klucz pod ten sam nick -> conflict');
    await M._trustNote('ewa', PUB_B, null);  // proba nadpisania
    ok(_stores.get('trust').get('ewa').pubkeyHex === PUB_A && _stores.get('trust').get('ewa').count === 1,
      'T3: note przy konflikcie NIE nadpisuje (zapamietany klucz zostaje, count bez zmian)');
    ok(await M._trustCheck('ewa', PUB_A) === 'same', 'T3: oryginalny klucz dalej same');
  }

  // ── T4: odpornosc na zlosliwe/wejsciowe smieci ──
  console.log('── T4: brzegi ──');
  {
    _dbVersion = 0; _stores.clear();
    ok(await M._trustCheck('', PUB_A) === 'new', 'T4: pusty autor -> new');
    ok(await M._trustCheck('ala', 'nie-hex') === 'new', 'T4: zdeformowany pubkey -> new');
    ok(await M._trustCheck('ala', null) === 'new', 'T4: brak pubkey (claimed bez author_pubkey) -> new');
    await M._trustNote('ala', 'XX', null);  // zdeformowany — odmowa zapisu
    ok(!_stores.has('trust') || !_stores.get('trust').has('ala'), 'T4: note ze zdeformowanym pubkey nie zapisuje');
    await M._trustNote('', PUB_A, null);
    ok(!_stores.has('trust') || !_stores.get('trust').has(''), 'T4: note z pustym nickiem nie zapisuje');
  }

  console.log('');
  console.log('WYNIK: ' + pass + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('WYJATEK HARNESSA:', e); process.exit(1); });
