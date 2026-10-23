// A recorded voice as Telegram wants it (learned from the specs, never
// copied): the browser's MediaRecorder gives WebM (Matroska) with an
// Opus track, Telegram a voice message as OGG with Opus. This is a
// REMUX, no re-encoding: the EBML container is read (Segment and
// Cluster of unknown size included, as MediaRecorder writes them), the
// Opus packets of the audio track are pulled out of SimpleBlocks and
// BlockGroups (no, Xiph, fixed and EBML lacing), and an Ogg Opus stream
// is written per RFC 7845: OpusHead page, OpusTags page, then audio
// pages with 48 kHz granule positions from each packet's TOC byte
// (RFC 6716 section 3.1), 255-lacing, consecutive page sequence numbers,
// EOS on the last page and the Ogg CRC32. Uint8Array and DataView only,
// so it runs in the browser as well as in Node.

const OPUS_RATE = 48000;
const DEFAULT_PRE_SKIP = 312;
const VENDOR = 'meta-sovereign';
const SERIAL = 0x4d534f56;
const PAGE_BODY_LIMIT = 4096;
const MAX_SEGMENTS = 255;

const FLAG_BOS = 2;
const FLAG_EOS = 4;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---------------------------------------------------------------- Opus

// Samples at 48 kHz of one frame for a TOC config (RFC 6716 table 2).
const frameSamples = (config) => {
  if (config < 12) {
    return [480, 960, 1920, 2880][config & 3];
  }
  if (config < 16) {
    return config & 1 ? 960 : 480;
  }
  return [120, 240, 480, 960][config & 3];
};

/** The 48 kHz samples one Opus packet decodes to (0 when empty/bad). */
export const opusPacketSamples = (packet) => {
  if (!packet || packet.length === 0) {
    return 0;
  }
  const toc = packet[0];
  const code = toc & 3;
  let frames = 1;
  if (code === 1 || code === 2) {
    frames = 2;
  } else if (code === 3) {
    if (packet.length < 2) {
      return 0;
    }
    frames = packet[1] & 0x3f;
  }
  return frames * frameSamples(toc >> 3);
};

// ---------------------------------------------------------------- EBML

const ID_SEGMENT = 0x18538067;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_AUDIO = 0xe1;
const ID_CLUSTER = 0x1f43b675;
const ID_BLOCK_GROUP = 0xa0;
const ID_TRACK_NUMBER = 0xd7;
const ID_CODEC_ID = 0x86;
const ID_CODEC_PRIVATE = 0x63a2;
const ID_CHANNELS = 0x9f;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK = 0xa1;

// Containers walked straight through: their children follow at once,
// which makes a size of "unknown" harmless.
const TRANSPARENT = new Set([
  ID_SEGMENT,
  ID_TRACKS,
  ID_TRACK_ENTRY,
  ID_AUDIO,
  ID_CLUSTER,
  ID_BLOCK_GROUP,
]);

/** A variable-length integer at `pos`; `marker` keeps the length bits. */
const readVint = (bytes, pos, marker) => {
  if (pos >= bytes.length) {
    return null;
  }
  const first = bytes[pos];
  let length = 1;
  while (length <= 8 && !(first & (0x100 >> length))) {
    length += 1;
  }
  if (length > 8 || pos + length > bytes.length) {
    return null;
  }
  let value = marker ? first : first & (0xff >> length);
  let ones = (first & (0xff >> length)) === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[pos + i];
    ones = ones && bytes[pos + i] === 0xff;
  }
  return { value, length, unknown: !marker && ones };
};

const readUint = (data) => {
  let value = 0;
  for (const byte of data) {
    value = value * 256 + byte;
  }
  return value;
};

const newTrack = () => ({
  number: -1,
  codec: '',
  channels: 0,
  header: null,
  frames: [],
});

const LEAVES = {
  [ID_TRACK_NUMBER]: (st, data) => {
    st.track.number = readUint(data);
  },
  [ID_CODEC_ID]: (st, data) => {
    st.track.codec = decoder.decode(data).replace(/\0+$/, '');
  },
  [ID_CODEC_PRIVATE]: (st, data) => {
    st.track.header = data;
  },
  [ID_CHANNELS]: (st, data) => {
    st.track.channels = readUint(data);
  },
  [ID_SIMPLE_BLOCK]: (st, data) => st.blocks.push(data),
  [ID_BLOCK]: (st, data) => st.blocks.push(data),
};

