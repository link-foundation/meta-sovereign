import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { atomicBatch, replicatedMutation } from '../src/storage/mutation.js';
import { merge, createPeer, loopback } from '../src/sync/peer.js';
import { SYNC_STAMP } from '../src/sync/register.js';

const make = (actor) => withCausalWrites(createMemoryStore(), { actor });
const received = { [replicatedMutation]: true };

test('ordinary puts and updates advance the admitted prior clock', async () => {
  const store = make('a');
  const input = { id: 'shared', body: 'z' };
  const first = await store.put(input);
  const second = await store.put({ id: 'shared', body: 'a' });
  const third = await store.update('shared', (before) => ({
    ...before,
    body: '0',
  }));
  assert.deepEqual(input, { id: 'shared', body: 'z' });
  assert.deepEqual(first.vc, { a: 1 });
  assert.deepEqual(second.vc, { a: 2 });
  assert.deepEqual(third.vc, { a: 3 });
  assert.deepEqual(merge(first, second), second);
  assert.deepEqual(await store.get('shared'), third);
});

test('a fresh writer after reopen observes older writers and ignores stale input context', async () => {
  const core = createMemoryStore();
  const first = withCausalWrites(core, { actor: 'a' });
  const old = await first.put({ id: 'shared', body: 'old' });
  // A real reopen has a new primitive object; use its retained snapshot here.
  const reopened = createMemoryStore();
  await reopened.put(old);
  const second = withCausalWrites(reopened, { actor: 'b' });
  const next = await second.put({ id: 'shared', body: 'new', vc: {} });
  assert.deepEqual(next.vc, { a: 1, b: 1 });
  assert.deepEqual(merge(old, next), next);
});

test('local edits replace a retained winning stamp with a new causal assignment', async () => {
  const store = make('local');
  const old = merge(
    { id: 'shared', body: 'A', vc: { a: 2 } },
    { id: 'shared', body: 'B', vc: { b: 1 } }
  );
  await store.put(old, received);
  const next = await store.put({ ...old, body: 'owner' });
  assert.deepEqual(next.vc, { a: 2, b: 1, local: 1 });
  assert.equal(Object.hasOwn(next, SYNC_STAMP), false);
  assert.deepEqual(merge(next, old), next);
});

test('an invalid reserved stamp cannot be silently discarded by a local put', async () => {
  const store = make('a');
  const link = { id: 'shared', [SYNC_STAMP]: 'owner data' };
  await assert.rejects(store.put(link), { code: 'SYNC_VALUE_INVALID' });
  assert.deepEqual(await store.query(), []);
  assert.equal(link[SYNC_STAMP], 'owner data');
});

test('replicated mutations and private links are preserved without local ticks', async () => {
  const store = make('a');
  for (const link of [
    { id: 'secret:token', value: 'private' },
    { id: 'meta:schema', version: 11 },
  ]) {
    assert.deepEqual(await store.put(link), link);
  }
  const remote = { id: 'shared', body: 'remote', vc: { b: 9 } };
  assert.deepEqual(await store.put(remote, received), remote);
  assert.deepEqual(
    await store.update('shared', () => remote, received),
    remote
  );
  assert.deepEqual(await store.putMany([remote], received), [remote]);
});

test('a complete bulk is clocked before reentrant subscribers can edit it', async () => {
  const store = make('a');
  let edit;
  const events = [];
  const off = store.subscribe((event) => {
    events.push(event.link);
    if (events.length === 1) {
      edit = store.put({ id: 'second', body: 'owner' });
    }
  });
  const out = await store.putMany([
    { id: 'first', body: 'bulk' },
    { id: 'second', body: 'bulk' },
  ]);
  await edit;
  off();
  assert.equal((await store.get('second')).body, 'owner');
  assert.deepEqual((await store.get('second')).vc, { a: 2 });
  assert.deepEqual(
    out.map((link) => link.vc),
    [{ a: 1 }, { a: 1 }]
  );
  assert.equal(events.length, 3);
});

