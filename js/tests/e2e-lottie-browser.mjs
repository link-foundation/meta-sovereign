// Real browser e2e for animated stickers (R-Y113), as Telegram's apps
// play them: a `.tgs` sticker in the chat shows its picture, then its
// animation drawn as SVG and moving; the panel's animated stickers play
// the same; all under the app's own content policy (no `eval`, no
// workers), with no page error. Telegram's answers faked in the page, a
// fake chat in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:lottie

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('lottie');

// A turning orange circle, one second a turn.
const still = (k) => ({ a: 0, k });
const ANIMATION = {
  v: '5.5.2',
  fr: 30,
  ip: 0,
  op: 30,
  w: 512,
  h: 512,
  assets: [],
  layers: [
    {
      ty: 4,
      ind: 1,
      ip: 0,
      op: 30,
      st: 0,
      ks: {
        o: still(100),
        r: {
          a: 1,
          k: [
            { t: 0, s: [0], i: { x: [1], y: [1] }, o: { x: [0], y: [0] } },
            { t: 30, s: [360] },
          ],
        },
        p: still([256, 256, 0]),
        a: still([0, 0, 0]),
        s: still([100, 100, 100]),
      },
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'rc', p: still([0, 0]), s: still([300, 120]), r: still(0) },
            { ty: 'fl', c: still([1, 0.5, 0, 1]), o: still(100) },
            {
              ty: 'tr',
              p: still([0, 0]),
              a: still([0, 0]),
              s: still([100, 100]),
              r: still(0),
              o: still(100),
            },
          ],
        },
      ],
    },
  ],
};
const TGS = gzipSync(Buffer.from(JSON.stringify(ANIMATION)));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const CHAT = '556';
const STICKER = `msg:telegram:${CHAT}:2`;
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - (5 - n) * 60_000).toISOString();
const base = {
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Erin',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Erin',
};
await store.put({
  ...base,
  id: `msg:telegram:${CHAT}:1`,
  body: 'watch this',
  timestamp: at(1),
  raw: { id: 1 },
});
await store.put({
  ...base,
  id: STICKER,
  body: '',
  timestamp: at(2),
  raw: {
    id: 2,
    media: {
      className: 'MessageMediaDocument',
      document: {
        id: '2002',
        mimeType: 'application/x-tgsticker',
        size: TGS.length,
        attributes: [
          { className: 'DocumentAttributeSticker', alt: '🎉' },
          { className: 'DocumentAttributeImageSize', w: 512, h: 512 },
        ],
      },
    },
  },
});

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-lottie-'));
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
  },
});
const origin = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// What the player could be refused: a script, `eval` or a worker.
// (WebKit says it refused a stylesheet with or without stickers, before
// any draws; not the player's.)
page.on('console', (m) => {
  if (
    /Refused to (load|execute|evaluate|create)|unsafe-eval|worker-src/i.test(
      m.text()
    )
  ) {
    errors.push(m.text());
  }
});

const fulfil = (route, body) =>
  route.fulfill({
    status: 200,
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
const asked = { files: 0 };
await page.route('**/api/telegram/media?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/file?*', (route) => {
  asked.files += 1;
  return route.fulfill({
    status: 200,
    contentType: 'application/x-tgsticker',
    body: TGS,
  });
});
await page.route('**/api/telegram/stickers', (route) =>
  fulfil(route, {
    ok: true,
    faved: [],
    recent: [3001, 3002].map((id) => ({
      id: String(id),
      kind: 'sticker',
      format: 'tgs',
      emoji: '🎉',
      w: 512,
      h: 512,
    })),
    sets: [],
  })
);
await page.route('**/api/telegram/gifs', (route) =>
  fulfil(route, { ok: true, gifs: [] })
);
await page.route('**/api/telegram/sticker?*', (route) =>
  new URL(route.request().url()).searchParams.get('full') === '1'
    ? route.fulfill({
        status: 200,
        contentType: 'application/x-tgsticker',
        body: TGS,
      })
    : route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);

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
// The animation's turning group, read twice a moment apart.
const turning = async (scope) => {
  const read = () =>
    scope
      .locator('[data-lottie] svg g[transform]')
      .first()
      .getAttribute('transform');
  const first = await read();
  await page.waitForTimeout(250);
  return first !== (await read());
};

let failed = false;
try {
  await page.goto(`${origin}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  const sticker = page.locator(`[data-message="${STICKER}"] .bubble-sticker`);
  await sticker.waitFor({ timeout: 15_000 });
  await sticker.locator('[data-lottie] svg').waitFor({ timeout: 10_000 });
  await until(
    async () => (await sticker.locator('img').count()) === 0,
    'the picture gives way once it draws'
  );
  assert(await turning(sticker), 'the chat sticker moves');
  assert(asked.files === 1, `the file asked once: ${asked.files}`);

  // The panel's animated stickers play the same.
  await page.locator('[data-action="emoji"]').click();
  const panel = page.locator('.emoji-panel');
  await panel.locator('[data-tab="stickers"]').click();
  const cell = panel.locator('[data-sticker="3001"]');
  await cell.locator('[data-lottie] svg').waitFor({ timeout: 10_000 });
  assert(await turning(cell), 'the panel sticker moves');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-lottie] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-lottie] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-lottie-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
