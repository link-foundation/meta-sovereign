import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createDoubletsStore } from '../src/storage/doublets-store.js';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import {
  withMessageVersions,
  messageVersions,
} from '../src/storage/message-versions.js';
import { replicatedMutation } from '../src/storage/mutation.js';
import { SYNC_DELETED, isSyncDeleted } from '../src/storage/sync-deletions.js';
import { createPeer, loopback, merge } from '../src/sync/peer.js';

const received = { [replicatedMutation]: true };
const make = (actor) => withCausalWrites(createMemoryStore(), { actor });

test('hard deletion hides the record and erases its payload while retaining a causal clock', async () => {
  const raw = createMemoryStore();
  const store = withCausalWrites(raw, { actor: 'a' });
  const events = [];
  store.subscribe((event) => events.push(event));
  await store.put({
    id: 'one',
    body: 'erase this',
    raw: { secretBody: 'erase too' },
  });
  assert.equal(await store.delete('one'), true);
  const tombstone = await raw.get('one');
  assert.deepEqual(tombstone, { id: 'one', [SYNC_DELETED]: 1, vc: { a: 2 } });
  assert.equal(await store.get('one'), null);
  assert.equal(await store.get('one', () => 'must not run'), null);
  assert.deepEqual(await store.query(), []);
  const batches = [];
  await store.scan(null, 1, (batch) => batches.push(batch));
  assert.deepEqual(batches, []);
  assert.equal(events[1].type, 'delete');
  assert.deepEqual(events[1].link, tombstone);
  assert.equal(await store.delete('one'), false);
  assert.deepEqual((await raw.get('one')).vc, { a: 3 });
  const next = await store.put({ id: 'one', body: 'explicit recreation' });
  assert.deepEqual(next.vc, { a: 4 });
  assert.equal(merge(next, tombstone).body, next.body);
});

test('late replicated puts and deletes preserve causal ordering instead of resurrecting or erasing newer data', async () => {
  const a = make('a');
  const b = make('b');
  const origin = createPeer(a);
  const remote = createPeer(b);
  const wire = loopback();
  const offA = origin.connect(wire.a);
  const offB = remote.connect(wire.b);
  try {
    const old = await a.put({ id: 'shared', body: 'old' });
    await wire.settle();
    let deleted;
    const off = origin.onLocal((event) => {
      if (event.type === 'delete') {
        deleted = event;
      }
    });
    await a.delete(old.id);
    await wire.settle();
    off();
    await remote.receive({ type: 'put', link: old });
    assert.equal(await b.get(old.id), null);
    const next = await b.put({ id: old.id, body: 'new owner record' });
    await wire.settle();
    await remote.receive({ type: 'delete', link: deleted.link });
    assert.deepEqual(await b.get(old.id), next);
    assert.equal((await a.get(old.id)).body, next.body);
    await assert.rejects(remote.receive({ type: 'delete', link: old }), {
      code: 'SYNC_VALUE_INVALID',
    });
    assert.deepEqual(await b.get(old.id), next);
  } finally {
    offA();
    offB();
  }
});

for (const [name, open] of [
  ['text', createLinoTextStore],
  ['binary', createDoubletsStore],
]) {
  test(
    `${name}: deletion metadata survives actual flush/reopen and rejects an old packet`,
    { timeout: 10000 },
    async () => {
      const folder = await mkdtemp(path.join(os.tmpdir(), 'ms-delete-clock-'));
      const file = path.join(folder, 'data');
      let store;
      try {
        store = withCausalWrites(await open(file), { actor: 'a' });
        const old = await store.put({ id: 'shared', body: 'old' });
        await store.delete(old.id);
        await store.flush();
        await store.close?.();
        store = null;
        store = withCausalWrites(await open(file), { actor: 'b' });
        assert.equal(await store.get(old.id), null);
        await createPeer(store).receive({ type: 'put', link: old });
        assert.equal(await store.get(old.id), null);
        const next = await store.put({ id: old.id, body: 'new' });
        assert.deepEqual(next.vc, { a: 2, b: 1 });
      } finally {
        await store?.flush();
        await store?.close?.();
        await rm(folder, { recursive: true, force: true });
      }
    }
  );
}

test('browser deletion metadata survives driver reopen', async () => {
  const driver = createInMemoryDriver();
  let store = withCausalWrites(await createBrowserStore({ driver }), {
    actor: 'a',
  });
  const old = await store.put({ id: 'one', body: 'old' });
  await store.delete(old.id);
  await store.flush();
  store = withCausalWrites(await createBrowserStore({ driver }), {
    actor: 'b',
  });
  await createPeer(store).receive({ type: 'put', link: old });
  assert.equal(await store.get(old.id), null);
  assert.deepEqual((await store.put({ id: old.id, body: 'new' })).vc, {
    a: 2,
    b: 1,
  });
});

