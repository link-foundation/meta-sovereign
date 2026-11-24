import { saveAnswerRule } from '../../src/automation/question-store.js';
import { assert } from './e2e-chat.mjs';
import {
  existingQuestionnaire,
  indexedQuestions,
} from '../../../experiments/issue-56/questionnaire-index-fixture.mjs';

export const verifyQuestionnaireIndex = async ({
  page,
  panel,
  store,
  until,
}) => {
  await saveAnswerRule(store, existingQuestionnaire);
  const before = await store.query((link) => link.id?.startsWith('qa-rule:'));
  const preview = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Preview answer', { exact: true }),
  });
  if ((await preview.getAttribute('open')) === null) {
    await preview.locator(':scope > summary').click();
  }
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill(indexedQuestions[1]);
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  const result = preview.locator('[data-answer-preview]');
  await result.getByText('Helsinki.', { exact: true }).waitFor();
  await result
    .getByText('Review required before automatic sending.', { exact: true })
    .waitFor();
  assert(
    (await store.query((link) => link.id?.startsWith('qa-rule:'))).length ===
      before.length,
    'reading a saved whole questionnaire never writes an index or grants approval'
  );
  if (process.env.QUESTIONNAIRE_INDEX_SCREENSHOT) {
    await result.screenshot({
      path: process.env.QUESTIONNAIRE_INDEX_SCREENSHOT,
      scale: 'css',
    });
  }
  const learner = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Learn from conversations', { exact: true }),
  });
  if ((await learner.getAttribute('open')) === null) {
    await learner.locator(':scope > summary').click();
  }
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  const component = learner.locator('li').filter({
    has: page.locator('strong').getByText(indexedQuestions[1], { exact: true }),
  });
  await component.getByText('Helsinki.', { exact: true }).waitFor();
  await component
    .getByText('Observed answer turns: 0', { exact: true })
    .waitFor();
  await learner
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(
    async () =>
      (await store.query((link) => link.id?.startsWith('qa-rule:'))).some(
        (rule) => rule.question === indexedQuestions[1]
      ),
    'saved-only component backfilled'
  );
  const rules = await store.query((link) => link.id?.startsWith('qa-rule:'));
  const saved = rules.find((rule) => rule.question === indexedQuestions[1]);
  assert(
    saved.answers[0].count === 0 && !saved.answers[0].approved,
    'explicit backfill never manufactures a sent occurrence or approval'
  );
  assert(
    rules.some(
      (rule) =>
        rule.id === existingQuestionnaire.id &&
        rule.answers[0].text === existingQuestionnaire.answers[0].text
    ),
    'whole questionnaire remains intact'
  );
  console.log(
    '[questionnaire-index]',
    JSON.stringify({
      indexedExisting: true,
      previewReadOnly: true,
      backfilled: true,
      savedOnlyCount: 0,
      requiresReview: true,
      providerWrites: 0,
    })
  );
};
