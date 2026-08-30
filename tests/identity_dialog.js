// Harness — identity_dialog: pin UI tozsamosci (D8, faza 5c).
// Przycisk nad polem wczytywania, dialog ze stanami brak/aktywna, akcje
// Utworz/Importuj/Pokaz kod/Wyczysc (dwuklik), status w sidebarze, selektor
// liczby slow 3/4/5/6 (persist localStorage), charset nicku [a-z0-9].
// DOM i IndexedDB stubowane; derywacja PBKDF2 realna (~1 s na probe).
// Uruchamianie z katalogu głównego repo: node tests/identity_dialog.js
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

// ── T0: statyczny HTML — przycisk nad polem wczytywania + dialog ──
console.log('── T0: statyczne UI ──');
{
  // v1.52.1: tytul sekcji "Wczytaj" usuniety (wisiał nad przyciskiem tozsamosci, ktora nic nie wczytuje)
  ok(!HTML.includes('<div class="sb-section-title">Wczytaj</div>'), 'naglowek sekcji "Wczytaj" usuniety (mylil nad przyciskiem tozsamosci)');
  const iBtn = HTML.indexOf('id="btn-identity"');
  const iStatus = HTML.indexOf('id="identity-status"');
  const iDrop = HTML.indexOf('id="drop-zone"');
  const iLoad = HTML.indexOf('id="btn-load-arkmap"');
  ok(iBtn >= 0 && iStatus > iBtn && iDrop > iStatus && iLoad > iDrop,
     'przycisk "Tożsamość autora" + status nad polem wczytywania (drop-zone), przed Wczytaj .arkmap');
  ok(HTML.includes('id="dlg-identity"') && HTML.includes('id="identity-body"'), 'dialog dlg-identity z body');
}

// ── mini-DOM + IndexedDB (in-memory) ─────────────────────────────
const registry = new Map();
const segBtnCache = new Map();  // stabilne obiekty przyciskow segmentu
function makeEl(id) {
  const el = {
    id, textContent: '', value: '', disabled: false, dataset: {}, style: {},
    onclick: null, _html: '',
    addEventListener(ev, f) { el['on' + ev] = f; },
    // Wystarcza dla segmentu liczby slow: <button ... data-w="N"> w HTML rodzica
    // (stub nie buduje drzewa — skanujemy HTML calego body dialogu).
    querySelectorAll(sel) {
      if (sel !== 'button') return [];
      const host = registry.get('identity-body');
      const html = host ? host._html : el._html;
      const out = [];
      for (const m of String(html).matchAll(/<button[^>]*data-w="(\d)"[^>]*>/g)) {
        const key = el.id + '#' + m[1];
        if (!segBtnCache.has(key)) segBtnCache.set(key, { dataset: { w: m[1] }, style: {}, onclick: null, textContent: '' });
        out.push(segBtnCache.get(key));
      }
      return out;
    },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    // v1.52.1: sync textContent (strip tagow) — status tozsamosci zszedl na innerHTML (kolory),
    // a piny czytaja textContent; strip zachowuje dokladny tekst (bez encji w statusie).
    set(v) { el._html = v; el.textContent = String(v).replace(/<[^>]*>/g, ''); for (const m of String(v).matchAll(/id="([\w-]+)"/g)) reg(m[1]); },
  });
  return el;
}
function reg(id) { if (!registry.has(id)) registry.set(id, makeEl(id)); return registry.get(id); }
const documentStub = { getElementById: (id) => reg(id) };
const toasts = [];
const opened = [];
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const _lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (_lsData.has(k) ? _lsData.get(k) : null),
  setItem: (k, v) => _lsData.set(k, String(v)),
  removeItem: (k) => _lsData.delete(k),
};
const _idbData = new Map();
globalThis.indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      req.result = {
        objectStoreNames: { contains: () => false },  // F7: v2 zawsze tworzy brakujace store'y
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

// F6: stub rejestru tozsamosci (in-memory) — odczyt raw + gateway register/revoke.
// Semantyka jak api/_core.js: 404 gdy brak, 409 nick_taken, 410 po uniewaznieniu,
// revoke ustawia tombstone revoked_by=owner.
const _regEntries = new Map();  // nick -> entry
globalThis.fetch = async (url, opts) => {
  const mApi = String(url).match(/^https:\/\/arkmap-identity-registry\.vercel\.app\/api\/(register|revoke)$/);
  if (mApi) {
    const b = JSON.parse(opts.body);
    if (mApi[1] === 'register') {
      const cur = _regEntries.get(b.nick);
      if (cur && cur.revoked) return { status: 410, ok: false, json: async () => ({ error: 'nick_revoked' }) };
      if (cur && cur.pubkey !== b.pubkey) return { status: 409, ok: false, json: async () => ({ error: 'nick_taken' }) };
      if (cur) return { status: 200, ok: true, json: async () => ({ status: 'already', entry: cur }) };
      const entry = { version: 1, nick: b.nick, author_id: b.author_id, pubkey: b.pubkey,
        registered_at: '2026-08-29T00:00:00.000Z', register_sig: b.sig,
        revoked: false, revoked_at: null, revoke_sig: null, revoked_by: null };
      _regEntries.set(b.nick, entry);
      return { status: 201, ok: true, json: async () => ({ status: 'registered', entry }) };
    }
    const cur = _regEntries.get(b.nick);
    if (!cur) return { status: 404, ok: false, json: async () => ({ error: 'not_registered' }) };
    if (cur.revoked) return { status: 200, ok: true, json: async () => ({ status: 'already_revoked', entry: cur }) };
    cur.revoked = true; cur.revoked_at = '2026-08-29T00:00:00.000Z'; cur.revoke_sig = b.sig; cur.revoked_by = 'owner';
    return { status: 200, ok: true, json: async () => ({ status: 'revoked', entry: cur }) };
  }
  const mRaw = String(url).match(/\/entries\/([a-z0-9]{1,32})\.json$/);
  if (mRaw) {
    const cur = _regEntries.get(mRaw[1]);
    if (!cur) return { status: 404, ok: false, json: async () => { throw new Error('404'); } };
    return { status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(cur)) };
  }
  throw new Error('fetch stub: nieznany URL ' + url);
};

