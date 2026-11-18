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
  const response = responseFor(page, 'plan');
  await page.locator('[data-action="plan-form"]').click();
  return decoded(await response);
};

const verifyGrouping = (plan) => {
  assert(
    chosen(plan, 'main-remote').radioGroup.size === 3 &&
      chosen(plan, 'main-remote').radioGroup.id ===
        chosen(plan, 'main-hybrid').radioGroup.id &&
      chosen(plan, 'main-remote').radioGroup.id !==
        chosen(plan, 'other-remote').radioGroup.id &&
      chosen(plan, 'unnamed-one').radioGroup.id !==
        chosen(plan, 'unnamed-two').radioGroup.id,
    'native groups follow form owners and exact names across fieldsets; unnamed options stay separate'
  );
  assert(
    !chosen(plan, 'main-office').answer.applySupported &&
      !chosen(plan, 'hidden-peer-remote').answer.applySupported,
    'negative proposals and groups with hidden peers cannot be selected'
  );
};

export const verifyFormRadioUi = async ({ page, owned, fixture }) => {
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/radio'));
  const open = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await open);
  const owner = owned.at(-1);
  const read = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await read);
  let plan = await planCurrent(page);
  if (process.env.FORMS_RADIO_BEFORE === '1') {
    await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-radio-before.png',
    });
    assert(
      chosen(plan, 'main-remote').answer.applySupported,
      'native radio option can be reviewed'
    );
    return;
  }
  verifyGrouping(plan);
  assert(
    (await page.locator('[data-form-radio-effects]').allTextContents()).some(
      (text) => text.includes('Office')
    ),
    'implicit clearing is shown before applying'
  );
  const select = async (id) =>
    page.locator(`[data-form-select="${chosen(plan, id).id}"]`).check();
  await select('main-remote');
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-fill-error="form-existing-value"]').waitFor();
  assert(
    await owner.page.locator('#main-office').isChecked(),
    'clearing an existing peer requires replacement permission'
  );
  await page.locator('[data-form-replace]').check();
  await select('child-remote');
  const applied = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const result = await decoded(await applied);
  await page.locator('[data-form-application="applied"]').waitFor();
  assert(
    result.receipts.length === 2 &&
      result.receipts.every(
        (receipt) =>
          receipt.status === 'applied' &&
          receipt.effects.length === 1 &&
          receipt.effects[0].status === 'applied'
      ),
    'chosen options and cleared peers have verified receipts'
  );
  assert(
    chosen(result.report, 'main-remote').checked &&
      !chosen(result.report, 'main-office').checked &&
      chosen(result.report, 'other-office').checked &&
      !chosen(result.report, 'other-remote').checked &&
      chosen(result.report, 'child-remote').checked &&
      !chosen(result.report, 'child-office').checked,
    'only selected native groups change, across the cross-origin frame'
  );
  if (process.env.FORMS_RADIO_SCREENSHOTS === '1') {
    await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-radio-after.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-form-fill]').scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'radio receipts fit phone width'
    );
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-radio-mobile.png',
    });
    await page.setViewportSize({ width: 1200, height: 800 });
  }
  plan = await planCurrent(page);
  await select('other-remote');
  await page.locator('[data-form-replace]').check();
  await owner.page.locator('#other').evaluate((form) => {
    const peer = document.createElement('input');
    peer.type = 'radio';
    peer.name = 'arrangement';
    peer.hidden = true;
    form.append(peer);
  });
  const events = await owner.page.evaluate(() => [...globalThis.events]);
  const refused = responseFor(page, 'apply');
  await page.locator('[data-action="apply-form-plan"]').click();
  const refusal = await decoded(await refused);
  assert(
    refusal.state === 'refused' &&
      refusal.code === 'form-changed' &&
      JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
        JSON.stringify(events),
    'new hidden peer invalidates the held plan before interaction'
  );
  const close = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await close);
  assert(
    owner.closed &&
      fixture.submits === 0 &&
      owned.every((item) => !item.events.includes('submit')),
    'radio review closes with acknowledgement and never submits'
  );
};
