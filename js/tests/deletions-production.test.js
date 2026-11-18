// These regressions import only modules already present on published a874e936.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { openDualStore } from '../src/storage/dual-store.js';
import { createPeer } from '../src/sync/peer.js';

test(
  'a delayed old packet cannot resurrect a deleted production record after reopen',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-delete-root-'));
    let store;
    try {
      store = await openDualStore(dir);
      const old = await store.put({ id: 'shared', body: 'erase' });
      await store.delete(old.id);
      await store.close();
      store = null;
      store = await openDualStore(dir);
      await createPeer(store).receive({ type: 'put', link: old });
      assert.equal(await store.get(old.id), null);
      await store.close();
      store = null;
      store = await openDualStore(dir, { readOnly: true });
      assert.equal(await store.get(old.id), null);
      await assert.rejects(store.put({ id: old.id, body: 'readonly' }), {
        code: 'STORE_READ_ONLY',
      });
    } finally {
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'a delayed causal delete cannot erase an explicitly recreated production record',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-delete-late-'));
    let store;
    try {
      store = await openDualStore(dir);
      await store.put({ id: 'shared', body: 'old' });
      let deleted;
      const off = createPeer(store).onLocal((event) => {
        if (event.type === 'delete') {
          deleted = event;
        }
      });
      await store.delete('shared');
      off();
      const next = await store.put({
        id: 'shared',
        body: 'explicit recreation',
      });
      await createPeer(store).receive(deleted);
      assert.deepEqual(await store.get('shared'), next);
    } finally {
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
