/**
 * The cryptography of secret chats (R-Y219; learned from Telegram's public
 * description, https://core.telegram.org/api/end-to-end, and the layer-73
 * schema credited in ./secret-chat-tl.js; never copied from a GPL client).
 * Groundwork only: nothing imports this module but the secret-chat session
 * and the tests, and no route or page uses it. Pure: the random bytes come
 * in as an argument, so the tests fix them.
 *
 * Key exchange: the same Diffie-Hellman steps as a call's (./private-call-dh.js):
 * the requester sends g_a, the accepter answers g_b, both get
 * `key = g^(ab) mod p` (256 bytes) and its fingerprint (the low 64 bits of
 * SHA1(key)). Telegram's checks are in `checkParameters` and `publicInRange`.
 *
 * Messages (MTProto 2.0): the payload is the serialised
 * DecryptedMessageLayer with its length (int32, little endian) in front and
 * 12..1024 random bytes behind, so that the whole is a multiple of 16:
 *
 *   msg_key_large = SHA256(key[88+x .. 88+x+32] + plaintext)
 *   msg_key       = msg_key_large[8 .. 24]
 *   sha256_a      = SHA256(msg_key + key[x .. x+36])
 *   sha256_b      = SHA256(key[40+x .. 40+x+36] + msg_key)
 *   aes_key       = a[0..8] + b[8..24] + a[24..32]
 *   aes_iv        = b[0..8] + a[8..24] + b[24..32]
 *
 * with x = 0 for what the chat's originator sends and x = 8 for what the
 * other side sends. The packet is `key_fingerprint (8) + msg_key (16) +
 * AES-256-IGE(plaintext)`.
 */

import crypto from 'node:crypto';
import {
  bigOf,
  bytesOf,
  checkDhConfig,
  exponentOf,
  fingerprintOf,
  publicInRange,
  publicOf,
  sharedKey,
} from './private-call-dh.js';

export const MIN_PADDING = 12;
export const MAX_PADDING = 1024;
export const KEY_BYTES = 256;

/** The default random source; tests pass their own. */
export const systemRandom = {
  bytes: (n) => crypto.randomBytes(n),
  int: (max) => crypto.randomInt(max),
};

const sha256 = (...parts) => {
  const hash = crypto.createHash('sha256');
  parts.forEach((p) => hash.update(p));
  return hash.digest();
};

const xor16 = (a, b) => {
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) {
    out[i] = a[i] ^ b[i];
  }
  return out;
};

// One block through AES-256 without padding or chaining.
const blocks = (mode, key) => {
  const cipher = (
    mode === 'encrypt' ? crypto.createCipheriv : crypto.createDecipheriv
  )('aes-256-ecb', key, Buffer.alloc(0));
  cipher.setAutoPadding(false);
  return (block) => cipher.update(block);
};

/** AES-256-IGE (key 32 bytes, iv 32 bytes, data a multiple of 16). */
export const igeEncrypt = (key, iv, data) => {
  const run = blocks('encrypt', key);
  let c = iv.subarray(0, 16);
  let p = iv.subarray(16, 32);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 16) {
    const plain = data.subarray(i, i + 16);
    const cipher = xor16(run(xor16(plain, c)), p);
    cipher.copy(out, i);
    c = cipher;
    p = plain;
  }
  return out;
};

export const igeDecrypt = (key, iv, data) => {
  const run = blocks('decrypt', key);
  let c = iv.subarray(0, 16);
  let p = iv.subarray(16, 32);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 16) {
    const cipher = data.subarray(i, i + 16);
    const plain = xor16(run(xor16(cipher, p)), c);
    plain.copy(out, i);
    c = cipher;
    p = plain;
  }
  return out;
};

/** msg_key for a plaintext (with its length and padding). */
export const messageKey = (key, plaintext, x) =>
  sha256(key.subarray(88 + x, 88 + x + 32), plaintext).subarray(8, 24);

/** The AES key and iv of a packet, from the shared key and msg_key. */
export const packetKeys = (key, msgKey, x) => {
  const a = sha256(msgKey, key.subarray(x, x + 36));
  const b = sha256(key.subarray(40 + x, 40 + x + 36), msgKey);
  return {
    aesKey: Buffer.concat([
      a.subarray(0, 8),
      b.subarray(8, 24),
      a.subarray(24, 32),
    ]),
    aesIv: Buffer.concat([
      b.subarray(0, 8),
      a.subarray(8, 24),
      b.subarray(24, 32),
    ]),
  };
};

// 12..1024 padding bytes making `4 + length + padding` a multiple of 16.
const paddingLength = (length, random) => {
  const least = MIN_PADDING + ((16 - ((4 + length + MIN_PADDING) % 16)) % 16);
  const spare = Math.floor((MAX_PADDING - least) / 16);
  return least + 16 * random.int(spare + 1);
};

