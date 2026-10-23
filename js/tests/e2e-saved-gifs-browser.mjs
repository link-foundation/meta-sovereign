// Real browser e2e for saved GIFs (R-Y171), as Telegram Desktop's: the
// context menu of a GIF message in a chat offers "Save GIF", or "Remove
// from GIFs" when it is saved; the choice asks the server (messages.saveGif)
// and the panel's saved list follows; a right click on a GIF in the panel
// offers "Remove from GIFs", and the message menu follows that too. Other
// messages have neither item. Telegram's answers faked in the page, fake
// chats in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app, nothing is sent. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:saved-gifs

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '555';
const at = Date.now();
const store = createMemoryStore();
const gifMedia = (id) => ({
  className: 'MessageMediaDocument',
  document: {
    className: 'Document',
    id: String(id),
    accessHash: '1',
    mimeType: 'video/mp4',
    size: 1000,
    attributes: [
      { className: 'DocumentAttributeVideo', duration: 1, w: 320, h: 240 },
      { className: 'DocumentAttributeAnimated' },
    ],
  },
});
const put = (id, body, media = null) =>
  store.put({
    id: `msg:telegram:${CHAT}:${id}`,
    source: 'telegram',
    chat: CHAT,
    chatName: 'Fake Dave',
    chatType: 'user',
    sender: CHAT,
    senderName: 'Fake Dave',
    body,
    timestamp: new Date(at - (10 - id) * 60_000).toISOString(),
    raw: { id, ...(media ? { media } : {}) },
  });
await put(1, 'a saved gif here', gifMedia(900));
await put(2, 'a new gif here', gifMedia(950));
await put(3, 'just words');

const gif = (id) => ({
  id: String(id),
  kind: 'gif',
  format: 'mp4',
  emoji: null,
  w: 320,
  h: 240,
});
let saved = [900, 901];

const { base, page, until, finish } = await openChatApp('saved-gifs', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
await page.route('**/api/telegram/stickers', (route) =>
  fulfil(route, { ok: true, faved: [], recent: [], sets: [] })
);
await page.route('**/api/telegram/sticker?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
let listed = 0;
await page.route('**/api/telegram/gifs', (route) => {
  listed += 1;
  return fulfil(route, { ok: true, gifs: saved.map(gif) });
});
// The message menu's saves (messages.saveGif on the server).
const gifSaves = [];
await page.route('**/api/telegram/gif-save', (route) => {
  const body = route.request().postDataJSON();
  gifSaves.push(body);
  const id = body.message === 1 ? 900 : 950;
  saved = body.unsave ? saved.filter((n) => n !== id) : [...saved, id];
  return fulfil(route, { ok: true, id: String(id), saved: !body.unsave });
});
// The panel's own menu.
const panelSaves = [];
await page.route('**/api/telegram/sticker-save', (route) => {
  const body = route.request().postDataJSON();
  panelSaves.push(body);
  saved = saved.filter((n) => String(n) !== body.id);
  return fulfil(route, { ok: true });
});

const rightClick = async (n) => {
  const body = page.locator(
    `[data-row="msg:telegram:${CHAT}:${n}"] .bubble-body`
  );
  await body.scrollIntoViewIfNeeded();
  const box = await body.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10, { button: 'right' });
  await page.waitForSelector('[role=menu] [data-action]', { timeout: 3000 });
};
const items = () =>
  page.$$eval('[role=menu] [data-action]', (n) =>
    n.map((e) => e.dataset.action)
  );
const choose = (action) =>
  page.locator(`[role=menu] [data-action="${action}"]`).click();
const closeMenu = async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role=menu]', { state: 'detached' });
};
const panel = page.locator('.emoji-panel');

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await until(() => listed > 0, 'saved GIFs asked');
  await page.waitForTimeout(300);

  // A GIF not saved: "Save GIF"; words alone have neither item.
  await rightClick(2);
  let menu = await items();
  assert(menu.includes('saveMessageGif'), `new gif: ${menu}`);
  assert(!menu.includes('unsaveMessageGif'), `new gif: ${menu}`);
  await closeMenu();
  await rightClick(3);
  menu = await items();
  assert(
    !menu.includes('saveMessageGif') && !menu.includes('unsaveMessageGif'),
    `words: ${menu}`
  );
  await closeMenu();

  // A saved one: "Remove from GIFs".
  await rightClick(1);
  menu = await items();
  assert(menu.includes('unsaveMessageGif'), `saved gif: ${menu}`);
  assert(!menu.includes('saveMessageGif'), `saved gif: ${menu}`);
  await closeMenu();

  // Save the new one: asked of the server, the menu changes, the panel follows.
  await rightClick(2);
  await choose('saveMessageGif');
  await until(() => gifSaves.length === 1, 'saved');
  assert(
    gifSaves[0].chat === CHAT &&
      gifSaves[0].message === 2 &&
      gifSaves[0].unsave === false,
    `save: ${JSON.stringify(gifSaves[0])}`
  );
  await rightClick(2);
  menu = await items();
  assert(menu.includes('unsaveMessageGif'), `after save: ${menu}`);
  await closeMenu();
  await page.locator('[data-action="emoji"]').click();
  await panel.waitFor({ timeout: 5000 });
  await panel.locator('[data-tab="gifs"]').click();
  await panel.locator('[data-sticker="950"]').waitFor({ timeout: 5000 });
  assert(
    (await panel.locator('[data-sticker="900"]').count()) === 1,
    'the others stay'
  );

  // Right click in the panel: "Remove from GIFs".
  await panel
    .locator('[data-sticker="950"]')
    .first()
    .click({ button: 'right' });
  await page.waitForSelector('[role=menu] [data-action]', { timeout: 3000 });
  menu = await items();
  assert(menu.includes('deleteGif'), `panel menu: ${menu}`);
  await choose('deleteGif');
  await until(() => panelSaves.length === 1, 'removed in the panel');
  assert(
    panelSaves[0].id === '950' && panelSaves[0].action === 'unsaveGif',
    `panel save: ${JSON.stringify(panelSaves[0])}`
  );
  await until(
    async () => (await panel.locator('[data-sticker="950"]').count()) === 0,
    'gone from the panel'
  );
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  // The message menu follows the panel: "Save GIF" again.
  await until(async () => {
    await rightClick(2);
    const now = await items();
    await closeMenu();
    return now.includes('saveMessageGif');
  }, 'the message menu follows the panel');

  // Remove a saved one from its message.
  await rightClick(1);
  await choose('unsaveMessageGif');
  await until(() => gifSaves.length === 2, 'removed from the message');
  assert(
    gifSaves[1].message === 1 && gifSaves[1].unsave === true,
    `remove: ${JSON.stringify(gifSaves[1])}`
  );
  assert(!saved.includes(900), 'the server list changed');
});
