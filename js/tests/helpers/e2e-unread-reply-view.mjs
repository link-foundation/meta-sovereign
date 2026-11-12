/* global Event */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
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
const text = 'Confirmed original-chat reply';
const bubbleVisible = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('#history').getBoundingClientRect();
    const bubble = document.querySelector(
      '[data-qa="chatik-chat-message-708"]'
    );
    const box = bubble?.getBoundingClientRect();
    return Boolean(box && box.bottom > root.top && box.top < root.bottom);
  });
const shot = async (page, screenshots, name, result) => {
  if (!screenshots) {
    return;
  }
  await mkdir(screenshots, { recursive: true });
  await page.locator('#result').evaluate((node, value) => {
    node.textContent = JSON.stringify(value, null, 2);
  }, result);
  await page.screenshot({
    path: join(screenshots, `reply-view-${name}.png`),
    fullPage: true,
  });
};
const fixture = (browser, options, work) =>
  withChatNavigationFixture(
    browser,
    {
      html: chatNavigationHtml({
        textReplies: true,
        emptyOriginal: true,
        originalUnread: true,
        unreadChats: ['8'],
        ...options,
      }),
    },
    work
  );

export const verifyUnreadReplyView = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const outcomes = [];
  for (const reversedMessages of [false, true]) {
    await fixture(
      browser,
      { reversedMessages },
      async ({ sender, page, original }) => {
        if (browser.browserType().name() !== 'chromium') {
          await assert.rejects(sender.scanUnreadConversations(settings), {
            code: 'browser-background-focus-unavailable',
          });
          outcomes.push('unsupported-focus-refused');
          return;
        }
        const result = await sender.scanUnreadConversations({
          ...settings,
          onConversation: async (entry, handle) =>
            entry.chat === '7'
              ? handle.replyTextInactive(handle.snapshot, text)
              : null,
        });
        const receipt = result.conversations.find((entry) => entry.chat === '7')
          .processing.value;
        assert.deepEqual(
          result.conversations.map((entry) => entry.chat),
          ['8', '7']
        );
        assert.equal(receipt.messageId, '708');
        assert.equal(receipt.text, text);
        const visible = await bubbleVisible(page);
        await shot(
          page,
          screenshots,
          before ? 'before' : reversedMessages ? 'reversed' : 'after',
          {
            restoration: result.restoration,
            receipt,
            visible,
          }
        );
        assert.equal(
          visible,
          true,
          'The confirmed original-chat reply must remain visible'
        );
        assert.deepEqual(result.restoration.replyView, {
          state: 'revealed',
          chat: '7',
          messageId: '708',
        });
        assert.equal(result.restoration.restored, true);
        const current = await readChatNavigationView(page);
        assert.deepEqual(current, {
          ...original,
          sends: 1,
          messageTop: current.messageTop,
        });
        assert.notEqual(current.messageTop, original.messageTop);
        outcomes.push(
          reversedMessages
            ? 'reversed-virtualized-reply-visible'
            : 'ordinary-virtualized-reply-visible'
        );
      }
    );
    if (before || browser.browserType().name() !== 'chromium') {
      break;
    }
  }
  if (before || browser.browserType().name() !== 'chromium') {
    return { cases: outcomes.length, outcomes, liveProvider: false };
  }
  await fixture(browser, {}, async ({ sender, page, original }) => {
    const result = await sender.scanUnreadConversations({
      ...settings,
      onConversation: async (entry, handle) => {
        if (entry.chat !== '7') {
          return;
        }
        const receipt = await handle.replyTextInactive(handle.snapshot, text);
        await page.evaluate(() => {
          window.fixture.replies['7'] = 'Different outgoing text';
        });
        return receipt;
      },
    });
    assert.equal(result.restoration.replyView.state, 'unavailable');
    assert.equal(result.restoration.restored, true);
    assert.deepEqual(await readChatNavigationView(page), {
      ...original,
      sends: 1,
    });
    assert.equal(result.conversations.at(-1).processing.value.messageId, '708');
    outcomes.push('unmatched-bubble-restores-anchor-without-erasing-delivery');
  });
  await fixture(browser, {}, async ({ sender, page }) => {
    let receipt;
    await assert.rejects(
      sender.scanUnreadConversations({
        ...settings,
        onConversation: async (entry, handle) => {
          if (entry.chat !== '7') {
            return;
          }
          receipt = await handle.replyTextInactive(handle.snapshot, text);
          await page.locator('textarea').evaluate((field) => {
            field.value = 'Owner resumed writing';
            field.dispatchEvent(new Event('input', { bubbles: true }));
          });
        },
      }),
      (error) => {
        assert.equal(error.restoration.restored, false);
        assert.match(error.code, /owner-active/);
        return true;
      }
    );
    assert.equal(receipt.messageId, '708');
    assert.equal(
      (await readChatNavigationView(page)).draft,
      'Owner resumed writing'
    );
    assert.equal((await readChatNavigationView(page)).sends, 1);
    outcomes.push('returning-owner-retains-draft-and-positive-receipt');
  });
  return { cases: outcomes.length, outcomes, liveProvider: false };
};
