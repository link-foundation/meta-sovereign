/**
 * The binary side of the dual store as a mirror of the text side (R-A3):
 * the links are held in memory once — by the text store, the durable log
 * — and `data.bin` is a snapshot of that log, written by a worker thread
 * (`doublets-snapshot-worker.js`).
 *
 * Holding a second decoded copy and encoding the whole store on the
 * server's own thread cost a 200k-message store about 1.4 GB more and
 * froze the server for about 18 s on every snapshot, until the heap ran
 * out. The snapshot file is the same link-cli archive as before
 * (`doublets-store.js` reads it).
 *
 * Writes go through the text store (the dual store writes both sides);
 * here they only schedule the next snapshot: at most one per
 * `minIntervalMs`, or ten times what the last one took when that is
 * longer, doubled after each failure up to an hour. A snapshot older than the log (a crash, a CLI run) is written
 * again when the store opens.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { Worker } from 'node:worker_threads';
import { enoughSpace, skippedEvent } from './disk-space.js';

const MIN_INTERVAL_MS = 60_000;

const WORKER_URL = new URL('./doublets-snapshot-worker.js', import.meta.url);

const heapLimitMb = () =>
  Math.round(getHeapStatistics().heap_size_limit / 2 ** 20);

/** Write the snapshot of `from` (a `.lino` log) to `to` in a worker. */
export const snapshotInWorker = (from, to) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, {
      workerData: { from, to },
      // A worker's own default heap is smaller than the server's; a large
      // store's snapshot needs as much as the server may use.
      resourceLimits: { maxOldGenerationSizeMb: heapLimitMb() },
    });
    let result = null;
    worker.once('message', (message) => {
      result = message;
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error(`doublets snapshot worker exited with ${code}`));
      }
    });
  });

// In whole milliseconds: the snapshot is dated to the millisecond.
const mtimeOf = async (file) => {
  try {
    return Math.floor((await fs.stat(file)).mtimeMs);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
};

// Snapshots that keep failing are tried less often, up to once an hour.
const MAX_BACKOFF_MS = 3_600_000;

// One snapshot at a time; a request during one is served by the next. A
// write during a snapshot only marks that another is wanted, so a failure
// is reported once, not once for every write that arrived meanwhile.
// `clock` is the real one unless a test hands in a virtual one, so the
// schedule can be checked without sleeping (R-Z6).
const REAL_CLOCK = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
};

const createSnapshots = ({
  run,
  minIntervalMs,
  onError,
  clock = REAL_CLOCK,
}) => {
  let timer = null;
  let inFlight = null;
  let queued = null;
  let wanted = false;
  let lastAt = 0;
  let lastCost = 0;
  let failures = 0;
  const once = async () => {
    const started = clock.now();
    try {
      const result = await run();
      failures = 0;
      return result;
    } catch (error) {
      failures += 1;
      throw error;
    } finally {
      lastAt = clock.now();
      lastCost = lastAt - started;
    }
  };
  const interval = () => {
    const base = Math.max(minIntervalMs, 10 * lastCost);
    return Math.min(
      base * 2 ** Math.min(failures, 20),
      Math.max(base, MAX_BACKOFF_MS)
    );
  };
  let later = null;
  const now = () => {
    clock.clearTimeout(timer);
    timer = null;
    if (queued) {
      return queued;
    }
    if (!inFlight) {
      inFlight = once().finally(() => {
        inFlight = null;
        if (wanted && !queued) {
          wanted = false;
          later();
        }
      });
      return inFlight;
    }
    queued = inFlight
      .catch(() => {})
      .then(() => {
        queued = null;
        return now();
      });
    return queued;
  };
  later = () => {
    if (timer) {
      return;
    }
    if (inFlight || queued) {
      wanted = true;
      return;
    }
    const wait = Math.max(0, lastAt + interval() - clock.now());
    timer = clock.setTimeout(() => {
      timer = null;
      // A failed snapshot is tried again, after a longer wait each time.
      now().catch((error) => {
        onError(error);
        later();
      });
    }, wait);
    timer.unref?.();
  };
  return { now, later };
};

/**
 * The binary side over `text` (a LinoTextStore): reads are the text
 * store's, `data.bin` at `filePath` follows its log.
 */
export const createDoubletsMirror = async (
  filePath,
  {
    text,
    minIntervalMs = MIN_INTERVAL_MS,
    snapshot = snapshotInWorker,
    onError = () => {},
    onEvent = () => {},
    measureFree,
    clock,
  }
) => {
  // The new file is as large as the old one (or, the first time, about as
  // large as the log): without that much free plus a margin, skip it
  // rather than fill the disk the log needs (R-Z14).
  const spaceFor = async () => {
    const size = (await fs.stat(filePath).catch(() => null))?.size;
    const log = (await fs.stat(text.filePath).catch(() => null))?.size ?? 0;
    return enoughSpace(path.dirname(filePath), size ?? log, measureFree);
  };
  const snapshots = createSnapshots({
    run: async () => {
      await text.flush(); // every write so far is in the log
      const space = await spaceFor();
      if (!space.ok) {
        onEvent(skippedEvent('snapshot_skipped', space));
        return { links: 0, bytes: 0, skipped: true };
      }
      return snapshot(text.filePath, filePath);
    },
    minIntervalMs,
    onError,
    clock,
  });
  const stale = async () => {
    const bin = await mtimeOf(filePath);
    const log = await mtimeOf(text.filePath);
    return log !== null && (bin === null || bin < log);
  };

  return {
    mirrors: text,
    get: (id) => text.get(id),
    query: (filter) => text.query(filter),
    subscribe: (handler) => text.subscribe(handler),
    async put(link) {
      snapshots.later();
      return link;
    },
    async putMany(links) {
      snapshots.later();
      return links;
    },
    async delete() {
      snapshots.later();
      return false;
    },
    /** Write the snapshot now (after the log) and wait for it. */
    flush: () => snapshots.now(),
    /** A snapshot older than the log is written again, in the background. */
    async refresh() {
      const behind = await stale();
      if (behind) {
        snapshots.later();
      }
      return { put: 0, deleted: 0, stale: behind };
    },
    filePath,
  };
};
