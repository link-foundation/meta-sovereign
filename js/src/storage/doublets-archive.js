/**
 * Doublets archive — store records as a deduplicated associative network
 * of doublets (`source → target` pairs), written in the link-cli store
 * archive layout: a binary links notation *links packet* followed by a
 * *names packet* (links-notation `LinksPacket`). The same file can be fed
 * to `clink --import-binary data.bin` (link-cli 1.x Rust and 4.x .NET),
 * queried there, and re-exported byte-for-byte (R-A2, R-A3, issue #31).
 *
 * Network shape (every scalar is a named point link, so equal values are
 * stored once and every record that mentions them is reachable from them):
 *
 *   record   = (ms:records object)
 *   object   = (ms:object cells)        cells = ms:nil | ((key value) cells)
 *   array    = (ms:array cells)         cells = ms:nil | (value cells)
 *   string   = point named by the text  ("", digit-only and `ms:` text gets
 *              an `ms:s:` prefix so names never look like link numbers)
 *   number   = point named `ms:n:<n>`
 *   null / true / false = points `ms:null` / `ms:true` / `ms:false`
 */

import {
  decodePacket,
  encodePacket,
  externalRef,
  externalValue,
  widthFor,
} from './binary-packet.js';

const TYPES = [
  'ms:records',
  'ms:nil',
  'ms:array',
  'ms:object',
  'ms:null',
  'ms:true',
  'ms:false',
];

const needsEscape = (text) =>
  text === '' || text.startsWith('ms:') || /^\d+$/.test(text);

/** The point name a scalar is stored under (see the module header). */
export const scalarName = (value) => {
  if (typeof value === 'number') {
    return `ms:n:${value}`;
  }
  const text = String(value);
  return needsEscape(text) ? `ms:s:${text}` : text;
};

// The links as two growing typed arrays (`source`, `target`; address =
// index + 1): a store of tens of millions of links is a few hundred MB
// off the heap, not an array per link.
const createLinkTable = () => {
  let sources = new Uint32Array(1 << 16);
  let targets = new Uint32Array(1 << 16);
  let length = 0;
  return {
    get length() {
      return length;
    },
    push(source, target) {
      if (length === sources.length) {
        const grow = (old) => {
          const next = new Uint32Array(old.length * 2);
          next.set(old);
          return next;
        };
        sources = grow(sources);
        targets = grow(targets);
      }
      sources[length] = source;
      targets[length] = target;
      length += 1;
      return length;
    },
    source: (address) => sources[address - 1],
    target: (address) => targets[address - 1],
    /** `[source, target]` rows, as the packet writer reads them. */
    *[Symbol.iterator]() {
      for (let i = 0; i < length; i++) {
        yield [sources[i], targets[i]];
      }
    },
  };
};

// The address of each `(source target)` pair already made: an open
// addressing table of addresses, keyed by the pair the address holds.
const createPairIndex = (links) => {
  let slots = new Uint32Array(1 << 16);
  let count = 0;
  const slotOf = (table, source, target) => {
    const mask = table.length - 1;
    let at =
      (Math.imul(source, 0x9e3779b1) ^ Math.imul(target + 1, 0x85ebca77)) &
      mask;
    while (
      table[at] !== 0 &&
      (links.source(table[at]) !== source || links.target(table[at]) !== target)
    ) {
      at = (at + 1) & mask;
    }
    return at;
  };
  const grow = () => {
    const next = new Uint32Array(slots.length * 2);
    for (const address of slots) {
      if (address !== 0) {
        next[slotOf(next, links.source(address), links.target(address))] =
          address;
      }
    }
    slots = next;
  };
  return (source, target) => {
    const at = slotOf(slots, source, target);
    if (slots[at] !== 0) {
      return slots[at];
    }
    const address = links.push(source, target);
    slots[at] = address;
    count += 1;
    if (count * 2 > slots.length) {
      grow();
    }
    return address;
  };
};

/**
 * The doublets network, built a record at a time: `add(record)` for
 * each, then `finish()` for `{ links, names }` (`links` iterates
 * `[source, target]` rows). A large store is encoded as it is read,
 * never held as decoded records too.
 */
const ownCopy = (text) => (text.length < 13 ? text : ` ${text}`.slice(1));

export const createNetworkEncoder = () => {
  const links = createLinkTable();
  const pair = createPairIndex(links);
  const names = new Map();
  const point = (name) => {
    let address = names.get(name);
    if (address === undefined) {
      address = links.push(links.length + 1, links.length + 1);
      // A copy: a name read from a log line can be a slice of the line,
      // which would keep the whole line (and so the whole log) in memory.
      names.set(ownCopy(name), address);
    }
    return address;
  };
  const T = Object.fromEntries(TYPES.map((name) => [name, point(name)]));
  const cells = (nodes) =>
    nodes.reduceRight((rest, n) => pair(n, rest), T['ms:nil']);
  const node = (value) => {
    if (value === null || value === undefined) {
      return T['ms:null'];
    }
    if (typeof value === 'boolean') {
      return value ? T['ms:true'] : T['ms:false'];
    }
    if (Array.isArray(value)) {
      return pair(T['ms:array'], cells(value.map(node)));
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value).filter(([, v]) => v !== undefined);
      return pair(
        T['ms:object'],
        cells(entries.map(([k, v]) => pair(point(scalarName(k)), node(v))))
      );
    }
    return point(scalarName(value));
  };
  let records = 0;
  return {
    add(record) {
      pair(T['ms:records'], node(record));
      records += 1;
    },
    get records() {
      return records;
    },
    finish: () => ({ links, names }),
  };
};

