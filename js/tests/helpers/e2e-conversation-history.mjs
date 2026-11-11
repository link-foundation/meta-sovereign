/* global Event */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { browserChoicePage } from '../../src/sources/browser-choices.js';
import {
  conversationHistoryHtml,
  conversationHistoryIds,
} from '../../../experiments/issue-56/conversation-history-fixture.mjs';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';

const settings = {
  source: 'hh',
  chat: '7',
  waitMs: 30,
  endWaitMs: 100,
  budgetMs: 5000,
};
const withFixture = (
  browser,
  { frames, onRead, onMove, ...fixture } = {},
  work
) =>
  withHhBrowserScanFixture(
    browser,
    {
      frames,
      html: conversationHistoryHtml(fixture),
      onMove,
      isRead: ({ fn, args }) =>
        fn === browserChoicePage && args?.[0]?.operation === 'history',
      onRead: async (page, result) => {
        if (process.env.MS_BROWSER_HISTORY_DEBUG === '1') {
          console.error(
            '[history-fixture-window]',
            result.messages.map((row) => row.id)
          );
        }
        await onRead?.(page);
      },
    },
    work
  );
const state = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('#history'),
      composer = document.querySelector('textarea');
    return {
      top: root.scrollTop,
      draft: composer.value,
      selection: [composer.selectionStart, composer.selectionEnd],
      clicks: window.fixture.clicks,
      sends: window.fixture.sends,
      live: Boolean(
        window[Symbol.for('meta-sovereign.browser-conversation-history.v1')]
      ),
    };
  });
