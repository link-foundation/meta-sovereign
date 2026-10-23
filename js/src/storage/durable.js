/**
 * Durable, private file writes shared by the store, the snapshot worker,
 * the backups and the logs (R-Z2).
 *
 * A rename is only atomic for the directory entry: without an fsync of
 * the file first, a power cut can leave the new name pointing at empty
 * data blocks, and without an fsync of the directory the rename itself
 * can be lost. `writeFileDurable` does both. Files are private to the
 * user: 0600, directories 0700 (a no-op on Windows).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const FILE_MODE = 0o600;
export const DIR_MODE = 0o700;

/** fsync a file that is already written (any descriptor flushes it). */
export const fsyncFile = async (file) => {
  const handle = await fs.open(file, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/** fsync a directory so a rename or create in it survives a power cut. */
export const fsyncDir = async (dir) => {
  let handle;
  try {
    handle = await fs.open(dir, 'r');
    await handle.sync();
  } catch {
    // Windows cannot open a directory; some file systems refuse fsync on one.
  } finally {
    await handle?.close();
  }
};

/** Create `dir` (and parents) private to the user. */
export const ensurePrivateDir = (dir) =>
  fs.mkdir(dir, { recursive: true, mode: DIR_MODE });

/** Tighten an existing file or directory; quiet when it is not there. */
export const tighten = async (target, mode = FILE_MODE) => {
  if (process.platform === 'win32') {
    return false;
  }
  try {
    const stat = await fs.stat(target);
    if ((stat.mode & 0o777 & ~mode) === 0) {
      return false; // already at least that private
    }
    await fs.chmod(target, mode);
    return true;
  } catch {
    return false;
  }
};

/**
 * Write `data` to `file` through a temp file: write, fsync, rename, fsync
 * of the directory. A reader sees the old file or the whole new one.
 * `utime` (optional `[atime, mtime]`) is set before the sync.
 */
export const writeFileDurable = async (
  file,
  data,
  { utime, tag = '' } = {}
) => {
  const dir = path.dirname(file);
  await ensurePrivateDir(dir);
  const tmp = `${file}.${process.pid}${tag}.tmp`;
  const handle = await fs.open(tmp, 'w', FILE_MODE);
  try {
    try {
      await handle.writeFile(data);
      if (utime) {
        await handle.utimes(utime[0], utime[1]);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, file);
  } catch (error) {
    // A full disk: the half-written temp file goes at once, not at the
    // next start (R-Z14).
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
  await fsyncDir(dir);
};

/** Remove `*.tmp` leftovers of a crashed write, older than a minute. */
export const sweepTemp = async (dir, olderThanMs = 60_000) => {
  const removed = [];
  for (const name of await fs.readdir(dir).catch(() => [])) {
    if (!name.endsWith('.tmp')) {
      continue;
    }
    const file = path.join(dir, name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat?.isFile() && Date.now() - stat.mtimeMs > olderThanMs) {
      await fs.unlink(file).catch(() => {});
      removed.push(name);
    }
  }
  return removed;
};
