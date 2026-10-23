/**
 * A ZIP reader that works on the file, not on a buffer (R-Z10): only the
 * central directory is read up front; every entry is then read from its
 * own byte range and inflated as a stream, so a multi-gigabyte data
 * export never sits in memory. ZIP64 (archives and entries over 4 GiB or
 * 65535 entries) is supported. Node built-ins only.
 */

import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX32 = 0xffffffff;
// The most one entry may be read into memory (text files only).
export const MAX_TEXT_BYTES = 512 * 1024 * 1024;

const readAt = async (handle, position, length) => {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
};

const findEnd = async (handle, size) => {
  const length = Math.min(size, 22 + 0xffff);
  const tail = await readAt(handle, size - length, length);
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === EOCD) {
      return { eocd: tail.subarray(i), at: size - length + i };
    }
  }
  throw new Error('not a zip archive (no end-of-central-directory record)');
};

// Where the central directory is and how many entries it lists.
const directoryOf = async (handle, size) => {
  const { eocd, at } = await findEnd(handle, size);
  let count = eocd.readUInt16LE(10);
  let offset = eocd.readUInt32LE(16);
  let length = eocd.readUInt32LE(12);
  if (count === 0xffff || offset === MAX32 || length === MAX32) {
    const locator = await readAt(handle, at - 20, 20);
    if (locator.length < 20 || locator.readUInt32LE(0) !== LOCATOR64) {
      throw new Error('zip64 end record is missing');
    }
    const rec = await readAt(handle, Number(locator.readBigUInt64LE(8)), 56);
    if (rec.readUInt32LE(0) !== EOCD64) {
      throw new Error('zip64 end record is corrupt');
    }
    count = Number(rec.readBigUInt64LE(32));
    length = Number(rec.readBigUInt64LE(40));
    offset = Number(rec.readBigUInt64LE(48));
  }
  return { count, offset, length };
};

// ZIP64 extra field (id 1): the sizes and offset that did not fit 32 bits.
const zip64Extra = (extra, entry) => {
  for (let at = 0; at + 4 <= extra.length;) {
    const id = extra.readUInt16LE(at);
    const len = extra.readUInt16LE(at + 2);
    if (id === 1) {
      let pos = at + 4;
      for (const field of ['size', 'compressedSize', 'localOffset']) {
        if (entry[field] === MAX32 && pos + 8 <= at + 4 + len) {
          entry[field] = Number(extra.readBigUInt64LE(pos));
          pos += 8;
        }
      }
      return;
    }
    at += 4 + len;
  }
};

const parseDirectory = (cd, count) => {
  const entries = [];
  let offset = 0;
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > cd.length || cd.readUInt32LE(offset) !== CENTRAL) {
      throw new Error('zip central directory is corrupt');
    }
    const nameLength = cd.readUInt16LE(offset + 28);
    const extraLength = cd.readUInt16LE(offset + 30);
    const commentLength = cd.readUInt16LE(offset + 32);
    const entry = {
      name: cd.toString('utf8', offset + 46, offset + 46 + nameLength),
      encrypted: (cd.readUInt16LE(offset + 8) & 1) === 1,
      method: cd.readUInt16LE(offset + 10),
      compressedSize: cd.readUInt32LE(offset + 20),
      size: cd.readUInt32LE(offset + 24),
      localOffset: cd.readUInt32LE(offset + 42),
    };
    const extraStart = offset + 46 + nameLength;
    zip64Extra(cd.subarray(extraStart, extraStart + extraLength), entry);
    offset = extraStart + extraLength + commentLength;
    entries.push(entry);
  }
  return entries;
};

const dataStartOf = async (handle, entry) => {
  const local = await readAt(handle, entry.localOffset, 30);
  if (local.length < 30 || local.readUInt32LE(0) !== LOCAL) {
    throw new Error(`zip entry ${entry.name}: bad local header`);
  }
  return (
    entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
  );
};

const entryStream = async (filePath, handle, entry) => {
  if (entry.encrypted) {
    throw new Error(`zip entry ${entry.name} is encrypted`);
  }
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(
      `zip entry ${entry.name}: unsupported compression method ${entry.method}`
    );
  }
  if (entry.compressedSize === 0) {
    return Readable.from([]);
  }
  const start = await dataStartOf(handle, entry);
  const raw = createReadStream(filePath, {
    start,
    end: start + entry.compressedSize - 1,
  });
  if (entry.method === 0) {
    return raw;
  }
  const inflate = createInflateRaw();
  raw.on('error', (error) => inflate.destroy(error));
  return raw.pipe(inflate);
};

const collect = async (stream, limit) => {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > limit) {
      stream.destroy();
      throw new Error(`file is larger than ${limit} bytes; unzip it first`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

/** True when the file starts with a ZIP local-file signature. */
export const isZipFile = async (filePath) => {
  const handle = await fs.open(filePath, 'r');
  try {
    const head = await readAt(handle, 0, 4);
    return head.length === 4 && head.readUInt32LE(0) === LOCAL;
  } finally {
    await handle.close();
  }
};

/**
 * Open a ZIP file. Returns `{ entries, close }`; each entry has `name`,
 * `size`, `stream()` (inflated bytes as a Readable) and `read()` (the
 * whole entry, refused over MAX_TEXT_BYTES). Call `close()` when done.
 */
export const openZipFile = async (filePath) => {
  const handle = await fs.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const { count, offset, length } = await directoryOf(handle, size);
    const cd = await readAt(handle, offset, length);
    const entries = parseDirectory(cd, count)
      .filter((entry) => !entry.name.endsWith('/'))
      .map((entry) => ({
        name: entry.name,
        size: entry.size,
        stream: () => entryStream(filePath, handle, entry),
        read: async () => {
          if (entry.size > MAX_TEXT_BYTES) {
            throw new Error(
              `${entry.name} is ${entry.size} bytes, too large to read at once; unzip it first`
            );
          }
          return collect(
            await entryStream(filePath, handle, entry),
            MAX_TEXT_BYTES
          );
        },
      }));
    return { entries, close: () => handle.close() };
  } catch (error) {
    await handle.close();
    throw error;
  }
};
