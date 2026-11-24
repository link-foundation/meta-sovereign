import {
  changedLink,
  changedBatch,
  atomicBatch,
  mutationEvent,
  admitMutation,
} from './mutation.js';
import { getLocalStorage } from './local-storage.js';
import {
  coordinateSnapshots,
  snapshotNotifications,
} from './browser-coordination.js';
import { createSnapshotWriter } from './browser-snapshot-writer.js';
import {
  versionedSnapshotDriver,
  saveIndexedSnapshot,
  saveLocalSnapshot,
} from './browser-snapshot.js';

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
 * Promise<void|version>`; ship-in drivers cover IndexedDB, localStorage, and
 * an in-memory driver used by tests. Browser code picks the best
 * driver at boot via `pickBrowserDriver()`.
 *
 * Snapshot shape: `{ links: Link[] }`. Memory and subscription events
 * update immediately. Mutation promises wait for a coalesced, ordered
 * driver save and reject on failure; flush explicitly retries the current
 * memory state. At most one save and one pending batch exist. Built-in durable
 * drivers compare the opening's revision atomically before replacement and
 * reject stale primitive stores without overwriting committed data. The production
 * migrated opening enables causal per-record merging and root notifications. localStorage writes
 * require Web Locks; a busy or unsupported lock rejects explicitly. Additional drivers
 * can provide file-system storage (Electron) with the same contract.
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
  key = SNAPSHOT_KEY,
  { locks = globalThis.navigator?.locks, notifications } = {}
) =>
  versionedSnapshotDriver({
    notifications:
      notifications ??
      snapshotNotifications(JSON.stringify(['local', key]), { key }),
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
    async save(snapshot, expected) {
      await saveLocalSnapshot(storage, key, locks, snapshot, expected);
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
  notifications,
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
  return versionedSnapshotDriver({
    notifications:
      notifications ??
      snapshotNotifications(
        JSON.stringify(['indexedDB', dbName, storeName, key])
      ),
    async load() {
      const db = await open();
      const tx = db.transaction(storeName, 'readonly');
      const obj = tx.objectStore(storeName);
      const value = await idbReq(obj.get(key));
      return value ?? null;
    },
    async save(snapshot, expected) {
      const db = await open();
      await saveIndexedSnapshot(db, storeName, key, snapshot, expected);
    },
  });
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
    revisioned: snapshotDriver.revisioned,
    watch: snapshotDriver.watch,
    async load() {
      const loaded = await snapshotDriver.load();
      rebuild(loaded);
      return loaded ? { ...loaded, links: current.links.map(cloneLink) } : null;
    },
    async save(snapshot, options) {
      rebuild(snapshot);
      return snapshotDriver.save(
        {
          links: current.links.map(cloneLink),
          doubletsWeb: this.stats(),
        },
        options
      );
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

  const writer = createSnapshotWriter({
    driver,
    snapshot,
    data,
    cloneLink,
    emit,
  });
  const queueSave = writer.save;
  const capture = (link) => {
    if (!link || typeof link.id !== 'string') {
      throw new Error('link.id is required');
    }
    return cloneLink(link);
  };

  return {
    [coordinateSnapshots]: writer.coordinate,
    async put(link, options) {
      const record = capture(link);
      data.set(record.id, record);
      const saved = queueSave();
      admitMutation('put', record.id, options);
      emit(mutationEvent('put', cloneLink(record), options));
      await saved;
      return link;
    },
    async putMany(links, options) {
      const records = links.map(capture);
      if (!records.length) {
        return links;
      }
      for (const record of records) {
        data.set(record.id, record);
      }
      const saved = queueSave();
      for (const record of records) {
        admitMutation('put', record.id, options);
        emit(mutationEvent('put', cloneLink(record), options));
      }
      await saved;
      return links;
    },
    async [atomicBatch](links, change, options) {
      return this.putMany(
        changedBatch(links, change, (id) => data.get(id), cloneLink),
        options
      );
    },
    async update(id, change, options) {
      const before = data.get(id);
      return this.put(
        changedLink(id, change, before ? cloneLink(before) : null),
        options
      );
    },
    async get(id, project = cloneLink) {
      const v = data.get(id);
      return v ? project(v) : null;
    },
    /** How many links are held (R-Z17). */
    size: () => data.size,
    /** The matching links in batches of copies (the migration runner, R-Z17). */
    async scan(filter, batchSize, onBatch, project = cloneLink) {
      let batch = [];
      let looked = 0;
      for (const link of [...data.values()]) {
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
    async delete(id, options) {
      const existed = data.has(id);
      const link = data.get(id);
      admitMutation('delete', id, options);
      data.delete(id);
      if (existed) {
        const saved = queueSave();
        emit(mutationEvent('delete', cloneLink(link), options));
        await saved;
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
    /** Persist current memory after prior saves, including failed writes. */
    async flush() {
      await queueSave();
    },
    refresh: writer.refresh,
    close: writer.close,
  };
};
