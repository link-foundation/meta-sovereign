import { decodeWire } from '../../src/transport/lino.js';
import { assert } from './e2e-chat.mjs';

export const responseFor = (page, action) =>
  page.waitForResponse((response) =>
    response.url().endsWith(`/api/forms/sessions/${action}`)
  );
export const decoded = async (response) =>
  decodeWire(await response.body(), response.headers()['content-type']);
export const planCurrent = async (page) => {
  const pending = responseFor(page, 'plan');
  await page.locator('[data-action="plan-form"]').click();
  return decoded(await pending);
};

/** Open and read one owned fixture, then plan with an explicit profile. */
export const openFormPlan = async (page, url, profileId = '') => {
  await page.locator('[data-form-url]').fill(url);
  await page.locator('[data-form-slot]').fill('application-2');
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  assert((await decoded(await pending)).ok, 'owned form fixture read');
  await page.locator('[data-form-profile]').selectOption(profileId);
  return planCurrent(page);
};

export const captureFormReview = async (page, name) => {
  await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-${name}-after.png`,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
  assert(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    `${name} review fits phone width`
  );
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-${name}-mobile.png`,
  });
  await page.setViewportSize({ width: 1200, height: 800 });
};

/** Position a field consistently when a focused scenario requests screenshots. */
export const captureFormField = async (page, id, name, scenario) => {
  if (process.env[`FORMS_${scenario.toUpperCase()}_SCREENSHOTS`] !== '1') {
    return;
  }
  // Resize handlers may render and restore scroll on the following frame.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.requestAnimationFrame(() =>
          globalThis.requestAnimationFrame(resolve)
        )
      )
  );
  await page
    .locator(`[data-form-field="${id}"]`)
    .evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-${scenario}-${name}.png`,
  });
};

/** Apply the current selection and retain the server's readback receipts. */
export const applyCurrent = async (page) => {
  const pending = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  return decoded(await pending);
};

/** Inspect the real owned form, independently of the proposed answer. */
export const formControlValues = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...globalThis.document.querySelectorAll('input,textarea')].map(
        (node) => [node.name, node.value]
      )
    )
  );

export const closeFormReview = async (page, until, message) => {
  const pending = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await pending);
  await until(
    async () => (await page.locator('[data-form-review]').count()) === 0,
    message
  );
};

/** Capture the selected field at the desktop and phone review sizes. */
export const captureFormFieldLayouts = async (page, id, scenario) => {
  await captureFormField(page, id, 'after', scenario);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    `${scenario} review fits phone width`
  );
  await captureFormField(page, id, 'mobile', scenario);
  await page.setViewportSize({ width: 1200, height: 800 });
};

export const assertAppliedReceipts = (result, count, message) =>
  assert(
    result.state === 'applied' &&
      result.receipts.filter((receipt) => receipt.status === 'applied')
        .length === count,
    message
  );

/** Apply explicit fields once and require recovery without another native event. */
export const applyFormFieldsWithRecovery = async (
  page,
  owner,
  plan,
  fields
) => {
  const input = {
    id: plan.reviewPlan.sessionId,
    planId: plan.reviewPlan.id,
    fields,
  };
  const apply = () =>
    page.evaluate((input) => globalThis.__msApi.formsApplyReview(input), input);
  const result = await apply();
  assert(
    result.receipts.length === fields.length,
    'exact native receipt count'
  );
  assertAppliedReceipts(
    result,
    fields.length,
    'every selected field has a receipt'
  );
  const events = await owner.page.evaluate(() => globalThis.events.length);
  assert(
    JSON.stringify((await apply()).receipts) ===
      JSON.stringify(result.receipts),
    'retry recovers the acknowledged receipts'
  );
  assert(
    (await owner.page.evaluate(() => globalThis.events.length)) === events,
    'recovery repeats no native event'
  );
  return result;
};