const show = async (page, result, screenshots, name) => {
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

export const verifyConversationHistory = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const outcomes = [];
  for (const reversed of [false, true]) {
    await withFixture(browser, { reversed }, async ({ sender, page }) => {
      const recent = await sender.readRecent(settings);
      assert.equal(
        recent.some((row) => row.outgoing),
        false
      );
      if (before) {
        assert.equal(typeof sender.scanConversation, 'undefined');
        await show(
          page,
          {
            available: false,
            renderedRows: recent.length,
            earlierManualReplyFound: false,
          },
          screenshots,
          `history-${reversed ? 'reversed' : 'ordinary'}-before`
        );
        return;
      }
      const original = await state(page);
      const result = await sender.scanConversation(settings);
      assert.deepEqual(
        result.rows.map((row) => row.id),
        conversationHistoryIds.map(String)
      );
      assert.equal(result.rows[2].outgoing, true);
      assert.equal(result.coverage.complete, true);
      assert.equal(result.coverage.reason, 'provider-start');
      assert.equal(result.restored, true);
      assert.deepEqual(await state(page), original);
      await show(
        page,
        {
          ids: result.rows.map((row) => row.id),
          earlierManualReplyFound: result.rows[2].outgoing,
          ...result.coverage,
          restored: result.restored,
        },
        screenshots,
        `history-${reversed ? 'reversed' : 'ordinary'}-after`
      );
      outcomes.push(reversed ? 'reversed-history' : 'ordinary-history');
    });
  }
  if (before) {
    return { unavailableBefore: true, liveProvider: false };
  }
  await withFixture(browser, { marker: false }, async ({ sender }) => {
    const result = await sender.scanConversation(settings);
    assert.equal(result.coverage.complete, false);
    assert.equal(result.coverage.reason, 'rendered-start');
    outcomes.push('stalled-incomplete');
  });
  await verifyInterruptions(browser, outcomes);
  await verifyChanges(browser, outcomes);
  await verifyFrames(browser, outcomes);
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

const verifyInterruptions = async (browser, outcomes) => {
  for (const action of [
    'wheel',
    'touchmove',
    'input',
    'silent-draft',
    'new-composer',
  ]) {
    let touched = false;
    let owner;
    await withFixture(
      browser,
      {
        onRead: async (page) => {
          if (touched) {
            return;
          }
          touched = true;
          await page.evaluate((type) => {
            if (type === 'input' || type === 'silent-draft') {
              document.querySelector('textarea').value = 'Owner new draft';
            }
            if (type === 'new-composer') {
              document
                .querySelector('textarea')
                .after(document.querySelector('textarea').cloneNode(true));
            }
            if (['wheel', 'touchmove', 'input'].includes(type)) {
              document.dispatchEvent(new Event(type, { bubbles: true }));
            }
          }, action);
          owner = await state(page);
        },
      },
      async ({ sender, page }) => {
        const result = await sender.scanConversation(settings);
        assert.equal(result.coverage.reason, 'owner-active');
        assert.equal(result.restored, false);
        assert.deepEqual(result.rows, []);
        assert.deepEqual(await state(page), { ...owner, live: false });
        outcomes.push(`owner-${action}`);
      }
    );
  }
};

const verifyChanges = async (browser, outcomes) => {
  for (const [name, mutate, reason] of [
    [
      'gap',
      () => {
        window.fixture.jump = true;
        window.fixture.render();
      },
      'history-gap',
    ],
    [
      'edit',
      () => {
        window.fixture.records[9].body = 'Changed body';
        window.fixture.render();
      },
      'conversation-changed',
    ],
    [
      'replaced-root',
      () => {
        const root = document.querySelector('#history');
        root.replaceWith(root.cloneNode(true));
      },
      'changed',
    ],
  ]) {
    let moved = false;
    await withFixture(
      browser,
      {
        onMove: async (page) => {
          if (!moved) {
            moved = true;
            await page.evaluate(mutate);
          }
        },
      },
      async ({ sender, page }) => {
        const result = await sender.scanConversation(settings);
        assert.equal(result.coverage.complete, false);
        assert.equal(result.coverage.reason, reason);
        assert.equal((await state(page)).live, false);
        outcomes.push(name);
      }
    );
  }
  let moved = false;
  await withFixture(
    browser,
    {
      onRead: async (page) => {
        if (!moved) {
          moved = true;
          await page.goto('https://hh.ru/chat/99');
        }
      },
    },
    async ({ sender, page }) => {
      const result = await sender.scanConversation(settings);
      assert.equal(result.coverage.reason, 'document-changed');
      assert.equal(result.restored, false);
      assert.equal(page.url(), 'https://hh.ru/chat/99');
      outcomes.push('navigation-no-restore');
    }
  );
  const controller = new AbortController();
  await withFixture(
    browser,
    { onMove: async () => controller.abort() },
    async ({ sender, page }) => {
      const result = await sender.scanConversation({
        ...settings,
        signal: controller.signal,
      });
      assert.equal(result.coverage.reason, 'cancelled');
      assert.equal(result.restored, true);
      assert.equal((await state(page)).live, false);
      outcomes.push('cancel-drained');
    }
  );
  let closing;
  let activeSender;
  await withFixture(
    browser,
    {
      onMove: async () => {
        closing ??= activeSender.close();
      },
    },
    async ({ sender, page }) => {
      activeSender = sender;
      const result = await sender.scanConversation(settings);
      assert.equal(result.coverage.reason, 'cancelled');
      assert.equal(result.restored, true);
      await closing;
      assert.equal(page.isClosed(), true);
      outcomes.push('close-drained');
    }
  );
};

const verifyFrames = async (browser, outcomes) => {
  const child = { url: 'https://chatik.hh.ru/chat/7' };
  await withFixture(
    browser,
    { frames: [child, { ...child, hidden: true }] },
    async ({ sender }) => {
      const result = await sender.scanConversation(settings);
      assert.equal(result.rows.length, 12);
      assert.equal(result.coverage.complete, true);
      assert.equal(result.restored, true);
      outcomes.push('visible-child');
    }
  );
  await withFixture(browser, { frames: [child, child] }, async ({ sender }) => {
    await assert.rejects(sender.scanConversation(settings), {
      code: 'answer-chat-unverified',
    });
    outcomes.push('ambiguous-child');
  });
};
