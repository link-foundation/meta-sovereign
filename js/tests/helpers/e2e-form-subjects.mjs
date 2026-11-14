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

export const verifyFormSubjectsUi = async ({ page, owned, fixture, until }) => {
  const initialSubmits = fixture.submits;
  const plan = await openFormPlan(
    page,
    fixture.url.replace('/application', '/subjects'),
    ''
  );
  const owner = owned.at(-1);
  const byName = (name) => plan.fields.find((field) => field.name === name);
  if (process.env.FORMS_SUBJECTS_BEFORE === '1') {
    await captureFormField(
      page,
      byName('wrongTechnology').id,
      'before',
      'subjects'
    );
  }
  assert(
    byName('wrongTechnology').answer.proposal === null,
    'C# question never borrows a Go answer'
  );
  assert(
    byName('rightTechnology').answer.proposal?.value ===
      'Three years building Go services',
    'Golang alias offers the reviewed Go answer'
  );
  assert(
    byName('rightTechnology').answer.source === 'approximate',
    'alias proposal retains approximate provenance'
  );
  assert(
    byName('ownerTechnology').answer.preserveCurrent,
    'owner edit remains protected'
  );
  await page
    .locator(`[data-form-select="${byName('rightTechnology').id}"]`)
    .check();
  await captureFormFieldLayouts(page, byName('wrongTechnology').id, 'subjects');
  const applied = await applyCurrent(page);
  assertAppliedReceipts(
    applied,
    1,
    'one actual field receipt confirms the chosen alias'
  );
  const values = await formControlValues(owner.page);
  assert(
    values.wrongTechnology === '' &&
      values.rightTechnology === 'Three years building Go services' &&
      values.ownerTechnology === 'Owner keeps this answer',
    'actual controls preserve unresolved and owner values'
  );
  await closeFormReview(page, until, 'subject review closed');
  assert(
    owner.closed && fixture.submits === initialSubmits,
    'subject browser closes without submitting'
  );
  console.log(
    '[forms-subjects]',
    JSON.stringify({
      values,
      receipts: 1,
      closed: owner.closed,
      submits: fixture.submits - initialSubmits,
    })
  );
};
