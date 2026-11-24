import {
  correctionMessages,
  correctedRules,
  apology,
  wrongAnswer,
} from '../../../experiments/issue-56/question-corrections-fixture.mjs';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { assert } from './e2e-chat.mjs';

export const verifyQuestionCorrections = async ({ page, panel, store }) => {
  for (const rule of correctedRules) {
    await saveAnswerRule(store, rule);
  }
  for (const message of correctionMessages()) {
    await store.put(message);
  }
  const messageCount = (
    await store.query((link) => link.id?.startsWith('msg:'))
  ).length;
  const learner = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Learn from conversations', { exact: true }),
  });
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  // The coverage receipt is replaced after every preview, including an empty
  // result. Existing unrelated proposals remain available in this full fixture.
  await learner
    .getByText(
      `Archived messages inspected: ${messageCount} of ${messageCount}.`,
      { exact: true }
    )
    .waitFor();
  const text = await learner.innerText();
  assert(
    !text.includes(apology) && !text.includes(wrongAnswer),
    'owner corrections exclude old mixed wording'
  );
  for (const rule of correctedRules) {
    const saved = await store.get(rule.id);
    assert(
      saved.answers[0].count === 0 && saved.answers[0].canonical,
      'learning preserves the explicit correction'
    );
  }
};
