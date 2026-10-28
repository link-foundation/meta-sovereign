/**
 * LinoTextStore — UniversalLinksAccess over the text half of the
 * associative stack: a `.lino` file in Links Notation with one record per
 * line, encoded by `lino-objects-codec` so every field (bodies with new
 * lines and quotes, numbers, booleans, null, nested objects) round-trips
 * exactly and every line parses with the upstream `links-notation`
 * parser (R-A2, R-A3, R-A5, issue #31):
 *
 *   (o: (id "msg:vk:1") (tokens ("msg" "vk" "1")) (body "Привет") ...)
 *
 * The file is a log: a put appends its records and a delete appends a
 * tombstone (`{ id, '~deleted': true }`, exactly those two keys), so a
 * write costs the size of what changed, not of the whole store. On load
 * the records apply in order (a later one replaces an earlier one with
 * the same id). Once superseded lines outnumber the live links (and pass
 * `compactAfter`), or superseded text outweighs the live text (and passes
 * `compactBytes` characters), the file is rewritten with one line per
 * live link.
 *
 * Files written by the earlier indented `id token…` format (which kept
 * only id/tokens/children) are still read and are rewritten in the
 * record format on the next write.
 */

import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { decodeLine, encodeLine } from 'lino-objects-codec';
import { createMemoryStore } from './universal.js';
import { parseLino } from './lino.js';
import {
  FILE_MODE,
  fsyncDir,
  fsyncFile,
  renameDurable,
  tighten,
} from './durable.js';
import { enoughSpace, skippedEvent } from './disk-space.js';
import { createWriteQueue, storeError, writeFailed } from './write-queue.js';
import { replayLogTail } from './lino-handoff.js';

const legacyNodeToLink = (node) => {
  const [id, ...tokens] = node.tokens;
  const children = node.children
    .filter((c) => c.tokens[0] === 'child')
    .map((c) => c.tokens[1]);
  return { id, tokens, children };
};

const isRecordLine = (line) => line.startsWith('(');

/** Format links as Links Notation text, one record per line. */
export const formatLinoRecords = (links) =>
  links.map((obj) => `${encodeLine({ obj })}\n`).join('');

/** Parse `.lino` text (record lines or the legacy indented format). */
export const parseLinoRecords = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  if (lines.some(isRecordLine)) {
    return lines
      .filter(isRecordLine)
      .map((notation) => decodeLine({ notation }));
  }
  return parseLino(text).map(legacyNodeToLink);
};

// A delete, as a record: cannot be mistaken for a link (no `tokens`).
export const TOMBSTONE_KEY = '~deleted';

export const tombstoneRecord = (id) => ({ id, [TOMBSTONE_KEY]: true });

const isTombstoneRecord = (record) =>
  record?.[TOMBSTONE_KEY] === true && Object.keys(record).length === 2;

/**
 * The links a record log describes, in the memory store's order: a later
 * record replaces an earlier one in place, a tombstone deletes.
 */
export const applyLinoRecords = (records) => {
  const byId = new Map();
  for (const record of records) {
    if (typeof record?.id !== 'string') {
      continue;
    }
    if (isTombstoneRecord(record)) {
      byId.delete(record.id);
    } else {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()];
};

const COMPACT_AFTER = 5000;
// Superseded text worth a rewrite even when the lines are few: one large
// record written again and again (a sync state) grew a log to gigabytes.
const COMPACT_BYTES = 64 * 1024 * 1024;
// Records per chunk when the file is rewritten (no giant string).
const CHUNK = 1000;

const isLegacyText = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.length > 0 && !lines.some(isRecordLine);
};

// Lines that could not be read (R-Z2): counted, and kept (up to a cap) so
// a compaction can put them in a quarantine file instead of destroying
// them. Past the cap the count still grows and compaction stays off.
const BAD_KEEP = 10_000;
const createBadLines = () => ({ count: 0, lines: [], overflow: false });
const noteBad = (bad, line) => {
  if (line.trim().length === 0) {
    return;
  }
  bad.count += 1;
  if (bad.lines.length < BAD_KEEP) {
    bad.lines.push(line);
  } else {
    bad.overflow = true;
  }
};

