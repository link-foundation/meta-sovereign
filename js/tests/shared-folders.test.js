// Live folders, dragging them and shared folders, chat lists (R-Y172):
// Telegram's folder updates as effects and one live link, the chatlists.*
// calls made for the page (links, a preview that joins nothing, joining,
// leaving), a shared folder written as a DialogFilterChatlist, the routes'
// strict validation and the page's pure helpers. Fake clients; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { updateEffect } from '../src/sources/telegram-updates.js';
import {
  FOLDERS_LIVE_ID,
  createTelegramLive,
} from '../src/sources/telegram-account-live.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { isStreamedId } from '../src/server/routes-events.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createChatlists,
  slugOfUrl,
} from '../src/sources/telegram-chatlists.js';
import {
  createFolderEdit,
  validFolder,
} from '../src/sources/telegram-folder-edit.js';
import { folderOf } from '../src/sources/telegram-folders.js';
import { postRoute } from './helpers/post-route.js';
import { named, telegramError } from './helpers/telegram-fakes.mjs';
import {
  addlistSlugOf,
  draftOf,
  draftProblem,
  eligibleChats,
  movedTo,
  requestOf,
  shareProblem,
} from '../src/web/chat-folder-model.js';
import { dropIndex } from '../src/web/chat-pin-drag.js';
import {
  FOLDERS_LIVE_ID as PAGE_LIVE_ID,
  watchFolders,
} from '../src/web/chat-folder-live.js';

// ---- Live folders ---------------------------------------------------------

test('the three folder updates become one effect each (R-Y172)', () => {
  assert.deepEqual(updateEffect({ className: 'UpdateDialogFilter', id: 4 }), {
    kind: 'folders-live',
    change: 'filter',
    id: 4,
  });
  assert.deepEqual(updateEffect({ className: 'UpdateDialogFilters' }), {
    kind: 'folders-live',
    change: 'all',
    id: 0,
  });
  assert.deepEqual(
    updateEffect({ className: 'UpdateDialogFilterOrder', order: [3n, 2n] }),
    { kind: 'folders-live', change: 'order', id: 0, order: [3, 2] }
  );
});

test('the live writer bumps one link for every folder change (R-Y172)', async () => {
  const store = createMemoryStore();
  const live = createTelegramLive({
    store,
    toLinks: telegramDialogLinks,
    now: () => 1_760_000_000_000,
  });
  await live.handle({}, { className: 'UpdateDialogFilters' });
  assert.equal((await store.get(FOLDERS_LIVE_ID)).rev, 1);
  await live.handle({}, { className: 'UpdateDialogFilterOrder', order: [2] });
  const link = await store.get('folders-live:telegram');
  assert.equal(link.rev, 2);
  assert.equal(link.change, 'order');
  assert.equal(link.kind, 'folders-live');
  assert.equal(PAGE_LIVE_ID, FOLDERS_LIVE_ID);
  assert.equal(isStreamedId(FOLDERS_LIVE_ID), true, 'the stream carries it');
});

test('the page hears of changes through one shared stream (R-Y172)', async () => {
  let opened = 0;
  let closed = 0;
  let emit = () => {};
  let state = () => {};
  const api = {
    events: async (onEvent, onState) => {
      opened += 1;
      emit = onEvent;
      state = onState;
      return () => {
        closed += 1;
      };
    },
  };
  const heard = [];
  const stopA = watchFolders(api, () => heard.push('a'));
  const stopB = watchFolders(api, () => heard.push('b'));
  await Promise.resolve();
  assert.equal(opened, 1, 'one stream for both');
  emit({ type: 'put', link: { id: 'msg:telegram:1:1' } });
  assert.deepEqual(heard, [], 'other links are not folders');
  emit({ type: 'put', link: { id: PAGE_LIVE_ID, rev: 1 } });
  assert.deepEqual(heard, ['a', 'b']);
  state('open');
  state('closed');
  state('open');
  assert.equal(heard.length, 4, 'what a lost stream missed is asked again');
  stopA();
  assert.equal(closed, 0);
  stopB();
  await Promise.resolve();
  assert.equal(closed, 1, 'closed with the last');
  assert.doesNotThrow(() => watchFolders({}, () => {})());
});

