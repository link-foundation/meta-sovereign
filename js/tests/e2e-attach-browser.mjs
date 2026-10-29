// Real browser e2e for sending files and photos (R-Y99): the paperclip
// opens the system's file picker; the send box shows the pictures, takes
// the message box's text as the caption, "Compress images" off makes
// them files; Send uploads each file's bytes, then asks Telegram to send
// them together, and the box and the message box are cleared. A picture
// pasted into the message box, or files dropped on the chat, open the
// same box; "Compress images" is remembered. Fake chats in a memory store, the uploads to the
// server's real route (a fake account behind it), Telegram's answers
// faked in the page, a server on a free port, a headless browser; nothing reaches
// a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:attach

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('attach');

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
  body: 'send me the pictures',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// The upload reaches the server's real route (its checks, the browser's
// real bytes); the account behind it is a fake that only counts them.
const uploads = [];
const account = {
  status: async () => ({ connected: true, kind: 'user' }),
  stop: async () => {},
  uploadProgress: () => ({ ok: true, progress: 0.4 }),
  media: async () => ({ buffer: PNG, mimeType: 'image/png' }),
  receiveUpload: async (stream, { name }) => {
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
    }
    uploads.push({ name, size });
    return {
      ok: true,
      token: String(uploads.length).padStart(32, '0'),
      name,
      size,
    };
  },
};

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-attach-'));
const handle = await startServer({
  localUi: true,
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: account,
  log: null,
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
const progressReads = [];
page.on('response', async (response) => {
  if (response.url().includes('/upload-progress')) {
    progressReads.push({
      status: response.status(),
      body: await response.text().catch(() => ''),
    });
  }
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.route('**/api/telegram/status', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
      offline: false,
      needsLogin: false,
    }),
  })
);
await page.route('**/api/telegram/history', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ written: 0, cached: 0, complete: true }),
  })
);
const sends = [];
await page.route('**/api/telegram/send-files', async (route) => {
  sends.push(JSON.parse(route.request().postData() ?? '{}'));
  await new Promise((resolve) => globalThis.setTimeout(resolve, 900));
  if (sends.at(-1).asPhoto) {
    await store.put({
      id: `msg:telegram:${CHAT}:2`,
      source: 'telegram',
      chat: CHAT,
      chatType: 'user',
      sender: 'me',
      body: sends.at(-1).caption,
      timestamp: new Date().toISOString(),
      raw: {
        id: 2,
        out: true,
        media: {
          className: 'MessageMediaPhoto',
          photo: {
            id: '1',
            sizes: [
              {
                className: 'PhotoSize',
                type: 'm',
                w: 120,
                h: 120,
                size: PNG.length,
              },
            ],
          },
        },
      },
    });
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, chat: CHAT, ids: [2, 3] }),
  });
});
const until = async (check, what, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out: ${what}`);
};
const title = () => page.textContent('.attach-dialog h3');

// A file made in the page, given to an event as the browser would.
const fileEvent = (kind) =>
  page.evaluate(
    ({ kind, b64 }) => {
      const bytes = Uint8Array.from(globalThis.atob(b64), (c) =>
        c.charCodeAt(0)
      );
      const data = new globalThis.DataTransfer();
      data.items.add(
        new globalThis.File([bytes], `${kind}.png`, { type: 'image/png' })
      );
      if (kind === 'pasted') {
        const box = document.querySelector('.chat-composer textarea');
        const event = new globalThis.Event('paste', {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, 'clipboardData', { value: data });
        box.dispatchEvent(event);
        return;
      }
      const target = document.querySelector('.chat-scroll');
      for (const type of ['dragenter', 'dragover', 'drop']) {
        const event = new globalThis.Event(type, {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, 'dataTransfer', { value: data });
        target.dispatchEvent(event);
      }
    },
    { kind, b64: PNG.toString('base64') }
  );

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.click(`[data-chat="telegram:${CHAT}"]`);
  await page.waitForSelector('[data-action="attach"]');
  await page.fill('.chat-composer textarea', 'the two of them');

  // The paperclip's menu: File, the system's picker (two pictures).
  await page.click('[data-action="attach"]');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-action="attach-file"]'),
  ]);
  await chooser.setFiles([
    { name: 'one.png', mimeType: 'image/png', buffer: PNG },
    { name: 'two.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await page.waitForSelector('.attach-dialog');
  assert((await title()) === 'Send 2 photos', `title: ${await title()}`);
  assert(
    (await page.$$('.attach-dialog img.attach-pic')).length === 2,
    'both pictures shown'
  );
  assert(
    (await page.inputValue('.attach-caption')) === 'the two of them',
    "the box's text is the caption"
  );
  console.log(
    '[e2e-attach] the paperclip: two photos, the caption taken along'
  );

  // Not compressed: they go as files.
  await page.click('[data-option="compress"] input');
  assert((await title()) === 'Send 2 files', `title: ${await title()}`);
  await page.click('[data-action="attach-send"]');
  await until(() => sends.length === 1, 'sent');
  await page.waitForFunction(
    () =>
      document.querySelector('.attach-progress')?.textContent.includes('40%'),
    null,
    { timeout: 5000 }
  );
  assert(
    uploads.length === 2 && uploads.every((u) => u.size === PNG.length),
    `uploads: ${JSON.stringify(uploads)}`
  );
  assert(
    JSON.stringify(uploads.map((u) => u.name)) ===
      JSON.stringify(['one.png', 'two.png']),
    'in order, by name'
  );
  const [sent] = sends;
  assert(
    sent.chat === CHAT &&
      sent.tokens.length === 2 &&
      sent.caption === 'the two of them' &&
      sent.asPhoto === false &&
      sent.group === true,
    `send-files: ${JSON.stringify(sent)}`
  );
  await page.waitForSelector('.attach-dialog', { state: 'detached' });
  assert(
    (await page.inputValue('.chat-composer textarea')) === '',
    'the message box is cleared'
  );
  console.log('[e2e-attach] Send: uploaded, sent as files, boxes cleared');

  // A pasted picture.
  await fileEvent('pasted');
  await page.waitForSelector('.attach-dialog [data-file="pasted.png"]');
  // "Compress images" is remembered, as in Desktop; on again.
  assert((await title()) === 'Send a file', `title: ${await title()}`);
  await page.click('[data-option="compress"] input');
  assert((await title()) === 'Send a photo', `title: ${await title()}`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.attach-dialog', { state: 'detached' });
  assert(sends.length === 1, 'Esc sends nothing');
  console.log('[e2e-attach] a pasted picture opens the box; Esc closes it');

  // Dropped on the chat; Enter in the caption sends.
  await fileEvent('dropped');
  await page.waitForSelector('.attach-dialog [data-file="dropped.png"]');
  await page.fill('.attach-caption', 'dropped in');
  await page.press('.attach-caption', 'Enter');
  await until(() => sends.length === 2, 'the dropped one sent');
  assert(
    sends[1].asPhoto === true && sends[1].caption === 'dropped in',
    `dropped: ${JSON.stringify(sends[1])}`
  );
  console.log('[e2e-attach] a dropped picture: sent as a photo by Enter');
  await page.waitForSelector('.attach-dialog', { state: 'detached' });

  // A new tall message follows the bottom before paint; older history and
  // media reflow must not strand it above the floating composer.
  await page.waitForSelector(
    '[data-message="msg:telegram:555:2"] .bubble-photo'
  );
  await page.waitForFunction(() => {
    const image = document.querySelector(
      '[data-message="msg:telegram:555:2"] img.bubble-photo-img'
    );
    return image?.complete && image.naturalWidth > 0;
  });
  for (let i = 3; i <= 14; i += 1) {
    await store.put({
      id: `msg:telegram:${CHAT}:${i}`,
      source: 'telegram',
      chat: CHAT,
      chatType: 'user',
      chatName: 'Fake Dave',
      sender: 'me',
      body: `fixture ${i}\n${'line\n'.repeat(3)}`,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      raw: { id: i, out: true },
    });
  }
  await page.waitForSelector('[data-message="msg:telegram:555:14"]');
  await page.waitForFunction(() => {
    const box = document.querySelector('.chat-scroll');
    return box.scrollHeight - box.scrollTop - box.clientHeight < 2;
  });

  // All composer popovers see the chat backdrop. An ancestor blur would
  // create a backdrop root and leave their transparent panel unblurred.
  await page.evaluate(
    () => (document.documentElement.dataset.effects = 'full')
  );
  await page.click('[data-action="emoji"]');
  await page.waitForSelector('.emoji-panel');
  const frosted = await page.evaluate(() => {
    const composer = document.querySelector('.chat-composer');
    const blur = (style) => style.backdropFilter || style.webkitBackdropFilter;
    return {
      parent: blur(globalThis.getComputedStyle(composer)),
      surface: blur(globalThis.getComputedStyle(composer, '::before')),
      panel: blur(
        globalThis.getComputedStyle(document.querySelector('.emoji-panel'))
      ),
    };
  });
  assert(
    frosted.parent === 'none' &&
      frosted.surface.includes('blur') &&
      frosted.panel.includes('blur'),
    `popover blur: ${JSON.stringify(frosted)}`
  );
  console.log(
    '[e2e-attach] provider progress, bottom following and consistent popover blur'
  );

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-attach] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-attach] FAIL (${engine}): ${error.message}`);
  console.error(
    JSON.stringify({
      progressReads,
      progressText: await page.locator('.attach-progress').allTextContents(),
    })
  );
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
