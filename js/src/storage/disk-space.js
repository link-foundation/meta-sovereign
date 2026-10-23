/**
 * Free disk space, and the guard for jobs that write a big file (R-Z14).
 *
 * A snapshot, a compaction or a backup writes a whole new file beside the
 * old one; on a nearly full disk it would fill the last bytes and make the
 * live log fail as well. Each of them first asks `enoughSpace` and, when the
 * disk is short, is skipped with a `*_skipped` event (reason `low_disk`)
 * that says how much was needed and how much is free.
 *
 * Where the platform cannot say (`fs.promises.statfs` needs Node 18.15),
 * the free space is `null` ("unknown") and the job is allowed.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const MiB = 1024 * 1024;
/** Left free after a big write. */
export const MARGIN_BYTES = 512 * MiB;
/** Below this the page warns (the health report's `disk.low`). */
export const LOW_DISK_BYTES = 1024 * MiB;

/** Bytes free to this user in the folder `dir` (or its nearest parent); null when unknown. */
export const freeBytes = async (dir) => {
  if (typeof fs.statfs !== 'function') {
    return null;
  }
  let at = path.resolve(dir);
  for (;;) {
    try {
      const stat = await fs.statfs(at);
      const free = Number(stat.bavail) * Number(stat.bsize);
      return Number.isFinite(free) ? free : null;
    } catch (error) {
      const up = path.dirname(at);
      if (error.code !== 'ENOENT' || up === at) {
        return null;
      }
      at = up;
    }
  }
};

/**
 * Whether `needed` bytes (plus the margin) fit in `dir`:
 * `{ ok, needed, free }` — `free` null (and `ok` true) when unknown.
 * `measure` is injectable for tests.
 */
export const enoughSpace = async (dir, needed, measure = freeBytes) => {
  const free = await measure(dir);
  const total = needed + MARGIN_BYTES;
  return { ok: free === null || free >= total, needed: total, free };
};

/** The event a skipped job logs. */
export const skippedEvent = (event, space) => ({
  level: 'warn',
  event,
  reason: 'low_disk',
  needed: space.needed,
  free: space.free,
});

/** The disk half of the health report: `{ freeBytes, low }`, nulls when unknown. */
export const diskHealth = async (dir, measure = freeBytes) => {
  const free = await measure(dir);
  return {
    freeBytes: free,
    low: free === null ? false : free < LOW_DISK_BYTES,
  };
};
