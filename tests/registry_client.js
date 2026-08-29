// Harness — registry_client: klient rejestru tozsamosci w apce (F6, spec .arkdelta §9).
// - piny domen/kontraktu krzyzowo z serwisem (api/_core.js w repo rejestru,
//   tests/registry_core.js po tamtej stronie): komunikaty rejestracji/uniewaznienia,
//   URL gatewaya i raw;
// - _registryFetchEntry: mapowanie 200/404/siec, cache sesji (offline NIE keszowane);
// - _registryRegister/_registryRevoke: ksztalt zadania + PoP weryfikowalny kluczem;
// - _registryEnrich: macierz match/missing/mismatch/revoked/offline/na;
// - _identityCreateOnline / _identityImportOnline / _identityRevokeOnline:
//   sciezki fail-closed (bez sieci, zajety, uniewazniony, cudzy klucz) + happy path.
// Uruchamianie z katalogu głównego repo: node tests/registry_client.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

const i0 = HTML.indexOf('// ====IDENTITY-V1-BEGIN====');
const i1 = HTML.indexOf('// ====ARKMAP-SIG-BEGIN====');
if (i0 < 0 || i1 < 0 || i1 <= i0) throw new Error('brak markrow IDENTITY-V1/ARKMAP-SIG w arkmap_studio.html');
const code = HTML.slice(i0, i1) +
  '\n;return { _identityDeriveRecord, _identityCreate, _identityActive, _identityClear, _identityVerifySig,' +
  ' _registryFetchEntry, _registryRegister, _registryRevoke, _registryEnrich, _registryEnrichLabel,' +
  ' _registryRegisterMsg, _registryRevokeMsg, _registrySessionCache,' +
  ' _identityCreateOnline, _identityImportOnline, _identityRevokeOnline,' +
  ' _REGISTRY_API, _REGISTRY_RAW };';

