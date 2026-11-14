import assert from 'node:assert/strict';
import { createMemoryStore } from '../../src/storage/universal.js';
import {
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../../src/storage/migrations/core.js';

/** Each collision leaves the legacy journal intact and permits a clean retry. */
export const assertApplicationMigration = async (
  migration,
  row,
  collisions,
  code
) => {
  const store = createMemoryStore();
  try {
    await store.putMany([schemaLink({ version: migration.from }), row]);
    for (const collision of collisions) {
      await store.put(collision);
      await assert.rejects(
        runMigrations(store, { migrations: [migration] }),
        (error) => error.cause?.code === code
      );
      assert.equal((await store.get(SCHEMA_ID)).version, migration.from);
      assert.deepEqual(await store.get(collision.id), collision);
      if (collision.id !== row.id) {
        await store.delete(collision.id);
      }
      await store.put(row);
    }
    await runMigrations(store, { migrations: [migration] });
    assert.equal((await store.get(SCHEMA_ID)).version, migration.to);
    await runMigrations(store, { migrations: [migration] });
    assert.deepEqual(await store.get(row.id), row);
  } finally {
    await store.close?.();
  }
};
