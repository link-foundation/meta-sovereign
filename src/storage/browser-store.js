/**
 * Browser-side links store for offline-first operation.
 *
 * Implements `UniversalLinksAccess` so any code that talks to the
 * server store also works against a wholly local store — the SPA can
 * boot with no network, write/read links, and reconcile later when
 * a server (or another peer) shows up. The directive: "we should
 * support all possible ways" of local persistence (IndexedDB,
 * localStorage, files).
 *
 * The store keeps the live data in a JS `Map` for synchronous, fast
 * lookups and persists snapshots to a pluggable *driver*. Drivers
 * expose `load() -> Promise<snapshot|null>` and `save(snapshot) ->
 * Promise<void>`; ship-in drivers cover IndexedDB, localStorage, and
 * an in-memory driver used by tests. Browser code picks the best
 * driver at boot via `pickBrowserDriver()`.
 *
 * Snapshot shape: `{ links: Link[] }`. We persist on every mutation
 * (debounced via micro-task batching) so a tab refresh never loses
 * data. The driver layer keeps the store synchronous in spirit even
 * though the API is async, and lets us pivot to file-system storage
 * (Electron) by adding another driver.
 */

const SNAPSHOT_KEY = 'meta-sovereign:store-snapshot';

const cloneLink = (link) => JSON.parse(JSON.stringify(link));

export const createInMemoryDriver = () => {
  let snapshot = null;
  return {
    async load() {
      return snapshot;
    },
    async save(next) {
      snapshot = JSON.parse(JSON.stringify(next));
    },
  };
};

export const createLocalStorageDriver = (
  storage = globalThis.localStorage,
  key = SNAPSHOT_KEY
) => ({
  async load() {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  async save(snapshot) {
    storage.setItem(key, JSON.stringify(snapshot));
  },
});

const idbReq = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const createIndexedDbDriver = ({
  factory = globalThis.indexedDB,
  dbName = 'meta-sovereign',
  storeName = 'snapshot',
  key = 'current',
} = {}) => {
  let dbPromise = null;
  const open = () => {
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
      const req = factory.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) {
          req.result.createObjectStore(storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  };
  return {
    async load() {
      const db = await open();
      const tx = db.transaction(storeName, 'readonly');
      const obj = tx.objectStore(storeName);
      const value = await idbReq(obj.get(key));
      return value ?? null;
    },
    async save(snapshot) {
      const db = await open();
      const tx = db.transaction(storeName, 'readwrite');
      const obj = tx.objectStore(storeName);
      await idbReq(obj.put(snapshot, key));
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
    },
  };
};

/**
 * Auto-pick the best driver available in the current browser env:
 *   1. IndexedDB if present (durable, larger quota)
 *   2. localStorage as fallback (older browsers, private mode)
 *   3. In-memory if nothing persistent works
 */
export const pickBrowserDriver = () => {
  if (typeof globalThis.indexedDB !== 'undefined') {
    try {
      return createIndexedDbDriver();
    } catch {
      // fall through
    }
  }
  if (typeof globalThis.localStorage !== 'undefined') {
    try {
      return createLocalStorageDriver();
    } catch {
      // fall through
    }
  }
  return createInMemoryDriver();
};

export const createBrowserStore = async ({
  driver = createInMemoryDriver(),
} = {}) => {
  const data = new Map();
  const handlers = new Set();
  const emit = (event) => {
    for (const h of handlers) {
      h(event);
    }
  };

  const snapshot = await driver.load();
  if (snapshot?.links) {
    for (const link of snapshot.links) {
      data.set(link.id, cloneLink(link));
    }
  }

  let saveQueued = false;
  const queueSave = () => {
    if (saveQueued) {
      return;
    }
    saveQueued = true;
    Promise.resolve().then(async () => {
      saveQueued = false;
      await driver.save({ links: [...data.values()] });
    });
  };

  return {
    async put(link) {
      if (!link || typeof link.id !== 'string') {
        throw new Error('link.id is required');
      }
      data.set(link.id, cloneLink(link));
      queueSave();
      emit({ type: 'put', link: cloneLink(link) });
      return link;
    },
    async get(id) {
      const v = data.get(id);
      return v ? cloneLink(v) : null;
    },
    async delete(id) {
      const existed = data.has(id);
      const link = data.get(id);
      data.delete(id);
      if (existed) {
        queueSave();
        emit({ type: 'delete', link: cloneLink(link) });
      }
      return existed;
    },
    async query(filter) {
      const all = [...data.values()].map(cloneLink);
      return filter ? all.filter(filter) : all;
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    /** Force-flush the persistence layer (useful in tests). */
    async flush() {
      await driver.save({ links: [...data.values()] });
    },
  };
};