test('duplicate ids in a bulk advance from earlier entries in the same admission', async () => {
  const store = make('a');
  const out = await store.putMany([
    { id: 'shared', body: 'one' },
    { id: 'shared', body: 'two' },
  ]);
  assert.deepEqual(
    out.map((link) => link.vc),
    [{ a: 1 }, { a: 2 }]
  );
  assert.deepEqual(await store.get('shared'), out[1]);
});

test('an invalid later bulk clock refuses the whole batch without events', async () => {
  const store = make('a');
  const events = [];
  store.subscribe((event) => events.push(event));
  await assert.rejects(
    store.putMany([{ id: 'one' }, { id: 'two', vc: { a: -1 } }]),
    { code: 'SYNC_CLOCK_INVALID' }
  );
  assert.deepEqual(await store.query(), []);
  assert.deepEqual(events, []);
});

test('atomic batch transforms reject async/mismatched output before any write', async () => {
  for (const transform of [
    (link) => (link.id === 'bad' ? Promise.resolve(link) : link),
    (link) => (link.id === 'bad' ? { id: 'other' } : link),
  ]) {
    const store = createMemoryStore();
    await assert.rejects(
      store[atomicBatch]([{ id: 'ok' }, { id: 'bad' }], transform)
    );
    assert.deepEqual(await store.query(), []);
  }
});

test('wrapping an already causal store preserves its writer even through descriptor decorators', async () => {
  const store = make('a');
  const decorated = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(store)
  );
  const again = withCausalWrites(decorated, { actor: 'b' });
  assert.equal(again, decorated);
  assert.deepEqual((await again.put({ id: 'shared' })).vc, { a: 1 });
});

test('default writable openings have distinct actor identities', async () => {
  const a = withCausalWrites(createMemoryStore());
  const b = withCausalWrites(createMemoryStore());
  const [left, right] = await Promise.all([
    a.put({ id: 'same' }),
    b.put({ id: 'same' }),
  ]);
  assert.notDeepEqual(Object.keys(left.vc), Object.keys(right.vc));
});

test('third-party stores must provide atomic admission instead of emulating a partial bulk', async () => {
  assert.throws(() => withCausalWrites({}), {
    code: 'SYNC_ATOMIC_UNAVAILABLE',
  });
  const store = withCausalWrites({ update() {} }, { actor: 'a' });
  await assert.rejects(store.putMany([{ id: 'one' }]), {
    code: 'SYNC_ATOMIC_UNAVAILABLE',
  });
});

test('an explicitly exchanged offline assignment and a later three-peer edit keep causal order', async () => {
  const stores = ['a', 'b', 'c'].map(make);
  const left = loopback();
  const branch = loopback();
  const peers = stores.map((store, i) =>
    createPeer(store, { node: String(i), hub: i === 1 })
  );
  const first = await stores[0].put({ id: 'shared', body: 'z' });
  const offs = [
    peers[0].connect(left.a),
    peers[1].connect(left.b),
    peers[1].connect(branch.a),
    peers[2].connect(branch.b),
  ];
  // Re-publish the offline assignment as a replicated snapshot, not a new edit.
  try {
    left.a.send({ type: 'put', link: first });
    await left.settle();
    await branch.settle();
    assert.equal((await stores[2].get('shared')).body, 'z');
    const next = await stores[2].put({ id: 'shared', body: 'a' });
    await branch.settle();
    await left.settle();
    for (const store of stores) {
      assert.deepEqual(await store.get('shared'), next);
    }
    assert.deepEqual(next.vc, { a: 1, c: 1 });
  } finally {
    offs.forEach((off) => off());
  }
});

test('browser reopen retains ordinary write clocks and a fresh actor advances them', async () => {
  const driver = createInMemoryDriver();
  const first = withCausalWrites(await createBrowserStore({ driver }), {
    actor: 'a',
  });
  const old = await first.put({ id: 'shared', body: 'z' });
  const reopened = withCausalWrites(await createBrowserStore({ driver }), {
    actor: 'b',
  });
  const next = await reopened.put({ id: 'shared', body: 'a' });
  assert.deepEqual(next.vc, { a: 1, b: 1 });
  assert.deepEqual(merge(old, next), next);
});
