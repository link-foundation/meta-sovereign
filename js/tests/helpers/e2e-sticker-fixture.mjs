import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../src/server/index.js';
import { createMemoryStore } from '../../src/storage/universal.js';
import { browserOf } from './e2e-chat.mjs';
import { fulfilWire, requestBody } from './http-wire.mjs';

const routeCatalogue = async (page, { PANEL, SETS, GIFS, PNG }, fulfil) => {
  const asked = { panel: 0, sets: [], gifs: 0, pictures: 0 };
  await page.route('**/api/telegram/stickers', (route) => {
    asked.panel += 1;
    fulfil(route, PANEL);
  });
  await page.route('**/api/telegram/sticker-set', (route) => {
    const { id } = requestBody(route.request());
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
  return asked;
};

/** Fresh owned data, server and browser for the existing sticker scenarios. */
export const createStickerFixture = async (name) => {
  const { engine, browserType } = await browserOf(name);

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

  const dir = await mkdtemp(path.join(os.tmpdir(), `ms-e2e-${name}-`));
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
  const browser = await browserType.launch({
    headless: true,
    ...(process.env.E2E_EXECUTABLE_PATH
      ? { executablePath: process.env.E2E_EXECUTABLE_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const fulfil = (route, body, status = 200) =>
    fulfilWire(route, {
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
  const asked = await routeCatalogue(page, { PANEL, SETS, GIFS, PNG }, fulfil);
  return {
    asked,
    engine,
    CHAT,
    store,
    PNG,
    sticker,
    range,
    PANEL,
    SETS,
    GIFS,
    dir,
    handle,
    base,
    browser,
    page,
    errors,
    fulfil,
  };
};
