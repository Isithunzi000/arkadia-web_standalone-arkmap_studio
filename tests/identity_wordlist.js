// Harness — identity_wordlist: pin D8 (tozsamosc autora kalki, spec .arkdelta §9).
// - słownik 2048 słów: charset a-z, dlugosc >= 4, unikalne prefiksy 4-literowe,
//   zamrożony SHA-256; straznik anty-wulgaryzmow wylacznie na SKROTACH SHA-256
//   (w repo nie ma zakazanych ciagow — tylko ich skroty);
// - Ed25519: wektory RFC 8032 dla fallbacku BigInt + cross-weryfikacja
//   podpisu WebCrypto fallbackiem;
// - PBKDF2-SHA256 (600k iteracji, sol "arkmap-identity-v1:"+nick NFC) → seed
//   → klucze → author_id → litery kontrolne: wektory zamrozone;
// - kod odzyskiwania: round-trip, obie formy zapisu liter (LLL i L-L-L),
//   tolerancja separatorow/wielkosci liter, NFC, bledy po polsku;
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
  ' _identityGenWords, _identityChecksumLetters, _identityValidateNick, _identityParseCode,' +
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
  const nick = 'Zbyszek';
  const words = ['abecadlo', 'adept', 'adwokat', 'agawa', 'agrafka', 'agregat'];
  ok(M._IDENTITY_PBKDF2_ITER === 600000, 'PBKDF2: 600 000 iteracji (OWASP 2023)');
  ok(M._IDENTITY_SALT_PREFIX === 'arkmap-identity-v1:', 'sol PBKDF2: prefiks wersji + nick');
  ok(M._IDENTITY_NICK_MAX === 32, 'maks. dlugosc nicku = 32');
  const seed = await M._identityDeriveSeed(nick, words);
  ok(M._identityHex(seed) === '4082c8ed3be3682a4535af1f8cc18816d122becda905db771d9c2076435fa656',
     'seed z PBKDF2 (nick+slowa) — zamrozony');
  const keys = await M._identityKeysFromSeed(seed);
  ok(M._identityHex(keys.pubBytes) === '744fa8498b3974b277f66112ea9a25a2c8a9774497e2a1934570bcc467e07c7d',
     'klucz publiczny — zamrozony');
  ok((await M._identityAuthorId(keys.pubBytes)) === 'efb8e5c9678554c4',
     'author_id = pierwsze 16 hex SHA-256(pub) — zamrozone');
  ok((await M._identityChecksumLetters(nick, words)) === 'hwo', 'litery kontrolne kodu — zamrozone');
  const sig = await keys.sign(new TextEncoder().encode('arkdelta-v3:' + 'a'.repeat(16)));
  ok(M._identityHex(sig) === '38a86cc948dd61d44a45fc98a2fed1a73760fbccfe0f03ebfe4c7dff508646429a78542e412ca404d958114d0ce08ac3562912c9d64dce75c502a5dc4a042d02',
     'podpis "arkdelta-v3:<file>" — deterministyczny (Ed25519 jest deterministyczny)');
  // Cross: podpis sciezki aktywnej (w node: WebCrypto) weryfikowany fallbackiem.
  ok(await M._edVerify(keys.pubBytes, new TextEncoder().encode('arkdelta-v3:' + 'a'.repeat(16)), sig) === true,
     'cross-weryfikacja: podpis WebCrypto weryfikuje fallback BigInt');
  // Ten sam nick, inne slowa → inny klucz; te same slowa, inny nick → inny klucz.
  const s2 = await M._identityDeriveSeed(nick, words.slice().reverse());
  const s3 = await M._identityDeriveSeed('zbyszek', words);
  ok(M._identityHex(s2) !== M._identityHex(seed) && M._identityHex(s3) !== M._identityHex(seed),
     'nick i slowa oba wchodza do derywacji (zmiana dowolnego = inna tozsamosc)');
}

