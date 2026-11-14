// Import only existing public modules so this also reproduces the exact parent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { merge } from '../src/sync/peer.js';
import { startServer } from './helpers/legacy-server.js';

test(
  'ordinary durable edits resist an older packet after close and reopen',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-causal-production-'));
    let store;
    try {
      store = await openDualStore(dir);
      const old = await store.put({ id: 'shared', body: 'z' });
      const latest = await store.put({ id: 'shared', body: 'a' });
      assert.deepEqual(merge(latest, old), latest);
      assert.deepEqual(Object.values(latest.vc), [2]);
      await store.flush();
      await store.close();
      store = null;
      store = await openDualStore(dir);
      assert.deepEqual(await store.get('shared'), latest);
      const next = await store.put({ id: 'shared', body: '0' });
      assert.deepEqual(Object.values(next.vc).sort(), [1, 2]);
      assert.deepEqual(merge(latest, next), next);
      assert.deepEqual(merge(next, old), next);
    } finally {
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'server core writes return causal records with an injected primitive store',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-causal-server-'));
    let server;
    try {
      server = await startServer({
        port: 0,
        storeDir: dir,
        store: createMemoryStore(),
        enableSync: false,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
        log: null,
      });
      const old = await server.store.put({ id: 'shared', body: 'z' });
      const next = await server.store.put({ id: 'shared', body: 'a' });
      assert.deepEqual(merge(next, old), next);
      assert.deepEqual(Object.values(next.vc), [2]);
      assert.deepEqual(await server.store.get('shared'), next);
    } finally {
      await server?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