// Record lines that decode; a line cut short by a crash mid-append (or a
// garbled one) is set aside in `bad` instead of making the whole store
// unreadable.
const readRecordLines = (text, bad = createBadLines()) => {
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!isRecordLine(line)) {
      noteBad(bad, line);
      continue;
    }
    try {
      records.push(decodeLine({ notation: line }));
    } catch {
      noteBad(bad, line);
    }
  }
  return records;
};

// Short strings repeat across records (tokens, types, chat ids, dates):
// while a file loads each is kept once, as the binary side's names are,
// and every record is rebuilt as plain objects — half the memory of the
// decoder's own (measured on a 200k-message store).
const INTERN_MAX = 64;
// A decoded string can be a slice of its whole line, which would keep
// every line of the file in memory; this is a copy of its own.
const ownCopy = (text) => (text.length < 13 ? text : ` ${text}`.slice(1));
const createInterner = () => {
  const seen = new Map();
  const intern = (value) => {
    if (typeof value === 'string') {
      if (value.length > INTERN_MAX) {
        return ownCopy(value);
      }
      const known = seen.get(value);
      if (known !== undefined) {
        return known;
      }
      const own = ownCopy(value);
      seen.set(own, own);
      return own;
    }
    if (Array.isArray(value)) {
      return value.map(intern);
    }
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value)) {
        out[key] = intern(value[key]);
      }
      return out;
    }
    return value;
  };
  return intern;
};

// The live links of a record log, read a line at a time: a large store
// is never held as one string, and a superseded record is dropped as
// soon as a later one replaces it.
const streamRecords = async (filePath, readLimit) => {
  const byId = new Map();
  const sizes = new Map(); // id -> its live line's length
  const intern = createInterner();
  let lines = 0;
  let chars = 0; // of the whole file, superseded lines too
  let open = false;
  const bad = createBadLines();
  const input = createReadStream(filePath, {
    encoding: 'utf8',
    ...(readLimit > 0 ? { end: readLimit - 1 } : {}),
  });
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    chars += line.length + 1;
    if (!isRecordLine(line)) {
      noteBad(bad, line);
      continue;
    }
    let record;
    try {
      record = decodeLine({ notation: line });
    } catch {
      noteBad(bad, line); // a torn last line, or damage: quarantined later
      continue;
    }
    lines += 1;
    if (typeof record?.id !== 'string') {
      continue;
    }
    if (isTombstoneRecord(record)) {
      byId.delete(record.id);
      sizes.delete(record.id);
    } else {
      // The key a copy too: a slice of its line would keep the line.
      const id = ownCopy(record.id);
      byId.set(id, intern(record));
      sizes.set(id, line.length + 1);
    }
  }
  let statResult;
  try {
    statResult = await fs.stat(filePath);
  } catch (err) {
    // ENOENT: removed between the readline and here (e.g. a test tears down
    // its temp dir while the snapshot worker is mid-stream). The data we
    // already read is valid; treat the file as closed.
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  if (statResult && statResult.size > 0) {
    // A file not ending in a newline (a torn append) gets one first.
    const handle = await fs.open(filePath, 'r');
    try {
      const last = Buffer.alloc(1);
      await handle.read(last, 0, 1, (readLimit ?? statResult.size) - 1);
      open = last[0] !== 0x0a;
    } finally {
      await handle.close();
    }
  }
  const live = [...byId.values()];
  return { live, lines, legacy: false, open, sizes, chars, bad };
};

// The first line that is not blank: the legacy format has no records.
const firstLine = async (filePath) => {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const reader = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      if (line.trim().length > 0) {
        return line;
      }
    }
    return null;
  } finally {
    reader.close();
    input.destroy();
  }
};

