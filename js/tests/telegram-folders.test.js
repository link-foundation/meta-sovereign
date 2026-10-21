// Chat folders (R-Y103): Telegram's folders read as plain data, and the
// chat list's chats sorted into them as Telegram's apps do — by name
// first (never, then always), then by kind, muted, read and archived.
// Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  createFolders,
  folderOf,
  peerChat,
} from '../src/sources/telegram-folders.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import {
  chatsInFolder,
  folderMatcher,
  folderTabs,
  isFolderFilter,
  peopleOf,
  unreadChats,
} from '../src/web/chat-folders.js';

const peer = (className, fields) => ({ className, ...fields });
const user = (userId) => peer('InputPeerUser', { userId });
const channel = (channelId) => peer('InputPeerChannel', { channelId });

test("Telegram's peers as our chat ids (R-Y103)", () => {
  assert.equal(peerChat(user(42)), '42');
  assert.equal(peerChat(peer('InputPeerChat', { chatId: 7 })), '-7');
  assert.equal(peerChat(channel(1234)), '-1001234');
  assert.equal(peerChat(peer('InputPeerSelf', {}), 99), '99');
  assert.equal(peerChat(peer('InputPeerSelf', {})), null);
  assert.equal(peerChat(peer('InputPeerEmpty', {})), null);
});

const work = {
  className: 'DialogFilter',
  id: 3,
  title: { text: 'Work', entities: [] },
  emoticon: '💼',
  groups: true,
  excludeMuted: true,
  includePeers: [user(42)],
  excludePeers: [channel(9)],
  pinnedPeers: [user(43)],
};

test('a folder, "All chats" and a shared folder, as the page takes them (R-Y103)', () => {
  assert.deepEqual(folderOf(work), {
    id: 3,
    title: 'Work',
    emoticon: '💼',
    include: ['42'],
    pinned: ['43'],
    contacts: false,
    nonContacts: false,
    groups: true,
    broadcasts: false,
    bots: false,
    excludeMuted: true,
    excludeRead: false,
    excludeArchived: false,
    exclude: ['-1009'],
  });
  assert.deepEqual(folderOf({ className: 'DialogFilterDefault' }), {
    id: 0,
    all: true,
  });
  const shared = folderOf({
    className: 'DialogFilterChatlist',
    id: 5,
    title: 'News',
    includePeers: [channel(1)],
    pinnedPeers: [],
  });
  assert.equal(shared.chatlist, true);
  assert.deepEqual(shared.include, ['-1001']);
  assert.equal(folderOf({ className: 'Something' }), null);
});

test('the folders asked once a minute; self asked only when named (R-Y103)', async () => {
  let asked = 0;
  let me = 0;
  let clock = 0;
  const answers = [
    { filters: [{ className: 'DialogFilterDefault' }, work] },
    [{ ...work, includePeers: [peer('InputPeerSelf', {})] }],
  ];
  const client = {
    invoke: async (request) => {
      assert.equal(request.className, 'GetDialogFilters');
      asked += 1;
      return answers[asked - 1];
    },
    getMe: async () => {
      me += 1;
      return { id: 77 };
    },
  };
  const { folderList } = createFolders(
    {
      importer: async () => ({
        Api: {
          messages: {
            GetDialogFilters: class {
              className = 'GetDialogFilters';
            },
          },
        },
      }),
    },
    { userClient: async () => client },
    { now: () => clock }
  );
  const first = await folderList();
  assert.deepEqual(
    first.folders.map((f) => f.id),
    [0, 3]
  );
  await folderList();
  assert.equal(asked, 1, 'kept');
  assert.equal(me, 0);
  clock += 61_000;
  const second = await folderList();
  assert.equal(asked, 2);
  assert.deepEqual(second.folders[0].include, ['77'], 'an older layer');
  assert.equal(me, 1);
  const none = createFolders({}, { userClient: async () => null });
  assert.deepEqual(await none.folderList(), { ok: false, supported: false });
});

