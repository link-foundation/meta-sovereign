import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assert } from './e2e-chat.mjs';
import {
  openFormPlan,
  planCurrent,
  responseFor,
  decoded,
  closeFormReview,
  captureFormField,
  captureFormFieldLayouts,
} from './e2e-form-review.mjs';
import { syntheticResumePdf } from '../../../experiments/issue-56/forms-resume-fixture.mjs';
import { readUploadedPdf } from '../../src/forms/resume-upload.js';

const field = (plan) =>
  plan.fields.find((item) => item.nativeId === 'child-resume');
const attach = async (page, plan) => {
  const pending = responseFor(page, 'attach');
  await page.locator(`[data-form-attach-saved="${field(plan).id}"]`).click();
  return decoded(await pending);
};

/** Real private bytes and cross-origin readback; no owner filesystem or account. */
export const verifyFormPrivateResumeUi = async ({
  page,
  owned,
  fixture,
  store,
  until,
}) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forms-private-pdf-ui-'));
  const file = path.join(directory, 'resume/resume.pdf');
  const original = store.logFile;
  const savedSelection = await store.get('form-resume:default');
  const submissions = fixture.submits;
  let owner;
  store.logFile = path.join(directory, 'data.lino');
  try {
    await mkdir(path.dirname(file));
    await writeFile(file, syntheticResumePdf());
    let plan = await openFormPlan(
      page,
      fixture.url.replace('/application', '/upload')
    );
    owner = owned.at(-1);
    if (process.env.FORMS_PRIVATE_RESUME_BEFORE === '1') {
      assert(
        !plan.reviewPlan.resume,
        'published parent ignores the conventional PDF'
      );
      await captureFormField(page, field(plan).id, 'before', 'private_resume');
      console.log(
        '[forms-private-resume-before]',
        JSON.stringify({
          filesPresent: 1,
          selectedResume: null,
          submissions: fixture.submits - submissions,
        })
      );
      return;
    }
    assert(
      plan.reviewPlan.resume?.source === 'resume/resume.pdf',
      'private PDF is available without saving a selection'
    );
    const ownerControl = owner.page.locator('#main-resume');
    await ownerControl.setInputFiles({
      name: 'owner.pdf',
      mimeType: 'application/pdf',
      buffer: syntheticResumePdf(),
    });
    plan = await planCurrent(page);
    const main = plan.fields.find((item) => item.nativeId === 'main-resume');
    assert(
      await page.locator(`[data-form-attach-saved="${main.id}"]`).isDisabled(),
      'owner file still requires separate replacement consent'
    );
    await writeFile(
      file,
      Buffer.concat([
        syntheticResumePdf(),
        Buffer.from('\n%new private revision'),
      ])
    );
    const refused = await attach(page, plan);
    const child = owner.page
      .frames()
      .find(
        (frame) =>
          frame !== owner.page.mainFrame() && frame.url().includes('/upload')
      );
    assert(
      refused.code === 'form-resume-changed' &&
        (await child
          .locator('#child-resume')
          .evaluate((node) => node.files.length)) === 0,
      'changed private PDF refuses before an actual upload'
    );
    plan = await planCurrent(page);
    await captureFormFieldLayouts(page, field(plan).id, 'private_resume');
    const result = await attach(page, plan);
    const actual = await child
      .locator('#child-resume')
      .evaluate(readUploadedPdf);
    assert(
      result.state === 'attached' &&
        actual.sha256 === plan.reviewPlan.resume.sha256 &&
        result.file.sha256 === actual.sha256,
      'cross-origin actual bytes match the reviewed private PDF'
    );
    assert(
      (await owner.page
        .locator('#main-resume')
        .evaluate((node) => node.files[0].name)) === 'owner.pdf' &&
        fixture.submits === submissions,
      'owner attachment and submission remain untouched'
    );
    assert(
      isDeepStrictEqual(await store.get('form-resume:default'), savedSelection),
      'discovery never writes a saved PDF selection'
    );
    await closeFormReview(page, until, 'private PDF review closes');
    console.log(
      '[forms-private-resume]',
      JSON.stringify({
        source: 'resume/resume.pdf',
        changedSourceRefused: refused.code,
        sha256: actual.sha256,
        ownerFileRetained: true,
        nativeReceipts: 1,
        savedSelectionUnchanged: true,
        submissions: fixture.submits - submissions,
        closed: owner.closed,
      })
    );
  } finally {
    if (owner && !owner.closed) {
      await closeFormReview(page, until, 'private PDF cleanup closes');
    }
    store.logFile = original;
    await rm(directory, { recursive: true, force: true });
  }
};
