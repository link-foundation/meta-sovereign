import assert from 'node:assert/strict';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { openFormPlan, closeFormReview } from './e2e-form-review.mjs';
import {
  savedBaselineRule,
  savedBaselineOptions,
} from '../../../experiments/issue-56/salary-saved-baseline-fixture.mjs';

/** Real native radios use the approved saved answer without a salary configuration. */
export const verifyFormSavedBaseline = async ({
  page,
  owned,
  fixture,
  until,
  store,
}) => {
  const before = process.env.SALARY_SAVED_BASELINE_BEFORE === '1';
  const rule = await saveAnswerRule(store, savedBaselineRule());
  const plan = await openFormPlan(
    page,
    fixture.url.replace('/application', '/salary-options')
  );
  const owner = owned.at(-1);
  const fields = plan.fields.filter((field) => field.name === 'savedBaseline');
  const selected = fields.filter((field) => field.answer.proposal?.checked);
  assert.equal(selected.length, before ? 0 : 1);
  assert.equal(
    await owner.page.locator('[name="savedBaseline"]:checked').count(),
    0
  );
  const screenshots = process.env.SALARY_SAVED_BASELINE_SCREENSHOTS;
  const shot = async (phase) => {
    if (!screenshots) {
      return;
    }
    await page
      .locator(`[data-form-field="${fields[0].id}"]`)
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}-${phase}-review.png` });
    await owner.page
      .locator('[name="savedBaseline"]')
      .first()
      .scrollIntoViewIfNeeded();
    await owner.page.screenshot({
      path: `${screenshots}-${phase}-native.png`,
      fullPage: true,
    });
  };
  let receipts = 0;
  let recovered = false;
  if (!before) {
    assert.equal(selected[0].answer.text, savedBaselineOptions[2]);
    assert.equal(selected[0].answer.salary.amount, 450000);
    assert.equal(selected[0].answer.salary.baseline.source, 'saved-answer');
    assert.equal(
      selected[0].answer.requiresReview,
      true,
      'native form application still requires review'
    );
    assert.equal(
      selected[0].answer.reuseRequiresReview,
      false,
      'the saved baseline has approved numeric evidence'
    );
    const input = {
      id: plan.reviewPlan.sessionId,
      planId: plan.reviewPlan.id,
      fields: [selected[0].id],
    };
    const apply = () =>
      page.evaluate(
        (input) => globalThis.__msApi.formsApplyReview(input),
        input
      );
    const result = await apply();
    assert.equal(result.state, 'applied');
    assert.equal(result.receipts.length, 1);
    assert.equal(result.receipts[0].status, 'applied');
    receipts = result.receipts.length;
    assert.equal(
      await owner.page.locator('[name="savedBaseline"]:checked').inputValue(),
      '2'
    );
    const events = await owner.page.evaluate(() => globalThis.events.length);
    assert.deepEqual((await apply()).receipts, result.receipts);
    assert.equal(
      await owner.page.evaluate(() => globalThis.events.length),
      events
    );
    recovered = true;
  }
  await shot(before ? 'before' : 'after');
  assert.deepEqual(await store.get(rule.id), rule);
  await closeFormReview(page, until, 'saved salary baseline review closed');
  assert.equal(owner.closed, true);
  assert.equal(fixture.submits, 0);
  console.log(
    '[forms-saved-baseline]',
    JSON.stringify({
      before,
      receipts,
      recovered,
      closed: owner.closed,
      submissions: fixture.submits,
      configuredSalary: false,
    })
  );
};
