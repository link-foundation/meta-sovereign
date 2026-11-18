import path from 'node:path';
import { promises as fs } from 'node:fs';
import { decodeWire } from '../transport/lino.js';
import { browserName } from '../browser/policy.js';

export const watcherDirectory = (directory, slot) =>
  path.join(path.resolve(directory), 'forms', 'watchers', browserName(slot));
export const watcherFile = (directory) => path.join(directory, 'monitor.lino');
export const readWatcherFile = async (file, maxBytes = 16384) => {
  const handle = await fs.open(file, 'r');
  try {
    const bytes = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(bytes);
    if (bytesRead > maxBytes) {
      throw new Error('Form watcher metadata exceeds its limit.');
    }
    return decodeWire(bytes.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};
export const watcherAlive = (pid) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};
