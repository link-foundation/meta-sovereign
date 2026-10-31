import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  defaultStickerCollections,
  loadStickerCollections,
  normalizeStickerCollections,
  saveStickerCollections,
} from '../src/greetings/collections.js';
import {
  chosenStickers,
  restoreCollectionStickers,
} from '../src/web/collection-model.js';
import { handleStickerCollections } from '../src/server/routes-sticker-collections.js';
import { accountScope } from '../src/server/account-scope.js';
const item = (id, emoji = '👋') => ({
  network: 'telegram',
  id,
  emoji,
  format: 'webp',
});
const row = {
  id: 'tg-hi',
  name: 'Hello',
  source: 'telegram',
  category: 'greeting',
  automatic: true,
  stickers: [],
};

test('default provider collections preserve legacy saved greeting choices', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'greetings:selection',
    selection: { stickers: [{ network: 'vk', id: '17', emoji: '👋' }] },
  });
  const result = await loadStickerCollections(store);
  assert.equal(
    result.collections.find((c) => c.source === 'vk').automatic,
    false,
    'saved manual choices must not expand on an unrelated collection save'
  );
  assert(result.collections.some((c) => c.source === 'telegram'));
  assert.deepEqual(
    result.collections.find((c) => c.source === 'vk').stickers.map((s) => s.id),
    ['17']
  );
  assert(
    defaultStickerCollections().find((c) => c.source === 'vk').stickers.length >
      0
  );
});
test('collections validate provider boundaries, deduplicate and round-trip without message scans', async () => {
  const store = createMemoryStore();
  store.query = () =>
    assert.fail('collection reads must never scan message history');
  const result = await saveStickerCollections(store, [
    { ...row, stickers: [item('1'), item('1')] },
  ]);
  assert.equal(result.collections[0].stickers.length, 1);
  assert.deepEqual(await loadStickerCollections(store), result);
  assert.throws(() =>
    normalizeStickerCollections([
      { ...row, stickers: [{ id: '1', network: 'vk' }] },
    ])
  );
  assert.throws(() => normalizeStickerCollections([row, row]));
  assert.throws(() =>
    normalizeStickerCollections([
      {
        ...row,
        stickers: Array.from({ length: 201 }, (_, n) => item(String(n))),
      },
    ])
  );
  const clean = normalizeStickerCollections([
    { ...row, stickers: [{ ...item('1'), previewUrl: 'javascript:alert(1)' }] },
  ]);
  assert.equal(clean[0].stickers[0].previewUrl, null);
});
test('automatic categories are editable and do not duplicate saved stickers', () => {
  const pool = [item('1'), item('2', '🎂'), item('3', '🙏')];
  assert.deepEqual(
    chosenStickers({ ...row, stickers: [item('1')] }, pool).map((s) => s.id),
    ['1']
  );
  assert.deepEqual(
    chosenStickers({ ...row, category: 'birthday' }, pool).map((s) => s.id),
    ['2']
  );
  assert.equal(chosenStickers({ ...row, automatic: false }, pool).length, 0);
});

test('greeting collections update compatible presets and keep Telegram document IDs separate from bot file IDs', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'greetings:selection',
    selection: {
      language: 'ru',
      stickers: [{ network: 'telegram', id: 'bot-file' }],
    },
  });
  await saveStickerCollections(store, [
    row,
    {
      ...row,
      id: 'vk-hi',
      source: 'vk',
      stickers: [{ network: 'vk', id: '19' }],
    },
  ]);
  const selection = (await store.get('greetings:selection')).selection;
  assert.equal(selection.language, 'ru');
  assert.deepEqual(
    selection.stickers.map((item) => item.id),
    ['bot-file', '19']
  );
  const migrated = defaultStickerCollections(selection);
  assert.equal(
    migrated.find((c) => c.source === 'telegram').stickers.length,
    0,
    'Bot API file IDs are not user-session collection entries'
  );
  await saveStickerCollections(store, [row]);
  assert.deepEqual(
    (await store.get('greetings:selection')).selection.stickers.map(
      (item) => item.id
    ),
    ['bot-file'],
    'removing the VK greeting collection removes its greeting choices'
  );
});
test('saved Telegram references can be refreshed after restart without installing packs or sending', async () => {
  const calls = [];
  const api = Object.fromEntries(
    [
      'telegramStickerSearch',
      'telegramStickerSet',
      'telegramStickerSetBox',
    ].map((method) => [
      method,
      async (body) => {
        calls.push([method, body]);
        return { ok: true, stickers: [item('9')] };
      },
    ])
  );
  const stickers = [
    { ...item('1'), lookupQuery: '👋' },
    { ...item('2'), lookupQuery: '👋' },
    { ...item('3'), setId: '7', setAccessHash: '8' },
  ];
  await restoreCollectionStickers(api, { ...row, stickers });
  assert.deepEqual(calls, [
    ['telegramStickerSetBox', { id: '7', accessHash: '8' }],
    ['telegramStickerSearch', { q: '👋' }],
  ]);
});
const request = async (store, collections, origin) => {
  const req = Readable.from([Buffer.from(JSON.stringify({ collections }))]);
  req.method = 'POST';
  req.headers = {
    'content-type': 'application/json',
    host: 'app.test',
    ...(origin ? { origin } : {}),
  };
  let status, data;
  await handleStickerCollections(
    store,
    req,
    {
      writeHead: (code) => {
        status = code;
      },
      end: (body) => {
        data = JSON.parse(body);
      },
    },
    '/api/sticker-collections',
    new URL('http://app.test/api/sticker-collections'),
    { allowOrigins: [] }
  );
  return { status, data };
};
test('collection writes require the app origin and route extra accounts to their own store', async () => {
  const home = createMemoryStore();
  const extra = createMemoryStore();
  assert.equal(
    (await request(home, [row], 'https://untrusted.test')).status,
    403
  );
  const ctx = { telegramExtras: { start: async () => ({ store: extra }) } };
  const scoped = await accountScope(
    { headers: {} },
    new URL('http://app.test/api/sticker-collections?telegramAccount=2'),
    '/api/sticker-collections',
    ctx
  );
  assert.equal(scoped.store, extra);
  assert.equal((await request(scoped.store, [row])).status, 200);
  assert.equal(await home.get('stickers:collections'), null);
  await scoped.ctx.replies.close();
  scoped.ctx.knowledge?.close?.();
});
