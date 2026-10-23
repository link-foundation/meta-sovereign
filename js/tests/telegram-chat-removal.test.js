// Clear, delete or leave a chat (R-Y100): Telegram is asked as its apps
// ask it — history deleted a part at a time until none is left, a basic
// group left before its history goes, a channel left — and the chat's
// stored messages are marked deleted, so it leaves the list at once. The
// menu offers what Telegram has for the kind of chat; the question names
// the chat. Fake client; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createActions } from '../src/sources/telegram-actions.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { removalAllowed } from '../src/sources/telegram-chat-removal.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { summarizeChats } from '../src/web/chat-model.js';
import { chatMenuItems } from '../src/web/chat-list-menu.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { Readable } from 'node:stream';

const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };

const Api = {
  messages: {
    DeleteHistory: tl('messages.DeleteHistory'),
    DeleteChatUser: tl('messages.DeleteChatUser'),
  },
  channels: {
    LeaveChannel: tl('channels.LeaveChannel'),
    DeleteHistory: tl('channels.DeleteHistory'),
  },
  InputUserSelf: tl('InputUserSelf'),
};

const setup = async (chat, { offsets = [0] } = {}) => {
  const store = createMemoryStore();
  for (const id of [1, 2, 3]) {
    await store.put({
      id: `msg:telegram:${chat}:${id}`,
      source: 'telegram',
      chat,
      chatName: 'Fake Eve',
      sender: chat,
      body: `hello ${id}`,
      timestamp: new Date(1_760_000_000_000 + id).toISOString(),
    });
  }
  await store.put({
    id: 'msg:telegram:999:1',
    source: 'telegram',
    chat: '999',
    sender: '999',
    body: 'another chat',
    timestamp: new Date(1_760_000_000_000).toISOString(),
  });
  const calls = [];
  const observed = [];
  const left = [...offsets];
  const client = {
    invoke: async (request) => {
      calls.push(request);
      if (request.className.endsWith('DeleteHistory')) {
        return {
          pts: 10 + calls.length,
          ptsCount: 1,
          offset: left.shift() ?? 0,
        };
      }
      return { className: 'Updates', updates: [], users: [], chats: [] };
    },
  };
  const env = {
    store,
    live: createTelegramLive({ store, toLinks: telegramDialogLinks }),
    importer: async () => ({
      Api,
      helpers: { returnBigInt: (v) => BigInt(v) },
    }),
    log: () => {},
    queue: { run: (_k, _p, task) => task() },
    connection: {
      open: async () => ({ client }),
      withPeer: (_client, target, use) => use({ inputPeer: target }),
    },
    peers: { input: async (target) => ({ inputPeer: target }) },
    catchUp: { observeResult: (r) => observed.push(r) },
    channels: { observe: async () => {} },
  };
  const actions = createActions(env, {
    credentials: async () => ({ kind: 'user' }),
    toLinks: telegramDialogLinks,
    writeChanged: async () => 0,
  });
  const shown = async () =>
    summarizeChats(await store.query(() => true)).map((c) => c.chat);
  return { store, calls, observed, actions, shown };
};

test('delete a personal chat: for both, asked until done; gone from the list (R-Y100)', async () => {
  const { calls, observed, actions, shown } = await setup('42', {
    offsets: [100, 0],
  });
  assert.deepEqual(await shown(), ['42', '999']);
  const answer = await actions.removeChat({
    chat: '42',
    action: 'delete',
    revoke: true,
  });
  assert.deepEqual(answer, {
    ok: true,
    chat: '42',
    action: 'delete',
    deleted: 3,
  });
  assert.equal(calls.length, 2, 'asked again while Telegram had more');
  for (const call of calls) {
    assert.equal(call.className, 'messages.DeleteHistory');
    assert.equal(call.justClear, false);
    assert.equal(call.revoke, true);
    assert.equal(call.maxId, 0);
  }
  assert.equal(observed.length, 2, 'the update counters moved');
  assert.deepEqual(await shown(), ['999']);
});

test('clear history keeps the chat on Telegram (just_clear) (R-Y100)', async () => {
  const { calls, actions } = await setup('42');
  await actions.removeChat({ chat: '42', action: 'clear' });
  assert.equal(calls[0].justClear, true);
  assert.equal(calls[0].revoke, false);
});

test('leave a basic group: left first, then its history (R-Y100)', async () => {
  const { calls, actions, shown } = await setup('-77');
  await actions.removeChat({ chat: '-77', action: 'leave', revoke: true });
  assert.deepEqual(
    calls.map((c) => c.className),
    ['messages.DeleteChatUser', 'messages.DeleteHistory']
  );
  assert.equal(calls[0].chatId, 77n);
  assert.equal(calls[0].userId.className, 'InputUserSelf');
  assert.equal(calls[1].revoke, false, 'a group is never revoked for all');
  assert.deepEqual(await shown(), ['999']);
});

