// What the user does to messages in Chat (R-Y36): read them again (a
// deletion made in another app shows here), forward, delete, pin, reply,
// and their pictures — downloaded once, from the stored message, and
// only for a chat and message named by digits. Fakes only — nothing here
// touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createMemoryStore } from '../src/storage/universal.js';
import { createActions } from '../src/sources/telegram-actions.js';
import { createMediaReader, pictureOf } from '../src/sources/telegram-media.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { sendText } from '../src/sources/telegram-send.js';

const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };
const fakeTelegram = () => ({
  Api: {
    InputReplyToMessage: tl('InputReplyToMessage'),
    InputPhotoFileLocation: tl('InputPhotoFileLocation'),
    InputDocumentFileLocation: tl('InputDocumentFileLocation'),
    messages: {
      SendMessage: tl('messages.SendMessage'),
      ForwardMessages: tl('messages.ForwardMessages'),
      DeleteMessages: tl('messages.DeleteMessages'),
      UpdatePinnedMessage: tl('messages.UpdatePinnedMessage'),
    },
    channels: { DeleteMessages: tl('channels.DeleteMessages') },
  },
  helpers: {
    returnBigInt: (value) => `big:${value}`,
    readBigIntFromBuffer: () => 1n,
  },
});
const importer = async () => fakeTelegram();

const message = (chat, id, extra = {}) => ({
  ...telegramDialogLinks({ id: chat, isGroup: true }, [
    { id, message: `m${id}`, date: 1_700_000_000 },
  ])[0],
  ...extra,
});

// The account's parts as the actions see them.
const envWith = (store, client, observed = []) => {
  const live = createTelegramLive({ store, toLinks: telegramDialogLinks });
  const env = {
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
    catchUp: { observeResult: (result) => observed.push(result) },
    channels: { observe: async () => {} },
  };
  return createActions(env, {
    credentials: async () => ({ kind: 'user' }),
    toLinks: telegramDialogLinks,
    writeChanged: async (s, links) => {
      for (const link of links) {
        await s.put(link);
      }
      return links.length;
    },
  });
};

test('reading messages again stores edits and marks the gone ones deleted', async () => {
  const store = createMemoryStore();
  await store.put(message('-5', 1));
  await store.put(message('-5', 2));
  const asked = [];
  const actions = envWith(store, {
    async getMessages(peer, { ids }) {
      asked.push({ peer, ids });
      // Telegram still has 1 (edited); 2 was deleted in another app.
      return [{ id: 1, message: 'm1 edited', date: 1_700_000_000 }, undefined];
    },
  });
  const result = await actions.refreshMessages({ chat: '-5', ids: [1, 2] });
  assert.deepEqual(asked, [{ peer: 'peer:-5', ids: [1, 2] }]);
  assert.equal(result.deleted, 1);
  assert.equal((await store.get('msg:telegram:-5:1')).body, 'm1 edited');
  assert.equal((await store.get('msg:telegram:-5:2')).deleted, true);
});

test('deleting in a channel marks the messages and follows its number', async () => {
  const store = createMemoryStore();
  await store.put(message('-1007', 3));
  const sent = [];
  const actions = envWith(store, {
    async invoke(request) {
      sent.push(request);
      return { pts: 41, ptsCount: 1 };
    },
  });
  await actions.deleteMessages({ chat: '-1007', ids: [3], revoke: true });
  assert.equal(sent[0].className, 'channels.DeleteMessages');
  assert.deepEqual(sent[0].id, [3]);
  assert.equal((await store.get('msg:telegram:-1007:3')).deleted, true);
});

test('deleting in a private chat says whether for everyone', async () => {
  const store = createMemoryStore();
  await store.put(message('42', 8));
  const sent = [];
  const observed = [];
  const actions = envWith(
    store,
    {
      async invoke(request) {
        sent.push(request);
        return { pts: 7, ptsCount: 1 };
      },
    },
    observed
  );
  await actions.deleteMessages({ chat: '42', ids: [8], revoke: true });
  assert.equal(sent[0].className, 'messages.DeleteMessages');
  assert.equal(sent[0].revoke, true);
  assert.equal((await store.get('msg:telegram:42:8')).deleted, true);
  // The account's update counter moves past our own deletion.
  assert.equal(observed[0].pts, 7);
});

