// The protocol core of secret chats (R-Y219): TL of the secret layer, AES-IGE,
// MTProto 2.0 packets between two simulated parties, the key exchange and the
// sequence numbers. Nothing here touches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { configureTelegramCrypto } from '../src/sources/telegram-runtime.js';

import {
  CONSTRUCTORS,
  SECRET_LAYER,
  createReader,
  createWriter,
  decodeLayer,
  decodeMessage,
  encodeLayer,
  encodeMessage,
} from '../src/sources/secret-chat-tl.js';
import {
  MAX_PADDING,
  MIN_PADDING,
  acceptExchange,
  checkParameters,
  decryptPayload,
  encryptPayload,
  finishExchange,
  igeDecrypt,
  igeEncrypt,
  keyVisual,
  messageKey,
  packetKeys,
  startExchange,
} from '../src/sources/secret-chat-crypto.js';
import {
  createSession,
  expectedInSeq,
  nextOutSeq,
  open,
  resendRange,
  seal,
} from '../src/sources/secret-chat-session.js';

const require = createRequire(import.meta.url);
// RFC 3526 group 14 (2048 bits), written out: a runtime's own table may differ.
const MODP14 =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74' +
  '020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437' +
  '4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
  'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05' +
  '98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB' +
  '9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
  'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718' +
  '3995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF';
const CONFIG = { g: 2, p: Buffer.from(MODP14, 'hex') };

// A repeatable "random" source.
const seeded = (seed = 1) => {
  let n = seed;
  const next = () => {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    return n;
  };
  return {
    bytes: (len) =>
      Buffer.from(Array.from({ length: len }, () => next() & 255)),
    int: (max) => next() % max,
  };
};

// Two parties that agreed on a key through the real exchange.
const parties = (random = seeded(7)) => {
  const serverRandom = Buffer.alloc(256, 9);
  const requester = startExchange(CONFIG, serverRandom, random.bytes(256));
  const accepter = acceptExchange(
    CONFIG,
    requester.ga,
    serverRandom,
    random.bytes(256)
  );
  assert.equal(accepter.ok, true);
  const done = finishExchange(
    CONFIG,
    requester.a,
    accepter.gb,
    accepter.fingerprint
  );
  assert.equal(done.ok, true);
  assert.deepEqual(done.key, accepter.key);
  const make = (role, side) =>
    createSession({
      id: 5,
      accessHash: 77n,
      role,
      key: side.key,
      fingerprint: side.fingerprint,
    });
  return {
    random,
    alice: make('admin', done),
    bob: make('participant', accepter),
    ga: requester.ga,
    key: done.key,
  };
};

const text = (randomId, body, extra = {}) => ({
  type: 'message',
  randomId: BigInt(randomId),
  ttl: 0,
  text: body,
  entities: [],
  ...extra,
});
const service = (randomId, action) => ({
  type: 'service',
  randomId: BigInt(randomId),
  action,
});

test('constructor ids are the CRC32 of the secret schema lines', () => {
  const crc = (line) => zlib.crc32(Buffer.from(line)) >>> 0;
  const lines = {
    layer:
      'decryptedMessageLayer random_bytes:string layer:int in_seq_no:int out_seq_no:int message:DecryptedMessage = DecryptedMessageLayer',
    message:
      'decryptedMessage flags:# random_id:long ttl:int message:string media:flags.9?DecryptedMessageMedia entities:flags.7?Vector MessageEntity via_bot_name:flags.11?string reply_to_random_id:flags.3?long grouped_id:flags.17?long = DecryptedMessage',
    service:
      'decryptedMessageService random_id:long action:DecryptedMessageAction = DecryptedMessage',
    setTtl:
      'decryptedMessageActionSetMessageTTL ttl_seconds:int = DecryptedMessageAction',
    read: 'decryptedMessageActionReadMessages random_ids:Vector long = DecryptedMessageAction',
    delete:
      'decryptedMessageActionDeleteMessages random_ids:Vector long = DecryptedMessageAction',
    screenshot:
      'decryptedMessageActionScreenshotMessages random_ids:Vector long = DecryptedMessageAction',
    flush: 'decryptedMessageActionFlushHistory = DecryptedMessageAction',
    resend:
      'decryptedMessageActionResend start_seq_no:int end_seq_no:int = DecryptedMessageAction',
    notifyLayer:
      'decryptedMessageActionNotifyLayer layer:int = DecryptedMessageAction',
    typing:
      'decryptedMessageActionTyping action:SendMessageAction = DecryptedMessageAction',
    requestKey:
      'decryptedMessageActionRequestKey exchange_id:long g_a:string = DecryptedMessageAction',
    acceptKey:
      'decryptedMessageActionAcceptKey exchange_id:long g_b:string key_fingerprint:long = DecryptedMessageAction',
    abortKey:
      'decryptedMessageActionAbortKey exchange_id:long = DecryptedMessageAction',
    commitKey:
      'decryptedMessageActionCommitKey exchange_id:long key_fingerprint:long = DecryptedMessageAction',
    noop: 'decryptedMessageActionNoop = DecryptedMessageAction',
    typingAction: 'sendMessageTypingAction = SendMessageAction',
    cancelAction: 'sendMessageCancelAction = SendMessageAction',
  };
  for (const [name, line] of Object.entries(lines)) {
    assert.equal(crc(line), CONSTRUCTORS[name], name);
  }
  assert.equal(SECRET_LAYER, 73);
});

