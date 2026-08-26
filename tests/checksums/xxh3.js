// xxh3.js — czysty JS (BigInt) port XXH3-64, seed 0, wg referencji v0.8.3.
// ZAMROZONA REFERENCJA (od Arc 37): produkcyjny blok ====XXH3-64==== w
// arkmap_studio.html ma rdzen na parach u32 (szybszy, bajtowo identyczny).
// Ta kopie BigInt weryfikuje: xxh3_golden.js (wektory) oraz
// xxh3_fuzz_equiv.js (fuzz rownowaznosci app vs ta referencja).
'use strict';

const XXH3_SECRET = Uint8Array.from([
  0xb8, 0xfe, 0x6c, 0x39, 0x23, 0xa4, 0x4b, 0xbe, 0x7c, 0x01, 0x81, 0x2c, 0xf7, 0x21, 0xad, 0x1c,
  0xde, 0xd4, 0x6d, 0xe9, 0x83, 0x90, 0x97, 0xdb, 0x72, 0x40, 0xa4, 0xa4, 0xb7, 0xb3, 0x67, 0x1f,
  0xcb, 0x79, 0xe6, 0x4e, 0xcc, 0xc0, 0xe5, 0x78, 0x82, 0x5a, 0xd0, 0x7d, 0xcc, 0xff, 0x72, 0x21,
  0xb8, 0x08, 0x46, 0x74, 0xf7, 0x43, 0x24, 0x8e, 0xe0, 0x35, 0x90, 0xe6, 0x81, 0x3a, 0x26, 0x4c,
  0x3c, 0x28, 0x52, 0xbb, 0x91, 0xc3, 0x00, 0xcb, 0x88, 0xd0, 0x65, 0x8b, 0x1b, 0x53, 0x2e, 0xa3,
  0x71, 0x64, 0x48, 0x97, 0xa2, 0x0d, 0xf9, 0x4e, 0x38, 0x19, 0xef, 0x46, 0xa9, 0xde, 0xac, 0xd8,
  0xa8, 0xfa, 0x76, 0x3f, 0xe3, 0x9c, 0x34, 0x3f, 0xf9, 0xdc, 0xbb, 0xc7, 0xc7, 0x0b, 0x4f, 0x1d,
  0x8a, 0x51, 0xe0, 0x4b, 0xcd, 0xb4, 0x59, 0x31, 0xc8, 0x9f, 0x7e, 0xc9, 0xd9, 0x78, 0x73, 0x64,
  0xea, 0xc5, 0xac, 0x83, 0x34, 0xd3, 0xeb, 0xc3, 0xc5, 0x81, 0xa0, 0xff, 0xfa, 0x13, 0x63, 0xeb,
  0x17, 0x0d, 0xdd, 0x51, 0xb7, 0xf0, 0xda, 0x49, 0xd3, 0x16, 0x55, 0x26, 0x29, 0xd4, 0x68, 0x9e,
  0x2b, 0x16, 0xbe, 0x58, 0x7d, 0x47, 0xa1, 0xfc, 0x8f, 0xf8, 0xb8, 0xd1, 0x7a, 0xd0, 0x31, 0xce,
  0x45, 0xcb, 0x3a, 0x8f, 0x95, 0x16, 0x04, 0x28, 0xaf, 0xd7, 0xfb, 0xca, 0xbb, 0x4b, 0x40, 0x7e,
]);

const _M64 = (1n << 64n) - 1n;
const _P64_1 = 0x9E3779B185EBCA87n, _P64_2 = 0xC2B2AE3D27D4EB4Fn;
const _P64_3 = 0x165667B19E3779F9n, _P64_4 = 0x85EBCA77C2B2AE63n;
const _P64_5 = 0x27D4EB2F165667C5n;
const _P32_1 = 0x9E3779B1n, _P32_2 = 0x85EBCA77n, _P32_3 = 0xC2B2AE3Dn;
const _MX1 = 0x165667919E3779F9n, _MX2 = 0x9FB21C651E98DF25n;

