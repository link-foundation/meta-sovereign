/**
 * TL serialisation of the secret-chat payloads (R-Y219; learned from
 * Telegram's public end-to-end schema, https://core.telegram.org/schema/end-to-end,
 * and from TDLib's secret_api.tl, Boost Software License 1.0; never copied
 * from a GPL client). Pure: bytes in, plain objects out.
 *
 * The secret layer used is 73 (MTProto 2.0 only): the latest layer whose
 * constructors are written here, so every peer from layer 73 up reads them.
 * The schema is not part of layer-232.tl (it is a separate schema), so the
 * constructor ids below were each checked as the CRC32 of the schema line
 * (old style: `Vector long`, `bytes` written as `string`) in the tests.
 *
 * Objects:
 *   layer    { randomBytes, layer, inSeqNo, outSeqNo, message }
 *   message  { type: 'message', randomId, ttl, text, entities, replyTo,
 *              viaBot, groupedId, media }
 *            { type: 'service', randomId, action }
 *            { type: 'unknown', id }
 *   action   { type: 'setTtl', ttl } | { type: 'read', randomIds } |
 *            { type: 'delete', randomIds } | { type: 'screenshot',
 *            randomIds } | { type: 'flush' } | { type: 'resend', start,
 *            end } | { type: 'notifyLayer', layer } | { type: 'typing',
 *            typing } | { type: 'requestKey', exchangeId, ga } |
 *            { type: 'acceptKey', exchangeId, gb, fingerprint } |
 *            { type: 'abortKey', exchangeId } | { type: 'commitKey',
 *            exchangeId, fingerprint } | { type: 'noop' } |
 *            { type: 'unknown', id }
 * Long values (random ids, exchange ids, fingerprints) are BigInt.
 *
 * Media is not read: a message with media only says `media: true`.
 */

export const SECRET_LAYER = 73;

const IDS = {
  layer: 0x1be31789,
  message: 0x91cc4674,
  service: 0x73164160,
  setTtl: 0xa1733aec,
  read: 0x0c4f40be,
  delete: 0x65614304,
  screenshot: 0x8ac1f475,
  flush: 0x6719e45c,
  resend: 0x511110b0,
  notifyLayer: 0xf3048883,
  typing: 0xccb27641,
  requestKey: 0xf3c9611b,
  acceptKey: 0x6fe1735b,
  abortKey: 0xdd05ec6b,
  commitKey: 0xec2e0b9b,
  noop: 0xa82fdd63,
  typingAction: 0x16bf744e,
  cancelAction: 0xfd5ec8f5,
  vector: 0x1cb5c415,
};

export const CONSTRUCTORS = Object.freeze({ ...IDS });

// Message entities of the secret layer: name -> [id, extra string field].
const ENTITIES = {
  mention: [0xfa04579d],
  hashtag: [0x6f635b0d],
  botCommand: [0x6cef8ac7],
  url: [0x6ed02538],
  email: [0x64e475c2],
  bold: [0xbd610bc9],
  italic: [0x826f8b60],
  code: [0x28a20571],
  pre: [0x73924be0, 'language'],
  textUrl: [0x76a6d327, 'url'],
  phone: [0x9b69e34b],
  cashtag: [0x4c4e743f],
  underline: [0x9c4e7e8b],
  strike: [0xbf0693d4],
};
const ENTITY_BY_ID = new Map(
  Object.entries(ENTITIES).map(([name, [id, extra]]) => [id, { name, extra }])
);

const FLAG_REPLY = 1 << 3;
const FLAG_ENTITIES = 1 << 7;
const FLAG_MEDIA = 1 << 9;
const FLAG_VIA_BOT = 1 << 11;
const FLAG_GROUPED = 1 << 17;

/** Appends TL values to a byte buffer. */
export const createWriter = () => {
  const parts = [];
  const writer = {
    uint: (n) => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(n >>> 0);
      parts.push(b);
      return writer;
    },
    int: (n) => {
      const b = Buffer.alloc(4);
      b.writeInt32LE(Number(n) | 0);
      parts.push(b);
      return writer;
    },
    long: (n) => {
      const b = Buffer.alloc(8);
      b.writeBigInt64LE(BigInt.asIntN(64, BigInt(n)));
      parts.push(b);
      return writer;
    },
    bytes: (data) => {
      const buf = Buffer.from(data);
      const head =
        buf.length < 254
          ? Buffer.from([buf.length])
          : Buffer.from([
              254,
              buf.length & 255,
              (buf.length >> 8) & 255,
              (buf.length >> 16) & 255,
            ]);
      const pad = (4 - ((head.length + buf.length) % 4)) % 4;
      parts.push(head, buf, Buffer.alloc(pad));
      return writer;
    },
    string: (s) => writer.bytes(Buffer.from(String(s), 'utf8')),
    longs: (list) => {
      writer.uint(IDS.vector).int(list.length);
      list.forEach((n) => writer.long(n));
      return writer;
    },
    done: () => Buffer.concat(parts),
  };
  return writer;
};

