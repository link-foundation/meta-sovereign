import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeBrowserCommander } from 'browser-commander';
import { createBrowserSender } from '../../src/sources/browser-sender.js';
import { extractChats } from '../../src/sources/browser-actions.js';
import {
  hhChatScanHtml,
  hhChatScanOwner,
} from '../../../experiments/issue-56/hh-chat-scan-fixture.mjs';

const settings = { source: 'hh', waitMs: 20, endWaitMs: 100, budgetMs: 5000 };
const withFixture = async (
  browser,
  {
    frames,
    loading = false,
    html = hhChatScanHtml({ loading }),
    isRead = ({ fn }) => fn === extractChats,
    onRead,
    onMove,
    choiceReceiptMs = 10000,
  } = {},
  run
) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
  });
  await context.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        frames && new URL(route.request().url()).hostname === 'hh.ru'
          ? hhChatScanOwner(frames)
          : html,
    })
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  const evaluate = commander.evaluate.bind(commander);
  commander.evaluate = async (args) => {
    const result = await evaluate(args);
    if (isRead(args)) {
      await onRead?.(page, result);
    }
    if (args.args?.[0]?.operation === 'move') {
      await onMove?.(page);
    }
    return result;
  };
  const sender = createBrowserSender({
    loginTimeoutMs: 500,
    pollMs: 10,
    choiceReceiptMs,
    openSession: async () => ({
      commander,
      page,
      close: () => context.close(),
    }),
  });
  try {
    const result = await run({ sender, page });
    assert.deepEqual(errors, []);
    return result;
  } finally {
    await sender.close();
    await context.close();
  }
};
export { withFixture as withHhBrowserScanFixture };
const scan = (sender) => sender.scanChats(settings);

/** Real commander, main/cross-origin frame identity and owner scroll receipts. */
export const verifyHhChatScan = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const outcomes = [];
  await withFixture(browser, {}, async ({ sender, page }) => {
    if (before) {
      assert.equal(typeof sender.scanChats, 'undefined');
      await sender.readChats({ source: 'hh' });
      await page.locator('#result').evaluate((node) => {
        node.textContent =
          'Bounded scan unavailable; only the mounted window can be read.';
      });
    } else {
      const receipt = await scan(sender);
      assert.deepEqual(
        receipt.rows.map((row) => row.chat),
        Array.from({ length: 12 }, (_, i) => String(i + 1))
      );
      assert.equal(receipt.coverage.reason, 'rendered-end');
      assert.equal(receipt.coverage.endObserved, true);
      assert.equal(receipt.coverage.complete, false);
      assert.equal(receipt.restored, true);
      assert.equal(
        await page.locator('#list').evaluate((node) => node.scrollTop),
        300
      );
      assert.equal(page.url(), 'https://hh.ru/chat');
      await page.locator('#result').evaluate(
        (node, value) => {
          node.textContent = JSON.stringify(value, null, 2);
        },
        {
          rows: receipt.rows.map((row) => row.chat),
          ...receipt.coverage,
          restored: receipt.restored,
        }
      );
      outcomes.push('main-list');
    }
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: join(
          screenshots,
          `hh-chat-scan-${before ? 'before' : 'after'}.png`
        ),
        fullPage: true,
      });
    }
  });
  if (before) {
    return { unavailableBefore: true, liveProvider: false };
  }
  await verifyFrames(browser, outcomes);
  await verifyInterruption(browser, outcomes);
  await verifyClose(browser, outcomes);
  await withFixture(browser, { loading: true }, async ({ sender }) => {
    const result = await sender.scanChats({ ...settings, maxPasses: 4 });
    assert.equal(result.coverage.reason, 'pass-limit');
    assert.equal(result.coverage.endObserved, false);
    outcomes.push('loading-bound');
  });
  await withFixture(browser, {}, async ({ sender }) => {
    const result = await sender.scanChats({ ...settings, limit: 5 });
    assert.equal(result.rows.length, 5);
    assert.equal(result.coverage.reason, 'row-limit');
    assert.equal(result.restored, true);
    outcomes.push('row-bound');
  });
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

