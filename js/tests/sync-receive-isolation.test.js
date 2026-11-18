import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createBrowserStore } from '../src/storage/browser-store.js';
import { createPeer } from '../src/sync/peer.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const pauseFirstRead = (inner) => {
  const entered = deferred();
  const release = deferred();
  let first = true;
  const pause = async () => {
    if (first) {
      first = false;
      entered.resolve();
      await release.promise;
    }
  };
  return {
    entered: entered.promise,
    release: release.resolve,
    store: {
      ...inner,
      async get(id) {
        const before = await inner.get(id);
        await pause();
        return before;
      },
      async update(id, change, options) {
        await pause();
        return inner.update(id, change, options);
      },
    },
  };
};
const put = (id, body, vc) => ({ type: 'put', link: { id, body, vc } });

for (const [backend, makeStore] of [
  ['memory', createMemoryStore],
  ['browser', createBrowserStore],
]) {
  test(
    `${backend}: a local edit remains observable while an unrelated remote read is paused`,
    { timeout: 2000 },
    async () => {
      const inner = await makeStore();
      const paused = pauseFirstRead(inner);
      const peer = createPeer(paused.store);
      const observed = [];
      peer.onLocal((event) => observed.push(event));
      const receiving = peer.receive(put('remote', 'received', { remote: 1 }));
      try {
        await paused.entered;
        await inner.put({ id: 'owner', body: 'typed during sync' });
      } finally {
        paused.release();
        await receiving;
      }
      assert.deepEqual(
        observed.map((event) => event.link.id),
        ['owner']
      );
      assert.equal((await inner.get('remote')).body, 'received');
    }
  );

  test(
    `${backend}: overlapping receives cannot overwrite a newer vector with an older snapshot`,
    { timeout: 2000 },
    async () => {
      const inner = await makeStore();
      const paused = pauseFirstRead(inner);
      const peer = createPeer(paused.store);
      const first = peer.receive(put('record', 'older', { remote: 1 }));
      await paused.entered;
      const second = peer.receive(put('record', 'newer', { remote: 2 }));
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      paused.release();
      await Promise.all([first, second]);
      assert.equal((await inner.get('record')).body, 'newer');
    }
  );

  test(
    `${backend}: a same-record local edit admitted during a remote read participates in the merge`,
    { timeout: 2000 },
    async () => {
      const inner = await makeStore();
      const paused = pauseFirstRead(inner);
      const peer = createPeer(paused.store);
      const receiving = peer.receive(put('record', 'older', { owner: 1 }));
      try {
        await paused.entered;
        await inner.put({ id: 'record', body: 'owner edit', vc: { owner: 2 } });
      } finally {
        paused.release();
        await receiving;
      }
      assert.equal((await inner.get('record')).body, 'owner edit');
    }
  );
}

test(
  'failed remote work rejects once and does not silence or block later edits',
  { timeout: 2000 },
  async () => {
    const inner = createMemoryStore();
    let fail = true;
    const states = [];
    const peer = createPeer(
      {
        ...inner,
        async update(...args) {
          if (fail) {
            fail = false;
            throw new Error('fixture write refused');
          }
          return inner.update(...args);
        },
      },
      { onState: (state) => states.push(state) }
    );
    const observed = [];
    peer.onLocal((event) => observed.push(event.link.id));
    const first = peer.receive(put('rejected', 'private body', { remote: 1 }));
    const next = peer.receive(put('accepted', 'private body', { remote: 2 }));
    await assert.rejects(first, /write refused/);
    await next;
    await inner.put({ id: 'owner', body: 'still observable' });
    assert.deepEqual(observed, ['owner']);
    assert.equal(await inner.get('rejected'), null);
    assert.equal((await inner.get('accepted')).body, 'private body');
    assert(states.some((state) => state.phase === 'failed'));
    assert(!JSON.stringify(states).includes('private body'));
  }
);

test(
  'original third-party store interfaces retain ordered receives and echo suppression',
  { timeout: 2000 },
  async () => {
    const inner = createMemoryStore();
    const peer = createPeer({
      get: inner.get,
      put: inner.put,
      delete: inner.delete,
      subscribe: inner.subscribe,
    });
    const observed = [];
    peer.onLocal((event) => observed.push(event));
    await Promise.all([
      peer.receive(put('legacy', 'old', { remote: 1 })),
      peer.receive(put('legacy', 'new', { remote: 2 })),
    ]);
    assert.equal((await inner.get('legacy')).body, 'new');
    assert.deepEqual(observed, []);
    await inner.put({ id: 'after', body: 'local' });
    assert.equal(observed.length, 1);
  }
);

test(
  'one failed transport reports its error without rejecting local persistence or stopping another peer',
  { timeout: 2000 },
  async () => {
    const store = createMemoryStore();
    const errors = [];
    const sent = [];
    const peer = createPeer(store, {
      onError: (error) => errors.push(error.message),
    });
    peer.connect({
      send() {
        throw new Error('fixture channel closed');
      },
      onMessage() {
        return () => {};
      },
    });
    peer.connect({
      send(event) {
        sent.push(event);
      },
      onMessage() {
        return () => {};
      },
    });
    await store.put({ id: 'owner', body: 'durable locally' });
    assert.equal((await store.get('owner')).body, 'durable locally');
    assert.deepEqual(errors, ['fixture channel closed']);
    assert.equal(sent[0].link.id, 'owner');
  }
);

test(
  'transport receive errors are reported and drained while direct receive still rejects',
  { timeout: 2000 },
  async () => {
    const inner = createMemoryStore();
    let fail = true;
    let remote;
    const errors = [];
    const peer = createPeer(
      {
        ...inner,
        async update(...args) {
          if (fail) {
            fail = false;
            throw new Error('fixture rejected incoming write');
          }
          return inner.update(...args);
        },
      },
      { onError: (error) => errors.push(error.message) }
    );
    peer.connect({
      send() {},
      onMessage(handler) {
        remote = handler;
        return () => {};
      },
    });
    await remote(put('x', 'rejected', { r: 1 }));
    assert.deepEqual(errors, ['fixture rejected incoming write']);
    await remote(put('x', 'accepted', { r: 2 }));
    assert.equal((await inner.get('x')).body, 'accepted');
    const observed = [];
    const brokenReporter = createPeer(inner, {
      onError() {
        throw new Error('reporter unavailable');
      },
    });
    brokenReporter.connect({
      send() {
        throw new Error('closed');
      },
      onMessage() {
        return () => {};
      },
    });
    brokenReporter.onLocal((event) => observed.push(event.link.id));
    await inner.put({ id: 'owner' });
    assert.deepEqual(observed, ['owner']);
  }
);
