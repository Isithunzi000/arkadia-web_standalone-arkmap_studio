#!/usr/bin/env python3
# Generator listy slow kodu odzyskiwania tozsamosci (D8).
# Zrodlo: autorska pula kandydatow w tools/wordlist_candidates.txt (typowe polskie
# rzeczowniki, zapis ASCII), filtrowana maszynowo:
#   - charset wylacznie a-z (male litery, bez znakow diakrytycznych),
#   - dlugosc >= 4,
#   - unikalne prefiksy 4-literowe (przy kolizji wygrywa pierwszy alfabetycznie),
#   - zero wulgaryzmow: pula autorska; straznik hashowy (SHA-256 zakazanych slow)
#     mieszka w tescie tests/identity_wordlist.js — tutaj zadnych zakazanych ciagow.
# Wyjscie: dokladnie 2048 slow, alfabetycznie; na stderr raport + SHA-256 listy (pin).
# Uzycie: python3 tools/build_identity_wordlist.py          -> lista na stdout
import hashlib
import re
import sys
from pathlib import Path

TARGET = 2048
SRC = Path(__file__).with_name('wordlist_candidates.txt')

raw = SRC.read_text(encoding='utf8')
words = []
seen = set()
for tok in re.split(r'\s+', raw):
    if not tok or tok.startswith('#'):
        continue
    if not re.fullmatch(r'[a-z]+', tok):
        sys.stderr.write('POMINIETE (charset): ' + tok + '\n')
        continue
    if len(tok) < 4:
        sys.stderr.write('POMINIETE (dlugosc<4): ' + tok + '\n')
        continue
    if tok in seen:
        sys.stderr.write('POMINIETE (duplikat): ' + tok + '\n')
        continue
    seen.add(tok)
    words.append(tok)

words.sort()
out = []
used_prefix = set()
for w in words:
    p = w[:4]
    if p in used_prefix:
        continue
    used_prefix.add(p)
    out.append(w)

sys.stderr.write('kandydatow: %d, po filtrach: %d\n' % (len(words), len(out)))
if len(out) < TARGET:
    sys.stderr.write('ZA MALO slow: %d < %d — uzupelnij pule kandydatow.\n' % (len(out), TARGET))
    sys.exit(2)
final = out[:TARGET]
blob = '\n'.join(final)
sys.stderr.write('lista: %d slow, SHA-256: %s\n' % (len(final), hashlib.sha256(blob.encode('utf8')).hexdigest()))
print(' '.join(final))
