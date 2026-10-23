// The Diffie-Hellman steps of a private call (R-Y196): the parameters
// check, g_a, g_a_hash, the shared key, its fingerprint and the emoji, with
// fixed vectors made here (RFC 3526 group 14, which Node ships as a safe
// 2048-bit prime with g = 2) and cross-checked against Node's own DH.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  bigOf,
  bytesOf,
  checkDhConfig,
  exponentOf,
  fingerprintOf,
  hashOf,
  isProbablePrime,
  modPow,
  publicInRange,
  publicOf,
  sharedKey,
} from '../src/sources/private-call-dh.js';
import {
  EMOJI_COUNT,
  EMOJI_TABLE,
  EMOJI_TABLE_VERIFIED,
  emojiIndices,
  emojiOf,
} from '../src/sources/private-call-emoji.js';

const group = crypto.getDiffieHellman('modp14');
const CONFIG = { g: group.getGenerator()[0], p: group.getPrime() };

// Fixed secret exponents (256 bytes, big-endian).
const A = bytesOf((1n << 2000n) + 0x1234567890abcdefn);
const B = bytesOf((1n << 2040n) + 0xfedcba0987654321n);

test('modPow and the primality test', () => {
  assert.equal(modPow(4n, 13n, 497n), 445n);
  assert.equal(modPow(2n, 10n, 1000n), 24n);
  assert.equal(isProbablePrime(2n ** 127n - 1n), true);
  assert.equal(isProbablePrime(2n ** 127n + 1n), false);
  assert.equal(isProbablePrime(561n), false); // a Carmichael number
  assert.equal(isProbablePrime(1n), false);
});

test('Telegram-sized parameters are accepted, bad ones refused', () => {
  assert.deepEqual(checkDhConfig(CONFIG), { ok: true });
  // A short p.
  assert.equal(
    checkDhConfig({ g: 2, p: Buffer.from('0b', 'hex') }).reason,
    'size'
  );
  // The right size, not prime (p + 2 of a safe prime is not safe, p - 1 even).
  const even = bytesOf(bigOf(CONFIG.p) - 1n);
  assert.notEqual(checkDhConfig({ g: 2, p: even }).ok, true);
  // A generator that does not fit this p.
  assert.equal(checkDhConfig({ g: 1, p: CONFIG.p }).reason, 'generator');
  assert.equal(checkDhConfig({ g: 9, p: CONFIG.p }).reason, 'generator');
});

test('g_a and g_b are g^x mod p (checked against Node)', () => {
  const ga = publicOf(CONFIG, bigOf(A));
  const node = crypto.createDiffieHellman(CONFIG.p, CONFIG.g);
  node.setPrivateKey(A);
  node.generateKeys();
  // Node derives the public value of the private key set.
  assert.equal(bigOf(ga), modPow(BigInt(CONFIG.g), bigOf(A), bigOf(CONFIG.p)));
  assert.equal(ga.length, 256);
  assert.equal(Buffer.compare(ga, bytesOf(bigOf(node.getPublicKey()))), 0);
});

test('both sides reach the same key; its fingerprint is SHA1 low 64 bits', () => {
  const ga = publicOf(CONFIG, bigOf(A));
  const gb = publicOf(CONFIG, bigOf(B));
  const callerKey = sharedKey(CONFIG, gb, bigOf(A));
  const calleeKey = sharedKey(CONFIG, ga, bigOf(B));
  assert.equal(Buffer.compare(callerKey, calleeKey), 0);
  assert.equal(callerKey.length, 256);
  // Node's own secret agrees.
  const node = crypto.createDiffieHellman(CONFIG.p, CONFIG.g);
  node.setPrivateKey(A);
  node.generateKeys();
  assert.equal(
    Buffer.compare(bytesOf(bigOf(node.computeSecret(gb))), callerKey),
    0
  );
  // The fingerprint, worked out here independently.
  const sha = crypto.createHash('sha1').update(callerKey).digest();
  const low = sha.subarray(12, 20);
  const expected = BigInt.asIntN(
    64,
    BigInt(`0x${Buffer.from(low).reverse().toString('hex')}`)
  );
  assert.equal(fingerprintOf(callerKey), expected.toString());
  assert.match(fingerprintOf(callerKey), /^-?\d{1,19}$/);
  // A fixed vector.
  assert.equal(fingerprintOf(Buffer.alloc(256, 7)), '6587356363582867870');
});

