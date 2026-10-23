/**
 * A small QR code encoder for the Telegram sign-in by QR code (R-Y203;
 * written from ISO/IEC 18004, no dependency).
 *
 * Byte mode only (UTF-8), error correction level L or M, versions 1 to 10
 * (up to 271 bytes at L, 213 at M), which is plenty for `tg://login?token=…`
 * (about 70 characters). Pieces, all pure:
 *   Reed-Solomon over GF(256) (polynomial 0x11D), the data split into
 *   blocks and interleaved, the function patterns (finders, timing,
 *   alignment, format and version information), the zig-zag data
 *   placement, the eight masks scored by the four penalty rules.
 *
 *   encodeQr(text, { ecc: 'M' }) -> { version, size, mask, ecc, modules }
 *     modules[row][col] is true for a dark module.
 *   qrPath(modules, quiet) -> one SVG path `d` of all dark modules
 *   qrSvg(text, options) -> a whole `<svg>` string
 */

// ---- GF(256), polynomial x^8 + x^4 + x^3 + x^2 + 1 -----------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    EXP[i] = EXP[i - 255];
  }
})();

export const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** The generator polynomial of `degree` error codewords (high term first). */
export const generator = (degree) => {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((coef, j) => {
      next[j] ^= coef;
      next[j + 1] ^= gfMul(coef, EXP[i]);
    });
    poly = next;
  }
  return poly;
};

/** The `ecLength` error correction codewords of `data` (array of bytes). */
export const rsEncode = (data, ecLength) => {
  const gen = generator(ecLength);
  const rest = new Array(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ rest.shift();
    rest.push(0);
    if (factor) {
      for (let i = 0; i < ecLength; i += 1) {
        rest[i] ^= gfMul(gen[i + 1], factor);
      }
    }
  }
  return rest;
};

/** The polynomial of `codewords` evaluated at alpha^power (0 for a good one). */
export const syndrome = (codewords, power) => {
  let value = 0;
  for (const word of codewords) {
    value = gfMul(value, EXP[power]) ^ word;
  }
  return value;
};

// ---- Versions ------------------------------------------------------------

// Per version 1..10: [EC codewords per block, [blocks, data codewords]...].
const BLOCKS = {
  L: [
    [7, [1, 19]],
    [10, [1, 34]],
    [15, [1, 55]],
    [20, [1, 80]],
    [26, [1, 108]],
    [18, [2, 68]],
    [20, [2, 78]],
    [24, [2, 97]],
    [30, [2, 116]],
    [18, [2, 68], [2, 69]],
  ],
  M: [
    [10, [1, 16]],
    [16, [1, 28]],
    [26, [1, 44]],
    [18, [2, 32]],
    [24, [2, 43]],
    [16, [4, 27]],
    [18, [4, 31]],
    [22, [2, 38], [2, 39]],
    [22, [3, 36], [2, 37]],
    [26, [4, 43], [1, 44]],
  ],
};
const ALIGNMENT = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];
const ECC_BITS = { L: 1, M: 0 };
export const MAX_VERSION = 10;

const layout = (version, ecc) => {
  const [ecPer, ...groups] = BLOCKS[ecc][version - 1];
  const sizes = groups.flatMap(([count, data]) => Array(count).fill(data));
  return { ecPer, sizes, data: sizes.reduce((a, b) => a + b, 0) };
};

/** How many bytes version `version` holds at level `ecc`. */
export const byteCapacity = (version, ecc) => {
  const headerBits = 4 + (version < 10 ? 8 : 16);
  return Math.floor((layout(version, ecc).data * 8 - headerBits) / 8);
};

// ---- Format and version information (BCH codes) ---------------------------

const bch = (value, poly, bits) => {
  const degree = poly.toString(2).length - 1;
  let rest = value << degree;
  for (let i = bits + degree - 1; i >= degree; i -= 1) {
    if ((rest >> i) & 1) {
      rest ^= poly << (i - degree);
    }
  }
  return (value << degree) | rest;
};

/** The 15 format bits for a level and a mask number. */
export const formatBits = (ecc, mask) =>
  bch((ECC_BITS[ecc] << 3) | mask, 0x537, 5) ^ 0x5412;

/** The 18 version bits (versions 7 and up). */
export const versionBits = (version) => bch(version, 0x1f25, 6);

// ---- Data codewords ------------------------------------------------------

