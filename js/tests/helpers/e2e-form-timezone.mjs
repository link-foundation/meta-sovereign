import { assert } from './e2e-chat.mjs';
import { responseFor, decoded, planCurrent } from './e2e-form-review.mjs';
import { formPlace } from '../../../experiments/issue-56/forms-timezone-fixture.mjs';

const capture = async (page, id, name) => {
  if (process.env.FORMS_TIMEZONE_SCREENSHOTS !== '1') {
    return;
  }
  await page
    .locator(`[data-form-field="${id}"]`)
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-timezone-${name}.png`,
  });
};

export const verifyFormTimezoneUi = async ({ page, owned, fixture, until }) => {
  const initialSubmits = fixture.submits;
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/timezone'));
  await page.locator('[data-form-slot]').fill('application-2');
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  assert((await decoded(await pending)).ok, 'city and time-zone form read');
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:form-place');
  const plan = await planCurrent(page);
  const byName = (name) => plan.fields.find((field) => field.name === name);
  if (process.env.FORMS_TIMEZONE_BEFORE === '1') {
    await capture(page, byName('cityMsk').id, 'before');
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
  await capture(page, byName('cityMsk').id, 'after');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'city and time-zone proposals fit a phone'
  );
  await capture(page, byName('cityMsk').id, 'mobile');
  await page.setViewportSize({ width: 1200, height: 800 });
  pending = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const applied = await decoded(await pending);
  assert(
    applied.state === 'applied' &&
      applied.receipts.filter((receipt) => receipt.status === 'applied')
        .length === 4,
    'four place values have actual readback receipts'
  );
  const values = await owner.page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('input,textarea')].map((node) => [
        node.name,
        node.value,
      ])
    )
  );
  assert(
    values.cityMsk === combined &&
      values.cityUtc === combined &&
      values.zoneOnly === formPlace.timezone &&
      values.cityOnly === formPlace.location &&
      values.ownerCity === 'Owner keeps this city' &&
      values.technical === '',
    'actual place values match while owner input and unresolved answers are preserved'
  );
  pending = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await pending);
  await until(
    async () => (await page.locator('[data-form-review]').count()) === 0,
    'time-zone review closed'
  );
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
