// Migration 0006 (R-Z7, R-Z17): every stored tombstone becomes
// `deleted: { at, by, reason }`. Fakes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as m0006 from '../src/storage/migrations/0006-tombstones.js';
import { runMigrations } from '../src/storage/migrations/core.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { deletedAtOf, isTombstone } from '../src/storage/soft-delete.js';

const msg = (n, extra = {}) => ({
  id: `msg:telegram:1:${n}`,
  source: 'telegram',
  chat: '1',
  body: `m${n}`,
  ...extra,
});

const oldStore = async () => {
  const store = createMemoryStore();
  await store.putMany([
    msg(1, { deleted: true }),
    msg(2, { deleted: true, deletedAt: '2024-01-02T03:04:05.000Z' }),
    msg(3, { deleted: { at: '2024-02-03T00:00:00.000Z', by: 'user' } }),
    msg(4, {
      deleted: { at: '2024-03-03T00:00:00.000Z', by: 'user', reason: 'x' },
    }),
    msg(5),
    msg(6, { deleted: null }),
    msg(7, { deleted: 'yes' }),
    msg(8, { deletedAt: '2024-04-04T00:00:00.000Z' }),
    msg(9, { deleted: false }),
  ]);
  return store;
};

const run = (store, options = {}) =>
  runMigrations(store, { migrations: [m0006], from: 5, ...options });

test('0006 unifies every tombstone shape', async () => {
  const store = await oldStore();
  const result = await run(store);
  assert.equal(result.to, 6);
  assert.deepEqual((await store.get('msg:telegram:1:1')).deleted, {
    at: null,
    by: 'unknown',
    reason: null,
  });
  const two = await store.get('msg:telegram:1:2');
  assert.deepEqual(two.deleted, {
    at: '2024-01-02T03:04:05.000Z',
    by: 'user',
    reason: 'deleted-in-app',
  });
  assert.equal('deletedAt' in two, false);
  assert.deepEqual((await store.get('msg:telegram:1:3')).deleted, {
    at: '2024-02-03T00:00:00.000Z',
    by: 'user',
    reason: null,
  });
  assert.equal((await store.get('msg:telegram:1:4')).deleted.reason, 'x');
  assert.equal(
    (await store.get('msg:telegram:1:8')).deleted.at,
    '2024-04-04T00:00:00.000Z'
  );
  // Not tombstones, or not understood: untouched.
  assert.equal('deleted' in (await store.get('msg:telegram:1:5')), false);
  assert.equal((await store.get('msg:telegram:1:6')).deleted, null);
  assert.equal((await store.get('msg:telegram:1:7')).deleted, 'yes');
  assert.equal((await store.get('msg:telegram:1:9')).deleted, false);
});

test('0006 is idempotent: the second run changes nothing', async () => {
  const store = await oldStore();
  const first = await run(store);
  assert.equal(first.steps[0].changed, 4);
  const second = await run(store);
  assert.equal(second.steps[0].changed, 0);
});

test('0006 dry run counts and writes nothing', async () => {
  const store = await oldStore();
  const before = JSON.stringify(await store.query(() => true));
  const result = await run(store, { dryRun: true });
  assert.equal(result.steps[0].changed, 4);
  assert.equal(JSON.stringify(await store.query(() => true)), before);
});

test('readers accept the old shapes too (a read-only open)', () => {
  assert.equal(isTombstone({ deleted: true }), true);
  assert.equal(isTombstone({ deletedAt: '2024-01-01T00:00:00.000Z' }), true);
  assert.equal(isTombstone({ deleted: null }), false);
  assert.equal(
    deletedAtOf({ deleted: true, deletedAt: '2024-01-01T00:00:00.000Z' }),
    '2024-01-01T00:00:00.000Z'
  );
  assert.equal(deletedAtOf({ deleted: { at: 'A' } }), 'A');
});
