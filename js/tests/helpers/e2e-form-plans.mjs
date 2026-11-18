import { readFile } from 'node:fs/promises';
import { decodeWire } from '../../src/transport/lino.js';
import { assert, fulfil } from './e2e-chat.mjs';

const answer = (report, name) =>
  report.fields.find((field) => field.name === name)?.answer;
export const verifyFormPlanUi = async ({ page, report, owned }) => {
  const button = page.locator('[data-action="plan-form"]');
  if (process.env.FORMS_PLAN_BEFORE === '1') {
    await page.locator('.forms-view h1').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-plan-before.png',
    });
    assert(await button.count(), 'shared form answer planning exists');
    return;
  }
  await page
    .locator('[data-form-profile] option[value="qa-profile:forms-fixture"]')
    .waitFor({ state: 'attached' });
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  const response = page.waitForResponse((reply) =>
    reply.url().endsWith('/api/forms/plan')
  );
  await button.click();
  const reply = await response;
  const plan = decodeWire(await reply.body(), reply.headers()['content-type']);
  assert(
    plan.mode === 'answer-plan' && plan.fields.length === report.fields.length,
    'actual per-field answer plan'
  );
  assert(
    answer(plan, 'fullName').proposal.value === 'Ada Example' &&
      answer(plan, 'fullName').preserveCurrent,
    'current owner answer and reviewed profile proposal coexist'
  );
  assert(
    answer(plan, 'language').source === 'exact' &&
      answer(plan, 'language').rules[0].question === 'Preferred language',
    'saved question provenance'
  );
  assert(
    answer(plan, 'experience').reason === 'protected-field' &&
      answer(plan, 'resume').proposal === null,
    'protected fields stay unresolved'
  );
  assert(
    plan.fields
      .filter((field) => field.type === 'radio')
      .map((field) => field.answer.proposal.checked)
      .join(',') === 'true,false',
    'cross-origin radio choices use the shared answer engine'
  );
  assert(
    owned.length === 1 && owned[0].closed && owned[0].events.length === 0,
    'planning never relaunches or changes the form'
  );
  await page.locator('[data-form-plan-summary]').waitFor();
  const name = page.locator('[data-form-field]').filter({
    has: page.getByRole('heading', { name: 'Full name', exact: true }),
  });
  assert(
    (await name.textContent()).includes("Owner's current answer") &&
      (await name.textContent()).includes('Ada Example'),
    'UI shows preserved current value and proposal'
  );
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="download-form-report"]').click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert(
    download.suggestedFilename().startsWith('form-plan-') &&
      exported.mode === 'answer-plan' &&
      answer(exported, 'fullName').proposal.value === 'Ada Example',
    'download exports the actual proposal and evidence'
  );
  await page.route('**/api/forms/plan', (route) =>
    fulfil(route, { ok: false, code: 'form-report' }, 400)
  );
  await button.click();
  await page.locator('[data-form-plan-error="form-report"]').waitFor();
  assert(
    (await page.locator('[data-form-plan-summary]').count()) === 1 &&
      (await page.locator('[data-form-profile]').inputValue()) ===
        'qa-profile:forms-fixture',
    'failed plan preserves the report, previous plan and selected profile'
  );
  await page.unroute('**/api/forms/plan');
  await button.click();
  await page.locator('[data-form-plan-error]').waitFor({ state: 'detached' });
  await button.waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => !document.querySelector('[data-action="plan-form"]').disabled
  );
  if (process.env.FORMS_PLAN_SCREENSHOTS === '1') {
    await page.locator('[data-form-plan-summary]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-plan-after.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-form-plan-summary]').scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'answer proposals fit phone viewport'
    );
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-plan-mobile.png',
    });
    await page.setViewportSize({ width: 1200, height: 800 });
  }
  await page.locator('[data-form-profile]').selectOption('');
  assert(
    (await page.locator('[data-form-plan-summary]').count()) === 0,
    'changed planning inputs clear stale proposals'
  );
};
