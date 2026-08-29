// Harness — identity_wordlist: pin D8 (tozsamosc autora kalki, spec .arkdelta §9).
// - słownik 2048 słów: charset a-z, dlugosc >= 4, unikalne prefiksy 4-literowe,
//   zamrożony SHA-256; straznik anty-wulgaryzmow wylacznie na SKROTACH SHA-256
//   (w repo nie ma zakazanych ciagow — tylko ich skroty);
// - Ed25519: wektory RFC 8032 dla fallbacku BigInt + cross-weryfikacja
//   podpisu WebCrypto fallbackiem;
// - PBKDF2-SHA256 (600k iteracji, sol "arkmap-identity-v1:"+nick NFC) → seed
//   → klucze → author_id → litery kontrolne: wektory zamrozone;
// - kod odzyskiwania: 3..6 slow (domyslnie 3), round-trip, obie formy zapisu
//   liter (LLL i L-L-L), rozstrzyganie niejednoznacznosci literami kontrolnymi,
//   tolerancja separatorow/wielkosci liter, bledy po polsku;
// - nick: kanonikalizacja trim+lowercase, charset [a-z0-9] (bez PL znakow),
//   wielkosc liter bez znaczenia takze w soli PBKDF2 i literach kontrolnych;
// - kontrakt _identityForSigning (null bez tozsamosci).
// Uruchamianie z katalogu głównego repo: node tests/identity_wordlist.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

const i0 = HTML.indexOf('// ====IDENTITY-V1-BEGIN====');
const i1 = HTML.indexOf('// ====IDENTITY-V1-END====');
if (i0 < 0 || i1 < 0 || i1 <= i0) throw new Error('brak markrow IDENTITY-V1 w arkmap_studio.html');
const identCode = HTML.slice(i0, i1) +
  '\n;return { _IDENTITY_WORDLIST, _IDENTITY_PBKDF2_ITER, _IDENTITY_SALT_PREFIX, _IDENTITY_NICK_MAX,' +
  ' _IDENTITY_WORDS_MIN, _IDENTITY_WORDS_MAX, _IDENTITY_WORDS_DEFAULT,' +
  ' _identityGenWords, _identityChecksumLetters, _identityValidateNick, _identityCanonNick, _identityParseCode,' +
  ' _identityDeriveSeed, _identityHex, _identityFromHex, _identityAuthorId,' +
  ' _edPubFromSeed, _edSign, _edVerify, _identityKeysFromSeed, _identityForSigning,' +
  ' _identityCreate, _identityImport, _identityShowCode };';
const M = new Function(identCode)();

const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

