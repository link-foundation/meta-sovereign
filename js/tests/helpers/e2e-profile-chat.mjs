// The frame the profile e2e tests share (R-Y185): a person (5) and the
// user's own chat (7) in a memory store, the routes of an info column that
// are not under test answered, and a picture for every story.

import { createMemoryStore } from '../../src/storage/universal.js';
import { fulfil, openChatApp } from './e2e-chat.mjs';

export const PERSON = '5';
export const SELF = '7';
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/** The app with both chats; `{ base, page, until, finish }`. */
export const openProfileApp = async (name) => {
  const store = createMemoryStore();
  const now = Date.now();
  for (const [chat, title] of [
    [PERSON, 'Some Friend'],
    [SELF, 'Saved Messages'],
  ]) {
    await store.put({
      id: `msg:telegram:${chat}:1`,
      source: 'telegram',
      chat,
      chatName: title,
      chatType: 'private',
      sender: chat,
      senderName: title,
      body: 'hello',
      timestamp: new Date(now - 60_000).toISOString(),
      raw: { id: 1 },
    });
  }
  const app = await openChatApp(name, { store });
  const { page } = app;
  await page.setViewportSize({ width: 1200, height: 1600 });
  const fixed = {
    history: { written: 0, cached: 0, complete: true },
    'shared-counts': { ok: true, counts: {} },
    'star-gifts': { ok: true, count: 0, mine: false, gifts: [], next: null },
    'stars-status': { ok: true, balance: 120 },
  };
  for (const [route, answer] of Object.entries(fixed)) {
    await page.route(`**/api/telegram/${route}`, (r) => fulfil(r, answer));
  }
  await page.route('**/api/telegram/chat-info*', (route) => {
    const chat = new URL(route.request().url()).searchParams.get('chat');
    return fulfil(route, { chat, kind: 'user', title: 'Some Friend' });
  });
  await page.route('**/api/telegram/story?*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  );
  await page.route('**/api/telegram/sticker*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  );
  return app;
};

/** Opens a chat's info column. */
export const openAbout = async ({ base, page }, chat) => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${chat}"]`).waitFor();
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
};
