// Requests wait here during the short writer handoff. Their bodies stay paused.
export const createWorkerTarget = () => {
  let current = null;
  let paused = true;
  let closed = false;
  const waiting = new Set();
  const unavailable = () =>
    Object.assign(new Error('server host closed'), { code: 'HOST_CLOSED' });
  return {
    pause: () => {
      paused = true;
    },
    publish: (worker) => {
      if (closed) {
        return;
      }
      current = worker;
      paused = false;
      waiting.forEach((slot) => slot.resolve(worker));
      waiting.clear();
    },
    wait: (signal) => {
      if (closed || signal?.aborted) {
        return Promise.reject(unavailable());
      }
      if (current && !paused) {
        return Promise.resolve(current);
      }
      return new Promise((resolve, reject) => {
        const finish = (worker) => {
          signal?.removeEventListener('abort', abort);
          resolve(worker);
        };
        const abort = () => {
          waiting.delete(slot);
          reject(unavailable());
        };
        const slot = {
          resolve: finish,
          reject: (error) => {
            signal?.removeEventListener('abort', abort);
            reject(error);
          },
        };
        waiting.add(slot);
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
    close: () => {
      closed = true;
      waiting.forEach((slot) => slot.reject(unavailable()));
      waiting.clear();
    },
  };
};