test('TL: bytes are padded to four, long ones use the 254 form', () => {
  for (const length of [0, 1, 3, 4, 253, 254, 255, 1000]) {
    const data = crypto.randomBytes(length);
    const written = createWriter().bytes(data).done();
    assert.equal(written.length % 4, 0, `length ${length}`);
    assert.deepEqual(createReader(written).bytes(), data);
  }
  assert.equal(createWriter().bytes(Buffer.alloc(253)).done()[0], 253);
  assert.equal(createWriter().bytes(Buffer.alloc(254)).done()[0], 254);
  assert.throws(() => createReader(Buffer.alloc(2)).int(), RangeError);
});

test('TL: a text message with entities, a reply and a bot round-trips', () => {
  const message = text(-123456789012345n, 'héllo *world* 🙂', {
    ttl: 60,
    entities: [
      { type: 'bold', offset: 6, length: 7 },
      { type: 'textUrl', offset: 0, length: 5, url: 'https://example.org/' },
      { type: 'pre', offset: 1, length: 2, language: 'js' },
    ],
    replyTo: 99n,
    viaBot: 'gif',
    groupedId: 5n,
  });
  const read = decodeMessage(encodeMessage(message));
  assert.deepEqual(read, { ...message, media: false });
});

test('TL: every service action round-trips', () => {
  const actions = [
    { type: 'setTtl', ttl: 30 },
    { type: 'read', randomIds: [1n, -2n] },
    { type: 'delete', randomIds: [3n] },
    { type: 'screenshot', randomIds: [] },
    { type: 'flush' },
    { type: 'resend', start: 4, end: 8 },
    { type: 'notifyLayer', layer: 73 },
    { type: 'typing', typing: true },
    { type: 'typing', typing: false },
    { type: 'requestKey', exchangeId: 7n, ga: Buffer.alloc(256, 1) },
    {
      type: 'acceptKey',
      exchangeId: 7n,
      gb: Buffer.alloc(256, 2),
      fingerprint: -9n,
    },
    { type: 'abortKey', exchangeId: 7n },
    { type: 'commitKey', exchangeId: 7n, fingerprint: 11n },
    { type: 'noop' },
  ];
  for (const action of actions) {
    const message = service(42, action);
    assert.deepEqual(
      decodeMessage(encodeMessage(message)),
      message,
      action.type
    );
  }
});

test('TL: media is reported, an unknown entity costs the entities only', () => {
  const w = createWriter();
  w.uint(CONSTRUCTORS.message)
    .int(1 << 9)
    .long(5n)
    .int(0)
    .string('caption');
  assert.deepEqual(
    { ...decodeMessage(w.done()), entities: [] },
    {
      type: 'message',
      randomId: 5n,
      ttl: 0,
      text: 'caption',
      media: true,
      entities: [],
    }
  );
  const odd = createWriter()
    .uint(CONSTRUCTORS.message)
    .int(1 << 7)
    .long(6n)
    .int(0)
    .string('plain')
    .uint(CONSTRUCTORS.vector)
    .int(1)
    .uint(0xdeadbeef)
    .done();
  const read = decodeMessage(odd);
  assert.equal(read.text, 'plain');
  assert.deepEqual(read.entities, []);
  assert.deepEqual(decodeMessage(Buffer.from('01020304', 'hex')), {
    type: 'unknown',
    id: 0x04030201,
  });
});

