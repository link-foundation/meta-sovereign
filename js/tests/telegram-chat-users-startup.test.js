import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usersFixture } from './helpers/chat-users-fakes.mjs';
import { greetingGate } from './helpers/greeting-send-fakes.mjs';

test('shutdown owns a pending scan connection and prevents it launching after the store can close', async () => {
  const f = usersFixture();
  const entered = greetingGate();
  const release = greetingGate();
  const importer = f.env.importer;
  f.env.importer = async () => {
    entered.resolve();
    await release.promise;
    return importer();
  };
  const start = f.account.chatUsersStart({
    chat: '@StudyGroup',
    messagesLimit: 0,
  });
  await entered.promise;
  let stopped = false;
  const stop = f.env.chatUsersStop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => globalThis.setImmediate(resolve));
  try {
    assert.equal(stopped, false);
  } finally {
    release.resolve();
  }
  await stop;
  assert.equal((await start).code, 'stopped');
  assert.equal((await f.account.chatUsersStatus()).job, null);
  assert.equal(f.closed(), 0);
  assert.equal(
    (await f.account.chatUsersStart({ chat: '-44' })).code,
    'stopped'
  );
});
test('cancelling pending preflight prevents late scan launch and releases the startup lock', async () => {
  const f = usersFixture();
  const entered = greetingGate();
  const release = greetingGate();
  const entity = f.client.getEntity;
  f.client.getEntity = async () => {
    entered.resolve();
    await release.promise;
    return entity('-44');
  };
  const start = f.account.chatUsersStart({
    chat: '@StudyGroup',
    messagesLimit: 0,
  });
  await entered.promise;
  assert.equal((await f.account.chatUsersStart({ chat: '-44' })).code, 'busy');
  await f.account.chatUsersCancel();
  release.resolve();
  assert.equal((await start).code, 'cancelled');
  assert.equal((await f.account.chatUsersStatus()).job, null);
  assert.equal(
    (await f.account.chatUsersStart({ chat: '-44', messagesLimit: 0 })).ok,
    true
  );
  await f.env.chatUsersStop();
});
test('failed preflight persistence releases the lock and marks the unpublished job as failed', async () => {
  const f = usersFixture();
  const put = f.store.put.bind(f.store);
  f.store.put = async () => {
    throw new Error('store failed');
  };
  assert.equal((await f.account.chatUsersStart({ chat: '-44' })).ok, false);
  assert.equal((await f.account.chatUsersStatus()).job.state, 'failed');
  f.store.put = put;
  assert.equal(
    (await f.account.chatUsersStart({ chat: '-44', messagesLimit: 0 })).ok,
    true
  );
  await f.env.chatUsersStop();
});
