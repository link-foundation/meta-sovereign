/**
 * Minimal readers for the containers provider data exports arrive in:
 * ZIP (Google Takeout, X, Facebook, LinkedIn), gzip'd tar (GitHub
 * account export) and CSV (LinkedIn, Upwork). Node built-ins only, so
 * the auto-import path adds no runtime dependency besides
 * browser-commander itself.
 */

import { inflateRawSync, gunzipSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const findEndOfCentralDirectory = (buf) => {
  // The EOCD record is 22 bytes plus an optional comment of up to 64KiB.
  const stop = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= stop; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  throw new Error('not a zip archive (no end-of-central-directory record)');
};

const inflateEntry = (buf, entry) => {
  if (buf.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`zip entry ${entry.name}: bad local header`);
  }
  const nameLength = buf.readUInt16LE(entry.localOffset + 26);
  const extraLength = buf.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) {
    return raw;
  }
  if (entry.method === 8) {
    return inflateRawSync(raw);
  }
  throw new Error(
    `zip entry ${entry.name}: unsupported compression method ${entry.method}`
  );
};

/**
 * List the files of a ZIP archive. `data` is decompressed lazily so a
 * caller can skip media entries without inflating them.
 */
export const readZipEntries = (buf) => {
  const eocd = findEndOfCentralDirectory(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff || count === 0xffff) {
    throw new Error('zip64 archives are not supported; unzip it first');
  }
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error('zip central directory is corrupt');
    }
    const flags = buf.readUInt16LE(offset + 8);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const entry = {
      name: buf.toString('utf8', offset + 46, offset + 46 + nameLength),
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      size: buf.readUInt32LE(offset + 24),
      localOffset: buf.readUInt32LE(offset + 42),
      encrypted: (flags & 1) === 1,
    };
    offset += 46 + nameLength + extraLength + commentLength;
    if (entry.name.endsWith('/')) {
      continue;
    }
    entries.push({
      name: entry.name,
      size: entry.size,
      read: () => {
        if (entry.encrypted) {
          throw new Error(`zip entry ${entry.name} is encrypted`);
        }
        return inflateEntry(buf, entry);
      },
    });
  }
  return entries;
};

/** List the files of a gzip'd tar archive (ustar / GNU long names). */
export const readTarGzEntries = (buf) => {
  const tar = gunzipSync(buf);
  const entries = [];
  let offset = 0;
  let longName = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      break;
    }
    const field = (start, length) =>
      header
        .toString('utf8', start, start + length)
        .replace(/\0.*$/s, '')
        .trim();
    const size = parseInt(field(124, 12) || '0', 8);
    const type = field(156, 1) || '0';
    const prefix = field(345, 155);
    const name =
      longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    longName = null;
    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0.*$/s, '');
    } else if (type === '0' || type === '\0') {
      entries.push({ name, size, read: () => data });
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
};

/** RFC 4180 CSV → array of row objects keyed by the header row. */
export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header = [], ...body] = rows.filter(
    (r) => r.length > 1 || r[0] !== ''
  );
  return body.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name, cells[i] ?? '']))
  );
};

/** Pick the container reader for a downloaded file, or null for a plain file. */
export const archiveReaderFor = (name, buf) => {
  if (
    /\.zip$/i.test(name) ||
    (buf.length >= 4 && buf.readUInt32LE(0) === LOCAL_SIGNATURE)
  ) {
    return readZipEntries;
  }
  if (/\.(tar\.gz|tgz)$/i.test(name)) {
    return readTarGzEntries;
  }
  return null;
};
