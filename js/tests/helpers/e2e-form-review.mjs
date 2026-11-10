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
