import { createBacklinkWorker } from './backlink-worker.js';
import { createAutoFollowing } from './auto-following.js';
import { recoverBacklinkRow, saveBacklink } from './backlink-journal.js';

const nextAttempt = (row) => {
  const attempts = [
    ...(row.attempts ?? []),
    {
      round: row.round ?? 0,
      messageId: row.messageId,
      status: row.status,
      sentAt: row.sentAt,
      checkedAt: row.checkedAt,
      checks: row.checks,
      following: row.following,
    },
  ];
  return {
    chat: row.chat,
    title: row.title,
    status: 'ready',
    round: (row.round ?? 0) + 1,
    attempts,
  };
};
export const createAutoBacklinkWorker = (options) => {
  const { job, store, control } = options;
  if (!job.config.autoFollow) {
    return createBacklinkWorker(options);
  }
  const following = createAutoFollowing(options);
  return async () => {
    while (!control.signal.aborted) {
      job.status = 'running';
      for (const row of job.rows) {
        if (row.status === 'ready') {
          Object.assign(row, await recoverBacklinkRow(store, job, row));
        }
      }
      await saveBacklink(store, job);
      await following();
      await createBacklinkWorker(options)();
      if (job.status !== 'rejected' || control.signal.aborted) {
        return;
      }
      const retryable = (row) =>
        row.status === 'rejected' &&
        !row.skipRetry &&
        (row.round ?? 0) < job.config.autoFollow.maxRetries;
      if (!job.rows.some(retryable)) {
        job.completion = job.rows.some((row) => row.skipRetry)
          ? 'wait-notice'
          : 'retry-limit';
        await saveBacklink(store, job);
        return;
      }
      job.rows = job.rows.map((row) =>
        retryable(row) ? nextAttempt(row) : row
      );
      await saveBacklink(store, job);
    }
    job.status = 'paused';
    await saveBacklink(store, job);
  };
};
