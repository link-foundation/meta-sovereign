import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  createBrowserStore,
  createIndexedDbDriver,
} from '../src/storage/browser-store.js';

const heldDriver = () => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let saved = null;
  let calls = 0;
  let active = 0;
  let maximum = 0;
  return {
    entered: entered.promise,
    release: release.resolve,
    stats: () => ({ calls, active, maximum }),
    driver: {
      load: async () => saved,
      async save(snapshot) {
        calls += 1;
        active += 1;
        maximum = Math.max(maximum, active);
        try {
          if (calls === 1) {
            entered.resolve();
            await release.promise;
          }
          saved = globalThis.structuredClone(snapshot);
        } finally {
          active -= 1;
        }
      },
    },
  };
};

test(
  'browser puts wait for snapshot durability while memory and events update immediately',
  { timeout: 2000 },
  async () => {
    const fixture = heldDriver();
    const store = await createBrowserStore({ driver: fixture.driver });
    const events = [];
    store.subscribe((event) => events.push(event));
    let settled = false;
    const writing = store.put({ id: 'record', body: 'owner' }).then(() => {
      settled = true;
    });
    try {
      assert.equal(events.length, 1, 'subscriptions remain synchronous');
      assert.equal((await store.get('record')).body, 'owner');
      await fixture.entered;
      await nextTurn();
      assert.equal(settled, false, 'the driver has not committed');
    } finally {
      fixture.release();
      await writing;
    }
    const reopened = await createBrowserStore({ driver: fixture.driver });
    assert.equal((await reopened.get('record')).body, 'owner');
  }
);

test(
  'browser snapshots serialize slow writes so an older save cannot overwrite flush',
  { timeout: 2000 },
  async () => {
    const fixture = heldDriver();
    const store = await createBrowserStore({ driver: fixture.driver });
    const first = store.put({ id: 'record', body: 'before' });
    await fixture.entered;
    const later = store.put({ id: 'record', body: 'after' });
    let flushed = false;
    const flushing = store.flush().then(() => {
      flushed = true;
    });
    let observed;
    try {
      await nextTurn();
      observed = { calls: fixture.stats().calls, flushed };
      assert.equal((await store.get('record')).body, 'after');
    } finally {
      fixture.release();
      await Promise.all([first, later, flushing]);
    }
    const reopened = await createBrowserStore({ driver: fixture.driver });
    assert.equal((await reopened.get('record')).body, 'after');
    assert.deepEqual(fixture.stats(), { calls: 2, active: 0, maximum: 1 });
    assert.equal(observed.calls, 1, 'one driver save at a time');
    assert.equal(observed.flushed, false, 'flush waits for prior issued saves');
  }
);

test(
  'browser bulk admission precedes subscriber edits and persists the latest owner value',
  { timeout: 2000 },
  async () => {
    const fixture = heldDriver();
    fixture.release();
    const store = await createBrowserStore({ driver: fixture.driver });
    let reading;
    let editing;
    store.subscribe((event) => {
      if (event.link.id === 'first') {
        reading = store.get('second');
        editing = store.put({ id: 'second', body: 'owner' });
      }
    });
    await store.putMany([
      { id: 'first', body: 'batch' },
      { id: 'second', body: 'batch' },
    ]);
    await editing;
    assert.equal((await reading)?.body, 'batch');
    assert.equal((await store.get('second')).body, 'owner');
    const reopened = await createBrowserStore({ driver: fixture.driver });
    assert.equal((await reopened.get('second')).body, 'owner');
    assert.equal(fixture.stats().calls, 1, 'one coalesced snapshot');
  }
);

test(
  'failed browser puts reject and an explicit flush retries the visible memory state',
  { timeout: 2000 },
  async () => {
    const failure = new Error('fixture quota refusal');
    let calls = 0;
    let saved = null;
    const driver = {
      load: async () => saved,
      async save(snapshot) {
        if (++calls === 1) {
          throw failure;
        }
        saved = globalThis.structuredClone(snapshot);
      },
    };
    const store = await createBrowserStore({ driver });
    await assert.rejects(
      store.put({ id: 'record', body: 'unsaved' }),
      (error) => error === failure
    );
    assert.equal((await store.get('record')).body, 'unsaved');
    assert.equal(saved, null, 'a memory write is not a successful disk save');
    await store.flush();
    const reopened = await createBrowserStore({ driver });
    assert.equal((await reopened.get('record')).body, 'unsaved');
    assert.equal(calls, 2);
  }
);

