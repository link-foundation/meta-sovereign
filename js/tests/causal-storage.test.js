import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createDoubletsStore } from '../src/storage/doublets-store.js';
import { createDualStore, openDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { merge } from '../src/sync/peer.js';
import {
  withMessageVersions,
  messageVersions,
} from '../src/storage/message-versions.js';

for (const [name, open] of [
  ['text', createLinoTextStore],
  ['binary', createDoubletsStore],
]) {
  test(
    `${name}: a rejected batch leaves no partial memory or durable write`,
    { timeout: 10000 },
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-causal-reject-'));
      const file = path.join(dir, 'data');
      let store;
      try {
        store = withCausalWrites(await open(file), { actor: 'a' });
        const events = [];
        const off = store.subscribe((event) => events.push(event));
        await assert.rejects(
          store.putMany([
            { id: 'first', body: 'must not persist' },
            { id: 'bad', vc: { a: -1 } },
          ]),
          { code: 'SYNC_CLOCK_INVALID' }
        );
        assert.equal(await store.get('first'), null);
        assert.deepEqual(events, []);
        off();
        await store.put({ id: 'after', body: 'recovered' });
        await store.flush();
        await store.close?.();
        store = null;
        store = withCausalWrites(await open(file), { actor: 'b' });
        assert.equal(await store.get('first'), null);
        assert.equal(await store.get('bad'), null);
        assert.equal((await store.get('after')).body, 'recovered');
      } finally {
        await store?.close?.();
        await rm(dir, { recursive: true, force: true });
      }
    }
  );
  test(
    `${name}: bulk assignment clocks persist and retain reentrant owner edits`,
    { timeout: 10000 },
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-causal-file-'));
      const file = path.join(dir, 'data');
      let store;
      try {
        store = withCausalWrites(await open(file), { actor: 'a' });
        let edit;
        const off = store.subscribe((event) => {
          if (event.link.id === 'first') {
            edit = store.put({ id: 'second', body: 'owner' });
          }
        });
        await store.putMany([
          { id: 'first', body: 'bulk' },
          { id: 'second', body: 'bulk' },
        ]);
        await edit;
        off();
        const owner = await store.get('second');
        assert.equal(owner.body, 'owner');
        assert.deepEqual(owner.vc, { a: 2 });
        await store.flush();
        await store.close?.();
        store = null;
        store = withCausalWrites(await open(file), { actor: 'b' });
        assert.deepEqual(await store.get('second'), owner);
        const next = await store.put({ id: 'second', body: 'new' });
        assert.deepEqual(next.vc, { a: 2, b: 1 });
        assert.deepEqual(merge(next, owner), next);
      } finally {
        await store?.flush();
        await store?.close?.();
        await rm(dir, { recursive: true, force: true });
      }
    }
  );
}

test('a dual batch applies its transform once and keeps both stores identical', async () => {
  const binary = createMemoryStore();
  const text = createMemoryStore();
  const store = withCausalWrites(createDualStore({ binary, text }), {
    actor: 'a',
  });
  const out = await store.putMany([{ id: 'one' }, { id: 'one' }]);
  assert.deepEqual(
    out.map((link) => link.vc),
    [{ a: 1 }, { a: 2 }]
  );
  assert.deepEqual(await binary.query(), await text.query());
});

test(
  'managed bulk clocks admit behind queued single writes and preserve provenance',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-causal-managed-'));
    let store;
    try {
      store = await openDualStore(dir);
      const first = store.put({ id: 'shared', body: 'first' });
      const second = store.putMany([
        { id: 'shared', body: 'second' },
        { id: 'shared', body: 'third' },
      ]);
      const old = await first;
      const out = await second;
      const actor = Object.keys(old.vc)[0];
      assert.deepEqual(
        out.map((link) => link.vc[actor]),
        [2, 3]
      );
      assert.deepEqual(await store.get('shared'), out[1]);
      assert.deepEqual(await store.verify(), []);
    } finally {
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('message history returns admitted clocks and keeps version content immutable', async () => {
  const store = withMessageVersions(
    withCausalWrites(createMemoryStore(), { actor: 'a' })
  );
  const first = await store.put({ id: 'msg:one', body: 'before' });
  const latest = await store.put({ id: 'msg:one', body: 'after' });
  assert.deepEqual(await store.get('msg:one'), latest);
  assert.equal(latest.vc.a, 2);
  const history = await messageVersions(store, 'msg:one');
  assert.deepEqual(
    new Set(history.versions.map((link) => link.snapshot.body)),
    new Set(['before', 'after'])
  );
  const version = history.versions[0];
  await store.put({ ...version, assets: [] });
  await assert.rejects(
    store.put({ ...version, snapshot: { body: 'tampered' } }),
    { code: 'VERSION_IMMUTABLE' }
  );
  assert.deepEqual(merge(first, latest), latest);
});
