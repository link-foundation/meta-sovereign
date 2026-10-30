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
import { sqliteRuntime } from './disk-network.js';
import { trackSnapshot } from './snapshot-memory.js';
import { sweepSnapshotWorkspaces } from './snapshot-workspace.js';

const MIN_INTERVAL_MS = 60_000;

const WORKER_URL = new URL('./doublets-snapshot-worker.js', import.meta.url);

const heapLimitMb = () =>
  Math.round(getHeapStatistics().heap_size_limit / 2 ** 20);

/** Write the snapshot of `from` (a `.lino` log) to `to` in a worker. */
export const snapshotInWorker = async (from, to, { signal } = {}) => {
  if (signal?.aborted) {
    throw signal.reason;
  }
  const disk = Boolean(await sqliteRuntime());
  await sweepSnapshotWorkspaces(path.dirname(to));
  const folder = disk
    ? await fs.mkdtemp(
        path.join(path.dirname(to), `.snapshot-db-${process.pid}-`)
      )
    : null;
  let memory = null;
  try {
    return await new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const worker = new Worker(WORKER_URL, {
        workerData: {
          from,
          to,
          diskFile: folder ? path.join(folder, 'network.sqlite') : null,
        },
        // Disk-backed indexes leave only bounded caches and the current record
        // on the worker heap. Older runtimes use the existing memory encoder.
        resourceLimits: { maxOldGenerationSizeMb: disk ? 512 : heapLimitMb() },
      });
      memory = trackSnapshot(worker.threadId, disk ? 'disk' : 'memory');
      const abort = () => {
        Promise.resolve(worker.terminate()).then(
          () => reject(signal.reason),
          reject
        );
      };
      signal?.addEventListener('abort', abort, { once: true });
      let result = null;
      let failure = null;
      worker.on('message', (message) => {
        if (message.progress) {
          memory.update(message);
          return;
        }
        result = message;
        // The message follows the durable rename. Deno's worker compatibility
        // layer can keep its port alive without emitting an exit event.
        Promise.resolve(worker.terminate()).then(
          () => resolve(message),
          reject
        );
      });
      worker.once('error', (error) => {
        failure = error;
        Promise.resolve(worker.terminate()).then(() => reject(error), reject);
      });
      worker.once('exit', (code) => {
        memory.stop();
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) {
          reject(signal.reason);
        } else if (result) {
          resolve(result);
        } else {
          reject(
            failure ?? new Error(`doublets snapshot worker exited with ${code}`)
          );
        }
      });
    });
  } finally {
    memory?.stop();
    if (folder) {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
};

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
  initialDelayMs = 0,
}) => {
  let timer = null;
  let inFlight = null;
  let queued = null;
  let wanted = false;
  let lastAt = initialDelayMs
    ? clock.now() - minIntervalMs + initialDelayMs
    : 0;
  let lastCost = 0;
  let failures = 0;
  let closed = false;
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
    if (closed) {
      return Promise.resolve(null);
    }
    clock.clearTimeout(timer);
    timer = null;
    if (queued) {
      return queued;
    }
    if (!inFlight) {
      inFlight = once().finally(() => {
        inFlight = null;
        if (wanted && !queued && !closed) {
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
    if (closed || timer) {
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
  const close = async () => {
    closed = true;
    wanted = false;
    clock.clearTimeout(timer);
    timer = null;
    await (queued ?? inFlight);
  };
  return { now, later, close };
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
    initialDelayMs,
    // The file system calls behind the free-space check; a test on a
    // virtual clock replaces them so no real I/O sits inside its schedule.
    spaceCheck,
  }
) => {
  const lifetime = new AbortController();
  // The new file is as large as the old one (or, the first time, about as
  // large as the log): without that much free plus a margin, skip it
  // rather than fill the disk the log needs (R-Z14).
  const spaceFor =
    spaceCheck ??
    (async () => {
      const size = (await fs.stat(filePath).catch(() => null))?.size;
      const log = (await fs.stat(text.filePath).catch(() => null))?.size ?? 0;
      // The disposable disk index and the new archive coexist with the old
      // snapshot. Reserve workspace too; the durable log must keep room.
      return enoughSpace(
        path.dirname(filePath),
        (size ?? log) + 3 * log,
        measureFree
      );
    });
  const snapshots = createSnapshots({
    // Let the old rolling worker retire before starting another large heap.
    initialDelayMs:
      initialDelayMs ??
      ((await fs.stat(text.filePath).catch(() => null))?.size > 64 * 1024 ** 2
        ? minIntervalMs
        : 0),
    run: async () => {
      await text.flush(); // every write so far is in the log
      const space = await spaceFor();
      if (!space.ok) {
        onEvent(skippedEvent('snapshot_skipped', space));
        return { links: 0, bytes: 0, skipped: true };
      }
      const started = Date.now();
      const result = await snapshot(text.filePath, filePath, {
        signal: lifetime.signal,
      });
      onEvent({
        level: 'debug',
        event: 'store_snapshot_written',
        durationMs: Date.now() - started,
        links: result?.links,
        bytes: result?.bytes,
        engine: result?.engine,
      });
      return result;
    },
    minIntervalMs,
    onError: (error) => {
      if (!lifetime.signal.aborted) {
        onError(error);
      }
    },
    clock,
  });
  const stale = async () => {
    const bin = await mtimeOf(filePath);
    const log = await mtimeOf(text.filePath);
    return log !== null && (bin === null || bin < log);
  };

  return {
    mirrors: text,
    get: (id, project) => text.get(id, project),
    query: (filter) => text.query(filter),
    scan: (filter, size, onBatch, project) =>
      text.scan(filter, size, onBatch, project),
    size: () => text.size(),
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
    close: () => snapshots.close(),
    /** Handoff keeps the durable text log; abandon only its rebuildable mirror. */
    async cancelSnapshot() {
      lifetime.abort();
      await snapshots.close().catch((error) => {
        if (error !== lifetime.signal.reason) {
          throw error;
        }
      });
    },
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
