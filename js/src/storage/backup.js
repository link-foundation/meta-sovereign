/**
 * Backup helper — snapshots a store into a single timestamped file in the
 * configured archive folder, and applies a simple keep-last-N retention
 * policy (R-A4).
 *
 * Archives are written and read as streams (format 2, `backup-archive.js`,
 * R-Z16): the store's log is gzipped line by line and sealed in 1 MB
 * authenticated frames (AES-256-GCM with a passphrase), so a multi-gigabyte
 * store backs up and restores in flat memory. `data.bin` is not archived: it
 * is a snapshot of the log and is rebuilt from it when the store opens.
 * Archives of the earlier format (one JSON document, `.json`/`.json.enc`)
 * still verify and restore.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setInterval, clearInterval } from 'node:timers';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { decodeLine, encodeLine } from 'lino-objects-codec';
import { createMemoryStore, putAll } from './universal.js';
import {
  CURRENT_SCHEMA,
  MIGRATIONS,
  SCHEMA_ID,
  runMigrations,
  schemaLink,
  versionOf,
} from './migrations/index.js';
import {
  ensurePrivateDir,
  fsyncDir,
  tighten,
  sweepTemp,
  writeStreamDurable,
} from './durable.js';
import { enoughSpace, skippedEvent } from './disk-space.js';
import { acquireStoreLock } from './store-lock.js';
import {
  archiveContent,
  archiveError,
  archiveStages,
  isArchiveFormat2,
  isSecretLine,
  logLines,
  quickCheckArchive,
  scanArchive,
} from './backup-archive.js';

const ENC_VERSION = 1;
const KDF_N = 1 << 14;

const deriveKey = (passphrase, salt) =>
  scryptSync(passphrase, salt, 32, { N: KDF_N });

/**
 * Encrypt a small text with AES-256-GCM. The output envelope is JSON with
 * base64 fields. (Used for single secrets and exports; backups of a whole
 * store are framed, see `backup-archive.js`.)
 */
export const encryptBackup = (plaintext, passphrase) => {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    version: ENC_VERSION,
    cipher: 'aes-256-gcm',
    kdf: { name: 'scrypt', N: KDF_N, r: 8, p: 1 },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  });
};

