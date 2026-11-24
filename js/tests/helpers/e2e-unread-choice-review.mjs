import assert from 'node:assert/strict';
import {
  openUnread,
  verifyUnreadFocusRefusal,
} from './e2e-question-unread-controls.mjs';
import { questionBrowserUi } from './question-browser-ui.mjs';

export const verifyUnreadChoiceReviewControl = async (browser) => {
  const scenario = await questionBrowserUi(browser, {
    screenshots: process.env.APPLICATION_SCREENSHOTS,
    group: 'job-application-chat-choices',
    serverOptions: {
      unreadReview: true,
      unreadAnswers: true,
      unreadChoices: true,
    },
  });
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    await unread.locator('[data-browser-unread-answers]').check();
    const manualChoice = unread.locator('[data-browser-unread-review-choices]');
    if (process.env.APPLICATION_CHAT_CHOICES_BEFORE === '1') {
      assert.equal(await manualChoice.count(), 0);
      return { cases: 1, parent: true, liveProvider: false };
    }
    assert.equal(await manualChoice.isChecked(), false);
    await manualChoice.check();
    if (browser.browserType().name() !== 'chromium') {
      await verifyUnreadFocusRefusal(unread, scenario.fixture);
      return { cases: 1, liveProvider: false };
    }
    await unread.locator('[data-browser-unread-confirm]').check();
    await unread.locator('[data-browser-unread-start]').click();
    await unread.locator('[data-browser-unread-result="completed"]').waitFor();
    assert.match(
      await unread
        .locator('[data-browser-unread-answer="choice-review"]')
        .innerText(),
      /Choose an option in the provider chat/u
    );
    assert.equal(
      await unread.locator('[data-browser-unread-held="8"]').count(),
      1
    );
    const { visits, sends, replies, draft } = await scenario.fixture.stats();
    assert.deepEqual(
      { visits, sends, replies, draft },
      {
        visits: ['8'],
        sends: 0,
        replies: {},
        draft: '',
      }
    );
    await scenario.shot('standalone-choice-review');
    assert.deepEqual(scenario.errors, []);
    return { cases: 1, liveProvider: false };
  } finally {
    await scenario.close();
  }
};
