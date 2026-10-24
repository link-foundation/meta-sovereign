/**
 * The streaming backup archive, format 2 (R-Z16).
 *
 * A real store is gigabytes: the old archive (one JSON string holding every
 * link) cannot even be built past V8's string limit. Format 2 is read and
 * written a piece at a time, so memory stays flat whatever the store size.
 *
 * Plain content (what is gzipped), line by line:
 *
 *   {"format":"meta-sovereign-backup","version":2,"createdAt":...,"secrets":...}
 *   <one Links Notation record per line, the store's log as it was>
 *   #end {"lines":N,"secretsExcluded":K,"bytes":B,"sha256":"<of every line above>"}
 *
 * File on disk: a 28-byte header, then frames of the gzip stream:
 *
 *   header = "MSBK2\n" | mode (0 plain, 1 AES-256-GCM) | 0 | salt(16) | nonce prefix(4)
 *   frame  = final flag (1) | length (4, BE) | data (length) | tag (16)
 *
 * Every frame (up to 1 MB) is sealed on its own: AES-256-GCM with the
 * nonce `prefix | frame index`, or (no passphrase) a SHA-256 check tag. The
 * additional data is `header | index | final flag`, so a flipped byte, a
 * reordered or dropped frame, and a file cut short are all detected, and
 * a frame is checked before any of it is used. The key is scrypt of the
 * passphrase and the salt, as before.
 */

import { createReadStream, promises as fs } from 'node:fs';
import { createGunzip, createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
} from 'node:crypto';
import { decodeLine } from 'lino-objects-codec';

export const FRAME_BYTES = 1024 * 1024;
const MAGIC = Buffer.from('MSBK2\n');
const HEADER_BYTES = 28;
const TAG_BYTES = 16;
const KDF_N = 1 << 14;
export const FORMAT = 'meta-sovereign-backup';
const TRAILER = '#end ';

/** An error a person can act on, with a stable `code`. */
export const archiveError = (code, message) =>
  Object.assign(new Error(message), { code });

const deriveKey = (passphrase, salt) =>
  new Promise((resolve, reject) =>
    scrypt(passphrase, salt, 32, { N: KDF_N }, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  );

const aadOf = (header, index, final) => {
  const tail = Buffer.alloc(9);
  tail.writeBigUInt64BE(BigInt(index), 0);
  tail[8] = final ? 1 : 0;
  return Buffer.concat([header, tail]);
};

const nonceOf = (header, index) => {
  const nonce = Buffer.alloc(12);
  header.copy(nonce, 0, 24, 28);
  nonce.writeBigUInt64BE(BigInt(index), 4);
  return nonce;
};

// The check tag of a plain frame: it catches damage, not a forger (nobody
// can promise that without a key).
const plainTag = (aad, data) =>
  createHash('sha256').update(aad).update(data).digest().subarray(0, TAG_BYTES);

const sealFrame = ({ header, key }, index, final, data) => {
  const aad = aadOf(header, index, final);
  let body = data;
  let tag;
  if (key) {
    const cipher = createCipheriv('aes-256-gcm', key, nonceOf(header, index));
    cipher.setAAD(aad);
    body = Buffer.concat([cipher.update(data), cipher.final()]);
    tag = cipher.getAuthTag();
  } else {
    tag = plainTag(aad, data);
  }
  const head = Buffer.alloc(5);
  head[0] = final ? 1 : 0;
  head.writeUInt32BE(body.length, 1);
  return Buffer.concat([head, body, tag]);
};

/** A pipeline stage: gzip chunks in, sealed frames (header first) out. */
export const sealStage = (passphrase) =>
  async function* seal(source) {
    const salt = passphrase ? randomBytes(16) : Buffer.alloc(16);
    const header = Buffer.concat([
      MAGIC,
      Buffer.from([passphrase ? 1 : 0, 0]),
      salt,
      randomBytes(4),
    ]);
    const key = passphrase ? await deriveKey(passphrase, salt) : null;
    const ctx = { header, key };
    yield header;
    let index = 0;
    let pending = [];
    let size = 0;
    for await (const chunk of source) {
      pending.push(chunk);
      size += chunk.length;
      if (size > FRAME_BYTES) {
        const all = Buffer.concat(pending);
        let at = 0;
        while (all.length - at > FRAME_BYTES) {
          yield sealFrame(
            ctx,
            index,
            false,
            all.subarray(at, at + FRAME_BYTES)
          );
          index += 1;
          at += FRAME_BYTES;
        }
        pending = [all.subarray(at)];
        size = all.length - at;
      }
    }
    // The last frame is always sealed as such, even when empty.
    yield sealFrame(ctx, index, true, Buffer.concat(pending));
  };

// A reader that hands out exact byte counts from a stream of chunks.
const createTaker = (source) => {
  const iterator = source[Symbol.asyncIterator]();
  let list = [];
  let have = 0;
  let done = false;
  return async (count) => {
    while (have < count && !done) {
      const next = await iterator.next();
      if (next.done) {
        done = true;
      } else {
        list.push(next.value);
        have += next.value.length;
      }
    }
    if (have < count) {
      return null;
    }
    const all = Buffer.concat(list);
    list = all.length > count ? [all.subarray(count)] : [];
    have = all.length - count;
    return all.subarray(0, count);
  };
};

const truncated = () =>
  archiveError(
    'BACKUP_TRUNCATED',
    'the backup file is cut short (incomplete write or copy)'
  );

const openFrame = ({ header, key }, index, frame, tag) => {
  const final = frame.final;
  const aad = aadOf(header, index, final);
  if (key) {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      nonceOf(header, index)
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(frame.data), decipher.final()]);
  }
  if (!plainTag(aad, frame.data).equals(tag)) {
    throw new Error('frame check failed');
  }
  return frame.data;
};