// The lines of the first `size` bytes of an open file (what was there
// when it was opened: a later append is not read, a compaction that
// replaces the file does not change it).
const linesOf = (handle, size) =>
  size === 0
    ? []
    : createInterface({
        input: handle.createReadStream({
          start: 0,
          end: size - 1,
          encoding: 'utf8',
          autoClose: false,
        }),
        crlfDelay: Infinity,
      });

const recordOf = (line) => {
  if (!isRecordLine(line)) {
    return null;
  }
  try {
    const record = decodeLine({ notation: line });
    return typeof record?.id === 'string' ? record : null;
  } catch {
    return null; // a torn last line; the next compaction drops it
  }
};

/**
 * Each live link of a record log, handed to `onRecord` one at a time in
 * the order of its last write, never all held at once: a first pass
 * finds the line each id was last written on, a second decodes only
 * those. Resolves to `{ links, mtime }` (`mtime` of the log as read), or
 * null for a log in the legacy format (read it with `readLinoFile`).
 */
export const forEachLiveRecord = async (filePath, onRecord) => {
  let handle;
  try {
    handle = await fs.open(filePath, 'r');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { links: 0, mtime: null };
    }
    throw err;
  }
  try {
    const { size, mtime } = await handle.stat();
    const last = new Map();
    let at = 0;
    let first = true;
    for await (const line of linesOf(handle, size)) {
      at += 1;
      if (first && line.trim().length > 0) {
        first = false;
        if (!isRecordLine(line)) {
          return null;
        }
      }
      const record = recordOf(line);
      if (record && isTombstoneRecord(record)) {
        last.delete(record.id);
      } else if (record) {
        // A copy: the id as decoded is a slice of its line, and would
        // keep every line in memory (the snapshot worker ran out of it).
        last.set(ownCopy(record.id), at);
      }
    }
    const wanted = new Set(last.values());
    last.clear();
    let links = 0;
    at = 0;
    for await (const line of linesOf(handle, size)) {
      at += 1;
      if (wanted.has(at)) {
        onRecord(recordOf(line));
        links += 1;
      }
    }
    return { links, mtime };
  } finally {
    await handle.close();
  }
};