test('a forward shows at once, from Telegram’s answer', async () => {
  const store = createMemoryStore();
  const actions = envWith(store, {
    async invoke(request) {
      assert.equal(request.className, 'messages.ForwardMessages');
      assert.equal(request.randomId.length, 2);
      return {
        className: 'Updates',
        users: [],
        chats: [],
        updates: [
          {
            className: 'UpdateNewMessage',
            message: {
              id: 50,
              out: true,
              message: 'm1',
              date: 1_700_000_100,
              peerId: { className: 'PeerUser', userId: 42 },
              fwdFrom: { fromName: 'Team' },
            },
          },
        ],
      };
    },
  });
  const result = await actions.forwardMessages({
    fromChat: '-5',
    ids: [1, 2],
    toChat: '42',
  });
  assert.equal(result.ok, true);
  const link = await store.get('msg:telegram:42:50');
  assert.equal(link.sender, 'me');
  assert.equal(link.raw.fwdFrom.fromName, 'Team');
});

test('a pin and an unpin follow the message', async () => {
  const store = createMemoryStore();
  await store.put(message('-1007', 3));
  const live = createTelegramLive({ store, toLinks: telegramDialogLinks });
  await live.handle(null, {
    className: 'UpdatePinnedChannelMessages',
    channelId: 7,
    messages: [3],
    pinned: true,
  });
  assert.equal((await store.get('msg:telegram:-1007:3')).raw.pinned, true);
  await live.handle(null, {
    className: 'UpdatePinnedChannelMessages',
    channelId: 7,
    messages: [3],
    pinned: false,
  });
  assert.equal((await store.get('msg:telegram:-1007:3')).raw.pinned, false);
});

test('pinning asks Telegram and follows its answer (R-Y67)', async () => {
  const store = createMemoryStore();
  await store.put(message('-1007', 3));
  const requests = [];
  const actions = envWith(store, {
    async invoke(request) {
      requests.push(request);
      return {
        className: 'Updates',
        users: [],
        chats: [],
        updates: [
          {
            className: 'UpdatePinnedChannelMessages',
            channelId: 7,
            messages: [3],
            pinned: !request.unpin,
          },
        ],
      };
    },
  });
  const pinned = await actions.pinMessage({
    chat: '-1007',
    id: 3,
    oneSide: true,
  });
  assert.deepEqual(pinned, { ok: true, pinned: 3 });
  assert.equal(requests[0].className, 'messages.UpdatePinnedMessage');
  assert.equal(requests[0].peer, 'peer:-1007');
  assert.equal(requests[0].pmOneside, true);
  assert.equal(requests[0].unpin, false);
  assert.equal((await store.get('msg:telegram:-1007:3')).raw.pinned, true);
  await actions.pinMessage({ chat: '-1007', id: 3, unpin: true });
  assert.equal((await store.get('msg:telegram:-1007:3')).raw.pinned, false);
  assert.deepEqual(await actions.pinMessage({ chat: '-1007', id: 0 }), {
    ok: false,
    supported: false,
  });
});

test('a reply answers with the first part only', async () => {
  const requests = [];
  const sent = await sendText({
    client: {
      getInputEntity: async (peer) => peer,
      async invoke(request) {
        requests.push(request);
        return { className: 'UpdateShortSentMessage', id: requests.length };
      },
    },
    ...fakeTelegram(),
    peer: '42',
    text: 'a\n\nb',
    maxLength: 2,
    replyTo: 9,
  });
  assert.equal(sent.length, 2);
  assert.equal(requests[0].replyTo.replyToMsgId, 9);
  assert.equal(requests[1].replyTo, undefined);
});

// ---- pictures --------------------------------------------------------------

