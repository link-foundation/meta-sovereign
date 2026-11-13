// Snapshot revisions belong to a browser persistence root, not to replicated
// Link records. Legacy roots are compared by their complete serialized value.
const REVISION = '__msSnapshotRevision';

export const snapshotVersion = (snapshot) =>
  typeof snapshot?.[REVISION] === 'string'
    ? `revision:${snapshot[REVISION]}`
    : `legacy:${JSON.stringify(snapshot ?? null)}`;

export const assertSnapshotVersion = (snapshot, expected) => {
  if (snapshotVersion(snapshot) !== expected) {
    throw Object.assign(
      new Error(
        'Another tab changed the saved data. This write was not saved. Keep a copy of your unsaved changes before reloading.'
      ),
      { code: 'STORE_SNAPSHOT_CHANGED' }
    );
  }
};

// Direct driver callers also get protection after load. The browser store
// supplies its own expected version, so sharing a driver cannot reset another
// open store's baseline. Only successful durable commits advance that version.
export const versionedSnapshotDriver = ({ load, save, notifications }) => {
  let baseline;
  let initialRead;
  return {
    revisioned: true,
    watch: notifications?.watch,
    async load() {
      const snapshot = await load();
      baseline = snapshotVersion(snapshot);
      return snapshot;
    },
    async save(snapshot, options = {}) {
      if (!Object.hasOwn(options, 'expected') && baseline === undefined) {
        initialRead ??= load().then(snapshotVersion);
        baseline ??= await initialRead;
      }
      const expected = Object.hasOwn(options, 'expected')
        ? options.expected
        : baseline;
      const next = {
        ...snapshot,
        [REVISION]: globalThis.crypto.randomUUID(),
      };
      await save(next, expected);
      baseline = snapshotVersion(next);
      notifications?.publish();
      return baseline;
    },
  };
};

/** Compare and write inside the SAME native readwrite transaction. */
export const saveIndexedSnapshot = (db, storeName, key, next, expected) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    let failure;
    const fail = (error) => {
      failure ??= error;
      try {
        tx.abort();
      } catch {
        // A request error may already have aborted the transaction.
      }
      reject(failure);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error);
    tx.onerror = () => fail(tx.error);
    try {
      const obj = tx.objectStore(storeName);
      const read = obj.get(key);
      read.onerror = () => fail(read.error);
      read.onsuccess = () => {
        try {
          assertSnapshotVersion(read.result, expected);
          // Remain in the request callback: Safari may deactivate a
          // transaction across an unrelated asynchronous continuation.
          const put = obj.put(next, key);
          put.onerror = () => fail(put.error);
        } catch (error) {
          fail(error);
        }
      };
    } catch (error) {
      fail(error);
    }
  });

export const saveLocalSnapshot = (storage, key, locks, next, expected) => {
  if (!locks?.request) {
    throw Object.assign(
      new Error(
        'Safe local storage writes require Web Locks. Enable IndexedDB or open the app at a secure address.'
      ),
      { code: 'STORE_COORDINATION_UNAVAILABLE' }
    );
  }
  // Do not queue indefinitely behind a suspended tab. The caller may retry
  // explicitly; the version check still prevents overwriting a newer commit.
  return locks.request(
    `meta-sovereign:snapshot:${key}`,
    { ifAvailable: true },
    (lock) => {
      if (!lock) {
        throw Object.assign(
          new Error(
            'Another tab is saving data. This write was not saved; retry it.'
          ),
          { code: 'STORE_SNAPSHOT_BUSY' }
        );
      }
      const raw = storage.getItem(key);
      let before = null;
      try {
        before = raw ? JSON.parse(raw) : null;
      } catch {
        // Keep the legacy load contract for malformed local snapshots.
      }
      assertSnapshotVersion(before, expected);
      storage.setItem(key, JSON.stringify(next));
    }
  );
};
