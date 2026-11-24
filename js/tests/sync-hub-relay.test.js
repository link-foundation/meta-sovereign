import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createBrowserStore } from '../src/storage/browser-store.js';
import { createPeer } from '../src/sync/peer.js';

// Finite network fixture: snapshot actual wire values, drain all receive work,
// and fail after 100 sends rather than letting a relay loop exhaust the host.
const network = () => {
  const pending = [];
  const disconnect = [];
  let sent = 0;
  return {
    connect(a, b) {
      const handlers = [new Set(), new Set()];
      for (const [index, peer] of [a, b].entries()) {
        disconnect.push(
          peer.connect({
            send(event) {
              assert(
                ++sent < 100,
                'relay loop exceeded the finite send budget'
              );
              const value = JSON.parse(JSON.stringify(event));
              for (const handler of handlers[1 - index]) {
                pending.push(() => handler(value));
              }
            },
            onMessage(handler) {
              handlers[index].add(handler);
              return () => handlers[index].delete(handler);
            },
          })
        );
      }
    },
    async settle() {
      while (pending.length) {
        await pending.shift()();
      }
    },
    close() {
      disconnect.forEach((off) => off());
    },
    count: () => sent,
  };
};
const makePeer = (options) => {
  const store = createMemoryStore();
  return { store, peer: createPeer(store, options) };
};

for (const schemaVersion of [undefined, 7]) {
  test(
    `hub fan-out reaches another client with schema ${schemaVersion}`,
    { timeout: 2000 },
    async () => {
      const hub = makePeer({ hub: true, schemaVersion });
      const left = makePeer({ schemaVersion });
      const right = makePeer({ schemaVersion });
      const net = network();
      net.connect(hub.peer, left.peer);
      net.connect(hub.peer, right.peer);
      try {
        await left.store.put({ id: 'shared', body: 'left', version: '1' });
        await net.settle();
        assert.equal((await right.store.get('shared'))?.body, 'left');
        await right.store.delete('shared');
        await net.settle();
        assert.equal(await left.store.get('shared'), null);
        assert.equal(await hub.store.get('shared'), null);
      } finally {
        net.close();
      }
    }
  );
}

test(
  'a cycle of hubs reaches a leaf once without echoing the origin',
  { timeout: 2000 },
  async () => {
    // Deliberately identical public node labels: routing needs instance identity.
    const hubs = Array.from({ length: 3 }, () => makePeer({ hub: true }));
    const leaf = makePeer();
    const writes = hubs.map(() => 0);
    hubs.forEach(({ store }, index) => store.subscribe(() => writes[index]++));
    const net = network();
    net.connect(hubs[0].peer, hubs[1].peer);
    net.connect(hubs[1].peer, hubs[2].peer);
    net.connect(hubs[2].peer, hubs[0].peer);
    net.connect(hubs[1].peer, leaf.peer);
    try {
      await hubs[0].store.put({ id: 'cycle', version: '1' });
      await net.settle();
      assert.equal((await leaf.store.get('cycle'))?.id, 'cycle');
      assert.deepEqual(writes, [1, 1, 1]);
      assert(net.count() < 20);
    } finally {
      net.close();
    }
  }
);

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const capture = (peer) => {
  const sent = [];
  let remote;
  const off = peer.connect({
    send(event) {
      sent.push(event);
    },
    onMessage(handler) {
      remote = handler;
      return () => {};
    },
  });
  return { sent, remote: (event) => remote(event), off };
};
const operation = (id, type = 'put', record = 'record') => ({
  type,
  link: { id: record, version: '1', body: 'private fixture' },
  relay: { id, via: ['remote-instance'] },
});

for (const [backend, makeStore] of [
  ['memory', createMemoryStore],
  ['browser', createBrowserStore],
]) {
  for (const kind of ['put', 'absent delete']) {
    test(
      `${backend}: a pending remote ${kind} precedes a later owner mutation`,
      { timeout: 2000 },
      async () => {
        const inner = await makeStore();
        const entered = deferred();
        const release = deferred();
        const method = kind === 'put' ? 'update' : 'delete';
        const peer = createPeer(
          {
            ...inner,
            async [method](...args) {
              const value = await inner[method](...args);
              entered.resolve();
              await release.promise;
              return value;
            },
          },
          { hub: true }
        );
        const { sent, off } = capture(peer);
        const receiving = peer.receive(
          operation('pending', kind === 'put' ? 'put' : 'delete')
        );
        try {
          await entered.promise;
          if (kind === 'put') {
            await inner.delete('record');
          } else {
            await inner.put({
              id: 'record',
              version: '2',
              body: 'new owner value',
            });
          }
          assert.equal(
            sent.length,
            0,
            'later writes wait for the earlier receive result'
          );
        } finally {
          release.resolve();
          await receiving;
          off();
        }
        assert.deepEqual(
          sent.map((event) => event.type),
          kind === 'put' ? ['put', 'delete'] : ['delete', 'put']
        );
        const target = makePeer();
        for (const event of sent) {
          await target.peer.receive(event);
        }
        assert.equal(
          (await target.store.get('record'))?.body ?? null,
          kind === 'put' ? null : 'new owner value'
        );
      }
    );
  }
}

