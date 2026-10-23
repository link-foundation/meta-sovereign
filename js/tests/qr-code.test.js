// Tests for the QR encoder behind the Telegram sign-in by QR code (R-Y203).
// The expected numbers come from ISO/IEC 18004 (format and version words,
// the "01234567" sample's error correction codewords); on top of that the
// tests read a code back the way a scanner does: both format copies, the
// unmasked codewords, every block's Reed-Solomon syndromes, the text. The
// matrices of a few codes were also decoded once with a real decoder
// (OpenCV) while writing this; their hashes are pinned below.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  byteCapacity,
  dataOrder,
  encodeQr,
  formatBits,
  functionMask,
  gfMul,
  qrPath,
  qrSvg,
  rsEncode,
  syndrome,
  versionBits,
} from '../src/web/qr-code.js';

const bin = (value, width) => value.toString(2).padStart(width, '0');

test('format information words match the specification table', () => {
  assert.equal(bin(formatBits('M', 0), 15), '101010000010010');
  assert.equal(bin(formatBits('L', 0), 15), '111011111000100');
  assert.equal(bin(formatBits('M', 5), 15), '100000011001110');
  assert.equal(bin(formatBits('L', 5), 15), '110001100011000');
});

test('version information words match the specification table', () => {
  assert.equal(bin(versionBits(7), 18), '000111110010010100');
  assert.equal(bin(versionBits(8), 18), '001000010110111100');
  assert.equal(bin(versionBits(10), 18), '001010010011010011');
});

test('GF(256) multiplication and the ISO sample error correction', () => {
  assert.equal(gfMul(2, 128), 29);
  assert.equal(gfMul(0, 77), 0);
  // ISO 18004 annex: "01234567", version 1-M, 10 error codewords.
  const data = [
    16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17,
  ];
  assert.deepEqual(
    rsEncode(data, 10),
    [165, 36, 212, 193, 237, 54, 199, 135, 44, 85]
  );
  const whole = [...data, ...rsEncode(data, 10)];
  for (let power = 0; power < 10; power += 1) {
    assert.equal(syndrome(whole, power), 0);
  }
  whole[3] ^= 1;
  assert.notEqual(syndrome(whole, 0), 0);
});

test('capacity per version and level', () => {
  assert.equal(byteCapacity(1, 'L'), 17);
  assert.equal(byteCapacity(1, 'M'), 14);
  assert.equal(byteCapacity(4, 'M'), 62);
  assert.equal(byteCapacity(10, 'L'), 271);
  assert.equal(byteCapacity(10, 'M'), 213);
});

// Read a code back like a scanner (byte mode only).
const BLOCKS = {
  '1-M': { ec: 10, sizes: [16] },
  '4-M': { ec: 18, sizes: [32, 32] },
  '4-L': { ec: 20, sizes: [80] },
  '6-L': { ec: 18, sizes: [68, 68] },
  '6-M': { ec: 16, sizes: [27, 27, 27, 27] },
  '7-L': { ec: 20, sizes: [78, 78] },
  '10-L': { ec: 18, sizes: [68, 68, 69, 69] },
  '10-M': { ec: 26, sizes: [43, 43, 43, 43, 44] },
};
const FORMAT = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((mask) =>
  ['L', 'M'].map((ecc) => ({ ecc, mask, bits: formatBits(ecc, mask) }))
);

const readFormat = (m, size) => {
  const first = [];
  for (let i = 0; i <= 5; i += 1) {
    first[i] = m[i][8];
  }
  first[6] = m[7][8];
  first[7] = m[8][8];
  first[8] = m[8][7];
  for (let i = 9; i < 15; i += 1) {
    first[i] = m[8][14 - i];
  }
  const second = [];
  for (let i = 0; i < 8; i += 1) {
    second[i] = m[8][size - 1 - i];
  }
  for (let i = 8; i < 15; i += 1) {
    second[i] = m[size - 15 + i][8];
  }
  const word = (bits) => bits.reduce((a, b, i) => a | (b ? 1 << i : 0), 0);
  return [word(first), word(second)];
};

