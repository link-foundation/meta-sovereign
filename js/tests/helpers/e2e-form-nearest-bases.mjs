import assert from 'node:assert/strict';
import {
  openFormPlan,
  closeFormReview,
  applyFormFieldsWithRecovery,
} from './e2e-form-review.mjs';
import { nearestBasesSalary as salary } from '../../../experiments/issue-56/salary-nearest-bases-fixture.mjs';

export const verifyFormNearestBases = async ({
  page,
  owned,
  fixture,
  until,
}) => {
  const before = process.env.SALARY_NEAREST_BASES_BEFORE === '1';
  const initial = await openFormPlan(
    page,
    fixture.url.replace('/application', '/salary-options')
  );
  const owner = owned.at(-1);
  const plan = await page.evaluate(
    ({ id, salary }) => globalThis.__msApi.formsPlanReview({ id, salary }),
    { id: initial.reviewPlan.sessionId, salary }
  );
  const field = plan.fields.find((field) => field.name === 'both');
  assert.equal(field.answer.requiresReview, true);
  assert.equal(field.answer.complete, !before);
  assert.equal(await owner.page.locator('[name="both"]').inputValue(), '');
  let receipts = 0;
  if (!before) {
    assert.equal(field.answer.salary.option.contained, false);
    assert.equal(field.answer.reuseRequiresReview, true);
    const result = await applyFormFieldsWithRecovery(page, owner, plan, [
      field.id,
    ]);
    assert.equal(await owner.page.locator('[name="both"]').inputValue(), '0');
    receipts = result.receipts.length;
  }
  assert.equal(
    await owner.page.locator('[name="owner"]').inputValue(),
    'Keep my explanation'
  );
  if (process.env.SALARY_NEAREST_BASES_SCREENSHOTS) {
    await owner.page.screenshot({
      path: `${process.env.SALARY_NEAREST_BASES_SCREENSHOTS}-${before ? 'before' : 'after'}.png`,
      fullPage: true,
    });
  }
  await closeFormReview(page, until, 'dual-basis nearest review closed');
  assert.equal(owner.closed, true);
  assert.equal(fixture.submits, 0);
  console.log(
    '[forms-nearest-bases]',
    JSON.stringify({
      before,
      receipts,
      recovered: !before,
      closed: owner.closed,
      submissions: fixture.submits,
      automatic: false,
    })
  );
};
