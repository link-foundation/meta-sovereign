import { assert } from './e2e-chat.mjs';
import { decoded } from './e2e-form-review.mjs';
import { openQuestionPreview } from './question-preview.mjs';
import {
  weightedQuestions,
  seedWeightedAnswers,
} from '../../../experiments/issue-56/question-weighted-fixture.mjs';

export const verifyQuestionWeighted = async ({ page, store, until }) => {
  const actions = new Set(
    (await store.query((link) => link.id?.startsWith('automation:'))).map(
      (link) => link.id
    )
  );
  const old = await store.query((link) => link.id?.startsWith('qa-rule:'));
  for (const rule of old) {
    await store.delete(rule.id);
  }
  await seedWeightedAnswers(store);
  const { panel, preview } = await openQuestionPreview(page);
  const settings = preview.locator('[data-question-matching]');
  const method = settings.getByLabel('Matching method', { exact: true });
  const threshold = settings.getByLabel('Minimum similarity (%)');
  const letterCase = settings.getByLabel('Match letter case');
  const inspect = preview.getByLabel('Inspect all eligible matches');
  const previous = {
    algorithm: await method.inputValue(),
    threshold: await threshold.inputValue(),
    caseSensitive: await letterCase.isChecked(),
    inspect: await inspect.isChecked(),
  };
  const run = async () => {
    const response = page.waitForResponse((item) =>
      item.url().endsWith('/api/automations/answers/plan')
    );
    await preview
      .getByRole('button', { name: 'Preview answer', exact: true })
      .click();
    return decoded(await response);
  };
  try {
    await preview
      .getByLabel('Question or pattern', { exact: true })
      .fill(weightedQuestions.asked);
    await method.selectOption('ordered');
    await threshold.fill('70');
    await letterCase.uncheck();
    await inspect.check();
    assert(
      (await run()).match === 'unanswered',
      'ordered default stays unchanged'
    );
    await method.selectOption('weighted');
    const result = await run();
    assert(
      result.match === 'approximate' && result.requiresReview,
      'weighted rewording stays reviewed'
    );
    assert(
      result.text === weightedQuestions.answer,
      'most frequent approved wording proposed'
    );
    await until(
      async () =>
        (await preview.locator('[data-answer-preview] > pre').textContent()) ===
        weightedQuestions.answer,
      'weighted wording in the main answer preview'
    );
    assert(
      (await preview.locator('[data-ranked-match]').count()) > 0,
      'eligible ranked matches remain visible beside the main wording'
    );
    if (process.env.QUESTION_WEIGHTED_SCREENSHOTS === '1') {
      await settings.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: 'docs/screenshots/issue-56-question-weighted/after.png',
      });
      await page.setViewportSize({ width: 390, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        'weighted controls fit a phone'
      );
      await settings.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: 'docs/screenshots/issue-56-question-weighted/after-phone.png',
      });
      await page.setViewportSize({ width: 1200, height: 800 });
    }
    await panel
      .getByRole('button', { name: 'Create question automation', exact: true })
      .click();
    const editor = page.locator('form.automation-editor');
    assert(
      (await editor
        .getByLabel('Matching method', { exact: true })
        .inputValue()) === 'weighted',
      'method carried into the saved action'
    );
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await until(
      async () =>
        (await store.query((link) => link.id?.startsWith('automation:'))).some(
          (link) => link.action?.matching?.algorithm === 'weighted'
        ),
      'weighted action persisted'
    );
    console.log(
      '[question-weighted]',
      JSON.stringify({
        score: result.similarity,
        requiresReview: result.requiresReview,
        methodSaved: true,
      })
    );
  } finally {
    for (const action of await store.query((link) =>
      link.id?.startsWith('automation:')
    )) {
      if (!actions.has(action.id)) {
        await store.delete(action.id);
      }
    }
    for (const rule of await store.query((link) =>
      link.id?.startsWith('qa-rule:')
    )) {
      await store.delete(rule.id);
    }
    await store.putMany(old);
    await method.selectOption(previous.algorithm);
    await threshold.fill(previous.threshold);
    await letterCase.setChecked(previous.caseSensitive);
    await inspect.setChecked(previous.inspect);
  }
};
