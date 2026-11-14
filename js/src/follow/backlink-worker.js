import { backlinkError } from './backlink-shape.js';
import { createBacklinkOperations } from './backlink-operations.js';
export const createBacklinkWorker = (options) => {
  const { job, control, now, sleep } = options;
  const { deliver, observe, clean, save, cancelled } =
    createBacklinkOperations(options);
  const pauseRow = (row, error) => {
    Object.assign(row, backlinkError(error));
    job.status = 'paused';
  };
  const monitor = async () => {
    while (
      !cancelled() &&
      job.rows.some((row) => row.status === 'monitoring')
    ) {
      const rows = job.rows.filter((row) => row.status === 'monitoring');
      const remaining = Math.min(
        ...rows.map((row) =>
          Math.max(0, row.sentAt + job.config.monitorMs - now())
        )
      );
      await sleep(Math.min(job.config.intervalMs, remaining), control.signal);
      for (const row of rows) {
        if (cancelled()) {
          break;
        }
        try {
          await observe(row);
        } catch (error) {
          pauseRow(row, error);
          await save();
          return;
        }
      }
    }
  };
  return async () => {
    job.status = 'running';
    await save();
    for (const row of job.rows) {
      if (cancelled()) {
        break;
      }
      try {
        await deliver(row);
        if (row.status === 'monitoring' && job.config.delayMs) {
          await sleep(job.config.delayMs, control.signal);
        }
      } catch (error) {
        pauseRow(row, error);
        await save();
        return;
      }
    }
    await monitor();
    if (job.status === 'paused') {
      return;
    }
    for (const row of job.rows) {
      if (cancelled()) {
        break;
      }
      try {
        await clean(row);
      } catch (error) {
        pauseRow(row, error);
        await save();
        return;
      }
    }
    job.status = cancelled()
      ? 'paused'
      : job.rows.some((row) => ['unknown', 'sending'].includes(row.status))
        ? 'unknown'
        : job.rows.some((row) => row.status === 'failed')
          ? 'failed'
          : job.rows.some((row) => row.status === 'rejected')
            ? 'rejected'
            : job.rows.some(
                  (row) => row.cleanup && row.cleanup.status !== 'confirmed'
                )
              ? 'unknown'
              : 'confirmed';
    job.updatedAt = now();
    await save();
  };
};
