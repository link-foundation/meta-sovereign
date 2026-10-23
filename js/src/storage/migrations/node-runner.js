/**
 * The Node adapter of the migration runner (R-Z17): runs the pending
 * migrations when a writer opens the store, before the server listens or
 * the CLI acts, and puts the store back as it was if one fails.
 *
 * Crash safety without copying the store: the log (`data.lino`) is
 * append-only, so before the first migration its byte length is written,
 * durably, to `migration.json`. A migration only appends to the log
 * (compaction is held, the binary snapshot is not running yet). If one
 * fails, or the process dies and the next open finds `migration.json`, the
 * log is truncated back to the recorded length (fsync), `data.bin` is
 * dropped (rebuilt from the log), and the journal is removed. After each
 * completed migration the journal moves forward to the new length, so a
 * stop between two keeps the first.
 *
 * Read-only opens never migrate: an older store is read as it is (readers
 * accept old shapes); a newer one is refused with STORE_TOO_NEW.
 */

import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { freeBytes } from '../disk-space.js';
import { fsyncDir, writeFileDurable } from '../durable.js';
import {
  CURRENT_SCHEMA,
  MIGRATIONS,
  SCHEMA_ID,
  migrationFailed,
  runMigrations,
  storeTooNew,
  versionOf,
} from './index.js';

export const JOURNAL = 'migration.json';

const MiB = 1024 * 1024;
/** Free space a migration wants: a tenth of the log and this much more. */
export const SPACE_FLOOR_BYTES = 256 * MiB;

const fail = (code, message, extra = {}) =>
  Object.assign(new Error(message), { code, ...extra });