function _r32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function _r64(b, o) {
  return (BigInt(_r32(b, o + 4)) << 32n) | BigInt(_r32(b, o));
}
function _swap64(x) {
  x &= _M64;
  return (((x & 0xFFn) << 56n) | ((x & 0xFF00n) << 40n) |
          ((x & 0xFF0000n) << 24n) | ((x & 0xFF000000n) << 8n) |
          ((x >> 8n) & 0xFF000000n) | ((x >> 24n) & 0xFF0000n) |
          ((x >> 40n) & 0xFF00n) | ((x >> 56n) & 0xFFn));
}
function _rotl64(x, r) {
  x &= _M64;
  return ((x << BigInt(r)) | (x >> BigInt(64 - r))) & _M64;
}
function _mul128fold64(a, b) {
  const p = (a & _M64) * (b & _M64);
  return ((p & _M64) ^ (p >> 64n)) & _M64;
}
function _avalanche(h) {
  h = (h ^ (h >> 37n)) & _M64;
  h = (h * _MX1) & _M64;
  h = (h ^ (h >> 32n)) & _M64;
  return h;
}
function _avalanche64(h) {
  h = (h ^ (h >> 33n)) & _M64;
  h = (h * _P64_2) & _M64;
  h = (h ^ (h >> 29n)) & _M64;
  h = (h * _P64_3) & _M64;
  h = (h ^ (h >> 32n)) & _M64;
  return h;
}
function _rrmxmx(h, len) {
  h &= _M64;
  h = (h ^ _rotl64(h, 49) ^ _rotl64(h, 24)) & _M64;
  h = (h * _MX2) & _M64;
  h = (h ^ ((h >> 35n) + BigInt(len))) & _M64;
  h = (h * _MX2) & _M64;
  h = (h ^ (h >> 28n)) & _M64;
  return h;
}
function _mix16B(input, ioff, soff) {
  const lo = _r64(input, ioff) ^ _r64(XXH3_SECRET, soff);
  const hi = _r64(input, ioff + 8) ^ _r64(XXH3_SECRET, soff + 8);
  return _mul128fold64(lo, hi);
}

function _len0to16(input, len) {
  if (len > 8) {
    const bitflip1 = _r64(XXH3_SECRET, 24) ^ _r64(XXH3_SECRET, 32);
    const bitflip2 = _r64(XXH3_SECRET, 40) ^ _r64(XXH3_SECRET, 48);
    const lo = _r64(input, 0) ^ bitflip1;
    const hi = _r64(input, len - 8) ^ bitflip2;
    const acc = (BigInt(len) + _swap64(lo) + hi + _mul128fold64(lo, hi)) & _M64;
    return _avalanche(acc);
  }
  if (len >= 4) {
    const input1 = _r32(input, 0), input2 = _r32(input, len - 4);
    const bitflip = (_r64(XXH3_SECRET, 8) ^ _r64(XXH3_SECRET, 16)) & _M64;
    const input64 = (BigInt(input2) + (BigInt(input1) << 32n)) & _M64;
    return _rrmxmx(input64 ^ bitflip, len);
  }
  if (len) {
    const c1 = input[0], c2 = input[len >> 1], c3 = input[len - 1];
    const combined = ((c1 << 16) | (c2 << 24) | c3 | (len << 8)) >>> 0;
    const bitflip = BigInt((_r32(XXH3_SECRET, 0) ^ _r32(XXH3_SECRET, 4)) >>> 0);
    return _avalanche64(BigInt(combined) ^ bitflip);
  }
  return _avalanche64(_r64(XXH3_SECRET, 56) ^ _r64(XXH3_SECRET, 64));
}

