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
const DOUBLETS_WEB_SNAPSHOT_KEY = 'meta-sovereign:doublets-web-snapshot';

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
      const txDone = new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
      const obj = tx.objectStore(storeName);
      await idbReq(obj.put(snapshot, key));
      await txDone;
    },
  };
};

const createBestSnapshotDriver = (key = SNAPSHOT_KEY) => {
  if (typeof globalThis.indexedDB !== 'undefined') {
    try {
      return createIndexedDbDriver({
        dbName: key.replaceAll(':', '-'),
        storeName: 'snapshot',
        key: 'current',
      });
    } catch {
      // fall through
    }
  }
  if (typeof globalThis.localStorage !== 'undefined') {
    try {
      return createLocalStorageDriver(globalThis.localStorage, key);
    } catch {
      // fall through
    }
  }
  return createInMemoryDriver();
};

const resolveDoubletsWeb = (doubletsWeb) => {
  const module =
    doubletsWeb ?? globalThis.DoubletsWeb ?? globalThis.doubletsWeb ?? null;
  if (!module?.LinksConstants || !module?.UnitedLinks || !module?.Link) {
    throw new Error(
      'doublets-web module with Link/LinksConstants/UnitedLinks is required'
    );
  }
  return module;
};

const encodeDoubletsGraph = (doubletsWeb, snapshot) => {
  const { LinksConstants, UnitedLinks } = resolveDoubletsWeb(doubletsWeb);
  const constants = new LinksConstants();
  const links = new UnitedLinks(constants);
  const atoms = new Map();
  const triples = [];
  const intern = (value) => {
    const key = String(value);
    if (atoms.has(key)) {
      return atoms.get(key);
    }
    const id = links.create();
    links.update(id, id, id);
    atoms.set(key, id);
    return id;
  };
  const edge = (source, target) => {
    const id = links.create();
    links.update(id, source, target);
    triples.push([id, source, target]);
    return id;
  };

  const root = intern('meta-sovereign:browser-store');
  for (const link of snapshot.links ?? []) {
    const record = intern(`link:${link.id}`);
    edge(root, record);
    edge(record, intern(`id:${link.id}`));
    edge(record, intern(`json:${JSON.stringify(link)}`));
    for (const token of link.tokens ?? []) {
      edge(record, intern(`token:${token}`));
    }
    for (const child of link.children ?? []) {
      edge(record, intern(`child:${child}`));
    }
  }

  return { constants, links, atoms, triples };
};

export const createDoubletsWebDriver = ({
  doubletsWeb,
  snapshotDriver = createBestSnapshotDriver(DOUBLETS_WEB_SNAPSHOT_KEY),
  onGraph,
} = {}) => {
  const module = resolveDoubletsWeb(doubletsWeb);
  let current = { links: [] };
  let graph = encodeDoubletsGraph(module, current);

  const rebuild = (snapshot) => {
    current = {
      links: Array.isArray(snapshot?.links)
        ? snapshot.links.map(cloneLink)
        : [],
    };
    graph = encodeDoubletsGraph(module, current);
    onGraph?.({ graph, snapshot: { links: current.links.map(cloneLink) } });
  };

  return {
    kind: 'doublets-web',
    async load() {
      const loaded = (await snapshotDriver.load()) ?? { links: [] };
      rebuild(loaded);
      return { links: current.links.map(cloneLink) };
    },
    async save(snapshot) {
      rebuild(snapshot);
      await snapshotDriver.save({
        links: current.links.map(cloneLink),
        doubletsWeb: this.stats(),
      });
    },
    stats() {
      return {
        package: 'doublets-web',
        records: current.links.length,
        atoms: graph.atoms.size,
        triples: graph.triples.length,
        graphLinks:
          typeof graph.links.count === 'function'
            ? graph.links.count()
            : graph.triples.length + graph.atoms.size,
      };
    },
    graph() {
      return graph;
    },
  };
};

export const loadDoubletsWebDriver = async (options = {}) => {
  const {
    importer = () => import('doublets-web'),
    doubletsWeb,
    ...rest
  } = options;
  return createDoubletsWebDriver({
    ...rest,
    doubletsWeb: doubletsWeb ?? (await importer()),
  });
};

/**
 * Auto-pick the best driver available in the current browser env:
 *   1. doublets-web when a bundler or host exposes the WASM module
 *   2. IndexedDB if present (durable, larger quota)
 *   3. localStorage as fallback (older browsers, private mode)
 *   4. In-memory if nothing persistent works
 */
export const pickBrowserDriver = () => {
  const doubletsWeb = globalThis.DoubletsWeb ?? globalThis.doubletsWeb ?? null;
  if (doubletsWeb) {
    try {
      return createDoubletsWebDriver({ doubletsWeb });
    } catch {
      // fall through
    }
  }
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
