import { responseFor, decoded, planCurrent } from './e2e-form-review.mjs';
import { assert, fulfil } from './e2e-chat.mjs';
import { syntheticResumePdf } from '../../../experiments/issue-56/forms-resume-fixture.mjs';
import { resumePdf } from '../../src/forms/resume-upload.js';

const configurationReply = (page, action) =>
  page.waitForResponse((response) =>
    response.url().endsWith(`/api/forms/resume/${action}`)
  );
const field = (plan, id) => plan.fields.find((item) => item.nativeId === id);
const attachSaved = async (page, plan, id) => {
  const current = field(plan, id);
  const button = page.locator(`[data-form-attach-saved="${current.id}"]`);
  if (current.upload.files.length) {
    assert(
      await button.isDisabled(),
      'saved attachment needs separate replacement consent'
    );
    await page.locator(`[data-form-resume-replace="${current.id}"]`).check();
  }
  const pending = responseFor(page, 'attach');
  await button.click();
  return decoded(await pending);
};

const verifyResumeReadRecovery = async (page, saved, until) => {
  await page.route('**/api/forms/resume', (route) =>
    fulfil(
      route,
      {
        ok: false,
        code: 'fixture-refused',
        error: 'Fixture refusal',
      },
      400
    )
  );
  await page.locator('[data-reload-form-resume]').click();
  await until(
    () => page.locator('[data-form-resume-error="fixture-refused"]').count(),
    'explicit saved-PDF read refusal stays visible'
  );
  assert(
    !(await page.locator('[data-saved-form-resume]').textContent()).includes(
      'No PDF is saved'
    ),
    'failed remote read never claims an empty local store'
  );
  assert(
    await page.locator('[data-delete-form-resume]').isDisabled(),
    'unknown saved state cannot be deleted'
  );
  if (process.env.FORMS_CONFIGURED_RESUME_SCREENSHOTS === '1') {
    await page.locator('[data-form-resume-settings]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-resume-read-after.png',
    });
  }
  await page.unroute('**/api/forms/resume');
  await page.locator('[data-reload-form-resume]').click();
  await page.locator(`[data-saved-form-resume="${saved.revision}"]`).waitFor();
  await until(
    () => page.locator('[data-delete-form-resume]').isEnabled(),
    'saved-PDF read retry recovers'
  );
};

export const verifyFormConfiguredResumeUi = async ({
  page,
  owned,
  fixture,
  until,
}) => {
  const file = {
    name: 'synthetic-resume.pdf',
    mimeType: 'application/pdf',
    buffer: syntheticResumePdf(),
  };
  await page.locator('[data-save-form-resume-file]').setInputFiles(file);
  await until(
    () => page.locator('[data-save-form-resume]').isEnabled(),
    'saved PDF controls loaded'
  );
  let pending = configurationReply(page, 'save');
  await page.locator('[data-save-form-resume]').click();
  const saved = (await decoded(await pending)).resume;
  assert(saved?.name === file.name, 'chosen PDF saved');
  await page.locator(`[data-saved-form-resume="${saved.revision}"]`).waitFor();
  await page.reload();
  await page.locator(`[data-saved-form-resume="${saved.revision}"]`).waitFor();
  assert(
    await page.locator('[data-delete-form-resume]').isEnabled(),
    'configuration survives UI reload'
  );
  await verifyResumeReadRecovery(page, saved, until);
  await page.locator('[data-form-slot]').fill('application-2');
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/upload'));
  pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  await owner.page
    .locator('#main-resume')
    .setInputFiles({ ...file, name: 'owner.pdf' });
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await pending);
  let plan = await planCurrent(page);
  assert(
    plan.reviewPlan.resume.revision === saved.revision,
    'plan exposes exact selected revision'
  );
  const main = await attachSaved(page, plan, 'main-resume');
  const expected = resumePdf({
    name: file.name,
    data: file.buffer.toString('base64'),
  }).metadata;
  assert(
    main.state === 'attached' &&
      main.resumeRevision === saved.revision &&
      main.file.sha256 === expected.sha256,
    'saved bytes actually replace the selected native field'
  );
  assert(
    await page.locator('[data-action="apply-form-plan"]').isDisabled(),
    'upload consumes the plan'
  );
  plan = await planCurrent(page);
  const child = await attachSaved(page, plan, 'child-resume');
  assert(
    child.state === 'attached' && child.file.sha256 === expected.sha256,
    'same saved PDF works in cross-origin iframe'
  );
  assert(
    (await owner.page.locator('#resume-name').inputValue()) === 'Owner text',
    'owner text retained'
  );
  assert(
    (await owner.page
      .locator('#portrait')
      .evaluate((node) => node.files.length)) === 0,
    'unrelated file untouched'
  );
  if (process.env.FORMS_CONFIGURED_RESUME_SCREENSHOTS === '1') {
    await page.locator('[data-form-resume-settings]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-configured-resume-after.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-form-resume-settings]').scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'saved PDF controls fit phone width'
    );
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-configured-resume-mobile.png',
    });
    await page.setViewportSize({ width: 1200, height: 800 });
  }
  pending = configurationReply(page, 'delete');
  await page.locator('[data-delete-form-resume]').click();
  assert(
    (await decoded(await pending)).resume === null,
    'saved PDF deletion acknowledged'
  );
  plan = await planCurrent(page);
  assert(
    plan.reviewPlan.resume === null &&
      (await page.locator('[data-form-attach-saved]').count()) === 0,
    'future plans no longer offer deleted PDF'
  );
  assert(
    (await owner.page
      .locator('#main-resume')
      .evaluate((node) => node.files[0]?.name)) === file.name,
    'deletion retains actual attachment'
  );
  pending = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await pending);
  assert(
    owner.closed &&
      fixture.submits === 0 &&
      owned.every((entry) => !entry.events.includes('submit')),
    'saved PDF workflow closes owned browser without submitting'
  );
  console.log(
    '[forms-configured-resume]',
    JSON.stringify({
      native: main.state,
      iframe: child.state,
      sha256: expected.sha256,
      savedRevision: saved.revision,
      closed: owner.closed,
      submissions: fixture.submits,
    })
  );
};