// ---- chatlists.* ------------------------------------------------------------

const Api = {
  InputChatlistDialogFilter: named('InputChatlistDialogFilter'),
  InputPeerChannel: named('InputPeerChannel'),
  InputPeerChat: named('InputPeerChat'),
  InputPeerUser: named('InputPeerUser'),
  DialogFilterChatlist: named('DialogFilterChatlist'),
  DialogFilter: named('DialogFilter'),
  TextWithEntities: named('TextWithEntities'),
  messages: {
    GetDialogFilters: named('GetDialogFilters'),
    UpdateDialogFilter: named('UpdateDialogFilter'),
  },
  chatlists: Object.fromEntries(
    [
      'ExportChatlistInvite',
      'GetExportedInvites',
      'EditExportedInvite',
      'DeleteExportedInvite',
      'CheckChatlistInvite',
      'JoinChatlistInvite',
      'JoinChatlistUpdates',
      'GetLeaveChatlistSuggestions',
      'LeaveChatlist',
    ].map((name) => [name, named(name)])
  ),
};

const channel = (id, title, extra = {}) => ({
  className: 'Channel',
  id: BigInt(id),
  accessHash: BigInt(id) * 7n,
  title,
  ...extra,
});
const peer = (id) => ({ className: 'PeerChannel', channelId: BigInt(id) });

const make = (answers = {}) => {
  const log = [];
  const applied = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const answer = answers[request.className];
      if (answer instanceof Error) {
        throw answer;
      }
      return typeof answer === 'function' ? answer(request) : (answer ?? true);
    },
  };
  const actions = createChatlists(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: {
        withPeer: async (_c, chat, use) => use({ resolved: chat }),
      },
    },
    {
      userClient: async () => client,
      apply: async (_client, result) => applied.push(result),
    }
  );
  return { actions, log, applied };
};

const exported = {
  className: 'chatlists.ExportedChatlistInvite',
  invite: {
    title: 'Friends',
    url: 'https://t.me/addlist/AbCdEfGh1234',
    peers: [peer(333), peer(444)],
  },
};

test("a folder's links are listed with the chats they carry (R-Y172)", async () => {
  const { actions, log } = make({
    GetExportedInvites: {
      invites: [exported.invite],
      chats: [channel(333, 'Fake Team'), channel(444, 'Fake Club')],
      users: [],
    },
  });
  const answer = await actions.chatlistInvites({ id: 2 });
  assert.equal(log[0].chatlist.className, 'InputChatlistDialogFilter');
  assert.equal(log[0].chatlist.filterId, 2);
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.invites, [
    {
      slug: 'AbCdEfGh1234',
      title: 'Friends',
      url: 'https://t.me/addlist/AbCdEfGh1234',
      chats: ['-100333', '-100444'],
    },
  ]);
  assert.deepEqual(answer.chats, [
    { chat: '-100333', name: 'Fake Team' },
    { chat: '-100444', name: 'Fake Club' },
  ]);
  assert.equal(slugOfUrl('https://t.me/addlist/Zz_-1234/'), 'Zz_-1234');
});

