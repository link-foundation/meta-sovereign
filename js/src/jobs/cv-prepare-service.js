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
const admissions = new WeakMap();
const assertRunning = (stopped) => {
  if (stopped) {
    throw cvPrepareFailure('stopped');
  }
};
const preparationLane = (store) => {
  let lane = admissions.get(store);
  if (!lane) {
    lane = { tail: Promise.resolve(), current: null, cancellations: new Map() };
    admissions.set(store, lane);
  }
  return lane;
};
const enqueuePreparation = (lane, operation) => {
  const task = lane.tail.then(operation);
  lane.tail = task.catch(() => {});
  return task;
};
const cancelPreparation = async ({ store, lane, status }, input) => {
  const identity = cvPrepareIdentity(input);
  if (await store.get(recordId(identity.requestId))) {
    // Issued work is reported accurately. This operation never closes,
    // undoes or calls native Cancel on an existing provider draft.
    return status(identity);
  }
  const row = {
    id: recordId(identity.requestId),
    ...identity,
    version: 1,
    state: 'cancelled',
    providerSaved: false,
    updatedAt: new Date().toISOString(),
  };
  const result = cvPrepareResult(row, identity);
  const durable = saveTechnologyRecord(store, row);
  lane.cancellations.set(identity.requestId, durable);
  try {
    await durable;
  } finally {
    lane.cancellations.delete(identity.requestId);
  }
  return result;
};
export const createCvPrepareService = ({
  store,
  artifactRoot,
  run,
  attach = attachCvWatchBrowser,
  prepare = prepareNativeCvAbout,
}) => {
  const lane = preparationLane(store);
  let stopped = false;
  const enqueue = (operation) => enqueuePreparation(lane, operation);
  const status = async (input) => {
    const browserSlot = browserName(input.browserSlot ?? 'jobs');
    const requestId =
      input.requestId ??
      (await store.get(`jobs-cv-prepare-latest:${browserSlot}`))?.requestId;
    if (!requestId) {
      return { preparation: null };
    }
    await lane.cancellations.get(requestId);
    const raw = await store.get(recordId(requestId));
    if (!raw) {
      return { preparation: null };
    }
    const answer = cvPrepareResult(raw, {
      ...input,
      browserSlot,
      requestId,
    });
    const { preparation } = answer;
    if (!preparation) {
      return answer;
    }
    return {
      preparation:
        ['starting', 'opening', 'preparing'].includes(preparation.state) &&
        lane.current !== requestId
          ? {
              ...preparation,
              state: 'interrupted',
              code: 'jobs-cv-interrupted',
            }
          : preparation,
    };
  };
  const start = async (input) => {
    assertRunning(stopped);
    const options = cvPrepareOptions(input);
    const previous = await store.get(recordId(options.requestId));
    if (previous) {
      if (previous.state === 'cancelled') {
        return status(options);
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
      lane.current = options.requestId;
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
          lane.current = null;
        }
      }
      return status(options);
    }
  };

  return {
    stop: () => {
      stopped = true;
      return lane.tail;
    },
    operations: {
      'cv-prepare': (input) => enqueue(() => start(input)),
      'cv-prepare-cancel': (input) =>
        enqueue(() => {
          assertRunning(stopped);
          return cancelPreparation({ store, lane, status }, input);
        }),
      'cv-prepare-status': status,
    },
  };
};
