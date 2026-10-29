// Only one process owns the log writer. Warm readers acquire that lock only
// after the current owner drains; a failed replacement leaves it recoverable.
import { logCheckpoint } from './lino-handoff.js';
import { acquireStoreLock } from './store-lock.js';
import { createDoubletsMirror } from './doublets-mirror.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const refusal = () =>
  Object.assign(new Error('no writable owner for this operation'), {
    code: 'STORE_READ_ONLY',
  });

export const managedDualStore = ({
  dir,
  text,
  binary: initialBinary,
  lock: initialLock,
  schema,
  access,
  onError,
  onEvent,
}) => {
  let binary = initialBinary;
  let lock = initialLock;
  let target = binary ? access(binary, text) : text;
  let releaseCompaction = null;
  let frozenAt = null;
  let transitioning = false;
  const checkpoint = async () => {
    if (!lock || transitioning) {
      throw refusal();
    }
    releaseCompaction ??= text.holdCompaction();
    await text.flush();
    const file = await fs.open(text.filePath, 'a', 0o600);
    await file.close();
    return { ...(await logCheckpoint(text.filePath)), schema: schema.version };
  };
  const cancelPreparation = () => {
    releaseCompaction?.();
    releaseCompaction = null;
  };
  return {
    ...Object.fromEntries(
      [
        'put',
        'putMany',
        'get',
        'delete',
        'query',
        'scan',
        'size',
        'memoryStats',
        'subscribe',
        'flush',
        'health',
        'verify',
        'reconcile',
      ].map((name) => [name, (...args) => target[name]?.(...args)])
    ),
    schema,
    migration: schema.migrated,
    corruptLines: text.corruptLines,
    logFile: text.filePath,
    flushLog: () => text.flush(),
    prepareHandoff: checkpoint,
    cancelHandoff: cancelPreparation,
    async releaseForHandoff() {
      if (!lock || transitioning) {
        throw refusal();
      }
      transitioning = true;
      text.freeze();
      try {
        await text.flush();
        frozenAt = await logCheckpoint(text.filePath);
        await binary.cancelSnapshot();
        lock.release();
        lock = null;
        target = text;
        cancelPreparation();
        return frozenAt;
      } catch (error) {
        if (lock) {
          text.resumeWrites();
        }
        throw error;
      } finally {
        transitioning = false;
      }
    },
    async promote(checkpoint = frozenAt) {
      if (lock || transitioning || !checkpoint) {
        throw refusal();
      }
      transitioning = true;
      let acquired = null;
      try {
        acquired = await acquireStoreLock(dir, { exclusive: true });
        const current = await text.promote(checkpoint);
        binary = await createDoubletsMirror(path.join(dir, 'data.bin'), {
          text,
          onError,
          onEvent,
        });
        target = access(binary, text);
        lock = acquired;
        acquired = null;
        frozenAt = null;
        return current;
      } catch (error) {
        text.freeze();
        acquired?.release();
        throw error;
      } finally {
        transitioning = false;
      }
    },
    async close() {
      cancelPreparation();
      try {
        await binary?.close();
      } finally {
        try {
          await text.flush();
        } finally {
          lock?.release();
          lock = null;
        }
      }
    },
  };
};
