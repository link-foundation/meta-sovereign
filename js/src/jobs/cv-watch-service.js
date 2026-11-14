import { attachCvWatchBrowser } from './cv-watch-browser.js';
import { readCvSavedExports } from './cv-watch-export.js';
import {
  cvWatchOptions,
  cvWatchResult,
  cvSnapshotsResult,
} from './cv-watch-record.js';
import { ownCvWatch } from './cv-watch-owner.js';
import { saveTechnologyRecord } from './technology-storage.js';
import { browserName } from '../browser/policy.js';
import { resumeExportRequestId } from './resume-export-options.js';
import { jobsFailure } from './options.js';
import { traceCvWatch } from './cv-watch-trace.js';

const watchId = (id) => `jobs-cv-watch:${resumeExportRequestId(id)}`;
export const createCvWatchService = ({
  store,
  run,
  attach = attachCvWatchBrowser,
  readExports = readCvSavedExports,
  verification,
}) => {
  let current;
  let admitting = Promise.resolve();
  const status = async (input) => {
    const browserSlot = browserName(input.browserSlot ?? 'jobs');
    const requestId =
      input.requestId ??
      (await store.get(`jobs-cv-watch-latest:${browserSlot}`))?.requestId;
    if (!requestId) {
      return { watch: null };
    }
    const raw = await store.get(watchId(requestId));
    const watch = cvWatchResult(raw, { browserSlot, requestId });
    return {
      watch:
        watch.active && current?.requestId !== requestId
          ? {
              ...watch,
              active: false,
              state: 'interrupted',
              code: 'jobs-cv-interrupted',
            }
          : watch,
    };
  };
  const start = async (input) => {
    const options = cvWatchOptions(input);
    const id = watchId(options.requestId);
    const signature = JSON.stringify(options);
    const previous = await store.get(id);
    if (previous) {
      if (previous.signature !== signature) {
        throw jobsFailure(
          'cv-conflict',
          'This watch ID has different settings.'
        );
      }
      return status(options);
    }
    if (current) {
      throw jobsFailure('busy', 'A CV watch is already owned.');
    }
    let resolveStart;
    let rejectStart;
    const admission = new Promise((resolve, reject) => {
      resolveStart = resolve;
      rejectStart = reject;
    });
    const startedAt = new Date().toISOString();
    const owned = {
      id,
      requestId: options.requestId,
      expiresAt: Date.now() + options.durationMs,
      stop: null,
      task: null,
    };
    let record = {
      id,
      signature,
      ...options,
      version: 1,
      state: 'starting',
      active: true,
      passive: true,
      startedAt,
      expiresAt: new Date(owned.expiresAt).toISOString(),
      saves: 0,
      lastSavedAt: null,
      code: null,
    };
    let writes = Promise.resolve();
    const save = (change) => {
      const task = writes.then(() => persist(change));
      writes = task.catch(() => {});
      return task;
    };
    const persist = async ({ savedAt, verified, ...change }) => {
      if (change.state === 'watching' && record.state !== 'starting') {
        return;
      }
      const next = {
        ...record,
        ...change,
        ...(verified ? { saves: record.saves + 1, lastSavedAt: savedAt } : {}),
      };
      cvWatchResult(next);
      await saveTechnologyRecord(store, next);
      record = next;
      traceCvWatch('persisted', {
        state: next.state,
        code: next.code,
        saves: next.saves,
      });
    };
    current = owned;
    owned.task = run((signal) =>
      ownCvWatch({
        signal,
        owned,
        save,
        options,
        store,
        attach,
        readExports,
        verification,
        resolveStart,
        rejectStart,
      })
    );
    void owned.task.catch(rejectStart).finally(() => {
      if (current === owned) {
        current = null;
      }
    });
    return admission;
  };
  return {
    'cv-watch': (input) => {
      const result = admitting.then(() => start(input));
      admitting = result.catch(() => {});
      return result;
    },
    'cv-watch-status': status,
    'cv-watch-stop': async (input) => {
      const { watch } = await status(input);
      if (watch && current?.requestId === watch.requestId) {
        current.stop?.();
        await current.task;
      }
      return status(input);
    },
    'cv-snapshots': async (input) => {
      const browserSlot = browserName(input.browserSlot ?? 'jobs');
      const row = await store.get(`jobs-cv-snapshots:${browserSlot}`);
      if (row && row.version !== 1) {
        throw jobsFailure('cv-state', 'Saved CV snapshots were not confirmed.');
      }
      return cvSnapshotsResult(row ?? { browserSlot, snapshots: [] }, {
        browserSlot,
      });
    },
  };
};
