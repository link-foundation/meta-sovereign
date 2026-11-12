import { getLocalStorage } from './local-storage.js';
import { createBrowserSnapshotQueue } from './browser-snapshot-queue.js';

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
 * (serialized with micro-task batching), acknowledging mutations and
 * emitting events only after persistence succeeds. Readers see committed
 * state. The driver layer lets us pivot to file-system storage
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
  storage = getLocalStorage(),
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
  const localStorage = getLocalStorage();
  if (localStorage) {
    try {
      return createLocalStorageDriver(localStorage, key);
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
  const stats = (snapshot, encoded) => ({
    package: 'doublets-web',
    records: snapshot.links.length,
    atoms: encoded.atoms.size,
    triples: encoded.triples.length,
    graphLinks:
      typeof encoded.links.count === 'function'
        ? encoded.links.count()
        : encoded.triples.length + encoded.atoms.size,
  });
  const publish = (next, encoded) => {
    current = next;
    graph = encoded;
    onGraph?.({ graph, snapshot: { links: current.links.map(cloneLink) } });
  };

  const rebuild = (snapshot) => {
    const next = {
      links: Array.isArray(snapshot?.links)
        ? snapshot.links.map(cloneLink)
        : [],
    };
    publish(next, encodeDoubletsGraph(module, next));
  };

  return {
    kind: 'doublets-web',
    async load() {
      const loaded = (await snapshotDriver.load()) ?? { links: [] };
      rebuild(loaded);
      return { links: current.links.map(cloneLink) };
    },
    async save(snapshot) {
      const next = { links: snapshot.links.map(cloneLink) };
      const encoded = encodeDoubletsGraph(module, next);
      await snapshotDriver.save({
        links: next.links.map(cloneLink),
        doubletsWeb: stats(next, encoded),
      });
      publish(next, encoded);
    },
    stats() {
      return stats(current, graph);
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
 * `suffix` keeps another copy apart (an extra Telegram account's, R-Y202).
 */
export const pickBrowserDriver = ({ suffix = '' } = {}) => {
  const doubletsWeb = globalThis.DoubletsWeb ?? globalThis.doubletsWeb ?? null;
  if (doubletsWeb) {
    try {
      return createDoubletsWebDriver({
        doubletsWeb,
        snapshotDriver: createBestSnapshotDriver(
          `${DOUBLETS_WEB_SNAPSHOT_KEY}${suffix}`
        ),
      });
    } catch {
      // fall through
    }
  }
  if (typeof globalThis.indexedDB !== 'undefined') {
    try {
      return createIndexedDbDriver({ dbName: `meta-sovereign${suffix}` });
    } catch {
      // fall through
    }
  }
  const localStorage = getLocalStorage();
  if (localStorage) {
    try {
      return createLocalStorageDriver(localStorage, `${SNAPSHOT_KEY}${suffix}`);
    } catch {
      // fall through
    }
  }
  return createInMemoryDriver();
};

/**
 * The best keeping for a snapshot of links other than the store's own
 * (the reply index's copy, ./replies/reply-cache.js): doublets-web when
 * present, else IndexedDB, else localStorage, else memory — each under
 * `key`, apart from the store.
 */
export const pickSnapshotDriver = (key) => {
  const doubletsWeb = globalThis.DoubletsWeb ?? globalThis.doubletsWeb ?? null;
  if (doubletsWeb) {
    try {
      return createDoubletsWebDriver({
        doubletsWeb,
        snapshotDriver: createBestSnapshotDriver(`${key}:doublets-web`),
      });
    } catch {
      // fall through
    }
  }
  return createBestSnapshotDriver(key);
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

  const queue = createBrowserSnapshotQueue({ initial: data, driver, emit });
  const putMany = (links) => {
    const copies = links.map((link) => {
      if (!link || typeof link.id !== 'string') {
        throw new Error('link.id is required');
      }
      return cloneLink(link);
    });
    return queue.write((next) => {
      copies.forEach((link) => next.set(link.id, link));
      return {
        result: links,
        events: copies.map((link) => ({ type: 'put', link: cloneLink(link) })),
      };
    });
  };

  return {
    async put(link) {
      await putMany([link]);
      return link;
    },
    async putMany(links) {
      return putMany(links);
    },
    async get(id, project = cloneLink) {
      const v = queue.read().get(id);
      return v ? project(v) : null;
    },
    /** How many links are held (R-Z17). */
    size: () => queue.read().size,
    /** The matching links in batches of copies (the migration runner, R-Z17). */
    async scan(filter, batchSize, onBatch, project = cloneLink) {
      let batch = [];
      let looked = 0;
      for (const link of [...queue.read().values()]) {
        looked += 1;
        if (!filter || filter(link)) {
          batch.push(project(link));
          if (batch.length >= batchSize) {
            const full = batch;
            batch = [];
            await onBatch(full);
          }
        }
      }
      if (batch.length > 0) {
        await onBatch(batch);
      }
      return looked;
    },
    async delete(id) {
      return queue.write((next) => {
        const link = next.get(id);
        const existed = next.delete(id);
        return {
          result: existed,
          events: existed ? [{ type: 'delete', link: cloneLink(link) }] : [],
        };
      });
    },
    async query(filter) {
      const all = [...queue.read().values()].map(cloneLink);
      return filter ? all.filter(filter) : all;
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    /** Wait for preceding writes and persist a snapshot through the same queue. */
    async flush() {
      await queue.write(() => ({ events: [], result: undefined }));
    },
  };
};