test(
  'a failed remote write is not forwarded, releases later owner writes and can be retried',
  { timeout: 2000 },
  async () => {
    const inner = createMemoryStore();
    const entered = deferred();
    const release = deferred();
    let fail = true;
    const peer = createPeer(
      {
        ...inner,
        async update(...args) {
          const value = await inner.update(...args);
          if (fail) {
            fail = false;
            entered.resolve();
            await release.promise;
            throw new Error('fixture persistence failed');
          }
          return value;
        },
      },
      { hub: true }
    );
    const { sent, off } = capture(peer);
    const event = operation('retryable');
    const first = peer.receive(event);
    // Observe the expected rejection before releasing the paused write.
    const rejected = assert.rejects(first, /fixture persistence failed/);
    try {
      await entered.promise;
      await inner.put({ id: 'owner', version: '1' });
    } finally {
      release.resolve();
      await rejected;
    }
    assert.deepEqual(
      sent.map((value) => value.link.id),
      ['owner']
    );
    await peer.receive(event);
    assert.deepEqual(
      sent.map((value) => value.link.id),
      ['owner', 'record']
    );
    off();
  }
);

test(
  'in-flight and completed copies apply once; routing stays outside links and onLocal',
  { timeout: 2000 },
  async () => {
    const inner = createMemoryStore();
    const entered = deferred();
    const release = deferred();
    let writes = 0;
    const peer = createPeer(
      {
        ...inner,
        async update(...args) {
          writes++;
          const value = await inner.update(...args);
          entered.resolve();
          await release.promise;
          return value;
        },
      },
      { hub: true }
    );
    const { sent, off } = capture(peer);
    const locals = [];
    peer.onLocal((event) => locals.push(event));
    const event = operation('one-copy');
    const first = peer.receive(event);
    try {
      await entered.promise;
      await peer.receive(event);
    } finally {
      release.resolve();
      await first;
    }
    await peer.receive(event);
    assert.equal(writes, 1);
    assert.equal(sent.length, 1);
    assert.deepEqual(locals, []);
    const record = await inner.get('record');
    assert.equal(record.relay, undefined);
    assert.equal(Object.getOwnPropertySymbols(record).length, 0);
    await inner.put({ id: 'owner' });
    assert.equal(locals.length, 1);
    assert.equal(locals[0].relay, undefined);
    off();
  }
);

test(
  'schema and private-record guards precede relay; disconnect removes forwarding',
  { timeout: 2000 },
  async () => {
    const { store, peer } = makePeer({ hub: true, schemaVersion: 7 });
    const mismatches = [];
    const checked = createPeer(store, {
      hub: true,
      schemaVersion: 7,
      onMismatch: (error) => mismatches.push(error.code),
    });
    const { remote, sent, off } = capture(checked);
    await remote({ ...operation('mismatch'), schema: 8 });
    for (const id of ['secret:fixture', 'meta:schema']) {
      await remote({
        ...operation(`remote-${id.replace(':', '-')}`, 'put', id),
        schema: 7,
      });
      await store.put({ id });
    }
    assert.equal(await store.get('record'), null);
    assert.deepEqual(mismatches, ['SCHEMA_MISMATCH']);
    assert.equal(
      sent.length,
      1,
      'only the schema hello leaves this connection'
    );
    await remote({ ...operation('valid'), schema: 7 });
    assert.equal(sent.length, 2);
    assert.equal(sent[1].schema, 7);
    off();
    await checked.receive(operation('after-off', 'put', 'later'));
    await store.put({ id: 'owner' });
    assert.equal(sent.length, 2);
    // A second peer sharing the store does not claim another receiver's event.
    assert.equal((await store.get('later')).id, 'later');
    assert.equal(peer.node, 'local');
  }
);

test(
  'legacy events relay through a hub while ordinary peers keep incoming work local',
  { timeout: 2000 },
  async () => {
    for (const hub of [false, true]) {
      const { peer } = makePeer({ hub });
      const { sent, off } = capture(peer);
      await peer.receive({ type: 'put', link: { id: 'legacy' } });
      await peer.receive({ type: 'delete', link: { id: 'absent' } });
      assert.equal(sent.length, hub ? 2 : 0);
      off();
    }
  }
);
