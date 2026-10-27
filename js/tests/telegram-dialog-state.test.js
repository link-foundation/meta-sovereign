import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDialogState } from '../src/sources/telegram-dialog-state.js';
import { createMemoryStore } from '../src/storage/universal.js';

const request = (name) =>
  class {
    constructor(values) {
      Object.assign(this, values);
      this.kind = name;
    }
  };
const Api = {
  InputDialogPeer: request('InputDialogPeer'),
  messages: { GetPeerDialogs: request('GetPeerDialogs') },
};
const boot = async (onInvoke) => {
  const store = createMemoryStore();
  await store.put({
    id: 'read:telegram:42',
    source: 'telegram',
    chat: '42',
    unreadCount: 6,
    inboxMaxId: 1,
    unreadTopId: 7,
    pinnedRank: 3,
  });
  const requests = [];
  const env = {
    store,
    now: () => 123456789,
    queue: {
      run: async (key, priority, run) => {
        requests.push({ key, priority });
        return run();
      },
    },
    connection: {
      withPeer: async (_client, chat, run) => run({ userId: chat }),
    },
  };
  const client = {
    invoke: async (req) => {
      requests.push(req);
      return onInvoke(store);
    },
  };
  return {
    store,
    requests,
    refresh: createDialogState(env, async () => ({ client, Api })),
  };
};
test('Operator obtains current zero unread and mute state without reading the peer', async () => {
  const { store, requests, refresh } = await boot(() => ({
    dialogs: [
      {
        unreadCount: 0,
        readInboxMaxId: 7,
        readOutboxMaxId: 4,
        topMessage: 7,
        notifySettings: { muteUntil: 0 },
      },
    ],
  }));
  const answer = await refresh({ chat: '42' });
  assert.equal(answer.ok, true);
  assert.equal(answer.read.unreadCount, 0);
  assert.equal(answer.read.pinnedRank, 3);
  assert.equal((await store.get('read:telegram:42')).inboxMaxId, 7);
  assert.equal(requests[0].priority, 'view');
  assert.deepEqual(
    requests.slice(1).map((r) => r.kind),
    ['GetPeerDialogs'],
    'no ReadHistory, ReadMentions or ReadReactions'
  );
});
test('a live marker arriving during dialog inspection wins the older snapshot', async () => {
  const { refresh } = await boot(async (store) => {
    await store.put({
      id: 'read:telegram:42',
      chat: '42',
      unreadCount: 0,
      inboxMaxId: 10,
      unreadTopId: 10,
    });
    return { dialogs: [{ unreadCount: 6, readInboxMaxId: 1, topMessage: 7 }] };
  });
  const answer = await refresh({ chat: '42' });
  assert.equal(answer.read.unreadCount, 0);
  assert.equal(answer.read.inboxMaxId, 10);
});
test('missing and malformed peer state cannot be reported as zero unread', async () => {
  const { refresh } = await boot(() => ({ dialogs: [] }));
  assert.equal((await refresh({ chat: '42' })).ok, false);
  assert.equal((await refresh({ chat: '' })).code, 'bad-request');
  const disconnected = createDialogState({}, async () => null);
  assert.equal((await disconnected({ chat: '42' })).supported, false);
});
