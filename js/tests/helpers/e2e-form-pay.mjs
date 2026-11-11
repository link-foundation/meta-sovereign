import { assert } from './e2e-chat.mjs';
import {
  applyCurrent,
  assertAppliedReceipts,
  formControlValues,
  closeFormReview,
  openFormPlan,
  captureFormField,
  captureFormFieldLayouts,
} from './e2e-form-review.mjs';
import { formPayAnswer } from '../../../experiments/issue-56/forms-pay-fixture.mjs';

export const verifyFormPayUi = async ({ page, owned, fixture, until }) => {
  const submits = fixture.submits;
  const plan = await openFormPlan(
    page,
    fixture.url.replace('/application', '/pay'),
    'qa-profile:form-pay'
  );
  const owner = owned.at(-1);
  assert(
    plan.frames[0].intro.includes('3000р.') &&
      !plan.frames[0].intro.includes('USD 10'),
    'only visible form introduction is read'
  );
  const byName = (name) => plan.fields.find((field) => field.name === name);
  if (process.env.FORMS_PAY_BEFORE === '1') {
    await captureFormField(page, byName('hourly').id, 'before', 'pay');
  }
  assert(
    byName('hourly').answer.proposal?.value === formPayAnswer,
    'form introduction determines the minimum hourly pay and comfortable rate'
  );
  assert(
    byName('monthly').answer.salary.guidance.minimum === 336000,
    'lesson pay converts to the requested monthly unit'
  );
  assert(
    byName('technical').answer.proposal === null,
    'payroll database design stays unresolved'
  );
  assert(
    byName('ownerPay').answer.preserveCurrent,
    'owner pay answer remains protected'
  );
  await page.locator(`[data-form-select="${byName('hourly').id}"]`).check();
  await captureFormFieldLayouts(page, byName('hourly').id, 'pay');
  const applied = await applyCurrent(page);
  assertAppliedReceipts(applied, 1, 'one actual pay readback receipt');
  const values = await formControlValues(owner.page);
  assert(
    values.hourly === formPayAnswer &&
      values.monthly === '' &&
      values.ownerPay === 'Owner keeps this pay answer' &&
      values.technical === '',
    'only the selected pay answer changes'
  );
  await closeFormReview(page, until, 'pay review closed');
  assert(
    owner.closed && fixture.submits === submits,
    'pay browser closes with zero submissions'
  );
  console.log(
    '[forms-pay]',
    JSON.stringify({
      values,
      receipts: 1,
      closed: owner.closed,
      submits: fixture.submits - submits,
    })
  );
};
