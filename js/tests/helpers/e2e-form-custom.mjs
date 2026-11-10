import { decodeWire } from '../../src/transport/lino.js';
import { assert } from './e2e-chat.mjs';

const responseFor = (page, action) =>
  page.waitForResponse((response) =>
    response.url().endsWith(`/api/forms/sessions/${action}`)
  );
const decoded = async (response) =>
  decodeWire(await response.body(), response.headers()['content-type']);
const chosen = (report, id) =>
  report.fields.find((field) => field.nativeId === id);
const currentPlan = async (page) => {
  const response = responseFor(page, 'plan');
  await page.locator('[data-action="plan-form"]').click();
  return decoded(await response);
};

const verifyCustomReadback = (result) => {
  assert(
    chosen(result.report, 'custom-name').value === 'Ada Example' &&
      chosen(result.report, 'custom-updates').checked &&
      chosen(result.report, 'custom-remote').checked &&
      !chosen(result.report, 'custom-office').checked &&
      chosen(result.report, 'custom-language').value === 'en' &&
      chosen(result.report, 'custom-arrangement').value === 'remote' &&
      chosen(result.report, 'custom-city').value.includes('UTC+7'),
    'custom text, checked states and selected values match across documents'
  );
};

export const verifyFormCustomUi = async ({ page, owned, fixture }) => {
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/custom'));
  const open = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await open);
  const owner = owned.at(-1);
  const read = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await read);
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  let plan = await currentPlan(page);
  if (process.env.FORMS_CUSTOM_BEFORE === '1') {
    await page
      .locator(`[data-form-field="${chosen(plan, 'custom-remote').id}"]`)
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-custom-before.png',
    });
    assert(
      chosen(plan, 'custom-remote').answer.applySupported,
      'custom radio option can be reviewed'
    );
    return;
  }
  for (const id of [
    'hidden-group-remote',
    'owned-group-remote',
    'unknown-check',
    'submit-trap',
    'hidden-choice',
    'duplicate-choice',
  ]) {
    assert(!chosen(plan, id).answer.applySupported, `${id} stays unavailable`);
  }
  const selected = [
    'custom-name',
    'custom-updates',
    'custom-remote',
    'custom-language',
    'custom-arrangement',
    'custom-city',
  ];
  for (const id of selected) {
    assert(chosen(plan, id).answer.applySupported, `${id} can be reviewed`);
    await page.locator(`[data-form-select="${chosen(plan, id).id}"]`).check();
  }
  await page.locator('[data-form-replace]').check();
  const applied = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const result = await decoded(await applied);
  assert(
    result.state === 'applied' &&
      result.receipts.length === 6 &&
      result.receipts.every((receipt) => receipt.status === 'applied'),
    `custom changes read back: ${JSON.stringify(result)}`
  );
  verifyCustomReadback(result);
  if (process.env.FORMS_CUSTOM_SCREENSHOTS === '1') {
    await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-custom-after.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'custom receipts fit phone width'
    );
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-custom-mobile.png',
    });
    await page.setViewportSize({ width: 1200, height: 800 });
  }
  await owner.page.locator('#custom-language').evaluate((node) => {
    for (const option of node.children) {
      option.setAttribute(
        'aria-selected',
        String(option.textContent === 'Hindi')
      );
    }
  });
  plan = await currentPlan(page);
  await page
    .locator(`[data-form-select="${chosen(plan, 'custom-language').id}"]`)
    .check();
  await page.locator('[data-form-replace]').check();
  await owner.page
    .locator('#custom-english')
    .evaluate((node) => node.replaceWith(node.cloneNode(true)));
  const events = await owner.page.evaluate(() => [...globalThis.events]);
  const refused = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const refusal = await decoded(await refused);
  assert(
    refusal.state === 'refused' &&
      refusal.code === 'form-changed' &&
      JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
        JSON.stringify(events),
    'identical replacement option refuses before clicking'
  );
  const close = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await close);
  assert(
    owner.closed &&
      fixture.submits === 0 &&
      owned.every((item) => !item.events.includes('submit')),
    'custom review closes and never submits'
  );
};