/** The live links of a `.lino` file, and how its lines stand. */
export const readLinoFile = async (filePath, { readLimit } = {}) => {
  let first;
  try {
    first = await firstLine(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    return {
      live: [],
      lines: 0,
      legacy: false,
      open: false,
      bad: createBadLines(),
    };
  }
  if (first !== null && !isRecordLine(first)) {
    const text = await fs.readFile(filePath, 'utf8');
    if (isLegacyText(text)) {
      return {
        live: parseLinoRecords(text),
        lines: 0,
        legacy: true,
        bad: createBadLines(),
      };
    }
    const bad = createBadLines();
    const records = readRecordLines(text, bad);
    const open = text.length > 0 && !text.endsWith('\n');
    const live = applyLinoRecords(records);
    const chars = text.length;
    return { live, lines: records.length, legacy: false, open, chars, bad };
  }
  if (readLimit === 0) {
    return {
      live: [],
      lines: 0,
      legacy: false,
      open: false,
      bad: createBadLines(),
    };
  }
  return streamRecords(filePath, readLimit);
};

// Write every link to a temp file in chunks, flush it to disk, swap it
// in, and flush the directory: after a power cut the file is the old log
// or the whole new one, never an empty or half-written one (R-Z2).
const rewriteFile = async (filePath, links, rename) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    const handle = await fs.open(tmp, 'w', FILE_MODE);
    try {
      for (let at = 0; at < links.length; at += CHUNK) {
        await handle.write(formatLinoRecords(links.slice(at, at + CHUNK)));
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameDurable(tmp, filePath, { rename });
  } catch (error) {
    // The half-written copy goes at once: on a full disk it is what
    // keeps the disk full (R-Z14).
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
  await fsyncDir(path.dirname(filePath));
};

// Lines the store could not read go to `<log>.corrupt-<time>` (appended,
// flushed) before anything rewrites the log, so they are never destroyed
// (R-Z2). The count is reported, the lines themselves never are.
const quarantine = async (filePath, lines) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${filePath}.corrupt-${stamp}`;
  await fs.appendFile(file, `${lines.join('\n')}\n`, { mode: FILE_MODE });
  await fsyncFile(file);
  return file;
};

// Each live link's line length, as read (or as it would be written).
const sizesOf = (loaded) =>
  loaded.sizes ??
  new Map(
    loaded.live.map((link) => [link.id, formatLinoRecords([link]).length])
  );

// How much of the file is live text and how much superseded: by lines
// (many small rewrites) and by characters (one large record rewritten).
const createTally = (loaded, { compactAfter, compactBytes }) => {
  const sizes = sizesOf(loaded);
  let live = 0;
  for (const size of sizes.values()) {
    live += size;
  }
  let lines = loaded.lines; // record lines in the file
  let chars = loaded.chars ?? live; // characters in the file
  return {
    wrote(id, size) {
      live += size - (sizes.get(id) ?? 0);
      sizes.set(id, size);
      lines += 1;
      chars += size;
    },
    removed(id, size) {
      live -= sizes.get(id) ?? 0;
      sizes.delete(id);
      lines += 1;
      chars += size;
    },
    compacted() {
      lines = sizes.size;
      chars = live;
    },
    superseded: () =>
      lines - sizes.size > Math.max(sizes.size, compactAfter) ||
      chars - live > Math.max(live, compactBytes),
  };
};

// Appends are flushed to disk together, at most this long after the first
// one (group commit, R-Z2): the cost of durability does not grow with the
// number of links written.
const SYNC_MS = 200;

// A compaction skipped for lack of space is asked again after this long (R-Z14).
const COMPACT_RETRY_MS = 10 * 60_000;
// A compaction that failed (a busy file on Windows) leaves the old log intact
// and is asked again after this, not on every batch (R-Z19).
const COMPACT_FAILED_RETRY_MS = 30_000;

// Flushes appends to disk together, `syncMs` after the first (R-Z2).
const createSyncer = (filePath, syncMs, enqueue) => {
  let dirty = false; // appended but not yet flushed to disk
  let timer = null;
  const now = async () => {
    if (dirty) {
      dirty = false;
      try {
        await fsyncFile(filePath);
      } catch (error) {
        dirty = true; // not durable yet: the next flush tries again
        throw error;
      }
    }
  };
  return {
    now,
    clean: () => {
      dirty = false;
    },
    soon: () => {
      dirty = true;
      if (timer) {
        return;
      }
      timer = globalThis.setTimeout(() => {
        timer = null;
        enqueue(now).catch(() => {});
      }, syncMs);
      timer.unref?.();
    },
  };
};

const compactionFailed = (onEvent) => (error) =>
  onEvent({
    level: 'warn',
    event: 'compaction_failed',
    code: error?.code ?? null,
  });

// The log rewritten with one line per live link, after the unreadable
// lines were set aside (R-Z2); skipped when the disk has no room for the
// copy (R-Z14). `{ skipped }`.
const compactLog = async ({
  filePath,
  bad,
  mem,
  onCorrupt,
  onEvent,
  free,
  rename,
}) => {
  if (bad.overflow) {
    return { skipped: false }; // more unreadable lines than can be kept
  }
  const size = (await fs.stat(filePath).catch(() => null))?.size ?? 0;
  const space = await enoughSpace(path.dirname(filePath), size, free);
  if (!space.ok) {
    onEvent(skippedEvent('compaction_skipped', space));
    return { skipped: true };
  }
  if (bad.lines.length > 0) {
    const file = await quarantine(filePath, bad.lines);
    onCorrupt({ count: bad.lines.length, file, quarantined: true });
    bad.lines = [];
    bad.count = 0;
  }
  await rewriteFile(filePath, await mem.query(), rename);
  return { skipped: false };
};

// Writes wait here and go to disk as one append (group commit); each
// caller resolves when its batch is written. A batch the disk refused
// rejects every put in it with STORE_WRITE_FAILED (R-Z14).
const createAppender = ({
  wq,
  syncer,
  enqueue,
  maintain,
  rewriting,
  compactOrThrow,
}) => {
  let batch = [];
  const drain = async () => {
    const jobs = batch;
    batch = [];
    if (!rewriting()) {
      wq.push(Buffer.from(jobs.map((j) => j.texts.join('')).join('')));
    }
    try {
      const down = wq.down();
      if (down) {
        throw down; // the retry timer writes; no hammering
      }
      await (rewriting() ? compactOrThrow() : wq.write());
    } catch (error) {
      wq.fail(error);
      const failure = writeFailed(error);
      jobs.forEach((job) => job.reject(failure));
      return;
    }
    syncer.soon();
    jobs.forEach((job) => job.resolve());
    await maintain();
  };
  return (texts) =>
    new Promise((resolve, reject) => {
      batch.push({ texts, resolve, reject });
      if (batch.length === 1) {
        enqueue(drain);
      }
    });
};

// While a migration runs (R-Z17) the log is only appended to: its length is
// what a rollback truncates back to.
const createHold = () => {
  let held = 0;
  return {
    active: () => held > 0,
    take: () => {
      held += 1;
      let done = false;
      return () => {
        if (!done) {
          done = true;
          held -= 1;
        }
      };
    },
  };
};

// A compaction skipped for lack of space, as an error for the write queue.
const throwingWhenSkipped = (compact) => async () => {
  const done = await compact();
  if (done?.skipped) {
    throw storeError('ENOSPC', 'not enough free space to rewrite the log');
  }
};

const readOnlyError = () =>
  Object.assign(new Error('the store was opened read-only'), {
    code: 'STORE_READ_ONLY',
  });

const textHandoff = ({ filePath, mem, tally, mode }) => ({
  freeze: () => {
    mode.readOnly = true;
  },
  resumeWrites: () => {
    mode.readOnly = false;
  },
  async promote(checkpoint) {
    if (!mode.readOnly) {
      throw Object.assign(new Error('the store already admits writes'), {
        code: 'STORE_HANDOFF_INVALID',
      });
    }
    const next = await replayLogTail(
      filePath,
      checkpoint,
      async (record, size) => {
        if (isTombstoneRecord(record)) {
          await mem.delete(record.id);
          tally.removed(record.id, size);
        } else {
          await mem.put(record);
          tally.wrote(record.id, size);
        }
      }
    );
    await tighten(filePath);
    mode.readOnly = false;
    return next;
  },
});

export const createLinoTextStore = async (
  filePath,
  {
    compactAfter = COMPACT_AFTER,
    compactBytes = COMPACT_BYTES,
    syncMs = SYNC_MS,
    readOnly = false,
    readLimit,
    onCorrupt = () => {},
    // `{ level, event, ... }`: degraded, recovered, compaction_skipped (R-Z14).
    onEvent = () => {},
    // The write queue's `{ retryMs, retryMaxMs, maxQueueBytes, openAppend }`
    // (tests inject an append handle that fails).
    queue: queueOptions = {},
    measureFree,
    rename, // injectable fs.rename (R-Z19)
  } = {}
) => {
  const mode = { readOnly };
  const mem = createMemoryStore();
  const loaded = await readLinoFile(filePath, { readLimit });
  await mem.putMany(loaded.live);
  const tally = createTally(loaded, { compactAfter, compactBytes });
  const bad = loaded.bad;
  loaded.live = null;
  loaded.sizes = null;
  if (bad.count > 0) {
    // The count only: the lines may hold message text.
    onCorrupt({ count: bad.count, file: filePath });
  }
  let rewrite = loaded.legacy && !readOnly; // the next write rewrites it all
  if (!readOnly) {
    await tighten(filePath);
  }

  // One write at a time, in call order.
  let tail = Promise.resolve();
  const enqueue = (job) => {
    const run = tail.then(job);
    tail = run.catch(() => {});
    return run;
  };
  const syncer = createSyncer(filePath, syncMs, enqueue);
  let compactAfterAt = 0; // not before (a compaction was skipped)
  const compact = async () => {
    const done = await compactLog({
      filePath,
      bad,
      mem,
      onCorrupt,
      onEvent,
      free: measureFree,
      rename,
    });
    if (done.skipped) {
      compactAfterAt = Date.now() + COMPACT_RETRY_MS;
      return done;
    }
    if (!bad.overflow) {
      syncer.clean();
      tally.compacted();
      rewrite = false;
      wq.rewritten();
    }
    return done;
  };
  // Writes wait here and go to disk as one append (group commit); each
  // caller resolves when its batch is written. `texts` are encoded at call
  // time, so later changes to the objects cannot leak into the file.
  //
  // Memory is updated BEFORE the disk write (R-Z14), so reads see a change
  // at once. The invariant: whatever a caller was told is saved is on disk,
  // and whatever could not be written stays in `queue` (bounded) and is
  // retried until it is; a put whose batch failed rejects with
  // STORE_WRITE_FAILED ("not confirmed") but its text is still queued, so
  // the disk converges to memory once the disk allows. Nothing is dropped
  // silently; past `maxQueueBytes` new puts are refused (STORE_FULL) before
  // they touch memory.
  const wq = createWriteQueue({
    ...queueOptions,
    filePath,
    onEvent,
    enqueue,
    open: loaded.open,
    attempt: () => (rewrite ? compactOrThrow() : wq.write()),
    onRecovered: syncer.soon,
  });
  const compactOrThrow = throwingWhenSkipped(compact);
  const hold = createHold();
  const maintain = async () => {
    try {
      if (
        !hold.active() &&
        tally.superseded() &&
        Date.now() >= compactAfterAt
      ) {
        await compact();
      }
    } catch (error) {
      compactAfterAt = Date.now() + COMPACT_FAILED_RETRY_MS;
      compactionFailed(onEvent)(error);
    }
  };
  const append = createAppender({
    wq,
    syncer,
    enqueue,
    maintain,
    rewriting: () => rewrite,
    compactOrThrow,
  });
  // Each link's line, counted as written.
  const lineOf = (link) => {
    const text = formatLinoRecords([link]);
    tally.wrote(link.id, text.length);
    return text;
  };
  if (!readOnly && tally.superseded()) {
    // A failed (or skipped) compaction must not stop the store opening.
    await enqueue(compact).catch(compactionFailed(onEvent));
  }
  const guard = () => {
    if (mode.readOnly) {
      throw readOnlyError();
    }
    wq.guard();
  };

  return {
    ...mem,
    ...textHandoff({ filePath, mem, tally, mode }),
    async put(link) {
      guard();
      const out = await mem.put(link);
      await append([lineOf(link)]);
      return out;
    },
    async putMany(links) {
      guard();
      const out = await mem.putMany(links);
      await append(links.map(lineOf));
      return out;
    },
    async delete(id) {
      guard();
      const ok = await mem.delete(id);
      if (ok) {
        const text = formatLinoRecords([tombstoneRecord(id)]);
        tally.removed(id, text.length);
        await append([text]);
      }
      return ok;
    },
    /** Resolves once every write so far is on disk (flushed, not just written). */
    flush: () =>
      enqueue(async () => {
        // Never claim "on disk" for what is still waiting (R-Z14).
        if (wq.down() && !(await wq.retry())) {
          throw writeFailed(wq.down());
        }
        await syncer.now();
      }),
    /** Rewrite the file with one line per live link. */
    compact: () => {
      guard();
      return enqueue(compact);
    },
    /** `{ degraded, queuedBytes, error }`: whether writes are failing (R-Z14). */
    health: wq.health,
    /** Lines that could not be read when the log was opened. */
    corruptLines: () => bad.count,
    /** No compaction until the returned `release()` is called (R-Z17). */
    holdCompaction: hold.take,
    /** Whether the next write rewrites the whole log (an old format). */
    needsRewrite: () => rewrite,
    filePath,
  };
};
