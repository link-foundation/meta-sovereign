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
const planCurrent = async (page) => {
  const pending = responseFor(page, 'plan');
  await page.locator('[data-action="plan-form"]').click();
  return decoded(await pending);
};
const openChoices = async (page, field) => {
  const pending = responseFor(page, 'disclose');
  await page.locator(`[data-form-disclose="${field.id}"]`).click();
  const response = await pending;
  return { response, result: await decoded(response) };
};

export const verifyFormChoicesUi = async ({ page, owned, fixture }) => {
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/choices'));
  const opening = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await opening);
  const owner = owned.at(-1);
  const reading = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await reading);
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  let plan = await planCurrent(page);
  if (process.env.FORMS_CHOICES_BEFORE === '1') {
    await page
      .locator(`[data-form-field="${chosen(plan, 'closed-work').id}"]`)
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-choices-before.png',
    });
    assert(
      chosen(plan, 'closed-work').answer.inspectOptionsSupported,
      'closed combobox exposes explicit choice inspection'
    );
    return;
  }
  assert(
    !chosen(plan, 'closed-work').answer.applySupported &&
      chosen(plan, 'lazy-language').answer.inspectOptionsSupported,
    'closed and lazy controls require inspection'
  );
  assert(
    !chosen(plan, 'choice-submit-trap').answer.inspectOptionsSupported,
    'submit trap cannot be opened'
  );
  const opened = await openChoices(page, chosen(plan, 'closed-work'));
  assert(
    opened.result.state === 'opened',
    `actual choices opened: ${JSON.stringify(opened.result)}`
  );
  const events = await owner.page.evaluate(() => [...globalThis.events]);
  const recovered = await page.request.fetch(opened.response.url(), {
    method: 'POST',
    headers: opened.response.request().headers(),
    data: opened.response.request().postDataBuffer(),
  });
  assert(
    (await decoded(recovered)).state === 'opened' &&
      JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
        JSON.stringify(events),
    'same-plan response recovery does not click again'
  );
  if (process.env.FORMS_CHOICES_SCREENSHOTS === '1') {
    await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-choices-opened.png',
    });
  }
  plan = await planCurrent(page);
  const lazy = await openChoices(page, chosen(plan, 'lazy-language'));
  assert(
    lazy.result.state === 'opened' &&
      chosen(lazy.result.report, 'lazy-language').value === 'hi',
    'lazy selected value is discovered without changing displayed answer'
  );
  plan = await planCurrent(page);
  for (const id of ['closed-work', 'lazy-language']) {
    assert(
      chosen(plan, id).answer.applySupported,
      `${id} proposal now reviewable`
    );
    await page.locator(`[data-form-select="${chosen(plan, id).id}"]`).check();
  }
  await page.locator('[data-form-replace]').check();
  const applying = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const result = await decoded(await applying);
  assert(
    result.state === 'applied' &&
      result.receipts.length === 2 &&
      chosen(result.report, 'closed-work').displayValue === 'Remote' &&
      chosen(result.report, 'lazy-language').displayValue === 'English',
    `fresh plan applies exposed choices: ${JSON.stringify(result)}`
  );
  assert(
    (await owner.page.locator('#choice-name').inputValue()) === 'Owner text',
    'unselected answer remains unchanged'
  );
  if (process.env.FORMS_CHOICES_SCREENSHOTS === '1') {
    await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-choices-after.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'choice inspection fits phone width'
    );
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-choices-mobile.png',
    });
    await page.setViewportSize({ width: 1200, height: 800 });
  }
  plan = await planCurrent(page);
  await owner.page
    .locator('#closed-work')
    .evaluate((node) => node.replaceWith(node.cloneNode(true)));
  const before = await owner.page.evaluate(() => [...globalThis.events]);
  const refusal = await openChoices(page, chosen(plan, 'closed-work'));
  assert(
    refusal.result.state === 'refused' &&
      refusal.result.code === 'form-changed' &&
      JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
        JSON.stringify(before),
    'identical replaced combobox refuses inspection before clicking'
  );
  const closing = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await closing);
  assert(
    owner.closed &&
      fixture.submits === 0 &&
      owned.every((entry) => !entry.events.includes('submit')),
    'choice browsers acknowledge cleanup and never submit'
  );
};
