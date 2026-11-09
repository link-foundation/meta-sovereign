/** Independent, streamed Lino recovery files (issue #56).
 * Text: magic line, then one Lino object per line. Binary: magic line,
 * then uint32-BE length + published binary LINO typed-object packets.
 * Manifest, record and end packets use the same model in both formats.
 * A SHA-256 covers every byte before the end packet. This detects damage,
 * not malicious replacement. Raw dumps always exclude secret:* records;
 * the existing encrypted archive remains the way to recover credentials.
 */
import { createReadStream, promises as fs } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { decodeLine, encodeLine } from '../lino-objects.js';
import {
  encodeWire,
  decodeWire,
  LINO_LINE,
  LINO_BINARY,
} from '../transport/lino.js';
import {
  archiveError,
  archivePlainLines,
  isRecordLine,
} from './backup-archive.js';
import { writeStreamDurable } from './durable.js';

export const MAX_DUMP_RECORD_BYTES = 4 * 1024 * 1024;
export const RECOVERY_FORMATS = Object.freeze(['text', 'binary']);
const MAGIC = {
  text: Buffer.from('MSDUMP1T\n'),
  binary: Buffer.from('MSDUMP1B\n'),
};
const HEADER_BYTES = MAGIC.text.length;
const invalid = (message = 'the recovery dump is damaged or incomplete') =>
  archiveError('BACKUP_INVALID', message);

export const recoveryFormats = (value = RECOVERY_FORMATS) => {
  const list = Array.isArray(value) ? value : String(value).split(',');
  if (!list.every((format) => RECOVERY_FORMATS.includes(format))) {
    throw archiveError(
      'BACKUP_FORMAT',
      'recovery formats must be text, binary, or text,binary'
    );
  }
  return [...new Set(list)];
};

export const isRecoveryFile = (name) =>
  /^recovery-.*\.lino(\.bin)?$/.test(name);

export const recoveryFormatOf = async (file) => {
  const handle = await fs.open(file, 'r');
  try {
    const bytes = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return bytesRead === HEADER_BYTES
      ? (RECOVERY_FORMATS.find((format) => bytes.equals(MAGIC[format])) ?? null)
      : null;
  } finally {
    await handle.close();
  }
};

const packet = (value, format) => {
  const body = Buffer.from(
    encodeWire(value, format === 'text' ? LINO_LINE : LINO_BINARY)
  );
  if (body.length > MAX_DUMP_RECORD_BYTES) {
    throw invalid('a recovery record exceeds the 4 MiB limit');
  }
  if (format === 'text') {
    return Buffer.concat([body, Buffer.from('\n')]);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, body]);
};

const nextPacket = (pending, format) => {
  const end = format === 'text' ? pending.indexOf(10) : -1;
  const length =
    format === 'text'
      ? end
      : pending.length >= 4
        ? pending.readUInt32BE(0)
        : -1;
  if (
    length > MAX_DUMP_RECORD_BYTES ||
    (length < 0 && pending.length > MAX_DUMP_RECORD_BYTES + 4)
  ) {
    throw invalid('a recovery record exceeds the 4 MiB limit');
  }
  const size = format === 'text' ? length + 1 : length + 4;
  if (length < 0 || pending.length < size) {
    return null;
  }
  if (length === 0) {
    throw invalid();
  }
  const raw = pending.subarray(0, size);
  const body = format === 'text' ? raw.subarray(0, -1) : raw.subarray(4);
  return {
    raw,
    value: decodeWire(body, format === 'text' ? LINO_LINE : LINO_BINARY),
  };
};

// Decode incrementally, rejecting a declared oversized packet before allocation.
async function* packets(file, format) {
  let pending = Buffer.alloc(0);
  for await (const chunk of createReadStream(file, { start: HEADER_BYTES })) {
    pending = Buffer.concat([pending, chunk]);
    let next;
    while ((next = nextPacket(pending, format))) {
      yield next;
      pending = pending.subarray(next.raw.length);
    }
  }
  if (pending.length) {
    throw invalid();
  }
}

const checkedManifest = (value) => {
  if (
    value?.kind !== 'manifest' ||
    value.format !== 'meta-sovereign-recovery' ||
    value.version !== 1 ||
    value.secrets !== 'excluded'
  ) {
    throw invalid('not a supported recovery manifest');
  }
  return value;
};