test('a link is made, edited and deleted for chosen chats (R-Y172)', async () => {
  const { actions, log } = make({
    ExportChatlistInvite: exported,
    EditExportedInvite: exported.invite,
  });
  const made = await actions.chatlistExport({
    id: 2,
    title: 'Friends',
    chats: ['-100333', '-100444'],
  });
  assert.equal(made.ok, true);
  assert.equal(made.invite.slug, 'AbCdEfGh1234');
  assert.equal(log[0].className, 'ExportChatlistInvite');
  assert.equal(log[0].title, 'Friends');
  assert.deepEqual(log[0].peers, [
    { resolved: '-100333' },
    { resolved: '-100444' },
  ]);

  await actions.chatlistInviteEdit({
    id: 2,
    slug: 'AbCdEfGh1234',
    title: 'Team',
  });
  assert.equal(log[1].className, 'EditExportedInvite');
  assert.equal(log[1].slug, 'AbCdEfGh1234');
  assert.equal(log[1].title, 'Team');
  assert.equal('peers' in log[1], false, 'only what changed is sent');
  await actions.chatlistInviteEdit({
    id: 2,
    slug: 'AbCdEfGh1234',
    chats: ['-100333'],
  });
  assert.deepEqual(log[2].peers, [{ resolved: '-100333' }]);
  assert.equal('title' in log[2], false);

  assert.deepEqual(
    await actions.chatlistInviteDelete({ id: 2, slug: 'AbCdEfGh1234' }),
    { ok: true }
  );
  assert.equal(log[3].className, 'DeleteExportedInvite');
  assert.equal(log[3].slug, 'AbCdEfGh1234');
});

test("Telegram's refusals become codes (R-Y172)", async () => {
  const cases = [
    ['ExportChatlistInvite', 'INVITES_TOO_MUCH', 'too-many-links'],
    ['ExportChatlistInvite', 'CHATLISTS_TOO_MUCH', 'too-many-shared'],
    ['ExportChatlistInvite', 'CHATLIST_EXCLUDE_INVALID', 'bad-chats'],
    ['ExportChatlistInvite', 'FILTER_INCLUDE_EMPTY', 'include-empty'],
    ['JoinChatlistInvite', 'INVITE_SLUG_EXPIRED', 'invite-expired'],
    ['JoinChatlistInvite', 'USER_CHANNELS_TOO_MUCH', 'too-many-chats'],
  ];
  for (const [request, code, expected] of cases) {
    const { actions } = make({
      CheckChatlistInvite: {
        className: 'chatlists.ChatlistInvite',
        title: { text: 'X' },
        peers: [peer(901)],
        chats: [channel(901, 'One')],
      },
      [request]: telegramError(code),
    });
    const answer = request.startsWith('Join')
      ? await actions.chatlistJoin({ slug: 'SlugSlug12', chats: ['-100901'] })
      : await actions.chatlistExport({ id: 2, chats: ['-100333'] });
    assert.equal(answer.ok, false);
    assert.equal(answer.code, expected, code);
  }
});

const newInvite = {
  className: 'chatlists.ChatlistInvite',
  title: { text: 'Team Hub' },
  emoticon: '💼',
  peers: [peer(901), peer(902)],
  chats: [
    channel(901, 'Hub One', { broadcast: true }),
    channel(902, 'Hub Two'),
  ],
  users: [],
};

test('a link is looked at without joining anything (R-Y172)', async () => {
  const { actions, log } = make({ CheckChatlistInvite: newInvite });
  const answer = await actions.chatlistCheck({ slug: 'SlugSlug12' });
  assert.deepEqual(answer, {
    ok: true,
    already: false,
    title: 'Team Hub',
    emoticon: '💼',
    chats: [
      { chat: '-100901', name: 'Hub One', kind: 'channel', joined: false },
      { chat: '-100902', name: 'Hub Two', kind: 'group', joined: false },
    ],
  });
  assert.deepEqual(
    log.map((r) => r.className),
    ['CheckChatlistInvite'],
    'only a look'
  );
  assert.equal(log[0].slug, 'SlugSlug12');
});