const decode = (qr) => {
  const { modules: m, size, version } = qr;
  const [one, two] = readFormat(m, size);
  assert.equal(one, two, 'both format copies agree');
  const info = FORMAT.find((f) => f.bits === one);
  assert.ok(info, 'format word is valid');
  assert.equal(info.mask, qr.mask);
  assert.equal(info.ecc, qr.ecc);
  const mask = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ][info.mask];
  const bits = dataOrder(functionMask(version)).map(
    ([r, c]) => m[r][c] !== mask(r, c)
  );
  const words = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    words.push(
      bits.slice(i, i + 8).reduce((a, b) => (a << 1) | (b ? 1 : 0), 0)
    );
  }
  const { ec, sizes } = BLOCKS[`${version}-${info.ecc}`];
  const blocks = sizes.map(() => []);
  const longest = Math.max(...sizes);
  let at = 0;
  for (let i = 0; i < longest; i += 1) {
    sizes.forEach((size2, b) => i < size2 && blocks[b].push(words[at++]));
  }
  const checks = sizes.map(() => []);
  for (let i = 0; i < ec; i += 1) {
    sizes.forEach((_, b) => checks[b].push(words[at++]));
  }
  blocks.forEach((data, b) => {
    for (let p = 0; p < ec; p += 1) {
      assert.equal(syndrome([...data, ...checks[b]], p), 0, `block ${b}`);
    }
  });
  const data = blocks.flat();
  const bitString = data.map((w) => bin(w, 8)).join('');
  assert.equal(bitString.slice(0, 4), '0100', 'byte mode');
  const head = version < 10 ? 8 : 16;
  const length = parseInt(bitString.slice(4, 4 + head), 2);
  const bytes = [];
  for (let i = 0; i < length; i += 1) {
    const from = 4 + head + i * 8;
    bytes.push(parseInt(bitString.slice(from, from + 8), 2));
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
};

test('codes read back: format twice, Reed-Solomon, the text', () => {
  const token = 'AbC-_0123456789AbC-_0123456789AbC-_0123456789AbC';
  const texts = [
    ['A', 'M'],
    [`tg://login?token=${token.slice(0, 43)}`, 'M'],
    [`tg://login?token=${token.slice(0, 43)}`, 'L'],
    ['héllo ✓ '.repeat(12), 'L'],
    ['y'.repeat(150), 'L'],
    ['w'.repeat(270), 'L'],
    ['z'.repeat(200), 'M'],
  ];
  for (const [text, ecc] of texts) {
    const qr = encodeQr(text, { ecc });
    assert.equal(decode(qr), text, `${ecc} ${text.length}`);
  }
});

test('versions grow with the text; version 10 is the limit', () => {
  assert.equal(encodeQr('A').version, 1);
  assert.equal(encodeQr('x'.repeat(15)).version, 2);
  assert.equal(encodeQr('x'.repeat(213)).version, 10);
  assert.throws(() => encodeQr('x'.repeat(214)), /too long/);
  assert.equal(encodeQr('x'.repeat(271), { ecc: 'L' }).version, 10);
  assert.throws(() => encodeQr('x', { ecc: 'Q' }), /level/);
});

const hash = (qr) =>
  createHash('sha256')
    .update(
      qr.modules.map((r) => r.map((v) => (v ? 1 : 0)).join('')).join('\n')
    )
    .digest('hex')
    .slice(0, 16);

test('fixed patterns and pinned codes (decoded once with OpenCV)', () => {
  const qr = encodeQr('A', { ecc: 'M' });
  const m = qr.modules;
  assert.equal(qr.size, 21);
  // Finder corners, a timing run, the always-dark module.
  assert.deepEqual(m[0].slice(0, 7), Array(7).fill(true));
  assert.deepEqual(m[3].slice(0, 7), [
    true,
    false,
    true,
    true,
    true,
    false,
    true,
  ]);
  assert.equal(m[7][0], false);
  assert.equal(m[6][8], true);
  assert.equal(m[6][9], false);
  assert.equal(m[13][8], true);
  assert.equal(qr.mask, 3);
  assert.equal(hash(qr), hash(encodeQr('A', { ecc: 'M', mask: 3 })));
  const url = `tg://login?token=${'x'.repeat(43)}`;
  const pinned = encodeQr(url, { ecc: 'L' });
  assert.equal(pinned.version, 4);
  assert.equal(pinned.size, 33);
  assert.equal(pinned.mask, 0);
  // Version 4 has an alignment pattern centred at (26, 26).
  assert.equal(pinned.modules[26][26], true);
  assert.equal(pinned.modules[26][27], false);
  assert.equal(pinned.modules[24][24], true);
});

test('the SVG is a path of runs inside a quiet zone', () => {
  const qr = encodeQr('A');
  const path = qrPath(qr.modules, 4);
  assert.match(path, /^M4 4h7v1h-7z/);
  const svg = qrSvg('A', { quiet: 2, dark: '#123', light: '#fff' });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 25 25"/);
  assert.match(svg, /fill="#123"/);
  assert.equal(svg.includes('<script'), false);
});
