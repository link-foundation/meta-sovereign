// Real browser e2e for inbox pulls (R-Z8): the "Fetch now" button on the
// VK, Upwork and PeoplePerHour cards of Connections (not connected -> a
// clear message, connected -> messages fetched, a second press at once ->
// "wait"), and a VK chat drawn with its attachments: a photo and a sticker
// from VK's picture CDN (allowed by the CSP `img-src`, answered by the test
// so no request leaves the machine), a voice message and a file as links,
// and a reaction shown as an emoji. Fake VK / Upwork / PeoplePerHour in the
// server, a memory store, a headless browser. Not part of `npm test`; run:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:inbox-pull

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import { createFakeVk, userMethods, FAKE_VK_BASE } from './helpers/fake-vk.js';
import { fakePph, fakeUpwork } from './helpers/fake-marketplaces.js';

const store = createMemoryStore();
await store.put({
  ...{ id: 'msg:telegram:5:1', source: 'telegram', chat: '5' },
  ...{ chatName: 'Some Friend', senderName: 'Some Friend' },
  ...{ chatType: 'private', sender: '5', body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const attached = {
  id: 31,
  conversation_message_id: 31,
  peer_id: 7,
  from_id: 7,
  date: Math.floor(Date.now() / 1000) - 30,
  text: 'look at these',
  reactions: [{ reaction_id: 1, count: 2, user_ids: [7, 8] }],
  attachments: [
    {
      type: 'photo',
      photo: {
        sizes: [
          {
            url: 'https://sun9-5.userapi.com/photo.jpg',
            width: 604,
            height: 400,
          },
        ],
      },
    },
    {
      type: 'sticker',
      sticker: {
        images: [{ url: 'https://sun9-6.userapi.com/sticker.png', width: 128 }],
      },
    },
    {
      type: 'audio_message',
      audio_message: { link_ogg: 'https://cs1.vk.me/voice.ogg', duration: 7 },
    },
    {
      type: 'doc',
      doc: {
        title: 'cv.pdf',
        url: 'https://vk.com/doc1_2',
        type: 1,
        size: 1024,
      },
    },
  ],
};
const fakeVk = createFakeVk({
  methods: userMethods({
    'messages.getConversations': () => ({
      count: 1,
      items: [
        {
          conversation: { peer: { id: 7, type: 'user' } },
          last_message: attached,
        },
      ],
      profiles: [{ id: 7, first_name: 'Ann', last_name: 'Lee' }],
    }),
    'messages.getHistory': () => ({ count: 0, items: [] }),
  }),
});

const { page, base, until, finish } = await openChatApp('inbox-pull', {
  store,
  serverOptions: {
    pulls: {
      vk: {
        fetchImpl: fakeVk.fetchImpl,
        baseUrl: FAKE_VK_BASE,
        requestsPerSecond: 1000,
      },
      upwork: fakeUpwork(),
      peopleperhour: fakePph(),
    },
  },
});

// VK's picture CDN is answered here: the request never leaves the machine,
// and a load proves the page's CSP lets these hosts through.
const cdn = [];
await page.route(/https:\/\/sun9-\d+\.userapi\.com\/.*/, (route) => {
  cdn.push(route.request().url());
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});

const token = (source) =>
  store.put({
    id: `secret:${source}:access-token`,
    tokens: ['secret', source, 'access-token'],
    children: [],
    token: `${source}-test-token`,
  });

const card = (id) => page.locator(`[data-provider-id="${id}"]`);
const status = (id) => card(id).locator('[data-fetch-status]');
const press = (id) => card(id).locator('[data-action="fetch-now"]').click();

const fetchSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator('[data-chat="telegram:5"]').waitFor();
  await page.locator('button[data-view="connections"]').click();
  for (const id of ['vk', 'upwork', 'peopleperhour']) {
    await card(id).waitFor();
    // Not connected: a clear message, nothing fetched.
    await press(id);
    await until(
      async () =>
        (await status(id).getAttribute('data-fetch-status')) === 'error',
      `${id}: not connected`
    );
    assert(
      /access token/i.test(await status(id).textContent()),
      `${id}: asks for the token`
    );
    await token(id);
    await press(id);
    await until(
      async () => (await status(id).getAttribute('data-fetch-status')) === 'ok',
      `${id}: fetched`
    );
    // A second press at once is held back by the server.
    await press(id);
    await until(
      async () =>
        (await status(id).getAttribute('data-fetch-status')) === 'wait',
      `${id}: held back`
    );
  }
  const ids = (await store.query()).map((l) => l.id);
  assert(ids.includes('msg:vk:31'), 'the VK message was stored');
  assert(ids.includes('msg:upwork:mA'), 'the Upwork message was stored');
  assert(
    ids.includes('msg:peopleperhour:mP'),
    'the PeoplePerHour message was stored'
  );
};

const mediaSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator('[data-chat="vk:7"]').click();
  const media = page.locator('[data-remote-media]');
  await media.waitFor({ timeout: 5000 });
  assert(
    (await media.getAttribute('data-remote-media')) === '4',
    'all four attachments'
  );
  const photo = media.locator('img[data-remote-kind="photo"]');
  const sticker = media.locator('img[data-remote-kind="sticker"]');
  await until(
    () =>
      photo.evaluate((img) => img.complete && img.naturalWidth > 0) &&
      sticker.evaluate((img) => img.complete && img.naturalWidth > 0),
    'the pictures loaded from the VK CDN'
  );
  assert(cdn.length >= 2, `the CDN was asked for both pictures: ${cdn.length}`);
  const voice = media.locator('a[data-remote-kind="voice"]');
  assert(
    (await voice.getAttribute('href')) === 'https://cs1.vk.me/voice.ogg',
    'the voice message links to its file'
  );
  assert(
    (await media.locator('a[data-remote-kind="file"]').textContent()).includes(
      'cv.pdf'
    ),
    'the file is named'
  );
  const reaction = page.locator('.bubble-reaction');
  assert((await reaction.textContent()).includes('2'), 'the reaction count');
  assert(
    !/^1\b/.test((await reaction.textContent()).trim()),
    'an emoji, not the id'
  );
};

await finish(async () => {
  await fetchSteps();
  await mediaSteps();
});
