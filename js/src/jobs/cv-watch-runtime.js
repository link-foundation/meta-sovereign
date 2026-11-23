import { createHash, randomUUID } from 'node:crypto';
import { monitorCvSaves } from './cv-watch-monitor.js';
import { cvSaveAttempt } from './cv-watch-verification.js';
import { verifyOwnerCvSave } from './cv-save-cycle.js';
import { cvWatchUrl } from './cv-watch-browser.js';
import { publishCvSave } from './cv-watch-publication.js';
import { jobsFailure } from './options.js';
import { traceCvWatch } from './cv-watch-trace.js';
import {
  observeCvWorkplaceBaselines,
  missingWorkplaceBaseline,
} from './cv-watch-workplace-baseline.js';

const stale = () =>
  jobsFailure(
    'cv-changed',
    'The owner changed or cancelled this save attempt.'
  );

/** Durable public state contains no final draft text; only a digest of its fields. */
export const runCvWatch = async ({
  session,
  store,
  options,
  signal,
  save,
  readExports,
  verification,
}) => {
  let generation = 0;
  let stopped = false;
  let attempted = false;
  let cycle;
  let monitor;
  const baselines = observeCvWorkplaceBaselines({
    session,
    store,
    signal,
    readExports,
    readIds: verification?.readWorkplaceIds,
    readWorkplace: verification?.readWorkplace,
  });
  let tail = Promise.resolve();
  const tasks = new Set();
  const queue = (operation) => {
    const task = tail.then(operation);
    tail = task.catch(() => {});
    return task;
  };
  const check = (current) => {
    signal.throwIfAborted();
    if (stopped || current !== generation) {
      throw stale();
    }
  };
  const publish = (result, current, attemptId) =>
    queue(() =>
      publishCvSave({
        store,
        options,
        result,
        attemptId,
        check: () => check(current),
        save,
      })
    );
  const update = (change, current) =>
    queue(async () => {
      check(current);
      await save(change);
    });
  const failed = (error) => {
    traceCvWatch('observer-failed', { code: error.code ?? error.name });
    const current = ++generation;
    cycle?.abort();
    baselines.invalidate();
    return update(
      {
        state: 'failed',
        code: /^jobs-[a-z\d-]+$/u.test(error.code ?? '')
          ? error.code
          : 'jobs-cv-observer',
      },
      current
    );
  };
  const receive = (value, actualUrl) => {
    if (stopped || signal.aborted) {
      return;
    }
    traceCvWatch('event', { event: value?.event, generation });
    cvWatchUrl(actualUrl);
    if (value?.event === 'workplace-opened') {
      return baselines.open(value, actualUrl);
    }
    if (value?.event === 'workplace-closed') {
      return baselines.close(value.formId);
    }
    if (value?.event === 'overflow') {
      return failed({ code: 'jobs-cv-limit' });
    }
    if (!['save', 'cancel', 'edit'].includes(value?.event)) {
      throw stale();
    }
    if (value.event === 'edit' && !attempted) {
      return;
    }
    const current = ++generation;
    cycle?.abort();
    attempted = value.event === 'save';
    if (!attempted) {
      if (value.event === 'cancel') {
        baselines.invalidate();
      }
      return update(
        {
          state: value.event === 'cancel' ? 'cancelled' : 'edited',
          code: null,
        },
        current
      );
    }
    // A native Save handler may synchronously change the SPA URL before the
    // binding reaches the host. Both URLs still have to be allowlisted HH CV URLs.
    const attempt = cvSaveAttempt(value.form);
    const baseline = attempt.kind === 'workplace' && baselines.take(value);
    const attemptId = randomUUID();
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(attempt))
      .digest('hex');
    cycle = new AbortController();
    const cycleSignal = globalThis.AbortSignal.any([signal, cycle.signal]);
    const task = update(
      { state: 'verifying', code: null, attemptId, fingerprint },
      current
    )
      .then(() => {
        if (attempt.kind === 'workplace' && !baseline) {
          throw missingWorkplaceBaseline();
        }
        return verifyOwnerCvSave({
          session,
          store,
          attempt,
          check: () => check(current),
          signal: cycleSignal,
          readExports,
          ...verification,
          workplaceBaseline: baseline?.ids,
          workplaceBaselineJobs: baseline?.jobs,
          workplaceMembership: baseline?.membership,
        });
      })
      .then((result) => publish(result, current, attemptId))
      .catch((error) => {
        if (!signal.aborted && !stopped && current === generation) {
          return update(
            {
              state: 'not-saved',
              code: /^jobs-[a-z\d-]+$/u.test(error.code ?? '')
                ? error.code
                : 'jobs-cv-readback',
            },
            current
          );
        }
      });
    tasks.add(task);
    void task.then(
      () => tasks.delete(task),
      () => tasks.delete(task)
    );
    return Promise.resolve();
  };
  try {
    signal.throwIfAborted();
    monitor = await monitorCvSaves({ page: session.page, receive, failed });
    signal.throwIfAborted();
    return {
      async stop() {
        stopped = true;
        generation++;
        cycle?.abort();
        await Promise.all([baselines.stop(), monitor.stop()]);
        await Promise.allSettled([...tasks]);
        await tail;
      },
    };
  } catch (error) {
    stopped = true;
    cycle?.abort();
    await Promise.all([baselines.stop(), monitor?.stop()]);
    await Promise.allSettled([...tasks]);
    await tail;
    throw error;
  }
};
