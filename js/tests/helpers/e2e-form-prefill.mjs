import { decodeWire } from '../../src/transport/lino.js';
import { assert } from './e2e-chat.mjs';

const decoded = async (response) =>
  decodeWire(await response.body(), response.headers()['content-type']);
const replyFor = (page, action) =>
  page.waitForResponse((response) =>
    response.url().endsWith(`/api/forms/sessions/${action}`)
  );
const fieldByName = (plan, name) =>
  plan.fields.find(
    (field) =>
      field.name === name || (name === 'city' && field.nativeId === 'city')
  );
const select = async (page, plan, names) => {
  for (const name of names) {
    await page
      .locator(`[data-form-select="${fieldByName(plan, name).id}"]`)
      .check();
  }
};
const planLive = async (page) => {
  const response = replyFor(page, 'plan');
  await page.locator('[data-action="plan-form"]').click();
  const result = await decoded(await response);
  await page.locator('[data-form-fill]').waitFor();
  return result;
};
const capture = async (page) => {
  if (process.env.FORMS_PREFILL_SCREENSHOTS !== '1') {
    return;
  }
  await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'docs/screenshots/issue-56-forms-prefill-after.png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'reviewed changes fit phone width'
  );
  await page.screenshot({
    path: 'docs/screenshots/issue-56-forms-prefill-mobile.png',
  });
  await page.setViewportSize({ width: 1200, height: 800 });
};

const verifyLostResponse = async (page, owner, plan) => {
  await select(page, plan, [
    'fullName',
    'location',
    'newsletter',
    'start',
    'language',
    'city',
  ]);
  await page.locator('[data-form-replace]').check();
  let forwarded;
  let requests = 0;
  await page.route('**/api/forms/sessions/apply', async (route) => {
    requests++;
    forwarded = await decoded(await route.fetch());
    await route.abort('failed');
  });
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-fill-error]').waitFor();
  assert(
    requests === 1 && forwarded.state === 'applied',
    'lost response never triggers an implicit repeated application'
  );
  const events = await owner.page.evaluate(() => [...globalThis.events]);
  await page.unroute('**/api/forms/sessions/apply');
  const response = replyFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const result = await decoded(await response);
  await page.locator('[data-form-application="applied"]').waitFor();
  assert(
    result.receipts.length === 6 &&
      result.receipts.every((receipt) => receipt.status === 'applied'),
    'all six selected fields have actual readback receipts'
  );
  assert(
    JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
      JSON.stringify(events),
    'explicit retry recovers cached receipts without another field interaction'
  );
  assert(
    fieldByName(result.report, 'fullName').value === 'Ada Example' &&
      fieldByName(result.report, 'email').value === 'Owner newer email',
    'selected name changes while unselected owner answer remains'
  );
  assert(
    fieldByName(result.report, 'newsletter').checked &&
      fieldByName(result.report, 'location').value === 'vn',
    'native checkbox and select are read back'
  );
  assert(
    fieldByName(result.report, 'city').value === 'Vietnam, UTC+7',
    'cross-origin native field receives the reviewed profile answer'
  );
  assert(
    await owner.page.evaluate(
      () =>
        globalThis.navigationClicks === 0 &&
        !globalThis.events.includes('submit')
    ),
    'no Submit or Next action occurs'
  );
  await capture(page);
};

export const verifyFormPrefillUi = async ({ page, owned, fixture }) => {
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/prefill'));
  await page.locator('[data-form-slot]').fill('application-2');
  const opened = replyFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await opened);
  const owner = owned.at(-1);
  const read = replyFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await read);
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  if (process.env.FORMS_PREFILL_BEFORE === '1') {
    await page.locator('[data-action="plan-form"]').click();
    await page.locator('[data-form-plan-summary]').waitFor();
    await page.locator('[data-form-plan-summary]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-prefill-before.png',
    });
    assert(
      await page.locator('[data-form-fill]').count(),
      'live reviewed prefilling exists'
    );
    return;
  }
  let plan = await planLive(page);
  assert(
    await page
      .locator('[data-form-replace]')
      .evaluate(
        (input) =>
          input.getBoundingClientRect().width < 24 &&
          input.getBoundingClientRect().left ===
            input.parentElement.getBoundingClientRect().left
      ),
    'replacement checkbox keeps its standard size beside its label'
  );
  await select(page, plan, ['fullName']);
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-fill-error="form-existing-value"]').waitFor();
  assert(
    (await page.locator('[data-form-select]:checked').count()) === 1,
    'refused replacement preserves explicit selection'
  );
  await owner.page.locator('[name="email"]').fill('Owner newer email');
  await page.locator('[data-form-replace]').check();
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-application="refused"]').waitFor();
  assert(
    (await owner.page.locator('[name="fullName"]').inputValue()) ===
      "Owner's current answer",
    'stale form refuses before a write'
  );
  plan = await planLive(page);
  await verifyLostResponse(page, owner, plan);
  plan = await planLive(page);
  await select(page, plan, ['email']);
  await page.locator('[data-form-replace]').check();
  await owner.page.reload();
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-application="refused"]').waitFor();
  assert(
    (await owner.page.locator('[name="email"]').inputValue()) === '',
    'same-URL reload invalidates document-bound targets'
  );
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  assert(
    owner.closed && fixture.submits === 0,
    'reviewed prefilling closes its browser without submitting'
  );
};
