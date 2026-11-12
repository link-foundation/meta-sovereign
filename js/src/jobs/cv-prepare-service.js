import { attachCvWatchBrowser } from './cv-watch-browser.js';
import { prepareNativeCvAbout } from './cv-prepare-browser.js';
import { cvPrepareSource } from './cv-prepare-source.js';
import {
  cvPrepareOptions,
  cvPrepareResult,
  cvPrepareFailure,
  cvPrepareIdentity,
} from './cv-prepare-record.js';
import { saveTechnologyRecord } from './technology-storage.js';
import { browserName } from '../browser/policy.js';
import { resumeExportRequestId } from './resume-export-options.js';

const recordId = (id) => `jobs-cv-prepare:${resumeExportRequestId(id)}`;
const readPreparation = async (store, input) => {
  const browserSlot = browserName(input.browserSlot ?? 'jobs');
  const requestId =
    input.requestId ??
    (await store.get(`jobs-cv-prepare-latest:${browserSlot}`))?.requestId;
  if (!requestId) {
    return null;
  }
  const raw = await store.get(recordId(requestId));
  return raw
    ? cvPrepareResult(raw, { ...input, browserSlot, requestId }).preparation
    : null;
};
const saveCancellation = async (store, identity) => {
  const now = new Date().toISOString();
  const { preparation } = cvPrepareResult({
    ...identity,
    version: 1,
    state: 'cancelled',
    providerSaved: false,
    hash: null,
    language: null,
    code: 'jobs-cv-cancelled',
    startedAt: now,
    updatedAt: now,
  });
  await saveTechnologyRecord(store, {
    id: recordId(identity.requestId),
    ...preparation,
  });
  return preparation;
};
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
  const enqueue = (work) => {
    const task = admitting.then(work);
    admitting = task.catch(() => {});
    return task;
  };
  const latest = (identity) =>
    saveTechnologyRecord(store, {
      id: `jobs-cv-prepare-latest:${identity.browserSlot}`,
      requestId: identity.requestId,
    });
  const status = async (input) => {
    const preparation = await readPreparation(store, input);
    return {
      preparation:
        ['starting', 'opening', 'preparing'].includes(preparation?.state) &&
        current !== preparation.requestId
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
      if (previous.state === 'cancelled') {
        return status(cvPrepareIdentity(options));
      }
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
        await latest(options);
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
  const cancel = async (input) => {
    if (stopped) {
      throw cvPrepareFailure('stopped');
    }
    const identity = cvPrepareIdentity(input);
    const id = recordId(identity.requestId);
    if (await store.get(id)) {
      // Admission is serialized: any issued browser work has drained first.
      // Its actual receipt remains authoritative; never cancel a native form.
      return status(identity);
    }
    const preparation = await saveCancellation(store, identity);
    await latest(identity);
    return { preparation };
  };
  return {
    stop: () => {
      stopped = true;
      return admitting;
    },
    operations: {
      'cv-prepare': (input) => enqueue(() => start(input)),
      'cv-prepare-cancel': (input) => enqueue(() => cancel(input)),
      'cv-prepare-status': status,
    },
  };
};
