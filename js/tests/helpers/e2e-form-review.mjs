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
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
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
  await page
    .locator(`[data-form-field="${id}"]`)
    .evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-${scenario}-${name}.png`,
  });
};
