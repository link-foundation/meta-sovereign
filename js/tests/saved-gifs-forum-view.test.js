// Saved GIFs from a message's menu, getSavedGifs by hash, and a forum
// seen as messages or topics (R-Y171): the source modules with fake
// clients, the routes' validation, and the pure page helpers. Nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGifSave } from '../src/sources/telegram-gif-save.js';
import { createForumView } from '../src/sources/telegram-forum-view.js';
import { createStickers } from '../src/sources/telegram-stickers.js';
import { gifIdOf } from '../src/web/gif-id.js';
import { menuItems } from '../src/web/chat-selection.js';
import { named, postRoute } from './helpers/telegram-route.js';

const Api = {
  messages: {
    SaveGif: named('SaveGif'),
    GetSavedGifs: named('GetSavedGifs'),
  },
  channels: { ToggleViewForumAsMessages: named('ToggleViewForumAsMessages') },
  InputDocument: named('InputDocument'),
};
const helpers = { returnBigInt: (v) => BigInt(v) };

const gifDoc = (id, ref = 1) => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: BigInt(id) * 10n,
  fileReference: Buffer.from([ref]),
  mimeType: 'video/mp4',
  attributes: [{ className: 'DocumentAttributeAnimated' }],
});
const env = (log) => ({
  importer: async () => ({ Api, helpers }),
  connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  log,
});

test('a message GIF saved and unsaved with its InputDocument', async () => {
  const log = [];
  let changed = 0;
  const client = {
    getMessages: async () => [{ media: { document: gifDoc(900, 7) } }],
    invoke: async (r) => log.push(r),
  };
  const { messageGifSave } = createGifSave(env(), {
    userClient: async () => client,
    stickers: { changed: () => (changed += 1) },
  });
  const saved = await messageGifSave({ chat: '555', message: 4 });
  assert.deepEqual(saved, { ok: true, id: '900', saved: true });
  assert.equal(log[0].className, 'SaveGif');
  assert.equal(log[0].unsave, false);
  assert.equal(log[0].id.id, 900n);
  assert.equal(log[0].id.accessHash, 9000n);
  assert.deepEqual([...log[0].id.fileReference], [7]);
  const removed = await messageGifSave({
    chat: '555',
    message: 4,
    unsave: true,
  });
  assert.equal(removed.saved, false);
  assert.equal(log[1].unsave, true);
  assert.equal(changed, 2, 'the lists asked again');
});

test('an expired file reference reads the message again once', async () => {
  let reads = 0;
  const client = {
    getMessages: async () => [{ media: { document: gifDoc(900, ++reads) } }],
    invoke: async (r) => {
      if (r.id.fileReference[0] === 1) {
        throw Object.assign(new Error('x'), {
          errorMessage: 'FILE_REFERENCE_EXPIRED',
        });
      }
      return true;
    },
  };
  const { messageGifSave } = createGifSave(env(), {
    userClient: async () => client,
  });
  const answer = await messageGifSave({ chat: '555', message: 4 });
  assert.equal(answer.ok, true);
  assert.equal(reads, 2);
});

test('a message without a GIF or a bad request is refused', async () => {
  const client = {
    getMessages: async () => [
      { media: { document: { className: 'Document' } } },
    ],
    invoke: async () => {
      throw new Error('must not be asked');
    },
  };
  const { messageGifSave } = createGifSave(env(), {
    userClient: async () => client,
  });
  assert.equal(
    (await messageGifSave({ chat: '555', message: 4 })).code,
    'not-gif'
  );
  for (const bad of [
    {},
    { chat: 'x', message: 1 },
    { chat: '5', message: 0 },
  ]) {
    assert.equal((await messageGifSave(bad)).code, 'bad-request');
  }
});

