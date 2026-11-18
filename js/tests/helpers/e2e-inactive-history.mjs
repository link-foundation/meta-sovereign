/* global Event */
import assert from 'node:assert/strict';
import { browserChoicePage } from '../../src/sources/browser-choices.js';
import { conversationHistoryHtml } from '../../../experiments/issue-56/conversation-history-fixture.mjs';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';

const target = { source: 'hh', chat: '7' };
const options = { endWaitMs: 100 };
const state = (frame) =>
  frame.evaluate(() => ({
    top: document.querySelector('#history').scrollTop,
    draft: document.querySelector('textarea').value,
    selection: [
      document.querySelector('textarea').selectionStart,
      document.querySelector('textarea').selectionEnd,
    ],
    lease: Boolean(
      window[Symbol.for('meta-sovereign.browser-inactive-view.v1')]
    ),
    history: Boolean(
      window[Symbol.for('meta-sovereign.browser-conversation-history.v1')]
    ),
    sends: window.fixture.sends,
  }));
const blur = async (page) => {
  const other = await page.context().newPage();
  await other.bringToFront();
  return other;
};
const fixture = (browser, { onRead, frames } = {}, work) =>
  withHhBrowserScanFixture(
    browser,
    {
      frames,
      html: conversationHistoryHtml(),
      isRead: ({ fn, args }) =>
        fn === browserChoicePage && args?.[0]?.operation === 'history',
      onRead,
    },
    async ({ sender, page }) => {
      const handle = await sender.openAnswerWatch(target);
      try {
        await work({ sender, page, handle });
      } finally {
        await handle.close();
      }
    }
  );

/** Real focus, owned main/child documents and the production history traversal. */
export const verifyInactiveHistory = async (browser) => {
  const outcomes = [];
  if (browser.browserType().name() !== 'chromium') {
    await fixture(browser, {}, async ({ handle }) => {
      await assert.rejects(handle.readInactiveHistory(options), {
        code: 'browser-background-focus-unavailable',
      });
    });
    return {
      cases: 1,
      outcomes: ['unsupported-focus-refused'],
      liveProvider: false,
    };
  }
  await fixture(browser, {}, async ({ page, handle }) => {
    assert.equal(typeof handle.readInactiveHistory, 'function');
    await page.bringToFront();
    const original = await state(page);
    await assert.rejects(handle.readInactiveHistory(options), {
      code: 'browser-background-owner-active',
    });
    assert.deepEqual(await state(page), original);
    outcomes.push('focused-no-traversal');
    const other = await blur(page);
    const receipt = await handle.readInactiveHistory(options);
    assert.equal(
      receipt.coverage.complete,
      true,
      JSON.stringify(receipt.coverage)
    );
    assert.equal(receipt.rows.length, 12);
    assert.equal(receipt.restored, true);
    assert.deepEqual(await state(page), original);
    assert.equal(page.url(), 'https://hh.ru/chat/7');
    await other.close();
    outcomes.push('inactive-history-draft-selection-anchor-restored');
  });
  let touched = false;
  let owner;
  await fixture(
    browser,
    {
      onRead: async (page) => {
        if (!touched) {
          touched = true;
          await page.bringToFront();
          owner = await state(page);
        }
      },
    },
    async ({ page, handle }) => {
      const other = await blur(page);
      await assert.rejects(handle.readInactiveHistory(options), {
        code: 'browser-background-owner-active',
      });
      assert.deepEqual(await state(page), {
        ...owner,
        lease: false,
        history: false,
      });
      await other.close();
      outcomes.push('owner-focus-stops-without-restoring');
    }
  );
  await fixture(
    browser,
    { frames: [{ url: 'https://chatik.hh.ru/chat/7' }] },
    async ({ page, handle }) => {
      const child = page.frames().find((frame) => frame !== page.mainFrame());
      await page.bringToFront();
      assert.equal(await child.evaluate(() => document.hasFocus()), false);
      const original = await state(child);
      await assert.rejects(handle.readInactiveHistory(options), {
        code: 'browser-background-owner-active',
      });
      assert.deepEqual(await state(child), original);
      outcomes.push('outer-focus-refuses-inactive-child');
      const other = await blur(page);
      const receipt = await handle.readInactiveHistory(options);
      assert.equal(receipt.coverage.complete, true);
      assert.equal(receipt.restored, true);
      assert.deepEqual(await state(child), original);
      assert.equal(
        await page.evaluate(() =>
          Boolean(window[Symbol.for('meta-sovereign.browser-inactive-view.v1')])
        ),
        false
      );
      await other.close();
      outcomes.push('trusted-child-restored-and-both-leases-released');
    }
  );
  const controller = new AbortController();
  await fixture(
    browser,
    { onRead: () => controller.abort() },
    async ({ page, handle }) => {
      const original = await state(page);
      const other = await blur(page);
      const receipt = await handle.readInactiveHistory({
        ...options,
        signal: controller.signal,
      });
      assert.equal(receipt.coverage.reason, 'cancelled');
      assert.equal(receipt.restored, true);
      assert.deepEqual(await state(page), original);
      await other.close();
      outcomes.push('cancellation-restores-and-drains');
    }
  );
  await verifyScrollSettlement(browser, outcomes);
  let active;
  let closing;
  await fixture(
    browser,
    {
      onRead: () => {
        closing ??= active.close();
      },
    },
    async ({ page, handle }) => {
      active = handle;
      const original = await state(page);
      const other = await blur(page);
      const receipt = await handle.readInactiveHistory(options);
      await closing;
      assert.equal(receipt.coverage.reason, 'cancelled');
      assert.equal(receipt.restored, true);
      assert.deepEqual(await state(page), original);
      await assert.rejects(handle.readInactiveHistory(options), {
        code: 'question-watch-page-changed',
      });
      await other.close();
      outcomes.push('close-drains-restores-and-closes-admission');
    }
  );
  return {
    cases: outcomes.length,
    outcomes,
    focusMode:
      browser.browserType().name() === 'chromium' ? 'native' : 'modeled',
    liveProvider: false,
  };
};

const verifyScrollSettlement = async (browser, outcomes) => {
  await fixture(
    browser,
    {
      onRead: async (page) => {
        assert.equal(
          await page.evaluate(() => Boolean(window.fixture.hold)),
          false,
          'Do not read a stale mounted window before its scroll event settles'
        );
      },
    },
    async ({ page, handle }) => {
      const other = await blur(page);
      await page.evaluate(() => {
        window.fixture.hold = true;
        document.addEventListener(
          'scroll',
          (event) => {
            if (window.fixture.hold) {
              event.stopImmediatePropagation();
              window.setTimeout(() => {
                window.fixture.hold = false;
                event.target.dispatchEvent(new Event('scroll'));
              }, 400);
            }
          },
          true
        );
      });
      const receipt = await handle.readInactiveHistory(options);
      assert.equal(
        receipt.coverage.complete,
        true,
        JSON.stringify(receipt.coverage)
      );
      assert.equal(receipt.restored, true);
      const after = await state(page);
      assert.equal(after.lease, false);
      assert.equal(after.history, false);
      assert.equal(after.sends, 0);
      await other.close();
      outcomes.push('scroll-event-before-reading-next-window');
    }
  );
};