test('joining takes only chats the link names, as input peers (R-Y172)', async () => {
  const { actions, log, applied } = make({
    CheckChatlistInvite: newInvite,
    JoinChatlistInvite: { className: 'Updates' },
  });
  await actions.chatlistCheck({ slug: 'SlugSlug12' });
  const refused = await actions.chatlistJoin({
    slug: 'SlugSlug12',
    chats: ['-100555'],
  });
  assert.equal(refused.ok, false);
  assert.equal(log.length, 1, 'a chat the link does not name is not joined');
  const joined = await actions.chatlistJoin({
    slug: 'SlugSlug12',
    chats: ['-100901'],
  });
  assert.deepEqual(joined, { ok: true });
  const sent = log.at(-1);
  assert.equal(sent.className, 'JoinChatlistInvite');
  assert.equal(sent.slug, 'SlugSlug12');
  assert.equal(sent.peers.length, 1);
  assert.equal(sent.peers[0].className, 'InputPeerChannel');
  assert.equal(sent.peers[0].channelId, 901n);
  assert.equal(sent.peers[0].accessHash, 901n * 7n);
  assert.equal(applied.length, 1, 'the answer goes through the live handler');
});

test('a folder the user has joins its new chats with joinChatlistUpdates (R-Y172)', async () => {
  const { actions, log } = make({
    CheckChatlistInvite: {
      className: 'chatlists.ChatlistInviteAlready',
      filterId: 7,
      missingPeers: [peer(903)],
      alreadyPeers: [peer(333)],
      chats: [channel(903, 'Hub New'), channel(333, 'Fake Team')],
      users: [],
    },
    JoinChatlistUpdates: { className: 'Updates' },
  });
  const checked = await actions.chatlistCheck({ slug: 'AlreadySlug1' });
  assert.equal(checked.already, true);
  assert.equal(checked.folderId, 7);
  assert.deepEqual(
    checked.chats.map((c) => [c.chat, c.joined]),
    [
      ['-100903', false],
      ['-100333', true],
    ]
  );
  await actions.chatlistJoin({ slug: 'AlreadySlug1', chats: ['-100903'] });
  const sent = log.at(-1);
  assert.equal(sent.className, 'JoinChatlistUpdates');
  assert.equal(sent.chatlist.filterId, 7);
  assert.equal(sent.peers[0].channelId, 903n);
});

test('leaving: the chats suggested, then the folder with the chosen ones (R-Y172)', async () => {
  const { actions, log, applied } = make({
    GetLeaveChatlistSuggestions: [peer(333)],
    LeaveChatlist: { className: 'Updates' },
  });
  assert.deepEqual(await actions.chatlistLeaveSuggestions({ id: 2 }), {
    ok: true,
    chats: ['-100333'],
  });
  assert.deepEqual(await actions.chatlistLeave({ id: 2, chats: ['-100333'] }), {
    ok: true,
  });
  const sent = log.at(-1);
  assert.equal(sent.className, 'LeaveChatlist');
  assert.equal(sent.chatlist.filterId, 2);
  assert.deepEqual(sent.peers, [{ resolved: '-100333' }]);
  assert.equal(applied.length, 1);
  await actions.chatlistLeave({ id: 2, chats: [] });
  assert.deepEqual(log.at(-1).peers, [], 'leaving with no other chat is fine');
});

test('bad requests never reach the account (R-Y172)', async () => {
  const { actions, log } = make();
  for (const bad of [
    () => actions.chatlistInvites({ id: 1 }),
    () => actions.chatlistInvites({}),
    () => actions.chatlistExport({ id: 2, chats: [] }),
    () => actions.chatlistExport({ id: 2, chats: ['111'] }),
    () => actions.chatlistExport({ id: 2, chats: ['-1', '-1'] }),
    () =>
      actions.chatlistExport({ id: 2, title: 'x'.repeat(33), chats: ['-1'] }),
    () => actions.chatlistInviteEdit({ id: 2, slug: 'AbCdEfGh1234' }),
    () => actions.chatlistInviteEdit({ id: 2, slug: 'short', title: 'x' }),
    () => actions.chatlistInviteDelete({ id: 2, slug: '../etc/passwd' }),
    () => actions.chatlistCheck({ slug: 'a b' }),
    () => actions.chatlistJoin({ slug: 'SlugSlug12', chats: [] }),
    () => actions.chatlistLeave({ id: 2, chats: ['abc'] }),
  ]) {
    assert.equal((await bad()).ok, false);
  }
  assert.equal(log.length, 0);
});

