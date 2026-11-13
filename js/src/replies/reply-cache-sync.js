import {
  watchSnapshotRoot,
  reportSnapshotError,
} from '../storage/browser-coordination.js';
import {
  compareReplyVersions,
  createReplyPersistence,
  captureReplyRequest,
  sameReplySettings,
} from './reply-persistence.js';
import { createReplyWork, createReplyFetcher } from './reply-cache-work.js';

export const createReplyCacheSync = ({
  driver,
  fetchModel,
  apply,
  snapshot,
  header,
  version,
  saveMs,
  nudgeMs,
  signal,
  onError,
}) => {
  const persistence = createReplyPersistence(driver);
  const lifetime = new AbortController();
  let authority;
  let dirty = false;
  let errorCode = null;
  let stopped = false;
  let started;
  let refreshing = null;
  let closing;
  let unwatch = () => {};
  const failed = (error) => {
    errorCode =
      typeof error?.code === 'string' &&
      /^[A-Z][A-Z_0-9]{0,63}$/u.test(error.code)
        ? error.code
        : 'REPLY_CACHE_UNAVAILABLE';
    reportSnapshotError(onError, { code: errorCode });
  };
  const work = createReplyWork(failed);
  const watchOptions = { signal: lifetime.signal, onError: failed };
  const persist = async () => {
    if (!dirty || !driver) {
      return;
    }
    const result = await persistence.save(snapshot(), authority);
    if (result.model.version !== version()) {
      await apply(result.model);
    }
    authority = result.expected;
    dirty = false;
    errorCode = null;
  };
  const flush = () => {
    work.cancel('save');
    return closing ?? work.enqueue(persist);
  };
  const refresh = () => {
    if (stopped) {
      return Promise.resolve();
    }
    refreshing ??= work.enqueue(async () => {
      refreshing = null;
      const current = await persistence.read();
      if (!current.model) {
        return;
      }
      const order = compareReplyVersions(current.model.version, version());
      const settingsMatch = sameReplySettings(current.model, header());
      if (!dirty || (order !== null && order >= 0 && settingsMatch)) {
        if (order === null || order > 0 || !settingsMatch) {
          await apply(current.model);
        }
        authority = current.expected;
        dirty = false;
        errorCode = null;
      }
    });
    return refreshing;
  };
  const sync = createReplyFetcher({
    work,
    fetchModel,
    signal: lifetime.signal,
    nudgeMs,
    capture: () => captureReplyRequest(persistence, version()),
    admit: async (model, request) => {
      if (request.local !== version()) {
        return false;
      }
      if (await apply(model)) {
        dirty = true;
        authority = request.authority;
        const whole = Array.isArray(model.links);
        if (whole) {
          work.cancel('save');
        }
        work.schedule('save', flush, whole ? 0 : saveMs, whole);
      }
      return true;
    },
  });
  const close = () => {
    if (!closing) {
      stopped = true;
      unwatch();
      signal?.removeEventListener('abort', abort);
      lifetime.abort();
      work.cancelAll();
      closing = work.enqueue(persist);
    }
    return closing;
  };
  const abort = () => close().catch(() => {});
  const start = () => {
    if (stopped) {
      return Promise.resolve();
    }
    started ??= work
      .enqueue(async () => {
        const current = await persistence.read();
        if (current.model && !version()) {
          await apply(current.model);
        }
        if (!dirty) {
          authority = current.expected;
        }
      })
      .catch(() => {})
      .then(() => {
        if (!stopped) {
          unwatch = watchSnapshotRoot(driver ?? {}, refresh, watchOptions);
          return refresh()
            .catch(() => {})
            .then(sync);
        }
      });
    return started;
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) {
    abort();
  }
  return {
    start,
    sync,
    refresh,
    flush,
    close,
    nudge() {
      if (started && !stopped) {
        work.cancel('nudge');
        work.schedule('nudge', sync, nudgeMs);
      }
    },
    persistence: () => ({ dirty, code: errorCode, closed: stopped }),
  };
};
