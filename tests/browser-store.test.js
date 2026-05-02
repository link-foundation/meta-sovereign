/**
 * Browser-side store tests. We exercise the contract directly with
 * the in-memory driver and the localStorage driver (with a hand-
 * rolled tiny shim) to keep the test suite zero-dep and runnable
 * under plain Node.
 *
 * The IndexedDB driver is exercised via a minimal in-memory IDB
 * shim that implements the subset we touch — enough to prove the
 * adapter wires the request/transaction lifecycle correctly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBrowserStore,
  createInMemoryDriver,
  createLocalStorageDriver,
  createIndexedDbDriver,
} from '../src/storage/browser-store.js';

const settle = () => new Promise((r) => setTimeout(r, 5));

test('browser store: put / get / delete / query / subscribe', async () => {
  const store = await createBrowserStore();
  const seen = [];
  store.subscribe((e) => seen.push(e));

  await store.put({ id: 'l:a', tokens: ['hello'] });
  await store.put({ id: 'l:b', tokens: ['world'] });

  assert.equal((await store.get('l:a')).tokens[0], 'hello');
  assert.equal((await store.query()).length, 2);

  const filtered = await store.query((l) => l.id === 'l:b');
  assert.equal(filtered.length, 1);

  await store.delete('l:a');
  assert.equal(await store.get('l:a'), null);
  assert.deepEqual(
    seen.map((e) => e.type),
    ['put', 'put', 'delete']
  );
});

test('browser store: in-memory driver round-trips via reload', async () => {
  const driver = createInMemoryDriver();
  const a = await createBrowserStore({ driver });
  await a.put({ id: 'l:keep-me', tokens: ['x'] });
  await a.flush();

  const b = await createBrowserStore({ driver });
  assert.equal((await b.get('l:keep-me'))?.tokens[0], 'x');
});

test('browser store: localStorage driver persists snapshots', async () => {
  const fakeStorage = (() => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
  })();
  const driver = createLocalStorageDriver(fakeStorage, 'test:snapshot');

  const a = await createBrowserStore({ driver });
  await a.put({ id: 'l:p', tokens: ['persist'] });
  await a.flush();

  // Verify the raw shape so future debugging is easier.
  const raw = JSON.parse(fakeStorage.getItem('test:snapshot'));
  assert.equal(raw.links[0].id, 'l:p');

  const b = await createBrowserStore({ driver });
  assert.equal((await b.get('l:p'))?.tokens[0], 'persist');
});

test('browser store: indexedDB driver works against a minimal IDB shim', async () => {
  const databases = new Map();
  const makeObjectStore = () => {
    const map = new Map();
    return {
      get(key) {
        const r = {};
        setTimeout(() => {
          r.result = map.get(key);
          r.onsuccess?.();
        });
        return r;
      },
      put(value, key) {
        const r = {};
        setTimeout(() => {
          map.set(key, value);
          r.onsuccess?.();
        });
        return r;
      },
    };
  };
  const makeDb = () => {
    const stores = new Map();
    return {
      _stores: stores,
      objectStoreNames: { contains: (n) => stores.has(n) },
      createObjectStore(n) {
        stores.set(n, makeObjectStore());
        return stores.get(n);
      },
      transaction(n) {
        const tx = {
          oncomplete: null,
          onabort: null,
          onerror: null,
          objectStore: () => stores.get(n),
        };
        // Fire oncomplete after a couple of ticks so the caller has
        // time to assign it AFTER awaiting any puts on the store.
        setTimeout(() => tx.oncomplete?.(), 4);
        return tx;
      },
    };
  };

  const idbShim = {
    open(name) {
      const req = {};
      setTimeout(() => {
        let db = databases.get(name);
        const fresh = !db;
        if (fresh) {
          db = makeDb();
          databases.set(name, db);
        }
        req.result = db;
        if (fresh) {
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      });
      return req;
    },
  };

  const driver = createIndexedDbDriver({ factory: idbShim });
  const a = await createBrowserStore({ driver });
  await a.put({ id: 'l:idb', tokens: ['stored'] });
  await a.flush();
  await settle();

  const driver2 = createIndexedDbDriver({ factory: idbShim });
  const b = await createBrowserStore({ driver: driver2 });
  assert.equal((await b.get('l:idb'))?.tokens[0], 'stored');
});
