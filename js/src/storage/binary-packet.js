/**
 * Fast binary links notation packets (links-notation "Binary links
 * notation v1") using plain Numbers instead of BigInt, for the hot path
 * of the doublets store. The byte layout is exactly the one produced and
 * read by `LinksPacket` / `PacketReader` from the `links-notation` npm
 * package (cross-checked in tests/doublets-archive.test.js); this module
 * only trades the 64-bit generality for speed (addresses ≤ 2^53).
 *
 * External references are returned as `-(value + 1)` so a reference list
 * stays a flat Number array (external 0 → -1, external 7 → -8).
 */

const WIDTHS = [1, 2, 4, 8];

export const externalRef = (value) => -(value + 1);
export const externalValue = (ref) => -ref - 1;

// Growable byte sink; far faster than pushing into a plain array.
const createSink = (initial = 1024) => {
  let buf = new Uint8Array(initial);
  let length = 0;
  const ensure = (extra) => {
    if (length + extra > buf.length) {
      const next = new Uint8Array(Math.max(buf.length * 2, length + extra));
      next.set(buf.subarray(0, length));
      buf = next;
    }
  };
  return {
    push(byte) {
      ensure(1);
      buf[length++] = byte;
    },
    raw(value, width) {
      ensure(width);
      let rest = value;
      for (let i = 0; i < width; i++) {
        buf[length++] = rest % 256;
        rest = Math.floor(rest / 256);
      }
    },
    bytes: () => buf.slice(0, length),
  };
};

const pushLeb = (out, input) => {
  let value = input;
  while (value >= 128) {
    out.push((value % 128) + 128);
    value = Math.floor(value / 128);
  }
  out.push(value);
};

/** Narrowest width holding every reference (externals lose a bit). */
export const widthFor = (max, external) =>
  WIDTHS.find((w) => max < 2 ** (w * 8 - (external ? 1 : 0))) ?? 8;

/**
 * Encode one packet in the explicit-sections layout.
 * @param {{ external?: boolean, sections: Array<{ gap?: number,
 *   width: number, links: number[][] }> }} packet
 */
export const encodePacket = ({ external = false, sections }) => {
  const out = createSink();
  out.push(0x10 | (external ? 1 : 0) | 2);
  pushLeb(out, sections.length);
  const shapes = sections.map(({ links }) => {
    let min = Infinity;
    let max = 0;
    for (const link of links) {
      min = Math.min(min, link.length);
      max = Math.max(max, link.length);
    }
    return { min, max };
  });
  sections.forEach(({ gap = 0, width, links }, i) => {
    const { min, max } = shapes[i];
    const fixed = min === max;
    pushLeb(
      out,
      min * 16 + WIDTHS.indexOf(width) + (gap ? 4 : 0) + (fixed ? 0 : 8)
    );
    if (gap) {
      pushLeb(out, gap);
    }
    if (!fixed) {
      pushLeb(out, max - min);
    }
    pushLeb(out, links.length);
  });
  sections.forEach(({ width, links }, i) => {
    const { min, max } = shapes[i];
    const top = 2 ** (width * 8);
    for (const link of links) {
      if (min !== max) {
        pushLeb(out, link.length - min);
      }
      for (const ref of link) {
        if (ref >= 0) {
          out.raw(ref, width);
        } else {
          const value = externalValue(ref);
          out.raw(value === 0 ? top / 2 : top - value, width);
        }
      }
    }
  });
  return out.bytes();
};

const createCursor = (bytes, start) => {
  let offset = start;
  const raw = (width) => {
    if (width > bytes.length - offset) {
      throw new RangeError('unexpected end of packet');
    }
    let value = 0;
    let scale = 1;
    for (let i = 0; i < width; i++) {
      value += bytes[offset++] * scale;
      scale *= 256;
    }
    return value;
  };
  const leb = () => {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      const byte = raw(1);
      value += (byte & 127) * scale;
      if (byte < 128) {
        return value;
      }
      scale *= 128;
    }
    throw new RangeError('LEB128 overflow');
  };
  return { raw, leb, offset: () => offset };
};

const readHeader = (cursor, header) => {
  if (!(header & 2)) {
    const count = cursor.leb();
    return count
      ? [{ gap: 5, min: 2, max: 2, width: WIDTHS[(header >> 2) & 3], count }]
      : [];
  }
  const sections = [];
  const sectionCount = cursor.leb();
  for (let i = 0; i < sectionCount; i++) {
    const shape = cursor.leb();
    const gap = shape & 4 ? cursor.leb() : 0;
    const min = Math.floor(shape / 16);
    const extra = shape & 8 ? cursor.leb() : null;
    const max = extra === null ? min : extra === 0 ? Infinity : min + extra;
    sections.push({ gap, min, max, width: WIDTHS[shape & 3], count: 0 });
    sections[i].count = cursor.leb();
  }
  return sections;
};

/**
 * Read one packet at `offset`. Returns `null` at the end of input, else
 * `{ external, links: [address, refs][], next }`.
 */
export const decodePacket = (bytes, offset = 0) => {
  if (offset >= bytes.length) {
    return null;
  }
  const cursor = createCursor(bytes, offset);
  const header = cursor.raw(1);
  if ((header & 0xf0) !== 0x10) {
    throw new RangeError('unsupported binary version');
  }
  const external = Boolean(header & 1);
  const sections = readHeader(cursor, header);
  const links = [];
  let address = 1;
  for (const s of sections) {
    address += s.gap;
    const top = 2 ** (s.width * 8 - 1);
    for (let j = 0; j < s.count; j++) {
      const length = s.min === s.max ? s.min : s.min + cursor.leb();
      const refs = new Array(length);
      for (let k = 0; k < length; k++) {
        const raw = cursor.raw(s.width);
        refs[k] =
          external && raw >= top
            ? externalRef(raw === top ? 0 : top * 2 - raw)
            : raw;
      }
      links.push([address++, refs]);
    }
  }
  return { external, links, next: cursor.offset() };
};