const PHOTO = {
  className: 'MessageMediaPhoto',
  photo: {
    id: '111',
    accessHash: '222',
    fileReference: { bytes: Buffer.from('ref').toString('base64') },
    dcId: 2,
    sizes: [
      { className: 'PhotoStrippedSize', type: 'i', bytes: { bytes: 'AA==' } },
      { className: 'PhotoSize', type: 'm', w: 320, h: 240, size: 9000 },
      { className: 'PhotoSizeProgressive', type: 'x', sizes: [1, 80_000] },
    ],
  },
};

test('which picture a stored message has, and which size', () => {
  assert.equal(pictureOf({ media: PHOTO }, 'm').thumb, 'm');
  assert.equal(pictureOf({ media: PHOTO }, 'x').thumb, 'x');
  // Missing size: the nearest one there is.
  assert.equal(pictureOf({ media: PHOTO }, 'y').thumb, 'x');
  assert.equal(
    pictureOf({
      media: {
        className: 'MessageMediaWebPage',
        webpage: { photo: PHOTO.photo },
      },
    }).kind,
    'photo'
  );
  const sticker = {
    className: 'MessageMediaDocument',
    document: {
      id: '5',
      accessHash: '6',
      mimeType: 'image/webp',
      size: 20_000,
    },
  };
  assert.equal(pictureOf({ media: sticker }).thumb, '');
  const video = {
    className: 'MessageMediaDocument',
    document: { id: '5', mimeType: 'video/mp4', size: 9e9, thumbs: [] },
  };
  assert.equal(pictureOf({ media: video }), null);
  assert.equal(pictureOf({}), null);
});

test('a picture is downloaded once, from the stored message', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-media-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createMemoryStore();
  await store.put(message('-1007', 4, { raw: { id: 4, media: PHOTO } }));
  const downloads = [];
  const keys = [];
  const reader = createMediaReader({
    store,
    dir,
    importer,
    queue: {
      run: (key, priority, task) => (keys.push({ key, priority }), task()),
    },
    client: async () => ({
      async downloadFile(location, params) {
        downloads.push({ location, params });
        return Buffer.from('jpeg-bytes');
      },
    }),
  });
  const first = await reader.read({ chat: '-1007', id: 4, size: 'm' });
  assert.equal(first.buffer.toString(), 'jpeg-bytes');
  assert.equal(downloads[0].location.className, 'InputPhotoFileLocation');
  assert.equal(downloads[0].location.id, 'big:111');
  assert.equal(downloads[0].location.thumbSize, 'm');
  assert.equal(downloads[0].params.dcId, 2);
  assert.equal(keys[0].priority, 'list');
  const again = await reader.read({ chat: '-1007', id: 4, size: 'm' });
  assert.equal(again.buffer.toString(), 'jpeg-bytes');
  assert.equal(downloads.length, 1, 'the second time comes from disk');
  // Only digits name a path in the app folder.
  assert.equal(await reader.read({ chat: '../../x', id: 4 }), null);
  assert.equal(await reader.read({ chat: '-1007', id: -1 }), null);
  assert.deepEqual(await readdir(dir), ['-1007']);
});

test('an expired file reference reads the message again, once', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-media-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createMemoryStore();
  await store.put(message('42', 4, { raw: { id: 4, media: PHOTO } }));
  let tries = 0;
  const refreshed = [];
  const reader = createMediaReader({
    store,
    dir,
    importer,
    queue: { run: (_key, _priority, task) => task() },
    refresh: async (request) => refreshed.push(request),
    client: async () => ({
      async downloadFile() {
        tries += 1;
        if (tries === 1) {
          throw Object.assign(new Error('FILE_REFERENCE_EXPIRED'), {
            errorMessage: 'FILE_REFERENCE_EXPIRED',
          });
        }
        return Buffer.from('ok');
      },
    }),
  });
  const got = await reader.read({ chat: '42', id: 4 });
  assert.equal(got.buffer.toString(), 'ok');
  assert.deepEqual(refreshed, [{ chat: '42', ids: [4], priority: 'list' }]);
});
