// Harness — straznik tagow arcow w CHANGELOG.md (lekcja z audytu Arc 30:
// wpisy v1.45.0/1/2 dostaly tagi (Arc 20/21/22) zamiast (Arc 27/28/29) —
// cofniecie numeracji + duplikat z v1.44.1; zlapane recznym audytem diffow).
// Pinuje: zgodnosc par wersja→arc, unikalnosc i monotonicznosc tagow,
// obecnosc tagu przy najnowszej wersji i jej synchronie z APP_VERSION.
// Uruchamianie z katalogu repo. Przy nowej wersji: dopisz pare do PIN_MAP.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CHANGELOG = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── naglowki wersji z tagiem w formacie scislym „(Arc N)" ─────────────────
// Format swobodny (np. „Arc 21/22" w tekscie v1.44.2) NIE jest pinowany —
// straznik pilnuje tylko formatu scislego, zeby nie krzywdzic starych wpisow.
const HEAD_RE = /^## (v\d+\.\d+\.\d+) — .*\(Arc (\d+)\)\s*$/gm;
const tagged = [];
for (const m of CHANGELOG.matchAll(HEAD_RE)) tagged.push({ ver: m[1], arc: +m[2] });

// ── PIN_MAP: wersja → arc (zrodlo prawdy: wpisy arcow w handoffie) ────────
const PIN_MAP = {
  'v1.43.2': 12, 'v1.43.3': 13, 'v1.43.5': 14, 'v1.43.6': 15, 'v1.43.7': 16,
  'v1.44.0': 19, 'v1.44.1': 20,
  'v1.45.0': 27, 'v1.45.1': 28, 'v1.45.2': 29, 'v1.45.3': 31, 'v1.46.0': 31,
  'v1.46.1': 31, 'v1.47.0': 31, 'v1.47.1': 31, 'v1.48.0': 31, 'v1.48.1': 31, 'v1.48.2': 31, 'v1.48.3': 31,
  'v1.48.4': 32,
  'v1.49.0': 32,
  'v1.49.1': 32,
  'v1.49.2': 32,
  'v1.49.3': 33,
  'v1.49.4': 34,
  'v1.49.5': 35,
  'v1.49.6': 36, 'v1.49.7': 37,
  'v1.50.0': 38,
  'v1.50.1': 39,
  'v1.50.2': 40,
  'v1.50.3': 41,
  'v1.51.0': 42, 'v1.52.0': 43, 'v1.52.1': 44, 'v1.52.2': 45,
};

ok(tagged.length >= Object.keys(PIN_MAP).length,
   'ekstrakcja: znaleziono ' + tagged.length + ' naglowkow z tagiem (Arc N) (sanity >= ' + Object.keys(PIN_MAP).length + ')');

// A2: kazda para z PIN_MAP wystepuje dokladnie tak w CHANGELOGU
for (const [ver, arc] of Object.entries(PIN_MAP)) {
  const hit = tagged.find(t => t.ver === ver);
  ok(hit && hit.arc === arc,
     'para ' + ver + ' → (Arc ' + arc + ')' + (hit ? (hit.arc === arc ? '' : ' — JEST (Arc ' + hit.arc + ')!') : ' — BRAK TAGU!'));
}

// A3: unikalnosc tagow wsrod naglowkow w formacie scislym (duplikat = blad F1).
// WYJATEK (Arc 31, v1.46.0): arc wielowersyjny — kilka wersji MOZE dzielic tag,
// ale tylko gdy WSZYSTKIE sa zadeklarowane w PIN_MAP z tym samym arcem
// (niezadeklarowany duplikat = nadal blad; chroni przed historycznym F1).
{
  const byArc = new Map();
  for (const t of tagged) { if (!byArc.has(t.arc)) byArc.set(t.arc, []); byArc.get(t.arc).push(t.ver); }
  let dup = null;
  for (const [arc, vers] of byArc) {
    if (vers.length < 2) continue;
    const undeclared = vers.filter(v => PIN_MAP[v] !== arc);
    if (undeclared.length) { dup = '(Arc ' + arc + '): ' + vers.join(' i ') + ' — niezadeklarowane w PIN_MAP: ' + undeclared.join(', '); break; }
  }
  ok(!dup, 'unikalnosc tagow arcow (duplikat tylko z deklaracja w PIN_MAP)' + (dup ? ' — DUPLIKAT ' + dup : ''));
}

// A4: monotonicznosc — tagi NIE MALEJA wraz z numerem wersji (cofniecie = blad
// F1); rowny tag dozwolony tylko przy arcu wielowersyjnym (pilnuje A3).
{
  const semver = v => v.slice(1).split('.').map(Number);
  const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] - y[i]; } return 0; };
  const sorted = tagged.slice().sort((a, b) => cmp(a.ver, b.ver));
  let inv = null;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].arc < sorted[i - 1].arc) { inv = sorted[i - 1].ver + ' (Arc ' + sorted[i - 1].arc + ') → ' + sorted[i].ver + ' (Arc ' + sorted[i].arc + ')'; break; }
  }
  ok(!inv, 'monotonicznosc: tagi nie maleja z numerem wersji' + (inv ? ' — COFNIECIE ' + inv : ''));
}

// A5: najnowszy wpis (pierwszy naglowek ## v w pliku) ma tag scisly i jest w PIN_MAP
const firstM = CHANGELOG.match(/^## (v\d+\.\d+\.\d+) — /m);
ok(!!firstM, 'najnowszy naglowek wersji istnieje');
const newestVer = firstM ? firstM[1] : null;
const newestTagged = tagged.find(t => t.ver === newestVer);
ok(!!newestTagged, 'najnowsza wersja ' + newestVer + ' ma tag (Arc N) w formacie scislym');
ok(newestVer in PIN_MAP, 'najnowsza wersja ' + newestVer + ' jest w PIN_MAP (dopisz pare przy nowej wersji!)');

// A6: synchron z APP_VERSION w arkmap_studio.html
const appM = HTML.match(/const APP_VERSION = '(v\d+\.\d+\.\d+)';/);
ok(!!appM, 'APP_VERSION znaleziona w arkmap_studio.html');
ok(appM && appM[1] === newestVer,
   'APP_VERSION ' + (appM && appM[1]) + ' == najnowsza wersja w CHANGELOGU ' + newestVer);

console.log('');
console.log('changelog_tags: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
