// Tests for the editMessage and react actions added to createActions
// (R-Y36). These avoid a live GramJS connection by using minimal mocks.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createActions } from '../src/sources/telegram-actions.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';

const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };

const fakeTelegram = () => ({
  Api: {
    messages: {
      EditMessage: tl('messages.EditMessage'),
      SendReaction: tl('messages.SendReaction'),
      DeleteMessages: tl('messages.DeleteMessages'),
      ForwardMessages: tl('messages.ForwardMessages'),
    },
    channels: {
      EditMessage: tl('channels.EditMessage'),
      DeleteMessages: tl('channels.DeleteMessages'),
    },
    ReactionEmoji: tl('ReactionEmoji'),
    UpdateDeleteChannelMessages: tl('UpdateDeleteChannelMessages'),
  },
  helpers: {
    returnBigInt: (v) => `big:${v}`,
    generateRandomBigInt: () => BigInt(Date.now()),
  },
});

const importer = async () => fakeTelegram();

// Build a minimal env with a fake client that records invocations.
const envWith = (store, client) => {
  const live = createTelegramLive({ store, toLinks: telegramDialogLinks });
  return {
    store,
    importer,
    live,
    log: () => {},
    queue: { run: (_key, _priority, task) => task() },
    connection: {
      open: async () => ({ client }),
      withPeer: (_client, chat, use) => use(`peer:${chat}`),
    },
    peers: {
      input: async (chat) => `peer:${chat}`,
      dialog: async (chat) => ({ id: chat, isGroup: true }),
    },
    catchUp: { observeResult: () => {}, observeChannel: () => {} },
    channels: { observe: async () => {} },
  };
};

// A tools object whose credentials() returns a user credential.
const userTools = () => ({
  credentials: async () => ({ kind: 'user' }),
  toLinks: telegramDialogLinks,
  writeChanged: async (s, links) => {
    for (const link of links) {
      await s.put(link);
    }
    return links.length;
  },
});

// A tools object with no stored credential (no client).
const noTools = () => ({
  credentials: async () => null,
  toLinks: telegramDialogLinks,
  writeChanged: async () => 0,
});

test('createActions returns editMessage and react alongside existing keys', () => {
  const store = createMemoryStore();
  const env = envWith(store, null);
  const actions = createActions(env, noTools());
  assert.ok(
    typeof actions.editMessage === 'function',
    'editMessage is a function'
  );
  assert.ok(typeof actions.react === 'function', 'react is a function');
  assert.ok(
    typeof actions.refreshMessages === 'function',
    'refreshMessages present'
  );
  assert.ok(
    typeof actions.forwardMessages === 'function',
    'forwardMessages present'
  );
  assert.ok(
    typeof actions.deleteMessages === 'function',
    'deleteMessages present'
  );
  assert.ok(typeof actions.media === 'function', 'media present');
});

test('editMessage returns { ok: false, supported: false } with no credentials', async () => {
  const store = createMemoryStore();
  const env = envWith(store, null);
  const { editMessage } = createActions(env, noTools());
  const result = await editMessage({ chat: '123', id: 42, text: 'hi' });
  assert.deepStrictEqual(result, { ok: false, supported: false });
});

test('editMessage returns { ok: false, supported: false } with no chat or id', async () => {
  const store = createMemoryStore();
  const client = { invoke: async () => ({}) };
  const env = envWith(store, client);
  const { editMessage } = createActions(env, userTools());
  // No chat and no id → wanted is empty → no client
  const result = await editMessage({});
  assert.deepStrictEqual(result, { ok: false, supported: false });
});

test('react returns { ok: false, supported: false } with no credentials', async () => {
  const store = createMemoryStore();
  const env = envWith(store, null);
  const { react } = createActions(env, noTools());
  const result = await react({ chat: '123', id: 42, emoji: '👍' });
  assert.deepStrictEqual(result, { ok: false, supported: false });
});