/** Walk the EBML tree: the tracks and every raw block, in order. */
const walkWebm = (bytes) => {
  const st = { tracks: [], track: newTrack(), blocks: [] };
  let pos = 0;
  while (pos < bytes.length) {
    const id = readVint(bytes, pos, true);
    const size = id && readVint(bytes, pos + id.length, false);
    if (!size) {
      break;
    }
    const start = pos + id.length + size.length;
    if (TRANSPARENT.has(id.value)) {
      if (id.value === ID_TRACK_ENTRY) {
        st.track = newTrack();
        st.tracks.push(st.track);
      }
      pos = start;
      continue;
    }
    const end = size.unknown
      ? bytes.length
      : Math.min(start + size.value, bytes.length);
    LEAVES[id.value]?.(st, bytes.subarray(start, end));
    pos = end;
  }
  return st;
};

// ------------------------------------------------------ Matroska blocks

const readLace = (data, pos, signed) => {
  const v = readVint(data, pos, false);
  if (!v) {
    return null;
  }
  const bias = signed ? 2 ** (7 * v.length - 1) - 1 : 0;
  return { value: v.value - bias, length: v.length };
};

const xiphSizes = (data, pos, count) => {
  const sizes = [];
  for (let i = 0; i < count; i++) {
    let size = 0;
    while (pos < data.length && data[pos] === 255) {
      size += 255;
      pos += 1;
    }
    size += data[pos++] ?? 0;
    sizes.push(size);
  }
  return { sizes, pos };
};

const ebmlSizes = (data, pos, count) => {
  const sizes = [];
  const first = readLace(data, pos, false);
  if (!first) {
    return { sizes, pos };
  }
  pos += first.length;
  sizes.push(first.value);
  for (let i = 1; i < count; i++) {
    const diff = readLace(data, pos, true);
    if (!diff) {
      break;
    }
    pos += diff.length;
    sizes.push(sizes[i - 1] + diff.value);
  }
  return { sizes, pos };
};

// Sizes of all frames but the last, and where the frame data begins.
const laceSizes = (data, pos, lacing, count) => {
  if (lacing === 1) {
    return xiphSizes(data, pos, count - 1);
  }
  if (lacing === 3) {
    return ebmlSizes(data, pos, count - 1);
  }
  const each = Math.floor((data.length - pos) / count);
  return { sizes: new Array(count - 1).fill(each), pos };
};

/** The frames of one block for a track: [{ track, frames }] or null. */
const blockFrames = (data) => {
  const track = readVint(data, 0, false);
  if (!track || data.length < track.length + 3) {
    return null;
  }
  let pos = track.length + 2;
  const lacing = (data[pos++] >> 1) & 3;
  if (lacing === 0) {
    return { track: track.value, frames: [data.subarray(pos)] };
  }
  const count = (data[pos++] ?? 0) + 1;
  const laced = laceSizes(data, pos, lacing, count);
  const frames = [];
  pos = laced.pos;
  for (const size of laced.sizes) {
    frames.push(data.subarray(pos, pos + size));
    pos += size;
  }
  frames.push(data.subarray(pos));
  return { track: track.value, frames };
};

// ------------------------------------------------------------- Ogg bytes

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) {
      r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    }
    table[i] = r >>> 0;
  }
  return table;
})();

const oggCrc = (bytes) => {
  let crc = 0;
  for (const byte of bytes) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  }
  return crc;
};

/** 255-lacing of one packet length: 255s then the remainder. */
const lacing = (length) => {
  const out = new Array(Math.floor(length / 255)).fill(255);
  out.push(length % 255);
  return out;
};

/** One Ogg page holding whole packets; granule may exceed 2^32. */
const buildPage = ({ packets, granule, sequence, flags }) => {
  const table = packets.flatMap((p) => lacing(p.length));
  if (table.length > MAX_SEGMENTS) {
    throw new Error('Opus packet too large for an Ogg page');
  }
  const bodyLength = packets.reduce((n, p) => n + p.length, 0);
  const page = new Uint8Array(27 + table.length + bodyLength);
  const view = new DataView(page.buffer);
  page.set(encoder.encode('OggS'), 0);
  page[5] = flags;
  view.setBigUint64(6, BigInt(granule), true);
  view.setUint32(14, SERIAL, true);
  view.setUint32(18, sequence, true);
  page[26] = table.length;
  page.set(table, 27);
  let pos = 27 + table.length;
  for (const packet of packets) {
    page.set(packet, pos);
    pos += packet.length;
  }
  view.setUint32(22, oggCrc(page), true);
  return page;
};