// ── Stuby: IndexedDB (in-memory) + localStorage ──
const _idbData = new Map();
globalThis.indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      req.result = {
        createObjectStore() {},
        transaction() {
          const tx = {
            objectStore() {
              return {
                put(rec, key) { _idbData.set(key, rec); },
                delete(key) { _idbData.delete(key); },
                get(key) { const g = {}; setTimeout(() => { g.result = _idbData.get(key); g.onsuccess && g.onsuccess(); }, 0); return g; },
              };
            },
          };
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

// ── Programowalny stub fetch: rejestr in-memory + licznik wywolan ──
const _entries = new Map();
let _fetchCalls = [];
let _fetchMode = 'live';  // 'live' | 'down' (rzuca) | 'http500'
globalThis.fetch = async (url, opts) => {
  _fetchCalls.push({ url: String(url), opts });
  if (_fetchMode === 'down') throw new TypeError('fetch failed');
  if (_fetchMode === 'http500') return { status: 500, ok: false, json: async () => ({}) };
  const mApi = String(url).match(/^https:\/\/arkmap-identity-registry\.vercel\.app\/api\/(register|revoke)$/);
  if (mApi) {
    const b = JSON.parse(opts.body);
    if (mApi[1] === 'register') {
      const cur = _entries.get(b.nick);
      if (cur && cur.revoked) return { status: 410, ok: false, json: async () => ({ error: 'nick_revoked' }) };
      if (cur && cur.pubkey !== b.pubkey) return { status: 409, ok: false, json: async () => ({ error: 'nick_taken' }) };
      if (cur) return { status: 200, ok: true, json: async () => ({ status: 'already', entry: cur }) };
      const entry = { version: 1, nick: b.nick, author_id: b.author_id, pubkey: b.pubkey,
        registered_at: '2026-08-29T00:00:00.000Z', register_sig: b.sig,
        revoked: false, revoked_at: null, revoke_sig: null, revoked_by: null };
      _entries.set(b.nick, entry);
      return { status: 201, ok: true, json: async () => ({ status: 'registered', entry }) };
    }
    const cur = _entries.get(b.nick);
    if (!cur) return { status: 404, ok: false, json: async () => ({ error: 'not_registered' }) };
    if (cur.revoked) return { status: 200, ok: true, json: async () => ({ status: 'already_revoked', entry: cur }) };
    cur.revoked = true; cur.revoked_at = '2026-08-29T00:00:00.000Z'; cur.revoke_sig = b.sig; cur.revoked_by = 'owner';
    return { status: 200, ok: true, json: async () => ({ status: 'revoked', entry: cur }) };
  }
  const mRaw = String(url).match(/\/entries\/([a-z0-9]{1,32})\.json$/);
  if (mRaw) {
    const cur = _entries.get(mRaw[1]);
    if (!cur) return { status: 404, ok: false, json: async () => { throw new Error('404'); } };
    return { status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(cur)) };
  }
  throw new Error('fetch stub: nieznany URL ' + url);
};

const M = new Function(code)();

(async () => {
  // ── T0: piny kontraktu (krzyzowo z tests/registry_core.js T0) ──
  console.log('── T0: kontrakt ──');
  ok(M._registryRegisterMsg('zbyszek', 'ab') === 'arkmap-registry-v1:register:zbyszek:ab',
    'T0: komunikat rejestracji = arkmap-registry-v1:register:<nick>:<pubkey> (jak w serwisie)');
  ok(M._registryRevokeMsg('zbyszek') === 'arkmap-registry-v1:revoke:zbyszek',
    'T0: komunikat uniewaznienia = arkmap-registry-v1:revoke:<nick> (jak w serwisie)');
  ok(M._REGISTRY_API === 'https://arkmap-identity-registry.vercel.app/api',
    'T0: URL gatewaya przypiety');
  ok(M._REGISTRY_RAW === 'https://raw.githubusercontent.com/Isithunzi000/arkadia-arkmap-identity-registry/main/entries/',
    'T0: URL raw rejestru przypiety (Isithunzi000/arkadia-arkmap-identity-registry@main entries/)');

  // ── T1: fetchEntry — mapowanie i cache ──
  console.log('── T1: fetchEntry ──');
  {
    _fetchCalls = [];
    let r = await M._registryFetchEntry('NieMaMnie');
    ok(r.status === 'unregistered' && _fetchCalls.length === 1, 'T1: 404 -> unregistered (nick kanonikalizowany w URL)');
    ok(/entries\/niemamnie\.json$/.test(_fetchCalls[0].url), 'T1: URL z kanonicznym nickiem (lowercase)');
    r = await M._registryFetchEntry('niemamnie');
    ok(r.status === 'unregistered' && _fetchCalls.length === 1, 'T1: unregistered keszowane (drugi call bez fetch)');
    _entries.set('ola2', { version: 1, nick: 'ola2', pubkey: 'a'.repeat(64), revoked: false });
    r = await M._registryFetchEntry('ola2');
    ok(r.status === 'ok' && r.entry.nick === 'ola2', 'T1: 200 -> ok + entry');
    _fetchMode = 'http500';
    r = await M._registryFetchEntry('pietnascie');
    ok(r.status === 'offline', 'T1: HTTP 500 -> offline (nie mylone z brakiem wpisu)');
    _fetchMode = 'down';
    r = await M._registryFetchEntry('pietnascie');
    ok(r.status === 'offline', 'T1: wyjatek sieci -> offline');
    const before = _fetchCalls.length;
    _fetchMode = 'live';
    r = await M._registryFetchEntry('pietnascie');
    ok(_fetchCalls.length === before + 1 && r.status === 'unregistered', 'T1: offline NIE keszowane — ponowiony fetch');
  }

  // ── T2: register — ksztalt zadania + PoP ──
  console.log('── T2: register ──');
  {
    const d = await M._identityDeriveRecord('Zbyszek', ['abecadlo', 'adept', 'adwokat']);
    _fetchCalls = [];
    const res = await M._registryRegister(d.rec, d.sign);
    ok(res.code === 201 && res.body.status === 'registered', 'T2: rejestracja -> 201');
    const call = _fetchCalls[0];
    ok(call.opts.method === 'POST' && call.opts.headers['Content-Type'] === 'application/json', 'T2: POST JSON');
    const body = JSON.parse(call.opts.body);
    ok(body.nick === 'zbyszek' && body.pubkey === d.rec.pubkeyHex && body.author_id === d.rec.authorId
      && /^[0-9a-f]{128}$/.test(body.sig), 'T2: body = nick/pubkey/author_id/sig (ksztalt kontraktu)');
    ok(await M._identityVerifySig(d.rec.pubkeyHex, body.sig, M._registryRegisterMsg('zbyszek', d.rec.pubkeyHex)),
      'T2: PoP weryfikowalny kluczem publicznym (serwer sprawdzi to samo)');
  }

  // ── T3: revoke — ksztalt + podpis ──
  console.log('── T3: revoke ──');
  {
    await M._identityCreate('zbyszek', ['abecadlo', 'adept', 'adwokat']);  // lokalny zapis (T2 zarejestrowal wpis)
    const id = await M._identityActive();
    ok(id && id.nick === 'zbyszek', 'T3: tozsamosc aktywna po lokalnym zapisie');
    _fetchCalls = [];
    const res = await M._registryRevoke(id);
    ok(res.code === 200 && res.body.status === 'revoked', 'T3: uniewaznienie -> 200 revoked');
    const body = JSON.parse(_fetchCalls[0].opts.body);
    ok(body.nick === 'zbyszek' && /^[0-9a-f]{128}$/.test(body.sig) && body.pubkey === undefined,
      'T3: body = nick + sig (klucz NIE jest przesylany — serwer bierze z rejestru)');
    ok(await M._identityVerifySig(id.pubkeyHex, body.sig, M._registryRevokeMsg('zbyszek')),
      'T3: podpis uniewaznienia weryfikowalny (serwer: vs klucz Z REJESTRU)');
    // porzadkowanie: wyczysc lokalnie, wroc do zycia
    await M._identityClear();
    _entries.delete('zbyszek');
  }

  // ── T4: macierz enrich ──
  console.log('── T4: macierz _registryEnrich ──');
  {
    ok(await M._registryEnrich(null, null) === 'na', 'T4: brak autora -> na');
    _entries.set('mat', { nick: 'mat', pubkey: 'p'.repeat(0) + 'a'.repeat(64), revoked: false });
    M._registrySessionCache.clear();
    ok(await M._registryEnrich('mat', 'a'.repeat(64)) === 'match', 'T4: zgodny pubkey -> match');
    M._registrySessionCache.clear();
    ok(await M._registryEnrich('mat', 'b'.repeat(64)) === 'mismatch', 'T4: inny pubkey -> mismatch');
    ok(await M._registryEnrich('nieobecny', 'a'.repeat(64)) === 'missing', 'T4: brak wpisu -> missing');
    _entries.set('martwy', { nick: 'martwy', pubkey: 'a'.repeat(64), revoked: true });
    M._registrySessionCache.clear();
    ok(await M._registryEnrich('martwy', 'a'.repeat(64)) === 'revoked', 'T4: tombstone -> revoked (priorytet nad zgodnoscia klucza)');
    _fetchMode = 'down';
    ok(await M._registryEnrich('gdzies', 'a'.repeat(64)) === 'offline', 'T4: siec down -> offline');
    _fetchMode = 'live';
    const lbl = M._registryEnrichLabel;
    ok(lbl('match').cls === 'green' && lbl('missing').cls === 'orange' && lbl('mismatch').cls === 'red'
      && lbl('revoked').cls === 'red' && lbl('offline').cls === 'grey' && lbl('na').suffix === '',
      'T4: _registryEnrichLabel — kolory macierzy green/orange/red/red/grey');
  }

  // ── T5: createOnline — fail-closed ──
  console.log('── T5: _identityCreateOnline ──');
  {
    M._registrySessionCache.clear();
    _fetchMode = 'down';
    let err = await M._identityCreateOnline('tester1', ['abecadlo', 'adept', 'adwokat']).catch(e => e);
    ok(/wymaga internetu/.test(err.message) && !_idbData.has('current'), 'T5: offline -> odmowa, NIC nie zapisane lokalnie');
    _fetchMode = 'live';
    _entries.set('tester1', { nick: 'tester1', pubkey: 'a'.repeat(64), revoked: false });
    M._registrySessionCache.clear();
    err = await M._identityCreateOnline('tester1', ['abecadlo', 'adept', 'adwokat']).catch(e => e);
    ok(/zajęty/.test(err.message) && !_idbData.has('current'), 'T5: nick zajety -> odmowa przed derywacja');
    _entries.set('tester1', { nick: 'tester1', pubkey: 'a'.repeat(64), revoked: true });
    M._registrySessionCache.clear();
    err = await M._identityCreateOnline('tester1', ['abecadlo', 'adept', 'adwokat']).catch(e => e);
    ok(/unieważniony/.test(err.message) && !_idbData.has('current'), 'T5: nick uniewazniony -> odmowa (wariant A)');
    // happy path: zapis lokalny DOPIERO po rejestracji + cache wypelniony
    _entries.delete('tester1');
    M._registrySessionCache.clear();
    const stages = [];
    const r = await M._identityCreateOnline('Tester1', ['abecadlo', 'adept', 'adwokat'], (s) => stages.push(s));
    ok(_idbData.has('current') && _idbData.get('current').nick === 'tester1', 'T5: happy — rekord zapisany (nick kanoniczny)');
    ok(stages.join(',') === 'check,derive,register', 'T5: kolejnosc etapow check -> derive -> register');
    ok(_entries.get('tester1') && _entries.get('tester1').pubkey === _idbData.get('current').pubkeyHex,
      'T5: wpis w rejestrze z kluczem rekordu');
    const cached = await M._registryFetchEntry('tester1');
    ok(cached.status === 'ok', 'T5: cache sesji wypelniony po rejestracji');
    await M._identityClear();
  }

  // ── T6: importOnline — fail-closed ──
  console.log('── T6: _identityImportOnline ──');
  {
    // kod pasujacy do wpisu 'importer' (litery kontrolne liczone per-nick — stad d.code)
    const d = await M._identityDeriveRecord('importer', ['abecadlo', 'adept', 'adwokat']);
    _entries.set('importer', { nick: 'importer', pubkey: d.rec.pubkeyHex, revoked: false });
    M._registrySessionCache.clear();
    const r = await M._identityImportOnline(d.code.toUpperCase());
    ok(_idbData.has('current') && _idbData.get('current').nick === 'importer', 'T6: import zgodny z rejestrem -> zapisany (kod WIELKIMI)');
    await M._identityClear();
    // cudzy klucz
    _entries.set('importer', { nick: 'importer', pubkey: 'c'.repeat(64), revoked: false });
    M._registrySessionCache.clear();
    let err = await M._identityImportOnline(d.code).catch(e => e);
    ok(/inny klucz/.test(err.message) && !_idbData.has('current'), 'T6: pubkey != rejestr -> odmowa (podszywanie/literowka)');
    // niezarejestrowany
    const d2 = await M._identityDeriveRecord('swiezy9', ['abecadlo', 'adept', 'adwokat']);
    M._registrySessionCache.clear();
    err = await M._identityImportOnline(d2.code).catch(e => e);
    ok(/nie figuruje/.test(err.message) && !_idbData.has('current'), 'T6: nick poza rejestrem -> odmowa');
    // uniewazniony
    const d3 = await M._identityDeriveRecord('martwy2', ['abecadlo', 'adept', 'adwokat']);
    _entries.set('martwy2', { nick: 'martwy2', pubkey: d3.rec.pubkeyHex, revoked: true });
    M._registrySessionCache.clear();
    err = await M._identityImportOnline(d3.code).catch(e => e);
    ok(/unieważniona/.test(err.message) && !_idbData.has('current'), 'T6: tozsamosc uniewazniona -> odmowa');
    // offline
    _fetchMode = 'down';
    err = await M._identityImportOnline(d.code).catch(e => e);
    ok(/wymaga internetu/.test(err.message) && !_idbData.has('current'), 'T6: offline -> odmowa bez zapisu');
    _fetchMode = 'live';
  }

  // ── T7: revokeOnline — fail-closed + lokalne czyszczenie ──
  console.log('── T7: _identityRevokeOnline ──');
  {
    M._registrySessionCache.clear();
    await M._identityCreateOnline('dorevoke', ['abecadlo', 'adept', 'adwokat']);
    _fetchMode = 'down';
    let err = await M._identityRevokeOnline().catch(e => e);
    ok(/wymaga internetu/.test(err.message) && _idbData.has('current'), 'T7: offline -> odmowa, tozsamosc ZOSTAJE lokalnie');
    _fetchMode = 'live';
    await M._identityRevokeOnline();
    ok(!_idbData.has('current'), 'T7: sukces -> lokalna tozsamosc wyczyszczona');
    ok(_entries.get('dorevoke').revoked === true && _entries.get('dorevoke').revoked_by === 'owner',
      'T7: tombstone w rejestrze (revoked_by=owner)');
    const cached = await M._registryFetchEntry('dorevoke');
    ok(cached.status === 'ok' && cached.entry.revoked === true, 'T7: cache sesji = tombstone (spojny stan)');
    err = await M._identityRevokeOnline().catch(e => e);
    ok(/Brak aktywnej/.test(err.message), 'T7: revoke bez tozsamosci -> blad');
  }

  console.log('');
  console.log('WYNIK: ' + pass + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('WYJATEK HARNESSA:', e); process.exit(1); });