/** Reads TL values from a buffer; throws RangeError past its end. */
export const createReader = (buffer) => {
  let at = 0;
  const need = (n) => {
    if (at + n > buffer.length) {
      throw new RangeError('secret chat TL: unexpected end');
    }
  };
  const reader = {
    uint: () => {
      need(4);
      at += 4;
      return buffer.readUInt32LE(at - 4);
    },
    int: () => {
      need(4);
      at += 4;
      return buffer.readInt32LE(at - 4);
    },
    long: () => {
      need(8);
      at += 8;
      return buffer.readBigInt64LE(at - 8);
    },
    bytes: () => {
      need(1);
      let length = buffer[at];
      let head = 1;
      if (length === 254) {
        need(4);
        length =
          buffer[at + 1] | (buffer[at + 2] << 8) | (buffer[at + 3] << 16);
        head = 4;
      }
      need(head + length);
      const data = buffer.subarray(at + head, at + head + length);
      at += head + length + ((4 - ((head + length) % 4)) % 4);
      return Buffer.from(data);
    },
    string: () => reader.bytes().toString('utf8'),
    longs: () => {
      if (reader.uint() !== IDS.vector) {
        throw new RangeError('secret chat TL: a vector was expected');
      }
      const count = reader.int();
      if (count < 0 || count > 10_000) {
        throw new RangeError('secret chat TL: bad vector length');
      }
      return Array.from({ length: count }, () => reader.long());
    },
    position: () => at,
  };
  return reader;
};

const writeEntities = (w, entities) => {
  w.uint(IDS.vector).int(entities.length);
  for (const entity of entities) {
    const [id, extra] = ENTITIES[entity.type];
    w.uint(id).int(entity.offset).int(entity.length);
    if (extra) {
      w.string(entity[extra] ?? '');
    }
  }
};

const readEntities = (r) => {
  if (r.uint() !== IDS.vector) {
    throw new RangeError('secret chat TL: entities vector expected');
  }
  const count = r.int();
  if (count < 0 || count > 1000) {
    throw new RangeError('secret chat TL: bad entity count');
  }
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const known = ENTITY_BY_ID.get(r.uint());
    if (!known) {
      throw new RangeError('secret chat TL: unknown entity');
    }
    const entity = { type: known.name, offset: r.int(), length: r.int() };
    if (known.extra) {
      entity[known.extra] = r.string();
    }
    list.push(entity);
  }
  return list;
};

const writeMessage = (w, m) => {
  const entities = m.entities ?? [];
  const flags =
    (m.replyTo ? FLAG_REPLY : 0) |
    (entities.length > 0 ? FLAG_ENTITIES : 0) |
    (m.viaBot ? FLAG_VIA_BOT : 0) |
    (m.groupedId ? FLAG_GROUPED : 0);
  w.uint(IDS.message)
    .int(flags)
    .long(m.randomId)
    .int(m.ttl ?? 0)
    .string(m.text);
  if (entities.length > 0) {
    writeEntities(w, entities);
  }
  if (m.viaBot) {
    w.string(m.viaBot);
  }
  if (m.replyTo) {
    w.long(m.replyTo);
  }
  if (m.groupedId) {
    w.long(m.groupedId);
  }
};

const ACTION_WRITERS = {
  setTtl: (w, a) => w.int(a.ttl),
  read: (w, a) => w.longs(a.randomIds),
  delete: (w, a) => w.longs(a.randomIds),
  screenshot: (w, a) => w.longs(a.randomIds),
  flush: () => {},
  resend: (w, a) => w.int(a.start).int(a.end),
  notifyLayer: (w, a) => w.int(a.layer),
  typing: (w, a) =>
    w.uint(a.typing === false ? IDS.cancelAction : IDS.typingAction),
  requestKey: (w, a) => w.long(a.exchangeId).bytes(a.ga),
  acceptKey: (w, a) => w.long(a.exchangeId).bytes(a.gb).long(a.fingerprint),
  abortKey: (w, a) => w.long(a.exchangeId),
  commitKey: (w, a) => w.long(a.exchangeId).long(a.fingerprint),
  noop: () => {},
};

const writeService = (w, m) => {
  const write = ACTION_WRITERS[m.action?.type];
  if (!write) {
    throw new TypeError(`secret chat: no such action ${m.action?.type}`);
  }
  w.uint(IDS.service).long(m.randomId).uint(IDS[m.action.type]);
  write(w, m.action);
};

