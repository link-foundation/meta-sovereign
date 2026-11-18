import { seedMatchingAnswers } from '../../../experiments/issue-56/question-matching-fixture.mjs';
import { assert } from './e2e-chat.mjs';
import {
  openFormPlan,
  planCurrent,
  captureFormFieldLayouts,
  applyCurrent,
  assertAppliedReceipts,
  formControlValues,
  closeFormReview,
} from './e2e-form-review.mjs';

export const verifyFormMatchingUi = async ({
  page,
  owned,
  fixture,
  store,
  until,
}) => {
  await seedMatchingAnswers(store);
  const initialSubmits = fixture.submits;
  const initial = await openFormPlan(
    page,
    fixture.url.replace('/application', '/matching')
  );
  assert(
    initial.fields.find((field) => field.name === 'city').answer.proposal ===
      null,
    'default threshold leaves city wording open'
  );
  const settings = page.locator('[data-form-planner] [data-question-matching]');
  await settings.getByLabel('Minimum similarity (%)').fill('60');
  await settings.getByLabel('Match letter case').check();
  const plan = await planCurrent(page);
  const byName = (name) => plan.fields.find((field) => field.name === name);
  assert(
    byName('city').answer.proposal?.value === 'Hanoi, district 12.',
    'form uses configured threshold'
  );
  assert(
    byName('caseCity').answer.proposal === null,
    'form uses configured case sensitivity'
  );
  assert(
    byName('ownerCity').answer.preserveCurrent,
    'owner city remains protected'
  );
  await page.locator(`[data-form-select="${byName('city').id}"]`).check();
  await captureFormFieldLayouts(page, byName('city').id, 'matching');
  const applied = await applyCurrent(page);
  assertAppliedReceipts(
    applied,
    1,
    'frozen matching settings produce one verified write'
  );
  const owner = owned.at(-1);
  const values = await formControlValues(owner.page);
  assert(
    values.city === 'Hanoi, district 12.' &&
      values.caseCity === '' &&
      values.ownerCity === 'Owner keeps this city',
    'actual controls preserve case refusal and owner content'
  );
  await closeFormReview(page, until, 'matching review closed');
  assert(
    owner.closed && fixture.submits === initialSubmits,
    'matching fixture closes without submission'
  );
  console.log(
    '[forms-matching]',
    JSON.stringify({
      values,
      receipts: 1,
      closed: owner.closed,
      submits: fixture.submits - initialSubmits,
    })
  );
};