test('react returns { ok: false, supported: false } with no chat or id', async () => {
  const store = createMemoryStore();
  const client = { invoke: async () => ({}) };
  const env = envWith(store, client);
  const { react } = createActions(env, userTools());
  // No chat and no id → msgId is NaN/0 → no client
  const result = await react({});
  assert.deepStrictEqual(result, { ok: false, supported: false });
});

test('editMessage invokes messages.EditMessage for a plain chat', async () => {
  const invocations = [];
  const client = {
    invoke: async (req) => {
      invocations.push(req);
      return {};
    },
  };
  const store = createMemoryStore();
  const env = envWith(store, client);
  const { editMessage } = createActions(env, userTools());
  const result = await editMessage({ chat: '999', id: '7', text: 'updated' });
  assert.deepStrictEqual(result, { ok: true, edited: 7 });
  assert.strictEqual(invocations.length, 1);
  assert.strictEqual(invocations[0].className, 'messages.EditMessage');
  assert.strictEqual(invocations[0].id, 7);
  assert.strictEqual(invocations[0].message, 'updated');
});

test('editMessage invokes channels.EditMessage for a channel chat', async () => {
  const invocations = [];
  const client = {
    invoke: async (req) => {
      invocations.push(req);
      return {};
    },
  };
  const store = createMemoryStore();
  const env = envWith(store, client);
  const { editMessage } = createActions(env, userTools());
  const result = await editMessage({
    chat: '-1001234567890',
    id: 5,
    text: 'channel edit',
  });
  assert.deepStrictEqual(result, { ok: true, edited: 5 });
  assert.strictEqual(invocations.length, 1);
  assert.strictEqual(invocations[0].className, 'channels.EditMessage');
});

test('react invokes messages.SendReaction with emoji', async () => {
  const invocations = [];
  const client = {
    invoke: async (req) => {
      invocations.push(req);
      return {};
    },
  };
  const store = createMemoryStore();
  const env = envWith(store, client);
  const { react } = createActions(env, userTools());
  const result = await react({ chat: '999', id: 3, emoji: '❤️' });
  assert.deepStrictEqual(result, { ok: true, reacted: 3 });
  assert.strictEqual(invocations.length, 1);
  assert.strictEqual(invocations[0].className, 'messages.SendReaction');
  assert.strictEqual(invocations[0].msgId, 3);
  assert.strictEqual(invocations[0].reaction.length, 1);
  assert.strictEqual(invocations[0].reaction[0].emoticon, '❤️');
});

test('react invokes messages.SendReaction with empty reaction to remove', async () => {
  const invocations = [];
  const client = {
    invoke: async (req) => {
      invocations.push(req);
      return {};
    },
  };
  const store = createMemoryStore();
  const env = envWith(store, client);
  const { react } = createActions(env, userTools());
  // No emoji → remove reaction
  const result = await react({ chat: '999', id: 3 });
  assert.deepStrictEqual(result, { ok: true, reacted: 3 });
  assert.strictEqual(invocations[0].reaction.length, 0);
});

test('editMessage resolves id from link.id', async () => {
  const invocations = [];
  const client = {
    invoke: async (req) => {
      invocations.push(req);
      return {};
    },
  };
  const store = createMemoryStore();
  const env = envWith(store, client);
  const { editMessage } = createActions(env, userTools());
  const link = { id: 'msg:telegram:999:12', chat: '999' };
  const result = await editMessage({ text: 'from link', link });
  assert.deepStrictEqual(result, { ok: true, edited: 12 });
});

test('react resolves id from link.id', async () => {
  const invocations = [];
  const client = {
    invoke: async (req) => {
      invocations.push(req);
      return {};
    },
  };
  const store = createMemoryStore();
  const env = envWith(store, client);
  const { react } = createActions(env, userTools());
  const link = { id: 'msg:telegram:888:99', chat: '888' };
  const result = await react({ emoji: '🔥', link });
  assert.deepStrictEqual(result, { ok: true, reacted: 99 });
});
