// Same packet layout as encodePacket, with a bounded byte buffer instead of
// growing/copying several archive-sized Uint8Arrays.
import { externalValue } from './binary-packet.js';

const WIDTHS = [1, 2, 4, 8];
const sink = (size) => {
  let bytes = new Uint8Array(size);
  let at = 0;
  return {
    room: () => bytes.length - at,
    push: (value) => {
      bytes[at++] = value;
    },
    raw(value, width) {
      for (let i = 0; i < width; i += 1) {
        bytes[at++] = value % 256;
        value = Math.floor(value / 256);
      }
    },
    take() {
      const out = bytes.subarray(0, at);
      bytes = new Uint8Array(size);
      at = 0;
      return out;
    },
  };
};
const leb = (out, value) => {
  while (value >= 128) {
    out.push((value % 128) + 128);
    value = Math.floor(value / 128);
  }
  out.push(value);
};

const writeRef = (out, ref, width, top) => {
  const value = ref < 0 ? externalValue(ref) : ref;
  out.raw(ref >= 0 ? value : value === 0 ? top / 2 : top - value, width);
};
const shapesOf = async (sections, yieldWork) => {
  const shapes = [];
  let rows = 0;
  for (const section of sections) {
    if (
      Number.isInteger(section.minArity) &&
      Number.isInteger(section.maxArity)
    ) {
      shapes.push({ min: section.minArity, max: section.maxArity });
      continue;
    }
    let min = Infinity;
    let max = 0;
    for (const row of section.links) {
      min = Math.min(min, row.length);
      max = Math.max(max, row.length);
      if (++rows % 256 === 0) {
        await yieldWork();
      }
    }
    shapes.push({ min: min === Infinity ? 0 : min, max });
  }
  return shapes;
};
function* headerChunks(sections, shapes, external, out) {
  out.push(0x10 | (external ? 1 : 0) | 2);
  leb(out, sections.length);
  for (let i = 0; i < sections.length; i += 1) {
    if (out.room() < 32) {
      yield out.take();
    }
    const { gap = 0, width, links } = sections[i];
    const { min, max } = shapes[i];
    leb(
      out,
      min * 16 + WIDTHS.indexOf(width) + (gap ? 4 : 0) + (min === max ? 0 : 8)
    );
    if (gap) {
      leb(out, gap);
    }
    if (min !== max) {
      leb(out, max - min);
    }
    leb(out, links.length);
  }
}
async function* bodyChunks(sections, shapes, out, yieldWork) {
  for (let i = 0; i < sections.length; i += 1) {
    const { width, links } = sections[i];
    const { min, max } = shapes[i];
    const top = 2 ** (width * 8);
    for (const row of links) {
      if (out.room() < 16) {
        yield out.take();
        await yieldWork();
      }
      if (min !== max) {
        leb(out, row.length - min);
      }
      for (const ref of row) {
        if (out.room() < width) {
          yield out.take();
          await yieldWork();
        }
        writeRef(out, ref, width, top);
      }
    }
  }
}
export async function* packetChunks(
  { external = false, sections },
  { chunkBytes = 65536, yieldWork = async () => {} } = {}
) {
  if (chunkBytes < 32) {
    throw new RangeError('packet chunks must hold at least 32 bytes');
  }
  const shapes = await shapesOf(sections, yieldWork);
  const out = sink(chunkBytes);
  yield* headerChunks(sections, shapes, external, out);
  yield* bodyChunks(sections, shapes, out, yieldWork);
  const last = out.take();
  if (last.length) {
    yield last;
  }
}