// ------------------------------------------------------------ Opus heads

const opusHead = (channels) => {
  const head = new Uint8Array(19);
  const view = new DataView(head.buffer);
  head.set(encoder.encode('OpusHead'), 0);
  head[8] = 1;
  head[9] = channels || 1;
  view.setUint16(10, DEFAULT_PRE_SKIP, true);
  view.setUint32(12, OPUS_RATE, true);
  return head;
};

const opusTags = () => {
  const vendor = encoder.encode(VENDOR);
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  const view = new DataView(tags.buffer);
  tags.set(encoder.encode('OpusTags'), 0);
  view.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  return tags;
};

const isOpusHead = (data) =>
  data &&
  data.length >= 19 &&
  decoder.decode(data.subarray(0, 8)) === 'OpusHead';

const preSkipOf = (head) =>
  new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(
    10,
    true
  );

// Audio pages: whole packets, granule = samples decoded so far.
const audioPages = (packets, firstSequence) => {
  const pages = [];
  let group = [];
  let segments = 0;
  let body = 0;
  let total = 0;
  let sequence = firstSequence;
  const flush = (flags) => {
    pages.push(buildPage({ packets: group, granule: total, sequence, flags }));
    sequence += 1;
    group = [];
    segments = 0;
    body = 0;
  };
  for (const packet of packets) {
    const need = lacing(packet.length).length;
    if (
      group.length > 0 &&
      (segments + need > MAX_SEGMENTS || body + packet.length > PAGE_BODY_LIMIT)
    ) {
      flush(0);
    }
    group.push(packet);
    segments += need;
    body += packet.length;
    total += opusPacketSamples(packet);
  }
  flush(FLAG_EOS);
  return pages;
};

const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
};

/** Remux WebM (Matroska) with an Opus track to an Ogg Opus stream. */
export const webmToOgg = (bytes) => {
  const { tracks, blocks } = walkWebm(bytes);
  const track = tracks.find((t) => t.codec === 'A_OPUS');
  if (!track) {
    throw new Error('No Opus audio track in the WebM recording');
  }
  const head = isOpusHead(track.header)
    ? track.header
    : opusHead(track.channels);
  const packets = [];
  for (const block of blocks) {
    const parsed = blockFrames(block);
    if (parsed && parsed.track === track.number) {
      packets.push(...parsed.frames.filter((f) => f.length > 0));
    }
  }
  const first = buildPage({
    packets: [head],
    granule: 0,
    sequence: 0,
    flags: FLAG_BOS,
  });
  const second = buildPage({
    packets: [opusTags()],
    granule: 0,
    sequence: 1,
    flags: 0,
  });
  return concat([first, second, ...audioPages(packets, 2)]);
};

// ------------------------------------------------------------ Ogg reader

/** The pages of an Ogg stream: granule, sequence, flags, segments, packets. */
export const oggPages = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pages = [];
  let pos = 0;
  let partial = [];
  while (
    pos + 27 <= bytes.length &&
    decoder.decode(bytes.subarray(pos, pos + 4)) === 'OggS'
  ) {
    const count = bytes[pos + 26];
    const segments = Array.from(bytes.subarray(pos + 27, pos + 27 + count));
    let at = pos + 27 + count;
    const packets = [];
    for (const lace of segments) {
      partial.push(bytes.subarray(at, at + lace));
      at += lace;
      if (lace < 255) {
        packets.push(concat(partial));
        partial = [];
      }
    }
    pages.push({
      granule: Number(view.getBigUint64(pos + 6, true)),
      sequence: view.getUint32(pos + 18, true),
      flags: bytes[pos + 5],
      segments,
      packets,
    });
    pos = at;
  }
  return pages;
};

/** Seconds of a voice: last granule minus the pre-skip, over 48 kHz. */
export const voiceDuration = (oggBytes) => {
  const pages = oggPages(oggBytes);
  const head = pages[0]?.packets[0];
  if (!pages.length || !isOpusHead(head)) {
    return 0;
  }
  const samples = pages.at(-1).granule - preSkipOf(head);
  return Math.max(0, samples) / OPUS_RATE;
};

export { FLAG_BOS, FLAG_EOS };