export const decryptBackup = (envelopeJson, passphrase) => {
  const env = JSON.parse(envelopeJson);
  if (env.cipher !== 'aes-256-gcm') {
    throw new Error(`unsupported cipher ${env.cipher}`);
  }
  const key = deriveKey(passphrase, Buffer.from(env.salt, 'base64'));
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(env.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(env.ct, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

const stamp = (d = new Date()) =>
  d.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace(/Z$/, '');

/** Whether `name` is one of our archives (format 2 `.msbk`, or the old `.json`). */
export const isBackupFile = (name) =>
  /^meta-sovereign-.*\.(json|msbk)(\.enc)?$/.test(name);

// A second backup into one folder at the same time fails fast.
const running = new Set();

const looksWhole = (raw, file, passphrase) => {
  if (!file.endsWith('.enc')) {
    return Array.isArray(JSON.parse(raw)?.links);
  }
  const env = JSON.parse(raw);
  const whole = ['salt', 'iv', 'tag', 'ct'].every(
    (k) => typeof env[k] === 'string' && env[k].length > 0
  );
  if (!whole || env.cipher !== 'aes-256-gcm') {
    return false;
  }
  return passphrase
    ? Array.isArray(JSON.parse(decryptBackup(raw, passphrase))?.links)
    : true;
};

/**
 * Whether the archive `file` is complete (R-Z2, R-Z16). A format 2 archive
 * is checked cheaply by default (its frames must end on the final one; no
 * passphrase needed); `full: true` reads and checks every frame, the
 * manifest, the line count and the SHA-256 (needs the passphrase of an
 * encrypted one). An old-format archive parses and holds a links array.
 * Never throws.
 */
export const verifyBackup = async (
  file,
  { passphrase = null, full = false } = {}
) => {
  try {
    if (await isArchiveFormat2(file)) {
      if (!full) {
        return await quickCheckArchive(file);
      }
      await scanArchive(file, { passphrase });
      return true;
    }
    return looksWhole(await fs.readFile(file, 'utf8'), file, passphrase);
  } catch {
    return false;
  }
};

// Free space a backup of `store` needs: gzip takes the text to about a
// third; a store without a log file is estimated from its link count.
const estimateBytes = async (store, passphrase) => {
  const text = store.logFile
    ? ((await fs.stat(store.logFile).catch(() => null))?.size ?? 0)
    : (await store.query()).length * 1024;
  return Math.ceil(text * 0.35 * (passphrase ? 1.02 : 1)) + 4096;
};

// Read the new archive back whole and compare it with what was written.
const confirmWritten = async (file, passphrase, stats) => {
  try {
    const read = await scanArchive(file, { passphrase });
    if (read.sha256 !== stats.sha256 || read.lines !== stats.lines) {
      throw new Error('content differs');
    }
  } catch (cause) {
    await fs.unlink(file).catch(() => {});
    throw Object.assign(new Error('the backup could not be read back'), {
      code: 'BACKUP_VERIFY_FAILED',
      cause,
    });
  }
};

/**
 * Write a backup and say what it holds: `{ file, links, secrets,
 * secretsExcluded, bytes, sha256 }` (`links` counts the log records
 * archived). The log is streamed up to the length it had when the backup
 * began, cut back to its last whole line, so writes landing meanwhile
 * cannot tear it. The archive is written atomically (temp file, fsync,
 * rename, fsync of the folder), 0600, then read back whole and compared
 * with what was written; one that does not verify is removed and the call
 * fails. Secrets (`secret:*` links) go in only when the archive is
 * encrypted; otherwise they are filtered out while streaming and the
 * manifest counts them (R-Z2). On a nearly full disk nothing is written
 * and the answer is `{ skipped: true, reason: 'low_disk', needed, free }`
 * (R-Z14).
 */
export const makeBackup = async (
  store,
  {
    archiveDir,
    now = new Date(),
    passphrase = null,
    onEvent = () => {},
    onProgress,
    measureFree,
  }
) => {
  await ensurePrivateDir(archiveDir);
  await tighten(archiveDir, 0o700);
  const space = await enoughSpace(
    archiveDir,
    await estimateBytes(store, passphrase),
    measureFree
  );
  if (!space.ok) {
    onEvent(skippedEvent('backup_skipped', space));
    return { skipped: true, reason: 'low_disk', ...space, links: 0 };
  }
  const folder = path.resolve(archiveDir);
  if (running.has(folder)) {
    throw archiveError('BACKUP_BUSY', 'a backup is already running');
  }
  running.add(folder);
  const file = path.join(
    archiveDir,
    `meta-sovereign-${stamp(now)}.msbk${passphrase ? '.enc' : ''}`
  );
  try {
    const { stream, stats } = archiveContent({
      store,
      createdAt: now.toISOString(),
      includeSecrets: Boolean(passphrase),
      schema: store.get ? versionOf(await store.get(SCHEMA_ID)) : null,
      encodeLine,
      onProgress,
    });
    await writeStreamDurable(file, stream, ...archiveStages(passphrase));
    await confirmWritten(file, passphrase, stats);
    return {
      file,
      links: stats.lines,
      secrets: passphrase ? 'included-encrypted' : 'excluded',
      secretsExcluded: stats.secretsExcluded,
      bytes: (await fs.stat(file)).size,
      sha256: stats.sha256,
    };
  } finally {
    running.delete(folder);
  }
};

export const createBackup = async (store, options) => {
  const made = await makeBackup(store, options);
  if (made.skipped) {
    throw Object.assign(new Error('not enough free disk space for a backup'), {
      code: 'LOW_DISK',
    });
  }
  return made.file;
};

/**
 * Keep the newest `keep` archives. Nothing is deleted unless the newest
 * archive verifies as complete (a crash or a full disk may have left a
 * truncated one that must not cost the older good ones), and leftover
 * temp files of a crashed write are swept (R-Z2). The check is the cheap
 * one (frame structure; the full read happened when it was written).
 */
export const pruneBackups = async ({ archiveDir, keep, passphrase = null }) => {
  await sweepTemp(archiveDir);
  const entries = await fs.readdir(archiveDir).catch(() => []);
  const ours = entries.filter(isBackupFile).sort();
  const toDelete = ours.slice(0, Math.max(0, ours.length - keep));
  if (keep < 1 || toDelete.length === 0) {
    return [];
  }
  const newest = path.join(archiveDir, ours[ours.length - 1]);
  if (!(await verifyBackup(newest, { passphrase }))) {
    return [];
  }
  for (const f of toDelete) {
    await fs.unlink(path.join(archiveDir, f));
  }
  return toDelete;
};

/**
 * Periodic backup scheduler (R-A4).
 *
 * Wraps `createBackup` + `pruneBackups` in a `setInterval` so a long-
 * lived process (`meta-sovereign serve`) can drop a snapshot every
 * `intervalMs` and keep at most `keep` archives. Returns `{ stop }`.
 *
 * Call sites that want a one-off snapshot still use `createBackup`
 * directly; this is purely for the long-running case.
 */
export const createBackupScheduler = ({
  store,
  archiveDir,
  intervalMs,
  keep = 0,
  passphrase = null,
  onBackup = () => {},
  onError = () => {},
  // A nearly full disk skips the run and says so (R-Z14, wired by R-Z7).
  onEvent = () => {},
  measureFree,
}) => {
  if (!archiveDir || !intervalMs) {
    throw new Error(
      'createBackupScheduler: archiveDir and intervalMs required'
    );
  }
  // One run at a time: a slow backup is not started over (R-Z7).
  let running = false;
  let current = Promise.resolve();
  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const made = await makeBackup(store, {
        archiveDir,
        passphrase,
        onEvent,
        measureFree,
      });
      if (made.skipped) {
        return;
      }
      if (keep > 0) {
        await pruneBackups({ archiveDir, keep, passphrase });
      }
      onBackup(made.file);
    } catch (err) {
      onError(err);
    } finally {
      running = false;
    }
  };
  // The run in flight, so that `stop()` can be waited for: a server that
  // closed mid-run would otherwise leave a new archive written and the old
  // ones not yet pruned (a race the Windows runners hit).
  const start = () => {
    if (!running) {
      current = tick();
    }
    return current;
  };
  const handle = setInterval(start, intervalMs);
  if (typeof handle.unref === 'function') {
    handle.unref();
  }
  return {
    runNow: start,
    // Resolves once the run in flight (if any) is done; never rejects.
    stop: () => {
      clearInterval(handle);
      return current.catch(() => {});
    },
  };
};

const tooNew = (version, current) =>
  Object.assign(
    new Error(
      `this backup was written by a newer version (schema ${version}, this app understands up to ${current}); update the app`
    ),
    { code: 'BACKUP_TOO_NEW', found: version, current }
  );

/**
 * The links of an old-format backup in the current shapes (R-Z17). A backup
 * of an older schema is migrated in memory, before anything is written to
 * the store, so a failing migration leaves the store untouched; one of a
 * newer schema is refused with BACKUP_TOO_NEW. The backup's own
 * `meta:schema` is never restored (the store keeps its own).
 */
export const linksOfManifest = async (
  manifest,
  { onEvent = () => {}, migrations = MIGRATIONS, current = CURRENT_SCHEMA } = {}
) => {
  const version = Number.isInteger(manifest?.schema?.version)
    ? manifest.schema.version
    : 0;
  if (version > current) {
    throw tooNew(version, current);
  }
  const links = manifest.links.filter((l) => l.id !== SCHEMA_ID);
  if (version === current) {
    return links;
  }
  const scratch = createMemoryStore();
  await scratch.putMany(links);
  onEvent({
    level: 'info',
    event: 'migration_started',
    from: version,
    to: current,
  });
  const summary = await runMigrations(scratch, {
    migrations,
    from: version,
    onEvent,
  });
  onEvent({
    level: 'info',
    event: 'migration_done',
    from: version,
    to: summary.to,
    changed: summary.changed,
  });
  return (await scratch.query()).filter((l) => l.id !== SCHEMA_ID);
};

// The schema a format 2 archive was written in; refuses a newer one.
const archiveSchema = (manifest) => {
  const version = manifest?.schema?.version;
  if (!Number.isInteger(version)) {
    return null;
  }
  if (version > CURRENT_SCHEMA) {
    throw tooNew(version, CURRENT_SCHEMA);
  }
  return version;
};

// Lower the store's schema stamp to the archive's, so the records restored
// in older shapes are migrated when the store next opens (R-Z17).
const stampOlder = async (store, version) => {
  if (version === null || version >= CURRENT_SCHEMA) {
    return;
  }
  const existing = await store.get(SCHEMA_ID);
  if (versionOf(existing) > version) {
    await store.put({
      ...schemaLink({ version, applied: existing?.applied ?? [] }),
      app: existing?.app ?? null,
    });
  }
};

const TOMBSTONE = '~deleted';
const isTombstone = (record) =>
  record?.[TOMBSTONE] === true && Object.keys(record).length === 2;

const BATCH = 500;

const malformed = () =>
  archiveError('BACKUP_INVALID', 'not a valid backup: a record is malformed');

const recordOfLine = (line) => {
  let record;
  try {
    record = decodeLine({ notation: line });
  } catch {
    throw malformed();
  }
  if (typeof record?.id !== 'string' || !record.id) {
    throw malformed();
  }
  return record;
};

// Replay the archive's records into `target`, a batch at a time.
const applyArchive = async (target, file, passphrase) => {
  let batch = [];
  let restored = 0;
  const flush = async () => {
    if (batch.length > 0) {
      await putAll(target, batch);
      restored += batch.length;
      batch = [];
    }
  };
  await scanArchive(file, {
    passphrase,
    onLine: async (line) => {
      const record = recordOfLine(line);
      if (record.id === SCHEMA_ID) {
        return; // the store keeps its own stamp (see stampOlder)
      }
      if (isTombstone(record)) {
        await flush();
        await target.delete(record.id);
        return;
      }
      batch.push(record);
      if (batch.length >= BATCH) {
        await flush();
      }
    },
  });
  await flush();
  return restored;
};

// The old format: one JSON document, checked whole before anything is written.
const restoreLegacy = async (store, file, passphrase, onEvent) => {
  let raw = await fs.readFile(file, 'utf8');
  if (file.endsWith('.enc')) {
    if (!passphrase) {
      throw new Error('encrypted backup requires a passphrase');
    }
    raw = decryptBackup(raw, passphrase);
  }
  const manifest = JSON.parse(raw);
  const valid =
    Array.isArray(manifest?.links) &&
    manifest.links.every((l) => l && typeof l === 'object' && l.id);
  if (!valid) {
    throw archiveError(
      'BACKUP_INVALID',
      'not a valid backup: links are malformed'
    );
  }
  return putAll(store, await linksOfManifest(manifest, { onEvent }));
};

/**
 * Put the archive's links into the open `store` and say how many (R-Z16).
 * The whole archive is read and checked first (every frame, the manifest,
 * the SHA-256, every record), so a damaged or tampered file changes
 * nothing; then its records are replayed in order, 500 at a time (a later
 * record replaces an earlier one, a tombstone deletes). Replaying is
 * idempotent: an interrupted restore is finished by running it again. The
 * store is the caller's open one, which holds the folder's lock, so
 * another process cannot write to the folder meanwhile (R-Z2); to replace
 * the store of a folder that no process has open, use `restoreBackupToDir`.
 */
export const restoreBackup = async (
  store,
  file,
  { passphrase = null, onEvent = () => {} } = {}
) => {
  if (!(await isArchiveFormat2(file))) {
    return restoreLegacy(store, file, passphrase, onEvent);
  }
  const { manifest } = await scanArchive(file, {
    passphrase,
    onLine: (line) => {
      recordOfLine(line);
    },
  });
  const version = archiveSchema(manifest);
  // The secret wrapper would seal the log's already sealed secrets again.
  const restored = await applyArchive(
    store.rawStore ?? store,
    file,
    passphrase
  );
  await stampOlder(store.rawStore ?? store, version);
  return restored;
};

// Write `line` to `out`, waiting when its buffer is full.
const emitLine = async (out, line) => {
  if (!out.write(`${line}\n`)) {
    await once(out, 'drain');
  }
};

// Feed `out` the archive's records, then (for a plain archive, which holds
// no secrets) the secrets of the log being replaced; end it when whole.
const feedRestored = async (out, file, { passphrase, oldLog }) => {
  try {
    const { manifest } = await scanArchive(file, {
      passphrase,
      onLine: (line) => emitLine(out, line),
    });
    if (oldLog && manifest.secrets === 'excluded') {
      for await (const line of logLines({ logFile: oldLog })) {
        if (isSecretLine(line)) {
          await emitLine(out, line);
        }
      }
    }
    out.end();
  } catch (error) {
    out.destroy(error);
  }
};

/**
 * Restore an archive as the store of the folder `dir` (R-Z16): the
 * archive is checked whole, then written to a temp file, fsynced and
 * renamed over `data.lino` in one step, so the folder holds the old store
 * or the whole new one, never half. Refuses (`STORE_LOCKED`) when another
 * process has the folder open, and (`BACKUP_TARGET_NOT_EMPTY`) when it
 * already holds a store unless `replace: true`; the replaced log is kept
 * beside it as `data.lino.before-restore-<time>`. A plain archive has no
 * secrets, so the folder's own `secret:*` lines are carried over. `data.bin`
 * is removed: it is rebuilt from the log when the store opens. Resolves to
 * the number of records restored.
 */
export const restoreBackupToDir = async (
  file,
  dir,
  { passphrase = null, replace = false } = {}
) => {
  if (!(await isArchiveFormat2(file))) {
    throw archiveError(
      'BACKUP_INVALID',
      'only format 2 backups restore into a folder'
    );
  }
  const checked = await scanArchive(file, { passphrase });
  archiveSchema(checked.manifest);
  await ensurePrivateDir(dir);
  const lock = await acquireStoreLock(dir);
  try {
    const log = path.join(dir, 'data.lino');
    const old = await fs.stat(log).catch(() => null);
    if (old && old.size > 0 && !replace) {
      throw archiveError(
        'BACKUP_TARGET_NOT_EMPTY',
        'the folder already holds a store (use replace)'
      );
    }
    if (old) {
      await fs.link(log, `${log}.before-restore-${stamp()}`);
    }
    const out = new PassThrough();
    const feeding = feedRestored(out, file, {
      passphrase,
      oldLog: old ? log : null,
    });
    await writeStreamDurable(log, out);
    await feeding;
    await fs.rm(path.join(dir, 'data.bin'), { force: true });
    await fsyncDir(dir);
    return checked.lines;
  } finally {
    lock.release();
  }
};
