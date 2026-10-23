// A group's sticker set and emoji pack, pinned topics reordered, new chats
// in a shared folder and the new-contacts notification (R-Y211): the
// requests built, Telegram's errors as codes, the routes' strict
// validation and the page's pure helpers. Fake clients; nothing reaches a
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGroupExtras,
  groupStickersInfo,
} from '../src/sources/telegram-group-extras.js';
import {
  createTopicAdmin,
  pinOrderOf,
} from '../src/sources/telegram-topic-admin.js';
import { createChatlists } from '../src/sources/telegram-chatlists.js';
import {
  setNameOf,
  canSetGroupStickers,
} from '../src/web/chat-group-stickers.js';
import { reorderedPins, pinnedTopicIds } from '../src/web/chat-topic-admin.js';
import {
  folderIdOfKey,
  updatableFolders,
} from '../src/web/chat-folder-updates.js';
import { named, post, telegramError } from './helpers/telegram-fakes.mjs';

const Api = {
  InputStickerSetEmpty: named('InputStickerSetEmpty'),
  InputStickerSetShortName: named('InputStickerSetShortName'),
  InputChatlistDialogFilter: named('InputChatlistDialogFilter'),
  InputPeerChannel: named('InputPeerChannel'),
  channels: {
    SetStickers: named('channels.SetStickers'),
    SetEmojiStickers: named('channels.SetEmojiStickers'),
  },
  account: {
    GetContactSignUpNotification: named('account.GetContactSignUpNotification'),
    SetContactSignUpNotification: named('account.SetContactSignUpNotification'),
  },
  messages: {
    ReorderPinnedForumTopics: named('messages.ReorderPinnedForumTopics'),
  },
  chatlists: {
    GetChatlistUpdates: named('GetChatlistUpdates'),
    JoinChatlistUpdates: named('JoinChatlistUpdates'),
    HideChatlistUpdates: named('HideChatlistUpdates'),
  },
};

