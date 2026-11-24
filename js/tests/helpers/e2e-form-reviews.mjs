import { decodeWire } from '../../src/transport/lino.js';
import { assert, fulfil } from './e2e-chat.mjs';

const responseBody = async (promise) => {
  const response = await promise;
  return decodeWire(await response.body(), response.headers()['content-type']);
};
const capture = async (page) => {
  if (process.env.FORMS_SESSION_SCREENSHOTS !== '1') {
    return;
  }
  await page.locator('[data-form-reviews]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'docs/screenshots/issue-56-forms-session-after.png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-form-review]').first().scrollIntoViewIfNeeded();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'review controls fit a phone'
  );
  await page.screenshot({
    path: 'docs/screenshots/issue-56-forms-session-mobile.png',
  });
  await page.setViewportSize({ width: 1200, height: 800 });
};

export const verifyFormReviewUi = async ({ page, owned, fixture, until }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const open = page.locator('[data-action="open-form-review"]');
  if (process.env.FORMS_SESSION_BEFORE === '1') {
    await page.locator('.forms-view h1').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-session-before.png',
    });
    assert(await open.count(), 'persistent form review controls exist');
    return;
  }
  await until(() => open.isEnabled(), 'review browser capability');
  await page.locator('[data-form-slot]').fill('application-2');
  const opened = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/open')
  );
  await open.click();
  const result = await responseBody(opened);
  const card = page.locator(`[data-form-review="${result.session.id}"]`);
  await card.waitFor();
  const owner = owned.at(-1);
  assert(
    !owner.closed && result.session.activityTracking && result.session.headless,
    'owned review stays open with actual headless capability'
  );
  assert(
    await card.locator('[data-review-action="focus"]').isDisabled(),
    'headless windows never claim visible focus'
  );
  await open.click();
  await page.locator('[data-form-review-error="form-slot-in-use"]').waitFor();
  assert(
    (await page.locator('[data-form-review]').count()) === 1,
    'duplicate open preserves the existing browser'
  );
  await owner.page
    .locator('[name="fullName"]')
    .fill('Owner revised the answer');
  const events = await owner.page.evaluate(() => [...globalThis.events]);
  const read = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/read')
  );
  await card.locator('[data-review-action="read"]').click();
  const report = await responseBody(read);
  assert(
    report.fields.find((field) => field.name === 'fullName').value ===
      'Owner revised the answer',
    'reread preserves the manual answer'
  );
  assert(
    JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
      JSON.stringify(events),
    'reread issues no form interaction'
  );
  assert(
    owner.navigation.length === 1 && !owner.closed,
    'reread never reopens the original page'
  );
  await owner.page.goto(`${fixture.url}?page=2`);
  const next = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/read')
  );
  await card.locator('[data-review-action="read"]').click();
  assert(
    (await responseBody(next)).url.endsWith('?page=2'),
    'owner-controlled next page is read without navigation'
  );
  await page.route('**/api/forms/sessions/close', (route) =>
    fulfil(route, { ok: false, code: 'form-close-failed' }, 400)
  );
  await card.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review-error="form-close-failed"]').waitFor();
  assert(
    !owner.closed &&
      (await card.count()) === 1 &&
      (await page.locator('[data-form-field]').count()) === 15,
    'unconfirmed close preserves browser and report'
  );
  await page.unroute('**/api/forms/sessions/close');
  await page.locator('[data-form-slot]').fill('application-3');
  await open.click();
  await until(
    async () => (await page.locator('[data-form-review]').count()) === 2,
    'independent second review slot'
  );
  const second = owned.at(-1);
  await capture(page);
  await card.locator('[data-review-action="close"]').click();
  await card.waitFor({ state: 'detached' });
  assert(
    owner.closed && !second.closed,
    'closing one review leaves the other browser open'
  );
  await page.locator('[data-review-action="close"]').click();
  await until(
    async () => (await page.locator('[data-form-review]').count()) === 0,
    'explicit close acknowledged'
  );
  assert(
    second.closed && fixture.submits === 0,
    'all review browsers close without submitting'
  );
};
