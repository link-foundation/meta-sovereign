import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { unreadInput } from '../../../experiments/issue-56/question-unread-review-fixture.mjs';
import { chatNavigationHtml } from '../../../experiments/issue-56/chat-navigation-fixture.mjs';
import { readChatNavigationView } from './e2e-chat-navigation.mjs';
import { withUnreadNativeFixture } from './unread-native-fixture.mjs';
import { questionBrowserUi } from './question-browser-ui.mjs';
import {
  openUnread,
  verifyUnreadFocusRefusal,
} from './e2e-question-unread-controls.mjs';

export const waitUnreadReview = async (service, id) => {
  for (let i = 0; i < 600; i++) {
    const result = await service.unreadStatus({ id });
    if (result.state !== 'active') {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The bounded native unread pass did not settle');
};

/** The real service borrows native visits, holds one draft and never sends text. */
export const verifyUnreadAnswers = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const outcomes = [];
  await withUnreadNativeFixture(
    browser,
    chatNavigationHtml({ textReplies: true, precedingOutgoing: true }),
    async ({ service, page, original }) => {
      const input = unreadInput({
        answerChats: true,
        maxChats: 2,
        waitMs: 100,
        endWaitMs: 100,
        budgetMs: 30000,
      });
      await service.unreadStart(input);
      const first = await waitUnreadReview(service, input.id);
      if (browser.browserType().name() !== 'chromium') {
        assert.equal(first.state, 'failed');
        assert.equal(first.code, 'browser-background-focus-unavailable');
        outcomes.push('unsupported-focus-refused');
        return;
      }
      const view = await readChatNavigationView(page);
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.locator('#result').evaluate((node, value) => {
          node.textContent = JSON.stringify(value, null, 2);
        }, first);
        await page.screenshot({
          path: join(
            screenshots,
            before ? 'unread-answers-before.png' : 'unread-answers-after.png'
          ),
          fullPage: true,
        });
      }
      if (before) {
        assert.equal(first.entries.length, 2);
        assert.equal(first.restoration.restored, true);
        assert.deepEqual(view, original);
        outcomes.push('parent-reads-all-without-preparing-or-holding');
        return;
      }
      assert.equal(first.state, 'completed', JSON.stringify(first));
      assert.equal(first.entries.length, 1);
      assert.equal(first.entries[0].answer.phase, 'prefilled');
      assert.equal(first.restoration.heldReview.chat, '8');
      assert.equal(first.restoration.heldReview.url, 'https://hh.ru/chat/8');
      assert.equal(
        first.restoration.heldReview.title,
        'Example employer · Example vacancy'
      );
      assert.equal(view.draft, 'At 9 a.m.');
      assert.match(view.url, /\/chat\/8$/);
      assert.equal(view.sends, 0);
      const stillUnread = await page.evaluate(() => window.fixture.unread['9']);
      assert.equal(stillUnread, 1);
      const visits = await page.evaluate(() => window.fixture.visits);
      const next = unreadInput({
        ...input,
        id: unreadInput().id,
        heldChat: '8',
      });
      await service.unreadStart(next);
      const second = await waitUnreadReview(service, next.id);
      assert.equal(second.entries[0].answer.phase, 'owner-draft');
      assert.deepEqual(
        await page.evaluate(() => window.fixture.visits),
        visits
      );
      assert.equal((await readChatNavigationView(page)).draft, 'At 9 a.m.');
      // Synthetic owner reply; no real account or provider operation occurs.
      await page.evaluate(() => {
        window.fixture.replies['8'] = 'Owner-reviewed reply';
        window.fixture.drafts['8'] = '';
        document.querySelector('textarea').value = '';
        document.querySelector('#history').scrollTop = 700;
        window.renderMessages();
      });
      const finalInput = { ...next, id: unreadInput().id };
      await service.unreadStart(finalInput);
      const final = await waitUnreadReview(service, finalInput.id);
      assert.equal(final.state, 'completed', JSON.stringify(final));
      assert.equal(final.entries.length, 1, JSON.stringify(final));
      assert.equal(final.entries[0].answer.phase, 'no-reply');
      assert.equal(final.restoration.restored, true);
      assert.equal(await page.evaluate(() => window.fixture.unread['9']), 1);
      assert.equal((await readChatNavigationView(page)).sends, 0);
      outcomes.push(
        'first-ordinary-draft-held',
        'next-cycle-only-held-chat',
        'owner-answer-releases-held-chat'
      );
    }
  );
  return { cases: outcomes.length, outcomes, liveProvider: false };
};

/** Shared production controls expose an explicit mode and truthful held receipt. */
export const verifyUnreadAnswerControls = async (
  browser,
  { screenshots } = {}
) => {
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-answers',
    serverOptions: { unreadReview: true, unreadAnswers: true },
  });
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    await unread.locator('[data-browser-unread-answers]').check();
    if (browser.browserType().name() !== 'chromium') {
      await verifyUnreadFocusRefusal(unread, scenario.fixture);
      return { cases: 1, liveProvider: false };
    }
    await unread.locator('[data-browser-unread-confirm]').check();
    await unread.locator('[data-browser-unread-start]').click();
    await unread.locator('[data-browser-unread-result="completed"]').waitFor();
    await unread.locator('[data-browser-unread-held="8"]').waitFor();
    await unread.locator('[data-browser-unread-answer="prefilled"]').waitFor();
    assert.deepEqual((await scenario.fixture.stats()).visits, ['8']);
    assert.equal((await scenario.fixture.stats()).sends, 0);
    await unread.scrollIntoViewIfNeeded();
    await scenario.shot('unread-answers-controls');
    assert.deepEqual(scenario.errors, []);
    return { cases: 1, liveProvider: false };
  } finally {
    await scenario.close();
  }
};
