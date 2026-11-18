import test from 'node:test';
import assert from 'node:assert/strict';
import * as migration from '../src/storage/migrations/0025-application-preview.js';
import { assertApplicationMigration } from './helpers/application-migration.mjs';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../src/storage/migrations/core.js';

test(
  'preview schema preserves acknowledged intent, is idempotent and refuses review/batch collisions',
  { timeout: 5000 },
  async () => {
    const row = {
      id: 'secret:jobs-application:jobs:123',
      signature: 'unchanged',
      attempted: { enter: true, submit: false },
      options: {},
    };
    await assertApplicationMigration(
      migration,
      row,
      [
        { ...row, options: { vacancyPreviewSeconds: 'owner-value' } },
        {
          id: 'secret:jobs-application-batch:jobs:batch',
          signature: 'batch-unchanged',
          options: { review: { vacancyPreviewSeconds: 0 } },
        },
      ],
      'APPLICATION_PREVIEW_COLLISION'
    );
  }
);

test(
  'preview schema dry run counts without rewriting records or dispatch signatures',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    try {
      const row = {
        id: 'secret:jobs-application:jobs:123',
        signature: 'unchanged',
        options: {},
        attempted: { enter: true, submit: false },
      };
      await store.putMany([schemaLink({ version: migration.from }), row]);
      const result = await runMigrations(store, {
        migrations: [migration],
        dryRun: true,
      });
      assert.equal(result.to, migration.to);
      // The memory store scans its two rows, then applies the namespace filter.
      assert.equal(result.steps[0].scanned, 2);
      assert.equal(result.steps[0].changed, 0);
      assert.equal((await store.get(SCHEMA_ID)).version, migration.from);
      assert.deepEqual(await store.get(row.id), row);
    } finally {
      await store.close?.();
    }
  }
);
