// Real browser e2e for "Export chat history" (R-Y186), as Telegram
// Desktop's chat menu has it: the header's ⋯ menu opens a dialog with the
// default folder; a relative folder and one inside the app's store are
// refused with text; an export is started, followed live (messages, files,
// the current file), cancelled (the partial result stays, valid), and a
// second one runs to its end with "Show my data". The server is real, on a
// free port, over a memory store, with a fake Telegram client and a temp
// directory the files are written to; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:export

import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createHistoryExport } from '../src/sources/telegram-export.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { FIXTURE, helpers } from './helpers/export-fakes.mjs';
import {
  windowApi as Api,
  windowClient,
} from './helpers/export-window-fakes.mjs';

const CHAT = '7';
const store = createMemoryStore();
await store.put({
  source: 'telegram',
  chat: CHAT,
  chatName: 'Alice Liddell',
  chatType: 'private',
  id: `msg:telegram:${CHAT}:1`,
  body: 'hello',
  sender: CHAT,
  senderName: 'Alice Liddell',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const root = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-export-data-'));
const appStore = path.join(root, 'appstore');
// The first download waits for the test, so the progress can be seen.
let release = null;
const gate = new Promise((resolve) => {
  release = resolve;
});
let held = false;
let failDownloads = false;
const { client } = windowClient(
  { [CHAT]: FIXTURE.slice(0, 6) },
  {
    onDownload: async () => {
      if (failDownloads) {
        throw new Error('FILE_REFERENCE_EXPIRED');
      }
      if (!held) {
        held = true;
        await gate;
      }
    },
  }
);
const revealed = [];
const account = createHistoryExport(
  {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    store,
    sleep: async () => {},
  },
  {
    userClient: async () => client,
    mediaDir: path.join(appStore, 'media', 'telegram'),
    home: root,
    reveal: async (folder) => revealed.push(folder),
  }
);

const { base, page, until, finish } = await openChatApp('export', {
  store,
  telegramAccount: { ...account, stop: async () => {} },
});

const fixed = {
  history: { written: 0, cached: 0, complete: true },
  'shared-counts': { ok: true, counts: {} },
  'chat-info*': { kind: 'user', title: 'Alice Liddell' },
};
for (const [name, answer] of Object.entries(fixed)) {
  await page.route(`**/api/telegram/${name}`, (route) =>
    fulfil(route, { chat: CHAT, ...answer })
  );
}

const dialog = page.locator('[data-dialog="export"]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const text = async (selector) =>
  (await dialog.locator(selector).textContent()) ?? '';

const openDialog = async () => {
  await page.locator('[data-action="chat-more"]').click();
  await page.locator('[data-action="export-open"]').click();
  await dialog.waitFor({ timeout: 5000 });
};

const typeFolder = async (folder) => {
  await dialog.locator('[data-field="folder"]').fill(folder);
  await dialog.locator('[data-action="export-start"]').click();
};

const refusals = async () => {
  const input = dialog.locator('[data-field="folder"]');
  await until(async () => (await input.inputValue()) !== '', 'default folder');
  const value = await input.inputValue();
  assert(
    value.startsWith(path.join(root, 'Downloads', 'Telegram Desktop')) &&
      /ChatExport_\d{4}-\d{2}-\d{2}$/.test(value),
    `Desktop's default folder: ${value}`
  );
  assert(
    (await dialog.locator('[data-option]').count()) === 7,
    'seven kinds of media'
  );
  await typeFolder('relative/dir');
  await dialog.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert(
    (await dialog.textContent()).includes('full path'),
    'a relative folder is refused with text'
  );
  await typeFolder(path.join(appStore, 'export'));
  await until(
    async () => (await text('[role="alert"]')).includes('keeps its own data'),
    'the store folder is refused with text'
  );
  assert((await stat(root)).isDirectory(), 'sanity');
};

const cancelledRun = async () => {
  const out = path.join(root, 'out');
  await dialog.locator('[data-option="stickers"]').check();
  await dialog.locator('[data-field="format"]').selectOption('both');
  await typeFolder(out);
  await dialog.locator('[data-export="state"]').waitFor({ timeout: 5000 });
  await until(
    async () => (await text('[data-export="current"]')).includes('photo_1'),
    'the current file shows'
  );
  assert(
    (await text('[data-export="messages"]')).includes('of 6'),
    `messages of the total: ${await text('[data-export="messages"]')}`
  );
  await dialog.locator('[data-action="export-cancel"]').click();
  await until(
    async () =>
      (await dialog.locator('[data-state="cancelling"]').count()) +
        (await dialog.locator('[data-state="cancelled"]').count()) >
      0,
    'stopping'
  );
  release();
  await dialog.locator('[data-state="cancelled"]').waitFor({ timeout: 8000 });
  assert((await text('[data-export="folder"]')).includes(out), 'folder shown');
  const partial = JSON.parse(await readFile(path.join(out, 'result.json')));
  assert(partial.messages.length < 6, 'cancelled before the end');
  await dialog.locator('[data-action="export-reveal"]').click();
  await until(async () => revealed.length === 1, 'the folder is shown');
  assert(revealed[0] === out, `revealed ${revealed[0]}`);
  await dialog.locator('[data-action="export-close"]').click();
  await gone(dialog, 'closed');
};

const finishedRun = async () => {
  const out = path.join(root, 'out2');
  await openDialog();
  await dialog.locator('[data-field="format"]').selectOption('json');
  await dialog.locator('[data-field="limit"]').fill('10');
  await typeFolder(out);
  await dialog.locator('[data-state="done"]').waitFor({ timeout: 8000 });
  assert(
    (await text('[data-export="messages"]')).includes('6 of 6'),
    'all messages'
  );
  assert(
    /Files: \d+ /.test(await text('[data-export="files"]')),
    'files counted'
  );
  const data = JSON.parse(await readFile(path.join(out, 'result.json')));
  assert(data.messages.length === 6, 'six messages in result.json');
  assert(data.name === 'Alice Liddell', 'the chat name');
  const folders = await readdir(out);
  assert(
    folders.includes('photos') && folders.includes('voice_messages'),
    `media folders: ${folders}`
  );
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes');
};

const markdownRun = async () => {
  const out = path.join(root, 'active');
  await openDialog();
  await dialog.locator('[data-field="scope"]').selectOption('active');
  await dialog.locator('[data-field="gap"]').fill('4');
  await dialog.locator('[data-field="format"]').selectOption('markdown');
  await dialog.locator('[data-field="maxLines"]').fill('32');
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await dialog.locator('.export-media').evaluate((media) => {
    const voice = media
      .querySelector('[data-option="voice"]')
      .closest('label')
      .querySelector('span')
      .getBoundingClientRect();
    const round = media
      .querySelector('[data-option="roundVideo"]')
      .getBoundingClientRect();
    return {
      gap: round.left - voice.right,
      width: document.documentElement.scrollWidth,
    };
  });
  assert(
    layout.gap >= 4,
    `media labels remain separate on mobile: ${JSON.stringify(layout)}`
  );
  assert(layout.width === 390, 'export does not overflow the mobile viewport');
  await typeFolder(out);
  await dialog.locator('[data-state="done"]').waitFor({ timeout: 8000 });
  const data = JSON.parse(await readFile(path.join(out, 'history-1.json')));
  assert(
    data.messages.length === 1 && data.messages[0].id === 6,
    'only the latest conversation is exported'
  );
  const markdown = await readFile(path.join(out, 'history-1.md'), 'utf8');
  assert(
    markdown.split('\n').length <= 32,
    'Markdown respects the configured part limit'
  );
  assert(
    markdown.includes('[Structured data](history-1.json)'),
    'linked structured data'
  );
  assert(
    (await stat(path.join(out, data.messages[0].file))).size > 0,
    'actual media downloaded'
  );
  await page.keyboard.press('Escape');
  await gone(dialog, 'active export closes');
};

const failedMediaRun = async () => {
  failDownloads = true;
  await openDialog();
  const out = path.join(root, 'failed-media');
  await dialog.locator('[data-field="scope"]').selectOption('active');
  await dialog.locator('[data-field="format"]').selectOption('markdown');
  await typeFolder(out);
  await dialog.locator('[data-state="done"]').waitFor({ timeout: 8000 });
  assert(
    (await text('[data-export="failedFiles"]')).includes('1'),
    'failed media count is visible'
  );
  const data = JSON.parse(await readFile(path.join(out, 'history-1.json')));
  assert(
    data.messages[0].file.startsWith('('),
    'failed media has a truthful note'
  );
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await openDialog();
  await refusals();
  await cancelledRun();
  await finishedRun();
  await markdownRun();
  await failedMediaRun();
  await rm(root, { recursive: true, force: true });
});
