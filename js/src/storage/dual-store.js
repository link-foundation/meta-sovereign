/**
 * DualStore — write-through to both the binary (Doublets) and text
 * (`.lino`) backends so the unified database is always available in
 * both forms (R-A3). Reads are served from the binary side because it
 * is faster; the text side is treated as an authoritative export.
 *
 * `verify()` cross-checks the two backends and returns the set of
 * links that disagree; this is the primitive the backup job runs
 * before snapshotting (R-A4).
 *
 * The text side is the durable log; the binary side is a snapshot
 * written on an interval. `reconcile()` brings the binary side back in
 * line with the text (a snapshot that missed the last writes before a
 * crash) and is run when the server opens the store.
 *
 * `openDualStore(dir)` is how the server and the CLI open theirs: the
 * binary side mirrors the text side (`doublets-mirror.js`), so each link
 * is held in memory once.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createLinoTextStore } from './lino-store.js';
import { createDoubletsMirror } from './doublets-mirror.js';
import { acquireStoreLock } from './store-lock.js';
import { DIR_MODE, ensurePrivateDir, sweepTemp, tighten } from './durable.js';
import {
  checkReadOnly,
  migrateOpenStore,
  recoverJournal,
} from './migrations/node-runner.js';

const putEach = async (store, links) => {
  for (const link of links) {
    await store.put(link);
  }
};

export const createDualStore = ({ binary, text }) => ({
  async put(link) {
    await binary.put(link);
    await text.put(link);
    return link;
  },
  async putMany(links) {
    await (binary.putMany ? binary.putMany(links) : putEach(binary, links));
    await (text.putMany ? text.putMany(links) : putEach(text, links));
    return links;
  },
  async get(id) {
    return binary.get(id);
  },
  async delete(id) {
    const a = await binary.delete(id);
    const b = await text.delete(id);
    return a || b;
  },
  async query(filter) {
    return binary.query(filter);
  },
  scan: (filter, size, onBatch) => binary.scan?.(filter, size, onBatch),
  size: () => binary.size?.(),
  subscribe(h) {
    return binary.subscribe(h);
  },
  async flush() {
    await binary.flush?.();
    await text.flush?.();
  },
  /** `{ degraded, queuedBytes }`: whether the log's writes are failing (R-Z14). */
  health: () =>
    text.health?.() ?? { degraded: false, queuedBytes: 0, error: null },
  async reconcile() {
    if (binary.mirrors === text) {
      return binary.refresh();
    }
    const textLinks = await text.query();
    const binaryById = new Map((await binary.query()).map((l) => [l.id, l]));
    const stale = textLinks.filter((link) => {
      const other = binaryById.get(link.id);
      return !other || JSON.stringify(other) !== JSON.stringify(link);
    });
    for (const link of textLinks) {
      binaryById.delete(link.id);
    }
    const extra = [...binaryById.keys()];
    await (binary.putMany ? binary.putMany(stale) : putEach(binary, stale));
    for (const id of extra) {
      await binary.delete(id);
    }
    if (stale.length > 0 || extra.length > 0) {
      await binary.flush?.();
    }
    return { put: stale.length, deleted: extra.length };
  },
  async verify() {
    // A live mirror delegates both reads to this very same text store, as
    // reconcile() recognises above. There cannot be a logical difference;
    // serialising both copies blocks large stores for seconds for no benefit.
    if (binary.mirrors === text) {
      return [];
    }
    const a = await binary.query();
    const b = await text.query();
    const aMap = new Map(a.map((l) => [l.id, l]));
    const bMap = new Map(b.map((l) => [l.id, l]));
    const diffs = [];
    for (const [id, link] of aMap) {
      const other = bMap.get(id);
      if (!other || JSON.stringify(other) !== JSON.stringify(link)) {
        diffs.push({ id, binary: link, text: other ?? null });
      }
    }
    for (const [id, link] of bMap) {
      if (!aMap.has(id)) {
        diffs.push({ id, binary: null, text: link });
      }
    }
    return diffs;
  },
});

