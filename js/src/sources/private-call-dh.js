/**
 * The Diffie-Hellman steps of a private call's key (R-Y196; learned from
 * Telegram's public description of end-to-end calls, never copied).
 * Everything here is pure: the random bytes come in as arguments, so the
 * tests fix them. The secret exponent and the key never leave the server;
 * the page only ever gets the emoji derived from the key.
 *
 * The caller sends `g_a_hash = SHA256(g_a)` first (phone.requestCall), the
 * callee answers `g_b = g^b mod p` (phone.acceptCall), and the caller then
 * reveals `g_a` with the key fingerprint (phone.confirmCall). The callee
 * checks that `SHA256(g_a)` is the hash it was given. Both sides get
 * `key = g_b^a = g_a^b mod p` (256 bytes, big-endian) and its fingerprint,
 * the low 64 bits of SHA1(key) as a signed little-endian number.
 */

import crypto from 'node:crypto';

export const KEY_BYTES = 256;
const BITS = 2048n;
const SAFE_MARGIN = 1n << (BITS - 64n);
// Bases of the Miller-Rabin test: enough for numbers of this size to be
// prime beyond any practical doubt (and the same p is checked once only).
const WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

export const bigOf = (bytes) => {
  const hex = Buffer.from(bytes ?? []).toString('hex');
  return hex ? BigInt(`0x${hex}`) : 0n;
};

/** `value` as `length` big-endian bytes (zero-padded). */
export const bytesOf = (value, length = KEY_BYTES) =>
  Buffer.from(value.toString(16).padStart(length * 2, '0'), 'hex');

export const modPow = (base, exponent, modulus) => {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % modulus;
    }
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
};

const passesRound = (n, d, s, a) => {
  let x = modPow(a, d, n);
  if (x === 1n || x === n - 1n) {
    return true;
  }
  for (let i = 1n; i < s; i += 1n) {
    x = (x * x) % n;
    if (x === n - 1n) {
      return true;
    }
  }
  return false;
};

/** Miller-Rabin over the fixed bases. */
export const isProbablePrime = (n) => {
  if (n < 2n) {
    return false;
  }
  if (WITNESSES.includes(n)) {
    return true;
  }
  if (WITNESSES.some((w) => n % w === 0n)) {
    return false;
  }
  let d = n - 1n;
  let s = 0n;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s += 1n;
  }
  return WITNESSES.every((a) => passesRound(n, d, s, a));
};

// Which residues of p make g a generator of the right subgroup.
const GENERATOR = {
  2: (p) => p % 8n === 7n,
  3: (p) => p % 3n === 2n,
  4: () => true,
  5: (p) => [1n, 4n].includes(p % 5n),
  6: (p) => [19n, 23n].includes(p % 24n),
  7: (p) => [3n, 5n, 6n].includes(p % 7n),
};

const checked = new Map();

/**
 * Whether Telegram's DH parameters are sound: `p` a 2048-bit safe prime
 * and `g` one of the small generators fitting it. `{ ok, reason? }`; a
 * verdict is kept per prime.
 */
export const checkDhConfig = ({ g, p }) => {
  const prime = bigOf(p);
  const key = `${g}:${prime.toString(16)}`;
  if (!checked.has(key)) {
    checked.set(key, judge(Number(g), prime));
  }
  return checked.get(key);
};

const judge = (g, p) => {
  if (p.toString(2).length !== Number(BITS)) {
    return { ok: false, reason: 'size' };
  }
  if (!GENERATOR[g]?.(p)) {
    return { ok: false, reason: 'generator' };
  }
  if (!isProbablePrime(p) || !isProbablePrime((p - 1n) / 2n)) {
    return { ok: false, reason: 'prime' };
  }
  return { ok: true };
};

/**
 * A secret exponent: Telegram's random bytes mixed (xor) with ours, so
 * neither alone decides it. Both are 256 bytes.
 */
export const exponentOf = (
  serverRandom,
  local = crypto.randomBytes(KEY_BYTES)
) => {
  const mixed = Buffer.alloc(KEY_BYTES);
  for (let i = 0; i < KEY_BYTES; i += 1) {
    mixed[i] = (serverRandom?.[i] ?? 0) ^ (local[i] ?? 0);
  }
  // Never zero or one (the all-zero case of broken randomness).
  return bigOf(mixed) | (1n << 255n);
};

/** Our public value `g^exponent mod p`, 256 bytes. */
export const publicOf = ({ g, p }, exponent) =>
  bytesOf(modPow(BigInt(g), exponent, bigOf(p)));

/** SHA256 of a public value: what the caller commits to first. */
export const hashOf = (value) =>
  crypto.createHash('sha256').update(Buffer.from(value)).digest();

/** Whether a received public value is inside Telegram's safe range. */
export const publicInRange = (value, p) => {
  const n = bigOf(value);
  const prime = bigOf(p);
  return (
    n > 1n && n < prime - 1n && n >= SAFE_MARGIN && n <= prime - SAFE_MARGIN
  );
};

/** The shared key from the other side's public value; 256 bytes. */
export const sharedKey = ({ p }, peerPublic, exponent) => {
  const prime = bigOf(p);
  return bytesOf(modPow(bigOf(peerPublic), exponent, prime));
};

/** The key's fingerprint: SHA1's low 64 bits, a signed LE number string. */
export const fingerprintOf = (key) => {
  const sha = crypto.createHash('sha1').update(Buffer.from(key)).digest();
  return sha.readBigInt64LE(12).toString();
};