const readHeader = async (take, passphrase) => {
  const header = await take(HEADER_BYTES);
  if (!header || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw archiveError('BACKUP_INVALID', 'not a meta-sovereign backup file');
  }
  const encrypted = header[6] === 1;
  if (encrypted && !passphrase) {
    throw archiveError(
      'BACKUP_PASSPHRASE_REQUIRED',
      'encrypted backup requires a passphrase'
    );
  }
  const key = encrypted
    ? await deriveKey(passphrase, header.subarray(8, 24))
    : null;
  return { header, key, encrypted };
};

// A frame that does not open: the first of an encrypted file is most
// likely a wrong passphrase, any other a changed or reordered file.
const failedFrame = (index, encrypted) =>
  index === 0 && encrypted
    ? archiveError(
        'BACKUP_BAD_PASSPHRASE',
        'wrong passphrase, or the backup file is damaged'
      )
    : archiveError(
        'BACKUP_TAMPERED',
        `the backup file was changed or reordered (frame ${index})`
      );

/**
 * The gzip bytes of an archive file, frame by frame, each checked before
 * it is handed on. Throws `BACKUP_*` errors: PASSPHRASE_REQUIRED, INVALID
 * (not an archive), TRUNCATED, BAD_PASSPHRASE (the first frame does not
 * open), TAMPERED (a later frame does not).
 */
export async function* unframe(source, { passphrase = null } = {}) {
  const take = createTaker(source);
  const { header, key, encrypted } = await readHeader(take, passphrase);
  for (let index = 0; ; index += 1) {
    const head = await take(5);
    const length = head?.readUInt32BE(1);
    if (length > FRAME_BYTES) {
      throw archiveError('BACKUP_INVALID', 'the backup file is damaged');
    }
    const body = head && (await take(length + TAG_BYTES));
    if (!body) {
      throw truncated();
    }
    const frame = { final: head[0] === 1, data: body.subarray(0, length) };
    let data;
    try {
      data = openFrame({ header, key }, index, frame, body.subarray(length));
    } catch {
      throw failedFrame(index, encrypted);
    }
    yield data;
    if (frame.final) {
      if (await take(1)) {
        throw archiveError(
          'BACKUP_INVALID',
          'data after the end of the backup'
        );
      }
      return;
    }
  }
}

// '\n'-separated lines of a byte stream (a line is never split by a chunk).
async function* linesOf(source) {
  const decoder = new StringDecoder('utf8');
  let rest = '';
  for await (const chunk of source) {
    rest += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let at = rest.indexOf('\n');
    while (at !== -1) {
      yield rest.slice(0, at);
      rest = rest.slice(at + 1);
      at = rest.indexOf('\n');
    }
  }
  rest += decoder.end();
  if (rest.length > 0) {
    yield rest;
  }
}

