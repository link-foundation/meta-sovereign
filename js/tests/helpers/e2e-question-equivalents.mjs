import assert from 'node:assert/strict';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import {
  wordingRule,
  question,
  preferred,
  aliases,
} from '../../../experiments/issue-56/answer-equivalents-fixture.mjs';
import {
  openQuestionDisclosure,
  requestQuestionPreview,
} from './question-preview.mjs';
import { fulfil } from './e2e-chat.mjs';

export const verifyQuestionEquivalents = async ({
  page,
  panel,
  store,
  until,
}) => {
  const seed = wordingRule();
  delete seed.answers[0].equivalents;
  seed.answers.push(
    { text: aliases[0], count: 2, evidence: ['fixture:a'] },
    { text: aliases[1], count: 3, evidence: ['fixture:b'] }
  );
  await saveAnswerRule(store, seed);
  const refresh = () =>
    panel
      .getByRole('button', { name: 'Refresh answers', exact: true })
      .first()
      .click();
  const choose = () =>
    panel.getByRole('button', { name: question, exact: true }).click();
  await refresh();
  await choose();
  const editor = panel.locator('[data-answer-rule]');
  const field = editor.locator('[data-equivalent-answers]').first();
  assert.equal(await field.inputValue(), '');
  await field.fill(aliases.join('\n'));
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByText('Answer rule saved.', { exact: true }).waitFor();
  const saved = await store.get(seed.id);
  assert.deepEqual(saved.answers[0].equivalents, aliases);
  assert.equal(saved.answers[0].count, 0);
  assert.deepEqual(
    saved.answers.slice(1).map(({ text, count }) => ({ text, count })),
    seed.answers.slice(1).map(({ text, count }) => ({ text, count }))
  );
  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: /^Preview answer$/u }),
  });
  await openQuestionDisclosure(preview);
  await requestQuestionPreview(preview, question);
  await until(
    async () =>
      (await preview.locator('[data-answer-preview] > pre').textContent()) ===
      preferred,
    'preferred spelling preview'
  );
  await preview
    .locator('[data-answer-preview]')
    .getByText('Observed answer turns: 5', { exact: true })
    .waitFor();
  await page.route('**/api/automations/answers/save', (route) =>
    fulfil(route, { error: 'Wording fixture refusal', status: 'failed' }, 500)
  );
  const pending = [...aliases, 'Another explicitly declared wording.'].join(
    '\n'
  );
  await field.fill(pending);
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'Wording fixture refusal' })
    .waitFor();
  assert.equal(await field.inputValue(), pending);
  assert.deepEqual(await store.get(seed.id), saved);
  assert.equal(
    await panel.getByText('Answer rule saved.', { exact: true }).count(),
    0
  );
  await page.unroute('**/api/automations/answers/save');
  await refresh();
  await choose();
  assert.equal(await field.inputValue(), aliases.join('\n'));
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1200, height: 1100 });
  if (process.env.QUESTION_WORDING_SCREENSHOT) {
    await editor
      .locator('fieldset')
      .first()
      .screenshot({ path: process.env.QUESTION_WORDING_SCREENSHOT });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await field.scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    )
  );
  if (process.env.QUESTION_WORDING_MOBILE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.QUESTION_WORDING_MOBILE_SCREENSHOT,
    });
  }
  await page.setViewportSize(viewport);
  console.log(
    '[question-equivalents]',
    JSON.stringify({
      observations: 5,
      rawPreserved: true,
      saved: true,
      refusalPreserved: true,
      reload: true,
      mobileFits: true,
    })
  );
};
