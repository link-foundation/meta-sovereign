import { attachCvWatchBrowser } from './cv-watch-browser.js';
import { prepareNativeCvAbout } from './cv-prepare-browser.js';
import { cvPrepareSource } from './cv-prepare-source.js';
import {
  cvPrepareOptions,
  cvPrepareResult,
  cvPrepareFailure,
} from './cv-prepare-record.js';
import { saveTechnologyRecord } from './technology-storage.js';
import { browserName } from '../browser/policy.js';
import { resumeExportRequestId } from './resume-export-options.js';

const recordId = (id) => `jobs-cv-prepare:${resumeExportRequestId(id)}`;
export const createCvPrepareService = ({
  store,
  artifactRoot,
  run,
  attach = attachCvWatchBrowser,
  prepare = prepareNativeCvAbout,
}) => {
  let admitting = Promise.resolve();
  let current;
  let stopped = false;
  const status = async (input) => {
    const browserSlot = browserName(input.browserSlot ?? 'jobs');
    const requestId =
      input.requestId ??
      (await store.get(`jobs-cv-prepare-latest:${browserSlot}`))?.requestId;
    if (!requestId) {
      return { preparation: null };
    }
    const raw = await store.get(recordId(requestId));
    if (!raw) {
      return { preparation: null };
    }
    const { preparation } = cvPrepareResult(raw, {
      ...input,
      browserSlot,
      requestId,
    });
    return {
      preparation:
        ['starting', 'opening', 'preparing'].includes(preparation.state) &&
        current !== requestId
          ? {
              ...preparation,
              state: 'interrupted',
              code: 'jobs-cv-interrupted',
            }
          : preparation,
    };
  };
  const start = async (input) => {
    if (stopped) {
      throw cvPrepareFailure('stopped');
    }
    const options = cvPrepareOptions(input);
    const previous = await store.get(recordId(options.requestId));
    if (previous) {
      if (
        JSON.stringify(cvPrepareOptions(previous)) !== JSON.stringify(options)
      ) {
        throw cvPrepareFailure('conflict');
      }
      return status(options);
    }
    {
      const startedAt = new Date().toISOString();
      let record = {
        id: recordId(options.requestId),
        ...options,
        version: 1,
        hash: null,
        language: options.changeId.split(':')[0],
        state: 'starting',
        providerSaved: false,
        startedAt,
        updatedAt: startedAt,
        code: null,
      };
      const save = async (state, code = null) => {
        const next = {
          ...record,
          state,
          code,
          updatedAt: new Date().toISOString(),
        };
        cvPrepareResult(next);
        await saveTechnologyRecord(store, next);
        record = next;
      };
      let session;
      current = options.requestId;
      try {
        await save('starting');
        await saveTechnologyRecord(store, {
          id: `jobs-cv-prepare-latest:${options.browserSlot}`,
          requestId: options.requestId,
        });
        await run(async (signal) => {
          const change = await cvPrepareSource(
            { store, artifactRoot },
            options
          );
          record = { ...record, hash: change.hash };
          signal.throwIfAborted();
          try {
            session = await attach(options);
            signal.throwIfAborted();
            await prepare({
              session,
              change,
              check: () => signal.throwIfAborted(),
              phase: save,
            });
            signal.throwIfAborted();
            await save('prepared');
          } finally {
            try {
              await session?.detach();
            } finally {
              session = null;
            }
          }
        });
      } catch (error) {
        const code = /^jobs-[a-z\d-]+$/u.test(error.code ?? '')
          ? error.code
          : 'jobs-cv-prepare';
        await save(record.state === 'starting' ? 'failed' : 'uncertain', code);
      } finally {
        try {
          await session?.detach();
        } finally {
          current = null;
        }
      }
      return status(options);
    }
  };
  return {
    stop: () => {
      stopped = true;
      return admitting;
    },
    operations: {
      'cv-prepare': (input) => {
        const task = admitting.then(() => start(input));
        admitting = task.catch(() => {});
        return task;
      },
      'cv-prepare-status': status,
    },
  };
};
