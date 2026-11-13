import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createDoubletsStore } from '../src/storage/doublets-store.js';
import { createDualStore, openDualStore } from '../src/storage/dual-store.js';
import {
  withMessageVersions,
  messageVersions,
} from '../src/storage/message-versions.js';
import { wrapSecretStore } from '../src/storage/secret-store.js';
import { replicatedMutation } from '../src/storage/mutation.js';
import { createPeer } from '../src/sync/peer.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { syncWire } from '../src/sync/wire.js';

const message = (body, count = 1) => ({
  id: 'msg:sync-fixture',
  body,
  vc: { owner: count },
});
const incoming = (link) => ({ type: 'put', link });

test(
  'queued message history keeps owner edits observable and suppresses only replicated derived writes',
  { timeout: 3000 },
  async () => {
    const inner = createMemoryStore();
    let entered;
    let release;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let pause = true;
    const store = withMessageVersions(inner, {
      preserve: async () => {
        if (pause) {
          pause = false;
          entered();
          await gate;
        }
      },
    });
    await store.put(message('first'));
    const peer = createPeer(store);
    const observed = [];
    peer.onLocal((event) => observed.push(event.link.id));
    const local = store.put(message('owner edit', 2));
    let remote;
    try {
      await started;
      remote = peer.receive(incoming(message('stale remote', 1)));
      await store.put({ id: 'note', body: 'owner note' });
    } finally {
      release();
      await local;
      await remote;
    }
    assert.equal((await store.get(message('').id)).body, 'owner edit');
    assert(observed.includes('note'));
    assert(observed.includes(message('').id));
    assert.equal(
      (await messageVersions(store, message('').id)).versions.length,
      2
    );
    observed.length = 0;
    await peer.receive(incoming(message('remote edit', 3)));
    assert.deepEqual(observed, []);
    assert.equal(
      (await messageVersions(store, message('').id)).versions.length,
      3
    );
    await peer.receive({ type: 'delete', link: message('remote edit', 3) });
    assert.deepEqual(observed, []);
    assert.equal(
      (await inner.query()).filter((link) =>
        link.id.startsWith('message-version:')
      ).length,
      0
    );
  }
);

test(
  'browser mutation provenance is transient and ordinary writes stay local events',
  { timeout: 2000 },
  async () => {
    const driver = createInMemoryDriver();
    const store = await createBrowserStore({ driver });
    const peer = createPeer(store);
    const local = [];
    const raw = [];
    store.subscribe((event) => raw.push(event));
    peer.onLocal((event) => local.push(event));
    await Promise.all([
      peer.receive(incoming({ id: 'remote', body: 'old', vc: { r: 1 } })),
      peer.receive(incoming({ id: 'remote', body: 'new', vc: { r: 2 } })),
    ]);
    await store.put({ id: 'owner', body: 'local' });
    assert.deepEqual(
      local.map((event) => event.link.id),
      ['owner']
    );
    assert.equal(raw[0][replicatedMutation], true);
    for (const format of [LINO_TEXT, LINO_BINARY]) {
      const wire = syncWire({ format });
      const roundTrip = wire.decode(wire.encode(raw[0]));
      assert.deepEqual(Object.keys(roundTrip).sort(), ['link', 'type']);
      assert.deepEqual(Object.getOwnPropertySymbols(roundTrip), []);
    }
    await store.flush();
    const snapshot = await driver.load();
    assert(
      snapshot.links.every(
        (link) => Object.getOwnPropertySymbols(link).length === 0
      )
    );
    assert.equal(
      (await (await createBrowserStore({ driver })).get('remote')).body,
      'new'
    );
  }
);

