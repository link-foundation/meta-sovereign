// Serialize root saves and refreshes without blocking synchronous owner admission.
import { snapshotVersion } from './browser-snapshot.js';
import { mutationEvent } from './mutation.js';
import {
  mergeBrowserSnapshot,
  snapshotRecords,
  watchSnapshotRoot,
  reportSnapshotError,
} from './browser-coordination.js';

export const createSnapshotWriter = ({
  driver,
  snapshot,
  data,
  cloneLink,
  emit,
}) => {
  let expected = snapshotVersion(snapshot);
  let pending = null;
  let tail = Promise.resolve();
  let baseline = null;
  let schema = null;
  let unwatch = () => {};
  let refreshing = null;
  const rebase = async () => {
    const latest = await driver.load();
    if (snapshotVersion(latest) === expected) {
      return;
    }
    const remote = snapshotRecords(latest);
    const merged = mergeBrowserSnapshot(baseline, data, remote, schema);
    const updates = [];
    for (const [id, link] of merged) {
      if (JSON.stringify(link) !== JSON.stringify(data.get(id))) {
        updates.push(mutationEvent('put', cloneLink(link)));
      }
    }
    for (const [id, link] of data) {
      if (!merged.has(id)) {
        updates.push(mutationEvent('delete', cloneLink(link)));
      }
    }
    data.clear();
    for (const [id, link] of merged) {
      data.set(id, link);
    }
    baseline = remote;
    expected = snapshotVersion(latest);
    // Admit the entire merged root before subscribers can make another edit.
    for (const event of updates) {
      emit(event);
    }
  };
  const refresh = () => {
    if (!schema) {
      return Promise.resolve();
    }
    if (!refreshing) {
      refreshing = tail.then(async () => {
        refreshing = null;
        await rebase();
      });
      tail = refreshing.catch(() => {});
    }
    return refreshing;
  };
  const persist = async () => {
    for (let attempt = 0; ; attempt += 1) {
      const next = { links: [...data.values()].map(cloneLink) };
      try {
        const committed = await driver.save(next, { expected });
        expected =
          typeof committed === 'string' ? committed : snapshotVersion(next);
        if (schema) {
          baseline = new Map(next.links.map((link) => [link.id, link]));
        }
        return;
      } catch (error) {
        if (
          !schema ||
          attempt >= 7 ||
          !['STORE_SNAPSHOT_CHANGED', 'STORE_SNAPSHOT_BUSY'].includes(
            error?.code
          )
        ) {
          throw error;
        }
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
        await rebase();
      }
    }
  };
  const queueSave = () => {
    if (pending) {
      return pending;
    }
    const saving = tail.then(async () => {
      pending = null;
      await persist();
    });
    pending = saving;
    // Failed callers retain their rejection, while later saves may recover.
    // This also observes a save if a synchronous subscriber throws first.
    tail = saving.catch(() => {});
    return saving;
  };

  return {
    coordinate(options) {
      if (!driver.revisioned || schema || options.signal?.aborted) {
        return;
      }
      const opening = new Map(data);
      // Reject activation on an unmigrated or incompatible opening.
      mergeBrowserSnapshot(opening, data, opening, options.schema);
      baseline = opening;
      schema = options.schema;
      unwatch = watchSnapshotRoot(driver, refresh, options);
      // Close the load-to-subscribe gap, including another tab's boot commit.
      refresh().catch((error) => reportSnapshotError(options.onError, error));
    },
    save: queueSave,
    refresh,
    async close() {
      unwatch();
      for (;;) {
        const waiting = tail;
        await waiting;
        if (waiting === tail) {
          return;
        }
      }
    },
  };
};
