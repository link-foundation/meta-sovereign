// The chat list as Telegram lists it (R-Y68): the pinned on top in
// their order, the archive behind its own row, muted chats in grey, and
// each row saying who wrote last and what ("🙂 Sticker", "Photo"); a
// quote names the user and shows the quoted picture; a sticker that
// replies keeps no bubble. Fakes only — nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext, translate } from '../src/web/i18n.js';
import {
  archiveSummary,
  folderChats,
  sortChats,
  summarizeChats,
} from '../src/web/chat-model.js';
import { ArchiveItem, ChatItem, chatPreview } from '../src/web/chat-list.js';
import {
  MessageBubble,
  QuoteContext,
  ReplyQuote,
} from '../src/web/chat-message.js';
import {
  pinnedRanks,
  telegramDialogLinks,
} from '../src/sources/telegram-account.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { updateEffect } from '../src/sources/telegram-updates.js';
import { createMemoryStore } from '../src/storage/universal.js';

const t = (key, vars) => translate('en', key, vars);

const wrap = (element, value = { selfName: null, api: null }) =>
  React.createElement(
    LocaleContext.Provider,
    { value: { locale: 'en', setLocale: () => {}, t } },
    React.createElement(QuoteContext.Provider, { value }, element)
  );
const render = (element, value) => renderToStaticMarkup(wrap(element, value));

const NOW = Date.parse('2026-10-21T12:00:00Z');
const at = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

const message = (chat, id, extra = {}) => ({
  id: `msg:telegram:${chat}:${id}`,
  source: 'telegram',
  chat,
  sender: 'u1',
  senderName: 'Fёdor',
  body: `text ${id}`,
  timestamp: at(100 - id),
  chatType: 'supergroup',
  ...extra,
});

const read = (chat, fields) => ({
  id: `read:telegram:${chat}`,
  kind: 'read',
  source: 'telegram',
  chat,
  ...fields,
});

const STICKER = {
  className: 'MessageMediaDocument',
  document: {
    id: '7',
    mimeType: 'image/webp',
    size: 3000,
    attributes: [{ className: 'DocumentAttributeSticker', alt: '😺' }],
    thumbs: [],
  },
};

const PHOTO = {
  className: 'MessageMediaPhoto',
  photo: {
    id: '1',
    sizes: [
      { className: 'PhotoStrippedSize', type: 'i', bytes: { bytes: 'AQID' } },
      { className: 'PhotoSize', type: 'm', w: 320, h: 240, size: 9000 },
    ],
  },
};

test('pinned chats come first, in their order; the archive is apart', () => {
  const links = [
    message('-1001', 1),
    message('-1002', 2),
    message('-1003', 3),
    message('-1004', 4),
    read('-1001', { pinnedRank: 2 }),
    read('-1002', { pinnedRank: 1 }),
    read('-1004', {
      folder: 1,
      unreadCount: 5,
      unreadTopId: 4,
      muteUntil: 2_147_483_647,
    }),
  ];
  const all = summarizeChats(links);
  const main = sortChats(folderChats(all, 'main'));
  assert.deepEqual(
    main.map((c) => c.chat),
    ['-1002', '-1001', '-1003'],
    'the pinned in their order, then the newest'
  );
  assert.deepEqual(
    sortChats(all, 'oldest').map((c) => c.chat),
    ['-1001', '-1002', '-1003', '-1004'],
    'oldest first is by time only'
  );
  const archived = folderChats(all, 'archive');
  assert.deepEqual(
    archived.map((c) => [c.chat, c.muted, c.archived]),
    [['-1004', true, true]]
  );
  assert.deepEqual(archiveSummary(all), {
    count: 1,
    unread: 5,
    names: [all.find((c) => c.chat === '-1004').name],
  });
});

test('a row says who wrote last and what, as Telegram does', () => {
  const [sticker] = summarizeChats([
    message('-1001', 1, { body: '📎', raw: { media: STICKER } }),
  ]);
  assert.deepEqual(chatPreview(t, sticker), {
    who: 'Fёdor',
    what: '😺 Sticker',
    thumb: null,
  });
  const [photo] = summarizeChats([
    message('42', 2, {
      chatType: 'personal_chat',
      sender: 'me',
      body: '📎',
      raw: { media: PHOTO },
    }),
  ]);
  const preview = chatPreview(t, photo);
  assert.equal(preview.who, 'You');
  assert.equal(preview.what, 'Photo');
  assert.match(preview.thumb, /^data:image\/jpeg;base64,/);
  const [channel] = summarizeChats([
    message('-1003', 3, { chatType: 'channel', body: 'news' }),
  ]);
  assert.deepEqual(chatPreview(t, channel), {
    who: null,
    what: 'news',
    thumb: null,
  });
});

