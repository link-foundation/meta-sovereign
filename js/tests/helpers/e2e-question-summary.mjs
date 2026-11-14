import { summaryMessage } from '../../../experiments/issue-56/question-summary-fixture.mjs';
import { assert } from './e2e-chat.mjs';

export const verifyQuestionSummary = async ({ page, panel, store, until }) => {
  await store.put(summaryMessage());
  const learner = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Learn from conversations', { exact: true }),
  });
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  const fact = learner.locator('li').filter({
    has: page
      .locator('strong')
      .getByText('Есть ли у вас опыт использования Rust?', { exact: true }),
  });
  await fact.getByText('Нет.', { exact: true }).waitFor({ timeout: 3000 });
  await fact.getByText('Observed answer turns: 0', { exact: true }).waitFor();
  await learner
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(
    async () =>
      (await store.query((link) => link.id?.startsWith('qa-rule:'))).some(
        (rule) => rule.question === 'Есть ли у вас опыт использования Rust?'
      ),
    'summary fact persisted'
  );
  const rules = await store.query((link) => link.id?.startsWith('qa-rule:'));
  const actual = rules.find(
    (rule) => rule.question === 'Есть ли у вас опыт использования Rust?'
  );
  assert(
    actual.answers[0].count === 0 &&
      !actual.answers[0].approved &&
      actual.answers[0].evidence.includes(summaryMessage().id),
    'summary evidence stays zero-count and unapproved'
  );
};
