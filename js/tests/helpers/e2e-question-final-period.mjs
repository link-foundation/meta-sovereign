import assert from 'node:assert/strict';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { saveAnswerPolicy } from '../../src/automation/question-policy.js';
import {
  openQuestionDisclosure,
  requestQuestionPreview,
} from './question-preview.mjs';
import { fulfil } from './e2e-chat.mjs';

export const verifyQuestionFinalPeriod = async ({
  page,
  panel,
  preview,
  store,
  until,
}) => {
  const question = 'Where do you live in the final period fixture?';
  await saveAnswerRule(store, {
    id: 'qa-rule:final-period-fixture',
    question,
    answers: [{ text: 'Hanoi', count: 4, approved: true }],
  });
  const dotted = await saveAnswerRule(store, {
    id: 'qa-rule:final-period-observed',
    question,
    answers: [{ text: 'Hanoi.', count: 1, approved: true }],
  });
  const original = await store.get('qa-rule:final-period-fixture');
  await saveAnswerPolicy(store, { answerFinalPeriod: 'with' });
  const policy = panel.locator('[data-answer-policy]');
  await openQuestionDisclosure(policy);
  await policy
    .getByRole('button', { name: 'Refresh answers', exact: true })
    .click();
  const select = policy.locator('[data-answer-final-period]');
  await until(
    async () =>
      (await select.inputValue()) === 'with' && !(await select.isDisabled()),
    'final-period policy loaded'
  );
  await openQuestionDisclosure(preview);
  const runPreview = async (text) => {
    await requestQuestionPreview(preview, question);
    await until(
      async () =>
        (await preview.locator('[data-answer-preview] > pre').textContent()) ===
        text,
      'final-period preview spelling'
    );
    await preview
      .locator('[data-answer-preview]')
      .getByText('Observed answer turns: 5', { exact: true })
      .waitFor();
  };
  await runPreview('Hanoi.');
  if (process.env.QUESTION_PERIOD_SCOPE_SCREENSHOT) {
    await preview.screenshot({
      path: process.env.QUESTION_PERIOD_SCOPE_SCREENSHOT,
    });
  }
  await select.selectOption('without');
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await policy
    .getByText('Answer reuse policy saved.', { exact: true })
    .waitFor();
  assert.equal(
    (await store.get('qa-policy:reuse')).answerFinalPeriod,
    'without'
  );
  await runPreview('Hanoi');
  await policy
    .getByRole('button', { name: 'Refresh answers', exact: true })
    .click();
  await until(
    async () => (await select.inputValue()) === 'without',
    'saved preference reloaded'
  );
  await page.route('**/api/automations/answers/policy', (route) =>
    fulfil(route, { error: 'Period fixture refusal', status: 'failed' }, 500)
  );
  await select.selectOption('with');
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'Period fixture refusal' })
    .waitFor();
  assert.equal(
    await select.inputValue(),
    'with',
    'failed save retains the pending choice'
  );
  assert.equal(
    (await store.get('qa-policy:reuse')).answerFinalPeriod,
    'without'
  );
  await page.unroute('**/api/automations/answers/policy');
  assert.deepEqual(
    await store.get(original.id),
    original,
    'raw variants stay available for idempotent learning'
  );
  assert.deepEqual(await store.get(dotted.id), dotted);
  await policy
    .getByRole('button', { name: 'Refresh answers', exact: true })
    .click();
  await until(
    async () => (await select.inputValue()) === 'without',
    'saved preference survives refusal recovery'
  );
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1200, height: 1250 });
  if (process.env.QUESTION_FINAL_PERIOD_SCREENSHOT) {
    await policy.screenshot({
      path: process.env.QUESTION_FINAL_PERIOD_SCREENSHOT,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await select.scrollIntoViewIfNeeded();
  await until(
    () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
    'final-period controls fit the compact shell'
  );
  assert.equal(await select.inputValue(), 'without');
  if (process.env.QUESTION_FINAL_PERIOD_MOBILE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.QUESTION_FINAL_PERIOD_MOBILE_SCREENSHOT,
    });
  }
  await page.setViewportSize(viewport);
  console.log(
    '[question-final-period]',
    JSON.stringify({
      observations: 5,
      defaultWith: true,
      configuredWithout: true,
      rawPreserved: true,
      refusalPreserved: true,
      mobileFits: true,
    })
  );
};