const durableFactories = {
  text: (dir) => createLinoTextStore(path.join(dir, 'data.lino')),
  binary: (dir) => createDoubletsStore(path.join(dir, 'data.bin')),
  dual: async (dir) =>
    createDualStore({
      binary: await createDoubletsStore(path.join(dir, 'data.bin')),
      text: await createLinoTextStore(path.join(dir, 'data.lino')),
    }),
  managed: (dir) => openDualStore(dir),
};
for (const [name, open] of Object.entries(durableFactories)) {
  test(
    `${name} atomic receives persist without echoing or serializing mutation provenance`,
    { timeout: 10000 },
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-sync-receive-'));
      let store;
      try {
        store = await open(dir);
        const peer = createPeer(store);
        const observed = [];
        peer.onLocal((event) => observed.push(event.link.id));
        await Promise.all([
          peer.receive(incoming({ id: 'record', body: 'old', vc: { r: 1 } })),
          peer.receive(incoming({ id: 'record', body: 'new', vc: { r: 2 } })),
        ]);
        await peer.receive(incoming({ id: 'removed', body: 'temporary' }));
        await peer.receive({ type: 'delete', link: { id: 'removed' } });
        await store.put({ id: 'owner', body: 'typed' });
        assert.deepEqual(observed, ['owner']);
        await store.flush();
        if (name !== 'binary') {
          assert(
            !(await readFile(path.join(dir, 'data.lino'), 'utf8')).includes(
              'replicated-mutation'
            )
          );
        }
        if (store.close) {
          await store.close();
        }
        store = await open(dir);
        assert.equal((await store.get('record')).body, 'new');
        assert.equal(await store.get('removed'), null);
        assert.equal((await store.get('owner')).body, 'typed');
        assert.deepEqual(
          Object.getOwnPropertySymbols(await store.get('record')),
          []
        );
      } finally {
        await store?.flush();
        await store?.close?.();
        await rm(dir, { recursive: true, force: true });
      }
    }
  );
}

test(
  'encrypted wrappers preserve atomic non-secret receives and keep secrets excluded',
  { timeout: 3000 },
  async () => {
    const inner = createMemoryStore();
    const store = wrapSecretStore({ inner, passphrase: 'fixture-only' });
    const peer = createPeer(store);
    const events = [];
    peer.onLocal((event) => events.push(event));
    await peer.receive(incoming({ id: 'public', body: 'received' }));
    await peer.receive(
      incoming({ id: 'secret:remote', value: 'must not be saved' })
    );
    await peer.receive(incoming({ id: 'meta:schema', value: 999 }));
    await store.put({ id: 'secret:owner', value: 'kept local' });
    assert.deepEqual(events, []);
    assert.equal(await inner.get('secret:remote'), null);
    assert.equal(await inner.get('meta:schema'), null);
    assert.equal((await store.get('public')).body, 'received');
    assert((await inner.get('secret:owner')).enc);
    const updated = await store.update('secret:owner', (before) => ({
      ...before,
      value: 'updated locally',
    }));
    assert.equal(updated.value, 'updated locally');
    assert.equal((await store.get('secret:owner')).value, updated.value);
    assert.equal((await inner.get('secret:owner')).value, undefined);
  }
);

test(
  'atomic updates validate identity and cannot bypass a read-only durable store',
  { timeout: 3000 },
  async () => {
    const memory = createMemoryStore();
    await assert.rejects(
      memory.update('x', () => ({ id: 'wrong' })),
      /same id/
    );
    await assert.rejects(
      memory.update('x', async () => ({ id: 'x' })),
      /synchronous/
    );
    assert.equal(await memory.get('x'), null);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-sync-readonly-'));
    let reader;
    try {
      const writer = await openDualStore(dir);
      await writer.put({ id: 'x', body: 'original' });
      await writer.close();
      reader = await openDualStore(dir, { readOnly: true });
      await assert.rejects(
        createPeer(reader).receive(incoming({ id: 'x', body: 'changed' })),
        { code: 'STORE_READ_ONLY' }
      );
      assert.equal((await reader.get('x')).body, 'original');
    } finally {
      await reader?.close?.();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'dual writes triggered by subscribers keep the binary and text copies in the same order',
  { timeout: 3000 },
  async () => {
    const binary = createMemoryStore();
    const text = createMemoryStore();
    const store = createDualStore({ binary, text });
    let owner;
    let once = true;
    store.subscribe((event) => {
      if (once && event.link.id === 'record') {
        once = false;
        owner = store.put({
          id: 'record',
          body: 'owner edit',
          vc: { owner: 2 },
        });
      }
    });
    await createPeer(store).receive(
      incoming({ id: 'record', body: 'remote', vc: { owner: 1 } })
    );
    await owner;
    assert.equal((await store.get('record')).body, 'owner edit');
    assert.deepEqual(await store.verify(), []);
  }
);
