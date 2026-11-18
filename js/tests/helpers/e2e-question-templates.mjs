import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';
import { decoded } from './e2e-form-review.mjs';
import { assertViewportFits } from './e2e-viewport.mjs';
import {
  templateExample as example,
  templateLinkExample,
  mountTemplateQuestion,
} from '../../../experiments/issue-56/question-template-fixture.mjs';

const saveQuestionTemplate = async ({ page }, example) => {
  const panel = page.locator('[data-question-controls]');
  const editor = panel.locator('[data-answer-rule]');
  await editor
    .getByLabel('Question or pattern', { exact: true })
    .fill(example.pattern);
  await editor.getByLabel('Answer', { exact: true }).fill(example.answer);
  await editor
    .getByLabel('Approved for automatic sending with this saved rule', {
      exact: true,
    })
    .check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/automations/answers/save') &&
      response.request().method() === 'POST'
  );
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await saved).status(), 200);
  await panel.getByText('Answer rule saved.', { exact: true }).waitFor();
};

/** Saved UI templates reach native parsing and a positively witnessed reply. */
export const verifyQuestionTemplates = async (browser, options = {}) => {
  const ui = await questionBrowserUi(browser, {
    group: 'question-templates',
    screenshots: options.screenshots,
  });
  const { fixture, page } = ui;
  try {
    await fixture.store.delete('qa-rule:experience');
    await fixture.reset({ freeText: true });
    await fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
    await fixture.page.evaluate(mountTemplateQuestion, example.question);
    await ui.open();
    await saveQuestionTemplate(ui, example);

    await ui.run(
      'saved template plans the actual native question and sends nothing during review',
      async () => {
        const pending = page.waitForResponse((response) =>
          response.url().endsWith('/api/automations/answers/browser/inspect')
        );
        await ui.inspect();
        const review = await decoded(await pending);
        assert.equal(review.plan.question, example.question);
        assert.equal(review.plan.match, 'template');
        assert.equal(review.plan.requiresReview, false);
        assert.equal(review.plan.text, example.answer);
        assert.equal(
          await ui.controls.locator('[data-browser-text-draft]').inputValue(),
          example.answer
        );
        assert.deepEqual(await fixture.stats(), {
          clicks: 0,
          textSends: 0,
          draft: '',
        });
        await ui.controls
          .locator('[data-browser-text-draft]')
          .scrollIntoViewIfNeeded();
        await ui.shot('template-review');
      }
    );

    await ui.run(
      'explicit native delivery retains the exact template answer and cannot replay after reload',
      async () => {
        const pending = page.waitForResponse((response) =>
          response.url().endsWith('/api/automations/answers/browser/reply-text')
        );
        await ui.controls.locator('[data-browser-text-send]').click();
        const receipt = await decoded(await pending);
        assert.equal(receipt.status, 'sent');
        assert.equal(receipt.outbox.receipt.text, example.answer);
        assert.equal(receipt.outbox.receipt.messageId, '102');
        await ui.status('sent').waitFor();
        await ui.open();
        await openQuestionDisclosure(ui.controls);
        await ui.status('sent').waitFor();
        assert.equal(
          await ui.controls.locator('[data-browser-text-send]').isDisabled(),
          true
        );
        assert.equal(
          await ui.controls.locator('[data-browser-text-draft]').inputValue(),
          example.answer
        );
        assert.deepEqual(await fixture.stats(), {
          clicks: 0,
          textSends: 1,
          draft: '',
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await ui.controls
          .locator('[data-browser-text-draft]')
          .scrollIntoViewIfNeeded();
        await assertViewportFits(page);
        await ui.shot('template-receipt-phone');
      }
    );
    return { ...ui.result(), nativeReplies: 1, liveProvider: false };
  } finally {
    await ui.close();
  }
};

/** A second link never inherits approval from the template's existing URL. */
export const verifyTemplateLinkGuards = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const ui = await questionBrowserUi(browser, {
    group: 'question-template-links',
    screenshots,
  });
  const { fixture, page } = ui;
  try {
    await fixture.store.delete('qa-rule:experience');
    await fixture.reset({ freeText: true });
    await fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
    await fixture.page.evaluate(
      mountTemplateQuestion,
      templateLinkExample.question
    );
    await ui.open();
    await saveQuestionTemplate(ui, templateLinkExample);
    await ui.run(
      'an additional native question link requires fresh review',
      async () => {
        const pending = page.waitForResponse((response) =>
          response.url().endsWith('/api/automations/answers/browser/inspect')
        );
        await ui.inspect();
        const review = await decoded(await pending);
        assert.equal(review.plan.question, templateLinkExample.question);
        assert.equal(review.plan.requiresReview, !before);
        if (before) {
          assert.equal(review.plan.match, 'template');
        } else {
          assert.notEqual(review.plan.match, 'template');
          assert.notEqual(review.plan.match, 'exact');
        }
        assert.deepEqual(await fixture.stats(), {
          clicks: 0,
          textSends: 0,
          draft: '',
        });
        const matchLabel = ui.controls.getByText(
          before ? 'Pattern match' : 'Approximate match',
          { exact: true }
        );
        await matchLabel.scrollIntoViewIfNeeded();
        await ui.shot(before ? 'link-guard-before' : 'link-guard-after');
        await page.setViewportSize({ width: 390, height: 844 });
        await matchLabel.scrollIntoViewIfNeeded();
        await assertViewportFits(page);
        await ui.shot(
          before ? 'link-guard-before-phone' : 'link-guard-after-phone'
        );
      }
    );
    return {
      ...ui.result(),
      newLinkRequiresReview: !before,
      nativeSends: 0,
      liveProvider: false,
    };
  } finally {
    await ui.close();
  }
};