const chat = (id, extra = {}) => ({
  key: `telegram:${id}`,
  source: 'telegram',
  chat: String(id),
  kind: 'private',
  unread: 0,
  ...extra,
});

const people = peopleOf([
  { id: 'person:telegram:1', contact: true },
  { id: 'person:telegram:2' },
  { id: 'person:telegram:3', bot: true },
]);

test("who is in a folder, as Telegram's apps decide (R-Y103)", () => {
  const folder = {
    id: 1,
    contacts: true,
    groups: true,
    excludeMuted: true,
    excludeRead: true,
    excludeArchived: true,
    include: ['50'],
    exclude: ['-60'],
    pinned: ['-70'],
  };
  const inside = folderMatcher(folder, people);
  const cases = [
    [chat(1, { unread: 2 }), true, 'a contact with unread'],
    [chat(1), false, 'read'],
    [chat(1, { marked: true }), true, 'marked unread'],
    [chat(2, { unread: 1 }), false, 'not a contact'],
    [chat(3, { unread: 1 }), false, 'a bot'],
    [chat(-10, { kind: 'group', unread: 1 }), true, 'a group'],
    [chat(-11, { kind: 'group', unread: 1, muted: true }), false, 'muted'],
    [chat(-12, { kind: 'group', unread: 1, archived: true }), false, 'arch'],
    [chat(-100, { kind: 'channel', unread: 1 }), false, 'a channel'],
    [chat(50, { muted: true }), true, 'by name, whatever else'],
    [chat(-60, { kind: 'group', unread: 1 }), false, 'never'],
    [chat(-70, { kind: 'channel' }), true, 'pinned in it'],
    [{ ...chat(1, { unread: 1 }), source: 'whatsapp' }, false, 'not telegram'],
  ];
  for (const [c, want, what] of cases) {
    assert.equal(inside(c), want, what);
  }
  const shared = folderMatcher(
    { id: 2, chatlist: true, include: ['5'], groups: true },
    people
  );
  assert.equal(shared(chat(5)), true);
  assert.equal(shared(chat(-1, { kind: 'group' })), false, 'by name only');
});

test("a folder's own pins come first; tabs in Telegram's order (R-Y103)", () => {
  const folder = {
    id: 4,
    title: 'Friends',
    contacts: true,
    nonContacts: true,
    include: [],
    exclude: [],
    pinned: ['2'],
  };
  const all = [
    chat(1, { pinned: 1, unread: 3 }),
    chat(2, { unread: 1, muted: true }),
  ];
  assert.deepEqual(
    chatsInFolder(all, folder, people).map((c) => [c.chat, c.pinned]),
    [
      ['1', 0],
      ['2', 1],
    ]
  );
  assert.equal(unreadChats(chatsInFolder(all, folder, people)), 1);
  const fallback = [{ key: 'all' }];
  assert.equal(folderTabs([], { all, people, fallback }), fallback);
  assert.equal(
    folderTabs([{ id: 0, all: true }], { all, people, fallback }),
    fallback
  );
  assert.deepEqual(
    folderTabs([folder, { id: 0, all: true }], { all, people, fallback }),
    [
      { key: 'folder:4', title: 'Friends', unread: 1 },
      { key: 'all', label: 'chat.folder.all', unread: 0 },
    ]
  );
  assert.equal(
    folderTabs([folder], { all, people, fallback })[0].key,
    'all',
    '"All chats" first when Telegram does not place it'
  );
  assert.equal(isFolderFilter('folder:4'), true);
  assert.equal(isFolderFilter('group'), false);
});

test('the folders route (R-Y103)', async () => {
  const req = Readable.from([Buffer.from('{}')]);
  req.method = 'POST';
  req.url = '/api/telegram/folders';
  req.headers = { 'content-type': 'application/json', host: '127.0.0.1:8787' };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = text;
    },
  };
  await handleTelegramRoutes(req, res, '/api/telegram/folders', {
    telegramAccount: {
      folderList: async ({ fresh }) => ({ ok: true, folders: [], fresh }),
    },
    allowOrigins: [],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), {
    ok: true,
    folders: [],
    fresh: false,
  });
});
