/* global Event */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { browserChatViewState } from '../../src/sources/browser-chat-view-state.js';
import {
  withChatNavigationFixture,
  readChatNavigationView,
} from './e2e-chat-navigation.mjs';
import { chatNavigationHtml } from '../../../experiments/issue-56/chat-navigation-fixture.mjs';

const installRevealRace = (page, commander, missing) => {
  let released = false;
  const evaluate = commander.evaluate.bind(commander);
  commander.evaluate = async (input) => {
    const result = await evaluate(input);
    if (
      !released &&
      input.fn === browserChatViewState &&
      input.args?.[0]?.operation === 'locate' &&
      input.args[0].chat === '9' &&
      result.found === false
    ) {
      released = true;
      await page.evaluate((removeTarget) => {
        const list = document.querySelector('#list');
        list.scrollTop = list.scrollHeight;
        list.dispatchEvent(new Event('scroll'));
        if (removeTarget) {
          const style = document.createElement('style');
          style.textContent =
            '[data-qa="chatik-open-chat-9"] { display: none; }';
          document.head.append(style);
        }
      }, missing);
      assert.equal(
        await page.locator('[data-qa="chatik-open-chat-9"]').isVisible(),
        !missing
      );
    }
    return result;
  };
  return () => released;
};

/** Finish one native virtual-list render between locate and scroll-status reads. */
export const verifyUnreadRevealRace = async (
  browser,
  { screenshots, missing = false } = {}
) => {
  if (browser.browserType().name() !== 'chromium') {
    return { unsupportedHistory: true };
  }
  return withChatNavigationFixture(
    browser,
    { html: chatNavigationHtml({ virtual: true }) },
    async ({ sender, page, commander, original }) => {
      const released = installRevealRace(page, commander, missing);
      const capture = async (name, receipt) => {
        if (screenshots) {
          await mkdir(screenshots, { recursive: true });
          await page.locator('#result').evaluate((node, value) => {
            node.textContent = JSON.stringify(value, null, 2);
          }, receipt);
          await page.screenshot({ path: join(screenshots, `${name}.png`) });
        }
      };
      let result, refusal;
      try {
        result = await sender.scanUnreadConversations({
          source: 'hh',
          waitMs: 150,
          endWaitMs: 100,
          budgetMs: 30000,
        });
      } catch (error) {
        await capture(
          missing ? 'unread-reveal-missing' : 'unread-reveal-before',
          {
            renderReleased: released(),
            code: error.code,
            restoration: error.restoration,
          }
        );
        if (!missing) {
          throw error;
        }
        refusal = error;
      }
      assert.equal(released(), true);
      if (missing) {
        assert.equal(refusal?.code, 'browser-chat-view-chat-unavailable');
      }
      const restoration = result?.restoration ?? refusal.restoration;
      const chats = missing ? ['8'] : ['8', '9'];
      assert.deepEqual(await page.evaluate(() => window.fixture.visits), chats);
      assert.equal(restoration.restored, true);
      assert.deepEqual(await readChatNavigationView(page), original);
      await capture(missing ? 'unread-reveal-missing' : 'unread-reveal-after', {
        renderReleased: released(),
        chats,
        restoration,
      });
      return {
        renderReleased: released(),
        chats,
        restored: true,
        liveProvider: false,
      };
    }
  );
};

export const verifyUnreadRevealMissing = (browser) =>
  verifyUnreadRevealRace(browser, { missing: true });
