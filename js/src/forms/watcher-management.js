import path from 'node:path';
import { promises as fs } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import {
  watcherDirectory,
  watcherFile,
  readWatcherFile,
  watcherAlive,
} from './watcher-files.js';
import { watcherRequest } from './watcher-rpc.js';

export const waitForWatcherStop = async (file, token) => {
  for (let attempt = 0; attempt < 300; attempt++) {
    const metadata = await readWatcherFile(file);
    if (metadata.token !== token) {
      throw new Error('Form watcher ownership changed while stopping.');
    }
    if (metadata.state === 'stop-failed') {
      throw new Error('Form watcher cleanup was not confirmed.');
    }
    if (metadata.state === 'stopped') {
      return { ok: true, state: 'stopped' };
    }
    await delay(100);
  }
  throw new Error('Form watcher cleanup reached its time limit.');
};
const publicState = (metadata) => ({
  browserSlot: metadata.slot,
  id: metadata.id,
  pid: metadata.pid,
  state: metadata.state,
});
export const manageFormWatcher = async ({
  directory,
  slot,
  action = 'status',
}) => {
  if (!['status', 'history', 'stop'].includes(action)) {
    throw new Error('Use watcher status, history or stop.');
  }
  const file = watcherFile(watcherDirectory(directory, slot));
  const metadata = await readWatcherFile(file);
  if (metadata.state !== 'active' || !watcherAlive(metadata.pid)) {
    if (action === 'history') {
      const journal = await readWatcherFile(
        path.join(path.dirname(file), 'journal.lino'),
        2 * 1024 ** 2
      );
      if (
        journal.mode !== 'review-journal' ||
        !Array.isArray(journal.checkpoints)
      ) {
        throw new Error('Invalid saved form watcher journal.');
      }
      return {
        ...journal,
        ...publicState(metadata),
        state: metadata.state === 'active' ? 'unavailable' : metadata.state,
        source: 'saved-checkpoints',
      };
    }
    if (action === 'stop' && metadata.state === 'stopped') {
      return { ok: true, ...publicState(metadata) };
    }
    return {
      ok: false,
      ...publicState(metadata),
      state: metadata.state === 'active' ? 'unavailable' : metadata.state,
    };
  }
  const result = await watcherRequest(metadata, action);
  if (action === 'stop') {
    return {
      ...(await waitForWatcherStop(file, metadata.token)),
      ...publicState({ ...metadata, state: 'stopped' }),
    };
  }
  return { ok: true, ...publicState(metadata), ...result };
};
export const listFormWatchers = async (directory) => {
  const root = path.join(path.resolve(directory), 'forms', 'watchers');
  const watchers = [];
  let omitted = 0;
  const entries = await fs.opendir(root).catch((error) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });
  if (entries) {
    for await (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (watchers.length >= 1000) {
        omitted++;
        break;
      }
      try {
        watchers.push(await manageFormWatcher({ directory, slot: entry.name }));
      } catch (error) {
        watchers.push({
          browserSlot: entry.name,
          ok: false,
          state: 'unavailable',
          code: error.code ?? 'form-watcher-unavailable',
        });
      }
    }
  }
  return { ok: true, watchers, coverage: omitted ? 'partial' : 'listed' };
};