test('a muted chat counts in grey; a pinned one shows a pin', () => {
  const [muted] = summarizeChats([
    message('-1001', 1),
    read('-1001', {
      unreadCount: 3284,
      unreadTopId: 1,
      unreadMentions: 1,
      muteUntil: 2_147_483_647,
    }),
  ]);
  const html = render(
    React.createElement(ChatItem, {
      chat: muted,
      active: false,
      onSelect: () => {},
    })
  );
  assert.match(html, /class="chat-item-unread is-muted"[^>]*>3284</);
  assert.match(html, /class="chat-item-muted"/);
  assert.match(html, /class="chat-item-mark"[^>]*>@</);
  const [pinned] = summarizeChats([
    message('-1002', 2),
    read('-1002', { pinnedRank: 1, unreadTopId: 2 }),
  ]);
  const row = render(
    React.createElement(ChatItem, {
      chat: pinned,
      active: false,
      onSelect: () => {},
    })
  );
  assert.match(row, /class="chat-item-pinned"/);
  const archive = render(
    React.createElement(ArchiveItem, {
      archive: { count: 2, unread: 7, names: ['A', 'B'] },
      onOpen: () => {},
    })
  );
  assert.match(archive, /Archived Chats/);
  assert.match(archive, />A, B</);
  assert.match(archive, /is-muted[^>]*>7</);
});

test('the dialogs say which are pinned, in each folder', () => {
  const listed = [
    { id: 1, pinned: true },
    { id: 2, pinned: true },
    { id: 3 },
    { id: 4, pinned: true, folderId: 1 },
  ];
  const ranks = pinnedRanks(listed);
  assert.deepEqual(
    listed.map((d) => ranks.get(d)),
    [1, 2, 0, 1]
  );
});

test('muting, pinning and archiving elsewhere move the chat here', async () => {
  const store = createMemoryStore();
  const live = createTelegramLive({ store, toLinks: telegramDialogLinks });
  const channel = (id) => ({ className: 'PeerChannel', channelId: id });
  const dialogPeer = (id) => ({ className: 'DialogPeer', peer: channel(id) });
  await live.handle(null, {
    className: 'UpdateNotifySettings',
    peer: { className: 'NotifyPeer', peer: channel(1) },
    notifySettings: { muteUntil: 2_147_483_647 },
  });
  assert.equal(
    (await store.get('read:telegram:-1001')).muteUntil,
    2_147_483_647
  );
  // A chat pinned goes first; the one pinned before goes one down.
  await live.handle(null, {
    className: 'UpdateDialogPinned',
    pinned: true,
    peer: dialogPeer(1),
  });
  await live.handle(null, {
    className: 'UpdateDialogPinned',
    pinned: true,
    peer: dialogPeer(2),
  });
  const rank = async (id) =>
    (await store.get(`read:telegram:-100${id}`)).pinnedRank;
  assert.deepEqual([await rank(1), await rank(2)], [2, 1]);
  // An order given is kept as given.
  await live.handle(null, {
    className: 'UpdatePinnedDialogs',
    order: [dialogPeer(1)],
  });
  assert.deepEqual([await rank(1), await rank(2)], [1, 0]);
  // Archived: in the archive, no longer pinned.
  await live.handle(null, {
    className: 'UpdateFolderPeers',
    folderPeers: [{ peer: channel(1), folderId: 1 }],
  });
  const archived = await store.get('read:telegram:-1001');
  assert.deepEqual([archived.folder, archived.pinnedRank], [1, 0]);
  assert.equal(
    updateEffect({ className: 'UpdateNotifySettings', peer: {} }),
    null,
    'a whole kind of chats muted names no chat'
  );
});

test('a quote names the user and shows the quoted picture', () => {
  const html = render(
    React.createElement(ReplyQuote, {
      replyRef: {
        msgId: 5,
        linkId: 'msg:telegram:-1001:5',
        sender: 'me',
        senderName: 'me',
        text: '📎',
        media: { kind: 'photo', strippedB64: 'AQID' },
      },
    }),
    { selfName: 'Konstantin Dyachenko', api: null }
  );
  assert.match(html, /class="bubble-reply-name">Konstantin Dyachenko</);
  assert.match(html, />Photo</);
  assert.match(html, /class="bubble-reply-thumb" src="data:image\/jpeg/);
});

test('a sticker that replies keeps no bubble', () => {
  const html = render(
    React.createElement(MessageBubble, {
      message: message('-1001', 9, {
        body: '📎',
        raw: {
          media: STICKER,
          replyTo: { replyToMsgId: 8 },
        },
      }),
      isPersonal: false,
      onAction: () => {},
    })
  );
  assert.match(html, /class="bubble in[^"]*\bbare\b/);
  assert.match(html, /class="bubble-sticker"/);
});

test('a read elsewhere keeps the count Telegram says is still unread', async () => {
  const store = createMemoryStore();
  const live = createTelegramLive({ store, toLinks: telegramDialogLinks });
  await store.put(
    read('-1001', { inboxMaxId: 10, unreadCount: 3300, unreadTopId: 500 })
  );
  await live.handle(null, {
    className: 'UpdateReadChannelInbox',
    channelId: 1,
    maxId: 26,
    stillUnreadCount: 3284,
  });
  const after = await store.get('read:telegram:-1001');
  assert.deepEqual(
    [after.inboxMaxId, after.unreadCount, after.unreadTopId],
    [26, 3284, 500]
  );
  const [chat] = summarizeChats([message('-1001', 480), after]);
  assert.equal(chat.unread, 3284, 'the stored ones are in the count');
  // Read here up to the newest: nothing is left.
  await live.readInbox({ chat: '-1001', maxId: 500 });
  assert.equal((await store.get('read:telegram:-1001')).unreadCount, 0);
});
