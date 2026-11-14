import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0018-application-limits.js';
import { applicationLimitId } from '../src/jobs/application-limit-data.js';

test(
  'limit schema reserves its private namespace without rewriting existing application intent',
  { timeout: 4000 },
  async () => {
    for (const collision of [false, true]) {
      const store = createMemoryStore();
      try {
        const row = {
          id: 'secret:jobs-application:jobs:123',
          signature: 'untouched',
          attempted: { enter: true, submit: true },
        };
        await store.putMany([schemaLink({ version: 17 }), row]);
        if (collision) {
          await store.put({
            id: applicationLimitId,
            value: 'existing-owner-record',
          });
          await assert.rejects(
            runMigrations(store, { migrations: [migration] }),
            (error) => error.cause?.code === 'APPLICATION_LIMIT_COLLISION'
          );
          assert.equal((await store.get(SCHEMA_ID)).version, 17);
        } else {
          await runMigrations(store, { migrations: [migration] });
          assert.equal((await store.get(SCHEMA_ID)).version, 18);
          await runMigrations(store, { migrations: [migration] });
        }
        assert.deepEqual(await store.get(row.id), row);
      } finally {
        await store.close?.();
      }
    }
  }
);
