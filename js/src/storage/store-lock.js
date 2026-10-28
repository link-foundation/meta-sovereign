/**
 * One writer per store folder (R-Z2).
 *
 * Every process keeps its own in-memory copy of the store and rewrites the
 * log from it when it compacts, so two writers on one folder lose each
 * other's writes (a CLI `import` while `serve` runs). The safest and
 * simplest rule is a lock file, `data.lock`, holding the owner's pid:
 *
 *   - a second process that wants to WRITE fails fast with code
 *     `STORE_LOCKED` and a message naming the owner (stop it, or give the
 *     command another `--store`);
 *   - read-only commands (`export`, `cv-read`, ...) never take the lock
 *     and read the log as it is, even while `serve` runs;
 *   - a lock whose process is gone (a crash, `kill -9`) is stale and is
 *     taken over; a lock is released when the process exits normally.
 *
 * The same process may open a folder again (tests and the per-account
 * stores do): its own pid is never a conflict.
 */

import { promises as fs, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export const LOCK_FILE = 'data.lock';

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM'; // exists, owned by another user
  }
};

const ownerOf = async (file) => {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  const pid = Number.parseInt(text.split('\n')[0], 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
};

const freshlyMade = async (file) => {
  const stat = await fs.stat(file).catch(() => null);
  return stat !== null && Date.now() - stat.mtimeMs < 2000;
};

const lockedError = (dir, pid) =>
  Object.assign(
    new Error(
      `the store ${dir} is in use by process ${pid} (is "meta-sovereign serve" running?). ` +
        'Stop it first, or use another --store; read-only commands (export, cv-read) still work.'
    ),
    { code: 'STORE_LOCKED', pid }
  );

const held = new Map(); // lock file -> { count, release }

/** Take the lock of the store in `dir`; resolves to `{ release }`. */
export const acquireStoreLock = async (dir, { exclusive = false } = {}) => {
  const file = path.join(dir, LOCK_FILE);
  const mine = held.get(file);
  if (mine) {
    if (exclusive) {
      throw lockedError(dir, process.pid);
    }
    mine.count += 1;
    return { release: mine.release };
  }
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      await handle.writeFile(`${process.pid}\n`);
      await handle.close();
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      const pid = await ownerOf(file);
      if (pid === null && (await freshlyMade(file))) {
        await sleep(50);
        continue; // the owner is still writing its pid
      }
      if (pid !== null && pid !== process.pid && alive(pid)) {
        throw lockedError(dir, pid);
      }
      await fs.unlink(file).catch(() => {}); // stale: its process is gone
    }
    if (attempt === 4) {
      throw lockedError(dir, 'unknown');
    }
  }
  const release = () => {
    const entry = held.get(file);
    if (!entry) {
      return;
    }
    entry.count -= 1;
    if (entry.count > 0) {
      return;
    }
    held.delete(file);
    try {
      if (Number.parseInt(readFileSync(file, 'utf8'), 10) === process.pid) {
        unlinkSync(file);
      }
    } catch {
      // already gone
    }
  };
  held.set(file, { count: 1, release });
  return { release };
};

// A normal exit removes every lock this process holds.
process.once('exit', () => {
  for (const entry of [...held.values()]) {
    entry.count = 1;
    entry.release();
  }
});
