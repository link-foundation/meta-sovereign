/* global Event */
import assert from 'node:assert/strict';
import {
  withChatNavigationFixture,
  readChatNavigationView,
} from './e2e-chat-navigation.mjs';
import { chatNavigationHtml } from '../../../experiments/issue-56/chat-navigation-fixture.mjs';

const settings = {
  source: 'hh',
  maxChats: 2,
  waitMs: 100,
  endWaitMs: 100,
  budgetMs: 30000,
};
const fixture = (browser, work) =>
  withChatNavigationFixture(
    browser,
    {
      html: chatNavigationHtml({ textReplies: true }),
    },
    work
  );

/** A private native in-visit capability, not public automatic delivery. */
export const verifyUnreadDeliveryVisit = async (
  browser,
  { before = false } = {}
) => {
  const outcomes = [];
  await fixture(browser, async ({ sender, page, original }) => {
    if (browser.browserType().name() !== 'chromium') {
      await assert.rejects(sender.scanUnreadConversations(settings), {
        code: 'browser-background-focus-unavailable',
      });
      outcomes.push('unsupported-focus-refused');
      return;
    }
    const visited = [];
    let saved;
    const result = await sender.scanUnreadConversations({
      ...settings,
      onConversation: async (observation, handle) => {
        assert.equal(observation.history.coverage.complete, true);
        assert.equal(observation.history.restored, true);
        assert.equal(handle.snapshot.chat, observation.chat);
        assert.equal(handle.snapshot.question.body, 'What time can you start?');
        visited.push(observation.chat);
        saved = handle;
        let receipt;
        try {
          receipt = await handle.replyTextInactive(
            handle.snapshot,
            'At 9 a.m.'
          );
        } catch (error) {
          console.error(
            '[unread-visit-fixture-failure]',
            await page.evaluate(() => ({
              sends: window.fixture.sends,
              draft: document.querySelector('textarea').value,
              html: document.querySelector('#messages').innerHTML,
            }))
          );
          throw error;
        }
        assert.equal(receipt.messageId, `${observation.chat}08`);
        assert.equal(receipt.text, 'At 9 a.m.');
        return receipt;
      },
    });
    if (before) {
      assert.deepEqual(
        visited,
        [],
        'The parent unexpectedly supports borrowed visits'
      );
      outcomes.push('actual-parent-ignores-in-visit-delivery');
      return;
    }
    assert.deepEqual(visited, ['8', '9']);
    assert.equal(
      result.restoration.restored,
      true,
      JSON.stringify(result.restoration)
    );
    assert.ok(result.conversations.every((entry) => entry.processing.restored));
    assert.deepEqual(await readChatNavigationView(page), {
      ...original,
      sends: 2,
    });
    await assert.rejects(saved.readInactiveQuestion(), {
      code: 'browser-unread-visit-closed',
    });
    outcomes.push('sequential-owned-replies-without-nested-queue');
  });
  if (before || browser.browserType().name() !== 'chromium') {
    return { cases: outcomes.length, outcomes, liveProvider: false };
  }
  await verifyStoppedVisit(browser, outcomes);
  await verifyOwnerInput(browser, outcomes);
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

const verifyStoppedVisit = async (browser, outcomes) => {
  await fixture(browser, async ({ sender, page, original }) => {
    const controller = new AbortController();
    let calls = 0;
    const result = await sender.scanUnreadConversations({
      ...settings,
      signal: controller.signal,
      onConversation: async (_observation, handle) => {
        calls++;
        controller.abort();
        await assert.rejects(
          handle.replyTextInactive(handle.snapshot, 'Thanks'),
          { code: 'browser-unread-cancelled' }
        );
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.coverage.reason, 'cancelled');
    assert.equal(result.restoration.restored, true);
    assert.deepEqual(await readChatNavigationView(page), original);
    outcomes.push('cancel-before-effect-restores-view');
  });
};

const verifyOwnerInput = async (browser, outcomes) => {
  await fixture(browser, async ({ sender, page }) => {
    await assert.rejects(
      sender.scanUnreadConversations({
        ...settings,
        onConversation: async (_observation, handle) => {
          await page.locator('textarea').evaluate((field) => {
            field.value = 'Owner interruption';
            field.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await handle.replyTextInactive(handle.snapshot, 'Thanks');
        },
      }),
      (error) => {
        assert.equal(error.restoration.restored, false);
        assert.match(error.code, /owner-active/);
        return true;
      }
    );
    const current = await readChatNavigationView(page);
    assert.equal(current.draft, 'Owner interruption');
    assert.equal(current.sends, 0);
    assert.match(current.url, /\/chat\/8$/);
    assert.equal(current.lease, false);
    outcomes.push('owner-input-wins-without-send-or-restoration');
  });
};