test('TL: the layer wrapper round-trips and refuses other bytes', () => {
  const layer = {
    randomBytes: crypto.randomBytes(17),
    layer: 73,
    inSeqNo: 3,
    outSeqNo: 4,
    message: text(1, 'hi'),
  };
  const read = decodeLayer(encodeLayer(layer));
  assert.equal(read.inSeqNo, 3);
  assert.equal(read.outSeqNo, 4);
  assert.equal(read.message.text, 'hi');
  assert.throws(() => decodeLayer(Buffer.alloc(40)), RangeError);
});

test('AES-IGE agrees with the GramJS implementation, both ways', () => {
  const trace = (stage) => {
    if (process.env.CI_CRYPTO_DIAGNOSTICS === '1') {
      console.log(`[AES-IGE] ${stage}`);
    }
  };
  trace('before loading teleproto crypto');
  configureTelegramCrypto();
  const { IGE } = require('teleproto/crypto/IGE.js');
  trace('loaded teleproto crypto');
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(32);
  const data = crypto.randomBytes(16 * 9);
  const mine = igeEncrypt(key, iv, data);
  trace('local encryption complete; constructing reference cipher');
  const cipher = new IGE(key, iv);
  try {
    trace('reference cipher constructed; encrypting');
    assert.deepEqual(mine, cipher.encryptIge(data));
    trace('reference encryption complete');
  } finally {
    cipher.dispose();
  }
  assert.deepEqual(igeDecrypt(key, iv, mine), data);
  // A flipped bit garbles that block and everything after it, not before.
  const bent = Buffer.from(mine);
  bent[16 * 4] ^= 1;
  const back = igeDecrypt(key, iv, bent);
  assert.deepEqual(back.subarray(0, 16 * 4), data.subarray(0, 16 * 4));
  assert.notDeepEqual(
    back.subarray(16 * 4, 16 * 5),
    data.subarray(16 * 4, 16 * 5)
  );
});

test('the key exchange: parameters, ranges and the fingerprint Telegram reports', () => {
  assert.deepEqual(checkParameters(CONFIG), { ok: true });
  assert.equal(
    checkParameters({ g: 2, p: Buffer.from('0b', 'hex') }).ok,
    false
  );
  const { alice, bob, key, ga } = parties();
  assert.equal(alice.fingerprint, bob.fingerprint);
  assert.equal(alice.keyHex, bob.keyHex);
  assert.equal(key.length, 256);
  // g_a of 1, p - 1 and tiny values are refused.
  for (const bad of [
    Buffer.from([1]),
    Buffer.from([0]),
    Buffer.alloc(256, 255),
    Buffer.from('0102', 'hex'),
  ]) {
    assert.deepEqual(
      acceptExchange(CONFIG, bad, Buffer.alloc(256), Buffer.alloc(256, 1)),
      {
        ok: false,
        reason: 'range',
      }
    );
  }
  // The requester refuses a g_b that does not give the key Telegram reported.
  const { a } = startExchange(
    CONFIG,
    Buffer.alloc(256, 9),
    Buffer.alloc(256, 3)
  );
  const mine = acceptExchange(
    CONFIG,
    ga,
    Buffer.alloc(256),
    Buffer.alloc(256, 4)
  );
  assert.deepEqual(finishExchange(CONFIG, a, mine.gb, '12345'), {
    ok: false,
    reason: 'fingerprint',
  });
  assert.equal(
    finishExchange(CONFIG, a, Buffer.from([1]), '1').reason,
    'range'
  );
});

test('packets: both directions, padding 12..1024 to a multiple of 16', () => {
  const { alice, bob, random } = parties();
  const payload = encodeLayer({
    randomBytes: random.bytes(15),
    inSeqNo: 0,
    outSeqNo: 1,
    message: text(1, 'a'),
  });
  const key = Buffer.from(alice.keyHex, 'hex');
  for (const originator of [true, false]) {
    const data = encryptPayload({
      key,
      fingerprint: alice.fingerprint,
      payload,
      originator,
      random,
    });
    assert.equal((data.length - 24) % 16, 0);
    const opened = decryptPayload({
      key,
      fingerprint: bob.fingerprint,
      data,
      fromOriginator: originator,
    });
    assert.equal(opened.ok, true);
    assert.deepEqual(opened.payload, payload);
  }
  // The padding stays within bounds for payloads of every length.
  for (let length = 0; length < 70; length += 1) {
    const body = crypto.randomBytes(length);
    const data = encryptPayload({
      key,
      fingerprint: alice.fingerprint,
      payload: body,
      originator: true,
    });
    const padding = data.length - 24 - 4 - length;
    assert.ok(
      padding >= MIN_PADDING && padding <= MAX_PADDING,
      `padding ${padding}`
    );
    assert.deepEqual(
      decryptPayload({
        key,
        fingerprint: alice.fingerprint,
        data,
        fromOriginator: true,
      }).payload,
      body
    );
  }
  // With the largest random choice the padding reaches the limit, not past it.
  const top = { bytes: (n) => Buffer.alloc(n), int: (max) => max - 1 };
  for (let length = 0; length < 40; length += 1) {
    const data = encryptPayload({
      key,
      fingerprint: alice.fingerprint,
      payload: Buffer.alloc(length),
      originator: true,
      random: top,
    });
    const padding = data.length - 24 - 4 - length;
    assert.ok(
      padding <= MAX_PADDING && padding > MAX_PADDING - 16,
      `top padding ${padding}`
    );
  }
});

