// A recorded voice remuxed from WebM/Opus to Ogg/Opus: the TOC sample
// counts, the pages (CRC checked by a verifier written here, apart from
// the module's), granules, lacing, sequence, BOS/EOS, byte-identical
// packets, known and unknown element sizes, lacing in blocks, and a
// missing Opus track. Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  oggPages,
  opusPacketSamples,
  voiceDuration,
  webmToOgg,
} from '../src/web/voice-ogg.js';

// ---- a tiny EBML writer

const cat = (...parts) => {
  const flat = parts.flatMap((p) => Array.from(p));
  return Uint8Array.from(flat);
};
const idBytes = (id) => {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) {
    out.unshift(v % 256);
  }
  return out;
};
const sizeBytes = (n) => {
  for (let len = 1; len <= 8; len++) {
    if (n < 2 ** (7 * len) - 1) {
      const out = [];
      let v = n;
      for (let i = 0; i < len; i++) {
        out.unshift(v % 256);
        v = Math.floor(v / 256);
      }
      out[0] |= 0x80 >> (len - 1);
      return out;
    }
  }
  throw new Error('too big');
};
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const el = (id, payload) =>
  cat(idBytes(id), sizeBytes(payload.length), payload);
const elUnknown = (id, payload) => cat(idBytes(id), UNKNOWN, payload);
const uint = (id, n) => el(id, [n]);
const text = (id, s) => el(id, new TextEncoder().encode(s));

const opusHead = (preSkip = 312, channels = 1) => {
  const h = new Uint8Array(19);
  h.set(new TextEncoder().encode('OpusHead'));
  h[8] = 1;
  h[9] = channels;
  h[10] = preSkip & 255;
  h[11] = preSkip >> 8;
  h[12] = 0x80;
  h[13] = 0xbb;
  return h;
};

const trackEntry = ({ number = 1, codec = 'A_OPUS', head } = {}) =>
  el(
    0xae,
    cat(
      uint(0xd7, number),
      uint(0x83, 2),
      text(0x86, codec),
      head ? el(0x63a2, head) : [],
      el(0xe1, cat(uint(0x9f, 1)))
    )
  );

const simpleBlock = (track, packet, flags = 0) =>
  el(0xa3, cat([0x80 | track, 0, 0, flags], packet));

const fakePacket = (i, size = 40, toc = 0xf8) => {
  const p = new Uint8Array(size);
  p.fill(i & 255);
  p[0] = toc;
  return p;
};

const webm = ({ packets, known = false, head = opusHead(), blocks } = {}) => {
  const items = blocks ?? packets.map((p) => simpleBlock(1, p));
  const cluster = (known ? el : elUnknown)(
    0x1f43b675,
    cat(uint(0xe7, 0), ...items)
  );
  const body = cat(
    el(0x1654ae6b, trackEntry({ head })),
    el(0xec, new Uint8Array(5)),
    cluster
  );
  const header = el(0x1a45dfa3, text(0x4282, 'webm'));
  return cat(header, (known ? el : elUnknown)(0x18538067, body));
};

// ---- an independent Ogg CRC verifier (bitwise)

const crcOf = (page) => {
  const copy = Uint8Array.from(page);
  copy.fill(0, 22, 26);
  let crc = 0;
  for (const byte of copy) {
    crc ^= byte << 24;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
    }
    crc >>>= 0;
  }
  return crc;
};

const splitPages = (ogg) => {
  const out = [];
  let pos = 0;
  while (pos < ogg.length) {
    assert.equal(String.fromCharCode(...ogg.subarray(pos, pos + 4)), 'OggS');
    const n = ogg[pos + 26];
    let len = 27 + n;
    for (let i = 0; i < n; i++) {
      len += ogg[pos + 27 + i];
    }
    out.push(ogg.subarray(pos, pos + len));
    pos += len;
  }
  return out;
};

const same = (a, b) => assert.deepEqual(Array.from(a), Array.from(b));

// ---- opusPacketSamples