test('leave a channel; clear a supergroup up to its newest message (R-Y100)', async () => {
  const left = await setup('-1005');
  await left.actions.removeChat({ chat: '-1005', action: 'leave' });
  assert.deepEqual(
    left.calls.map((c) => c.className),
    ['channels.LeaveChannel']
  );
  const cleared = await setup('-1005');
  await cleared.actions.removeChat({ chat: '-1005', action: 'clear' });
  assert.equal(cleared.calls[0].className, 'channels.DeleteHistory');
  assert.equal(cleared.calls[0].maxId, 3);
  assert.equal(cleared.calls[0].forEveryone, false);
});

test('what Telegram has not for a chat is not asked (R-Y100)', async () => {
  const { calls, actions } = await setup('42');
  assert.equal(
    (await actions.removeChat({ chat: '42', action: 'leave' })).ok,
    false
  );
  assert.equal(
    (await actions.removeChat({ chat: '-1005', action: 'delete' })).ok,
    false
  );
  assert.equal(calls.length, 0);
  assert.equal(removalAllowed('42', 'delete'), true);
  assert.equal(removalAllowed('-7', 'leave'), true);
  assert.equal(removalAllowed('-7', 'delete'), false);
  assert.equal(removalAllowed('42', 'drop'), false);
});

test('the menu: clear and delete, clear and leave, or leave (R-Y100)', () => {
  const items = (chat) =>
    chatMenuItems({ source: 'telegram', ...chat }).slice(4);
  assert.deepEqual(items({ chat: '42', kind: 'private' }), [
    'clearHistory',
    'deleteChat',
  ]);
  assert.deepEqual(items({ chat: '-77', kind: 'group' }), [
    'clearHistory',
    'leaveGroup',
  ]);
  assert.deepEqual(items({ chat: '-1005', kind: 'group' }), [
    'clearHistory',
    'leaveGroup',
  ]);
  assert.deepEqual(items({ chat: '-1005', kind: 'channel' }), ['leaveChannel']);
});

test('the route checks the chat and the action (R-Y100)', async () => {
  const calls = [];
  const account = {
    removeChat: async (body) => {
      calls.push(body);
      return { ok: true, deleted: 0 };
    },
  };
  const post = async (body) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.method = 'POST';
    req.headers = { 'content-type': 'application/json' };
    const res = {
      setHeader() {},
      writeHead(status) {
        this.status = status;
      },
      end(text) {
        this.body = text;
      },
    };
    await handleTelegramRoutes(req, res, '/api/telegram/remove-chat', {
      telegramAccount: account,
    });
    return res.status;
  };
  assert.equal(await post({ chat: '42', action: 'leave' }), 400);
  assert.equal(await post({ chat: 'x', action: 'clear' }), 400);
  assert.equal(
    await post({ chat: '42', action: 'delete', revoke: 'yes' }),
    200
  );
  assert.deepEqual(calls, [{ chat: '42', action: 'delete', revoke: false }]);
});

test('a cleared chat stays in the list, empty; delete removes it (R-Y100)', async () => {
  const { store, actions, shown } = await setup('42');
  await actions.removeChat({ chat: '42', action: 'clear' });
  assert.deepEqual(await shown(), ['42', '999'].sort(), 'kept after clear');
  const rows = summarizeChats(await store.query(() => true));
  const row = rows.find((c) => c.chat === '42');
  assert.equal(row.name, 'Fake Eve');
  assert.equal(row.count, 0);
  assert.equal(row.last.body, '');
  assert.ok(Date.parse(row.last.at) > 0, 'its time is when it was cleared');
  // A server restart or page reload reads the same stored links.
  assert.equal((await store.get('read:telegram:42')).chatName, 'Fake Eve');
  // A clear again, with no messages left, still keeps the name.
  await actions.removeChat({ chat: '42', action: 'clear' });
  const again = summarizeChats(await store.query(() => true));
  assert.equal(again.find((c) => c.chat === '42').name, 'Fake Eve');
  // A new message brings the usual row back, not a second one.
  await store.put({
    id: 'msg:telegram:42:9',
    source: 'telegram',
    chat: '42',
    sender: '42',
    chatName: 'Fake Eve',
    body: 'back',
    timestamp: new Date(1_770_000_000_000).toISOString(),
  });
  const back = summarizeChats(await store.query(() => true));
  assert.equal(back.filter((c) => c.chat === '42').length, 1);
  assert.equal(back.find((c) => c.chat === '42').last.body, 'back');
  // Delete takes the chat away for good.
  await actions.removeChat({ chat: '42', action: 'delete' });
  assert.deepEqual(await shown(), ['999']);
});

test('a group cleared stays; once left it is gone (R-Y100)', async () => {
  const { actions, shown } = await setup('-77');
  await actions.removeChat({ chat: '-77', action: 'clear' });
  assert.deepEqual(await shown(), ['-77', '999']);
  await actions.removeChat({ chat: '-77', action: 'leave' });
  assert.deepEqual(await shown(), ['999']);
});