// ---- Routes ----------------------------------------------------------------

test('the routes validate strictly before the account is asked (R-Y172)', async () => {
  const seen = [];
  const record = (name) => async (args) => {
    seen.push([name, args]);
    return { ok: true };
  };
  const account = Object.fromEntries(
    [
      'chatlistInvites',
      'chatlistExport',
      'chatlistInviteEdit',
      'chatlistInviteDelete',
      'chatlistCheck',
      'chatlistJoin',
      'chatlistLeaveSuggestions',
      'chatlistLeave',
    ].map((name) => [name, record(name)])
  );
  const slug = 'AbCdEfGh1234';
  const good = [
    ['chatlist-invites', { id: 2 }],
    ['chatlist-export', { id: 2, title: 'Friends', chats: ['-100333'] }],
    ['chatlist-invite-edit', { id: 2, slug, title: 'Team' }],
    ['chatlist-invite-delete', { id: 2, slug }],
    ['chatlist-check', { slug }],
    ['chatlist-join', { slug, chats: ['-100901'] }],
    ['chatlist-leave-suggestions', { id: 2 }],
    ['chatlist-leave', { id: 2, chats: [] }],
  ];
  for (const [route, body] of good) {
    assert.equal(await postRoute(route, body, account), 200, route);
  }
  assert.equal(seen.length, good.length);
  const bad = [
    ['chatlist-invites', { id: '2' }],
    ['chatlist-invites', { id: 0 }],
    ['chatlist-export', { id: 2, chats: [] }],
    ['chatlist-export', { id: 2, chats: ['5'] }],
    ['chatlist-invite-edit', { id: 2, slug }],
    ['chatlist-invite-delete', { id: 2, slug: 'x' }],
    ['chatlist-check', {}],
    ['chatlist-join', { slug, chats: [] }],
    ['chatlist-leave', { id: 2 }],
  ];
  for (const [route, body] of bad) {
    assert.equal(await postRoute(route, body, account), 400, route);
  }
  assert.equal(seen.length, good.length, 'nothing bad got through');
});

// ---- A shared folder is edited as a DialogFilterChatlist --------------------

test('a shared folder is sent as a DialogFilterChatlist, chats only (R-Y172)', async () => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      return true;
    },
  };
  const edit = createFolderEdit(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: {
        withPeer: async (_c, chat, use) => use({ resolved: chat }),
      },
    },
    { userClient: async () => client }
  );
  const folder = {
    title: 'Shared',
    emoticon: '📁',
    chatlist: true,
    hasMyInvites: true,
    include: ['-100333'],
    pinned: ['-100333'],
  };
  assert.deepEqual(await edit.folderSave({ id: 4, folder }), {
    ok: true,
    id: 4,
  });
  const filter = log[0].filter;
  assert.equal(filter.className, 'DialogFilterChatlist');
  assert.equal(filter.hasMyInvites, true);
  assert.equal(filter.title.text, 'Shared');
  assert.deepEqual(filter.includePeers, [{ resolved: '-100333' }]);
  assert.equal('excludePeers' in filter, false);
  assert.equal('groups' in filter, false);

  assert.equal(validFolder({ ...folder, groups: true }), false);
  assert.equal(validFolder({ ...folder, exclude: ['-5'] }), false);
  assert.equal(validFolder({ ...folder, chatlist: 'yes' }), false);
  assert.equal(validFolder(folder), true);
});

test("Telegram's shared folder is the page's, with hasMyInvites (R-Y172)", () => {
  const folder = folderOf({
    className: 'DialogFilterChatlist',
    id: 4,
    title: { text: 'Shared' },
    hasMyInvites: true,
    includePeers: [{ className: 'InputPeerChannel', channelId: 333n }],
    pinnedPeers: [],
  });
  assert.equal(folder.chatlist, true);
  assert.equal(folder.hasMyInvites, true);
  assert.deepEqual(folder.include, ['-100333']);
  assert.deepEqual(folder.exclude, []);
});

// ---- The page's helpers -------------------------------------------------------