/** Build the doublets network for a list of records. */
export const encodeNetwork = (records) => {
  const encoder = createNetworkEncoder();
  for (const record of records) {
    encoder.add(record);
  }
  return encoder.finish();
};

const linksPacket = (links) => ({
  sections: [{ width: widthFor(links.length, false), links }],
});

// Names are `(address codepoint...)` rows of external references, grouped
// into one section per reference width so short Latin/Cyrillic names do
// not pay for the occasional emoji (link-cli `--packed-widths` layout).
// A section's rows are made as the packet writer reads them, not held:
// millions of names would be an array per name and per character.
const nameWidth = (name, address) => {
  let max = address;
  for (const ch of name) {
    max = Math.max(max, ch.codePointAt(0));
  }
  return widthFor(max, true);
};

const nameRow = (name, address) => {
  const row = [externalRef(address)];
  for (const ch of name) {
    row.push(externalRef(ch.codePointAt(0)));
  }
  return row;
};

const namesPacket = (names) => {
  const widths = new Uint8Array(names.size);
  const counts = new Map();
  let i = 0;
  for (const [name, address] of names) {
    const width = nameWidth(name, address);
    widths[i++] = width;
    counts.set(width, (counts.get(width) ?? 0) + 1);
  }
  const rowsOf = (width) => ({
    length: counts.get(width),
    *[Symbol.iterator]() {
      let at = 0;
      for (const [name, address] of names) {
        if (widths[at++] === width) {
          yield nameRow(name, address);
        }
      }
    },
  });
  const sections = [...counts.keys()]
    .sort((a, b) => a - b)
    .map((width) => ({ width, links: rowsOf(width) }));
  return { external: true, sections };
};

/** Packet descriptors usable by either the byte encoder or streaming writer. */
export const linksArchivePackets = ({ links, names }) => [
  linksPacket(links),
  namesPacket(names),
];

/**
 * Write a raw network — `links` as `[source, target]` rows (address =
 * row index + 1) and `names` as `Map(name → address)` — in the link-cli
 * archive layout.
 */
export const encodeLinksArchive = ({ links, names }) => {
  const a = encodePacket(linksPacket(links));
  const b = encodePacket(namesPacket(names));
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

/** Encode records to the link-cli compatible binary archive. */
export const encodeArchive = (records) =>
  encodeLinksArchive(encodeNetwork(records));

/** Read the raw network (links + names) from archive bytes. */
export const readNetwork = (bytes) => {
  const linksPart = decodePacket(bytes, 0);
  const namesPart = linksPart ? decodePacket(bytes, linksPart.next) : null;
  const links = new Map(linksPart?.links ?? []);
  const names = new Map();
  for (const [, refs] of namesPart?.links ?? []) {
    const [address, ...codes] = refs.map(externalValue);
    names.set(address, String.fromCodePoint(...codes));
  }
  return { links, names };
};

/** The scalar a point name stands for (the inverse of `scalarName`). */
export const scalarFrom = (name) => {
  if (name.startsWith('ms:n:')) {
    return Number(name.slice(5));
  }
  return name.startsWith('ms:s:') ? name.slice(5) : name;
};

/** Decode records from archive bytes (the inverse of `encodeArchive`). */
export const decodeArchive = (bytes) => {
  const { links, names } = readNetwork(bytes);
  const byName = new Map([...names].map(([a, n]) => [n, a]));
  const T = Object.fromEntries(TYPES.map((n) => [n, byName.get(n)]));
  const CONSTANTS = new Map([
    [T['ms:null'], null],
    [T['ms:true'], true],
    [T['ms:false'], false],
  ]);
  const list = (address) => {
    const out = [];
    for (let at = address; at !== T['ms:nil'];) {
      const [head, tail] = links.get(at);
      out.push(head);
      at = tail;
    }
    return out;
  };
  const value = (address) => {
    if (CONSTANTS.has(address)) {
      return CONSTANTS.get(address);
    }
    const [source, target] = links.get(address) ?? [];
    if (source === T['ms:array']) {
      return list(target).map(value);
    }
    if (source === T['ms:object']) {
      return Object.fromEntries(
        list(target).map((entry) => {
          const [key, v] = links.get(entry);
          return [scalarFrom(names.get(key)), value(v)];
        })
      );
    }
    if (names.has(address)) {
      return scalarFrom(names.get(address));
    }
    throw new Error(`doublets archive: unknown node ${address}`);
  };
  const out = [];
  if (T['ms:records'] === undefined) {
    return out;
  }
  for (const [address, [source, target]] of links) {
    if (source === T['ms:records'] && address !== source) {
      out.push(value(target));
    }
  }
  return out;
};