/** The build's version, for `meta:schema.app` (best effort). */
export const appVersion = () => {
  try {
    const url = new URL('../../../../package.json', import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')).version ?? null;
  } catch {
    return null;
  }
};

const sizeOf = async (file) =>
  (await fs.stat(file).catch(() => null))?.size ?? 0;

const TAIL_BYTES = 32;

// Which file and which bytes the recorded length belongs to: the inode (when
// the system gives one), whether the log ends on a newline there, and the
// last bytes before that length. The content itself is never logged.
const fingerprint = async (file, logBytes) => {
  const handle = await fs.open(file, 'r').catch(() => null);
  if (!handle) {
    return { ino: 0, newline: true, tail: '' };
  }
  try {
    const stat = await handle.stat();
    const start = Math.max(0, logBytes - TAIL_BYTES);
    const tail = Buffer.alloc(logBytes - start);
    await handle.read(tail, 0, tail.length, start);
    return {
      ino: stat.ino || 0,
      newline: tail.length === 0 || tail[tail.length - 1] === 0x0a,
      tail: tail.toString('hex'),
    };
  } finally {
    await handle.close();
  }
};

const refuseTruncate = (dir, why) =>
  fail(
    'MIGRATION_FAILED',
    `the log in ${dir} does not match ${JOURNAL} (${why}); nothing was cut. Restore data.lino from a backup, or remove ${JOURNAL} only if you know the last migration finished`,
    { migration: null }
  );

// The log must still be the file the journal was written for, at least as
// long as recorded, and end there exactly as recorded: otherwise cutting
// it would destroy data.
const verifyJournal = async (dir, file, journal, size) => {
  if (size < journal.logBytes) {
    throw refuseTruncate(dir, 'the log is shorter than recorded');
  }
  const now = await fingerprint(file, journal.logBytes);
  const knownInode = now.ino && journal.ino;
  if (
    now.tail !== (journal.tail ?? now.tail) ||
    now.newline !== (journal.newline ?? now.newline) ||
    (knownInode && now.ino !== journal.ino)
  ) {
    throw refuseTruncate(dir, 'it is not the file the journal describes');
  }
};

const readJournal = async (dir) => {
  let raw;
  try {
    raw = await fs.readFile(path.join(dir, JOURNAL), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  try {
    const journal = JSON.parse(raw);
    if (Number.isInteger(journal?.logBytes) && journal.logBytes >= 0) {
      return journal;
    }
  } catch {
    // falls through
  }
  throw fail(
    'MIGRATION_FAILED',
    `${JOURNAL} in ${dir} is unreadable; the store was not opened. Restore data.lino from a backup or remove ${JOURNAL} only if you know the last migration finished`,
    { migration: null }
  );
};

const writeJournal = (dir, journal) =>
  writeFileDurable(path.join(dir, JOURNAL), JSON.stringify(journal));

const removeJournal = async (dir) => {
  await fs.unlink(path.join(dir, JOURNAL)).catch(() => {});
  await fsyncDir(dir);
};

const truncateTo = async (file, bytes) => {
  const handle = await fs.open(file, 'r+');
  try {
    await handle.truncate(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/**
 * A leftover journal means a migration did not finish: cut the log back to
 * the length it had, drop the binary snapshot (it is rebuilt), remove the
 * journal. Resolves to `{ rolledBack, truncated }`.
 */
export const recoverJournal = async (dir, onEvent = () => {}) => {
  const journal = await readJournal(dir);
  if (!journal) {
    return { rolledBack: false, truncated: 0 };
  }
  const file = path.join(dir, 'data.lino');
  const size = await sizeOf(file);
  await verifyJournal(dir, file, journal, size);
  const truncated = Math.max(0, size - journal.logBytes);
  if (truncated > 0) {
    await truncateTo(file, journal.logBytes);
  }
  await fs.unlink(path.join(dir, 'data.bin')).catch(() => {});
  await removeJournal(dir);
  onEvent({
    level: 'warn',
    event: 'migration_rolled_back',
    migration: journal.step ?? null,
    truncated,
  });
  return { rolledBack: true, truncated };
};

const lowDisk = (needed, free) =>
  fail(
    'LOW_DISK',
    `not enough free disk space to migrate the store: about ${Math.ceil(needed / MiB)} MB needed, ${Math.floor(free / MiB)} MB free. Free some space and start again; nothing was changed`,
    { needed, free }
  );

const spaceCheck = async (dir, logBytes, measure = freeBytes) => {
  const needed = Math.ceil(logBytes / 10) + SPACE_FLOOR_BYTES;
  const free = await measure(dir);
  if (free !== null && free < needed) {
    throw lowDisk(needed, free);
  }
};

// Run the pending steps with the log held to appends and journaled.
const runJournaled = async ({
  dir,
  text,
  migrations,
  current,
  app,
  onEvent,
}) => {
  const file = path.join(dir, 'data.lino');
  if (text.needsRewrite?.()) {
    await text.compact(); // an old format: rewritten now, before the length is taken
  }
  const release = text.holdCompaction?.() ?? (() => {});
  const from = versionOf(await text.get(SCHEMA_ID));
  try {
    await text.flush();
    const journal = {
      format: 1,
      from,
      to: current,
      startedAt: new Date().toISOString(),
      pid: process.pid,
      logBytes: 0,
      step: null,
    };
    const mark = async () => {
      journal.logBytes = await sizeOf(file);
      Object.assign(journal, await fingerprint(file, journal.logBytes));
      await writeJournal(dir, journal);
    };
    await mark();
    const summary = await runMigrations(text, {
      migrations,
      app,
      onEvent,
      before: async (m) => {
        journal.step = m.id;
        await writeJournal(dir, journal);
      },
      after: async () => {
        await text.flush();
        await mark();
      },
    });
    await text.flush();
    await removeJournal(dir);
    return summary;
  } catch (error) {
    await text.flush().catch(() => {});
    await recoverJournal(dir, onEvent).catch((rollback) =>
      onEvent({
        level: 'error',
        event: 'migration_rollback_failed',
        code: rollback.code ?? null,
      })
    );
    throw error;
  } finally {
    release();
  }
};

// Enough room, or LOW_DISK after saying why (nothing is changed).
const checkSpace = async (dir, measureFree, onEvent) => {
  try {
    await spaceCheck(
      dir,
      await sizeOf(path.join(dir, 'data.lino')),
      measureFree
    );
  } catch (error) {
    onEvent({
      level: 'error',
      event: 'migration_refused',
      code: error.code,
      needed: error.needed ?? null,
      free: error.free ?? null,
    });
    throw error;
  }
};

/**
 * Bring an open writer store to the current schema. Resolves to
 * `{ version, current, migrated }` (`migrated` is the run's summary, or
 * null when nothing ran); throws STORE_TOO_NEW, LOW_DISK or
 * MIGRATION_FAILED after logging why.
 */
export const migrateOpenStore = async ({
  dir,
  text,
  migrations = MIGRATIONS,
  current = CURRENT_SCHEMA,
  app = appVersion(),
  onEvent = () => {},
  measureFree,
}) => {
  const version = versionOf(await text.get(SCHEMA_ID));
  if (version > current) {
    onEvent({ level: 'error', event: 'schema_too_new', version, current });
    throw storeTooNew(version, current);
  }
  if (version === current) {
    return { version, current, migrated: null };
  }
  if (text.size() === 0) {
    // Nothing to migrate; no schema link is added to an empty store (it
    // would show up in every listing). Data written from now on is in the
    // current shapes, so it counts as current; a later open that finds data
    // under no marker runs the (idempotent) migrations once and stamps it.
    return { version: current, current, migrated: null };
  }
  await checkSpace(dir, measureFree, onEvent);
  onEvent({
    level: 'info',
    event: 'migration_started',
    from: version,
    to: current,
    pending: migrations.filter((m) => m.from >= version).length,
  });
  try {
    const migrated = await runJournaled({
      dir,
      text,
      migrations,
      current,
      app,
      onEvent,
    });
    onEvent({
      level: 'info',
      event: 'migration_done',
      from: migrated.from,
      to: migrated.to,
      changed: migrated.changed,
    });
    return { version: migrated.to, current, migrated };
  } catch (error) {
    onEvent({
      level: 'error',
      event: 'migration_failed',
      migration: error.migration ?? null,
      code: error.code ?? null,
    });
    throw error.code === 'MIGRATION_FAILED'
      ? error
      : migrationFailed(error.migration ?? 'unknown', error);
  }
};

/**
 * What a read-only open does: an older store is read as it is (and says
 * so), a newer one is refused. Resolves to `{ version, current, migrated: null }`.
 */
export const checkReadOnly = async ({
  text,
  current = CURRENT_SCHEMA,
  onEvent = () => {},
}) => {
  const version = versionOf(await text.get(SCHEMA_ID));
  if (version > current) {
    onEvent({ level: 'error', event: 'schema_too_new', version, current });
    throw storeTooNew(version, current);
  }
  if (version < current && text.size() > 0) {
    onEvent({
      level: 'info',
      event: 'schema_old_read_only',
      version,
      current,
    });
  }
  return { version, current, migrated: null };
};

/**
 * What a migration would change, without writing anything: opens nothing,
 * takes a store that has `scan`/`get` (a read-only one is fine).
 */
export const dryRunMigrations = async (
  store,
  { migrations = MIGRATIONS, onEvent = () => {} } = {}
) => runMigrations(store, { migrations, dryRun: true, onEvent });
