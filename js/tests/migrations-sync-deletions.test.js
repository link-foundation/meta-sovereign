import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { openDualStore } from '../src/storage/dual-store.js';
import { formatLinoRecords } from '../src/storage/lino-store.js';
import {
  runMigrations,
  schemaLink,
  SCHEMA_ID,
  versionOf,
} from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0013-sync-deletions.js';
import { SYNC_DELETED } from '../src/storage/sync-deletions.js';

test('schema 13 reserves deletion metadata without inventing deletion history', async () => {
  const store = createMemoryStore();
  const old = { id: 'legacy', body: 'keep', vc: { a: 1 } };
  await store.putMany([schemaLink({ version: 12 }), old]);
  await runMigrations(store, { migrations: [migration] });
  assert.equal(versionOf(await store.get(SCHEMA_ID)), 13);
  assert.deepEqual(await store.get(old.id), old);
});

test('schema 13 refuses an existing reserved owner field and leaves the old version intact', async () => {
  const store = createMemoryStore();
  const old = { id: 'owner', [SYNC_DELETED]: 'owner data' };
  await store.putMany([schemaLink({ version: 12 }), old]);
  await assert.rejects(
    runMigrations(store, { migrations: [migration] }),
    (error) =>
      error.cause?.code === 'SYNC_DELETION_COLLISION' ||
      error.code === 'SYNC_DELETION_COLLISION'
  );
  assert.equal(versionOf(await store.get(SCHEMA_ID)), 12);
  assert.deepEqual(await store.get(old.id), old);
});

test(
  'read-only schema 12 preserves an owner field until migration can validate it',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-delete-collision-'));
    let reader;
    try {
      const old = { id: 'owner', [SYNC_DELETED]: 1, body: 'owner data' };
      await writeFile(
        path.join(dir, 'data.lino'),
        formatLinoRecords([schemaLink({ version: 12 }), old])
      );
      reader = await openDualStore(dir, { readOnly: true });
      assert.deepEqual(await reader.get(old.id), old);
      await reader.close();
      reader = null;
      await assert.rejects(
        openDualStore(dir),
        (error) => error.cause?.code === 'SYNC_DELETION_COLLISION'
      );
      reader = await openDualStore(dir, { readOnly: true });
      assert.deepEqual(await reader.get(old.id), old);
    } finally {
      await reader?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
