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

/** Build the doublets network for a list of records. */
export const encodeNetwork = (records) => {
  const links = [];
  const pairs = new Map();
  const names = new Map();
  const point = (name) => {
    let address = names.get(name);
    if (address === undefined) {
      address = links.length + 1;
      links.push([address, address]);
      names.set(name, address);
    }
    return address;
  };
  const pair = (source, target) => {
    let row = pairs.get(source);
    if (!row) {
      row = new Map();
      pairs.set(source, row);
    }
    let address = row.get(target);
    if (address === undefined) {
      links.push([source, target]);
      address = links.length;
      row.set(target, address);
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
  for (const record of records) {
    pair(T['ms:records'], node(record));
  }
  return { links, names };
};

const linksPacket = (links) => ({
  sections: [{ width: widthFor(links.length, false), links }],
});

// Names are `(address codepoint...)` rows of external references, grouped
// into one section per reference width so short Latin/Cyrillic names do
// not pay for the occasional emoji (link-cli `--packed-widths` layout).
const namesPacket = (names) => {
  const groups = new Map();
  for (const [name, address] of names) {
    const row = [externalRef(address)];
    let max = address;
    for (const ch of name) {
      const code = ch.codePointAt(0);
      row.push(externalRef(code));
      max = Math.max(max, code);
    }
    const width = widthFor(max, true);
    if (!groups.has(width)) {
      groups.set(width, []);
    }
    groups.get(width).push(row);
  }
  const sections = [...groups]
    .sort(([a], [b]) => a - b)
    .map(([width, links]) => ({ width, links }));
  return { external: true, sections };
};

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
