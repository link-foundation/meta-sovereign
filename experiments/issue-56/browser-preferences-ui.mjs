// Isolated UI fixture: temporary profiles, no accounts or provider calls.
// ISSUE_56_SYNC=1 enables only the isolated local signaling/sync endpoints.
// Run: xvfb-run -a node experiments/issue-56/browser-preferences-ui.mjs
// The Playwright MCP attaches to the printed CDP endpoint for verification.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser } from 'browser-commander';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/index.js';
import { encodeWire } from '../../js/src/transport/lino.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-issue56-ui-'));
let browser;
const store = createMemoryStore();
const layout = process.env.ISSUE_56_CHAT_LAYOUT === '1';
if (layout) {
  for (let id = 1; id <= 62; id += 1) {
    await store.put({
      id: `msg:telegram:555:${id}`,
      source: 'telegram',
      chat: '555',
      chatName: 'Layout fixture',
      chatType: 'personal_chat',
      sender: '555',
      senderName: 'Fixture',
      body: `Message ${id}\n${'A line of fixture text.\n'.repeat(3)}`,
      timestamp: new Date(1700000000000 + id * 1000).toISOString(),
      raw: { id },
    });
  }
  await store.put({
    id: 'read:telegram:555',
    kind: 'read',
    source: 'telegram',
    chat: '555',
    inboxMaxId: 61,
    unreadCount: 1,
    unreadTopId: 62,
  });
}
const server = await startServer({
  store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableHandlers: false,
  enableSync: process.env.ISSUE_56_SYNC === '1',
  telegramAccount: false,
  automations: { scheduler: false },
});
const stop = async () => {
  await browser?.close();
  await server.close();
  await rm(dir, { recursive: true, force: true });
};
try {
  browser = await launchBrowser({
    engine: 'playwright',
    channel: 'chrome',
    headless: false,
    userDataDir: path.join(dir, 'browser'),
    args: ['--no-sandbox', '--disable-background-networking'],
  });
  const origin = `http://127.0.0.1:${server.port}`;
  await browser.page.route('**/*', (route) =>
    route.request().url().startsWith(`${origin}/`)
      ? route.continue()
      : route.abort()
  );
  console.log(JSON.stringify({ origin, cdpEndpoint: browser.cdpEndpoint }));
  if (layout) {
    await browser.page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
      globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
      globalThis.metaSovereignDebug = true;
    });
    await browser.page.route('**/api/telegram/status', (route) =>
      route.fulfill({
        contentType: 'text/lino',
        body: encodeWire({
          connected: true,
          kind: 'user',
          offline: false,
          needsLogin: false,
        }),
      })
    );
    await browser.page.route('**/api/telegram/dialog-state', async (route) =>
      route.fulfill({
        contentType: 'text/lino',
        body: encodeWire({
          ok: true,
          read: await store.get('read:telegram:555'),
        }),
      })
    );
    await browser.page.route('**/api/telegram/history', (route) =>
      route.fulfill({
        contentType: 'text/lino',
        body: encodeWire({ written: 0, cached: true, complete: true }),
      })
    );
  }
  await browser.page.goto(
    `${origin}/#${layout ? 'chat=telegram:555' : 'settings'}`
  );
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await stop();
  process.stdin.pause();
}