// Skroty SHA-256 zakazanych ciagow (wulgaryzmy/insulty PL+EN). Polityka repo:
// zakazane ciagi NIGDY nie lądują w plikach — strażnik trzyma tylko skroty.
const BANNED_SHA256 = [
  'bfadc39843ffaf07b62b26a3ce5cebba40c7d410ae368457122c89b5af15d23a',
  '2309acb4a88359a4ba3c164006ca607da331dec15468f9f2645bb21436b44d90',
  '0ca7dfd364c6b744445778269e122a268b9dcef659846d8e8dba32cc560315ca',
  '8c6fbdaf2ab0e2e630e5d7dcd22abd782ed9435da4b12dc3f3bdb0377718abc2',
  '60a5d3e4100fe8afa5ee0103739a45711d50d7f3ba7280d8a95b51f5d04aa4b8',
  '5d44cf400218912991efe043c8e22605d5d12d6fc78c27b79a54b0f7c9dca693',
  '2e345c3013ac013ab40be05155e58ab8ef641ded27d3ce825b58de2cdca484dc',
  '5259abbeddb35f2d9ca5e783791aedbf04492d45ec2acd7619b07fdff401649b',
  '49023b07adfefcdc58a8e723ced649d66457657b2fa31d1a8e0f2015f23242c2',
  '380a289e31e8981676ccb8cf89b2471155f67325352ca3b9c4fb531cd5fc39e9',
  '6ac3c336e4094835293a3fed8a4b5fedde1b5e2626d9838fed50693bba00af0e',
  '85fc17f7069acd39a5c636cd0a6530651096128da447959f5e250824857dc559',
  'd75a838dc758ba17f28bd8dbac605cb70c35465263d5733164521de2f7ef7926',
  '566f532d486c947709d3d0e6b7575af8380248db66dada211d58eb00ad585297',
  '9ae315a94e428a7ee3b5e48adae6541965d93b86acf10ffa1c45b93b6fe577b4',
  '120f6e5b4ea32f65bda68452fcfaaef06b0136e1d0e4a6f60bc3771fa0936dd6',
  'cff015bf8df88e13664cb1458fb2126b27368cc7864fce74881976a7448641a0',
  '1e3466f69607e122d0afd06af42e0c4e8a0ee248eec14172d03da3f389db1157',
  '1c75903328ae069246cad10879676634b1ce0b053dd0749fe3e3187c4c59d6f4',
  '23b28309fdd9d3f3563a5393fcf1541178eb4711c21e07076da09c1cac4f8b2c',
  '48e6fabbf3d15667b7a446f44a1b1b8f87d04a60cf313d6123d2cddba1a08994',
  'b88897ee7f0cbf479f3804dcb49643650dacf2fed9621710492a7629cd6e3a36',
  '7c795b67bb6043458b48110df8b32a3174e8f181f47af317b67169acd517f4ac',
  '5953a824eb25859ede2c13acce92616cb1c2ed2b1fa4e9a1e3cbfa21bb1dec86',
  '08ad48cd9bab9959d4416184b3059eb074f9488178db571f5864c8bed134ed5d',
  'b0ab202686c645b67c3d0e85cd97a60e091743040377a1fb439dfe928a1ec2f6',
  '4bb2d2d7f23cc25955315d7067dd5d7b651f64e3304fd57130b20c36547f5997',
  '0cc4d7f03c3cecf0f1e6c1d916a1979d9093c8c5d4b8bf62c358df0b38a58fba',
  'a6cd62880770e478953804c71798336854136229cc54f13ceff7ac470c7e5551',
  '1f414e661220a0b8c8aa17795eb0b63fadb3669f9c2035ac5f2ce73092e25bb3',
  '9307fbb79bfdfa845ddd163ab36472afd4d7a6211f55251fa575f45045b4de7e',
  'e4953173f5e09aed23d4dd7e08c68a496d8e8eb55d3d666037c64781f2b5e1bd',
  '5597a2ea872ba226dc02e9bbfbaa6f0d572f98df60f604d81b95fcbb11a844f0',
  'a7facebc832b6f14ec2fa4ca71beabda7d5ed21fe6c4e066ab6871b844ded068',
  '7fc8abd5ea0e7b40f0ebe879178fae3b089c6527465ffd736bcc6ddb2d7fd8b4',
  'ef29422d1d38eff698da2df13a598eadf39d4d67155dc594cca1f161ad45a616',
  'db3bee6c40aaef8dfef73ab035c199c5f077b9357756014cc8bc689a0a46b004',
  '61416246286e2e6a3016c6ac197412bea07881d43b8f2bde9ba31b136009b5ba',
  'fe35d751914522da244e9e84feaefe795de3373b58c002f622e08f924b254b54',
  '6f3571173a30a2dc1ba422b7ee92acb740df610c84609ca2c06e6cd7bdc4c96f'
];