test('packets: x is 0 for the originator and 8 for the other side', () => {
  const key = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const plaintext = Buffer.alloc(32, 5);
  // msg_key reads key[88 + x ...], the AES key and iv key[x ...] and key[40 + x ...].
  assert.deepEqual(
    messageKey(key, plaintext, 0),
    crypto
      .createHash('sha256')
      .update(key.subarray(88, 120))
      .update(plaintext)
      .digest()
      .subarray(8, 24)
  );
  assert.deepEqual(
    messageKey(key, plaintext, 8),
    crypto
      .createHash('sha256')
      .update(key.subarray(96, 128))
      .update(plaintext)
      .digest()
      .subarray(8, 24)
  );
  const msgKey = Buffer.alloc(16, 3);
  const a0 = crypto
    .createHash('sha256')
    .update(msgKey)
    .update(key.subarray(0, 36))
    .digest();
  const b0 = crypto
    .createHash('sha256')
    .update(key.subarray(40, 76))
    .update(msgKey)
    .digest();
  const k0 = packetKeys(key, msgKey, 0);
  assert.deepEqual(
    k0.aesKey,
    Buffer.concat([a0.subarray(0, 8), b0.subarray(8, 24), a0.subarray(24)])
  );
  assert.deepEqual(
    k0.aesIv,
    Buffer.concat([b0.subarray(0, 8), a0.subarray(8, 24), b0.subarray(24)])
  );
  assert.notDeepEqual(packetKeys(key, msgKey, 8).aesKey, k0.aesKey);
});

test('packets: wrong fingerprint, wrong side, tampering and bad lengths are refused', () => {
  const { alice, random } = parties();
  const key = Buffer.from(alice.keyHex, 'hex');
  const payload = Buffer.from(
    'some serialised layer, long enough to span blocks!!'
  );
  const data = encryptPayload({
    key,
    fingerprint: alice.fingerprint,
    payload,
    originator: true,
    random,
  });
  const open1 = (changes) =>
    decryptPayload({
      key,
      fingerprint: alice.fingerprint,
      data,
      fromOriginator: true,
      ...changes,
    });
  assert.equal(open1({}).ok, true);
  assert.equal(open1({ fingerprint: '123' }).reason, 'fingerprint');
  assert.equal(open1({ fromOriginator: false }).reason, 'msg-key');
  assert.equal(open1({ data: data.subarray(0, 30) }).reason, 'short');
  assert.equal(open1({ data: data.subarray(0, 23) }).reason, 'short');
  assert.equal(open1({ data: null }).reason, 'short');
  for (const at of [8, 20, 24, data.length - 1]) {
    const bent = Buffer.from(data);
    bent[at] ^= 0x80;
    assert.equal(open1({ data: bent }).reason, 'msg-key', `byte ${at}`);
  }
  // A length that leaves too little or too much padding, though the msg_key is right.
  const forge = (declared, total) => {
    const head = Buffer.alloc(4);
    head.writeInt32LE(declared);
    const plain = Buffer.concat([head, Buffer.alloc(total - 4)]);
    const msgKey = messageKey(key, plain, 0);
    const { aesKey, aesIv } = packetKeys(key, msgKey, 0);
    const fp = Buffer.alloc(8);
    fp.writeBigInt64LE(BigInt(alice.fingerprint));
    return Buffer.concat([fp, msgKey, igeEncrypt(aesKey, aesIv, plain)]);
  };
  assert.equal(open1({ data: forge(12, 32) }).ok, true); // 16 bytes of padding
  assert.equal(open1({ data: forge(4, 16) }).reason, 'length'); // 8 bytes of padding
  assert.equal(open1({ data: forge(-1, 32) }).reason, 'length');
  assert.equal(open1({ data: forge(4, 1040) }).reason, 'length'); // 1032 bytes of padding
  assert.equal(open1({ data: forge(1000, 32) }).reason, 'length');
});

