import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { unreadInput } from '../../../experiments/issue-56/question-unread-review-fixture.mjs';
import {
  unreadBotChoiceHtml,
  unreadBotChoiceQuestion,
} from '../../../experiments/issue-56/unread-bot-choice-fixture.mjs';
import { withUnreadNativeFixture } from './unread-native-fixture.mjs';
import { readChatNavigationView } from './e2e-chat-navigation.mjs';
import { waitUnreadReview } from './e2e-unread-answers.mjs';

/** Native bot selection must continue to the next ordinary review, without text delivery. */
export const verifyUnreadBotChoices = (
  browser,
  { screenshots = process.env.UNREAD_BOT_SCREENSHOTS } = {}
) =>
  withUnreadNativeFixture(
    browser,
    unreadBotChoiceHtml(),
    async ({ service, store, page }) => {
      await saveAnswerRule(store, {
        id: 'experience',
        question: unreadBotChoiceQuestion,
        answers: [{ text: 'Yes', approved: true }],
      });
      const input = unreadInput({
        answerChats: true,
        waitMs: 100,
        endWaitMs: 100,
        budgetMs: 30000,
      });
      await service.unreadStart(input);
      const result = await waitUnreadReview(service, input.id);
      if (browser.browserType().name() !== 'chromium') {
        assert.equal(result.state, 'failed');
        assert.equal(result.code, 'browser-background-focus-unavailable');
        assert.equal(await page.evaluate(() => window.fixture.choiceClicks), 0);
        assert.equal((await readChatNavigationView(page)).sends, 0);
        return {
          unsupportedFocusRefused: true,
          nativeChoices: 0,
          textSends: 0,
          liveProvider: false,
        };
      }
      assert.equal(result.state, 'completed', JSON.stringify(result));
      assert.deepEqual(
        result.entries.map(({ chat, answer }) => [chat, answer.phase]),
        [
          ['8', 'sent'],
          ['9', 'prefilled'],
        ]
      );
      assert.equal(result.entries[0].answer.outbox.receipt.messageId, '808');
      assert.equal(result.entries[0].answer.outbox.receipt.option, 'Yes');
      assert.equal(result.restoration.heldReview.chat, '9');
      const view = await readChatNavigationView(page);
      assert.match(view.url, /\/chat\/9$/u);
      assert.equal(view.draft, 'At 9 a.m.');
      assert.equal(view.sends, 0);
      assert.equal(await page.evaluate(() => window.fixture.choiceClicks), 1);
      assert.equal(
        await page.evaluate(() => window.fixture.replies['8']),
        'Yes'
      );
      const visits = await page.evaluate(() => window.fixture.visits);
      const held = unreadInput({
        ...input,
        id: unreadInput().id,
        heldChat: '9',
      });
      await service.unreadStart(held);
      const recovered = await waitUnreadReview(service, held.id);
      assert.equal(recovered.entries[0].answer.phase, 'owner-draft');
      assert.deepEqual(
        await page.evaluate(() => window.fixture.visits),
        visits
      );
      assert.equal(await page.evaluate(() => window.fixture.choiceClicks), 1);
      assert.equal((await readChatNavigationView(page)).draft, 'At 9 a.m.');
      assert.equal((await readChatNavigationView(page)).sends, 0);
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.locator('#result').evaluate((node, value) => {
          node.textContent = JSON.stringify(value, null, 2);
        }, result);
        await page.screenshot({
          path: join(screenshots, 'native-choice-and-held-draft.png'),
          fullPage: true,
        });
      }
      return {
        nativeChoices: 1,
        textSends: 0,
        heldChat: '9',
        ownerDraftPreserved: true,
        liveProvider: false,
      };
    }
  );