test('opusPacketSamples: codes 0, 1, 2 and 3', () => {
  assert.equal(opusPacketSamples(Uint8Array.of(0xf8, 1)), 960);
  assert.equal(opusPacketSamples(Uint8Array.of(0xf9, 1)), 1920);
  assert.equal(opusPacketSamples(Uint8Array.of(0xfa, 1)), 1920);
  assert.equal(opusPacketSamples(Uint8Array.of(0xfb, 5, 1)), 5 * 960);
  assert.equal(opusPacketSamples(Uint8Array.of(0xfb)), 0);
  assert.equal(opusPacketSamples(new Uint8Array(0)), 0);
});

test('opusPacketSamples: SILK, hybrid and CELT configs', () => {
  const at = (config, code = 0) => Uint8Array.of((config << 3) | code, 2);
  assert.deepEqual(
    [0, 1, 2, 3].map((c) => opusPacketSamples(at(c))),
    [480, 960, 1920, 2880]
  );
  assert.deepEqual(
    [4, 5, 6, 7, 8, 9, 10, 11].map((c) => opusPacketSamples(at(c))),
    [480, 960, 1920, 2880, 480, 960, 1920, 2880]
  );
  assert.deepEqual(
    [12, 13, 14, 15].map((c) => opusPacketSamples(at(c))),
    [480, 960, 480, 960]
  );
  assert.deepEqual(
    [16, 17, 18, 19].map((c) => opusPacketSamples(at(c))),
    [120, 240, 480, 960]
  );
  assert.deepEqual(
    [28, 29, 30, 31].map((c) => opusPacketSamples(at(c))),
    [120, 240, 480, 960]
  );
  assert.equal(opusPacketSamples(at(16, 1)), 240);
});

// ---- webmToOgg

const packetsOf = (n) => Array.from({ length: n }, (_, i) => fakePacket(i));

test('webmToOgg: headers, CRC, sequence, EOS and granules', () => {
  const packets = packetsOf(10);
  const ogg = webmToOgg(webm({ packets }));
  assert.equal(String.fromCharCode(...ogg.subarray(0, 4)), 'OggS');
  const raw = splitPages(ogg);
  for (const page of raw) {
    const stored = new DataView(page.buffer, page.byteOffset).getUint32(
      22,
      true
    );
    assert.equal(stored, crcOf(page));
  }
  const pages = oggPages(ogg);
  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map((p) => p.sequence),
    [0, 1, 2]
  );
  assert.equal(pages[0].flags, 2);
  assert.equal(pages[1].flags, 0);
  assert.equal(pages[2].flags, 4);
  assert.equal(
    new TextDecoder().decode(pages[0].packets[0].subarray(0, 8)),
    'OpusHead'
  );
  assert.equal(
    new TextDecoder().decode(pages[1].packets[0].subarray(0, 8)),
    'OpusTags'
  );
  assert.deepEqual(
    pages.map((p) => p.granule),
    [0, 0, 9600]
  );
  assert.equal(pages[0].packets.length, 1);
  same(pages[0].packets[0], opusHead());
});

test('webmToOgg: packets are byte-identical and in order across pages', () => {
  const packets = packetsOf(300);
  const ogg = webmToOgg(webm({ packets }));
  const pages = oggPages(ogg);
  assert.ok(pages.length > 4);
  const got = pages.slice(2).flatMap((p) => p.packets);
  assert.equal(got.length, 300);
  got.forEach((p, i) => same(p, packets[i]));
  pages.forEach((p, i) => assert.equal(p.sequence, i));
  assert.equal(pages.at(-1).flags, 4);
  assert.ok(pages.slice(0, -1).every((p) => (p.flags & 4) === 0));
  let acc = 0;
  for (const page of pages.slice(2)) {
    acc += page.packets.length * 960;
    assert.equal(page.granule, acc);
    assert.ok(page.segments.length <= 255);
  }
  for (const page of splitPages(ogg)) {
    const stored = new DataView(page.buffer, page.byteOffset).getUint32(
      22,
      true
    );
    assert.equal(stored, crcOf(page));
  }
});

