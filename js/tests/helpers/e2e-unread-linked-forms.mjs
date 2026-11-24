import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  employerQuestionnaire,
  linkedFormBrowser,
  respondentQuestionnaire,
  sharedQuestionnaire,
} from '../../../experiments/issue-56/unread-linked-form-fixture.mjs';
import { unreadSummaryHistory } from '../../../experiments/issue-56/question-summary-fixture.mjs';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { listAnswerRules } from '../../src/automation/question-store.js';
import {
  openUnread,
  verifyUnreadFocusRefusal,
} from './e2e-question-unread-controls.mjs';

export const verifyUnreadLinkedForms = async (
  browser,
  { screenshots, before = false, afterSummary = false } = {}
) => {
  const form = linkedFormBrowser(browser);
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-forms',
    serverOptions: {
      ...(afterSummary && { unreadHistory: unreadSummaryHistory }),
      unreadReview: true,
      unreadAnswers: true,
      unreadMessages: { 8: employerQuestionnaire },
      forms: form.forms,
    },
  });
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    await unread.locator('[data-browser-unread-answers]').check();
    if (browser.browserType().name() !== 'chromium') {
      await verifyUnreadFocusRefusal(unread, scenario.fixture);
      assert.deepEqual(form.visits, []);
      return { cases: 1, liveProvider: false };
    }
    if (!before || afterSummary) {
      await unread.locator('[data-browser-unread-forms]').check();
    }
    await unread.locator('[data-browser-unread-confirm]').check();
    await unread.locator('[data-browser-unread-start]').click();
    const settled = unread.locator(
      '[data-browser-unread-result]:not([data-browser-unread-result="active"]), [data-browser-unread-controls] [role="alert"]'
    );
    // Linked reviews reserve time for both native windows and the UI polls the receipt.
    await settled
      .first()
      .waitFor({ timeout: before ? 35000 : 65000 })
      .catch(async (error) => {
        throw new Error(
          JSON.stringify({
            text: await unread.innerText(),
            visits: form.visits,
          }),
          { cause: error }
        );
      });
    assert.equal(
      await settled.first().getAttribute('data-browser-unread-result'),
      'completed',
      await unread.innerText()
    );
    if (before && !afterSummary) {
      const held = unread.locator('[data-browser-unread-held="8"]');
      await held.waitFor();
      assert.deepEqual(form.visits, []);
      await held.scrollIntoViewIfNeeded();
      await scenario.shot('issue-56-unread-forms-before');
      return { cases: 1, liveProvider: false };
    }
    const handedOff = unread.locator('[data-browser-unread-form="prefilled"]');
    await handedOff.waitFor();
    await unread
      .locator(`[data-browser-unread-held="${before ? '8' : '9'}"]`)
      .waitFor({ timeout: 5000 });
    assert.match(await handedOff.textContent(), /Prefilled fields \(1\)/u);
    assert.deepEqual(form.visits, [
      ['GET', sharedQuestionnaire],
      ['GET', respondentQuestionnaire],
    ]);
    assert.equal(form.pages.length, 1);
    assert.equal(
      await form.pages[0].locator('#start').inputValue(),
      'At 9 a.m.'
    );
    assert.equal(
      await form.pages[0].locator('#notes').inputValue(),
      'Owner entered this'
    );
    assert.equal(await form.pages[0].evaluate(() => globalThis.submits), 0);
    assert.deepEqual(
      (await scenario.fixture.stats()).visits,
      before ? ['8'] : ['8', '9']
    );
    assert.equal((await scenario.fixture.stats()).sends, 0);
    await handedOff.scrollIntoViewIfNeeded();
    const name = afterSummary ? 'unread-form-handover' : 'unread-forms';
    if (afterSummary) {
      const answers = (await listAnswerRules(scenario.fixture.store)).flatMap(
        ({ answers }) =>
          answers.filter(({ evidence }) => evidence.includes('msg:hh:8:806'))
      );
      assert.deepEqual(
        answers.map(({ text, approved }) => [text, approved]),
        before
          ? []
          : [
              ['Нет.', false],
              ['Разрабатывал поиск по техническим документам.', false],
            ]
      );
      if (!before) {
        assert.equal(
          await unread
            .locator('[data-browser-unread-answer="form-review"]')
            .innerText(),
          'Answers saved from summary (2).'
        );
      }
    }
    await scenario.shot(`issue-56-${name}-${before ? 'before' : 'after'}`);
    if (before) {
      assert.deepEqual(scenario.errors, []);
      return { cases: 1, liveProvider: false };
    }
    if (screenshots) {
      await scenario.page.setViewportSize({ width: 390, height: 844 });
      await handedOff.scrollIntoViewIfNeeded();
      assert.equal(
        await scenario.page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
      await scenario.shot(`issue-56-${name}-mobile`);
      await form.pages[0].screenshot({
        path: join(screenshots, `issue-56-${name}-questionnaire.png`),
      });
    }
    await handedOff.getByRole('link').click();
    const reviews = scenario.page.locator('[data-form-reviews]');
    await reviews.getByText(respondentQuestionnaire, { exact: true }).waitFor();
    assert.deepEqual(scenario.errors, []);
    return { cases: 1, liveProvider: false };
  } finally {
    await scenario.close();
  }
};
