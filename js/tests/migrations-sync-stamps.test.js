import test from 'node:test';
import assert from 'node:assert/strict';
import * as migration from '../src/storage/migrations/0011-sync-write-stamps.js';
import {
  runMigrations,
  SCHEMA_ID,
  schemaLink,
  versionOf,
} from '../src/storage/migrations/core.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { merge } from '../src/sync/peer.js';
import { SYNC_STAMP } from '../src/sync/register.js';

const run = (store, options = {}) =>
  runMigrations(store, {
    migrations: [migration],
    from: 10,
    ...options,
  });
test('schema 11 preserves historical payloads/clocks and supports a dry run', async () => {
  const store = createMemoryStore();
  const record = {
    id: 'shared',
    body: 'old',
    vc: { a: 1 },
    children: ['z', 'a'],
  };
  await store.putMany([schemaLink({ version: 10 }), record]);
  const before = await store.query();
  const dry = await run(store, { dryRun: true });
  assert.equal(dry.steps[0].changed, 0);
  assert.deepEqual(await store.query(), before);
  const result = await run(store);
  assert.equal(result.steps[0].changed, 0);
  assert.deepEqual(await store.get('shared'), record);
  assert.equal(versionOf(await store.get(SCHEMA_ID)), 11);
});
test('schema 11 refuses an older reserved-field collision without overwriting it', async () => {
  const store = createMemoryStore();
  const record = { id: 'shared', [SYNC_STAMP]: 'owner data' };
  await store.putMany([schemaLink({ version: 10 }), record]);
  await assert.rejects(
    run(store),
    (error) =>
      error.code === 'MIGRATION_FAILED' &&
      error.cause?.code === 'SYNC_STAMP_COLLISION'
  );
  assert.deepEqual(await store.get('shared'), record);
  assert.equal(versionOf(await store.get(SCHEMA_ID)), 10);
});
test('repeating schema 11 accepts its own later generated stamps', async () => {
  const store = createMemoryStore();
  await run(store);
  const record = merge(
    { id: 'shared', body: 'a', vc: { a: 2 } },
    { id: 'shared', body: 'b', vc: { b: 1 } }
  );
  await store.put(record);
  await run(store);
  assert.deepEqual(await store.get('shared'), record);
});
