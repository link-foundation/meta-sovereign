import { assert } from './e2e-chat.mjs';
import {
  responseFor,
  decoded,
  openFormPlan,
  captureFormField,
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
  await captureFormField(
    page,
    byName('wrongTechnology').id,
    'after',
    'subjects'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'subject review fits a phone'
  );
  await captureFormField(
    page,
    byName('wrongTechnology').id,
    'mobile',
    'subjects'
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  let pending = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const applied = await decoded(await pending);
  assert(
    applied.state === 'applied' &&
      applied.receipts.filter((receipt) => receipt.status === 'applied')
        .length === 1,
    'one actual field receipt confirms the chosen alias'
  );
  const values = await owner.page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('textarea')].map((node) => [
        node.name,
        node.value,
      ])
    )
  );
  assert(
    values.wrongTechnology === '' &&
      values.rightTechnology === 'Three years building Go services' &&
      values.ownerTechnology === 'Owner keeps this answer',
    'actual controls preserve unresolved and owner values'
  );
  pending = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await pending);
  await until(
    async () => (await page.locator('[data-form-review]').count()) === 0,
    'subject review closed'
  );
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