// ═══ T4: kod odzyskiwania — round-trip i tolerancja zapisu ═══
console.log('── T4: kod odzyskiwania ──');
{
  const gen = M._identityGenWords();
  ok(gen.length === 6 && gen.every(w => M._IDENTITY_WORDLIST.includes(w)), 'generator: 6 slow z listy');
  const letters = await M._identityChecksumLetters('Test Nick', gen);
  ok(/^[a-z]{3}$/.test(letters), 'litery kontrolne: 3 znaki a-z');
  const code7 = 'Test Nick:' + gen.join('-') + '-' + letters;
  const code9 = 'Test Nick:' + gen.join('-') + '-' + letters.split('').join('-');
  const p7 = await M._identityParseCode(code7);
  const p9 = await M._identityParseCode(code9);
  ok(p7.nick === 'Test Nick' && p7.words.join('-') === gen.join('-') && p7.letters === letters,
     'round-trip: forma z ...-LLL (7 tokenow)');
  ok(p9.words.join('-') === gen.join('-') && p9.letters === letters, 'round-trip: forma z ...-L-L-L (9 tokenow)');
  const messy = await M._identityParseCode('  Test Nick:' + gen.map(w => w.toUpperCase()).join(' ; ') +
    '  ,  ' + letters.toUpperCase().split('').join('_') + ' ');
  ok(messy.nick === 'Test Nick' && messy.words.join('-') === gen.join('-'),
     'tolerancja: wielkie litery, spacje, przecinki, sredniki, podlogi');
  // Nick z diakrytykami: NFC/NFD rownowazne (normalizacja), spacje w nicku zachowane.
  const nfc = 'Żaba Żółć';
  const nfd = nfc.normalize('NFD');
  const lettersNfc = await M._identityChecksumLetters(nfc, gen);
  const pn = await M._identityParseCode(' ' + nfd + ' :' + gen.join('-') + '-' + lettersNfc);
  ok(pn.nick === nfc, 'nick: diakrytyki i spacje zachowane, NFC/NFD zunifikowane');
}

// ═══ T5: bledy kodu i walidacja nicku (komunikaty po polsku) ═══
console.log('── T5: odmowy i walidacja ──');
{
  const gen = M._identityGenWords();
  const letters = await M._identityChecksumLetters('N', gen);
  const bad = async (c) => { try { await M._identityParseCode(c); return null; } catch (e) { return e.message; } };
  const code = 'N:' + gen.join('-') + '-' + letters;
  const tampered = code.slice(0, -1) + (letters.endsWith('a') ? 'b' : 'a');
  ok(/Litery kontrolne nie pasuj/.test(await bad(tampered) || ''), 'odmowa: przeklamana litera kontrolna');
  ok(/nie pochodzi z listy/.test(await bad('N:nieznanezzz-' + gen.slice(1).join('-') + '-' + letters) || ''),
     'odmowa: slowo spoza listy (z numerem slowa)');
  ok(/6 słów i 3 litery/.test(await bad('N:' + gen.slice(0, 5).join('-') + '-' + letters) || ''),
     'odmowa: zla liczba tokenow');
  ok(/postać/.test(await bad(gen.join('-') + '-' + letters) || ''), 'odmowa: brak dwukropka/nicku');
  ok(/Nick jest wymagany/.test(await bad(':' + gen.join('-') + '-' + letters) || ''), 'odmowa: pusty nick');
  ok(M._identityValidateNick('x'.repeat(33)) !== null, 'odmowa: nick > 32 znaki');
  ok(M._identityValidateNick('a:b') !== null, 'odmowa: dwukropek w nicku');
  ok(M._identityValidateNick('   ') !== null, 'odmowa: sam whitespace');
  ok(M._identityValidateNick('Kapitan Bomba') === null, 'akceptacja: nick ze spacja');
}

// ═══ T6: kontrakt podpisu + create/import ═══
console.log('── T6: kontrakt _identityForSigning + create/import ──');
{
  ok((await M._identityForSigning()) === null, 'brak tozsamosci (brak IndexedDB w node) → null → kalka anonimowa');
  const words = ['abecadlo', 'adept', 'adwokat', 'agawa', 'agrafka', 'agregat'];
  const c = await M._identityCreate('Zbyszek', words);
  ok(c.code === 'Zbyszek:abecadlo-adept-adwokat-agawa-agrafka-agregat-hwo',
     'utworzona tozsamosc: kod odzyskiwania w formacie nick:6 slow-LLL');
  ok(c.rec.authorId === 'efb8e5c9678554c4' && c.rec.pubkeyHex === '744fa8498b3974b277f66112ea9a25a2c8a9774497e2a1934570bcc467e07c7d',
     'rekord: author_id i pubkey zgodne z pinami T3');
  ok(c.rec.words.join('-') === words.join('-') && typeof c.rec.seedB64 === 'string',
     'rekord przechowuje slowa i seed (przyjeta decyzja D8: kod i tak odtwarza klucz)');
  // Nick w kodzie jest case-sensitive: litery "hwo" licza sie dla "Zbyszek",
  // wiec kod z "zbyszek" musi byc odrzucony (zmiana nicku = inna tozsamosc).
  let threw = false;
  try { await M._identityImport('zbyszek:ABECADLO adept;adwokat agawa,agrafka_agregat-HWO'); }
  catch (e) { threw = /Litery kontrolne nie pasuj/.test(e.message); }
  ok(threw, 'odmowa: kod z nickiem w innej wielkosci liter (nick case-sensitive)');
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
