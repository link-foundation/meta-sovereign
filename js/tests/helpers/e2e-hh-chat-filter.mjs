import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';
import { hhChatScanHtml } from '../../../experiments/issue-56/hh-chat-scan-fixture.mjs';
import { HH_WEB_UI } from '../../src/sources/hh-web-ui.js';
import { resolveBrowserChatListDocument } from '../../src/sources/browser-choice-document.js';
import { scanBrowserChatList } from '../../src/sources/browser-chat-scan.js';
import { withInactiveBrowserView } from '../../src/sources/browser-inactive-view.js';

const options = { source: 'hh', waitMs: 30, endWaitMs: 100, budgetMs: 5000 };
const unread = Array.from({ length: 12 }, (_, i) => String(i + 1)).filter(
  (n) => Number(n) % 3 !== 0
);
const all = Array.from({ length: 12 }, (_, i) => String(i + 1));

const verifyInactiveFilter = (browser, outcomes) =>
  withHhBrowserScanFixture(
    browser,
    { html: hhChatScanHtml({ filter: true }) },
    async ({ sender, commander, page }) => {
      await sender.readChats({ source: 'hh' });
      const document = await resolveBrowserChatListDocument(
        commander,
        page,
        HH_WEB_UI
      );
      const other = await page.context().newPage();
      try {
        await other.bringToFront();
        const scan = () =>
          withInactiveBrowserView(document, (verify, token) =>
            scanBrowserChatList(document, HH_WEB_UI, {
              ...options,
              unreadOnly: true,
              verifyCurrent: verify,
              inactiveToken: token,
            })
          );
        if (browser.browserType().name() !== 'chromium') {
          await assert.rejects(scan(), {
            code: 'browser-background-focus-unavailable',
          });
          outcomes.push('inactive-filter-focus-unavailable');
          return;
        }
        const result = await scan();
        assert.deepEqual(
          result.rows.map((row) => row.chat),
          unread
        );
        assert.equal(result.filter.restored, true);
        assert.equal(result.filter.scrollRestored, true);
        assert.equal(await page.locator('#outer-filter').isChecked(), false);
        outcomes.push('inactive-native-filter-restored');
      } finally {
        await other.close();
      }
    }
  );

/** Real native nested checkboxes, virtual rows and original scroll restoration. */
export const verifyHhChatFilter = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const outcomes = [];
  const shot = async (page, name, result) => {
    await page.locator('#result').evaluate((node, value) => {
      node.textContent = JSON.stringify(value, null, 2);
    }, result);
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: join(screenshots, `${name}.png`),
        fullPage: true,
      });
    }
  };
  for (const original of [false, true]) {
    await withHhBrowserScanFixture(
      browser,
      { html: hhChatScanHtml({ filter: true, unreadOnly: original }) },
      async ({ sender, page }) => {
        const result = await sender.scanChats({
          ...options,
          unreadOnly: !original,
        });
        const ids = result.rows.map((row) => row.chat);
        if (before) {
          assert.deepEqual(ids, original ? unread : all);
          assert.equal(result.filter, undefined);
          await shot(page, 'filter-before', {
            requested: !original,
            ids,
            ignored: true,
          });
          return;
        }
        assert.deepEqual(ids, original ? all : unread);
        assert.equal(result.filter.before, original);
        assert.equal(result.filter.observed, !original);
        assert.equal(result.filter.restored, true);
        assert.equal(result.filter.scrollRestored, true);
        assert.equal(result.restored, true);
        assert.equal(result.coverage.complete, false);
        assert.equal(await page.locator('#outer-filter').isChecked(), original);
        assert.equal(
          await page
            .locator('[data-qa="chatik-checkbox-only-unread"]')
            .isChecked(),
          !original
        );
        assert.equal(
          await page.locator('#list').evaluate((node) => node.scrollTop),
          300
        );
        await shot(page, `filter-${original ? 'all' : 'unread'}-after`, {
          ids,
          filter: result.filter,
          coverage: result.coverage,
        });
        outcomes.push(original ? 'all-restored-unread' : 'unread-restored-all');
      }
    );
    if (before) {
      break;
    }
  }
  if (before) {
    return { before: true, liveProvider: false };
  }
  for (const interrupted of [false, true]) {
    const controller = new AbortController();
    let moved = false;
    await withHhBrowserScanFixture(
      browser,
      {
        html: hhChatScanHtml({ filter: true }),
        onMove: async (page) => {
          if (moved) {
            return;
          }
          moved = true;
          if (interrupted) {
            await page.locator('#list').hover();
            await page.mouse.wheel(0, 60);
            await page.waitForTimeout(30);
          } else {
            controller.abort();
          }
        },
      },
      async ({ sender, page }) => {
        const result = await sender.scanChats({
          ...options,
          unreadOnly: true,
          signal: controller.signal,
        });
        assert.equal(
          result.coverage.reason,
          interrupted ? 'owner-active' : 'cancelled'
        );
        assert.equal(result.filter.restored, !interrupted);
        assert.equal(
          await page.locator('#outer-filter').isChecked(),
          interrupted
        );
        await shot(
          page,
          `filter-${interrupted ? 'owner' : 'cancel'}-after`,
          result
        );
        outcomes.push(
          interrupted ? 'owner-keeps-filter' : 'cancel-restores-filter'
        );
      }
    );
  }
  await withHhBrowserScanFixture(
    browser,
    { html: hhChatScanHtml({ filter: true, emptyUnread: true }) },
    async ({ sender, page }) => {
      const result = await sender.scanChats({ ...options, unreadOnly: true });
      assert.deepEqual(result.rows, []);
      assert.equal(result.coverage.complete, false);
      assert.equal(result.filter.restored, true);
      assert.equal(await page.locator('#outer-filter').isChecked(), false);
      outcomes.push('empty-filter-restored');
    }
  );
  await withHhBrowserScanFixture(
    browser,
    { html: hhChatScanHtml({ filter: true, filterApplies: false }) },
    async ({ sender }) => {
      const result = await sender.scanChats({ ...options, unreadOnly: true });
      assert.deepEqual(result.rows, []);
      assert.equal(result.coverage.reason, 'filter-unconfirmed');
      assert.equal(result.filter.restored, true);
      outcomes.push('unfiltered-rows-refused');
    }
  );
  await verifyInactiveFilter(browser, outcomes);
  return { cases: outcomes.length, outcomes, liveProvider: false };
};