export const isRecordLine = (line) => line.startsWith('(');

const parseManifest = (line) => {
  let manifest;
  try {
    manifest = JSON.parse(line);
  } catch {
    manifest = null;
  }
  if (manifest?.format !== FORMAT || manifest.version !== 2) {
    throw archiveError('BACKUP_INVALID', 'not a meta-sovereign backup file');
  }
  return manifest;
};

const parseTrailer = (line) => {
  try {
    return JSON.parse(line.slice(TRAILER.length));
  } catch {
    throw archiveError('BACKUP_INVALID', 'the backup trailer is unreadable');
  }
};

const checkTrailer = ({ manifest, trailer, lines }, sha256) => {
  if (!manifest || !trailer) {
    throw truncated();
  }
  if (trailer.sha256 !== sha256 || trailer.lines !== lines) {
    throw archiveError(
      'BACKUP_INVALID',
      'the backup content does not match its trailer'
    );
  }
};

// Sort one plain line into the manifest, the trailer or a record; true for
// a record (which the caller hears).
const takeLine = (seen, line) => {
  if (seen.trailer) {
    throw archiveError('BACKUP_INVALID', 'data after the backup trailer');
  }
  if (!seen.manifest) {
    seen.manifest = parseManifest(line);
    return false;
  }
  if (line.startsWith(TRAILER)) {
    seen.trailer = parseTrailer(line);
    return false;
  }
  if (line.length === 0) {
    return false;
  }
  seen.lines += 1;
  return true;
};

/**
 * Read a whole archive, checking everything: every frame, the manifest,
 * the trailer's line count and SHA-256. `onLine(line)` hears each record
 * line (awaited, so it can write them somewhere). Resolves to
 * `{ manifest, trailer, lines, sha256 }`; nothing is trusted before it
 * does, so a caller that applies lines as they come should scan once first.
 */
export const scanArchive = async (file, { passphrase, onLine } = {}) => {
  const hash = createHash('sha256');
  const seen = { manifest: null, trailer: null, lines: 0 };
  let fromCaller = null; // an error of `onLine` is the caller's, not damage
  const hear = async (line) => {
    try {
      await onLine?.(line);
    } catch (error) {
      fromCaller = error;
      throw error;
    }
  };
  const gunzip = createGunzip();
  const text = Readable.from(unframe(createReadStream(file), { passphrase }));
  const plain = text.pipe(gunzip);
  text.on('error', (error) => gunzip.destroy(error));
  try {
    for await (const line of linesOf(plain)) {
      if (takeLine(seen, line)) {
        await hear(line);
      }
      if (!seen.trailer) {
        hash.update(`${line}\n`);
      }
    }
  } catch (error) {
    text.destroy();
    if (error === fromCaller || error.code?.startsWith?.('BACKUP_')) {
      throw error;
    }
    throw archiveError('BACKUP_TRUNCATED', 'the backup file is damaged');
  }
  const sha256 = hash.digest('hex');
  const { manifest, trailer, lines } = seen;
  checkTrailer(seen, sha256);
  return { manifest, trailer, lines, sha256 };
};

/**
 * The cheap check (no passphrase, no decompression): walk the frame
 * headers; the file must end exactly on a frame marked final. Catches a
 * file cut short; a flipped byte needs `scanArchive`.
 */
export const quickCheckArchive = async (file) => {
  const handle = await fs.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const head = Buffer.alloc(HEADER_BYTES);
    const read = await handle.read(head, 0, HEADER_BYTES, 0);
    if (read.bytesRead < HEADER_BYTES || !head.subarray(0, 6).equals(MAGIC)) {
      return false;
    }
    let at = HEADER_BYTES;
    const frame = Buffer.alloc(5);
    for (;;) {
      if (at + 5 > size) {
        return false;
      }
      await handle.read(frame, 0, 5, at);
      at += 5 + frame.readUInt32BE(1) + TAG_BYTES;
      if (at > size) {
        return false;
      }
      if (frame[0] === 1) {
        return at === size;
      }
    }
  } finally {
    await handle.close();
  }
};