const verifyFrames = async (browser, outcomes) => {
  const child = { url: 'https://chatik.hh.ru/chat' };
  await withFixture(
    browser,
    { frames: [child, { ...child, hidden: true }] },
    async ({ sender, page }) => {
      const result = await scan(sender);
      assert.equal(result.rows.length, 12);
      assert.equal(result.restored, true);
      const visible = page.frames().find((frame) => frame !== page.mainFrame());
      assert.equal(
        await visible.locator('#list').evaluate((node) => node.scrollTop),
        300
      );
      outcomes.push('visible-child-hidden-decoy');
    }
  );
  for (const [name, frames] of [
    ['ambiguous-frames', [child, child]],
    ['untrusted-frame', [{ url: 'https://untrusted.example/chat' }]],
    ['wrong-route', [{ url: 'https://chatik.hh.ru/chat/7' }]],
  ]) {
    await withFixture(browser, { frames }, async ({ sender }) => {
      await assert.rejects(scan(sender), { code: 'answer-chat-unverified' });
      outcomes.push(name);
    });
  }
};

const verifyClose = async (browser, outcomes) => {
  let sender;
  let closing;
  await withFixture(
    browser,
    {
      onMove: async () => {
        closing ??= sender.close();
      },
    },
    async (context) => {
      sender = context.sender;
      const result = await scan(sender);
      assert.equal(result.coverage.reason, 'cancelled');
      assert.equal(result.restored, true);
      await closing;
      assert.equal(context.page.isClosed(), true);
      outcomes.push('close-drained');
    }
  );
};

const verifyInterruption = async (browser, outcomes) => {
  let moved = false;
  let ownerPosition;
  await withFixture(
    browser,
    {
      onMove: async (page) => {
        if (!moved) {
          moved = true;
          await page.locator('#list').hover();
          await page.mouse.wheel(0, 80);
          await page.waitForTimeout(30);
          ownerPosition = await page
            .locator('#list')
            .evaluate((node) => node.scrollTop);
        }
      },
    },
    async ({ sender, page }) => {
      const result = await scan(sender);
      assert.equal(result.coverage.reason, 'owner-active');
      assert.equal(result.restored, false);
      assert.equal(
        await page.locator('#list').evaluate((node) => node.scrollTop),
        ownerPosition
      );
      outcomes.push('owner-wheel');
    }
  );
  let navigated = false;
  await withFixture(
    browser,
    {
      onRead: async (page) => {
        if (!navigated) {
          navigated = true;
          await page.goto('https://hh.ru/chat/99');
        }
      },
    },
    async ({ sender, page }) => {
      const result = await scan(sender);
      assert.equal(result.coverage.reason, 'document-changed');
      assert.equal(result.restored, false);
      assert.equal(page.url(), 'https://hh.ru/chat/99');
      await assert.rejects(scan(sender), { code: 'answer-chat-unverified' });
      assert.equal(page.url(), 'https://hh.ru/chat/99');
      outcomes.push('navigation-no-reopen');
    }
  );
  const controller = new AbortController();
  await withFixture(
    browser,
    { onMove: async () => controller.abort() },
    async ({ sender }) => {
      const result = await sender.scanChats({
        ...settings,
        signal: controller.signal,
      });
      assert.equal(result.coverage.reason, 'cancelled');
      assert.equal(result.restored, true);
      outcomes.push('cancel-drained');
    }
  );
  let replaced = false;
  await withFixture(
    browser,
    {
      onRead: async (page) => {
        if (!replaced) {
          replaced = true;
          await page
            .locator('#list')
            .evaluate((node) => node.replaceWith(node.cloneNode(true)));
        }
      },
    },
    async ({ sender }) => {
      const result = await scan(sender);
      assert.equal(result.coverage.reason, 'changed');
      assert.equal(result.restored, false);
      assert.deepEqual(result.rows, []);
      outcomes.push('replaced-list');
    }
  );
};