test('g_a_hash is SHA256 of g_a and tells a changed g_a', () => {
  const ga = publicOf(CONFIG, bigOf(A));
  const hash = hashOf(ga);
  assert.equal(hash.length, 32);
  assert.equal(
    hash.toString('hex'),
    crypto.createHash('sha256').update(ga).digest('hex')
  );
  assert.equal(hashOf(ga).equals(hash), true);
  const other = Buffer.from(ga);
  other[255] ^= 1;
  assert.equal(hashOf(other).equals(hash), false);
  // A fixed vector.
  assert.equal(
    hashOf(Buffer.alloc(256, 1)).toString('hex'),
    crypto.createHash('sha256').update(Buffer.alloc(256, 1)).digest('hex')
  );
});

test('received public values must be inside the safe range', () => {
  const p = CONFIG.p;
  const ok = publicOf(CONFIG, bigOf(B));
  assert.equal(publicInRange(ok, p), true);
  assert.equal(publicInRange(bytesOf(1n), p), false);
  assert.equal(publicInRange(bytesOf(0n), p), false);
  assert.equal(publicInRange(bytesOf(bigOf(p) - 1n), p), false);
  assert.equal(publicInRange(bytesOf(bigOf(p)), p), false);
  // Small and near-p values are out of the 2^1984 margin.
  assert.equal(publicInRange(bytesOf((1n << 1983n) + 5n), p), false);
  assert.equal(publicInRange(bytesOf(bigOf(p) - (1n << 1983n)), p), false);
});

test('the secret exponent mixes both sources of randomness', () => {
  const fromServer = Buffer.alloc(256, 0xaa);
  const local = Buffer.alloc(256, 0x0f);
  const mixed = exponentOf(fromServer, local);
  // 0xaa xor 0x0f is 0xa5 in every byte; the top bit of the low 256 is set.
  assert.equal(mixed, bigOf(Buffer.alloc(256, 0xa5)) | (1n << 255n));
  assert.notEqual(exponentOf(fromServer, Buffer.alloc(256, 1)), mixed);
  // Broken randomness (all zero) still gives a usable exponent.
  assert.ok(exponentOf(Buffer.alloc(256), Buffer.alloc(256)) > 1n);
});

test('the emoji come from SHA256(key || g_a): four indices below 333', () => {
  const key = Buffer.alloc(256, 3);
  const ga = Buffer.alloc(256, 5);
  const digest = crypto.createHash('sha256').update(key).update(ga).digest();
  const expected = [0, 1, 2, 3].map((i) => {
    const part = Buffer.from(digest.subarray(i * 8, i * 8 + 8));
    part[0] &= 0x7f;
    return Number(BigInt(`0x${part.toString('hex')}`) % 333n);
  });
  assert.deepEqual(emojiIndices(key, ga), expected);
  assert.ok(expected.every((i) => i >= 0 && i < EMOJI_COUNT));
  // Fixed vector made here.
  assert.deepEqual(emojiIndices(key, ga), [59, 197, 227, 198]);
  assert.deepEqual(
    emojiOf(key, ga),
    [59, 197, 227, 198].map((i) => EMOJI_TABLE[i])
  );
  // Another g_a, other emoji.
  assert.notDeepEqual(emojiIndices(key, Buffer.alloc(256, 6)), expected);
});

test("the emoji table: Telegram's 333 distinct emoji, in order", () => {
  assert.equal(EMOJI_TABLE.length, EMOJI_COUNT);
  assert.equal(new Set(EMOJI_TABLE).size, EMOJI_COUNT);
  assert.equal(EMOJI_TABLE[0], '\u{1F609}');
  assert.equal(EMOJI_TABLE[332], '\u{1F537}');
  // Symbols that need the emoji presentation selector have it; flags and
  // keycaps are whole entries.
  assert.equal(EMOJI_TABLE[43], '\u270C\uFE0F');
  assert.equal(EMOJI_TABLE[301], '\u{1F1EF}\u{1F1F5}');
  assert.equal(EMOJI_TABLE[311], '1\uFE0F\u20E3');
  assert.equal(EMOJI_TABLE_VERIFIED, true);
});
