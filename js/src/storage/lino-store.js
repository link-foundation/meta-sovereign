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
 * `compactAfter`), the file is rewritten with one line per live link.
 *
 * Files written by the earlier indented `id token…` format (which kept
 * only id/tokens/children) are still read and are rewritten in the
 * record format on the next write.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
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

const loadFile = async (filePath) => {
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    return { records: [], lines: 0, legacy: false, open: false };
  }
  if (isLegacyText(text)) {
    return { records: parseLinoRecords(text), lines: 0, legacy: true };
  }
  const records = readRecordLines(text);
  // A file not ending in a newline (a torn append) gets one first.
  const open = text.length > 0 && !text.endsWith('\n');
  return { records, lines: records.length, legacy: false, open };
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

export const createLinoTextStore = async (
  filePath,
  { compactAfter = COMPACT_AFTER } = {}
) => {
  const mem = createMemoryStore();
  const loaded = await loadFile(filePath);
  const live = applyLinoRecords(loaded.records);
  await mem.putMany(live);
  const ids = new Set(live.map((link) => link.id));
  let lines = loaded.lines; // record lines in the file
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
    lines = links.length;
    rewrite = false;
    open = false;
  };
  const superseded = () => lines - ids.size > Math.max(ids.size, compactAfter);
  // `text` is encoded at call time, so later changes to the objects
  // cannot leak into the file.
  const append = (text, count) =>
    enqueue(async () => {
      if (rewrite) {
        await compact(); // the memory store already holds this write
        return;
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, open ? `\n${text}` : text);
      open = false;
      lines += count;
      if (superseded()) {
        await compact();
      }
    });
  if (superseded()) {
    await enqueue(compact);
  }

  return {
    ...mem,
    async put(link) {
      const out = await mem.put(link);
      ids.add(link.id);
      await append(formatLinoRecords([link]), 1);
      return out;
    },
    async putMany(links) {
      const out = await mem.putMany(links);
      for (const link of links) {
        ids.add(link.id);
      }
      await append(formatLinoRecords(links), links.length);
      return out;
    },
    async delete(id) {
      const ok = await mem.delete(id);
      if (ok) {
        ids.delete(id);
        await append(formatLinoRecords([tombstoneRecord(id)]), 1);
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
