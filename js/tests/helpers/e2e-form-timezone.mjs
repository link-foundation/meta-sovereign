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
import { formPlace } from '../../../experiments/issue-56/forms-timezone-fixture.mjs';

export const verifyFormTimezoneUi = async ({ page, owned, fixture, until }) => {
  const initialSubmits = fixture.submits;
  const plan = await openFormPlan(
    page,
    fixture.url.replace('/application', '/timezone'),
    'qa-profile:form-place'
  );
  const owner = owned.at(-1);
  const byName = (name) => plan.fields.find((field) => field.name === name);
  if (process.env.FORMS_TIMEZONE_BEFORE === '1') {
    await captureFormField(page, byName('cityMsk').id, 'before', 'timezone');
  }
  const combined = `${formPlace.location}, ${formPlace.timezone}`;
  assert(
    byName('cityMsk').answer.proposal?.value === combined,
    'Moscow-offset request includes configured city and time zone'
  );
  assert(
    byName('cityUtc').answer.proposal?.value === combined,
    'UTC-offset request includes both values'
  );
  assert(
    byName('zoneOnly').answer.proposal?.value === formPlace.timezone,
    'time-zone field contains only time zone'
  );
  assert(
    byName('cityOnly').answer.proposal?.value === formPlace.location,
    'city field contains only city'
  );
  assert(
    byName('technical').answer.proposal === null,
    'technical UTC question stays unresolved'
  );
  for (const name of ['cityMsk', 'cityUtc', 'zoneOnly', 'cityOnly']) {
    await page.locator(`[data-form-select="${byName(name).id}"]`).check();
  }
  await captureFormFieldLayouts(page, byName('cityMsk').id, 'timezone');
  const applied = await applyCurrent(page);
  assertAppliedReceipts(
    applied,
    4,
    'four place values have actual readback receipts'
  );
  const values = await formControlValues(owner.page);
  assert(
    values.cityMsk === combined &&
      values.cityUtc === combined &&
      values.zoneOnly === formPlace.timezone &&
      values.cityOnly === formPlace.location &&
      values.ownerCity === 'Owner keeps this city' &&
      values.technical === '',
    'actual place values match while owner input and unresolved answers are preserved'
  );
  await closeFormReview(page, until, 'time-zone review closed');
  assert(
    owner.closed && fixture.submits === initialSubmits,
    'time-zone browser closes without submitting'
  );
  console.log(
    '[forms-timezone]',
    JSON.stringify({
      values,
      receipts: 4,
      closed: owner.closed,
      submits: fixture.submits - initialSubmits,
    })
  );
};