function _len17to128(input, len) {
  let acc = (BigInt(len) * _P64_1) & _M64;
  if (len > 32) {
    if (len > 64) {
      if (len > 96) {
        acc = (acc + _mix16B(input, 48, 96) + _mix16B(input, len - 64, 112)) & _M64;
      }
      acc = (acc + _mix16B(input, 32, 64) + _mix16B(input, len - 48, 80)) & _M64;
    }
    acc = (acc + _mix16B(input, 16, 32) + _mix16B(input, len - 32, 48)) & _M64;
  }
  acc = (acc + _mix16B(input, 0, 0) + _mix16B(input, len - 16, 16)) & _M64;
  return _avalanche(acc);
}

function _len129to240(input, len) {
  const nbRounds = Math.floor(len / 16);
  let acc = (BigInt(len) * _P64_1) & _M64;
  for (let i = 0; i < 8; i++) {
    acc = (acc + _mix16B(input, 16 * i, 16 * i)) & _M64;
  }
  let accEnd = _mix16B(input, len - 16, 136 - 17);
  acc = _avalanche(acc);
  for (let i = 8; i < nbRounds; i++) {
    accEnd = (accEnd + _mix16B(input, 16 * i, 16 * (i - 8) + 3)) & _M64;
  }
  return _avalanche((acc + accEnd) & _M64);
}

function _accumulate512(acc, input, ioff, soff) {
  for (let lane = 0; lane < 8; lane++) {
    const dataVal = _r64(input, ioff + lane * 8);
    const dataKey = dataVal ^ _r64(XXH3_SECRET, soff + lane * 8);
    acc[lane ^ 1] = (acc[lane ^ 1] + dataVal) & _M64;
    acc[lane] = (acc[lane] + ((dataKey & 0xFFFFFFFFn) * (dataKey >> 32n))) & _M64;
  }
}
function _scramble(acc, soff) {
  for (let lane = 0; lane < 8; lane++) {
    let a = acc[lane];
    a = (a ^ (a >> 47n)) & _M64;
    a = (a ^ _r64(XXH3_SECRET, soff + lane * 8)) & _M64;
    acc[lane] = (a * _P32_1) & _M64;
  }
}
function _hashLong(input, len) {
  const acc = [_P32_3, _P64_1, _P64_2, _P64_3, _P64_4, _P32_2, _P64_5, _P32_1];
  const nbStripesPerBlock = (192 - 64) / 8;           // 16
  const blockLen = 64 * nbStripesPerBlock;            // 1024
  const nbBlocks = Math.floor((len - 1) / blockLen);
  for (let n = 0; n < nbBlocks; n++) {
    const base = n * blockLen;
    for (let s = 0; s < nbStripesPerBlock; s++) {
      _accumulate512(acc, input, base + s * 64, s * 8);
    }
    _scramble(acc, 192 - 64);
  }
  const base = nbBlocks * blockLen;
  const nbStripes = Math.floor(((len - 1) - base) / 64);
  for (let s = 0; s < nbStripes; s++) {
    _accumulate512(acc, input, base + s * 64, s * 8);
  }
  _accumulate512(acc, input, len - 64, 192 - 64 - 7); // LASTACC_START = 7
  let result = (BigInt(len) * _P64_1) & _M64;
  for (let i = 0; i < 4; i++) {
    const mix = _mul128fold64(acc[2 * i] ^ _r64(XXH3_SECRET, 11 + 16 * i),
                              acc[2 * i + 1] ^ _r64(XXH3_SECRET, 11 + 16 * i + 8));
    result = (result + mix) & _M64;
  }
  return _avalanche(result);
}

// Główne API: bytes (Uint8Array) -> BigInt (unsigned 64-bit)
function xxh3_64(bytes) {
  const len = bytes.length;
  if (len <= 16) return _len0to16(bytes, len);
  if (len <= 128) return _len17to128(bytes, len);
  if (len <= 240) return _len129to240(bytes, len);
  return _hashLong(bytes, len);
}

function xxh3_64hex(bytes) {
  return xxh3_64(bytes).toString(16).padStart(16, '0');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { xxh3_64, xxh3_64hex, XXH3_SECRET };
}
