import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createContext } from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0009-salary-exchange-policy.js';

const legacy = {
  id: 'automation:old',
  enabled: true,
  action: {
    kind: 'answer-questions',
    salary: {
      enabled: true,
      approved: true,
      exchange: { source: 'manual', asOf: '2026-11-09', rates: { USD: 84 } },
    },
  },
};
test('0009 preserves old snapshots and approvals, adds no automatic fetching, and is idempotent', async () => {
  const store = createMemoryStore();
  await store.put(legacy);
  await store.put({
    id: 'automation:without-salary',
    action: { kind: 'answer-questions' },
  });
  const first = createContext(store, migration);
  await migration.up(first);
  assert.equal(first.stats.changed, 1);
  assert.deepEqual(await store.get(legacy.id), {
    ...legacy,
    action: {
      ...legacy.action,
      salary: { ...legacy.action.salary, exchangeMode: 'snapshot' },
    },
  });
  const again = createContext(store, migration);
  await migration.up(again);
  assert.equal(again.stats.changed, 0);
});
test('0009 dry run counts without writes and preserves imported automatic policy', async () => {
  const store = createMemoryStore();
  await store.put(legacy);
  const restored = {
    ...legacy,
    id: 'automation:restored',
    action: {
      ...legacy.action,
      salary: { ...legacy.action.salary, exchangeMode: 'cbr' },
    },
  };
  await store.put(restored);
  const dry = createContext(store, migration, { dryRun: true });
  await migration.up(dry);
  assert.equal(dry.stats.changed, 1);
  assert.deepEqual(await store.get(legacy.id), legacy);
  assert.deepEqual(await store.get(restored.id), restored);
});
