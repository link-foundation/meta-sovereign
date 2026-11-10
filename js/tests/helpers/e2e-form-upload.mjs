import {
  responseFor,
  decoded,
  planCurrent,
  captureFormReview,
} from './e2e-form-review.mjs';
import { assert } from './e2e-chat.mjs';
import { resumePdf } from '../../src/forms/resume-upload.js';
import { syntheticResumePdf } from '../../../experiments/issue-56/forms-resume-fixture.mjs';

const field = (plan, id) => plan.fields.find((item) => item.nativeId === id);
const attach = async (page, plan, id, file) => {
  const current = field(plan, id);
  await page.locator(`[data-form-resume="${current.id}"]`).setInputFiles(file);
  if (current.upload.files.length) {
    assert(
      await page.locator(`[data-form-attach="${current.id}"]`).isDisabled(),
      'existing file requires separate replacement'
    );
    await page.locator(`[data-form-resume-replace="${current.id}"]`).check();
  }
  const pending = responseFor(page, 'attach');
  await page.locator(`[data-form-attach="${current.id}"]`).click();
  const response = await pending;
  return { response, result: await decoded(response) };
};

export const verifyFormUploadUi = async ({ page, owned, fixture }) => {
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/upload'));
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  const file = {
    name: 'synthetic-resume.pdf',
    mimeType: 'application/pdf',
    buffer: syntheticResumePdf(),
  };
  await owner.page
    .locator('#main-resume')
    .setInputFiles({ ...file, name: 'owner-resume.pdf' });
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await pending);
  let plan = await planCurrent(page);
  if (process.env.FORMS_UPLOAD_BEFORE === '1') {
    await page
      .locator(`[data-form-field="${field(plan, 'main-resume').id}"]`)
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-forms-upload-before.png',
    });
    assert(
      field(plan, 'main-resume').answer.uploadSupported,
      'PDF résumé field exposes reviewed attachment'
    );
    return;
  }
  assert(
    field(plan, 'main-resume').answer.uploadSupported &&
      field(plan, 'child-resume').answer.uploadSupported,
    'native and cross-origin résumé targets supported'
  );
  assert(
    !field(plan, 'portrait').answer.uploadSupported &&
      !field(plan, 'multiple-resume').answer.uploadSupported,
    'unrelated and multiple uploads unavailable'
  );
  const uploaded = await attach(page, plan, 'main-resume', file);
  assert(
    uploaded.result.state === 'attached',
    `actual PDF attachment: ${JSON.stringify(uploaded.result)}`
  );
  const expected = resumePdf({
    name: file.name,
    data: file.buffer.toString('base64'),
  }).metadata;
  assert(
    JSON.stringify(uploaded.result.file) === JSON.stringify(expected),
    'actual bytes match PDF digest'
  );
  const events = await owner.page.evaluate(() => [...globalThis.events]);
  const recovered = await page.request.fetch(uploaded.response.url(), {
    method: 'POST',
    headers: uploaded.response.request().headers(),
    data: uploaded.response.request().postDataBuffer(),
  });
  assert(
    (await decoded(recovered)).state === 'attached' &&
      JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
        JSON.stringify(events),
    'cached response never uploads again'
  );
  assert(
    await page.locator('[data-action="apply-form-plan"]').isDisabled(),
    'attachment consumes old answer plan'
  );
  plan = await planCurrent(page);
  const child = await attach(page, plan, 'child-resume', file);
  assert(child.result.state === 'attached', 'cross-origin PDF bytes verified');
  assert(
    (await owner.page.locator('#resume-name').inputValue()) === 'Owner text',
    'unselected name retained'
  );
  assert(
    (await owner.page
      .locator('#portrait')
      .evaluate((node) => node.files.length)) === 0,
    'portrait untouched'
  );
  if (process.env.FORMS_UPLOAD_SCREENSHOTS === '1') {
    await captureFormReview(page, 'upload');
  }
  plan = await planCurrent(page);
  await owner.page
    .locator('#main-resume')
    .evaluate((node) => node.replaceWith(node.cloneNode(true)));
  const previous = await owner.page.evaluate(() => [...globalThis.events]);
  const refused = await attach(page, plan, 'main-resume', file);
  assert(
    refused.result.state === 'refused' &&
      refused.result.code === 'form-changed' &&
      JSON.stringify(await owner.page.evaluate(() => globalThis.events)) ===
        JSON.stringify(previous),
    'identical replacement refuses before attachment'
  );
  pending = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await pending);
  assert(
    owner.closed &&
      fixture.submits === 0 &&
      owned.every((entry) => !entry.events.includes('submit')),
    'PDF review acknowledges cleanup and never submits'
  );
};