test('webmToOgg: packets of 255 bytes and over are laced', () => {
  const packets = [
    fakePacket(1, 600),
    fakePacket(2, 255),
    fakePacket(3, 510),
    fakePacket(4, 10),
  ];
  const pages = oggPages(webmToOgg(webm({ packets })));
  const audio = pages[2];
  assert.deepEqual(audio.segments, [
    ...[255, 255, 90],
    ...[255, 0],
    ...[255, 255, 0],
    10,
  ]);
  audio.packets.forEach((p, i) => same(p, packets[i]));
});

test('webmToOgg: known-size Segment and Cluster work too', () => {
  const packets = packetsOf(6);
  const a = webmToOgg(webm({ packets, known: true }));
  const b = webmToOgg(webm({ packets, known: false }));
  same(a, b);
});

test('webmToOgg: a missing CodecPrivate is synthesised', () => {
  const ogg = webmToOgg(webm({ packets: packetsOf(3), head: null }));
  const head = oggPages(ogg)[0].packets[0];
  assert.equal(head.length, 19);
  same(head, opusHead(312, 1));
  assert.equal(voiceDuration(ogg), (3 * 960 - 312) / 48000);
});

test('webmToOgg: other tracks are left out, a missing Opus track throws', () => {
  const blocks = [
    simpleBlock(1, fakePacket(1)),
    simpleBlock(2, fakePacket(9)),
    simpleBlock(1, fakePacket(2)),
  ];
  const pages = oggPages(webmToOgg(webm({ blocks })));
  assert.equal(pages[2].packets.length, 2);
  const video = cat(
    el(0x1a45dfa3, text(0x4282, 'webm')),
    elUnknown(0x18538067, el(0x1654ae6b, trackEntry({ codec: 'V_VP8' })))
  );
  assert.throws(() => webmToOgg(video), /Opus/);
  assert.throws(() => webmToOgg(new Uint8Array(0)), /Opus/);
});

test('webmToOgg: BlockGroup blocks and Matroska lacing', () => {
  const [a, b, c] = [fakePacket(1, 30), fakePacket(2, 300), fakePacket(3, 20)];
  const hdr = (flags) => [0x81, 0, 0, flags];
  const xiph = el(0xa3, cat(hdr(0x02), [2, 30, 255, 45], a, b, c));
  const fixed = el(0xa3, cat(hdr(0x04), [2], a, a, a));
  const group = el(0xa0, el(0xa1, cat(hdr(0), c)));
  const ogg = webmToOgg(webm({ blocks: [xiph, fixed, group] }));
  const got = oggPages(ogg)
    .slice(2)
    .flatMap((p) => p.packets);
  assert.equal(got.length, 7);
  [a, b, c, a, a, a, c].forEach((p, i) => same(got[i], p));
});

test('webmToOgg: EBML lacing', () => {
  const [a, b, c] = [fakePacket(1, 30), fakePacket(2, 50), fakePacket(3, 20)];
  // first size 30 (0x80|30), then diff +20 as a signed vint (bias 63)
  const block = el(
    0xa3,
    cat([0x81, 0, 0, 0x06], [2, 0x80 | 30, 0x80 | (63 + 20)], a, b, c)
  );
  const got = oggPages(webmToOgg(webm({ blocks: [block] })))[2].packets;
  [a, b, c].forEach((p, i) => same(got[i], p));
});

// ---- voiceDuration

test('voiceDuration: last granule minus pre-skip over 48 kHz', () => {
  const ogg = webmToOgg(webm({ packets: packetsOf(50), head: opusHead(312) }));
  assert.equal(voiceDuration(ogg), (50 * 960 - 312) / 48000);
  const other = webmToOgg(webm({ packets: packetsOf(50), head: opusHead(0) }));
  assert.equal(voiceDuration(other), 1);
  assert.equal(voiceDuration(new Uint8Array(0)), 0);
});

test('webmToOgg: mixed frame durations sum into the granule', () => {
  const packets = [
    fakePacket(1, 20, 0xf8),
    fakePacket(2, 20, 0x78),
    Uint8Array.of(0xfb, 3, 1, 2, 3),
  ];
  const pages = oggPages(webmToOgg(webm({ packets })));
  assert.equal(pages.at(-1).granule, 960 + 960 + 3 * 960);
});
