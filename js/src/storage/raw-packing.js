// Keep cold provider payloads outside the GC heap. No decoded payload cache:
// replacing/deleting a record releases its only retained packed reference.
import { serialize, deserialize } from 'node:v8';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const fields = ['raw', 'snapshot'];
const packed = new WeakMap();
const exposed = new WeakSet();
const read = (owner, field) => {
  const value = packed.get(owner)?.get(field);
  const bytes = value.compressed ? inflateRawSync(value.bytes) : value.bytes;
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
        [...payloads.keys()].every(
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
      for (const key of packed.get(this).keys()) {
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
  const out = {};
  for (const key of Object.keys(link)) {
    if (!payloads.has(key)) {
      out[key] = link[key];
    }
  }
  packed.set(out, payloads);
  if (visible) {
    exposed.add(out);
  }
  for (const field of payloads.keys()) {
    Object.defineProperty(out, field, {
      enumerable: true,
      configurable: true,
      get: (visible ? publicGetters : getters)[field],
      set: setters[field],
    });
  }
  return out;
};

export const createRawPacking = ({ minBytes = 256 } = {}) => {
  let records = 0;
  let bytes = 0;
  let unpackedBytes = 0;
  let allocatedBytes = 0;
  const pack = (link) => {
    if (packed.has(link) && !exposed.has(link)) {
      return link;
    }
    const payloads = new Map();
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
      const owned = Buffer.allocUnsafeSlow(selected.length);
      owned.set(selected);
      payloads.set(field, {
        bytes: owned,
        compressed: smaller,
        original: data.length,
      });
    }
    return copyPacked(link, payloads.size ? payloads : undefined);
  };
  const account = (link, by) => {
    const payloads = packed.get(link);
    if (!payloads) {
      return;
    }
    records += by;
    for (const value of payloads.values()) {
      bytes += by * value.bytes.length;
      unpackedBytes += by * value.original;
      allocatedBytes += by * value.bytes.buffer.byteLength;
    }
  };
  return {
    pack,
    copy: (link) => copyPacked(link, packed.get(link), true),
    retain(link) {
      const out =
        packed.has(link) && !exposed.has(link) ? copyPacked(link) : pack(link);
      account(out, 1);
      return out;
    },
    release: (link) => account(link, -1),
    stats: () => ({
      packedRecords: records,
      packedBytes: bytes,
      allocatedBytes,
      unpackedBytes,
      decodedPayloadsCached: 0,
    }),
  };
};