/** A DecryptedMessage (or service message) as bytes. */
export const encodeMessage = (message) => {
  const w = createWriter();
  if (message.type === 'message') {
    writeMessage(w, message);
  } else if (message.type === 'service') {
    writeService(w, message);
  } else {
    throw new TypeError('secret chat: unknown message type');
  }
  return w.done();
};

const ACTION_READERS = {
  [IDS.setTtl]: (r) => ({ type: 'setTtl', ttl: r.int() }),
  [IDS.read]: (r) => ({ type: 'read', randomIds: r.longs() }),
  [IDS.delete]: (r) => ({ type: 'delete', randomIds: r.longs() }),
  [IDS.screenshot]: (r) => ({ type: 'screenshot', randomIds: r.longs() }),
  [IDS.flush]: () => ({ type: 'flush' }),
  [IDS.resend]: (r) => ({ type: 'resend', start: r.int(), end: r.int() }),
  [IDS.notifyLayer]: (r) => ({ type: 'notifyLayer', layer: r.int() }),
  // Any "doing something" action counts as typing; only cancel stops it.
  [IDS.typing]: (r) => ({
    type: 'typing',
    typing: r.uint() !== IDS.cancelAction,
  }),
  [IDS.requestKey]: (r) => ({
    type: 'requestKey',
    exchangeId: r.long(),
    ga: r.bytes(),
  }),
  [IDS.acceptKey]: (r) => ({
    type: 'acceptKey',
    exchangeId: r.long(),
    gb: r.bytes(),
    fingerprint: r.long(),
  }),
  [IDS.abortKey]: (r) => ({ type: 'abortKey', exchangeId: r.long() }),
  [IDS.commitKey]: (r) => ({
    type: 'commitKey',
    exchangeId: r.long(),
    fingerprint: r.long(),
  }),
  [IDS.noop]: () => ({ type: 'noop' }),
};

// The optional tail of a text message; a tail that does not parse costs
// the formatting, never the text.
const readTail = (r, flags) => {
  const tail = { entities: [], viaBot: null, replyTo: null, groupedId: null };
  try {
    if (flags & FLAG_ENTITIES) {
      tail.entities = readEntities(r);
    }
    if (flags & FLAG_VIA_BOT) {
      tail.viaBot = r.string();
    }
    if (flags & FLAG_REPLY) {
      tail.replyTo = r.long();
    }
    if (flags & FLAG_GROUPED) {
      tail.groupedId = r.long();
    }
  } catch {
    // Keep what was read before the break.
  }
  return tail;
};

const readMessage = (r) => {
  const flags = r.int();
  const randomId = r.long();
  const ttl = r.int();
  const text = r.string();
  if (flags & FLAG_MEDIA) {
    return { type: 'message', randomId, ttl, text, media: true, entities: [] };
  }
  return {
    type: 'message',
    randomId,
    ttl,
    text,
    media: false,
    ...readTail(r, flags),
  };
};

/** A DecryptedMessage from bytes (throws RangeError when malformed). */
export const decodeMessage = (buffer) => {
  const r = createReader(buffer);
  const id = r.uint();
  if (id === IDS.message) {
    return readMessage(r);
  }
  if (id === IDS.service) {
    const randomId = r.long();
    const actionId = r.uint();
    const read = ACTION_READERS[actionId];
    return {
      type: 'service',
      randomId,
      action: read ? read(r) : { type: 'unknown', id: actionId },
    };
  }
  return { type: 'unknown', id };
};

/** A DecryptedMessageLayer as bytes. */
export const encodeLayer = ({
  randomBytes,
  layer = SECRET_LAYER,
  inSeqNo,
  outSeqNo,
  message,
}) =>
  Buffer.concat([
    createWriter()
      .uint(IDS.layer)
      .bytes(randomBytes)
      .int(layer)
      .int(inSeqNo)
      .int(outSeqNo)
      .done(),
    encodeMessage(message),
  ]);

/** A DecryptedMessageLayer from bytes (throws RangeError when malformed). */
export const decodeLayer = (buffer) => {
  const r = createReader(buffer);
  if (r.uint() !== IDS.layer) {
    throw new RangeError('secret chat TL: not a DecryptedMessageLayer');
  }
  const randomBytes = r.bytes();
  const layer = r.int();
  const inSeqNo = r.int();
  const outSeqNo = r.int();
  return {
    randomBytes,
    layer,
    inSeqNo,
    outSeqNo,
    message: decodeMessage(buffer.subarray(r.position())),
  };
};
