import {
  resumeExportOptions,
  resumeExportRequestId,
} from './resume-export-options.js';
import {
  resumeExportResult,
  invalidResumeExport,
} from './resume-export-result.js';
import { jobsFailure } from './options.js';

const jobId = (id) => `jobs-resume-request:${resumeExportRequestId(id)}`;
const validTotals = (raw) =>
  !(
    (raw.total !== null &&
      (!Number.isInteger(raw.total) || raw.total < 1 || raw.total > 100)) ||
    !Array.isArray(raw.results) ||
    raw.results.length > (raw.total ?? 0) ||
    (raw.state === 'completed' &&
      (!raw.total || raw.results.length !== raw.total))
  );
export const resumeExportJob = (raw) => {
  if (
    !raw ||
    !['running', 'completed', 'failed', 'stopped', 'interrupted'].includes(
      raw.state
    ) ||
    !validTotals(raw) ||
    (raw.code !== null &&
      (typeof raw.code !== 'string' ||
        !/^(?:jobs|assignment)-[a-z\d-]+$/u.test(raw.code)))
  ) {
    invalidResumeExport();
  }
  const results = raw.results.map(resumeExportResult);
  if (new Set(results.map((result) => result.hash)).size !== results.length) {
    invalidResumeExport();
  }
  return {
    requestId: resumeExportRequestId(raw.requestId),
    state: raw.state,
    total: raw.total,
    results,
    code: raw.code,
  };
};

/** Durable IDs recover reads only; neither a restart nor a lost POST replays exports. */
export const createResumeExportControl = ({
  store,
  run,
  read,
  cancel,
  occupied,
}) => {
  let current;
  const uncertain = new Set();
  let tail = Promise.resolve();
  const enqueue = (operation) => {
    const next = tail.then(operation);
    tail = next.catch(() => {});
    return next;
  };
  const status = async ({ requestId }) => {
    const raw = await store.get(jobId(requestId));
    if (raw?.version !== 1 || raw.id !== jobId(requestId)) {
      throw jobsFailure(
        'export-missing',
        'This export request is not recoverable.'
      );
    }
    const job = resumeExportJob(raw);
    if (uncertain.has(requestId)) {
      return { ...job, state: 'interrupted', code: 'jobs-export-durability' };
    }
    if (job.state === 'running' && current?.requestId !== requestId) {
      return { ...job, state: 'interrupted', code: 'jobs-export-interrupted' };
    }
    return job;
  };
  const start = async (input) => {
    const requestId = resumeExportRequestId(input.requestId);
    const options = resumeExportOptions(input);
    const signature = JSON.stringify(options);
    const id = jobId(requestId);
    const previous = await store.get(id);
    if (previous) {
      if (previous.signature !== null && previous.signature !== signature) {
        throw jobsFailure(
          'export-conflict',
          'This request ID belongs to different export settings.'
        );
      }
      return status({ requestId });
    }
    if (current) {
      throw jobsFailure('busy', 'Another resume export is still owned.');
    }
    let admitted;
    let rejected;
    const admission = new Promise((resolve, reject) => {
      admitted = resolve;
      rejected = reject;
    });
    const job = {
      requestId,
      state: 'running',
      total: null,
      results: [],
      code: null,
    };
    const save = async () => {
      await store.put({ id, version: 1, signature, ...resumeExportJob(job) });
      await store.flush?.();
    };
    const owned = { requestId };
    current = owned;
    const task = run(async (signal) => {
      await save();
      admitted(resumeExportJob(job));
      try {
        await read({ ...options, signal }, async (change) => {
          if (change.total !== undefined) {
            job.total = change.total;
          }
          if (change.result) {
            job.results.push(resumeExportResult(change.result));
          }
          await save();
        });
        signal.throwIfAborted();
        job.state = 'completed';
      } catch (error) {
        job.state = signal.aborted ? 'stopped' : 'failed';
        job.code = /^(?:jobs|assignment)-[a-z\d-]+$/u.test(error.code ?? '')
          ? error.code
          : 'jobs-export-unavailable';
      }
      await save();
    });
    task.catch(rejected).finally(() => {
      if (current === owned) {
        current = null;
      }
    });
    return admission;
  };
  return {
    status,
    start: (input) => enqueue(() => start(input)),
    cancel: (input) =>
      enqueue(async () => {
        const requestId = resumeExportRequestId(input.requestId);
        if (current?.requestId === requestId) {
          await cancel();
          return status({ requestId });
        }
        const id = jobId(requestId);
        if (await store.get(id)) {
          if (uncertain.has(requestId)) {
            await store.flush?.();
            uncertain.delete(requestId);
          }
          return status({ requestId });
        }
        if (occupied()) {
          throw jobsFailure(
            'busy',
            'Another vacancy operation still owns this workspace.'
          );
        }
        const job = {
          requestId,
          state: 'stopped',
          total: null,
          results: [],
          code: 'jobs-export-cancelled',
        };
        uncertain.add(requestId);
        await store.put({ id, version: 1, signature: null, ...job });
        await store.flush?.();
        uncertain.delete(requestId);
        return resumeExportJob(job);
      }),
  };
};