/** The plaintext of a packet: length, payload, padding. */
export const padPayload = (payload, random = systemRandom) => {
  const head = Buffer.alloc(4);
  head.writeInt32LE(payload.length);
  return Buffer.concat([
    head,
    payload,
    random.bytes(paddingLength(payload.length, random)),
  ]);
};

const fingerprintBytes = (fingerprint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(fingerprint));
  return b;
};

/**
 * The `data` of messages.sendEncrypted for a serialised
 * DecryptedMessageLayer. `originator`: whether we started the chat.
 */
export const encryptPayload = ({
  key,
  fingerprint,
  payload,
  originator,
  random = systemRandom,
}) => {
  const x = originator ? 0 : 8;
  const plaintext = padPayload(payload, random);
  const msgKey = messageKey(key, plaintext, x);
  const { aesKey, aesIv } = packetKeys(key, msgKey, x);
  return Buffer.concat([
    fingerprintBytes(fingerprint),
    msgKey,
    igeEncrypt(aesKey, aesIv, plaintext),
  ]);
};

/**
 * The payload of a received packet. `fromOriginator`: whether the chat's
 * originator sent it. `{ ok: true, payload }`, or `{ ok: false, reason }`
 * with reason `short`, `fingerprint`, `msg-key` or `length`.
 */
export const decryptPayload = ({ key, fingerprint, data, fromOriginator }) => {
  const packet = Buffer.from(data ?? []);
  if (packet.length < 8 + 16 + 16 || (packet.length - 24) % 16 !== 0) {
    return { ok: false, reason: 'short' };
  }
  if (!packet.subarray(0, 8).equals(fingerprintBytes(fingerprint))) {
    return { ok: false, reason: 'fingerprint' };
  }
  const x = fromOriginator ? 0 : 8;
  const msgKey = packet.subarray(8, 24);
  const { aesKey, aesIv } = packetKeys(key, msgKey, x);
  const plaintext = igeDecrypt(aesKey, aesIv, packet.subarray(24));
  const expected = messageKey(key, plaintext, x);
  if (!crypto.timingSafeEqual(expected, msgKey)) {
    return { ok: false, reason: 'msg-key' };
  }
  const length = plaintext.readInt32LE(0);
  const padding = plaintext.length - 4 - length;
  if (length < 0 || padding < MIN_PADDING || padding > MAX_PADDING) {
    return { ok: false, reason: 'length' };
  }
  return { ok: true, payload: plaintext.subarray(4, 4 + length) };
};

/** Whether messages.getDhConfig's `g` and `p` are sound. */
export const checkParameters = (config) => checkDhConfig(config);

/** Our side of a new chat: the secret exponent and `g_a`. */
export const startExchange = (config, serverRandom, local) => {
  const a = exponentOf(serverRandom, local);
  return { a, ga: publicOf(config, a) };
};

/**
 * The accepting side: from the requester's `g_a`, our `g_b`, the key and
 * its fingerprint; `{ ok: false, reason }` when `g_a` is out of range.
 */
export const acceptExchange = (config, ga, serverRandom, local) => {
  if (!publicInRange(ga, config.p)) {
    return { ok: false, reason: 'range' };
  }
  const b = exponentOf(serverRandom, local);
  const key = sharedKey(config, ga, b);
  return {
    ok: true,
    gb: publicOf(config, b),
    key,
    fingerprint: fingerprintOf(key),
  };
};

/**
 * The requester's last step, from the accepter's `g_b` (`g_a_or_b`) and the
 * fingerprint Telegram reports: the key, or why it is refused.
 */
export const finishExchange = (config, a, gb, fingerprint) => {
  if (!publicInRange(gb, config.p)) {
    return { ok: false, reason: 'range' };
  }
  const key = sharedKey(config, gb, a);
  if (fingerprintOf(key) !== String(fingerprint)) {
    return { ok: false, reason: 'fingerprint' };
  }
  return { ok: true, key, fingerprint: fingerprintOf(key) };
};

// ---- the key as the two people compare it ---------------------------------

/**
 * The key as a picture to compare, derived from SHA256(key || g_a): an
 * 8 x 8 identicon (mirrored, so 32 independent cells, each a colour index
 * 0..5) and the hash as four lines of hex. A derived value only; the key
 * itself never leaves the server. Both sides compute the same from the
 * same key, so a man in the middle shows up as a different picture.
 */
export const keyVisual = (key, ga) => {
  const hash = sha256(Buffer.from(key), Buffer.from(ga ?? []));
  const cells = [];
  for (let row = 0; row < 8; row += 1) {
    const half = [];
    for (let col = 0; col < 4; col += 1) {
      const byte = hash[row * 4 + col];
      half.push(byte % 6);
    }
    cells.push([...half, ...[...half].reverse()]);
  }
  const hex = hash.toString('hex');
  const lines = [0, 16, 32, 48].map((at) =>
    hex
      .slice(at, at + 16)
      .replace(/(.{4})/g, '$1 ')
      .trim()
  );
  return { cells, lines };
};

export { bigOf, bytesOf, fingerprintOf };