const code = blockSlice('// ====IDENTITY-V1-BEGIN====', '// === ARKDELTA START ===') +
  '\n;return { _identityUiRefresh, _identityActive };';
const api = new Function('document', 'toast', 'openDialog', 'closeDialog', 'escHtml', code)(
  documentStub, (m) => toasts.push(m), (id) => opened.push(id), () => {}, escHtml);
const tick = () => new Promise(r => setTimeout(r, 30));
const el = (id) => reg(id);

(async () => {

// ── T1: stan poczatkowy — brak tozsamosci ──
console.log('── T1: stan "brak tozsamosci" ──');
{
  await tick();  // startowe _identityUiRefresh()
  ok(el('identity-status').textContent === 'pliki będą anonimowe', 'status: pliki anonimowe');
  ok(el('identity-body')._html.includes('Utwórz tożsamość') && el('identity-body')._html.includes('Importuj tożsamość'),
     'dialog: formularze utworz/import');
  const segHtml = el('identity-body')._html;
  ok(segHtml.includes('data-w="3"') && segHtml.includes('data-w="4"') && segHtml.includes('data-w="5"') &&
     segHtml.includes('data-w="6"') && segHtml.includes('3 · wygodnie') && segHtml.includes('6 · paranoia'),
     'dialog: selektor liczby slow 3/4/5/6 z opisami skrajnych');
  ok(segHtml.includes('Tylko litery a-z i cyfry'), 'dialog: hint charsetu nicku');
  el('btn-identity').onclick();
  await tick();
  ok(opened.includes('dlg-identity'), 'przycisk otwiera dialog');
}

// ── T2: walidacja nicku w dialogu ──
console.log('── T2: walidacja nicku ──');
{
  el('id-nick').value = '   ';
  await el('id-btn-create').onclick();
  ok(/Nick jest wymagany/.test(el('id-create-err').textContent), 'pusty nick → blad w dialogu (bez derywacji)');
  ok(el('id-btn-create').disabled === false, 'przycisk dalej aktywny po bledzie walidacji');
}

// ── T3: utworzenie tozsamosci ──
console.log('── T3: utworz tozsamosc ──');
{
  // Wybor liczby slow w segmencie: klik "4" → persist localStorage.
  const segBtns = el('id-words-seg').querySelectorAll('button');
  const b4 = segBtns.find(b => b.dataset.w === '4');
  b4.onclick();
  ok(_lsData.get('arkmap-identity-words') === '4', 'selektor: wybor 4 slow trzymany w localStorage');
  el('id-nick').value = 'Zbyszek';
  await el('id-btn-create').onclick();
  const stTxt = el('identity-status').textContent;
  ok(/^🪪 zbyszek · [0-9a-f]{16}$/.test(stTxt), 'status: nick kanoniczny (lowercase) + 16-hex identyfikatora');
  globalThis.__authorId = stTxt.slice(-16);
  ok(el('identity-body')._html.includes('Autor:') && el('identity-body')._html.includes('Odcisk klucza'),
     'dialog: stan aktywny (autor + odcisk klucza)');
  ok(el('identity-body')._html.includes('id="id-copy-nick"') && el('identity-body')._html.includes('id="id-copy-authorid"')
     && el('identity-body')._html.includes('id="id-copy-pubkey"'),
     'dialog: ikonki kopiowania przy autorze, identyfikatorze i odcisku (v1.52.1)');
  const codeHtml = el('id-code-out')._html;
  const m = codeHtml.match(/zbyszek:([a-z]+-){3}[a-z]+-[a-z]{3}/);
  ok(!!m, 'kod odzyskiwania: 4 slowa zgodnie z wyborem segmentu (format nick:4 slowa-LLL)');
  globalThis.__code = m && m[0];
  ok(toasts.some(t => /Tożsamość utworzona/.test(t)), 'toast potwierdzenia');
}

// ── T4: pokaz kod na zyczenie + wyczysc (dwuklik) ──
console.log('── T4: pokaz kod / wyczysc ──');
{
  el('id-code-out')._html = '';
  await el('id-btn-show').onclick();
  ok(el('id-code-out')._html.includes(globalThis.__code), 'pokaz kod: ten sam kod co przy tworzeniu');
  // v1.52.1: ikonka kopiowania kodu przy polu (⧉ → ✓) — wiring + zawartosc schowka
  {
    let rec = null;
    globalThis.navigator = { clipboard: { writeText: t => { rec = t; return Promise.resolve(); } } };
    const btnC = el('id-copy-code');
    ok(btnC && typeof btnC.onclick === 'function', 'ikonka kopiowania kodu podpieta (v1.52.1)');
    btnC.onclick();
    await tick();
    ok(rec === globalThis.__code, 'kopiowanie kodu: do schowka trafia pelny kod (v1.52.1)');
    ok(btnC.textContent === '✓', 'ikonka potwierdza skopiowanie znakiem ✓ (v1.52.1)');
    delete globalThis.navigator;
  }
  // F5: przelacznik podpisywania — persist localStorage, suffix w statusie.
  const tg = el('id-sign-toggle');
  ok(tg !== undefined && typeof tg.onchange === 'function', 'flip switch "Podpisuj pliki moją tożsamością" obecny w stanie aktywnym');
  tg.checked = false; tg.onchange({ target: tg });
  ok(_lsData.get('arkmap-sign-files') === '0', 'flip switch: wylaczenie trzymane w localStorage');
  // v1.52.2: segment warn to osobny blok (div) — w textContent skleja sie z identyfikatorem bez separatora
  ok(el('identity-status').textContent.includes('podpis wyłączony'), 'flip switch: status pokazuje wylaczone podpisywanie');
  tg.checked = true; tg.onchange({ target: tg });
  ok(_lsData.get('arkmap-sign-files') === '1' && !el('identity-status').textContent.includes('podpis wyłączony'),
     'flip switch: ponowne wlaczenie (persist + status)');
  await el('id-btn-clear').onclick();  // pierwszy klik = uzbrojenie
  ok(el('id-btn-clear').textContent.includes('Na pewno') && (await _identityActiveStill(api)) !== null,
     'wyczysc: pierwszy klik pyta ponownie, tozsamosc nadal aktywna');
  await el('id-btn-clear').onclick();  // drugi klik = kasowanie
  ok(el('identity-status').textContent === 'pliki będą anonimowe' && _idbData.size === 0,
     'wyczysc: drugi klik kasuje rekord z maszyny');
}

// ── T5: import kodem ──
console.log('── T5: import ──');
{
  el('id-import-in').value = 'zly:kod';
  await el('id-btn-import').onclick();
  ok(el('id-import-err').textContent.length > 3, 'import: blad parsowania widoczny w dialogu');
  el('id-import-in').value = globalThis.__code;
  await el('id-btn-import').onclick();
  ok(el('identity-status').textContent === '🪪 zbyszek · ' + globalThis.__authorId,
     'import kodem odtwarza IDENTYCZNA tozsamosc (ten sam identyfikator)');
  ok(toasts.some(t => /zaimportowana/.test(t)), 'toast importu');
}

// ── T6: charset nicku odrzuca HTML; selektor zapamietany miedzy sesjami dialogu ──
console.log('── T6: charset / persistencja selektora ──');
{
  await el('id-btn-clear').onclick(); await el('id-btn-clear').onclick();
  await tick();
  el('id-nick').value = '<img src=x>';
  await el('id-btn-create').onclick();
  ok(/litery a-z/.test(el('id-create-err').textContent), 'nick z HTML odrzucony przez charset (iniekcja niemozliwa)');
  ok(el('identity-status').textContent === 'pliki będą anonimowe', 'po odrzuceniu tozsamosc nie powstaje');
  // Statyczny pin: nick w stanie aktywnym zawsze przez escHtml (gdyby charset zlagodzono).
  const srcUi = blockSlice('// ── UI: dialog tozsamosci', '// === ARKDELTA START ===');
  ok(srcUi.includes("<b>Autor:</b> ' + escHtml(id.nick)"),
     'pin statyczny: nick w dialogu zawsze escapowany');
  ok(srcUi.includes('\'<div style="color:var(--warn);font-weight:bold;white-space:nowrap">podpis wyłączony</div>\''),
     'v1.52.2: „podpis wyłączony" samodzielna linia (blok + nowrap) — brak lamania frazy na sidebarze');
  // Persistencja selektora: nowa sesja dialogu (formularz po wyczyszczeniu)
  // laduje zapisane "4" z localStorage — utworzona tozsamosc ma 4 slowa.
  el('id-nick').value = 'ala';
  await el('id-btn-create').onclick();
  const m2 = el('id-code-out')._html.match(/ala:([a-z]+-){3}[a-z]+-[a-z]{3}/);
  ok(!!m2, 'selektor zapamietany: nowa tozsamosc ma 4 slowa (z localStorage)');
  await el('id-btn-clear').onclick(); await el('id-btn-clear').onclick();
}

// ── T7: strefa niebezpieczna — uniewaznienie tozsamosci (F6) ──
console.log('── T7: uniewaznienie tozsamosci ──');
{
  el('id-nick').value = 'duch';
  await el('id-btn-create').onclick();
  await tick();
  ok(_regEntries.has('duch') && !_regEntries.get('duch').revoked, 'rejestr: nick zapisany przy tworzeniu (online-only)');
  const bodyHtml = el('identity-body')._html;
  ok(!bodyHtml.includes('Strefa niebezpieczna') && bodyHtml.includes('Unieważnij na zawsze'),
     'dialog: bez napisu "Strefa niebezpieczna" (v1.52.1), przycisk unieważnienia obecny');
  ok(/id="id-btn-revoke" disabled/.test(bodyHtml), 'przycisk "Unieważnij na zawsze" startuje wylaczony');
  ok(/id="id-btn-revoke-arm"[^>]*background:var\(--err\)/.test(bodyHtml), 'przycisk "Unieważnij tożsamość" w pelni czerwony (v1.52.1)');
  await el('id-btn-revoke-arm').onclick();
  ok(el('id-revoke-panel').style.display === 'block', 'arm otwiera panel (bez domyslnego fokusu — brak .focus() w kodzie)');
  el('id-revoke-in').value = 'inny';
  el('id-revoke-in').oninput && el('id-revoke-in').oninput();
  ok(el('id-btn-revoke').disabled === true, 'bledny nick: przycisk pozostaje wylaczony');
  el('id-revoke-in').value = 'DUCH';  // wielkosc liter bez znaczenia
  el('id-revoke-in').oninput();
  ok(el('id-btn-revoke').disabled === false, 'kanoniczny nick (case-insensitive) odblokowuje przycisk');
  await el('id-btn-revoke').onclick();
  await tick();
  const tomb = _regEntries.get('duch');
  ok(tomb && tomb.revoked === true && tomb.revoked_by === 'owner' && typeof tomb.revoke_sig === 'string',
     'rejestr: tombstone z revoke_sig i revoked_by=owner');
  ok(el('identity-status').textContent === 'pliki będą anonimowe', 'po unieważnieniu tozsamosc lokalna wyczyszczona');
  ok(toasts.some(t => /unieważniona na zawsze/.test(t)), 'toast potwierdzenia unieważnienia');
  // Wariant A: nick uniewazniony nie wraca do puli.
  el('id-nick').value = 'duch';
  await el('id-btn-create').onclick();
  ok(/unieważniony/.test(el('id-create-err').textContent)
     && el('identity-status').textContent === 'pliki będą anonimowe',
     'wariant A: ponowna rejestracja unieważnionego nicku odmowiona');
}

async function _identityActiveStill(api2) { return api2._identityActive(); }

console.log('');
console.log('WYNIK: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('WYJATEK HARNESSA:', e); process.exit(1); });
