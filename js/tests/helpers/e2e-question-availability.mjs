import assert from 'node:assert/strict';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import {
  availabilityRule,
  question,
  preferred,
  unrelated,
} from '../../../experiments/issue-56/answer-availability-fixture.mjs';
import { openQuestionPreview } from './question-preview.mjs';

export const verifyQuestionAvailability = async ({ page, store, until }) => {
  const seed = await saveAnswerRule(store, availabilityRule());
  const other = await saveAnswerRule(store, {
    ...availabilityRule(),
    id: 'qa-rule:availability-other',
    question: 'Which performance metrics do you use?',
  });
  const { preview } = await openQuestionPreview(page);
  const field = preview.getByLabel('Question or pattern', { exact: true });
  const result = preview.locator('[data-answer-preview]');
  const plan = async (prompt, expected, count) => {
    await field.fill(prompt);
    await preview
      .getByRole('button', { name: 'Preview answer', exact: true })
      .click();
    await until(
      async () =>
        (await result.locator(':scope > pre').textContent()) === expected,
      'question-scoped timing preview'
    );
    await result
      .getByText(`Observed answer turns: ${count}`, { exact: true })
      .waitFor();
  };
  await plan(question, preferred, 1);
  assert.ok(!(await result.innerText()).includes(unrelated));
  await plan(other.question, unrelated, 9);
  await page.reload();
  await openQuestionPreview(page);
  await plan(question, preferred, 1);
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1180, height: 1000 });
  if (process.env.QUESTION_AVAILABILITY_SCREENSHOT) {
    await preview.screenshot({
      path: process.env.QUESTION_AVAILABILITY_SCREENSHOT,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await result.scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    )
  );
  if (process.env.QUESTION_AVAILABILITY_MOBILE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.QUESTION_AVAILABILITY_MOBILE_SCREENSHOT,
    });
  }
  await page.setViewportSize(viewport);
  assert.deepEqual(await store.get(seed.id), seed);
  assert.deepEqual(await store.get(other.id), other);
  console.log(
    '[question-availability]',
    JSON.stringify({
      timing: true,
      unrelatedQuestionLiteral: true,
      observations: 1,
      reload: true,
      rawPreserved: true,
      mobileFits: true,
    })
  );
};
