import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { browserChoicePage } from '../../src/sources/browser-choices.js';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';
import { chatNavigationHtml } from '../../../experiments/issue-56/chat-navigation-fixture.mjs';

const options = { source: 'hh', waitMs: 150, endWaitMs: 100, budgetMs: 30000 };
const ownerUrl = 'https://hh.ru/chat/7?owner=1#reading';
const contentView = (page) =>
  page
    .frames()
    .find(
      (frame) =>
        frame !== page.mainFrame() &&
        new URL(frame.url()).hostname === 'chatik.hh.ru'
    ) ?? page;
const state = (page) =>
  contentView(page).evaluate(() => {
    const field = document.querySelector('textarea');
    return {
      url: window.location.href,
      filter: document.querySelector('#outer-filter').checked,
      draft: field.value,
      selection: [
        field.selectionStart,
        field.selectionEnd,
        field.selectionDirection,
      ],
      draftTop: field.scrollTop,
      listTop: document.querySelector('#list').scrollTop,
      messageTop: document.querySelector('#history').scrollTop,
      sends: window.fixture.sends,
      lease: Boolean(
        window[Symbol.for('meta-sovereign.browser-inactive-view.v1')]
      ),
      view: Boolean(window[Symbol.for('meta-sovereign.browser-chat-view.v1')]),
    };
  });
const screenshot = (screenshots) => async (page, name, receipt) => {
  if (!screenshots) {
    return;
  }
  await mkdir(screenshots, { recursive: true });
  await contentView(page)
    .locator('#result')
    .evaluate((node, value) => {
      node.textContent = JSON.stringify(value, null, 2);
    }, receipt);
  await page.screenshot({
    path: join(screenshots, `${name}.png`),
    fullPage: true,
  });
};

const fixture = (
  browser,
  { html = chatNavigationHtml(), onRead, onMove, frames, setup } = {},
  work
) => {
  let armed = false;
  return withHhBrowserScanFixture(
    browser,
    {
      html,
      frames,
      isRead: ({ fn, args }) =>
        fn === browserChoicePage && args?.[0]?.operation === 'history',
      onRead: (...args) => armed && onRead?.(...args),
      onMove: async (page) => {
        if (armed) {
          await onMove?.(page);
        }
        if (process.env.MS_BROWSER_HISTORY_DEBUG !== '1') {
          return;
        }
        console.error(
          '[navigation-fixture-move]',
          await page.evaluate(() => {
            const state =
              window[
                Symbol.for('meta-sovereign.browser-conversation-history.v1')
              ];
            return state
              ? {
                  top: state.root.scrollTop,
                  pending: state.pendingScroll,
                  ids: [...state.root.querySelectorAll('article')].map(
                    (node) => node.dataset.qa
                  ),
                }
              : null;
          })
        );
      },
    },
    async ({ sender, page }) => {
      await sender.readRecent({ source: 'hh', chat: '7' });
      await page.evaluate(
        (url) => window.history.replaceState({}, '', url),
        ownerUrl
      );
      await setup?.(page);
      const original = await state(page);
      const other = await page.context().newPage();
      try {
        await other.bringToFront();
        armed = true;
        await work({ sender, page, original });
      } finally {
        await other.close();
      }
    }
  );
};

