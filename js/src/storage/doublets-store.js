/**
 * DoubletsStore — UniversalLinksAccess over the binary half of the
 * associative stack (R-A3, R-G1, R-G2, issue #31).
 *
 * Records live in memory for reads; after a change the whole store is
 * written as a doublets network in the link-cli store archive layout
 * (binary links notation links packet + names packet, see
 * `doublets-archive.js`). That file is a snapshot: it is written at most
 * once per interval — `minIntervalMs`, or ten times what the last write
 * took when that is longer, so a large store does not spend its time
 * re-encoding — and changes do not wait for it. `flush()` writes now.
 * The dual store keeps the durable copy in the text log and repairs a
 * snapshot that missed the last changes (`reconcile`). The file opens
 * directly in link-cli:
 *
 *   clink --db store.links --import-binary .meta-sovereign/data.bin
 *
 * Files written by the earlier `MSDB1` JSON shim are still read and are
 * migrated to the archive format on the next write.
 */

import { promises as fs } from 'node:fs';
import { createMemoryStore } from './universal.js';
import { decodeArchive, encodeArchive } from './doublets-archive.js';
import { createFileWriter } from './file-writer.js';

const LEGACY_MAGIC = Buffer.from('MSDB1\n', 'utf8');

const decodeLegacy = (buf) => {
  const len = buf.readUInt32BE(LEGACY_MAGIC.length);
  const start = LEGACY_MAGIC.length + 4;
  return JSON.parse(buf.subarray(start, start + len).toString('utf8'));
};

export const decodeStoreFile = (buf) => {
  if (buf.length === 0) {
    return [];
  }
  if (
    buf.length >= LEGACY_MAGIC.length + 4 &&
    buf.subarray(0, LEGACY_MAGIC.length).equals(LEGACY_MAGIC)
  ) {
    return decodeLegacy(buf);
  }
  return decodeArchive(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
};

const MIN_INTERVAL_MS = 5000;

// Snapshot writes: the first change after a quiet interval is written
// at once, later ones wait for the interval; `now()` writes immediately.
const createSnapshots = (writer, minIntervalMs) => {
  let timer = null;
  let lastAt = 0;
  let lastCost = 0;
  const interval = () => Math.max(minIntervalMs, 10 * lastCost);
  const now = async () => {
    globalThis.clearTimeout(timer);
    timer = null;
    const started = Date.now();
    try {
      await writer.request();
    } finally {
      lastAt = Date.now();
      lastCost = lastAt - started;
    }
  };
  const later = () => {
    if (timer) {
      return;
    }
    const wait = Math.max(0, lastAt + interval() - Date.now());
    timer = globalThis.setTimeout(() => {
      // A failed write is tried again after the next interval.
      now().catch(later);
    }, wait);
    timer.unref?.();
  };
  return { now, later };
};

export const createDoubletsStore = async (
  filePath,
  { minIntervalMs = MIN_INTERVAL_MS } = {}
) => {
  const mem = createMemoryStore();

  try {
    const buf = await fs.readFile(filePath);
    await mem.putMany(decodeStoreFile(buf));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const writer = createFileWriter(filePath, async () =>
    encodeArchive(await mem.query())
  );
  const snapshots = createSnapshots(writer, minIntervalMs);

  return {
    ...mem,
    async put(link) {
      const out = await mem.put(link);
      snapshots.later();
      return out;
    },
    async putMany(links) {
      const out = await mem.putMany(links);
      snapshots.later();
      return out;
    },
    async delete(id) {
      const ok = await mem.delete(id);
      if (ok) {
        snapshots.later();
      }
      return ok;
    },
    /** Write the snapshot now and wait for it. */
    flush: () => snapshots.now(),
    filePath,
  };
};
