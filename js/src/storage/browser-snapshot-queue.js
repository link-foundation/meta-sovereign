/** Serialize and batch durable snapshots; expose only the last committed map. */
export const createBrowserSnapshotQueue = ({ initial, driver, emit }) => {
  let current = initial;
  let running = false;
  const pending = [];
  const drain = async () => {
    const jobs = pending.splice(0);
    const next = new Map(current);
    try {
      const changes = jobs.map((job) => job.apply(next));
      await driver.save({ links: [...next.values()] });
      current = next;
      jobs.forEach((job, index) => {
        try {
          for (const event of changes[index].events) {
            emit(event);
          }
          job.resolve(changes[index].result);
        } catch (error) {
          job.reject(error);
        }
      });
    } catch (error) {
      jobs.forEach((job) => job.reject(error));
    } finally {
      running = false;
      schedule();
    }
  };
  const schedule = () => {
    if (!running && pending.length) {
      running = true;
      globalThis.queueMicrotask(drain);
    }
  };
  return {
    read: () => current,
    write: (apply) =>
      new Promise((resolve, reject) => {
        pending.push({ apply, resolve, reject });
        schedule();
      }),
  };
};