const utf8 = (text) => [...new TextEncoder().encode(text)];

const dataCodewords = (bytes, version, ecc) => {
  const total = layout(version, ecc).data;
  const bits = [];
  const push = (value, count) => {
    for (let i = count - 1; i >= 0; i -= 1) {
      bits.push((value >> i) & 1);
    }
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => push(byte, 8));
  push(0, Math.min(4, total * 8 - bits.length));
  while (bits.length % 8) {
    bits.push(0);
  }
  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  }
  for (let pad = 0; words.length < total; pad += 1) {
    words.push(pad % 2 ? 0x11 : 0xec);
  }
  return words;
};

/** Data codewords split into blocks, each with its EC; then interleaved. */
export const interleave = (words, version, ecc) => {
  const { ecPer, sizes } = layout(version, ecc);
  let at = 0;
  const blocks = sizes.map((size) => {
    const data = words.slice(at, at + size);
    at += size;
    return { data, ec: rsEncode(data, ecPer) };
  });
  const out = [];
  for (let i = 0; i < Math.max(...sizes); i += 1) {
    blocks.forEach((b) => i < b.data.length && out.push(b.data[i]));
  }
  for (let i = 0; i < ecPer; i += 1) {
    blocks.forEach((b) => out.push(b.ec[i]));
  }
  return out;
};

// ---- The matrix ----------------------------------------------------------

const newGrid = (size) =>
  Array.from({ length: size }, () => new Array(size).fill(false));

const drawFinder = (set, top, left) => {
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      set(top + dr, left + dc, ring < 4 && ring !== 2);
    }
  }
};

const drawAlignment = (set, version) => {
  const spots = ALIGNMENT[version - 1];
  const last = spots[spots.length - 1];
  spots.forEach((r) =>
    spots.forEach((c) => {
      const onFinder =
        (r === 6 && c === 6) ||
        (r === 6 && c === last) ||
        (r === last && c === 6);
      for (let dr = -2; dr <= 2 && !onFinder; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    })
  );
};

// Which modules are function patterns (never data), and their values.
const functionPatterns = (version) => {
  const size = version * 4 + 17;
  const dark = newGrid(size);
  const fixed = newGrid(size);
  const set = (r, c, value) => {
    if (r >= 0 && c >= 0 && r < size && c < size) {
      dark[r][c] = value;
      fixed[r][c] = true;
    }
  };
  drawFinder(set, 0, 0);
  drawFinder(set, 0, size - 7);
  drawFinder(set, size - 7, 0);
  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  drawAlignment(set, version);
  // Reserve the format areas (not over the timing lines) and the always-dark
  // module.
  const reserve = (r, c) => !fixed[r][c] && set(r, c, false);
  for (let i = 0; i < 9; i += 1) {
    reserve(8, i);
    reserve(i, 8);
  }
  for (let i = 0; i < 8; i += 1) {
    reserve(8, size - 1 - i);
    reserve(size - 1 - i, 8);
  }
  set(size - 8, 8, true);
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, false);
      set(b, a, false);
    }
  }
  return { size, dark, fixed };
};

/** Which modules of a version are function patterns (for decoders/tests). */
export const functionMask = (version) => functionPatterns(version).fixed;

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The data module positions in the order the codewords fill them. */
export const dataOrder = (fixed) => {
  const size = fixed.length;
  const out = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5; // the vertical timing column is skipped
    }
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step += 1) {
      const r = upward ? size - 1 - step : step;
      for (const c of [right, right - 1]) {
        if (!fixed[r][c]) {
          out.push([r, c]);
        }
      }
    }
  }
  return out;
};

const placeFormat = (dark, size, bits) => {
  const bit = (i) => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) {
    dark[i][8] = bit(i);
  }
  dark[7][8] = bit(6);
  dark[8][8] = bit(7);
  dark[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) {
    dark[8][14 - i] = bit(i);
  }
  for (let i = 0; i < 8; i += 1) {
    dark[8][size - 1 - i] = bit(i);
  }
  for (let i = 8; i < 15; i += 1) {
    dark[size - 15 + i][8] = bit(i);
  }
  dark[size - 8][8] = true;
};

