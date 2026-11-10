import path from 'node:path';
import { promises as fs } from 'node:fs';
import { openDualStore } from '../storage/dual-store.js';
import { learnFormAnswerPairs } from './answer-learning.js';
import { requestFormKnowledge } from './knowledge-bridge.js';

const ownerPid = async (directory) => {
  const file = path.join(directory, 'data.lock');
  const text = await fs
    .open(file, 'r')
    .then(async (handle) => {
      try {
        const bytes = Buffer.alloc(4097);
        const { bytesRead } = await handle.read(bytes);
        if (bytesRead > 4096) {
          throw new Error('Invalid store owner metadata.');
        }
        return bytes.subarray(0, bytesRead).toString('utf8');
      } finally {
        await handle.close();
      }
    })
    .catch((error) => {
      if (error.code === 'ENOENT') {
        return '';
      }
      throw error;
    });
  const pid = Number(text.split('\n')[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return null;
  }
  try {
    process.kill(pid, 0);
    return pid;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return null;
    }
    throw error;
  }
};

/** A watcher never keeps a second writable copy of an active owner's store. */
const save = async (
  directory,
  pairs,
  options,
  { openStore = openDualStore } = {}
) => {
  const pid = await ownerPid(directory);
  if (pid) {
    return requestFormKnowledge(directory, pid, pairs, options);
  }
  let store;
  try {
    store = await openStore(directory);
  } catch (error) {
    if (error.code !== 'STORE_LOCKED') {
      throw error;
    }
    return requestFormKnowledge(directory, error.pid, pairs, options);
  }
  let result;
  try {
    result = await learnFormAnswerPairs(store, pairs, options);
  } catch (error) {
    await store.close().catch(() => {
      error.closeFailed = true;
    });
    throw error;
  }
  try {
    await store.close();
  } catch (error) {
    error.partial = result;
    throw error;
  }
  return result;
};

const writers = new Map();
export const saveWatchedFormAnswers = (
  directory,
  pairs,
  options,
  dependencies
) => {
  const key = path.resolve(directory);
  const task = (writers.get(key) ?? Promise.resolve()).then(() =>
    save(key, pairs, options, dependencies)
  );
  const settled = task.then(
    () => {},
    () => {}
  );
  writers.set(key, settled);
  void settled.then(() => {
    if (writers.get(key) === settled) {
      writers.delete(key);
    }
  });
  return task;
};