test(
  'a failed browser save does not silence queued deletes or later owner recreation',
  { timeout: 2000 },
  async () => {
    const gate = Promise.withResolvers();
    const entered = Promise.withResolvers();
    const failure = new Error('fixture interrupted snapshot');
    let saved = null;
    let calls = 0;
    const driver = {
      load: async () => saved,
      async save(snapshot) {
        if (++calls === 2) {
          entered.resolve();
          await gate.promise;
          throw failure;
        }
        saved = globalThis.structuredClone(snapshot);
      },
    };
    const store = await createBrowserStore({ driver });
    await store.put({ id: 'record', body: 'before' });
    const deleting = assert.rejects(
      store.delete('record'),
      (error) => error === failure
    );
    try {
      await entered.promise;
      assert.equal(await store.get('record'), null);
      const recreating = store.put({ id: 'record', body: 'new owner value' });
      const flushing = store.flush();
      gate.resolve();
      await Promise.all([deleting, recreating, flushing]);
    } finally {
      gate.resolve();
      await deleting;
    }
    assert.equal(calls, 3);
    const reopened = await createBrowserStore({ driver });
    assert.equal((await reopened.get('record')).body, 'new owner value');
  }
);

test(
  'browser snapshot drivers cannot mutate retained owner records',
  { timeout: 2000 },
  async () => {
    const store = await createBrowserStore({
      driver: {
        load: async () => null,
        async save(snapshot) {
          snapshot.links[0].body = 'driver edit';
          snapshot.links[0].children.push('driver child');
        },
      },
    });
    const value = { id: 'record', body: 'owner', children: ['owner child'] };
    await store.put(value);
    assert.deepEqual(await store.get('record'), value);
  }
);

test(
  'invalid browser bulk input leaves memory, subscriptions and snapshots untouched',
  { timeout: 2000 },
  async () => {
    const fixture = heldDriver();
    fixture.release();
    const store = await createBrowserStore({ driver: fixture.driver });
    const events = [];
    store.subscribe((event) => events.push(event));
    await assert.rejects(
      store.putMany([{ id: 'first' }, { body: 'missing id' }]),
      /link.id is required/
    );
    assert.deepEqual(await store.putMany([]), []);
    assert.equal(await store.get('first'), null);
    assert.deepEqual(events, []);
    assert.equal(fixture.stats().calls, 0);
  }
);

for (const mode of ['request', 'commit', 'synchronous put', 'object store']) {
  test(
    `IndexedDB ${mode} failures reject without unobserved aborts`,
    { timeout: 2000 },
    async () => {
      const failure = new Error('fixture aborted transaction');
      const db = {
        transaction() {
          const tx = {
            error: failure,
            objectStore() {
              if (mode === 'object store') {
                globalThis.queueMicrotask(() => tx.onabort());
                throw failure;
              }
              return {
                put() {
                  if (mode === 'synchronous put') {
                    globalThis.queueMicrotask(() => tx.onabort());
                    throw failure;
                  }
                  const request = { error: failure };
                  globalThis.queueMicrotask(() => {
                    if (mode === 'commit') {
                      request.onsuccess();
                    } else {
                      request.onerror();
                    }
                    tx.onabort();
                  });
                  return request;
                },
              };
            },
          };
          return tx;
        },
      };
      const driver = createIndexedDbDriver({
        factory: {
          open() {
            const request = { result: db };
            globalThis.queueMicrotask(() => request.onsuccess());
            return request;
          },
        },
      });
      await assert.rejects(
        driver.save({ links: [] }),
        (error) => error === failure
      );
      await nextTurn();
    }
  );
}