const make = (create, answer = () => true, extra = {}) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const env = {
    importer: async () => ({
      Api,
      helpers: { returnBigInt: (v) => BigInt(v) },
    }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  return {
    actions: create(env, { userClient: async () => client, ...extra }),
    log,
  };
};

const CHAT = '-1005';

// ---- Group sticker set ----------------------------------------------------

test('the group set is saved by short name, the emoji pack through its own call', async () => {
  const { actions, log } = make(createGroupExtras);
  assert.deepEqual(
    await actions.groupStickerSet({ chat: CHAT, shortName: 'Cats_1' }),
    { ok: true }
  );
  await actions.groupStickerSet({ chat: CHAT, shortName: 'Fun', emojis: true });
  assert.equal(log[0].className, 'channels.SetStickers');
  assert.equal(log[0].stickerset.className, 'InputStickerSetShortName');
  assert.equal(log[0].stickerset.shortName, 'Cats_1');
  assert.equal(log[1].className, 'channels.SetEmojiStickers');
});

test('a null short name takes the set off with the empty set', async () => {
  const { actions, log } = make(createGroupExtras);
  await actions.groupStickerSet({ chat: CHAT, shortName: null });
  assert.equal(log[0].stickerset.className, 'InputStickerSetEmpty');
});

test('a bad chat or name never reaches Telegram; its errors become codes', async () => {
  const { actions, log } = make(createGroupExtras);
  for (const body of [
    { chat: '12', shortName: 'a' },
    { chat: CHAT, shortName: 'bad name!' },
    { chat: CHAT, shortName: 'a', emojis: 'yes' },
  ]) {
    assert.equal((await actions.groupStickerSet(body)).code, 'bad-request');
  }
  assert.equal(log.length, 0);
  const fail = (name) =>
    make(createGroupExtras, () => telegramError(name)).actions;
  assert.equal(
    (
      await fail('STICKERSET_INVALID').groupStickerSet({
        chat: CHAT,
        shortName: 'a',
      })
    ).code,
    'unknown-set'
  );
  assert.equal(
    (
      await fail('PARTICIPANTS_TOO_FEW').groupStickerSet({
        chat: CHAT,
        shortName: 'a',
      })
    ).code,
    'too-few'
  );
  assert.deepEqual(
    await fail('CHAT_NOT_MODIFIED').groupStickerSet({
      chat: CHAT,
      shortName: 'a',
    }),
    { ok: true }
  );
});

test('the chat info says who may set the sets and which sets there are', () => {
  const full = {
    canSetStickers: true,
    stickerset: { id: 5n, shortName: 'cats', title: 'Cats', count: 12 },
  };
  const info = groupStickersInfo({ adminRights: { changeInfo: true } }, full);
  assert.equal(info.canSetStickers, true);
  assert.deepEqual(info.groupStickers.stickers, {
    id: '5',
    shortName: 'cats',
    title: 'Cats',
    count: 12,
  });
  assert.equal(info.groupStickers.emojis, null);
  assert.equal(groupStickersInfo({ creator: true }, {}).canSetStickers, false);
  assert.equal(groupStickersInfo({}, full).canSetStickers, false, 'a member');
  assert.equal(
    groupStickersInfo({ creator: true, broadcast: true }, full).canSetStickers,
    false,
    'a channel'
  );
});

test('a short name is read from a typed name or an addstickers link', () => {
  assert.equal(setNameOf('Cats_1'), 'Cats_1');
  assert.equal(setNameOf(' https://t.me/addstickers/Cats_1 '), 'Cats_1');
  assert.equal(setNameOf('t.me/addemoji/Fun?x=1'), 'Fun');
  assert.equal(setNameOf('tg://addstickers?set=Cats_1'), 'Cats_1');
  assert.equal(setNameOf(''), null);
  assert.equal(setNameOf('not a set'), null);
  assert.equal(setNameOf('https://example.com/addstickers/x'), null);
});

test('the Edit rows need Telegram, the right and the page calls', () => {
  const api = {
    telegramGroupStickerSet() {},
    telegramStickerSetBox() {},
  };
  const chat = { source: 'telegram', key: 'k' };
  assert.equal(canSetGroupStickers(chat, { canSetStickers: true }, api), true);
  assert.equal(canSetGroupStickers(chat, {}, api), false);
  assert.equal(canSetGroupStickers(chat, { canSetStickers: true }, {}), false);
});

// ---- Pinned topics --------------------------------------------------------

test('pinned topics are reordered with force; General is never in the order', async () => {
  const { actions, log } = make(createTopicAdmin);
  assert.deepEqual(
    await actions.reorderTopics({ chat: CHAT, order: [4, 2, 9] }),
    {
      ok: true,
    }
  );
  assert.equal(log[0].className, 'messages.ReorderPinnedForumTopics');
  assert.equal(log[0].force, true);
  assert.deepEqual(log[0].order, [4, 2, 9]);
  for (const order of [[], [1, 2], [2, 2], ['3'], null]) {
    assert.equal(pinOrderOf(order), null, JSON.stringify(order));
  }
  assert.equal(
    (await actions.reorderTopics({ chat: '5', order: [2] })).code,
    'bad-request'
  );
  assert.equal(log.length, 1);
});

test('dragging a pinned tab gives the pinned ids in their new order', () => {
  const topics = [
    { id: 6, pinned: true },
    { id: 1, pinned: true },
    { id: 3, pinned: true },
    { id: 8, pinned: false },
    { id: 2, pinned: true },
  ];
  assert.deepEqual(pinnedTopicIds(topics), [6, 3, 2]);
  assert.deepEqual(reorderedPins(topics, 0, 2), [3, 2, 6]);
  assert.deepEqual(reorderedPins(topics, 2, 0), [2, 6, 3]);
  assert.equal(reorderedPins(topics, 1, 1), null);
  assert.equal(reorderedPins(topics, 1, 3), null);
  assert.equal(reorderedPins(topics, 5, 0), null);
});

// ---- Contact sign-up ------------------------------------------------------

test('the new-contacts switch is the opposite of Telegram silent flag', async () => {
  let silent = false;
  const { actions, log } = make(createGroupExtras, (request) => {
    if (request.className === 'account.SetContactSignUpNotification') {
      silent = request.silent;
      return true;
    }
    return silent;
  });
  assert.deepEqual(await actions.contactSignUpGet(), { ok: true, on: true });
  assert.deepEqual(await actions.contactSignUpSet({ on: false }), {
    ok: true,
    on: false,
  });
  assert.equal(log[1].silent, true);
  assert.deepEqual(await actions.contactSignUpGet(), { ok: true, on: false });
  assert.equal(
    (await actions.contactSignUpSet({ on: 'no' })).code,
    'bad-request'
  );
});

// ---- Shared folder updates ------------------------------------------------

const channel = (id, title) => ({
  className: 'Channel',
  id: BigInt(id),
  accessHash: BigInt(id) * 7n,
  title,
});
const peer = (id) => ({ className: 'PeerChannel', channelId: BigInt(id) });

const makeLists = (answers) => {
  const applied = [];
  const made = make(
    createChatlists,
    (request) => {
      const answer = answers[request.className];
      return typeof answer === 'function' ? answer(request) : (answer ?? true);
    },
    { apply: async (_c, result) => applied.push(result) }
  );
  return { ...made, applied };
};

const updates = {
  className: 'chatlists.ChatlistUpdates',
  missingPeers: [peer(333), peer(444)],
  chats: [channel(333, 'News'), channel(444, 'Chat')],
  users: [],
};

test('the new chats of a joined folder are listed, then joined on a press', async () => {
  const { actions, log, applied } = makeLists({
    GetChatlistUpdates: updates,
    JoinChatlistUpdates: { className: 'Updates' },
  });
  const seen = await actions.chatlistUpdates({ id: 5 });
  assert.deepEqual(seen.chats, [
    { chat: '-100333', name: 'News', kind: 'group' },
    { chat: '-100444', name: 'Chat', kind: 'group' },
  ]);
  assert.equal(log.length, 1, 'looking joins nothing');
  assert.equal(log[0].chatlist.filterId, 5);
  assert.deepEqual(
    await actions.chatlistUpdatesJoin({ id: 5, chats: ['-100333'] }),
    {
      ok: true,
    }
  );
  assert.equal(log[1].className, 'JoinChatlistUpdates');
  assert.equal(log[1].peers.length, 1);
  assert.equal(log[1].peers[0].channelId, 333n);
  assert.equal(applied.length, 1);
});

test('only chats the last look named can be joined; hiding sends hide', async () => {
  const { actions, log } = makeLists({ GetChatlistUpdates: updates });
  assert.equal(
    (await actions.chatlistUpdatesJoin({ id: 5, chats: ['-100333'] })).code,
    'bad-chats',
    'nothing was looked at'
  );
  await actions.chatlistUpdates({ id: 5 });
  assert.equal(
    (await actions.chatlistUpdatesJoin({ id: 5, chats: ['-100999'] })).code,
    'bad-chats'
  );
  assert.equal(
    log.some((r) => r.className === 'JoinChatlistUpdates'),
    false
  );
  assert.deepEqual(await actions.chatlistUpdatesHide({ id: 5 }), { ok: true });
  assert.equal(log.at(-1).className, 'HideChatlistUpdates');
  assert.equal((await actions.chatlistUpdatesHide({ id: 1 })).code, 'failed');
});

test('the page asks only about folders joined from a link', () => {
  const folders = [
    { id: 0, all: true },
    { id: 2, chatlist: true, hasMyInvites: false },
    { id: 3, chatlist: true, hasMyInvites: true },
    { id: 4, chatlist: false },
  ];
  assert.deepEqual(
    updatableFolders(folders).map((f) => f.id),
    [2]
  );
  assert.equal(folderIdOfKey('folder:12'), 12);
  assert.equal(folderIdOfKey('all'), null);
});

// ---- Routes ---------------------------------------------------------------

test('routes validate before the account is asked', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => {
        calls.push([name, body]);
        return { ok: true };
      },
    }
  );
  const cases = [
    ['group-sticker-set', { chat: CHAT, shortName: 'Cats' }, 200],
    ['group-sticker-set', { chat: CHAT, shortName: null, emojis: true }, 200],
    ['group-sticker-set', { chat: CHAT }, 400],
    ['group-sticker-set', { chat: '5', shortName: 'a' }, 400],
    ['group-sticker-set', { chat: CHAT, shortName: 'a b' }, 400],
    ['topic-reorder', { chat: CHAT, order: [3, 2] }, 200],
    ['topic-reorder', { chat: CHAT, order: [1] }, 400],
    ['topic-reorder', { chat: CHAT, order: [] }, 400],
    ['topic-reorder', { chat: '9', order: [2] }, 400],
    ['chatlist-updates', { id: 4 }, 200],
    ['chatlist-updates', { id: 0 }, 400],
    ['chatlist-updates-join', { id: 4, chats: ['-100333'] }, 200],
    ['chatlist-updates-join', { id: 4, chats: [] }, 400],
    ['chatlist-updates-join', { id: 4, chats: ['x'] }, 400],
    ['chatlist-updates-hide', { id: 4 }, 200],
    ['chatlist-updates-hide', {}, 400],
    ['contact-signup', {}, 200],
    ['contact-signup-set', { on: false }, 200],
    ['contact-signup-set', { on: 'false' }, 400],
  ];
  for (const [route, body, status] of cases) {
    const got = await post(route, body, account);
    assert.equal(got.status, status, `${route} ${JSON.stringify(body)}`);
  }
  assert.equal(calls.length, cases.filter((c) => c[2] === 200).length);
});
