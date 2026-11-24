import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  followVkFriendStats,
  isVkFriendStats,
} from '../src/web/vk-friend-stats-feed.js';
import { createVkFriendsApi } from '../src/web/vk-friends-api.js';
import { ACCOUNT_KEY } from '../src/web/telegram-account-scope.js';

const snapshot = () => ({
  ok: true,
  timezone: 'UTC',
  month: '2026-11',
  week: '2026-11-09',
  accounts: [
    {
      accountId: 1,
      total: 2,
      month: 2,
      week: 1,
      undated: 0,
      initialFriendsCount: 1,
    },
  ],
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const fakeClock = () => {
  const tasks = new Map();
  let serial = 0;
  return {
    tasks,
    setTimeout(run, delay) {
      const id = ++serial;
      tasks.set(id, { run, delay });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    async tick() {
      assert.equal(tasks.size, 1);
      const [id, task] = tasks.entries().next().value;
      tasks.delete(id);
      await task.run();
    },
  };
};

test('statistics schema refuses malformed, duplicate and impossible summaries', () => {
  assert.equal(isVkFriendStats(snapshot()), true);
  for (const value of [
    null,
    { ...snapshot(), week: '2026-11-10' },
    { ...snapshot(), accounts: [null] },
    {
      ...snapshot(),
      accounts: [snapshot().accounts[0], snapshot().accounts[0]],
    },
    { ...snapshot(), accounts: [{ ...snapshot().accounts[0], week: 3 }] },
    {
      ...snapshot(),
      accounts: [{ ...snapshot().accounts[0], initialFriendsCount: -1 }],
    },
  ]) {
    assert.equal(isVkFriendStats(value), false);
  }
});

test('statistics feed serializes refreshes and cancels a held read without late updates', async () => {
  const clock = fakeClock();
  const held = deferred();
  const answers = [];
  let calls = 0;
  let signal;
  const feed = followVkFriendStats({
    clock,
    read: (owned) => {
      signal = owned;
      calls++;
      return held.promise;
    },
    update: (answer) => answers.push(answer),
    fail: () => assert.fail('Unexpected failure'),
  });
  await feed.refresh();
  await feed.refresh();
  assert.equal(calls, 1);
  held.resolve(snapshot());
  await settle();
  assert.equal(answers.length, 1);
  assert.equal([...clock.tasks.values()][0].delay, 0);
  await clock.tick();
  assert.equal(calls, 2);
  assert.equal([...clock.tasks.values()][0].delay, 15000);
  feed.close();
  assert.equal(signal.aborted, true);
  assert.equal(clock.tasks.size, 0);

  const late = deferred();
  const other = followVkFriendStats({
    clock,
    read: () => late.promise,
    update: () => assert.fail('Late update after close'),
    fail: () => assert.fail('Late failure'),
  });
  other.close();
  late.resolve(snapshot());
  await settle();
  assert.equal(clock.tasks.size, 0);
});

test('failed or cached refreshes retain server counts and use bounded recovery backoff', async () => {
  const clock = fakeClock();
  const answers = [
    snapshot(),
    { ...snapshot(), cached: true },
    { ok: false },
    snapshot(),
  ];
  const updates = [];
  let failures = 0;
  const feed = followVkFriendStats({
    clock,
    read: async () => answers.shift(),
    update: (value) => updates.push(value),
    fail: () => failures++,
  });
  try {
    await settle();
    await clock.tick();
    assert.equal(failures, 1);
    assert.equal(updates.length, 1);
    assert.equal([...clock.tasks.values()][0].delay, 30000);
    await clock.tick();
    assert.equal(failures, 2);
    assert.equal(updates.length, 1);
    assert.equal([...clock.tasks.values()][0].delay, 60000);
    await clock.tick();
    assert.equal(updates.length, 2);
    assert.equal([...clock.tasks.values()][0].delay, 15000);
  } finally {
    feed.close();
  }
});

test('offline statistics do not open primary storage after cancellation or from an extra account', async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  let slot = '1';
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (key) => (key === ACCOUNT_KEY ? slot : null) },
  });
  let opens = 0;
  let received;
  const api = createVkFriendsApi({
    get: async (...args) => {
      received = args;
      return null;
    },
    local: async () => {
      opens++;
      throw new Error('Unexpected primary store access');
    },
  });
  try {
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(await api.vkFriendStats(controller.signal), { ok: false });
    assert.equal(received[1].signal, controller.signal);
    assert.deepEqual(received[2], { recover: false });
    slot = '2';
    assert.deepEqual(await api.vkFriendStats(), { ok: false });
    assert.equal(opens, 0);
  } finally {
    if (old) {
      Object.defineProperty(globalThis, 'sessionStorage', old);
    } else {
      delete globalThis.sessionStorage;
    }
  }
});