test('a three-peer live hub forwards causal deletion and rejects delayed old packets', async () => {
  const stores = ['a', 'hub', 'b'].map(make);
  const peers = stores.map((store, index) =>
    createPeer(store, { hub: index === 1 })
  );
  const ab = loopback();
  const bc = loopback();
  const stops = [
    peers[0].connect(ab.a),
    peers[1].connect(ab.b),
    peers[1].connect(bc.a),
    peers[2].connect(bc.b),
  ];
  try {
    const old = await stores[0].put({ id: 'shared', body: 'old' });
    await ab.settle();
    await bc.settle();
    await ab.settle();
    assert.equal((await stores[2].get(old.id)).body, 'old');
    await stores[0].delete(old.id);
    await ab.settle();
    await bc.settle();
    await ab.settle();
    for (const peer of peers) {
      await peer.receive({ type: 'put', link: old });
    }
    for (const store of stores) {
      assert.equal(await store.get(old.id), null);
    }
  } finally {
    for (const stop of stops) {
      stop();
    }
  }
});

test('a replicated purged message cannot create fresh revision payloads from an older packet', async () => {
  const raw = createMemoryStore();
  const store = withMessageVersions(withCausalWrites(raw, { actor: 'a' }));
  const first = await store.put({ id: 'msg:one', body: 'erase original' });
  await store.put({ id: first.id, body: 'erase edit too' });
  const history = (await messageVersions(store, first.id)).versions;
  assert.equal(history.length, 2);
  await store.delete(first.id);
  const peer = createPeer(store);
  await peer.receive({ type: 'put', link: first });
  for (const record of history) {
    await peer.receive({ type: 'put', link: record });
  }
  await store.putMany([first], received);
  assert.equal(await store.get(first.id), null);
  assert.deepEqual(await store.query(), []);
  const remaining = await raw.query();
  assert(remaining.every(isSyncDeleted));
  assert(
    remaining.every(
      (record) =>
        !Object.hasOwn(record, 'body') && !Object.hasOwn(record, 'snapshot')
    )
  );
});

test('a stale or malformed replicated message deletion preserves recreated history', async () => {
  const store = withMessageVersions(make('a'));
  const old = await store.put({ id: 'msg:one', body: 'old' });
  let deleted;
  const peer = createPeer(store);
  const off = peer.onLocal((event) => {
    if (event.type === 'delete' && event.link.id === 'msg:one') {
      deleted = event;
    }
  });
  await store.delete('msg:one');
  off();
  await store.put({ id: 'msg:one', body: 'new' });
  await store.put({ id: 'msg:one', body: 'new edit' });
  const history = await messageVersions(store, 'msg:one');
  await assert.rejects(
    peer.receive({ type: 'delete', link: { id: 'msg:one' } }),
    {
      code: 'SYNC_VALUE_INVALID',
    }
  );
  assert.deepEqual(await messageVersions(store, 'msg:one'), history);
  await peer.receive(deleted);
  assert.deepEqual(await messageVersions(store, 'msg:one'), history);
  await store.putMany([old], received);
  assert.deepEqual(await messageVersions(store, 'msg:one'), history);
});

test('invalid owner markers and malformed wire deletion metadata fail without replacing a record', async () => {
  const store = make('a');
  const old = await store.put({ id: 'one', body: 'keep' });
  await assert.rejects(store.put({ id: 'one', [SYNC_DELETED]: 1 }), {
    code: 'SYNC_VALUE_INVALID',
  });
  for (const link of [
    { id: 'one', [SYNC_DELETED]: 1, vc: {} },
    { id: 'one', [SYNC_DELETED]: 2, vc: { a: 2 } },
    { id: 'one', [SYNC_DELETED]: 1, vc: { a: 2 }, body: 'not a payload' },
  ]) {
    await assert.rejects(store.put(link, received), {
      code: 'SYNC_VALUE_INVALID',
    });
    assert.deepEqual(await store.get('one'), old);
  }
});

test('secret and schema deletion remains physical and never leaves a synchronization tombstone', async () => {
  const raw = createMemoryStore();
  const store = withCausalWrites(raw, { actor: 'a' });
  for (const id of ['secret:one', 'meta:schema']) {
    await store.put({ id, value: 'private' });
    assert.equal(await store.delete(id), true);
    assert.equal(await raw.get(id), null);
  }
});
