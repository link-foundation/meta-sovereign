// Keep cold provider payloads outside the GC heap. No decoded payload cache:
// replacing/deleting a record releases its only retained packed reference.
import { serialize, deserialize } from 'node:v8';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { topicOfMessage } from '../web/forum-topics.js';
import { rawReactionData, reactionData } from '../sources/reaction-data.js';
import {
  deriveMessageStructure,
  derivedStructureBytes,
} from './message-structure.js';

const fields = ['raw', 'snapshot'];
const packed = new WeakMap();
const exposed = new WeakSet();
const mediaName = (raw) =>
  raw?.media?.className ?? (raw?.media ? 'MessageMediaMissingType' : undefined);
// A poll update can name only the poll, not its message. Its lookup must reject
// other media without inflating every archived provider payload. Public copies
// still read their current, mutable raw field instead of a stale summary.
export const rawMediaTypeOf = (link) => {
  const payload = packed.get(link)?.raw;
  return payload && !exposed.has(link)
    ? payload.mediaType
    : mediaName(link?.raw);
};
// Chat indexing needs the forum topic, never the whole provider payload.
export const storedMessageTopic = (link) => {
  const payload = packed.get(link)?.raw;
  return payload && !exposed.has(link) ? payload.topic : topicOfMessage(link);
};
// Sparse reaction metadata is derived while packing, never by inflating an
// archive's payloads just to open the Feedback view.
export const storedReactions = (link) => {
  const payload = packed.get(link)?.raw;
  return payload &&
    (!exposed.has(link) || Object.getOwnPropertyDescriptor(link, 'raw')?.get)
    ? reactionData(link, payload.feedback ?? null)
    : reactionData(link);
};
// There are only two possible cold fields. Fixed slots avoid a Map and its
// backing hash table on every retained message or edit-history record.
const payloadFields = (payloads) => fields.filter((field) => payloads[field]);
const payloadBytes = (value) =>
  value.file ? value.file.read(value.bytes) : value.bytes;
const ownPayload = (bytes, file) => {
  if (file) {
    return file.write(bytes);
  }
  const owned = Buffer.allocUnsafeSlow(bytes.length);
  owned.set(bytes);
  return owned;
};
const read = (owner, field) => {
  const value = packed.get(owner)?.[field];
  const data = payloadBytes(value);
  const bytes = value.compressed ? inflateRawSync(data) : data;
  return deserialize(bytes);
};
const getters = Object.fromEntries(
  fields.map((field) => [
    field,
    function () {
      return read(this, field);
    },
  ])
);
const plainField = (owner, field, value) =>
  Object.defineProperty(owner, field, {
    enumerable: true,
    configurable: true,
    writable: true,
    value,
  });
// Public read copies behave like ordinary mutable records after a payload is
// first used. The retained store record never caches that decoded value.
const publicGetters = Object.fromEntries(
  fields.map((field) => [
    field,
    function () {
      const value = read(this, field);
      const payloads = packed.get(this);
      plainField(this, field, value);
      if (
        payloadFields(payloads).every(
          (key) => !Object.getOwnPropertyDescriptor(this, key)?.get
        )
      ) {
        packed.delete(this);
      }
      return value;
    },
  ])
);
const setters = Object.fromEntries(
  fields.map((field) => [
    field,
    function (value) {
      for (const key of payloadFields(packed.get(this))) {
        if (!Object.hasOwn(this, key)) {
          continue;
        }
        const next = key === field ? value : this[key];
        plainField(this, key, next);
      }
      packed.delete(this);
    },
  ])
);
const copyPacked = (link, payloads = packed.get(link), visible = false) => {
  if (!payloads) {
    return { ...link };
  }
  const heldFields = payloadFields(payloads);
  if (visible) {
    // A returned record stays usable after deletion, cache-slot reuse or
    // store close. Only matching read copies take bytes out of the file.
    payloads = Object.fromEntries(
      heldFields.map((field) => {
        const value = payloads[field];
        return [
          field,
          value.file
            ? { ...value, bytes: Buffer.from(payloadBytes(value)), file: null }
            : value,
        ];
      })
    );
  }
  // Copy directly: constructing entry arrays and forcing fast shapes for every
  // heterogeneous archive record increased the loaded heap in production.
  // Skip cold fields before reading values, and treat __proto__ as plain data.
  const out = {};
  for (const key of Object.keys(link)) {
    if (heldFields.includes(key)) {
      continue;
    }
    if (key === '__proto__') {
      plainField(out, key, link[key]);
    } else {
      out[key] = link[key];
    }
  }
  packed.set(out, payloads);
  if (visible) {
    exposed.add(out);
  }
  for (const field of heldFields) {
    Object.defineProperty(out, field, {
      enumerable: true,
      configurable: true,
      get: (visible ? publicGetters : getters)[field],
      set: setters[field],
    });
  }
  return out;
};

