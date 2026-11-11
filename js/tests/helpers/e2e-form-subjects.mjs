import { assert } from './e2e-chat.mjs';
import { responseFor, decoded, planCurrent } from './e2e-form-review.mjs';

const capture = async (page, id, name) => {
  if (process.env.FORMS_SUBJECTS_SCREENSHOTS !== '1') {
    return;
  }
  await page
    .locator(`[data-form-field="${id}"]`)
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-subjects-${name}.png`,
  });
};

export const verifyFormSubjectsUi = async ({ page, owned, fixture, until }) => {
  const initialSubmits = fixture.submits;
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/subjects'));
  await page.locator('[data-form-slot]').fill('application-2');
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  assert((await decoded(await pending)).ok, 'subject form read');
  await page.locator('[data-form-profile]').selectOption('');
  const plan = await planCurrent(page);
  const byName = (name) => plan.fields.find((field) => field.name === name);
  if (process.env.FORMS_SUBJECTS_BEFORE === '1') {
    await capture(page, byName('wrongTechnology').id, 'before');
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
  await capture(page, byName('wrongTechnology').id, 'after');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'subject review fits a phone'
  );
  await capture(page, byName('wrongTechnology').id, 'mobile');
  await page.setViewportSize({ width: 1200, height: 800 });
  pending = responseFor(page, 'apply');
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