const placeVersion = (dark, size, version) => {
  if (version < 7) {
    return;
  }
  const bits = versionBits(version);
  for (let i = 0; i < 18; i += 1) {
    const on = ((bits >> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    dark[a][b] = on;
    dark[b][a] = on;
  }
};

// The four penalty rules of the specification.
const runPenalty = (line) => {
  let score = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i += 1) {
    if (i < line.length && line[i] === line[i - 1]) {
      run += 1;
    } else {
      score += run >= 5 ? run - 2 : 0;
      run = 1;
    }
  }
  return score;
};

const PATTERN = [true, false, true, true, true, false, true];
const finderLike = (line) => {
  let score = 0;
  for (let i = 0; i + 11 <= line.length; i += 1) {
    const window = line.slice(i, i + 11);
    const light = (from) => window.slice(from, from + 4).every((v) => !v);
    if (PATTERN.every((v, k) => window[k] === v) && light(7)) {
      score += 40;
    }
    if (PATTERN.every((v, k) => window[k + 4] === v) && light(0)) {
      score += 40;
    }
  }
  return score;
};

export const penalty = (dark) => {
  const size = dark.length;
  const columns = dark.map((_, c) => dark.map((row) => row[c]));
  let score = 0;
  [...dark, ...columns].forEach((line) => {
    score += runPenalty(line) + finderLike(line);
  });
  for (let r = 0; r + 1 < size; r += 1) {
    for (let c = 0; c + 1 < size; c += 1) {
      const v = dark[r][c];
      if (
        dark[r][c + 1] === v &&
        dark[r + 1][c] === v &&
        dark[r + 1][c + 1] === v
      ) {
        score += 3;
      }
    }
  }
  const count = dark.flat().filter(Boolean).length;
  const percent = (count * 100) / (size * size);
  return score + Math.floor(Math.abs(percent - 50) / 5) * 10;
};

const build = (codewords, version, ecc, mask) => {
  const { size, dark: base, fixed } = functionPatterns(version);
  const dark = base.map((row) => row.slice());
  const bits = codewords.flatMap((w) =>
    [7, 6, 5, 4, 3, 2, 1, 0].map((i) => ((w >> i) & 1) === 1)
  );
  dataOrder(fixed).forEach(([r, c], i) => {
    dark[r][c] = (bits[i] ?? false) !== MASKS[mask](r, c);
  });
  placeFormat(dark, size, formatBits(ecc, mask));
  placeVersion(dark, size, version);
  return dark;
};

/**
 * The QR code of `text`: the smallest version that fits, the best mask.
 * `{ ecc: 'M' | 'L', mask }` (a mask number forces that mask).
 * Throws when the text is longer than version 10 holds.
 */
export const encodeQr = (text, { ecc = 'M', mask = null } = {}) => {
  if (!BLOCKS[ecc]) {
    throw new Error('error correction level must be L or M');
  }
  const bytes = utf8(String(text));
  let version = 1;
  while (version <= MAX_VERSION && byteCapacity(version, ecc) < bytes.length) {
    version += 1;
  }
  if (version > MAX_VERSION) {
    throw new Error('text too long for a QR code of version 10');
  }
  const codewords = interleave(
    dataCodewords(bytes, version, ecc),
    version,
    ecc
  );
  let best = null;
  const masks = mask === null ? MASKS.map((_, i) => i) : [mask];
  for (const m of masks) {
    const modules = build(codewords, version, ecc, m);
    const score = mask === null ? penalty(modules) : 0;
    if (!best || score < best.score) {
      best = { score, modules, mask: m };
    }
  }
  return {
    version,
    size: version * 4 + 17,
    mask: best.mask,
    ecc,
    modules: best.modules,
  };
};

/** One SVG path of every dark module (runs of 1x1 squares), quiet zone in. */
export const qrPath = (modules, quiet = 4) => {
  const parts = [];
  modules.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      let end = c;
      while (end < row.length && row[end]) {
        end += 1;
      }
      parts.push(`M${c + quiet} ${r + quiet}h${end - c}v1h${c - end}z`);
      c = end;
    }
  });
  return parts.join('');
};

/** A whole `<svg>` string of the code (crisp, scales with its box). */
export const qrSvg = (text, options = {}) => {
  const { quiet = 4, dark = '#000', light = '#fff', ...rest } = options;
  const { modules, size } = encodeQr(text, rest);
  const full = size + quiet * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" ` +
    `shape-rendering="crispEdges"><rect width="${full}" height="${full}" fill="${light}"/>` +
    `<path d="${qrPath(modules, quiet)}" fill="${dark}"/></svg>`
  );
};
