// Real browser e2e for a sticker set's box and removing a set (R-Y124),
// as Telegram Desktop's: a click on a sticker in a chat opens a dialog
// with the set's title and stickers and an "Add N stickers" button (or
// "Remove N stickers" for a set the user has); a sticker clicked there is
// sent to the chat and closes the box; Escape or a click outside closes
// it; in the emoji panel each installed set has a Remove button that asks
// in the page first and then removes the set. Telegram's answers faked in
// the page, a fake chat in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:sticker-box

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '555';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (10 - n)).toISOString();
const base_ = {
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
};
const stickerMessage = (n, set) => ({
  ...base_,
  id: `msg:telegram:${CHAT}:${n}`,
  body: '',
  timestamp: at(n),
  raw: {
    id: n,
    media: {
      className: 'MessageMediaDocument',
      document: {
        id: String(5000 + n),
        mimeType: 'image/webp',
        size: 1000,
        attributes: [
          { className: 'DocumentAttributeSticker', alt: '🐱', stickerset: set },
          { className: 'DocumentAttributeImageSize', w: 512, h: 512 },
        ],
      },
    },
  },
});
await store.put(
  stickerMessage(1, {
    className: 'InputStickerSetID',
    id: '-7',
    accessHash: '70',
  })
);
await store.put(
  stickerMessage(2, {
    className: 'InputStickerSetShortName',
    shortName: 'mine_cats',
  })
);

// A 1×1 PNG for every picture.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const sticker = (id, emoji = '😀') => ({
  id: String(id),
  kind: 'sticker',
  format: 'webp',
  emoji,
  w: 512,
  h: 512,
});
const range = (from, n) => Array.from({ length: n }, (_, i) => from + i);
const PANEL = {
  ok: true,
  faved: [],
  recent: [],
  sets: [
    { id: '9', title: 'Mine Cats', count: 3, format: 'webp', emoji: false },
    { id: '8', title: 'Mine Dogs', count: 3, format: 'webp', emoji: false },
  ],
};
const BOXES = {
  '-7': {
    ok: true,
    set: {
      id: '-7',
      title: 'Fake Others',
      shortName: 'fake_others',
      count: 5,
      installed: false,
    },
    items: range(700, 5).map((id) => sticker(id, '🦊')),
  },
  mine_cats: {
    ok: true,
    set: {
      id: '9',
      title: 'Mine Cats',
      shortName: 'mine_cats',
      count: 1,
      installed: true,
    },
    items: [sticker(900, '🐱')],
  },
};