test('sessions: messages both ways, sequence numbers, the send log', () => {
  const { alice: a0, bob: b0, random } = parties();
  assert.equal(nextOutSeq(a0), 1);
  assert.equal(nextOutSeq(b0), 0);
  assert.equal(expectedInSeq(a0), 0);
  assert.equal(expectedInSeq(b0), 1);
  const sent = seal(a0, text(1, 'hello bob'), random);
  assert.equal(sent.outSeqNo, 1);
  const got = open(b0, sent.data);
  assert.equal(got.ok, true);
  assert.equal(got.message.text, 'hello bob');
  assert.equal(got.layer.layer, 73);
  assert.equal(got.layer.inSeqNo, 0);
  assert.equal(got.state.inCount, 1);
  assert.equal(got.state.peerLayer, 73);
  // Bob answers; Alice's log of the first message is settled by it.
  const answer = seal(got.state, text(2, 'hi alice'), random);
  assert.equal(answer.outSeqNo, 0);
  const back = open(sent.state, answer.data);
  assert.equal(back.message.text, 'hi alice');
  assert.equal(back.layer.inSeqNo, 3); // 2 * 1 received + Alice's parity 1
  assert.equal(back.state.outbox.length, 0); // seq 1 is below 3: settled
  assert.equal(expectedInSeq(back.state), 2);
  // The log keeps only the last hundred.
  let busy = back.state;
  for (let i = 0; i < 120; i += 1) {
    busy = seal(busy, text(100 + i, 'x'), random).state;
  }
  assert.equal(busy.outbox.length, 100);
});

test('sessions: a duplicate is dropped, a gap asks for a resend and is healed by it', () => {
  const { alice, bob, random } = parties();
  const one = seal(alice, text(1, 'one'), random);
  const two = seal(one.state, text(2, 'two'), random);
  const three = seal(two.state, text(3, 'three'), random);
  // Three arrives first: nothing is taken, the missing range is asked for.
  const early = open(bob, three.data);
  assert.deepEqual(early.gap, { start: 1, end: 5 });
  assert.equal(early.state.inCount, 0);
  // Alice answers the resend request with the same numbers.
  const again = resendRange(three.state, 1, 5, random);
  assert.deepEqual(
    again.map((p) => p.seq),
    [1, 3, 5]
  );
  let state = bob;
  const texts = [];
  for (const packet of again) {
    const got = open(state, packet.data);
    assert.equal(got.ok, true);
    texts.push(got.message.text);
    state = got.state;
  }
  assert.deepEqual(texts, ['one', 'two', 'three']);
  // The same packet again is a duplicate.
  assert.deepEqual(open(state, one.data), { ok: true, duplicate: true });
  // What is no longer in the log goes as a noop with the same number.
  const forgotten = { ...three.state, outbox: [] };
  const [noop] = resendRange(forgotten, 3, 3, random);
  const read = open({ ...bob, inCount: 1 }, noop.data);
  assert.equal(read.message.action.type, 'noop');
});

test('sessions: a packet from the wrong side or with the wrong parity is refused', () => {
  const { alice, bob, random } = parties();
  const mine = seal(alice, text(1, 'x'), random);
  // Alice cannot read her own packet (the keys differ by side).
  assert.equal(open(alice, mine.data).ok, false);
  assert.equal(open(bob, mine.data).ok, true);
  // A packet sealed with Bob's sequence numbers by a session with Alice's role.
  const confused = seal({ ...alice, outCount: 0 }, text(2, 'y'), random);
  const forged = open({ ...bob, role: 'admin' }, confused.data);
  assert.equal(forged.ok, false);
});

test('the key picture: a derived 8x8 identicon and four lines of hex', () => {
  const { key, ga, alice, bob } = parties();
  const one = keyVisual(key, ga);
  assert.equal(one.cells.length, 8);
  assert.ok(
    one.cells.every(
      (row) => row.length === 8 && row.every((c) => c >= 0 && c < 6)
    )
  );
  assert.ok(one.cells.every((row) => row.join() === [...row].reverse().join()));
  assert.equal(one.lines.length, 4);
  assert.match(one.lines[0], /^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
  assert.deepEqual(
    keyVisual(Buffer.from(bob.keyHex, 'hex'), ga),
    keyVisual(Buffer.from(alice.keyHex, 'hex'), ga)
  );
  assert.notDeepEqual(keyVisual(Buffer.alloc(256, 1), ga), one);
});
