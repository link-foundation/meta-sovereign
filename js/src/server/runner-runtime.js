import { createRunnerController } from './runner-controller.js';

/** The API owns transports until completion, including an interrupted response. */
export const createRunnerRuntime = (options = {}) => {
  const controller = createRunnerController(options);
  const owned = new Map();
  let closed = false;
  return {
    execute(input) {
      if (closed) {
        return Promise.resolve({ ok: false, code: 'runner-controller-closed' });
      }
      const abort = new AbortController();
      const pending = Promise.resolve()
        .then(() => controller.execute({ ...input, signal: abort.signal }))
        .finally(() => owned.delete(abort));
      owned.set(abort, pending);
      return pending;
    },
    async close() {
      closed = true;
      for (const abort of owned.keys()) {
        abort.abort();
      }
      await Promise.allSettled([...owned.values()]);
    },
  };
};
