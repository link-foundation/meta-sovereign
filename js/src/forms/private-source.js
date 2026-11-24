import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Optional conventional inputs are always relative to the selected local store. */
export const privateFormDirectory = async (store, failure) => {
  if (typeof store?.logFile !== 'string' || !store.logFile) {
    return null;
  }
  try {
    return await fs.realpath(path.dirname(store.logFile));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw failure('profile directory');
  }
};

export const readPrivateFormSource = async (
  directory,
  name,
  maxBytes,
  failure
) => {
  const file = path.join(directory, name);
  let handle;
  try {
    const stat = await fs.lstat(file);
    const parent = await fs.realpath(path.dirname(file));
    const relative = path.relative(directory, parent);
    if (
      !stat.isFile() ||
      stat.size > maxBytes ||
      path.isAbsolute(relative) ||
      relative.split(path.sep).includes('..')
    ) {
      throw failure(name);
    }
    handle = await fs.open(
      file,
      constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0)
    );
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxBytes) {
      throw failure(name);
    }
    const bytes = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null
      );
      if (!bytesRead) {
        break;
      }
      length += bytesRead;
    }
    if (length > maxBytes) {
      throw failure(name);
    }
    const data = bytes.subarray(0, length);
    return {
      data,
      sha256: createHash('sha256').update(data).digest('hex'),
      updatedAt: opened.mtime.toISOString(),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw failure(name);
  } finally {
    await handle?.close();
  }
};
