// Real browser e2e for a chat's profile column and its shared media
// (R-Y111), as Telegram Desktop has them: the chat's photo, name,
// @username and about text; a row for each kind it has, with how many;
// photos as a grid of pictures, files as rows; a click goes to the
// message far back in the chat; a person's column lists theirs too. A
// fake chat in a memory store, Telegram's answers faked in the page, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:shared

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';

const skip = (msg) => {
  console.log(`[e2e-shared] SKIP: ${msg}`);
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

const GROUP = '-1005';
const PERSON = '888';
const COUNT = 120;
const linkOf = (chat, n) => `msg:telegram:${chat}:${n}`;
const start = Date.now() - (COUNT + 5) * 60_000;
const message = (chat, n, fields = {}) => ({
  id: linkOf(chat, n),
  source: 'telegram',
  chat,
  chatName: chat === GROUP ? 'Fake Group' : 'Fake Person',
  chatType: chat === GROUP ? 'supergroup' : 'personal_chat',
  sender: chat === GROUP ? '31' : PERSON,
  senderName: 'Someone',
  timestamp: new Date(start + n * 60_000).toISOString(),
  body: `message ${n}`,
  ...fields,
  raw: { id: n, ...fields.raw },
});
const photo = (n) =>
  message(GROUP, n, {
    body: '',
    raw: {
      media: {
        className: 'MessageMediaPhoto',
        photo: {
          id: String(n),
          sizes: [{ className: 'PhotoSize', type: 'm', w: 320, h: 240 }],
        },
      },
    },
  });
const file = (n, name) =>
  message(GROUP, n, {
    body: '',
    raw: {
      media: {
        className: 'MessageMediaDocument',
        document: {
          id: String(n),
          mimeType: 'application/pdf',
          size: 2048,
          attributes: [
            { className: 'DocumentAttributeFilename', fileName: name },
          ],
        },
      },
    },
  });
const PHOTOS = [4, 2];
const FILES = [[6, 'report.pdf']];
const store = createMemoryStore();
for (let n = 1; n <= COUNT; n += 1) {
  const kept = PHOTOS.includes(n)
    ? photo(n)
    : (FILES.find(([id]) => id === n) ?? null);
  await store.put(kept?.[1] ? file(...kept) : (kept ?? message(GROUP, n)));
}
await store.put(message(PERSON, 1, { body: 'hello' }));

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-shared-'));
const handle = await startServer({
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: { scheduler: false },
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

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
  fulfil(route, { written: 0, cached: true, complete: true, newest: false })
);
await page.route('**/api/telegram/history-at', (route) =>
  fulfil(route, { ok: true, id: route.request().postDataJSON().id })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const group = new URL(route.request().url()).search.includes(GROUP);
  fulfil(
    route,
    group
      ? {
          chat: GROUP,
          kind: 'supergroup',
          title: 'Fake Group',
          username: 'fakegroup',
          about: 'A group about tests',
          members: 12,
        }
      : { chat: PERSON, kind: 'user', title: 'Fake Person' }
  );
});
const asked = [];
await page.route('**/api/telegram/shared-counts', (route) => {
  const { chat } = route.request().postDataJSON();
  fulfil(route, {
    ok: true,
    counts:
      chat === GROUP
        ? {
            photos: 2,
            videos: 0,
            files: 1,
            music: 0,
            links: 0,
            voice: 0,
            gifs: 0,
          }
        : {
            photos: 0,
            videos: 0,
            files: 0,
            music: 0,
            links: 0,
            voice: 0,
            gifs: 0,
          },
  });
});
await page.route('**/api/telegram/shared-media', async (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  const ids = body.kind === 'photos' ? PHOTOS : FILES.map(([id]) => id);
  const messages = await Promise.all(
    ids.map((n) => store.get(linkOf(GROUP, n)))
  );
  fulfil(route, {
    ok: true,
    messages,
    count: ids.length,
    more: false,
    last: ids.at(-1),
  });
});
// A tiny picture for each photo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const pictures = [];
await page.route('**/api/telegram/media*', (route) => {
  pictures.push(new URL(route.request().url()).searchParams.get('id'));
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
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
const inView = (id) =>
  page.evaluate((target) => {
    const box = document.querySelector('.chat-scroll');
    const row = box?.querySelector(`[data-message="${target}"]`);
    if (!row) {
      return false;
    }
    const a = box.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    return b.bottom > a.top && b.top < a.bottom;
  }, id);

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await until(() => inView(linkOf(GROUP, COUNT)), 'the newest shown', 15_000);

  // The column: the chat's top…
  await page.locator('[data-action="chat-about"]').click();
  const panel = page.locator('.person-panel');
  const head = panel.locator('.profile-head');
  await head.waitFor({ timeout: 5000 });
  assert(
    (await head.locator('.profile-name').textContent()) === 'Fake Group',
    'the name'
  );
  assert(
    (await head.locator('.profile-username').getAttribute('href')) ===
      'https://t.me/fakegroup',
    'the @username'
  );
  assert(
    (await head.locator('.profile-about').textContent()) ===
      'A group about tests',
    'the about text'
  );
  // …and a row for each kind it has, with how many.
  const rows = panel.locator('[data-shared]');
  await rows.first().waitFor({ timeout: 5000 });
  const kinds = await rows.evaluateAll((list) =>
    list.map((r) => `${r.dataset.shared}:${r.textContent}`)
  );
  assert(kinds.join() === 'photos:2 photos,files:1 file', `the rows: ${kinds}`);

  // Photos as a grid of pictures.
  await panel.locator('[data-shared="photos"]').click();
  const grid = panel.locator('[data-shared-list="photos"] .shared-grid');
  await grid.waitFor({ timeout: 5000 });
  await until(
    async () => (await grid.locator('.shared-cell img').count()) === 2,
    'the pictures'
  );
  assert(
    asked[0].chat === GROUP && asked[0].kind === 'photos' && !asked[0].offsetId,
    `asked: ${JSON.stringify(asked[0])}`
  );
  await until(
    () => [...pictures].sort().join() === '2,4',
    'the pictures asked'
  );
  // A click goes to the message far back.
  await grid.locator(`[data-shared-item="${linkOf(GROUP, 2)}"]`).click();
  await until(() => inView(linkOf(GROUP, 2)), 'the photo in the chat', 15_000);

  // Back to the rows; files as rows, by name.
  await panel.locator('[data-action="shared-back"]').click();
  await panel.locator('[data-shared="files"]').click();
  const item = panel.locator(`[data-shared-item="${linkOf(GROUP, 6)}"]`);
  await item.waitFor({ timeout: 5000 });
  assert(
    (await item.locator('.shared-item-title').textContent()) === 'report.pdf',
    'the file by name'
  );
  await item.locator('.shared-item-go').click();
  await until(() => inView(linkOf(GROUP, 6)), 'the file in the chat', 15_000);

  // A person's column: nothing shared says so.
  await page.locator(`[data-chat="telegram:${PERSON}"]`).click();
  const none = page.locator('.person-panel [data-shared-rows] .meta');
  await none.waitFor({ timeout: 5000 });
  assert((await none.textContent()).length > 0, 'nothing shared, said');

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-shared] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-shared] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-shared-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
