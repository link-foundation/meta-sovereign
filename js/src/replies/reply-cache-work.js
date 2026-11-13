// One model admission/save lane; timers and idle work have an explicit lifetime.
export const createReplyWork = (failed) => {
  let tail = Promise.resolve();
  const timers = new Map();
  const cancel = (name) => {
    const task = timers.get(name);
    if (task) {
      globalThis.clearTimeout(task.timer);
      if (task.idle !== undefined) {
        globalThis.cancelIdleCallback?.(task.idle);
      }
      timers.delete(name);
    }
  };
  return {
    enqueue(run) {
      const result = tail.then(run);
      tail = result.catch(failed);
      return result;
    },
    schedule(name, run, ms, idle = false) {
      if (timers.has(name)) {
        return;
      }
      const task = {};
      const invoke = () => {
        // Cancellation also protects an already queued idle callback.
        if (timers.get(name) === task) {
          timers.delete(name);
          Promise.resolve()
            .then(run)
            .catch(() => {});
        }
      };
      task.timer = globalThis.setTimeout(() => {
        if (idle && globalThis.requestIdleCallback) {
          task.idle = globalThis.requestIdleCallback(invoke, { timeout: 5000 });
        } else {
          invoke();
        }
      }, ms);
      task.timer.unref?.();
      timers.set(name, task);
    },
    cancel,
    cancelAll() {
      for (const name of timers.keys()) {
        cancel(name);
      }
    },
  };
};

// A closing page can release its lane even when a custom fetch ignores abort.
// Its late response remains observed but never reaches model admission.
export const fetchReplyModel = (fetchModel, request, signal) =>
  new Promise((resolve, reject) => {
    const abort = () => resolve(null);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => (signal.aborted ? null : fetchModel({ ...request, signal })))
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });

export const createReplyFetcher = ({
  work,
  capture,
  admit,
  fetchModel,
  signal,
  nudgeMs,
}) => {
  let syncing = null;
  let again = false;
  const sync = () => {
    if (signal.aborted) {
      return Promise.resolve();
    }
    if (syncing) {
      again = true;
      return syncing;
    }
    syncing = work
      .enqueue(capture)
      .then(async (request) => {
        const model = await fetchReplyModel(
          fetchModel,
          { since: request.since },
          signal
        ).catch(() => null);
        return work.enqueue(async () => {
          if (!signal.aborted && model?.version) {
            again = !(await admit(model, request)) || again;
          }
        });
      })
      .finally(() => {
        syncing = null;
        if (again && !signal.aborted) {
          again = false;
          work.schedule('nudge', sync, nudgeMs);
        }
      });
    return syncing;
  };
  return sync;
};
