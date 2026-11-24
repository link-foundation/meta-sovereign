import assert from 'node:assert/strict';
import {
  noReplyFollowupRule,
  summary,
  summaryFollowup,
  unreadSummaryHistory,
} from '../../../experiments/issue-56/question-summary-fixture.mjs';
import {
  listAnswerRules,
  saveAnswerRule,
} from '../../src/automation/question-store.js';
import { openUnread } from './e2e-question-unread-controls.mjs';
import { questionBrowserUi } from './question-browser-ui.mjs';

export const verifyUnreadSummary = async (
  browser,
  { followup = false, screenshots = process.env.E2E_SCREENSHOTS } = {}
) => {
  if (browser.browserType().name() !== 'chromium') {
    return { cases: 0, liveProvider: false };
  }
  const before = process.env.E2E_UNREAD_SUMMARY_BEFORE === '1';
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-forms',
    serverOptions: {
      unreadReview: true,
      unreadAnswers: true,
      unreadMessages: {
        8: followup ? summaryFollowup : summary.replaceAll('\n', '<br>'),
      },
      ...(followup && { unreadHistory: unreadSummaryHistory }),
    },
  });
  try {
    if (followup) {
      await saveAnswerRule(scenario.fixture.store, noReplyFollowupRule());
    }
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    await unread.locator('[data-browser-unread-answers]').check();
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
      1,
      await unread.innerText()
    );
    const noReply = unread.locator('[data-browser-unread-answer="no-reply"]');
    assert.equal(await noReply.count(), 1);
    const answers = (await listAnswerRules(scenario.fixture.store)).flatMap(
      (rule) =>
        rule.answers.filter((answer) =>
          answer.evidence.some((id) => id.startsWith('msg:hh:8:'))
        )
    );
    assert.deepEqual(
      answers.map(({ text, count, approved }) => [text, count, approved]),
      before
        ? []
        : [
            ['Нет.', 0, false],
            ['Разрабатывал поиск по техническим документам.', 0, false],
          ]
    );
    if (!before) {
      assert.deepEqual(
        answers.map((answer) => answer.evidence),
        Array(2).fill([followup ? 'msg:hh:8:806' : 'msg:hh:8:807'])
      );
      assert.match(
        await noReply.innerText(),
        /Answers saved from summary \(2\)/u
      );
    }
    const stats = await scenario.fixture.stats();
    assert.deepEqual(stats.visits, ['8', '9']);
    assert.equal(stats.sends, 0);
    assert.equal(stats.draft, 'At 9 a.m.');
    await noReply.scrollIntoViewIfNeeded();
    await scenario.shot(
      `issue-56-unread-summary-${followup ? 'followup-' : ''}${before ? 'before' : 'after'}`
    );
    assert.deepEqual(scenario.errors, []);
    return { cases: 1, liveProvider: false };
  } finally {
    await scenario.close();
  }
};

export const verifyUnreadSummaryBeforeFollowup = (browser) =>
  verifyUnreadSummary(browser, { followup: true });
