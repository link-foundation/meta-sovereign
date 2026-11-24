import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { createVkStickerCatalog } from '../../js/src/sources/vk-sticker-catalog.js';
import { startServer } from '../../js/src/server/index.js';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

export const stickerInput = { accountId: 1 };
const image = (name) => ({
  width: 512,
  height: 512,
  url: `https://vk.com/sticker/${name}`,
});
const nativeSticker = (id) => ({
  sticker_id: id,
  is_allowed: true,
  images: [image(`${id}-512`)],
  images_with_background: [image(`${id}-background`)],
  render: {
    images: ['light', 'dark'].map((theme) => ({
      ...image(`${id}-${theme}`),
      theme,
    })),
  },
  fixture_private: 'must not survive normalization',
});
export const stickerFixture = ({
  store = createMemoryStore(),
  count = 105,
} = {}) => {
  let account = 1;
  let token = 'fixture-stickers-token';
  let hook;
  const calls = [];
  const packs =
    count === 0
      ? []
      : [
          {
            id: 11,
            type: 'stickers',
            title: 'Friendly foxes',
            purchased: 1,
            active: 1,
            stickers: Array.from({ length: count }, (_, i) =>
              nativeSticker(101 + i)
            ),
          },
          {
            id: 12,
            type: 'stickers',
            title: 'Inactive pack',
            purchased: 1,
            active: 0,
            stickers: [nativeSticker(301)],
          },
          {
            id: 13,
            type: 'stickers',
            title: 'Public greeting pack',
            purchased: 0,
            active: 1,
            stickers: [nativeSticker(401)],
          },
        ];
  if (packs.length) {
    packs[0].stickers.at(-1).is_allowed = false;
    delete packs[0].stickers.at(-2)?.is_allowed;
  }
  const dictionary =
    count === 0
      ? []
      : [
          {
            words: ['привет', 'hello'],
            user_stickers: [101, 102].map((id) => ({
              sticker_id: id,
              product_id: 11,
            })),
            promoted_stickers: [{ sticker_id: 401, product_id: 13 }],
          },
          {
            words: ['birthday', '🎂'],
            stickers: [{ sticker_id: 103, pack_id: 11 }],
          },
          {
            words: ['спасибо', 'thanks'],
            stickers: [{ sticker_id: 104, pack_id: 11 }],
          },
        ];
  const live = createVkLive({
    limiter: { wait: async () => {} },
    sleep: async () => {},
    fetchImpl: async (url, options) => {
      const method = new URL(url).pathname.split('/').at(-1);
      const params = Object.fromEntries(new URLSearchParams(options.body));
      calls.push({ method, ...params, access_token: '<redacted>' });
      let response = await hook?.(method, params, calls.length);
      if (response === undefined) {
        if (method === 'users.get') {
          response = [{ id: account }];
        } else if (method === 'store.getProducts') {
          const ids = params.product_ids?.split(',').map(Number);
          const items = packs.filter((pack) =>
            ids ? ids.includes(pack.id) : pack.purchased
          );
          response = { count: items.length, items };
        } else if (method === 'store.getStickersKeywords') {
          response = { count: dictionary.length, dictionary };
        } else {
          throw new Error(`Unexpected provider method: ${method}`);
        }
      }
      return new globalThis.Response(JSON.stringify({ response }));
    },
  });
  const options = {
    source: () => ({ live }),
    optionsFor: async () => ({ token }),
    now: () => 1794750000000000 / 1000,
  };
  return {
    store,
    options,
    calls,
    packs,
    dictionary,
    service: createVkStickerCatalog({ store, ...options }),
    hook: (value) => {
      hook = value;
    },
    account: (value) => {
      account = value;
    },
    token: (value) => {
      token = value;
    },
  };
};

export const stickerServer = async () => {
  const fixture = stickerFixture();
  const folder = await mkdtemp(path.join(os.tmpdir(), 'ms-vk-stickers-'));
  let messages = 0;
  const server = await startServer({
    store: fixture.store,
    storeDir: path.join(folder, 'store'),
    port: 0,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: {
      scheduler: false,
      vkStickers: fixture.options,
      send: async () => {
        messages++;
        throw new Error('Unexpected fixture message');
      },
    },
    log: null,
  });
  return {
    ...fixture,
    folder,
    base: `http://127.0.0.1:${server.port}`,
    stats: () => ({
      syntheticReads: fixture.calls.length,
      messages,
      liveProvider: false,
    }),
    close: async () => {
      await server.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
};
if (process.argv.includes('--vk-stickers')) {
  const fixture = await stickerServer();
  console.log(JSON.stringify({ exportRoot: fixture.folder }));
  serveQuestionLinkFixture(fixture);
}
