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

// Record lines that decode; a line cut short by a crash mid-append is
// skipped instead of making the whole store unreadable.
const readRecordLines = (text) => {
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!isRecordLine(line)) {
      continue;
    }
    try {
      records.push(decodeLine({ notation: line }));
    } catch {
      // A torn last line; the next compaction drops it.
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
const streamRecords = async (filePath) => {
  const byId = new Map();
  const sizes = new Map(); // id -> its live line's length
  const intern = createInterner();
  let lines = 0;
  let chars = 0; // of the whole file, superseded lines too
  let open = false;
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    chars += line.length + 1;
    if (!isRecordLine(line)) {
      continue;
    }
    let record;
    try {
      record = decodeLine({ notation: line });
    } catch {
      continue; // a torn last line; the next compaction drops it
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
      await handle.read(last, 0, 1, statResult.size - 1);
      open = last[0] !== 0x0a;
    } finally {
      await handle.close();
    }
  }
  const live = [...byId.values()];
  return { live, lines, legacy: false, open, sizes, chars };
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
export const readLinoFile = async (filePath) => {
  let first;
  try {
    first = await firstLine(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    return { live: [], lines: 0, legacy: false, open: false };
  }
  if (first !== null && !isRecordLine(first)) {
    const text = await fs.readFile(filePath, 'utf8');
    if (isLegacyText(text)) {
      return { live: parseLinoRecords(text), lines: 0, legacy: true };
    }
    const records = readRecordLines(text);
    const open = text.length > 0 && !text.endsWith('\n');
    const live = applyLinoRecords(records);
    const chars = text.length;
    return { live, lines: records.length, legacy: false, open, chars };
  }
  return streamRecords(filePath);
};

// Write every link to a temp file in chunks, then swap it in.
const rewriteFile = async (filePath, links) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    for (let at = 0; at < links.length; at += CHUNK) {
      await handle.write(formatLinoRecords(links.slice(at, at + CHUNK)));
    }
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
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

export const createLinoTextStore = async (
  filePath,
  { compactAfter = COMPACT_AFTER, compactBytes = COMPACT_BYTES } = {}
) => {
  const mem = createMemoryStore();
  const loaded = await readLinoFile(filePath);
  await mem.putMany(loaded.live);
  const tally = createTally(loaded, { compactAfter, compactBytes });
  loaded.live = null;
  loaded.sizes = null;
  let rewrite = loaded.legacy; // the next write rewrites the whole file
  let open = loaded.open;

  // One write at a time, in call order.
  let tail = Promise.resolve();
  const enqueue = (job) => {
    const run = tail.then(job);
    tail = run.catch(() => {});
    return run;
  };
  const compact = async () => {
    const links = await mem.query();
    await rewriteFile(filePath, links);
    tally.compacted();
    rewrite = false;
    open = false;
  };
  // `texts` are encoded at call time, so later changes to the objects
  // cannot leak into the file.
  const append = (texts) =>
    enqueue(async () => {
      if (rewrite) {
        await compact(); // the memory store already holds this write
        return;
      }
      const text = texts.join('');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, open ? `\n${text}` : text);
      open = false;
      if (tally.superseded()) {
        await compact();
      }
    });
  // Each link's line, counted as written.
  const lineOf = (link) => {
    const text = formatLinoRecords([link]);
    tally.wrote(link.id, text.length);
    return text;
  };
  if (tally.superseded()) {
    await enqueue(compact);
  }

  return {
    ...mem,
    async put(link) {
      const out = await mem.put(link);
      await append([lineOf(link)]);
      return out;
    },
    async putMany(links) {
      const out = await mem.putMany(links);
      await append(links.map(lineOf));
      return out;
    },
    async delete(id) {
      const ok = await mem.delete(id);
      if (ok) {
        const text = formatLinoRecords([tombstoneRecord(id)]);
        tally.removed(id, text.length);
        await append([text]);
      }
      return ok;
    },
    /** Resolves once every write so far is on disk. */
    flush: () => enqueue(async () => {}),
    /** Rewrite the file with one line per live link. */
    compact: () => enqueue(compact),
    filePath,
  };
};
