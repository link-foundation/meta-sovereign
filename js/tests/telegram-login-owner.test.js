import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTelegramLoginOwner } from '../src/web/connections/telegram-login-owner.js';

const flush = () => new Promise((resolve) => globalThis.setTimeout(resolve, 0));

test('reset cancels all pending finder/phone controllers once and rejects old responses', async () => {
  const cancelled = [];
  const owner = createTelegramLoginOwner((id) => cancelled.push(id));
  const old = owner.ticket();
  assert.equal(owner.take(old, 'phone'), true);
  assert.equal(owner.take(old, 'finder'), true);
  owner.reset();
  owner.reset();
  assert.equal(owner.current(old), false);
  assert.equal(owner.take(old, 'late-qr'), false);
  assert.equal(owner.take(owner.ticket(), 'current'), true);
  await flush();
  assert.deepEqual(cancelled, ['phone', 'finder', 'late-qr']);
});

test('completed credentials release their controller before navigation', async () => {
  const cancelled = [];
  const owner = createTelegramLoginOwner((id) => cancelled.push(id));
  owner.take(owner.ticket(), 'finished');
  owner.release('finished');
  owner.close();
  await flush();
  assert.deepEqual(cancelled, []);
});

test('unmount and effect remount cannot revive a pending start response', async () => {
  const cancelled = [];
  const owner = createTelegramLoginOwner((id) => cancelled.push(id));
  const old = owner.ticket();
  owner.close();
  assert.equal(owner.take(owner.ticket(), 'after-close'), false);
  owner.mount();
  assert.equal(owner.take(old, 'old-start'), false);
  assert.equal(owner.take(owner.ticket(), 'new-start'), true);
  owner.close();
  await flush();
  assert.deepEqual(cancelled, ['after-close', 'old-start', 'new-start']);
});

test('failed cancellation is observed without restoring old ownership', async () => {
  const owner = createTelegramLoginOwner(async () => {
    throw new Error('offline');
  });
  const old = owner.ticket();
  owner.take(old, 'pending');
  owner.reset();
  await flush();
  assert.equal(owner.current(old), false);
});