test('the forum view is written with the flag asked for', async () => {
  const log = [];
  const client = { invoke: async (r) => log.push(r) };
  const { forumView } = createForumView(env(), {
    userClient: async () => client,
  });
  assert.deepEqual(await forumView({ chat: '-1009', asMessages: true }), {
    ok: true,
    asMessages: true,
  });
  assert.equal(log[0].className, 'ToggleViewForumAsMessages');
  assert.equal(log[0].enabled, true);
  assert.equal(log[0].channel.chat, '-1009');
  for (const bad of [
    { chat: '555', asMessages: true },
    { chat: '-1009' },
    { chat: '-1009', asMessages: 'yes' },
  ]) {
    assert.equal((await forumView(bad)).code, 'bad-request');
  }
  assert.equal(log.length, 1);
});

test('the saved GIFs are asked by hash and kept when not modified', async () => {
  const asked = [];
  let answer = { gifs: [gifDoc(3), gifDoc(4)] };
  const client = {
    invoke: async (r) => {
      asked.push(r);
      return answer;
    },
  };
  const stickers = createStickers(
    env(),
    { userClient: async () => client, apply: async () => {}, mediaDir: null },
    { now: () => 0 }
  );
  const first = await stickers.savedGifs({ fresh: true });
  assert.equal(first.gifs.length, 2);
  assert.equal(asked[0].hash, 0n, 'nothing known: no hash');
  answer = { className: 'messages.SavedGifsNotModified' };
  const second = await stickers.savedGifs({ fresh: true });
  assert.notEqual(asked[1].hash, 0n, 'asked by the hash of what it has');
  assert.deepEqual(
    second.gifs.map((g) => g.id),
    ['3', '4']
  );
  await stickers.savedGifs({ fresh: true, full: true });
  assert.equal(asked[2].hash, 0n, 'the whole list when asked to');
});

test('the routes take a chat, a message and a boolean', async () => {
  const calls = [];
  const account = {
    messageGifSave: async (a) => (calls.push(a), { ok: true }),
    forumView: async (a) => (calls.push(a), { ok: true }),
  };
  assert.equal(
    await postRoute('gif-save', { chat: '5', message: 2 }, account),
    200
  );
  for (const bad of [
    {},
    { chat: '5' },
    { chat: '5', message: '2' },
    { chat: '5', message: 2, unsave: 'yes' },
    { chat: 'x', message: 2 },
  ]) {
    assert.equal(await postRoute('gif-save', bad, account), 400);
  }
  assert.equal(
    await postRoute(
      'forum-view',
      { chat: '-1009', asMessages: false },
      account
    ),
    200
  );
  for (const bad of [
    {},
    { chat: '-1009' },
    { chat: '555', asMessages: true },
    { chat: '-1009', asMessages: 1 },
  ]) {
    assert.equal(await postRoute('forum-view', bad, account), 400);
  }
  assert.equal(calls.length, 2);
});

test('a GIF message offers Save GIF or Remove from GIFs', () => {
  const message = {
    source: 'telegram',
    id: 'msg:telegram:5:2',
    body: '',
    raw: {
      id: 2,
      media: {
        document: {
          id: { value: '900' },
          attributes: [{ className: 'DocumentAttributeAnimated' }],
        },
      },
    },
  };
  assert.equal(gifIdOf(message), '900');
  assert.equal(gifIdOf({ raw: { media: { document: { id: '1' } } } }), null);
  const at = Date.parse('2026-01-01T00:00:00Z');
  const chat = { chat: '5', kind: 'user' };
  const offer = (gifs) =>
    menuItems({ message, chat, now: at, gifs }).filter((k) => /Gif/.test(k));
  assert.deepEqual(offer(null), ['saveMessageGif']);
  assert.deepEqual(offer(new Set(['1'])), ['saveMessageGif']);
  assert.deepEqual(offer(new Set(['900'])), ['unsaveMessageGif']);
  const locked = { ...message, raw: { ...message.raw, noforwards: true } };
  assert.deepEqual(
    menuItems({ message: locked, chat, now: at }).filter((k) => /Gif/.test(k)),
    []
  );
});
