import assert from 'node:assert/strict';
import {
  historyAnswer,
  historyNotice,
} from '../../../experiments/issue-56/unread-history-browser-fixture.mjs';
import { listAnswerRules } from '../../src/automation/question-store.js';
import {
  openUnread,
  verifyUnreadFocusRefusal,
} from './e2e-question-unread-controls.mjs';
import { questionBrowserUi } from './question-browser-ui.mjs';

export const verifyUnreadHistoryLearning = async (
  browser,
  { screenshots = process.env.E2E_SCREENSHOTS } = {}
) => {
  const before = process.env.E2E_UNREAD_HISTORY_BEFORE === '1';
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-history',
    serverOptions: {
      unreadReview: true,
      unreadAnswers: true,
      unreadHistory: true,
    },
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
    const settled = unread.locator(
      '[data-browser-unread-result]:not([data-browser-unread-result="active"]), [role="alert"]'
    );
    await settled.first().waitFor({ timeout: 45000 });
    assert.equal(
      await settled.first().getAttribute('data-browser-unread-result'),
      'completed',
      await unread.innerText()
    );
    assert.equal(
      await unread.locator('[data-browser-unread-held="9"]').count(),
      1
    );
    const noReply = unread.locator('[data-browser-unread-answer="no-reply"]');
    assert.equal(await noReply.count(), 1, await unread.innerText());
    const rules = await listAnswerRules(scenario.fixture.store);
    const answers = rules.flatMap((rule) =>
      rule.answers
        .filter((answer) =>
          answer.evidence.some((id) => id.startsWith('msg:hh:8:'))
        )
        .map(({ text, count, approved, evidence }) => [
          rule.kind ?? 'question',
          text,
          count,
          approved,
          evidence,
        ])
    );
    assert.deepEqual(
      answers,
      before
        ? []
        : [
            ['question', historyAnswer, 1, false, ['msg:hh:8:803']],
            ['notice', historyNotice, 1, false, ['msg:hh:8:805']],
          ]
    );
    const receipt = unread.locator('[data-browser-unread-history-answers]');
    if (!before) {
      assert.match(
        await receipt.innerText(),
        /Answers saved from chat history \(2\)/u
      );
    } else {
      assert.equal(await receipt.count(), 0);
    }
    const stats = await scenario.fixture.stats();
    assert.deepEqual(stats.visits, ['8', '9']);
    assert.equal(stats.sends, 0);
    assert.equal(stats.draft, 'At 9 a.m.');
    await noReply.evaluate((element) =>
      element.scrollIntoView({ block: 'center' })
    );
    await scenario.shot(
      `issue-56-unread-history-${before ? 'before' : 'after'}`
    );
    assert.deepEqual(scenario.errors, []);
    return { cases: 1, liveProvider: false };
  } finally {
    await scenario.close();
  }
};
