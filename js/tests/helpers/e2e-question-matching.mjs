import {
  matchingQuestions,
  seedMatchingAnswers,
} from '../../../experiments/issue-56/question-matching-fixture.mjs';
import { assert } from './e2e-chat.mjs';
import { decoded } from './e2e-form-review.mjs';

const screenshot = async (
  page,
  name,
  selector = '[data-question-matching]'
) => {
  if (process.env.QUESTIONS_MATCHING_SCREENSHOTS !== '1') {
    return;
  }
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/issue-56-question-matching-${name}.png`,
  });
};

const verifyMatchingAutomation = async ({ page, panel, store, until }) => {
  await panel
    .getByRole('button', { name: 'Create question automation', exact: true })
    .click();
  const editor = page.locator('form.automation-editor');
  const matching = editor.locator('[data-question-matching]');
  assert(
    (await matching.getByLabel('Minimum similarity (%)').inputValue()) === '60',
    'threshold carried to action editor'
  );
  assert(
    await matching.getByLabel('Match letter case').isChecked(),
    'case choice carried to action editor'
  );
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    async () =>
      (await store.query((link) => link.id?.startsWith('automation:'))).some(
        (link) =>
          link.action?.matching?.threshold === 0.6 &&
          link.action.matching.caseSensitive
      ),
    'matching action persisted'
  );
  console.log(
    '[question-matching-action]',
    JSON.stringify(
      (await store.query((link) => link.id?.startsWith('automation:'))).find(
        (link) => link.action?.matching?.threshold === 0.6
      )?.action.matching
    )
  );
};

export const verifyQuestionMatching = async ({ page, panel, store, until }) => {
  const old = await store.query((link) => link.id?.startsWith('qa-rule:'));
  for (const rule of old) {
    await store.delete(rule.id);
  }
  await seedMatchingAnswers(store);
  const preview = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Preview answer', { exact: true }),
  });
  if (!(await preview.evaluate((node) => node.open))) {
    await preview.locator(':scope > summary').click();
  }
  const question = preview.getByLabel('Question or pattern', { exact: true });
  const run = async () => {
    const pending = page.waitForResponse((response) =>
      response.url().endsWith('/api/automations/answers/plan')
    );
    await preview
      .getByRole('button', { name: 'Preview answer', exact: true })
      .click();
    return decoded(await pending);
  };
  try {
    await question.fill(matchingQuestions.asked);
    await run();
    await preview
      .getByText('Add or complete a saved answer.', { exact: true })
      .waitFor();
    if (process.env.QUESTIONS_MATCHING_BEFORE === '1') {
      await preview.locator('[data-answer-preview]').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: 'docs/screenshots/issue-56-question-matching-before.png',
      });
      assert(
        (await preview.locator('[data-question-matching]').count()) === 1,
        'matching settings are available'
      );
      return;
    }
    const matching = preview.locator('[data-question-matching]');
    await matching.getByLabel('Minimum similarity (%)').fill('60');
    await matching.getByLabel('Match letter case').check();
    await preview.getByLabel('Inspect all eligible matches').check();
    const result = await run();
    assert(
      result.match === 'approximate' &&
        result.requiresReview &&
        result.matchResults.total === 12,
      'twelve eligible matches retain approximate review'
    );
    const matches = preview.locator('[data-answer-matches]');
    await matches.getByText('Matches 1–10 of 12', { exact: true }).waitFor();
    assert(
      (await matches.locator('[data-ranked-match]').count()) === 10,
      'first page is bounded'
    );
    await matches
      .getByRole('button', { name: 'Next matches', exact: true })
      .click();
    await matches.getByText('Matches 11–12 of 12', { exact: true }).waitFor();
    assert(
      (await matches.locator('[data-ranked-match]').count()) === 2,
      'last two matches are accessible'
    );
    assert(
      await matches
        .getByRole('button', { name: 'Next matches', exact: true })
        .isDisabled(),
      'final page is explicit'
    );
    await screenshot(page, 'ranked', '[data-answer-matches]');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, 'ranked-mobile', '[data-answer-matches]');
    await page.setViewportSize({ width: 1200, height: 800 });
    await matches
      .getByRole('button', { name: 'Previous matches', exact: true })
      .click();
    await matches.getByText('Matches 1–10 of 12', { exact: true }).waitFor();
    await screenshot(page, 'after');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'matching controls fit a phone'
    );
    await screenshot(page, 'mobile');
    await page.setViewportSize({ width: 1200, height: 800 });
    await question.fill('What is your CITY?');
    await matching.getByLabel('Minimum similarity (%)').fill('100');
    assert(
      (await run()).match === 'unanswered',
      'case-sensitive 100 percent rejects different case'
    );
    await matching.getByLabel('Match letter case').uncheck();
    assert(
      (await run()).match === 'exact',
      'case-insensitive exact matching is available'
    );
    await matching.getByLabel('Minimum similarity (%)').fill('');
    assert(
      await preview
        .getByRole('button', { name: 'Preview answer', exact: true })
        .isDisabled(),
      'empty threshold cannot submit'
    );
    await matching.getByLabel('Minimum similarity (%)').fill('60');
    await matching.getByLabel('Match letter case').check();
    await verifyMatchingAutomation({ page, panel, store, until });
    console.log(
      '[question-matching]',
      JSON.stringify({
        total: result.matchResults.total,
        firstPage: 10,
        lastPage: 2,
        requiresReview: result.requiresReview,
        score: result.similarity,
      })
    );
  } finally {
    for (let index = 0; index < 12; index++) {
      await store.delete(`qa-rule:matching-${String(index).padStart(2, '0')}`);
    }
    for (const rule of old) {
      await store.put(rule);
    }
  }
};
