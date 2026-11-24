import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStorageDriver } from '../src/storage/browser-store.js';
import { openCausalBrowserStore } from '../src/storage/open-browser-store.js';
import { snapshotStorage } from './helpers/snapshot-locks.mjs';

// One externally held native-style lock. Queue admission is an explicit
// handshake; no workload, timer race or repeated browser launches are needed.
const heldLock = () => {
  const queued = Promise.withResolvers();
  const released = Promise.withResolvers();
  let held = true;
  let attempts = 0;
  return {
    queued: queued.promise,
    attempts: () => attempts,
    release() {
      held = false;
      released.resolve();
    },
    locks: {
      async request(name, options, run) {
        attempts += 1;
        if (held && options.ifAvailable) {
          return run(null);
        }
        if (held) {
          queued.resolve();
          await released.promise;
        }
        return run({ name });
      },
    },
  };
};

test(
  'a competing browser boot queues for an in-flight root save instead of exhausting migration retries',
  { timeout: 3000 },
  async () => {
    const lock = heldLock();
    const storage = snapshotStorage();
    const driver = createLocalStorageDriver(storage, 'boot', {
      locks: lock.locks,
    });
    const events = [];
    const opening = openCausalBrowserStore({
      driver,
      onEvent: (event) => events.push(event),
    });
    const finished = opening.then(
      () => 'opened',
      () => 'refused'
    );
    let outcome;
    let store;
    try {
      outcome = await Promise.race([
        lock.queued.then(() => 'queued'),
        finished,
      ]);
    } finally {
      lock.release();
      store = await opening.catch(() => null);
      await store?.close();
    }
    assert.equal(
      outcome,
      'queued',
      'initialization must wait for lock release'
    );
    assert.ok(store);
    assert.equal(lock.attempts(), 2, 'schema put and its durable flush');
    assert.deepEqual(events, [], 'no bootstrap retry is needed for contention');
    assert.ok(JSON.parse(storage.getItem('boot')).links[0].version > 0);
  }
);

test(
  'a queued snapshot still compares the committed root before replacing it',
  { timeout: 3000 },
  async () => {
    const lock = heldLock();
    const storage = snapshotStorage();
    const driver = createLocalStorageDriver(storage, 'boot', {
      locks: lock.locks,
    });
    await driver.load();
    const writing = driver.save({ links: [{ id: 'unsaved-owner' }] });
    const finished = writing.then(
      () => 'saved',
      () => 'refused'
    );
    let outcome;
    try {
      outcome = await Promise.race([
        lock.queued.then(() => 'queued'),
        finished,
      ]);
      storage.setItem('boot', JSON.stringify({ links: [{ id: 'other-tab' }] }));
    } finally {
      lock.release();
      await assert.rejects(writing, { code: 'STORE_SNAPSHOT_CHANGED' });
    }
    assert.equal(outcome, 'queued');
    assert.deepEqual(JSON.parse(storage.getItem('boot')).links, [
      { id: 'other-tab' },
    ]);
  }
);

test(
  'a suspended lock holder has a bounded wait and cannot cause an unlocked write',
  { timeout: 4000 },
  async () => {
    const storage = snapshotStorage();
    let cancelled = false;
    const driver = createLocalStorageDriver(storage, 'boot', {
      locks: {
        request(_name, { signal }) {
          assert.ok(
            signal,
            'the queued request must have a cancellation bound'
          );
          return new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                cancelled = true;
                reject(
                  new globalThis.DOMException(
                    'Lock wait cancelled',
                    'AbortError'
                  )
                );
              },
              { once: true }
            );
          });
        },
      },
    });
    await assert.rejects(driver.save({ links: [{ id: 'unsaved' }] }), {
      code: 'STORE_SNAPSHOT_BUSY',
    });
    assert.equal(cancelled, true);
    assert.equal(storage.getItem('boot'), null);
  }
);
