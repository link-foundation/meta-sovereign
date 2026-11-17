import { assert } from './e2e-chat.mjs';
import { openFormPlan, closeFormReview, decoded } from './e2e-form-review.mjs';
import { encodeWire, LINO_TEXT } from '../../src/transport/lino.js';
import {
  salaryOptionConfig as salary,
  salaryBothChoices,
  salaryGapChoices,
} from '../../../experiments/issue-56/salary-option-fixture.mjs';

const capture = async (page) => {
  if (process.env.SALARY_OPTIONS_SCREENSHOT) {
    await page.screenshot({
      path: process.env.SALARY_OPTIONS_SCREENSHOT,
      fullPage: true,
    });
  }
};

export const verifyFormSalaryOptions = async ({
  page,
  owned,
  fixture,
  base,
  until,
}) => {
  const initial = await openFormPlan(
    page,
    fixture.url.replace('/application', '/salary-options')
  );
  const owner = owned.at(-1);
  const request = async (action, input) =>
    decoded(
      await page.request.post(`${base}/api/forms/sessions/${action}`, {
        headers: { 'content-type': LINO_TEXT, accept: LINO_TEXT },
        data: encodeWire(input, LINO_TEXT),
      })
    );
  const id = initial.reviewPlan.sessionId;
  const plan = await request('plan', { id, salary });
  await capture(owner.page);
  const both = plan.fields.find((field) => field.name === 'both');
  const nearest = plan.fields.find(
    (field) => field.name === 'nearest' && field.answer.proposal?.checked
  );
  assert(
    both?.answer.text === salaryBothChoices[0] &&
      both.answer.salary.option.contained,
    'both bases share a unique containing native select option'
  );
  assert(
    nearest?.answer.text === salaryGapChoices[1] &&
      !nearest.answer.salary.option.contained &&
      nearest.answer.reuseRequiresReview,
    'nearest native radio is explicitly held for form review'
  );
  assert(
    (await owner.page.locator('[name="both"]').inputValue()) === '' &&
      !(await owner.page.locator('[name="nearest"]:checked').count()),
    'planning has no native effects'
  );
  const input = {
    id,
    planId: plan.reviewPlan.id,
    fields: [both.id, nearest.id],
  };
  const result = await request('apply', input);
  assert(
    result.state === 'applied' &&
      result.receipts.length === 2 &&
      result.receipts.every((item) => item.status === 'applied'),
    'two selected salary fields have positive readback receipts'
  );
  const values = await owner.page.evaluate(() => ({
    both: document.querySelector('[name="both"]').value,
    nearest: document.querySelector('[name="nearest"]:checked')?.value,
    owner: document.querySelector('[name="owner"]').value,
  }));
  assert(
    values.both === '0' &&
      values.nearest === '1' &&
      values.owner === 'Keep my explanation',
    'only reviewed native salary choices change'
  );
  const events = await owner.page.evaluate(() => globalThis.events.length);
  const recovered = await request('apply', input);
  assert(
    JSON.stringify(recovered.receipts) === JSON.stringify(result.receipts) &&
      (await owner.page.evaluate(() => globalThis.events.length)) === events,
    'retry recovers acknowledged choices'
  );
  await capture(owner.page);
  await closeFormReview(page, until, 'salary option review closed');
  assert(
    owner.closed && fixture.submits === 0,
    'salary browser closes without submission'
  );
  console.log(
    '[forms-salary-options]',
    JSON.stringify({
      both: values.both,
      nearest: values.nearest,
      receipts: result.receipts.length,
      recovered: true,
      closed: owner.closed,
      submissions: fixture.submits,
    })
  );
};
