import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createContext } from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0008-salary-exchange.js';
import {
  salaryExchange,
  SALARY_EXCHANGE_ID,
} from '../src/automation/salary-exchange.js';

test('0008 introduces an unavailable rate cache and leaves old answers unchanged, idempotently', async () => {
  const store = createMemoryStore();
  const old = {
    id: 'automation:legacy',
    action: { kind: 'answer-questions', profile: { city: 'Nha Trang' } },
  };
  await store.put(old);
  const first = createContext(store, migration);
  await migration.up(first);
  assert.equal(first.stats.changed, 1);
  assert.deepEqual(await store.get(SALARY_EXCHANGE_ID), {
    id: SALARY_EXCHANGE_ID,
    exchange: null,
    fetchedAt: null,
  });
  assert.equal((await salaryExchange(store)).status, 'unavailable');
  assert.deepEqual(await store.get(old.id), old);
  const again = createContext(store, migration);
  await migration.up(again);
  assert.equal(again.stats.changed, 0);
});

test('0008 dry run counts without writes and preserves a restored snapshot', async () => {
  const store = createMemoryStore();
  const dry = createContext(store, migration, { dryRun: true });
  await migration.up(dry);
  assert.equal(dry.stats.changed, 1);
  assert.equal(await store.get(SALARY_EXCHANGE_ID), null);
  const restored = {
    id: SALARY_EXCHANGE_ID,
    exchange: {
      base: 'RUB',
      rates: [{ code: 'USD', rate: 1 }],
      asOf: '2026-11-09',
      source: 'cbr',
      maxAgeDays: 7,
    },
    fetchedAt: '2026-11-09T12:00:00.000Z',
  };
  await store.put(restored);
  const keep = createContext(store, migration);
  await migration.up(keep);
  assert.equal(keep.stats.changed, 0);
  assert.deepEqual(await store.get(SALARY_EXCHANGE_ID), restored);
});