(async () => {

// ═══ T1: słownik — struktura, skrot zamrozenia, straznik anty-wulgaryzmow ═══
console.log('── T1: slownik 2048 slow ──');
{
  const W = M._IDENTITY_WORDLIST;
  ok(Array.isArray(W) && W.length === 2048, 'dokladnie 2048 slow (11 bitow/slowo)');
  ok(W.every(w => /^[a-z]+$/.test(w)), 'charset wylacznie a-z (ASCII, male litery)');
  ok(W.every(w => w.length >= 4 && w.length <= 15), 'dlugosc slow 4..15');
  ok(W.join(' ') === W.slice().sort().join(' '), 'lista alfabetyczna');
  const pref = new Set(W.map(w => w.slice(0, 4)));
  ok(pref.size === 2048, 'unikalne prefiksy 4-literowe (odczyt z 4 znakow)');
  ok(new Set(W).size === 2048, 'brak duplikatow');
  // Pin zamrozenia: SHA-256 z dokladnego literalu (slowa zlaczone spacja),
  // tak jak siedzi w arkmap_studio.html.
  ok(sha256(W.join(' ')) === 'fcd3909ee555c27f43104840186635309fe2f08f970c1af271dfc9c6438579f4',
     'SHA-256 listy zamrozone (zmiana listy = zmiana kodu odzyskiwania = nowa wersja formatu)');
  const wordHashes = new Set(W.map(sha256));
  ok(!BANNED_SHA256.some(h => wordHashes.has(h)), 'straznik: zadne zakazane slowo nie wchodzi do listy');
  ok(Object.isFrozen(M._IDENTITY_WORDLIST), 'lista slow zamrozona w runtime (Object.freeze)');
}

// ═══ T2: Ed25519 fallback BigInt — wektory RFC 8032 ═══
console.log('── T2: Ed25519 (fallback BigInt) — RFC 8032 ──');
{
  const seed = M._identityFromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
  const pub = await M._edPubFromSeed(seed);
  ok(M._identityHex(pub) === 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
     'RFC 8032 TEST 1: klucz publiczny z seeda');
  const sig = await M._edSign(seed, pub, new Uint8Array(0));
  ok(M._identityHex(sig) === 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
     'RFC 8032 TEST 1: podpis pustej wiadomosci');
  ok(await M._edVerify(pub, new Uint8Array(0), sig) === true, 'weryfikacja poprawnego podpisu');
  ok(await M._edVerify(pub, new Uint8Array([1]), sig) === false, 'odrzucenie podpisu pod zmieniona wiadomosc');
  const badSig = sig.slice(); badSig[10] ^= 1;
  ok(await M._edVerify(pub, new Uint8Array(0), badSig) === false, 'odrzucenie uszkodzonego podpisu');
  ok(await M._edVerify(pub, new Uint8Array(0), sig.slice(0, 63)) === false, 'odrzucenie podpisu o zlej dlugosci');
}

// ═══ T3: PBKDF2 → klucze → author_id → litery — wektory zamrozone ═══
console.log('── T3: derywacja tozsamosci (piny) ──');
{
  const nick = 'Zbyszek';  // kanonicznie: 'zbyszek' (wielkosc liter bez znaczenia)
  const words = ['abecadlo', 'adept', 'adwokat', 'agawa', 'agrafka', 'agregat'];
  ok(M._IDENTITY_PBKDF2_ITER === 600000, 'PBKDF2: 600 000 iteracji (OWASP 2023)');
  ok(M._IDENTITY_SALT_PREFIX === 'arkmap-identity-v1:', 'sol PBKDF2: prefiks wersji + nick');
  ok(M._IDENTITY_NICK_MAX === 32, 'maks. dlugosc nicku = 32');
  ok(M._IDENTITY_WORDS_MIN === 3 && M._IDENTITY_WORDS_MAX === 6 && M._IDENTITY_WORDS_DEFAULT === 3,
     'liczba slow: 3..6, domyslnie 3 (wygodnie)');
  const seed = await M._identityDeriveSeed(nick, words);
  ok(M._identityHex(seed) === 'fe000ccf204fccbe1e379e5a14f0a01bc82cb95024bdf48e7096d5ee8067010b',
     'seed z PBKDF2 (nick kanoniczny+slowa) — zamrozony');
  const keys = await M._identityKeysFromSeed(seed);
  ok(M._identityHex(keys.pubBytes) === '3eb536ff778dab519cfb3e5b169912d64896f192c1987d070eef7f786da44c3c',
     'klucz publiczny — zamrozony');
  ok((await M._identityAuthorId(keys.pubBytes)) === 'cb4b9b4a5514412d',
     'author_id = pierwsze 16 hex SHA-256(pub) — zamrozone');
  ok((await M._identityChecksumLetters(nick, words)) === 'qnt', 'litery kontrolne kodu (6 slow) — zamrozone');
  ok((await M._identityChecksumLetters(nick, words.slice(0, 3))) === 'vdr',
     'litery kontrolne kodu (3 slowa) — zamrozone');
  const sig = await keys.sign(new TextEncoder().encode('arkdelta-v3:' + 'a'.repeat(16)));
  ok(M._identityHex(sig) === 'ef8d0c8966db8fc1c4a3df15619b606104c8f6a87406214decbbadcfe1c42ce8ea639da2f26ee5fe0a661b8da11ce4fd62032e1d256f02dcf56786a93894df02',
     'podpis "arkdelta-v3:<file>" — deterministyczny (Ed25519 jest deterministyczny)');
  // Cross: podpis sciezki aktywnej (w node: WebCrypto) weryfikowany fallbackiem.
  ok(await M._edVerify(keys.pubBytes, new TextEncoder().encode('arkdelta-v3:' + 'a'.repeat(16)), sig) === true,
     'cross-weryfikacja: podpis WebCrypto weryfikuje fallback BigInt');
  // Ten sam nick, inne slowa → inny klucz; wielkosc liter nicku BEZ ZNACZENIA
  // (kanonikalizacja), ale inny nick → inny klucz.
  const s2 = await M._identityDeriveSeed(nick, words.slice().reverse());
  const s3 = await M._identityDeriveSeed('zbyszek', words);
  const s4 = await M._identityDeriveSeed('zbyszek2', words);
  ok(M._identityHex(s2) !== M._identityHex(seed), 'inne slowa → inna tozsamosc');
  ok(M._identityHex(s3) === M._identityHex(seed), 'wielkosc liter nicku bez znaczenia (ZBYSZEK === zbyszek)');
  ok(M._identityHex(s4) !== M._identityHex(seed), 'inny nick → inna tozsamosc');
}

// ═══ T4: kod odzyskiwania — round-trip i tolerancja zapisu ═══
console.log('── T4: kod odzyskiwania ──');
{
  const gen = M._identityGenWords();
  ok(gen.length === 3 && gen.every(w => M._IDENTITY_WORDLIST.includes(w)), 'generator: domyslnie 3 slowa z listy');
  ok(M._identityGenWords(6).length === 6 && M._identityGenWords(4).length === 4 &&
     M._identityGenWords(5).length === 5, 'generator: parametr 4/5/6 slow');
  ok(M._identityGenWords(2).length === 3 && M._identityGenWords(7).length === 3 &&
     M._identityGenWords(undefined).length === 3,
     'generator: wartosc spoza zakresu → domyslne 3 (fail-safe)');
  // Round-trip dla kazdej liczby slow 3..6, obie formy zapisu liter.
  for (const n of [3, 4, 5, 6]) {
    const w = M._identityGenWords(n);
    const L = await M._identityChecksumLetters('tester', w);
    ok(/^[a-z]{3}$/.test(L), 'litery kontrolne: 3 znaki a-z (n=' + n + ')');
    const pA = await M._identityParseCode('tester:' + w.join('-') + '-' + L);
    const pB = await M._identityParseCode('tester:' + w.join('-') + '-' + L.split('').join('-'));
    ok(pA.words.join('-') === w.join('-') && pA.letters === L, 'round-trip n=' + n + ': forma ...-LLL');
    ok(pB.words.join('-') === w.join('-') && pB.letters === L, 'round-trip n=' + n + ': forma ...-L-L-L');
  }
  // Tolerancja zapisu: wielkie litery (takze w nicku), spacje, przecinki, sredniki, podlogi.
  const w3 = M._identityGenWords(3);
  const L3 = await M._identityChecksumLetters('testnick', w3);
  const messy = await M._identityParseCode('  TestNick:' + w3.map(w => w.toUpperCase()).join(' ; ') +
    '  ,  ' + L3.toUpperCase().split('').join('_') + ' ');
  ok(messy.nick === 'testnick' && messy.words.join('-') === w3.join('-'),
     'tolerancja: wielkie litery (nick+slowa), spacje, przecinki, sredniki, podlogi');
  ok(M._identityCanonNick('  ZbYsZeK ') === 'zbyszek', 'kanonikalizacja nicku: trim + lowercase');
}

// ═══ T5: bledy kodu i walidacja nicku (komunikaty po polsku) ═══
console.log('── T5: odmowy i walidacja ──');
{
  const gen = M._identityGenWords(6);
  const letters = await M._identityChecksumLetters('n', gen);
  const bad = async (c) => { try { await M._identityParseCode(c); return null; } catch (e) { return e.message; } };
  const code = 'n:' + gen.join('-') + '-' + letters;
  const tampered = code.slice(0, -1) + (letters.endsWith('a') ? 'b' : 'a');
  ok(/Litery kontrolne nie pasuj/.test(await bad(tampered) || ''), 'odmowa: przeklamana litera kontrolna');
  ok(/nie pochodzi z listy/.test(await bad('n:nieznanezzz-' + gen.slice(1).join('-') + '-' + letters) || ''),
     'odmowa: slowo spoza listy (z numerem slowa)');
  ok(/3–6 słów/.test(await bad('n:' + gen.slice(0, 2).join('-') + '-' + letters) || ''),
     'odmowa: zla liczba tokenow (za malo slow)');
  ok(/3–6 słów/.test(await bad('n:' + ['abecadlo','adept','adwokat','agawa','agrafka','agregat','agrotkanina'].join('-') + '-' + letters) || ''),
     'odmowa: zla liczba tokenow (7 slow poza zakresem)');
  ok(/postać/.test(await bad(gen.join('-') + '-' + letters) || ''), 'odmowa: brak dwukropka/nicku');
  ok(/za długi/.test(await bad('n:' + 'a'.repeat(5000)) || ''), 'odmowa: kod za dlugi (>4096 znakow)');
  ok(/Nick jest wymagany/.test(await bad(':' + gen.join('-') + '-' + letters) || ''), 'odmowa: pusty nick');
  ok(M._identityValidateNick('x'.repeat(33)) !== null, 'odmowa: nick > 32 znaki');
  ok(M._identityValidateNick('a:b') !== null, 'odmowa: dwukropek w nicku (poza charset)');
  ok(M._identityValidateNick('   ') !== null, 'odmowa: sam whitespace');
  ok(/litery a-z/.test(M._identityValidateNick('Żaba') || ''), 'odmowa: polskie znaki w nicku');
  ok(/litery a-z/.test(M._identityValidateNick('Kapitan Bomba') || ''), 'odmowa: spacja w nicku');
  ok(/litery a-z/.test(M._identityValidateNick('x_y') || ''), 'odmowa: znak specjalny w nicku');
  ok(M._identityValidateNick('kapitan123') === null, 'akceptacja: litery a-z + cyfry');
  // Niejednoznacznosc (6 tokenow: 5+LLL albo 3+L-L-L): w praktyce litery
  // kontrolne rozstrzygaja; gdyby pasowaly OBIE interpretacje — odmowa.
  // Konstrukcja sztuczna nie jest trywialna, wiec pinujemy zachowanie fail-closed
  // na kodzie, ktory ma 6 tokenow i nie pasuje w zadnej interpretacji:
  // 6 tokenow bez liter: zadna interpretacja nie daje 3 liter a-z na koncu
  // (tokeny to slowa >= 4 znakow) → komunikat o formacie.
  const w6 = M._identityGenWords(6);
  ok(/3–6 słów/.test(await bad('n:' + w6.join('-')) || ''),
     'odmowa: 6 slow bez liter kontrolnych (zadna interpretacja)');
}

// ═══ T6: kontrakt podpisu + create/import ═══
console.log('── T6: kontrakt _identityForSigning + create/import ──');
{
  ok((await M._identityForSigning()) === null, 'brak tozsamosci (brak IndexedDB w node) → null → kalka anonimowa');
  const words = ['abecadlo', 'adept', 'adwokat', 'agawa', 'agrafka', 'agregat'];
  const c = await M._identityCreate('Zbyszek', words);
  ok(c.code === 'zbyszek:abecadlo-adept-adwokat-agawa-agrafka-agregat-qnt',
     'utworzona tozsamosc: kod w formacie nick(kanoniczny):6 slow-LLL');
  ok(c.rec.authorId === 'cb4b9b4a5514412d' && c.rec.pubkeyHex === '3eb536ff778dab519cfb3e5b169912d64896f192c1987d070eef7f786da44c3c',
     'rekord: author_id i pubkey zgodne z pinami T3');
  ok(c.rec.nick === 'zbyszek', 'rekord przechowuje nick kanoniczny (lowercase)');
  ok(c.rec.words.join('-') === words.join('-') && typeof c.rec.seedB64 === 'string',
     'rekord przechowuje slowa i seed (przyjeta decyzja D8: kod i tak odtwarza klucz)');
  // Wielkosc liter nicku BEZ ZNACZENIA takze przy imporcie: kod z "ZBYSZEK"
  // daje identyczna tozsamosc (litery kontrolne liczone dla nicku kanonicznego).
  const impCase = await M._identityImport('ZBYSZEK:ABECADLO adept;adwokat agawa,agrafka_agregat-QNT');
  ok(impCase.rec.authorId === c.rec.authorId && impCase.rec.pubkeyHex === c.rec.pubkeyHex,
     'import: kod z nickiem w innej wielkosci liter → identyczna tozsamosc');
  const impSame = await M._identityImport(c.code);
  ok(impSame.rec.authorId === c.rec.authorId && impSame.rec.pubkeyHex === c.rec.pubkeyHex,
     'import tym samym kodem → identyczna tozsamosc (przenosnosc miedzy maszynami)');
  const show = await M._identityShowCode();
  ok(show === null || typeof show === 'string', 'pokaz kod: null bez rekordu w IDB (node), string w przegladarce');
}

console.log('');
console.log('WYNIK: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('WYJATEK HARNESSA:', e); process.exit(1); });
