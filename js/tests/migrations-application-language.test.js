import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0017-application-language-policy.js';

test(
  'language schema reserves each new private field and preserves legacy signatures and reservations unchanged',
  { timeout: 5000 },
  async () => {
    for (const [key, option] of [
      [null, false],
      ['autoSelectResumeLanguage', true],
      ['standardLetters', true],
      ['letterTemplate', false],
    ]) {
      const store = createMemoryStore();
      try {
        const row = {
          id: 'secret:jobs-application:jobs:123',
          signature: 'unchanged',
          attempted: { enter: true, submit: false },
          options: {},
        };
        if (key) {
          (option ? row.options : row)[key] = 'unexpected-owner-value';
        }
        await store.putMany([schemaLink({ version: 16 }), row]);
        if (key) {
          await assert.rejects(
            runMigrations(store, { migrations: [migration] }),
            (error) =>
              error.cause?.code === 'APPLICATION_LANGUAGE_POLICY_COLLISION'
          );
          assert.equal((await store.get(SCHEMA_ID)).version, 16);
        } else {
          await runMigrations(store, { migrations: [migration] });
          assert.equal((await store.get(SCHEMA_ID)).version, 17);
          await runMigrations(store, { migrations: [migration] });
        }
        assert.deepEqual(await store.get(row.id), row);
      } finally {
        await store.close?.();
      }
    }
  }
);
