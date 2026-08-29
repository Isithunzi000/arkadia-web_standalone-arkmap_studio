// Harness — identity_dialog: pin UI tozsamosci (D8, faza 5c).
// Przycisk nad polem wczytywania, dialog ze stanami brak/aktywna, akcje
// Utworz/Importuj/Pokaz kod/Wyczysc (dwuklik), status w sidebarze, XSS-escape.
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
  const iTitle = HTML.indexOf('<div class="sb-section-title">Wczytaj</div>');
  const iBtn = HTML.indexOf('id="btn-identity"');
  const iStatus = HTML.indexOf('id="identity-status"');
  const iDrop = HTML.indexOf('id="drop-zone"');
  ok(iTitle >= 0 && iBtn > iTitle && iStatus > iBtn && iDrop > iStatus,
     'przycisk "Tożsamość autora" + status nad polem wczytywania (drop-zone)');
  ok(HTML.includes('id="dlg-identity"') && HTML.includes('id="identity-body"'), 'dialog dlg-identity z body');
}

// ── mini-DOM + IndexedDB (in-memory) ─────────────────────────────
const registry = new Map();
function makeEl(id) {
  const el = {
    id, textContent: '', value: '', disabled: false, dataset: {}, style: {},
    onclick: null, _html: '',
    addEventListener(ev, f) { el['on' + ev] = f; },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = v; for (const m of String(v).matchAll(/id="([\w-]+)"/g)) reg(m[1]); },
  });
  return el;
}
function reg(id) { if (!registry.has(id)) registry.set(id, makeEl(id)); return registry.get(id); }
const documentStub = { getElementById: (id) => reg(id) };
const toasts = [];
const opened = [];
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  ok(el('identity-status').textContent === 'kalka będzie anonimowa', 'status: kalka anonimowa');
  ok(el('identity-body')._html.includes('Utwórz tożsamość') && el('identity-body')._html.includes('Importuj tożsamość'),
     'dialog: formularze utworz/import');
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
  el('id-nick').value = 'Zbyszek';
  await el('id-btn-create').onclick();
  const stTxt = el('identity-status').textContent;
  ok(/^🪪 Zbyszek · [0-9a-f]{16}$/.test(stTxt), 'status: nick + 16-hex identyfikatora');
  globalThis.__authorId = stTxt.slice(-16);
  ok(el('identity-body')._html.includes('Autor:') && el('identity-body')._html.includes('odcisk klucza'),
     'dialog: stan aktywny (autor + odcisk klucza)');
  const codeHtml = el('id-code-out')._html;
  const m = codeHtml.match(/Zbyszek:([a-z]+-){5}[a-z]+-[a-z]{3}/);
  ok(!!m, 'kod odzyskiwania pokazany od razu po utworzeniu (format nick:6 slow-LLL)');
  globalThis.__code = m && m[0];
  ok(toasts.some(t => /Tożsamość utworzona/.test(t)), 'toast potwierdzenia');
}

// ── T4: pokaz kod na zyczenie + wyczysc (dwuklik) ──
console.log('── T4: pokaz kod / wyczysc ──');
{
  el('id-code-out')._html = '';
  await el('id-btn-show').onclick();
  ok(el('id-code-out')._html.includes(globalThis.__code), 'pokaz kod: ten sam kod co przy tworzeniu');
  await el('id-btn-clear').onclick();  // pierwszy klik = uzbrojenie
  ok(el('id-btn-clear').textContent.includes('Na pewno') && (await _identityActiveStill(api)) !== null,
     'wyczysc: pierwszy klik pyta ponownie, tozsamosc nadal aktywna');
  await el('id-btn-clear').onclick();  // drugi klik = kasowanie
  ok(el('identity-status').textContent === 'kalka będzie anonimowa' && _idbData.size === 0,
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
  ok(el('identity-status').textContent === '🪪 Zbyszek · ' + globalThis.__authorId,
     'import kodem odtwarza IDENTYCZNA tozsamosc (ten sam identyfikator)');
  ok(toasts.some(t => /zaimportowana/.test(t)), 'toast importu');
}

// ── T6: XSS-escape nicku ──
console.log('── T6: XSS-escape ──');
{
  await el('id-btn-clear').onclick(); await el('id-btn-clear').onclick();
  await tick();
  el('id-nick').value = '<img src=x>';
  await el('id-btn-create').onclick();
  const html = el('identity-body')._html;
  ok(html.includes('&lt;img src=x&gt;') && !html.includes('<img src=x>'), 'nick z HTML escapowany w dialogu');
  ok(el('identity-status').textContent.includes('<img src=x>'), 'status (textContent) bez parsowania HTML');
  await el('id-btn-clear').onclick(); await el('id-btn-clear').onclick();
}

async function _identityActiveStill(api2) { return api2._identityActive(); }

console.log('');
console.log('WYNIK: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('WYJATEK HARNESSA:', e); process.exit(1); });
