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

import { createWriteStream, promises as fs, renameSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export const FILE_MODE = 0o600;
export const DIR_MODE = 0o700;

/** fsync a file that is already written (any descriptor flushes it). */
export const fsyncFile = async (file) => {
  // Windows flushes only a handle that can write.
  const handle = await fs.open(file, 'r+').catch((error) => {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') {
      throw error;
    }
    return fs.open(file, 'r');
  });
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

const WINDOWS_BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);
const defaultSleep = (ms) =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

/**
 * Rename `from` over `to`, retrying while another handle holds the target
 * (R-Z19). On Windows a rename fails with EPERM/EBUSY/EACCES while any
 * process (antivirus, the search indexer, our own snapshot worker) has the
 * target open, usually for a few milliseconds: retried up to `attempts`
 * times with a growing pause (about a second in all, like graceful-fs).
 * Elsewhere rename is atomic and those codes are real errors, so only
 * EBUSY is retried. After the last attempt the error is thrown and the
 * target is untouched. `rename`, `platform` and `sleep` are injectable.
 */
export const renameDurable = async (
  from,
  to,
  {
    rename = fs.rename,
    platform = process.platform,
    sleep = defaultSleep,
    attempts = 10,
    delayMs = 20,
  } = {}
) => {
  const codes = platform === 'win32' ? WINDOWS_BUSY : new Set(['EBUSY']);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await rename(from, to);
    } catch (error) {
      if (attempt >= attempts || !codes.has(error?.code)) {
        throw error;
      }
      await sleep(delayMs * attempt);
    }
  }
};

// A pause that blocks this thread: only for the short waits below.
const blockFor = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * `renameDurable` for the few writes that must stay synchronous (the
 * passcode file, a mail attachment, log rotation): the same codes, the
 * same attempts and pauses, about a second in all at worst.
 */
export const renameDurableSync = (
  from,
  to,
  {
    rename = renameSync,
    platform = process.platform,
    sleep = blockFor,
    attempts = 10,
    delayMs = 20,
  } = {}
) => {
  const codes = platform === 'win32' ? WINDOWS_BUSY : new Set(['EBUSY']);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return rename(from, to);
    } catch (error) {
      if (attempt >= attempts || !codes.has(error?.code)) {
        throw error;
      }
      sleep(delayMs * attempt);
    }
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
  { utime, tag = '', rename } = {}
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
    await renameDurable(tmp, file, { rename });
  } catch (error) {
    // A full disk: the half-written temp file goes at once, not at the
    // next start (R-Z14).
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
  await fsyncDir(dir);
};

/**
 * Like `writeFileDurable`, but the content is a pipeline of streams
 * (`source, ...stages`) written as it is produced, so a multi-gigabyte
 * file never exists in memory (R-Z16). Temp file at 0600, fsync, rename,
 * fsync of the folder; the temp file goes at once when anything fails.
 */
export const writeStreamDurable = async (file, ...streams) => {
  const dir = path.dirname(file);
  await ensurePrivateDir(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await pipeline(
      ...streams,
      createWriteStream(tmp, { flags: 'w', mode: FILE_MODE })
    );
    await fsyncFile(tmp);
    await renameDurable(tmp, file);
  } catch (error) {
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
