// The chat list's menu (R-Y97): pin, mute, archive, mark read or unread
// ask Telegram, and the list follows at once (the read link changes as
// Telegram's own update about it would change it). Fake client; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createActions } from '../src/sources/telegram-actions.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import {
  MUTE_FOREVER,
  muteUntilOf,
  peerOfChat,
} from '../src/sources/telegram-dialogs.js';
import { updateEffect } from '../src/sources/telegram-updates.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { summarizeChats } from '../src/web/chat-model.js';
import {
  chatMenuItems,
  chatMenuRequest,
  MUTE_FOR,
} from '../src/web/chat-list-menu.js';

const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };

const Api = {
  messages: {
    ToggleDialogPin: tl('messages.ToggleDialogPin'),
    MarkDialogUnread: tl('messages.MarkDialogUnread'),
    ReadHistory: tl('messages.ReadHistory'),
  },
  channels: { ReadHistory: tl('channels.ReadHistory') },
  account: { UpdateNotifySettings: tl('account.UpdateNotifySettings') },
  folders: { EditPeerFolders: tl('folders.EditPeerFolders') },
  InputPeerNotifySettings: tl('InputPeerNotifySettings'),
  InputFolderPeer: tl('InputFolderPeer'),
};

const NOW = Date.parse('2026-10-22T10:00:00Z');

const setup = async ({ reply = () => true } = {}) => {
  const store = createMemoryStore();
  const calls = [];
  const client = {
    invoke: async (request) => {
      calls.push(request);
      return reply(request);
    },
    getInputEntity: async (peer) => ({ input: peer }),
  };
  const live = createTelegramLive({ store, toLinks: telegramDialogLinks });
  const env = {
    store,
    live,
    now: () => NOW,
    importer: async () => ({ Api }),
    log: () => {},
    queue: { run: (_k, _p, task) => task() },
    connection: {
      open: async () => ({ client }),
      withPeer: (_client, chat, use) => use({ inputPeer: chat }),
    },
    peers: { input: async (chat) => ({ inputPeer: chat }) },
    catchUp: { observeResult: () => {} },
    channels: { observe: async () => {} },
  };
  const actions = createActions(env, {
    credentials: async () => ({ kind: 'user' }),
    toLinks: telegramDialogLinks,
    writeChanged: async () => 0,
  });
  const read = (chat) => store.get(`read:telegram:${chat}`);
  return { store, calls, actions, read };
};

test('peerOfChat and muteUntilOf name chats and times as Telegram does', () => {
  assert.deepEqual(peerOfChat('42'), { className: 'PeerUser', userId: '42' });
  assert.deepEqual(peerOfChat('-7'), { className: 'PeerChat', chatId: '7' });
  assert.deepEqual(peerOfChat('-1001234'), {
    className: 'PeerChannel',
    channelId: '1234',
  });
  assert.equal(muteUntilOf(3600, NOW), NOW / 1000 + 3600);
  assert.equal(muteUntilOf(0, NOW), MUTE_FOREVER);
  assert.equal(muteUntilOf(undefined, NOW), MUTE_FOREVER);
});

test('pin and unpin a chat: Telegram asked, the list moves at once (R-Y97)', async () => {
  const { calls, actions, read } = await setup();
  assert.deepEqual(await actions.dialogAction({ chat: '42', action: 'pin' }), {
    ok: true,
    chat: '42',
    action: 'pin',
  });
  assert.equal(calls[0].className, 'messages.ToggleDialogPin');
  assert.equal(calls[0].pinned, true);
  assert.deepEqual(calls[0].peer, { inputPeer: '42' });
  assert.equal((await read('42')).pinnedRank, 1);
  await actions.dialogAction({ chat: '42', action: 'unpin' });
  assert.equal(calls[1].pinned, false);
  assert.equal((await read('42')).pinnedRank, 0);
});

test('mute for a time, for good, and unmute (R-Y97)', async () => {
  const { calls, actions, read } = await setup();
  await actions.dialogAction({ chat: '-1001', action: 'mute', for: 8 * 3600 });
  assert.equal(calls[0].className, 'account.UpdateNotifySettings');
  assert.equal(calls[0].settings.muteUntil, NOW / 1000 + 8 * 3600);
  assert.equal((await read('-1001')).muteUntil, NOW / 1000 + 8 * 3600);
  await actions.dialogAction({ chat: '-1001', action: 'mute' });
  assert.equal((await read('-1001')).muteUntil, MUTE_FOREVER);
  await actions.dialogAction({ chat: '-1001', action: 'unmute' });
  assert.equal(calls[2].settings.muteUntil, 0);
  assert.equal((await read('-1001')).muteUntil, 0);
});

test('archive and unarchive: the chat changes lists, its pin goes (R-Y97)', async () => {
  const { calls, actions, read } = await setup({
    reply: (request) =>
      request.className === 'folders.EditPeerFolders'
        ? { className: 'Updates', updates: [], users: [], chats: [] }
        : true,
  });
  await actions.dialogAction({ chat: '42', action: 'pin' });
  await actions.dialogAction({ chat: '42', action: 'archive' });
  const asked = calls.at(-1);
  assert.equal(asked.className, 'folders.EditPeerFolders');
  assert.equal(asked.folderPeers[0].folderId, 1);
  assert.deepEqual(asked.folderPeers[0].peer, { inputPeer: '42' });
  assert.equal((await read('42')).folder, 1);
  assert.equal((await read('42')).pinnedRank, 0);
  await actions.dialogAction({ chat: '42', action: 'unarchive' });
  assert.equal(calls.at(-1).folderPeers[0].folderId, 0);
  assert.equal((await read('42')).folder, 0);
});