const checkedRecordLine = (value) => {
  const record = value?.value;
  if (
    value?.kind !== 'record' ||
    !record ||
    Array.isArray(record) ||
    typeof record.id !== 'string' ||
    !record.id ||
    record.id.startsWith('secret:')
  ) {
    throw invalid('a recovery record is malformed');
  }
  return encodeLine({ obj: record });
};

/** Checked completely before restore writes anything. onLine uses the existing
 * archive replay interface, including tombstones, migrations and batch limits.
 */
export const scanRecoveryDump = async (file, { onLine } = {}) => {
  const format = await recoveryFormatOf(file);
  if (!format) {
    throw invalid();
  }
  const hash = createHash('sha256').update(MAGIC[format]);
  let manifest = null;
  let trailer = null;
  let lines = 0;
  for await (const { raw, value } of packets(file, format)) {
    if (trailer) {
      throw invalid('data after the recovery trailer');
    }
    if (!manifest) {
      manifest = checkedManifest(value);
    } else if (value?.kind === 'end') {
      trailer = value;
      continue;
    } else {
      const line = checkedRecordLine(value);
      lines += 1;
      await onLine?.(line);
    }
    hash.update(raw);
  }
  const sha256 = hash.digest('hex');
  if (!trailer || trailer.lines !== lines || trailer.sha256 !== sha256) {
    throw invalid();
  }
  return { manifest, trailer, lines, sha256, format };
};

const content = (archive, { format, passphrase, manifest, stats }) => {
  async function* emit() {
    const hash = createHash('sha256');
    const hashed = (bytes) => {
      hash.update(bytes);
      return bytes;
    };
    yield hashed(MAGIC[format]);
    yield hashed(
      packet(
        {
          ...manifest,
          kind: 'manifest',
          format: 'meta-sovereign-recovery',
          version: 1,
          secrets: 'excluded',
        },
        format
      )
    );
    for await (const line of archivePlainLines(archive, { passphrase })) {
      if (!isRecordLine(line)) {
        continue;
      }
      const record = decodeLine({ notation: line });
      if (typeof record?.id !== 'string' || !record.id) {
        throw invalid('a source archive record is malformed');
      }
      if (record.id.startsWith('secret:')) {
        stats.secretsExcluded += 1;
        continue;
      }
      stats.lines += 1;
      yield hashed(packet({ kind: 'record', value: record }, format));
    }
    stats.sha256 = hash.digest('hex');
    yield packet({ kind: 'end', ...stats }, format);
  }
  return Readable.from(emit(), { objectMode: false });
};

/** Both files are derived from the SAME verified archive, not two live queries.
 * A failed pair is removed; earlier recovery points are never pruned on failure.
 */
export const writeRecoveryDumps = async (
  archive,
  { formats, passphrase, manifest, secretsExcluded = 0 }
) => {
  const prefix = path.join(
    path.dirname(archive),
    `recovery-${manifest.createdAt.replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`
  );
  const written = [];
  const result = [];
  try {
    for (const format of recoveryFormats(formats)) {
      const file = `${prefix}.lino${format === 'binary' ? '.bin' : ''}`;
      const stats = { lines: 0, secretsExcluded, sha256: null };
      written.push(file);
      await writeStreamDurable(
        file,
        content(archive, { format, passphrase, manifest, stats })
      );
      const checked = await scanRecoveryDump(file);
      if (checked.sha256 !== stats.sha256 || checked.lines !== stats.lines) {
        throw invalid('the recovery dump could not be read back');
      }
      result.push({
        file,
        format,
        links: stats.lines,
        secrets: 'excluded',
        secretsExcluded: stats.secretsExcluded,
        sha256: stats.sha256,
        bytes: (await fs.stat(file)).size,
      });
    }
    return result;
  } catch (error) {
    for (const file of written) {
      await fs.unlink(file).catch(() => {});
    }
    throw error;
  }
};

export const pruneRecoveryDumps = async ({ archiveDir, keep }) => {
  if (!Number.isInteger(keep) || keep < 1) {
    return [];
  }
  const files = (await fs.readdir(archiveDir)).filter(isRecoveryFile).sort();
  const removed = [];
  for (const format of RECOVERY_FORMATS) {
    const group = files.filter(
      (file) => file.endsWith('.bin') === (format === 'binary')
    );
    if (group.length <= keep) {
      continue;
    }
    try {
      await scanRecoveryDump(path.join(archiveDir, group.at(-1)));
    } catch {
      continue;
    }
    for (const file of group.slice(0, -keep)) {
      await fs.unlink(path.join(archiveDir, file));
      removed.push(file);
    }
  }
  return removed;
};
