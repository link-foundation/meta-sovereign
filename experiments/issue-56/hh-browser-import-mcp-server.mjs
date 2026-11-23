import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { launchHhImportFixture } from '../../js/tests/helpers/e2e-hh-browser-import.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'hh-import-mcp-'));
const store = createMemoryStore();
let browser;
let session;
const handle = await startServer({
  port: 0,
  tls: false,
  localUi: true,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  automations: { scheduler: false },
  autoImportLauncher: async ({ url }) => {
    browser ??= await chromium.launch({
      headless: true,
      executablePath: process.env.E2E_EXECUTABLE_PATH,
    });
    session = await launchHhImportFixture(await browser.newContext(), url);
    return session;
  },
});
console.log(`http://127.0.0.1:${handle.port}/#conn-hh`);
try {
  for await (const command of createInterface({ input: process.stdin })) {
    if (command === 'open') {
      await session.page
        .getByRole('link', { name: 'Example employer' })
        .click();
      console.log('Opened the isolated native conversation');
    } else if (command === 'older' || command === 'no-start') {
      await session.page.goto(
        command === 'no-start'
          ? 'https://hh.ru/chat/8?history-import&no-start'
          : 'https://hh.ru/chat/7?history-import'
      );
      console.log('Opened the isolated virtualized history');
    } else if (command === 'mixed' || command === 'hidden') {
      const query = command === 'hidden' ? 'second-chat&hidden' : 'second-chat';
      await session.page.goto(`https://hh.ru/chat/7?${query}`);
      if (command === 'mixed') {
        await session.page
          .frameLocator('iframe')
          .getByText('Recruiter bot')
          .waitFor();
      }
      console.log(`Opened the isolated conversation with a ${command} frame`);
    } else if (command === 'read' || command === 'other-read') {
      const chat = command === 'read' ? 7 : 8;
      await session.page.goto(`https://hh.ru/chat/${chat}?read-import`);
      await session.page
        .getByRole('textbox', { name: 'Provider composer' })
        .fill('Unsent owner draft');
      console.log(`Opened isolated conversation ${chat} with a read receipt`);
    } else if (command === 'status') {
      console.log(
        JSON.stringify({
          archived: Boolean(await store.get('msg:hh:web:7:101')),
          olderReply: (await store.get('msg:hh:web:7:92'))?.body,
          reads: session.page.isClosed()
            ? undefined
            : await session.page.evaluate(() => globalThis.fixture?.reads),
          unread: (await store.get('read:hh:web:7'))?.unreadCount,
          token: Boolean(await store.get('secret:hh:access-token')),
          closed: session.page.isClosed(),
        })
      );
    } else if (command === 'exit') {
      break;
    }
  }
} finally {
  await handle.close();
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.unref?.();
}
