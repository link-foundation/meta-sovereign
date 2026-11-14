import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeBrowserCommander } from 'browser-commander';
import { createBrowserSender } from '../../src/sources/browser-sender.js';
import { hhChatListHtml } from '../../../experiments/issue-56/hh-chat-list-fixture.mjs';

/** Read the native cell contract through the actual sender and commander. */
export const verifyHhChatList = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
  });
  await context.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: hhChatListHtml })
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let navigations = 0;
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  const goto = commander.goto.bind(commander);
  commander.goto = (args) => {
    navigations++;
    return goto(args);
  };
  const sender = createBrowserSender({
    loginTimeoutMs: 500,
    pollMs: 10,
    openSession: async () => ({
      commander,
      page,
      close: () => context.close(),
    }),
  });
  try {
    const rows = await sender.readChats({ source: 'hh', limit: 2 });
    await page.locator('#result').evaluate((node, result) => {
      node.textContent = JSON.stringify(result, null, 2);
    }, rows);
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: join(
          screenshots,
          `hh-chat-list-${before ? 'before' : 'after'}.png`
        ),
        fullPage: true,
      });
    }
    if (before) {
      assert.notDeepEqual(
        rows.map((row) => row.chat),
        ['7', '8']
      );
      return {
        nativeRowsMissing: true,
        rows,
        pageErrors: errors,
        liveProvider: false,
      };
    }
    assert.deepEqual(
      rows.map(({ chat, title, preview, unread }) => [
        chat,
        title,
        preview,
        unread,
      ]),
      [
        ['7', 'Example employer', 'Rejection', 3],
        ['8', 'Another employer', 'Invitation', 1],
      ]
    );
    assert.ok(
      rows.every((row) => row.source === 'hh' && row.via === 'browser')
    );
    // Repeated reads retain the list and never open a conversation.
    assert.equal((await sender.readChats({ source: 'hh' })).length, 3);
    assert.equal(navigations, 1);
    assert.equal(page.url(), 'https://hh.ru/chat');
    assert.deepEqual(errors, []);
    return {
      cases: 2,
      rows,
      navigations,
      pageErrors: errors,
      liveProvider: false,
    };
  } finally {
    await sender.close();
    await context.close();
  }
};