export const createRawPacking = ({
  minBytes = 256,
  payloadFile = null,
} = {}) => {
  let records = 0;
  let bytes = 0;
  let unpackedBytes = 0;
  let allocatedBytes = 0;
  let bodyUtf16Bytes = 0;
  let childIdUtf16Bytes = 0;
  let tokenUtf16Bytes = 0;
  let structuralUtf16BytesAvoided = 0;
  const mediaTypes = new Map();
  const mediaType = (raw) => {
    const type = mediaName(raw);
    if (typeof type !== 'string') {
      return undefined;
    }
    const known = mediaTypes.get(type);
    if (known !== undefined) {
      return known;
    }
    // A decoded name may be a slice of an entire reader chunk. Copy through
    // bytes so the summary cannot keep that chunk after raw is serialized.
    // UTF-16 preserves every JS code unit, including unmatched surrogates.
    const owned = Buffer.from(type, 'utf16le').toString('utf16le');
    if (mediaTypes.size >= 256) {
      mediaTypes.clear();
    }
    mediaTypes.set(owned, owned);
    return owned;
  };
  const stringBytes = (values) =>
    Array.isArray(values)
      ? values.reduce(
          (sum, value) =>
            sum + (typeof value === 'string' ? value.length * 2 : 0),
          0
        )
      : 0;
  const feedbackMetadata = (link, field) =>
    field === 'raw' &&
    (link.sender === 'me' || link.outgoing === true) &&
    link[field]?.reactions
      ? { feedback: rawReactionData(link[field]) }
      : {};
  const pack = (link) => {
    if (packed.has(link) && !exposed.has(link)) {
      return link;
    }
    const payloads = { raw: undefined, snapshot: undefined };
    for (const field of fields) {
      if (!link[field] || typeof link[field] !== 'object') {
        continue;
      }
      let data;
      try {
        data = serialize(link[field]);
      } catch {
        continue;
      } // Non-serializable library objects keep normal behavior.
      if (data.length < minBytes) {
        continue;
      }
      const compressed =
        data.length >= 1024 ? deflateRawSync(data, { level: 1 }) : data;
      const smaller = compressed.length < data.length * 0.9;
      const selected = smaller ? compressed : data;
      // zlib slices can pin a 16 KiB slab for a 100-byte result. Retained
      // records need exact-sized backing stores, independent of buffer pools.
      const owned = ownPayload(selected, payloadFile);
      payloads[field] = {
        bytes: owned,
        file: payloadFile,
        compressed: smaller,
        original: data.length,
        mediaType: field === 'raw' ? mediaType(link[field]) : undefined,
        topic: field === 'raw' ? topicOfMessage(link) : undefined,
        ...feedbackMetadata(link, field),
      };
    }
    return deriveMessageStructure(
      copyPacked(link, payloads.raw || payloads.snapshot ? payloads : undefined)
    );
  };
  const account = (link, by) => {
    if (!link) {
      return;
    }
    bodyUtf16Bytes +=
      by * (typeof link.body === 'string' ? link.body.length * 2 : 0);
    childIdUtf16Bytes += by * stringBytes(link.children);
    tokenUtf16Bytes += by * stringBytes(link.tokens);
    structuralUtf16BytesAvoided += by * derivedStructureBytes(link);
    const payloads = packed.get(link);
    if (!payloads) {
      return;
    }
    records += by;
    for (const field of payloadFields(payloads)) {
      const value = payloads[field];
      if (value.file) {
        value.file[by > 0 ? 'retain' : 'release'](value.bytes);
      }
      bytes += by * value.bytes.length;
      unpackedBytes += by * value.original;
      allocatedBytes += by * (value.bytes.buffer?.byteLength ?? 0);
    }
  };
  return {
    pack,
    copy: (link) => copyPacked(link, packed.get(link), true),
    retain(link) {
      // Startup's private packed records can be adopted directly. Public read
      // copies are marked exposed and pack() always copies them before storing.
      const out = pack(link);
      account(out, 1);
      return out;
    },
    release: (link) => account(link, -1),
    discard(link) {
      const payloads = packed.get(link);
      for (const field of payloads ? payloadFields(payloads) : []) {
        const value = payloads[field];
        value.file?.release(value.bytes);
      }
    },
    close: () => payloadFile?.close(),
    stats: () => ({
      packedRecords: records,
      packedBytes: bytes,
      allocatedBytes,
      unpackedBytes,
      decodedPayloadsCached: 0,
      bodyUtf16Bytes,
      childIdUtf16Bytes,
      tokenUtf16Bytes,
      ...(structuralUtf16BytesAvoided ? { structuralUtf16BytesAvoided } : {}),
      ...(payloadFile ? { payloadCache: payloadFile.stats() } : {}),
    }),
  };
};
