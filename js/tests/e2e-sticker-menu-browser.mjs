// Real browser e2e for a sticker's and a GIF's menu in the panel
// (R-Y115), as Telegram Desktop's: a right click opens it over the panel,
// which stays open under it; a favourite taken off, a recent one removed,
// a GIF deleted and a found one saved, each asked of the server and the
// lists asked again; "Send without sound" sends silently, "Schedule"
// opens the dialog and sends at the time chosen; Escape closes only the
// menu. Telegram's answers faked in the page, a fake chat in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app, nothing is sent. Not part of `npm test`; run
// it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:sticker-menu

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('sticker-menu');

const CHAT = '555';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
  body: 'look at this',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// A 1×1 PNG for every picture.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const sticker = (id, emoji = '😀', format = 'webp') => ({
  id: String(id),
  kind: 'sticker',
  format,
  emoji,
  w: 512,
  h: 512,
});
const range = (from, n) => Array.from({ length: n }, (_, i) => from + i);
const PANEL = {
  ok: true,
  faved: [sticker(1, '⭐')],
  recent: range(100, 30).map((id) => sticker(id)),
  sets: [
    { id: '7', title: 'Fake Cats', count: 10, format: 'webp', emoji: false },
    { id: '8', title: 'Fake Dogs', count: 10, format: 'webm', emoji: false },
  ],
};
const SETS = {
  7: range(700, 10).map((id) => sticker(id, '🐱')),
  8: range(800, 10).map((id) => sticker(id, '🐶', 'webm')),
};
const GIFS = {
  ok: true,
  gifs: range(900, 4).map((id) => ({
    id: String(id),
    kind: 'gif',
    format: 'mp4',
    emoji: null,
    w: 320,
    h: 240,
  })),
};

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-sticker-menu-'));
const handle = await startServer({
  localUi: true,
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: {
    scheduler: false,
    setTyping: async () => ({ supported: false }),
    send: async () => ({ via: 'fake' }),
  },
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const fulfil = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
await page.route('**/api/telegram/status', (route) =>
  fulfil(route, {
    connected: true,
    kind: 'user',
    account: { username: 'owner' },
    offline: false,
    needsLogin: false,
  })
);
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const asked = { panel: 0, sets: [], gifs: 0, pictures: 0 };
await page.route('**/api/telegram/stickers', (route) => {
  asked.panel += 1;
  fulfil(route, PANEL);
});
await page.route('**/api/telegram/sticker-set', (route) => {
  const { id } = route.request().postDataJSON();
  asked.sets.push(id);
  fulfil(route, { ok: true, id, stickers: SETS[id] });
});
await page.route('**/api/telegram/gifs', (route) => {
  asked.gifs += 1;
  fulfil(route, GIFS);
});
await page.route('**/api/telegram/sticker?*', (route) => {
  const url = new URL(route.request().url());
  if (url.searchParams.get('full') === '1') {
    return route.fulfill({ status: 404, body: '' });
  }
  asked.pictures += 1;
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});
await page.route('**/api/telegram/gif-search', (route) =>
  fulfil(route, {
    ok: true,
    gifs: [{ ...GIFS.gifs[0], id: '1000' }],
    next: null,
  })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
// The menu's saves, as Telegram would answer them: the lists change.
const saves = [];
await page.route('**/api/telegram/sticker-save', (route) => {
  const body = route.request().postDataJSON();
  saves.push(body);
  if (body.action === 'unfave') {
    PANEL.faved = PANEL.faved.filter((s) => s.id !== body.id);
  } else if (body.action === 'unrecent') {
    PANEL.recent = PANEL.recent.filter((s) => s.id !== body.id);
  } else if (body.action === 'unsaveGif') {
    GIFS.gifs = GIFS.gifs.filter((g) => g.id !== body.id);
  }
  return fulfil(route, { ok: true });
});
const sends = [];
await page.route('**/api/telegram/send-document', (route) => {
  sends.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: CHAT });
});

const until = async (check, what, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out: ${what}`);
};

const open = async () => {
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
};

const panel = page.locator('.emoji-panel');
const button = page.locator('[data-action="emoji"]');
const menu = page.locator('.msg-context-menu');
const openPanel = async (tab = 'stickers') => {
  await button.click();
  await panel.waitFor({ timeout: 5000 });
  await panel.locator(`[data-tab="${tab}"]`).click();
};
const menuOf = async (id) => {
  await panel.locator(`[data-sticker="${id}"]`).first().click({
    button: 'right',
  });
  await menu.waitFor({ timeout: 5000 });
  return menu
    .locator('[data-action]')
    .evaluateAll((items) => items.map((i) => i.dataset.action));
};
const choose = (action) => menu.locator(`[data-action="${action}"]`).click();

let failed = false;
try {
  await page.goto(`${base}/`);
  await open();
  await openPanel();
  await panel.locator('[data-sticker="1"]').waitFor({ timeout: 5000 });

  // A favourite: what its menu offers, then taken off; the panel stays.
  let items = await menuOf('1');
  assert(
    items.join() === 'sendSilent,schedule,unfaveSticker',
    `faved: ${items}`
  );
  const panels = asked.panel;
  await choose('unfaveSticker');
  await until(() => saves.length === 1, 'unfaved');
  assert(
    saves[0].id === '1' && saves[0].action === 'unfave',
    `save: ${JSON.stringify(saves[0])}`
  );
  await until(() => asked.panel > panels, 'the panel asked again');
  await until(
    async () => (await panel.locator('[data-category="faved"]').count()) === 0,
    'the favourites gone'
  );
  assert((await panel.count()) === 1, 'the panel stays open');

  // A recent one: made a favourite or removed; Escape closes the menu only.
  items = await menuOf('100');
  assert(
    items.join() === 'sendSilent,schedule,faveSticker,removeRecent',
    `recent: ${items}`
  );
  await page.keyboard.press('Escape');
  await until(async () => (await menu.count()) === 0, 'menu closed');
  assert((await panel.count()) === 1, 'Escape left the panel open');
  await menuOf('100');
  await choose('removeRecent');
  await until(() => saves.length === 2, 'removed');
  assert(saves[1].action === 'unrecent', `save: ${JSON.stringify(saves[1])}`);
  await until(
    async () => (await panel.locator('[data-sticker="100"]').count()) === 0,
    'gone from recent'
  );

  // Send without sound: sent silently, the panel closed.
  await menuOf('101');
  await choose('sendSilent');
  await until(() => sends.length === 1, 'sent silently');
  assert(
    sends[0].id === '101' && sends[0].silent === true && !sends[0].scheduleDate,
    `silent: ${JSON.stringify(sends[0])}`
  );
  await until(async () => (await panel.count()) === 0, 'closed after');

  // Schedule: the dialog over the panel, then sent at the time chosen.
  await openPanel();
  await menuOf('102');
  await choose('schedule');
  const dialog = page.locator('.schedule-dialog');
  await dialog.waitFor({ timeout: 5000 });
  assert((await panel.count()) === 1, 'the panel under the dialog');
  await dialog.locator('button.primary').click();
  await until(() => sends.length === 2, 'scheduled');
  const now = Date.now() / 1000;
  assert(
    sends[1].id === '102' &&
      sends[1].scheduleDate > now + 30 * 60 &&
      sends[1].scheduleDate < now + 2 * 3600,
    `scheduled: ${JSON.stringify(sends[1])}`
  );
  await until(async () => (await panel.count()) === 0, 'closed after');

  // GIFs: a saved one deleted, a found one saved.
  await openPanel('gifs');
  await panel.locator('[data-sticker="900"]').waitFor({ timeout: 5000 });
  items = await menuOf('900');
  assert(items.join() === 'sendSilent,schedule,deleteGif', `gif: ${items}`);
  const gifs = asked.gifs;
  await choose('deleteGif');
  await until(() => saves.length === 3, 'deleted');
  assert(
    saves[2].id === '900' && saves[2].action === 'unsaveGif',
    `save: ${JSON.stringify(saves[2])}`
  );
  await until(() => asked.gifs > gifs, 'the GIFs asked again');
  await until(
    async () => (await panel.locator('[data-sticker="900"]').count()) === 0,
    'the GIF gone'
  );
  await panel.locator('[data-field="gifSearch"]').fill('dance');
  await panel.locator('[data-sticker="1000"]').waitFor({ timeout: 5000 });
  items = await menuOf('1000');
  assert(items.join() === 'sendSilent,schedule,saveGif', `found: ${items}`);
  await choose('saveGif');
  await until(() => saves.length === 4, 'saved');
  assert(
    saves[3].id === '1000' && saves[3].action === 'saveGif',
    `save: ${JSON.stringify(saves[3])}`
  );
  assert(sends.length === 2, 'nothing else sent');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-sticker-menu] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-sticker-menu] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-sticker-menu-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
