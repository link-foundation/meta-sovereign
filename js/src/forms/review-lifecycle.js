import { formFailure as failure } from './options.js';
import { reviewDeadline } from './review-deadline.js';

const detachRecord = async (records, record, timers) => {
  if (record.task || record.closing) {
    throw failure('form-busy', 'A form operation still owns this session.');
  }
  timers.clearTimeout(record.idleTimer);
  await record.monitor?.stop();
  await record.learning.detach();
  records.delete(record.id);
  try {
    await record.browser.detach();
  } catch (error) {
    records.set(record.id, record);
    throw error;
  }
  return {
    id: record.id,
    browserSlot: record.slot,
    state: 'detached',
    answerLearning: record.learning.status(),
    watcher: record.learning.watcher(),
  };
};

export const createReviewLifecycle = ({
  records,
  idleMs,
  deadlineMs,
  now,
  timers,
}) => {
  let stopping = false;
  const get = (id) => {
    const record = records.get(id);
    if (!record) {
      throw failure(
        'form-session-missing',
        'This review session is no longer open.'
      );
    }
    return record;
  };
  const check = (record) => {
    if (record.cancelled || stopping) {
      throw failure(
        record.cancelled ?? 'form-stopped',
        'Form review stopped before the operation completed.'
      );
    }
    if (record.browser?.page?.isClosed?.()) {
      throw failure('form-session-closed', 'The review browser has closed.');
    }
  };
  const dispose = (record) =>
    record.browser
      ? (record.disposal ??= Promise.resolve().then(async () => {
          await record.learning?.stop();
          await record.monitor?.stop();
          await record.browser.close();
        }))
      : Promise.resolve();
  const close = (id) => {
    const record = get(id);
    if (record.closing) {
      return record.closing;
    }
    if (record.state === 'close-failed') {
      record.disposal = null;
    }
    record.cancelled ??= 'form-session-closed';
    record.operationAbort?.abort();
    record.state = 'closing';
    timers.clearTimeout(record.idleTimer);
    record.closing = (async () => {
      await Promise.allSettled([record.task, dispose(record)]);
      try {
        await dispose(record);
        records.delete(id);
        return { ok: true, id, state: 'closed' };
      } catch {
        record.state = 'close-failed';
        record.error = 'form-close-failed';
        throw failure(
          'form-close-failed',
          'Browser cleanup was not confirmed. Retry closing this session.'
        );
      } finally {
        record.closing = null;
      }
    })();
    return record.closing;
  };
  const touch = (record) => {
    if (record.cancelled || stopping) {
      return;
    }
    record.lastUsedAt = now();
    timers.clearTimeout(record.idleTimer);
    if (record.learning?.detached) {
      return;
    }
    record.idleTimer = timers.setTimeout(() => {
      close(record.id).catch(() => {});
    }, idleMs);
    record.idleTimer.unref?.();
  };
  const run = async (record, operation) => {
    record.operationAbort = new AbortController();
    const deadline = reviewDeadline({
      milliseconds: deadlineMs,
      now,
      timers,
      expired: (code = 'form-timeout') => {
        record.cancelled = code;
        close(record.id).catch(() => {});
      },
    });
    record.pauseDeadline = deadline.pause;
    try {
      const result = await operation();
      check(record);
      record.error = null;
      touch(record);
      return result;
    } catch (error) {
      record.error = error.code ?? 'form-review-failed';
      check(record);
      throw error;
    } finally {
      deadline.stop();
      record.pauseDeadline = null;
      record.operationAbort = null;
    }
  };
  const stop = async () => {
    stopping = true;
    const results = await Promise.allSettled([...records.keys()].map(close));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError(
        failures.map((result) => result.reason),
        'Form review cleanup was not confirmed.'
      );
    }
  };
  const detach = async () => {
    stopping = true;
    const detached = [];
    for (const record of [...records.values()]) {
      if (!record.learning?.detached || !record.browser?.detach) {
        await close(record.id);
        continue;
      }
      detached.push(await detachRecord(records, record, timers));
    }
    return { ok: true, sessions: detached };
  };
  return {
    get,
    check,
    close,
    run,
    touch,
    stop,
    detach,
    isStopping: () => stopping,
  };
};
