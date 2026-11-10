import {
  questionnaireMessages,
  questions,
} from '../../../experiments/issue-56/question-lists-fixture.mjs';
import { assert } from './e2e-chat.mjs';

export const verifyQuestionLists = async ({ page, panel, store, until }) => {
  for (const message of questionnaireMessages()) {
    await store.put(message);
  }
  const learner = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Learn from conversations', { exact: true }),
  });
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  const component = learner.locator('li').filter({
    has: page
      .locator('strong')
      .getByText('Where do you live?', { exact: true }),
  });
  await component
    .getByText('Hanoi.', { exact: true })
    .waitFor({ timeout: 3000 });
  const conditional = learner.locator('li').filter({
    has: page
      .locator('strong')
      .getByText(
        'Which languages do you use? If Python, describe one project.',
        { exact: true }
      ),
  });
  await conditional
    .getByText('Python. Built a search service.', { exact: true })
    .waitFor();
  await learner
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(
    async () =>
      (await store.query((link) => link.id?.startsWith('qa-rule:'))).some(
        (rule) => rule.question === questions
      ),
    'whole questionnaire persisted'
  );
  const rules = await store.query((link) => link.id?.startsWith('qa-rule:'));
  const actual = rules.find((rule) => rule.question === 'Where do you live?');
  assert(
    actual.answers[0].text === 'Hanoi.' &&
      !actual.answers[0].approved &&
      actual.answers[0].count === 1,
    'component retains its real unapproved answer receipt'
  );
};
