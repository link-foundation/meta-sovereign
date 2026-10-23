// Real browser e2e for chat backgrounds (R-Y155), as Telegram Desktop's
// "Chat background": Settings lists what Telegram offers as a grid (with
// "No background" and "Upload from file"); an image wallpaper picked there
// is drawn by its own layer behind the messages, a colour gradient sets the
// gradient, the choice survives a reload; a chat with a wallpaper of its
// own shows that one; "Set wallpaper for this chat…" asks Telegram for a
// listed one (faked here, never a real account). Telegram's answers faked
// in the page, fake chats in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:wallpapers

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const store = createMemoryStore();
for (const [chat, name] of [
  [ANN, 'Ann Lee'],
  [BOB, 'Bob Ray'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

const page_ = (id, kind, extra = {}) => ({
  id,
  slug: `slug${id}`,
  kind,
  dark: false,
  colors: [],
  rotation: 0,
  intensity: 0,
  blur: false,
  motion: false,
  file: kind !== 'colors',
  ...extra,
});
const LIST = [
  page_('11', 'image'),
  page_('12', 'pattern', {
    colors: ['#112233', '#445566'],
    rotation: 45,
    intensity: -40,
  }),
  page_('13', 'colors', { colors: ['#ff8800', '#0088ff'], rotation: 90 }),
];
const BOBS = page_('21', 'image', { slug: 'bobwall' });

const { base, page, until, finish } = await openChatApp('wallpapers', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, {
    chat,
    kind: 'user',
    title: chat === BOB ? 'Bob Ray' : 'Ann Lee',
    members: 1,
    ...(chat === BOB ? { wallpaper: BOBS } : {}),
  });
});
await page.route('**/api/telegram/wallpapers', (route) =>
  fulfil(route, { ok: true, wallpapers: LIST })
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const pictures = [];
await page.route('**/api/telegram/wallpaper?*', (route) => {
  const query = new URL(route.request().url()).searchParams;
  pictures.push(query.get('id'));
  return query.get('id') === '12'
    ? route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><path d="M0 0h2v2z"/></svg>',
      })
    : route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});
