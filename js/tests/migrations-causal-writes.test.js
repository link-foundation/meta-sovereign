import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  runMigrations,
  SCHEMA_ID,
  schemaLink,
  versionOf,
} from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0012-causal-writes.js';

test('schema 12 leaves historical assignments untouched rather than fabricating clocks', async () => {
  const store = createMemoryStore();
  const records = [
    { id: 'old', body: 'legacy' },
    { id: 'clocked', vc: { a: 1 } },
    {
      id: 'joined',
      vc: { a: 2, b: 1 },
      __msSyncStamp: { version: 1, clock: { a: 2 }, context: { a: 2, b: 1 } },
    },
  ];
  await store.putMany([schemaLink({ version: 11 }), ...records]);
  const run = (options = {}) =>
    runMigrations(store, { migrations: [migration], ...options });
  const before = await store.query();
  await run({ dryRun: true });
  assert.deepEqual(await store.query(), before);
  await run();
  assert.equal(versionOf(await store.get(SCHEMA_ID)), 12);
  for (const record of records) {
    assert.deepEqual(await store.get(record.id), record);
  }
});
