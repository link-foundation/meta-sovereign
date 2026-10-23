// Real browser e2e for stickers and GIFs (R-Y105): the emoji panel's
// Stickers tab lists the favourite and recent stickers, then each set,
// a set's stickers asked only as the list comes to it (the bar below
// jumps there); a click sends the sticker at once and closes the panel;
// the chosen tab is kept; the GIFs tab lists the saved GIFs and sends
// one; a refused send says why. Telegram's answers faked in the page,
// a fake chat in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app, nothing is sent.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:stickers

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('stickers');

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

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-stickers-'));
const handle = await startServer({
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
const sends = [];
let refuse = false;
await page.route('**/api/telegram/send-document', (route) => {
  sends.push(route.request().postDataJSON());
  return refuse
    ? fulfil(
        route,
        { error: 'CHAT_SEND_STICKERS_FORBIDDEN', code: 'forbidden' },
        502
      )
    : fulfil(route, { ok: true, chat: CHAT });
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
const openPanel = async () => {
  await button.click();
  await panel.waitFor({ timeout: 5000 });
};

let failed = false;
try {
  await page.goto(`${base}/`);
  await open();
  await openPanel();
  const tabs = await panel
    .locator('.emoji-tab')
    .evaluateAll((list) => list.map((b) => b.dataset.tab));
  assert(tabs.join() === 'emoji,stickers,gifs', `tabs: ${tabs}`);
  assert(asked.panel === 0, 'nothing asked on the emoji tab');

  // The Stickers tab: favourites, recent, then the sets.
  await panel.locator('[data-tab="stickers"]').click();
  await panel
    .locator('[data-category="faved"] .sticker-cell')
    .first()
    .waitFor({ timeout: 5000 });
  const sections = await panel
    .locator('[data-category]')
    .evaluateAll((list) => list.map((s) => s.dataset.category));
  assert(
    sections.join() === 'faved,recent,set:7,set:8',
    `sections: ${sections}`
  );
  await until(
    async () =>
      (await panel
        .locator('[data-category="recent"] img')
        .evaluateAll(
          (list) => list.filter((img) => img.naturalWidth > 0).length
        )) > 3,
    'the pictures show'
  );
  assert(!asked.sets.includes('8'), `set 8 not asked yet: ${asked.sets}`);

  // The bar jumps to a set; it is asked then.
  const bar = await panel
    .locator('.sticker-sets [data-jump]')
    .evaluateAll((list) => list.map((b) => b.dataset.jump));
  assert(bar.join() === 'faved,recent,set:7,set:8', `bar: ${bar}`);
  await panel.locator('[data-jump="set:8"]').click();
  await until(() => asked.sets.includes('8'), 'set 8 asked');
  await panel
    .locator('[data-category="set:8"] [data-sticker="803"]')
    .waitFor({ timeout: 5000 });

  // A click sends it at once and closes the panel.
  await panel.locator('[data-sticker="803"]').click();
  await until(() => sends.length === 1, 'sent');
  assert(
    sends[0].chat === CHAT && sends[0].id === '803' && sends[0].clientId,
    `sent: ${JSON.stringify(sends[0])}`
  );
  await until(async () => (await panel.count()) === 0, 'closed after');

  // The tab is kept; the GIFs tab sends a GIF.
  await openPanel();
  assert(
    (await panel.getAttribute('data-tab')) === 'stickers',
    'stickers again'
  );
  await panel.locator('[data-tab="gifs"]').click();
  await panel.locator('.gif-cell').first().waitFor({ timeout: 5000 });
  assert((await panel.locator('.gif-cell').count()) === 4, 'four GIFs');
  await panel.locator('[data-sticker="902"]').click();
  await until(() => sends.length === 2, 'the GIF sent');
  assert(sends[1].id === '902', `gif: ${JSON.stringify(sends[1])}`);

  // Refused: the composer says so.
  refuse = true;
  await openPanel();
  await panel.locator('[data-sticker="901"]').click();
  await page.locator('.chat-notice.failed').waitFor({ timeout: 5000 });

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-stickers] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-stickers] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-stickers-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