const readOnlyStore = (text, schema) => ({
  schema,
  migration: null,
  get: (id) => text.get(id),
  query: (filter) => text.query(filter),
  subscribe: (handler) => text.subscribe(handler),
  put: text.put,
  putMany: text.putMany,
  delete: text.delete,
  scan: text.scan,
  size: text.size,
  flush: async () => {},
  reconcile: async () => ({ put: 0, deleted: 0 }),
  corruptLines: text.corruptLines,
  health: () => ({ degraded: false, queuedBytes: 0, error: null }),
  readOnly: true,
  logFile: text.filePath, // streamed by a backup (R-Z16)
});

// A folder and everything below it (the downloaded pictures and files).
const tightenTree = async (folder) => {
  if (!(await fs.stat(folder).catch(() => null))) {
    return;
  }
  await tighten(folder, DIR_MODE);
  for (const entry of await fs
    .readdir(folder, { withFileTypes: true })
    .catch(() => [])) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      await tightenTree(full);
    } else if (entry.isFile()) {
      await tighten(full);
    }
  }
};

// Everything in the store folder is private to the user (R-Z2): the files
// are tightened when the store opens (cheap, idempotent); new ones are
// created 0600 by their writers.
const tightenFolder = async (dir) => {
  await tighten(dir, DIR_MODE);
  for (const name of ['data.lino', 'data.bin', 'data.lock']) {
    await tighten(path.join(dir, name));
  }
  for (const sub of ['logs', 'archives']) {
    const folder = path.join(dir, sub);
    await tighten(folder, DIR_MODE);
    for (const name of await fs.readdir(folder).catch(() => [])) {
      await tighten(path.join(folder, name));
    }
  }
  await tightenTree(path.join(dir, 'media'));
  await sweepTemp(dir);
};

/**
 * The store in `dir`: `data.lino` (the log) and `data.bin` (its mirror).
 * A writer takes the folder's lock (`store-lock.js`) and fails with code
 * `STORE_LOCKED` when another process holds it; `readOnly: true` takes no
 * lock, never writes or compacts, and works while `serve` runs.
 * `onCorrupt({ count, file })` hears of unreadable lines (never their text).
 * `onEvent({ level, event, ... })` hears of a full disk (R-Z14): store_degraded,
 * store_recovered, compaction_skipped, snapshot_skipped; and of the schema
 * (R-Z17): migration_started / _step / _done / _failed / _rolled_back,
 * schema_too_new, schema_old_read_only.
 *
 * A writer brings the store to the current schema before it returns
 * (`./migrations/node-runner.js`): STORE_TOO_NEW for a store written by a
 * newer version, LOW_DISK when there is no room to migrate, MIGRATION_FAILED
 * (the store is put back as it was). A read-only open never migrates: an
 * older store is read as it is, a newer one is refused. `store.schema` is
 * `{ version, current, migrated }`.
 */
export const openDualStore = async (
  dir,
  {
    onError,
    onCorrupt,
    onEvent = () => {},
    readOnly = false,
    measureFree,
    // Tests: another chain of migrations and the version it ends at.
    migrations,
    current,
  } = {}
) => {
  await ensurePrivateDir(dir);
  if (readOnly) {
    const text = await createLinoTextStore(path.join(dir, 'data.lino'), {
      readOnly: true,
      onCorrupt,
    });
    return readOnlyStore(text, await checkReadOnly({ text, onEvent, current }));
  }
  const lock = await acquireStoreLock(dir);
  try {
    await tightenFolder(dir);
    // A migration that did not finish is undone before the log is read.
    await recoverJournal(dir, onEvent);
    const text = await createLinoTextStore(path.join(dir, 'data.lino'), {
      onCorrupt,
      onEvent,
    });
    const schema = await migrateOpenStore({
      dir,
      text,
      onEvent,
      measureFree,
      migrations,
      current,
    });
    const binary = await createDoubletsMirror(path.join(dir, 'data.bin'), {
      text,
      onError,
      onEvent,
    });
    return {
      ...createDualStore({ binary, text }),
      schema,
      migration: schema.migrated,
      corruptLines: text.corruptLines,
      // What a backup streams, and the flush of just the log (R-Z16).
      logFile: text.filePath,
      flushLog: () => text.flush(),
      async close() {
        try {
          await binary.close();
          await text.flush();
        } finally {
          lock.release();
        }
      },
    };
  } catch (error) {
    lock.release();
    throw error;
  }
};