const sets = [];
await page.route('**/api/telegram/chat-wallpaper-set', (route) => {
  sets.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const layer = page.locator('.chat-wall > .chat-wall-layer');
const look = () =>
  layer.evaluate((node) => {
    const style = globalThis.getComputedStyle(node);
    const scroll = document.querySelector('.chat-scroll');
    const a = node.getBoundingClientRect();
    const b = scroll.getBoundingClientRect();
    return {
      image: style.backgroundImage,
      position: style.position,
      layerZ: style.zIndex,
      scrollZ: globalThis.getComputedStyle(scroll).zIndex,
      covers:
        a.left <= b.left + 1 &&
        a.top <= b.top + 1 &&
        a.right >= b.right - 1 &&
        a.bottom >= b.bottom - 1,
      wall: node.dataset.wall,
    };
  });
const openChat = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page
    .locator(`[data-message="msg:telegram:${chat}:1"]`)
    .waitFor({ timeout: 10000 });
};
const toSettings = async () => {
  await page.locator('button[data-view="settings"]').click();
  await page.locator('.chat-background').waitFor({ timeout: 10000 });
};
// Back to the Chat section, which opens no chat by itself.
const toChat = async (chat) => {
  await page.locator('button[data-view="chat"]').click();
  await openChat(chat);
};

const listSteps = async () => {
  await page.goto(`${base}/`);
  await openChat(ANN);
  assert((await layer.count()) === 0, 'no layer without a background');

  // The grid: none, upload, and what Telegram offers.
  await toSettings();
  const grid = page.locator('.chat-background .wallpaper-grid');
  await until(
    async () => (await grid.locator('[data-wallpaper]').count()) === 3,
    'three wallpapers listed'
  );
  assert(
    (await grid.locator('[data-action="wallpaper-none"]').count()) === 1,
    'No background'
  );
  assert(
    (await grid.locator('[data-action="wallpaper-upload"]').count()) === 1,
    'Upload from file'
  );
  assert(
    (await grid
      .locator('[data-action="wallpaper-none"]')
      .getAttribute('aria-pressed')) === 'true',
    'none is current'
  );
  const kinds = await grid
    .locator('[data-wallpaper]')
    .evaluateAll((list) => list.map((n) => n.dataset.kind));
  assert(kinds.join() === 'image,pattern,colors', `kinds: ${kinds}`);

  // An image wallpaper goes behind the messages.
  await grid.locator('[data-wallpaper="11"]').click();
  await toChat(ANN);
  await layer.waitFor({ timeout: 10000 });
  await until(
    async () => (await look()).image.includes('wallpaper?id=11'),
    'the picture is the layer’s background'
  );
  const picture = await look();
  assert(picture.position === 'absolute', `layer: ${picture.position}`);
  assert(picture.covers, 'the layer covers the message list');
  assert(
    Number(picture.layerZ) < Number(picture.scrollZ),
    `behind the messages: ${picture.layerZ} < ${picture.scrollZ}`
  );
  assert(picture.wall === 'image', picture.wall);
};

const pickSteps = async () => {
  // A gradient sets the gradient.
  await toSettings();
  await page.locator('[data-wallpaper="13"]').click();
  await toChat(ANN);
  await until(
    async () => (await look()).image.includes('linear-gradient'),
    'the gradient is the background'
  );
  const gradient = await look();
  assert(gradient.wall === 'colors', gradient.wall);
  assert(
    gradient.image.includes('rgb(255, 136, 0)') &&
      gradient.image.includes('rgb(0, 136, 255)'),
    gradient.image
  );

  // A pattern over its colours, drawn light with a dark one's intensity.
  await toSettings();
  await page.locator('[data-wallpaper="12"]').click();
  await toChat(ANN);
  await until(
    async () => (await look()).wall === 'pattern',
    'the pattern layer'
  );
  const dots = await layer.evaluate((node) => {
    const after = globalThis.getComputedStyle(node, '::after');
    return { opacity: after.opacity, image: after.backgroundImage };
  });
  assert(dots.opacity === '0.4', `intensity as opacity: ${dots.opacity}`);
  await until(
    async () =>
      (
        await layer.evaluate(
          (node) => globalThis.getComputedStyle(node, '::after').backgroundImage
        )
      ).includes('wallpaper?id=12'),
    'the pattern file is drawn'
  );
};

const ownSteps = async () => {
  // The choice survives a reload.
  await toSettings();
  await page.locator('[data-wallpaper="13"]').click();
  await page.reload();
  await openChat(ANN);
  await layer.waitFor({ timeout: 10000 });
  assert(
    (await look()).image.includes('linear-gradient'),
    'the gradient after a reload'
  );
  await toSettings();
  assert(
    (await page
      .locator('[data-wallpaper="13"]')
      .getAttribute('aria-pressed')) === 'true',
    'the grid marks the saved one'
  );

  // A chat with a wallpaper of its own shows that one.
  await toChat(BOB);
  await until(
    async () => (await look()).image.includes('wallpaper?id=21'),
    'Bob’s own wallpaper'
  );
  await openChat(ANN);
  await until(
    async () => (await look()).image.includes('linear-gradient'),
    'Ann’s chat is back to the app’s background'
  );
};

const setSteps = async () => {
  // "Set wallpaper for this chat…": a listed one, for the user only.
  await page.locator('[data-action="chat-about"]').click();
  await page
    .locator('.person-panel [data-action="chat-wallpaper"]')
    .click({ timeout: 10000 });
  const dialog = page.locator('[data-dialog="chat-wallpaper"]');
  await dialog.locator('[data-wallpaper="11"]').click({ timeout: 10000 });
  await until(() => sets.length === 1, 'asked Telegram');
  assert(
    sets[0].chat === ANN &&
      sets[0].id === '11' &&
      sets[0].forBoth === undefined,
    `set: ${JSON.stringify(sets[0])}`
  );
  await until(
    async () => (await look()).image.includes('wallpaper?id=11'),
    'the chat shows the wallpaper just set'
  );

  // No background: the layer goes (the chat's own stays).
  await toSettings();
  await page.locator('[data-action="wallpaper-none"]').click();
  await page.reload();
  await openChat(ANN);
  await page.waitForTimeout(300);
  assert((await layer.count()) === 0, 'No background: no layer');
  await openChat(BOB);
  await until(
    async () => (await look()).image.includes('wallpaper?id=21'),
    'Bob’s own after a reload'
  );
  await page.locator('button[data-view="settings"]').click();
  await page.locator('.chat-background').waitFor();
  assert(pictures.includes('11') && pictures.includes('21'), 'files asked');
};

await finish(async () => {
  await listSteps();
  await pickSteps();
  await ownSteps();
  await setSteps();
});