const { base, page, until, finish } = await openChatApp('sticker-box', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/stickers', (route) => fulfil(route, PANEL));
await page.route('**/api/telegram/sticker-set', (route) => {
  const { id } = route.request().postDataJSON();
  fulfil(route, {
    ok: true,
    id,
    stickers: range(Number(id) * 100, 3).map(sticker),
  });
});
await page.route('**/api/telegram/gifs', (route) =>
  fulfil(route, { ok: true, gifs: [] })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
await page.route('**/api/telegram/sticker?*', (route) => {
  const url = new URL(route.request().url());
  if (url.searchParams.get('full') === '1') {
    return route.fulfill({ status: 404, body: '' });
  }
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});
// The message's own sticker picture (a chat's media).
await page.route('**/api/telegram/media?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
const boxes = [];
await page.route('**/api/telegram/sticker-set-box', (route) => {
  const body = route.request().postDataJSON();
  boxes.push(body);
  const box = BOXES[body.id ?? body.shortName];
  return fulfil(route, box ?? { ok: false, error: 'unknown set' });
});
const installs = [];
await page.route('**/api/telegram/sticker-set-install', (route) => {
  const body = route.request().postDataJSON();
  installs.push(body);
  if (body.install === false) {
    PANEL.sets = PANEL.sets.filter((s) => s.id !== body.id);
  }
  return fulfil(route, { ok: true, id: body.id, installed: body.install });
});
const sends = [];
await page.route('**/api/telegram/send-document', (route) => {
  sends.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: CHAT });
});

const dialog = page.locator('.sticker-box');
const messageSticker = (n) => page.locator('.bubble-sticker.has-set').nth(n);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page
    .locator('.bubble-sticker.has-set')
    .first()
    .waitFor({ timeout: 10000 });

  // A set the user does not have: Add N stickers.
  await messageSticker(0).click();
  await dialog.locator('[data-sticker="704"]').waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('.sticker-box-title').textContent()) ===
      'Fake Others',
    'the title'
  );
  assert(
    JSON.stringify(boxes[0]) === '{"id":"-7","accessHash":"70"}',
    `asked: ${JSON.stringify(boxes[0])}`
  );
  await dialog.locator('[data-sticker="704"]').waitFor({ timeout: 5000 });
  assert((await dialog.locator('[data-sticker]').count()) === 5, 'five');
  const add = dialog.locator('[data-action="box-add"]');
  assert(
    (await add.textContent()) === 'Add 5 stickers',
    `button: ${await add.textContent()}`
  );

  // Escape closes; a click outside closes.
  await page.keyboard.press('Escape');
  await until(async () => (await dialog.count()) === 0, 'closed by Escape');
  await messageSticker(0).click();
  await dialog.waitFor({ timeout: 5000 });
  await page.mouse.click(5, 5);
  await until(async () => (await dialog.count()) === 0, 'closed outside');

  // A click on a sticker sends it and closes.
  await messageSticker(0).click();
  await dialog.locator('[data-sticker="702"]').click();
  await until(() => sends.length === 1, 'sent');
  assert(
    sends[0].id === '702' && sends[0].chat === CHAT,
    `send: ${JSON.stringify(sends[0])}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed after send');

  // Add: asked to install, then the box closes.
  await messageSticker(0).click();
  await dialog.locator('[data-action="box-add"]').click();
  await until(() => installs.length === 1, 'install asked');
  assert(
    installs[0].id === '-7' && installs[0].install === true,
    `install: ${JSON.stringify(installs[0])}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed after add');

  // A set the user has, named by its short name: Remove N stickers.
  await messageSticker(1).click();
  const remove = dialog.locator('[data-action="box-remove"]');
  await remove.waitFor({ timeout: 5000 });
  assert(
    (await remove.textContent()) === 'Remove 1 sticker',
    `button: ${await remove.textContent()}`
  );
  assert(
    JSON.stringify(boxes.at(-1)) === '{"shortName":"mine_cats"}',
    `asked: ${JSON.stringify(boxes.at(-1))}`
  );
  await page.keyboard.press('Escape');
  await until(async () => (await dialog.count()) === 0, 'closed');

  // The emoji panel: Remove asks in the page, then the set leaves.
  await page.locator('[data-action="emoji"]').click();
  const panel = page.locator('.emoji-panel');
  await panel.waitFor({ timeout: 5000 });
  await panel.locator('[data-tab="stickers"]').click();
  await panel.locator('[data-remove-set="8"]').waitFor({ timeout: 5000 });
  assert(
    (await panel.locator('[data-remove-set]').count()) === 2,
    'a Remove for each set'
  );
  await panel.locator('[data-remove-set="8"]').click();
  const ask = page.locator('.sticker-ask');
  await ask.waitFor({ timeout: 5000 });
  assert(installs.length === 1, 'nothing removed before the answer');
  await ask.locator('button:not(.danger)').click();
  await until(async () => (await ask.count()) === 0, 'question closed');
  assert(installs.length === 1, 'cancel removes nothing');
  await panel.locator('[data-remove-set="8"]').click();
  await ask.locator('[data-action="remove-set-confirm"]').click();
  await until(() => installs.length === 2, 'remove asked');
  assert(
    installs[1].id === '8' && installs[1].install === false,
    `remove: ${JSON.stringify(installs[1])}`
  );
  await until(
    async () => (await panel.locator('[data-remove-set="8"]').count()) === 0,
    'the set left the panel'
  );
  assert(
    (await panel.locator('[data-remove-set="9"]').count()) === 1,
    'the other stays'
  );
});