/** Whether `bytes` start an archive of format 2. */
export const isArchiveFormat2 = async (file) => {
  const handle = await fs.open(file, 'r');
  try {
    const head = Buffer.alloc(MAGIC.length);
    await handle.read(head, 0, MAGIC.length, 0);
    return head.equals(MAGIC);
  } finally {
    await handle.close();
  }
};

// The last newline in the first `size` bytes of the log: where a snapshot
// of the log taken now ends. A torn last append (no newline) is left out.
export const lastNewlineEnd = async (handle, size) => {
  const block = Buffer.alloc(64 * 1024);
  let end = size;
  while (end > 0) {
    const start = Math.max(0, end - block.length);
    const { bytesRead } = await handle.read(block, 0, end - start, start);
    const at = block.subarray(0, bytesRead).lastIndexOf(0x0a);
    if (at !== -1) {
      return start + at + 1;
    }
    end = start;
  }
  return 0;
};

const idOf = (line) => {
  try {
    return decodeLine({ notation: line })?.id;
  } catch {
    return undefined;
  }
};

export const isSecretLine = (line) =>
  line.includes('secret:') &&
  typeof idOf(line) === 'string' &&
  idOf(line).startsWith('secret:');

// Raw record lines of the store's log up to its length now (appends that
// land during the backup are after that point and are not read).
export async function* logLines(store, onError) {
  await store.flushLog?.();
  const handle = await fs.open(store.logFile, 'r').catch((error) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });
  if (!handle) {
    return;
  }
  try {
    const { size } = await handle.stat();
    const end = await lastNewlineEnd(handle, size);
    if (end === 0) {
      return;
    }
    const input = handle.createReadStream({
      start: 0,
      end: end - 1,
      autoClose: false,
    });
    for await (const line of linesOf(input)) {
      if (isRecordLine(line)) {
        yield line;
      } else if (line.trim().length > 0) {
        onError?.(line); // legacy or damaged text: not archived
      }
    }
  } finally {
    await handle.close();
  }
}

// Encoded links of a store that has no log file (memory stores, tests).
async function* queriedLines(store, encodeLine) {
  const links = await store.query();
  for (const link of links) {
    yield encodeLine({ obj: link });
  }
}

/**
 * The plain content of an archive as an async stream of strings, and the
 * running `stats` ({ lines, secretsExcluded, skipped, bytes, sha256 }; the
 * hash is final once the stream ended). Secrets are filtered while
 * streaming unless `includeSecrets`.
 */
export const archiveContent = ({
  store,
  createdAt,
  includeSecrets,
  encodeLine,
  onProgress,
  schema = null,
}) => {
  const stats = {
    lines: 0,
    secretsExcluded: 0,
    skipped: 0,
    bytes: 0,
    sha256: null,
  };
  const hash = createHash('sha256');
  const emit = (text) => {
    hash.update(text);
    stats.bytes += Buffer.byteLength(text);
    return text;
  };
  async function* content() {
    yield emit(
      `${JSON.stringify({
        format: FORMAT,
        version: 2,
        createdAt,
        secrets: includeSecrets ? 'included-encrypted' : 'excluded',
        // The data schema the records are in (R-Z17).
        schema: schema === null ? undefined : { version: schema },
        source: store.logFile ? 'log' : 'links',
      })}\n`
    );
    const lines = store.logFile
      ? logLines(store, () => (stats.skipped += 1))
      : queriedLines(store, encodeLine);
    let batch = '';
    for await (const line of lines) {
      if (!includeSecrets && isSecretLine(line)) {
        stats.secretsExcluded += 1;
        continue;
      }
      stats.lines += 1;
      batch += `${line}\n`;
      if (batch.length >= 256 * 1024) {
        yield emit(batch);
        batch = '';
        onProgress?.(stats);
      }
    }
    if (batch) {
      yield emit(batch);
    }
    stats.sha256 = hash.digest('hex');
    yield `${TRAILER}${JSON.stringify({
      lines: stats.lines,
      secretsExcluded: stats.secretsExcluded,
      bytes: stats.bytes,
      sha256: stats.sha256,
    })}\n`;
  }
  return { stream: Readable.from(content(), { objectMode: false }), stats };
};

/** The stages from content to sealed frames: `pipeline(content, ...stages, sink)`. */
export const archiveStages = (passphrase) => [
  createGzip({ level: 4 }),
  sealStage(passphrase),
];
