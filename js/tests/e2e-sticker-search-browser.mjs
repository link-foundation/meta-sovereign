// Real browser e2e for searching stickers and GIFs (R-Y112), as
// Telegram Desktop's panel: an emoji in the Stickers tab's box finds the
// stickers for it; words find stickers and sets (a set's stickers asked
// as any set's), nothing found says so, an empty box shows the user's
// own again; the box asks once typing pauses, in the page's language; a
// found set not the user's is added by its Add button (R-Y116); a
// found sticker is sent as any; the GIFs tab's box finds GIFs, more as
// the list is scrolled to its end. Telegram's answers faked in the page,
// a fake chat in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app, nothing is sent.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:sticker-search

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';

const skip = (msg) => {
  console.log(`[e2e-sticker-search] SKIP: ${msg}`);
  process.exit(0);
};
if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}
const engine = process.env.E2E_BROWSER || 'chromium';
let browserType;
try {
  browserType = (await import('playwright'))[engine];
} catch {
  skip('playwright not installed');
}

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`assertion failed: ${msg}`);
  }
};

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

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-sticker-search-'));
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
// Searches: an emoji, words (stickers and a set not the user's), GIFs a
// page at a time.
const searched = { stickers: [], gifs: [] };
await page.route('**/api/telegram/sticker-search', (route) => {
  const body = route.request().postDataJSON();
  searched.stickers.push(body);
  fulfil(
    route,
    body.q === '🐱'
      ? {
          ok: true,
          stickers: range(300, 3).map((id) => sticker(id, '🐱')),
          sets: [],
        }
      : body.q === 'cat'
        ? {
            ok: true,
            stickers: [sticker(400, '😺')],
            sets: [
              {
                id: '9',
                title: 'Found Cats',
                count: 4,
                format: 'webp',
                emoji: false,
                installed: false,
              },
            ],
          }
        : { ok: true, stickers: [], sets: [] }
  );
});
await page.route('**/api/telegram/gif-search', (route) => {
  const body = route.request().postDataJSON();
  searched.gifs.push(body);
  const gif = (id) => ({ ...GIFS.gifs[0], id: String(id) });
  fulfil(
    route,
    body.offset
      ? { ok: true, gifs: range(1040, 8).map(gif), next: null }
      : { ok: true, gifs: range(1000, 40).map(gif), next: '40' }
  );
});
SETS[9] = range(950, 4).map((id) => sticker(id, '🐈'));
const installs = [];
await page.route('**/api/telegram/sticker-set-install', (route) => {
  installs.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, installed: true });
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
const openPanel = async () => {
  await button.click();
  await panel.waitFor({ timeout: 5000 });
};

let failed = false;
try {
  await page.goto(`${base}/`);
  await open();
  await openPanel();
  await panel.locator('[data-tab="stickers"]').click();
  await panel
    .locator('[data-category="faved"] .sticker-cell')
    .first()
    .waitFor({ timeout: 5000 });
  const box = panel.locator('[data-field="stickerSearch"]');

  // An emoji finds stickers for it.
  await box.fill('🐱');
  await panel
    .locator('[data-found="🐱"] [data-sticker="300"]')
    .waitFor({ timeout: 5000 });
  assert(
    (await panel.locator('[data-found] .sticker-cell').count()) === 3,
    'three found'
  );
  assert(
    (await panel.locator('[data-category="faved"]').count()) === 0,
    'only what is found'
  );

  // Words find stickers and a set, its stickers asked as any set's.
  await box.fill('cat');
  await panel.locator('[data-sticker="400"]').waitFor({ timeout: 5000 });
  const sections = await panel
    .locator('[data-found] [data-category]')
    .evaluateAll((list) => list.map((s) => s.dataset.category));
  assert(sections.join() === 'found,set:9', `sections: ${sections}`);
  await until(() => asked.sets.includes('9'), 'the found set asked');
  await panel.locator('[data-sticker="952"]').waitFor({ timeout: 5000 });
  assert(
    searched.stickers.every((b) => b.lang === 'en'),
    `asked in the page's language: ${JSON.stringify(searched.stickers)}`
  );
  assert(
    !searched.stickers.some((b) => ['c', 'ca'].includes(b.q)),
    `asked once typing paused: ${JSON.stringify(searched.stickers)}`
  );

  // Nothing found says so; an empty box shows the user's own again.
  await box.fill('zzzz');
  await until(
    async () =>
      (await panel
        .locator('.emoji-none')
        .textContent()
        .catch(() => '')) === 'Nothing found.',
    'nothing found'
  );
  await box.fill('');
  await panel.locator('[data-category="faved"]').waitFor({ timeout: 5000 });

  // A found set not the user's: Add makes it theirs.
  await box.fill('cat');
  await panel.locator('[data-add-set="9"]').click();
  await until(() => installs.length === 1, 'added');
  assert(
    installs[0].id === '9' && installs[0].install === true,
    `install: ${JSON.stringify(installs[0])}`
  );
  await until(
    async () => (await panel.locator('[data-add-set]').count()) === 0,
    'the Add button gone'
  );

  // A found sticker is sent as any.
  await panel.locator('[data-sticker="952"]').click();
  await until(() => sends.length === 1, 'sent');
  assert(sends[0].id === '952', `sent: ${JSON.stringify(sends[0])}`);
  await until(async () => (await panel.count()) === 0, 'closed after');

  // GIFs: words find them, more as the list is scrolled to its end.
  await openPanel();
  await panel.locator('[data-tab="gifs"]').click();
  await panel.locator('[data-sticker="900"]').waitFor({ timeout: 5000 });
  await panel.locator('[data-field="gifSearch"]').fill('dance');
  await panel.locator('[data-sticker="1000"]').waitFor({ timeout: 5000 });
  assert(
    searched.gifs[0].q === 'dance' && !searched.gifs[0].offset,
    `first page: ${JSON.stringify(searched.gifs[0])}`
  );
  await panel.locator('[data-found] .gif-cell').last().scrollIntoViewIfNeeded();
  await panel.locator('[data-sticker="1047"]').waitFor({ timeout: 5000 });
  assert(
    searched.gifs.length === 2 && searched.gifs[1].offset === '40',
    `next page: ${JSON.stringify(searched.gifs)}`
  );
  assert(
    (await panel.locator('[data-found] .gif-cell').count()) === 48,
    'both pages'
  );
  await panel.locator('[data-sticker="1041"]').click();
  await until(() => sends.length === 2, 'the GIF sent');
  assert(sends[1].id === '1041', `gif: ${JSON.stringify(sends[1])}`);

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-sticker-search] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-sticker-search] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-sticker-search-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