export const verifyChatNavigation = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const outcomes = [];
  const shot = screenshot(screenshots);
  await fixture(browser, {}, async ({ sender, page, original }) => {
    if (before) {
      assert.equal(typeof sender.scanUnreadConversations, 'undefined');
      await shot(page, 'navigation-before', {
        available: false,
        state: original,
      });
      return;
    }
    if (browser.browserType().name() !== 'chromium') {
      await assert.rejects(sender.scanUnreadConversations(options), {
        code: 'browser-background-focus-unavailable',
      });
      assert.deepEqual(await state(page), original);
      outcomes.push('unsupported-native-focus-refused');
      return;
    }
    const result = await sender.scanUnreadConversations(options);
    assert.deepEqual(
      result.conversations.map((item) => item.chat),
      ['8', '9']
    );
    assert.ok(
      result.conversations.every(
        (item) =>
          item.history.coverage.complete && item.history.rows.length === 8
      ),
      JSON.stringify(
        result.conversations.map((item) => ({
          chat: item.chat,
          coverage: item.history.coverage,
          rows: item.history.rows.map((row) => row.id),
        }))
      )
    );
    assert.equal(result.coverage.complete, false);
    assert.equal(
      result.restoration.restored,
      true,
      JSON.stringify(result.restoration)
    );
    assert.deepEqual(await state(page), original);
    await shot(page, 'navigation-restored', {
      chats: result.conversations.map((item) => item.chat),
      coverage: result.coverage,
      restoration: result.restoration,
    });
    outcomes.push('two-chats-url-draft-selection-scroll-restored');
  });
  if (before || browser.browserType().name() !== 'chromium') {
    return { cases: outcomes.length, outcomes, liveProvider: false };
  }
  await fixture(
    browser,
    {
      frames: [
        { url: 'https://chatik.hh.ru/chat/7' },
        { url: 'https://chatik.hh.ru/chat/7', hidden: true },
      ],
      setup: (page) =>
        page.evaluate(() =>
          window.history.replaceState({}, '', '/chat?owner=1')
        ),
    },
    async ({ sender, page, original }) => {
      const owner = page.url();
      const result = await sender.scanUnreadConversations(options);
      assert.deepEqual(
        result.conversations.map((item) => item.chat),
        ['8', '9']
      );
      assert.equal(
        result.restoration.restored,
        true,
        JSON.stringify(result.restoration)
      );
      assert.equal(page.url(), owner);
      assert.deepEqual(await state(page), original);
      await shot(page, 'navigation-child-restored', result.restoration);
      outcomes.push('visible-child-and-owner-routes-restored');
    }
  );
  await verifyNavigationDrafts(browser, outcomes, shot);
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

const verifyNavigationDrafts = async (browser, outcomes, shot) => {
  for (const changedDraft of [false, true]) {
    await fixture(
      browser,
      { html: chatNavigationHtml({ loseDraft: true, changedDraft }) },
      async ({ sender, page, original }) => {
        const result = await sender.scanUnreadConversations({
          ...options,
          maxChats: 1,
        });
        assert.equal(
          result.restoration.restored,
          !changedDraft,
          JSON.stringify(result.restoration)
        );
        const actual = await state(page);
        if (changedDraft) {
          assert.equal(actual.draft, 'Owner draft changed elsewhere');
          assert.equal(result.restoration.reason, 'draft-changed');
        } else {
          assert.deepEqual(actual, original);
        }
        await shot(
          page,
          changedDraft
            ? 'navigation-preserved-edit'
            : 'navigation-restored-missing-draft',
          result.restoration
        );
        outcomes.push(
          changedDraft
            ? 'changed-draft-preserved'
            : 'missing-draft-native-restored'
        );
      }
    );
  }
};

