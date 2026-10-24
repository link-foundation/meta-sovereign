/**
 * One secret chat's cryptographic session: the key, the sequence numbers
 * and the log of what was sent (R-Y219; learned from
 * https://core.telegram.org/api/end-to-end/seq_no, never copied). Pure and
 * immutable: every step returns the next state, a plain JSON object the
 * server keeps in its secret store (the key is hex in it; it never leaves
 * the server).
 *
 * Sequence numbers. The chat's originator numbers what it sends 1, 3, 5, ...
 * (`out_seq_no = 2 * sent + 1`) and the other side 0, 2, 4, ...
 * (`2 * sent`). Every layer carries `in_seq_no`, the `out_seq_no` the sender
 * expects next from the other side (`2 * received + the other's parity`),
 * which also tells the receiver what it may forget of its sent log. A
 * received message whose `out_seq_no` is below the expected one is a
 * duplicate (dropped); above it, a gap: it is dropped as well and a resend of
 * the range `expected .. out_seq_no` is asked for (the other side then sends
 * it again with the same numbers).
 */

import {
  decryptPayload,
  encryptPayload,
  systemRandom,
} from './secret-chat-crypto.js';
import {
  SECRET_LAYER,
  decodeLayer,
  decodeMessage,
  encodeLayer,
  encodeMessage,
} from './secret-chat-tl.js';

const OUTBOX_MAX = 100;

const parityOf = (role) => (role === 'admin' ? 1 : 0);
const otherParity = (role) => 1 - parityOf(role);

/** A fresh session once the key is agreed. */
export const createSession = ({ id, accessHash, role, key, fingerprint }) => ({
  id: String(id),
  accessHash: String(accessHash),
  role,
  keyHex: Buffer.from(key).toString('hex'),
  fingerprint: String(fingerprint),
  inCount: 0,
  outCount: 0,
  peerLayer: 0,
  ttl: 0,
  outbox: [],
});

/** The out_seq_no the next message gets. */
export const nextOutSeq = (s) => 2 * s.outCount + parityOf(s.role);

/** The out_seq_no expected from the other side next. */
export const expectedInSeq = (s) => 2 * s.inCount + otherParity(s.role);

const wrap = (s, { message, outSeqNo }, random) => {
  const layer = encodeLayer({
    randomBytes: random.bytes(15 + random.int(16)),
    layer: SECRET_LAYER,
    inSeqNo: expectedInSeq(s),
    outSeqNo,
    message,
  });
  return encryptPayload({
    key: Buffer.from(s.keyHex, 'hex'),
    fingerprint: s.fingerprint,
    payload: layer,
    originator: s.role === 'admin',
    random,
  });
};

/**
 * Encrypts `message` (see ./secret-chat-tl.js) as the next one we send:
 * `{ data, state, outSeqNo }`. The message is kept for a resend.
 */
export const seal = (state, message, random = systemRandom) => {
  const outSeqNo = nextOutSeq(state);
  const data = wrap(state, { message, outSeqNo }, random);
  const kept = { seq: outSeqNo, hex: encodeMessage(message).toString('hex') };
  return {
    data,
    outSeqNo,
    state: {
      ...state,
      outCount: state.outCount + 1,
      outbox: [...state.outbox, kept].slice(-OUTBOX_MAX),
    },
  };
};

/**
 * The messages with out_seq_no from `start` to `end` (raw numbers, every
 * second one is ours) sealed again as they were, for the other side's
 * resend request; one we no longer have goes as a noop, so the numbers
 * still follow on. Returns the packets.
 */
export const resendRange = (state, start, end, random = systemRandom) => {
  const packets = [];
  const first = Math.max(start, 0);
  const last = Math.min(end, nextOutSeq(state) - 2);
  for (let seq = first; seq <= last && packets.length < OUTBOX_MAX; seq += 1) {
    if (seq % 2 !== parityOf(state.role)) {
      continue;
    }
    const kept = state.outbox.find((m) => m.seq === seq);
    const message = kept
      ? decodeMessage(Buffer.from(kept.hex, 'hex'))
      : {
          type: 'service',
          randomId: BigInt(seq) + (1n << 40n),
          action: { type: 'noop' },
        };
    packets.push({
      seq,
      data: wrap(state, { message, outSeqNo: seq }, random),
    });
  }
  return packets;
};

/**
 * Decrypts a received packet. One of
 *   { ok: false, reason }                    refused (see decryptPayload,
 *                                            plus `malformed` and `seq`)
 *   { ok: true, duplicate: true }            already seen
 *   { ok: true, gap: { start, end }, state } a message is missing: ask for
 *                                            the resend of start..end
 *   { ok: true, layer, message, state }      a message, in order
 */
export const open = (state, data) => {
  const plain = decryptPayload({
    key: Buffer.from(state.keyHex, 'hex'),
    fingerprint: state.fingerprint,
    data,
    fromOriginator: state.role !== 'admin',
  });
  if (!plain.ok) {
    return plain;
  }
  let layer;
  try {
    layer = decodeLayer(plain.payload);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (layer.outSeqNo % 2 !== otherParity(state.role) || layer.outSeqNo < 0) {
    return { ok: false, reason: 'seq' };
  }
  const expected = expectedInSeq(state);
  if (layer.outSeqNo < expected) {
    return { ok: true, duplicate: true };
  }
  // What the other side has received of ours need not be kept any more.
  const settled = {
    ...state,
    peerLayer: Math.max(state.peerLayer, layer.layer),
    outbox: state.outbox.filter((m) => m.seq >= layer.inSeqNo),
  };
  if (layer.outSeqNo > expected) {
    return {
      ok: true,
      gap: { start: expected, end: layer.outSeqNo },
      state: settled,
    };
  }
  return {
    ok: true,
    layer,
    message: layer.message,
    state: { ...settled, inCount: state.inCount + 1 },
  };
};

/** The same session with a new self-destruct timer (seconds, 0: off). */
export const withTtl = (state, ttl) => ({ ...state, ttl });