test('mark unread, then read: the mark goes and every message is read (R-Y97)', async () => {
  const { store, calls, actions, read } = await setup();
  await store.put({
    id: 'read:telegram:42',
    kind: 'read',
    source: 'telegram',
    chat: '42',
    inboxMaxId: 10,
    unreadTopId: 15,
    unreadCount: 5,
  });
  await actions.dialogAction({ chat: '42', action: 'unread' });
  assert.equal(calls[0].className, 'messages.MarkDialogUnread');
  assert.equal(calls[0].unread, true);
  assert.equal((await read('42')).unreadMark, 1);
  await actions.dialogAction({ chat: '42', action: 'read' });
  const names = calls.slice(1).map((c) => c.className);
  assert.deepEqual(names, [
    'messages.ReadHistory',
    'messages.MarkDialogUnread',
  ]);
  assert.equal(calls[1].maxId, 15);
  assert.equal(calls[2].unread, false);
  const after = await read('42');
  assert.equal(after.unreadMark, 0);
  assert.equal(after.inboxMaxId, 15);
  // Opening a marked chat only takes the mark off.
  await actions.dialogAction({ chat: '42', action: 'unread' });
  await actions.dialogAction({ chat: '42', action: 'unmark' });
  assert.equal(calls.at(-1).unread, false);
  assert.equal((await read('42')).unreadMark, 0);
});

test('a channel is read with channels.readHistory (R-Y97)', async () => {
  const { store, calls, actions } = await setup();
  await store.put({
    id: 'read:telegram:-1009',
    kind: 'read',
    source: 'telegram',
    chat: '-1009',
    inboxMaxId: 1,
    unreadTopId: 4,
  });
  await actions.dialogAction({ chat: '-1009', action: 'read' });
  assert.equal(calls[0].className, 'channels.ReadHistory');
  assert.equal(calls[0].maxId, 4);
});

test('no user session, no chat or an unknown action: nothing asked (R-Y97)', async () => {
  const { calls, actions } = await setup();
  assert.deepEqual(await actions.dialogAction({ action: 'pin' }), {
    ok: false,
    supported: false,
  });
  assert.deepEqual(await actions.dialogAction({ chat: '1', action: 'leave' }), {
    ok: false,
    supported: false,
  });
  assert.equal(calls.length, 0);
});

test('Telegram refusing (too many pinned) reaches the caller (R-Y97)', async () => {
  const { actions, read } = await setup({
    reply: () => {
      throw new Error('PINNED_DIALOGS_TOO_MUCH');
    },
  });
  await assert.rejects(
    actions.dialogAction({ chat: '42', action: 'pin' }),
    /PINNED_DIALOGS_TOO_MUCH/
  );
  assert.equal(await read('42'), null);
});

test('a mark made on another device is stored too (R-Y97)', () => {
  assert.deepEqual(
    updateEffect({
      className: 'UpdateDialogUnreadMark',
      peer: { className: 'DialogPeer', peer: { userId: 5 } },
      unread: true,
    }),
    { kind: 'listing', chat: '5', unreadMark: true }
  );
});

test('the list shows a chat marked unread (R-Y97)', () => {
  const links = [
    {
      id: 'msg:telegram:42:1',
      source: 'telegram',
      chat: '42',
      sender: '42',
      body: 'hi',
      timestamp: '2026-10-22T09:00:00Z',
    },
    {
      id: 'read:telegram:42',
      kind: 'read',
      source: 'telegram',
      chat: '42',
      unreadMark: 1,
    },
  ];
  const [chat] = summarizeChats(links);
  assert.equal(chat.marked, true);
});

test('the menu offers what Telegram does, by the chat state (R-Y97)', () => {
  const chat = { source: 'telegram', chat: '42' };
  assert.deepEqual(chatMenuItems(chat), [
    'pinChat',
    'mute',
    'markUnread',
    'archive',
    'clearHistory',
    'deleteChat',
  ]);
  assert.deepEqual(
    chatMenuItems({
      ...chat,
      pinned: 1,
      muted: true,
      unread: 3,
      archived: true,
    }),
    [
      'unpinChat',
      'unmute',
      'markRead',
      'unarchive',
      'clearHistory',
      'deleteChat',
    ]
  );
  assert.deepEqual(chatMenuItems({ ...chat, marked: true })[2], 'markRead');
  assert.deepEqual(chatMenuItems({ source: 'email', chat: 'x' }), []);
  assert.deepEqual(chatMenuItems(chat, { telegramUser: false }), []);
  assert.deepEqual(chatMenuRequest('mute8h', chat), {
    chat: '42',
    action: 'mute',
    for: 8 * 3600,
  });
  assert.deepEqual(chatMenuRequest('muteForever', chat), {
    chat: '42',
    action: 'mute',
    for: 0,
  });
  assert.deepEqual(chatMenuRequest('markRead', chat), {
    chat: '42',
    action: 'read',
    for: 0,
  });
  assert.equal(chatMenuRequest('mute', chat), null);
  assert.deepEqual(Object.keys(MUTE_FOR), [
    'mute1h',
    'mute8h',
    'mute2d',
    'muteForever',
  ]);
});
