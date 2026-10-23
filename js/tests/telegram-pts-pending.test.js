// R-Z7 (from R-Z14): the saved update number never passes a live update
// whose store write has not ended. A write that fails after the number was
// saved used to leave the advanced number on disk, so a crash lost the
// update. Fake client and store only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createMemoryStore } from '../src/storage/index.js';
import {
  TELEGRAM_STATE_ID,
  createTelegramCatchUp,
  rewindPts,
} from '../src/sources/telegram-catchup.js';

const manualTimers = () => {
  let next = 1;
  const due = new Map();
  return {
    setTimeout: (fn) => {
      due.set(next, fn);
      next += 1;
      return next - 1;
    },
    clearTimeout: (id) => due.delete(id),
    fire: async () => {
      const all = [...due.values()];
      due.clear();
      all.forEach((fn) => fn());
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
};

const request = (name) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { request: name });
    }
  };

const boot = async () => {
  const store = createMemoryStore();
  await store.put({
    id: TELEGRAM_STATE_ID,
    account: '77',
    pts: 10,
    qts: 0,
    date: 1,
    seq: 0,
  });
  const timers = manualTimers();
  const catchUp = createTelegramCatchUp({
    store,
    importer: async () => ({
      Api: {
        updates: {
          GetState: request('GetState'),
          GetDifference: request('GetDifference'),
        },
      },
    }),
    handle: async () => {},
    timers,
  });
  const client = {
    invoke: async () => ({
      className: 'updates.DifferenceEmpty',
      date: 2,
      seq: 0,
    }),
    addEventHandler: () => {},
  };
  await catchUp.attach(client, { id: 77 });
  return { store, timers, catchUp };
};

const update = { className: 'UpdateNewMessage', pts: 11, ptsCount: 1 };
const savedPts = async (store) => (await store.get(TELEGRAM_STATE_ID)).pts;

test('the saved number waits for a live write that is still running', async () => {
  const { store, timers, catchUp } = await boot();
  let finish = () => {};
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  catchUp.observe(update);
  catchUp.track(update, done);
  assert.equal(catchUp.state().pts, 11, 'the counter follows the update');
  await timers.fire();
  assert.equal(
    await savedPts(store),
    10,
    'not saved past the unfinished write'
  );

  finish();
  await done;
  await new Promise((resolve) => setImmediate(resolve));
  await timers.fire();
  assert.equal(await savedPts(store), 11, 'saved once the write is stored');
  await catchUp.stop();
});

test('a write that fails after the save leaves the old number on disk', async () => {
  const { store, timers, catchUp } = await boot();
  let fail = () => {};
  const done = new Promise((resolve, reject) => {
    fail = () => reject(new Error('write failed'));
  });
  catchUp.observe(update);
  catchUp.track(update, done);
  await timers.fire(); // the 1 s save falls inside the write
  fail();
  await done.catch(() => {});
  // The failure steps the counter back, as the account does.
  assert.equal(rewindPts(catchUp.state(), update), true);
  await new Promise((resolve) => setImmediate(resolve));
  await timers.fire();
  assert.equal(await savedPts(store), 10, 'a restart fetches the update again');
  await catchUp.stop();
});

test('an update without a number is not tracked', async () => {
  const { catchUp } = await boot();
  catchUp.track({ className: 'UpdateUserTyping' }, Promise.resolve());
  await catchUp.stop();
});