test("a shared folder's draft asks for chats only and is sent so (R-Y172)", () => {
  const draft = draftOf({
    id: 4,
    title: 'Shared',
    chatlist: true,
    hasMyInvites: true,
    groups: true,
    include: [],
  });
  assert.equal(draftProblem(draft), 'include-empty', 'a kind is no chat');
  const ready = { ...draft, include: ['-100333'], exclude: ['-5'] };
  assert.equal(draftProblem(ready), null);
  const { folder } = requestOf(ready);
  assert.equal(folder.chatlist, true);
  assert.equal(folder.hasMyInvites, true);
  assert.equal(folder.groups, false);
  assert.deepEqual(folder.exclude, []);
  assert.equal('chatlist' in requestOf(draftOf(null)).folder, false);
});

test('what a folder can share, and with which chats (R-Y172)', () => {
  const folder = { include: ['111', '-100333', '-5'], exclude: [] };
  const chats = [{ chat: '-100333', name: 'Fake Team' }];
  assert.deepEqual(eligibleChats(folder, chats), [
    { chat: '-100333', name: 'Fake Team' },
    { chat: '-5', name: '-5' },
  ]);
  assert.equal(shareProblem(folder), null);
  assert.equal(shareProblem({ ...folder, groups: true }), 'kinds');
  assert.equal(shareProblem({ ...folder, excludeMuted: true }), 'kinds');
  assert.equal(shareProblem({ ...folder, exclude: ['-9'] }), 'excluded');
  assert.equal(shareProblem({ include: ['111'], exclude: [] }), 'no-chats');
});

test('links to a shared folder are told from others (R-Y172)', () => {
  assert.equal(
    addlistSlugOf('https://t.me/addlist/AbCdEfGh1234'),
    'AbCdEfGh1234'
  );
  assert.equal(
    addlistSlugOf('http://telegram.me/addlist/Zz_-12345/'),
    'Zz_-12345'
  );
  assert.equal(addlistSlugOf('tg://addlist?slug=AbCdEfGh1234'), 'AbCdEfGh1234');
  for (const no of [
    'https://t.me/+AbCdEfGh1234',
    'https://t.me/addlist/short',
    'https://t.me/addlist/AbCdEfGh1234/extra',
    'https://example.com/addlist/AbCdEfGh1234',
    'tg://join?invite=AbCdEfGh1234',
    'not a link',
    '',
    null,
  ]) {
    assert.equal(addlistSlugOf(no), null, String(no));
  }
});

test('a dragged folder lands in its place; "All chats" stays put (R-Y172)', () => {
  const folders = [{ id: 4 }, { id: 0, all: true }, { id: 2 }, { id: 7 }];
  assert.deepEqual(movedTo(folders, 0, 2), [2, 0, 7, 4]);
  assert.deepEqual(movedTo(folders, 2, 0), [7, 0, 4, 2]);
  assert.deepEqual(movedTo(folders, 0, 1), [2, 0, 4, 7]);
  assert.equal(movedTo(folders, 1, 1), null, 'not moved');
  assert.equal(movedTo(folders, 0, 3), null, 'past the end');
  assert.equal(movedTo(folders, -1, 0), null);
});

test('a tab dragged sideways finds its place by its middle (R-Y172)', () => {
  const rects = [0, 1, 2].map((i) => ({
    left: i * 100,
    width: 80,
    top: 0,
    height: 30,
  }));
  assert.equal(dropIndex(rects, 0, 0, 'x'), 0);
  assert.equal(dropIndex(rects, 0, 190, 'x'), 2);
  assert.equal(dropIndex(rects, 2, -210, 'x'), 0);
  assert.equal(dropIndex(rects, 1, 40, 'x'), 1);
  // Up and down still use the rows' tops and heights.
  const rows = [0, 1].map((i) => ({
    left: 0,
    width: 80,
    top: i * 40,
    height: 30,
  }));
  assert.equal(dropIndex(rows, 0, 45), 1);
});