export const verifyUnreadViewGuards = async (browser, { screenshots } = {}) => {
  if (browser.browserType().name() !== 'chromium') {
    return verifyChatNavigation(browser);
  }
  const outcomes = [];
  const shot = screenshot(screenshots);
  const controller = new AbortController();
  let cancelled = false;
  await fixture(
    browser,
    {
      onRead: () => {
        if (!cancelled) {
          cancelled = true;
          controller.abort();
        }
      },
    },
    async ({ sender, page, original }) => {
      const result = await sender.scanUnreadConversations({
        ...options,
        signal: controller.signal,
      });
      assert.equal(result.coverage.reason, 'cancelled');
      assert.equal(result.restoration.restored, true);
      assert.deepEqual(await state(page), original);
      outcomes.push('cancel-drains-and-restores');
    }
  );
  let returned = false;
  await fixture(
    browser,
    {
      onRead: async (page) => {
        if (!returned) {
          returned = true;
          await page.bringToFront();
          await page.locator('textarea').fill('Owner returned draft');
        }
      },
    },
    async ({ sender, page }) => {
      await assert.rejects(sender.scanUnreadConversations(options), (error) => {
        assert.equal(error.restoration.restored, false);
        return true;
      });
      assert.equal(page.url(), 'https://hh.ru/chat/8');
      assert.equal((await state(page)).draft, 'Owner returned draft');
      await shot(page, 'navigation-owner-returned', {
        restored: false,
        state: await state(page),
      });
      outcomes.push('owner-return-keeps-chat-and-edits');
    }
  );
  await fixture(
    browser,
    { html: chatNavigationHtml({ replace: true }) },
    async ({ sender, page }) => {
      const result = await sender.scanUnreadConversations({
        ...options,
        maxChats: 1,
      });
      assert.equal(result.restoration.restored, false);
      assert.equal(result.restoration.reason, 'history-unavailable');
      assert.equal(page.url(), 'https://hh.ru/chat/8');
      outcomes.push('replace-route-restoration-unavailable');
    }
  );
  outcomes.push(...(await verifyUnreadNavigationStop(browser)).outcomes);
  await verifyNavigationBounds(browser, outcomes, shot);
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

const verifyNavigationBounds = async (browser, outcomes, shot) => {
  await fixture(
    browser,
    {
      setup: async (page) => {
        await page.evaluate(() => {
          window.history.pushState({}, '', '/chat/99');
          window.history.back();
        });
        await page.waitForURL(ownerUrl);
      },
    },
    async ({ sender, page, original }) => {
      await assert.rejects(sender.scanUnreadConversations(options), {
        code: 'browser-chat-view-history-forward',
      });
      assert.deepEqual(await state(page), original);
      outcomes.push('existing-forward-history-preserved');
    }
  );
  await fixture(browser, {}, async ({ sender, page, original }) => {
    const result = await sender.scanUnreadConversations({
      ...options,
      budgetMs: 100,
    });
    assert.equal(result.coverage.reason, 'time-limit');
    assert.deepEqual(result.conversations, []);
    assert.equal(result.restoration.restored, true);
    assert.deepEqual(await state(page), original);
    outcomes.push('small-budget-restores-without-history');
  });
  await fixture(
    browser,
    { html: chatNavigationHtml({ reload: true }) },
    async ({ sender, page }) => {
      await assert.rejects(sender.scanUnreadConversations(options), (error) => {
        assert.equal(error.restoration.restored, false);
        return true;
      });
      assert.equal(page.url(), 'https://hh.ru/chat/8');
      assert.equal((await state(page)).sends, 0);
      outcomes.push('reload-document-refused');
    }
  );
  await fixture(
    browser,
    { html: chatNavigationHtml({ virtual: true }) },
    async ({ sender, page, original }) => {
      const result = await sender.scanUnreadConversations(options);
      assert.deepEqual(
        result.conversations.map((item) => item.chat),
        ['8', '9']
      );
      assert.equal(
        result.restoration.restored,
        true,
        JSON.stringify(result.restoration)
      );
      assert.deepEqual(await state(page), original);
      await shot(page, 'navigation-virtual-restored', result.restoration);
      outcomes.push('virtual-target-revealed-and-restored');
    }
  );
  await fixture(
    browser,
    { html: chatNavigationHtml({ allRead: true }) },
    async ({ sender, page, original }) => {
      const result = await sender.scanUnreadConversations(options);
      assert.deepEqual(result.conversations, []);
      assert.equal(result.coverage.complete, false);
      assert.equal(result.restoration.restored, true);
      assert.deepEqual(await state(page), original);
      outcomes.push('empty-unread-list-restored');
    }
  );
};

export const verifyUnreadNavigationStop = async (browser) => {
  const outcomes = [];
  const stop = new AbortController();
  await fixture(
    browser,
    {
      html: chatNavigationHtml({ virtual: true }),
      onMove: async (page) => {
        if (
          await page.evaluate(
            () =>
              window.fixture.visits.length === 1 &&
              !window[
                Symbol.for('meta-sovereign.browser-conversation-history.v1')
              ]
          )
        ) {
          stop.abort();
        }
      },
    },
    async ({ sender, page, original }) => {
      await assert.rejects(
        sender.scanUnreadConversations({ ...options, signal: stop.signal }),
        (error) => {
          assert.equal(error.code, 'browser-chat-view-cancelled');
          assert.equal(error.restoration.restored, true);
          return true;
        }
      );
      assert.deepEqual(await state(page), original);
      assert.deepEqual(await page.evaluate(() => window.fixture.visits), ['8']);
      outcomes.push('stop-during-reveal-never-clicks-next-chat');
    }
  );
  let activeSender, closing;
  await fixture(
    browser,
    {
      onRead: () => {
        closing ??= activeSender.close();
      },
    },
    async ({ sender, page }) => {
      activeSender = sender;
      const result = await sender.scanUnreadConversations(options);
      assert.equal(result.coverage.reason, 'cancelled');
      assert.equal(result.restoration.restored, true);
      await closing;
      assert.equal(page.isClosed(), true);
      outcomes.push('shutdown-restores-before-browser-close');
    }
  );
  return { cases: outcomes.length, outcomes, liveProvider: false };
};
