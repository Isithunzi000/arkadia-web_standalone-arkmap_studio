// Harness — straznik jezyka UI: komunikaty widoczne dla uzytkownika maja byc
// prostym, laickim polskim tekstem (obs 3 z testow recznych: zaden "payload",
// "checksum", "op", "seq", "upstream" w tostach, tooltipach i dialogach).
// Skanuje literaly stringow z polskimi znakami, atrybuty title="..." i
// teksty miedzy znacznikami w statycznym HTML. Uruchamianie z katalogu repo.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// ── ekstrakcja stringow widocznych dla uzytkownika ─────────────────────────
// Literaly wyciagane LINIA PO LINII (bez falszywych trafien przez komentarze
// i kod rozciagajacy sie na wiele linii). Kandydat musi miec polski znak.
const literals = [];
const PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
for (const line of HTML.split('\n')) {
  // 1) literaly JS 'tekst' i "tekst" z polskimi znakami (tosty, dialogi, etykiety)
  for (const m of line.matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (PL.test(m[1])) literals.push(m[1]);
  for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) if (PL.test(m[1])) literals.push(m[1]);
  // 2) tekst miedzy znacznikami w statycznym HTML (przyciski, naglowki)
  for (const m of line.matchAll(/>\s*([^<>{]*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ][^<>{]*)</g)) literals.push(m[1]);
}

ok(literals.length > 200, 'ekstrakcja: zebrano ' + literals.length + ' stringow UI (sanity > 200)');

// ── tokeny zakazane w stringach UI ──────────────────────────────────────────
const BANNED = [
  [/\bpayload\b/i, 'payload'],
  [/\bchecksum/i, 'checksum'],
  [/\bCRC(-32)?\b/, 'CRC'],
  [/\bops_count\b/i, 'ops_count'],
  [/parsowan/i, 'parsowania'],
  [/\bupstream\b/i, 'upstream'],
  [/kałk/i, 'kałka (pisownia: kalka)'],
  [/→\s*meta/, '→ meta'],
  [/\bseq\b/i, 'seq'],
  [/\bop\b(?!is)/i, 'op (zargon: operacja)'],
  [/\bopy\b/i, 'opy'],
  [/op #/, 'op #'],
];
let bannedHits = 0;
for (const s of literals) {
  for (const [re, label] of BANNED) {
    if (re.test(s)) {
      bannedHits++;
      console.log('    ZAKAZANY "' + label + '" w: ' + s.slice(0, 90));
    }
  }
}
ok(bannedHits === 0, 'zero zakazanych tokenow w stringach UI (' + literals.length + ' sprawdzonych)');

// ── globalnie: pisownia "kalka" (nigdy "kałka") w calym pliku ──────────────
ok(!/kałk/i.test(HTML), 'globalnie: zero wystapien "kałk" w pliku');

// ── konkretne komunikaty po polsku laicku ───────────────────────────────────
ok(HTML.includes("toast('✓ Zapisano: ' + fh.name"),
   'toast zapisu: helper saveWithDialog potwierdza nazwa pliku (v1.44.4: lokalne toasty sciezek zapisu usuniete)');
ok(HTML.includes("olIndex.version ? 'v' + olIndex.version : 'wersja nieznana'"),
   'pobieranie online: fallback wersji to "wersja nieznana" (nie "master")');
ok(HTML.includes('Kalka pasuje do wczytanej mapy ('),
   'nota zgodnosci: "Kalka pasuje do wczytanej mapy"');
ok(HTML.includes('Kalka bez informacji o wersji mapy, na której ją zapisano.'),
   'nota zgodnosci: brak wersji bazy po polsku');
ok(HTML.includes('Nie można odczytać pliku — uszkodzony lub to nie jest plik kalki.'),
   'blad odczytu kalki: laicki komunikat');
ok(HTML.includes('numeracja nie jest po kolei'),
   'walidacja kalki: "numeracja nie jest po kolei"');
ok(HTML.includes('Suma kontrolna pliku: OK'),
   'import: "Suma kontrolna pliku: OK" (nie CRC-32)');
ok(HTML.includes('sygnatura'),
   'dialog innej wersji: "sygnatura" zamiast "crc"');
ok(HTML.includes('to operacja usuwania — nie ma czego pokazać'),
   'tost ducha: "to operacja usuwania" (nie "op usuwania")');
ok(!HTML.includes(">Efekt<"), 'przycisk "Efekt" usuniety z UI (jest "Pokaż")');

console.log('');
console.log('ui_strings: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
