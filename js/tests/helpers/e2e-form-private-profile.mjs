import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assert } from './e2e-chat.mjs';
import {
  openFormPlan,
  planCurrent,
  applyCurrent,
  closeFormReview,
  captureFormField,
  captureFormFieldLayouts,
} from './e2e-form-review.mjs';
import { resumeMarkdown } from '../../../experiments/issue-56/resume-profile-fixture.mjs';

const email = (plan) => plan.fields.find((field) => field.name === 'email');

/** Exercise real files and native controls without touching an owner's store. */
export const verifyFormPrivateProfileUi = async ({
  page,
  owned,
  fixture,
  store,
  until,
}) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forms-private-ui-'));
  const originalLogFile = store.logFile;
  const submissions = fixture.submits;
  let owner;
  store.logFile = path.join(directory, 'data.lino');
  try {
    let plan = await openFormPlan(
      page,
      fixture.url.replace('/application', '/prefill')
    );
    owner = owned.at(-1);
    assert(
      !email(plan).answer.proposal,
      'missing private email stays unresolved'
    );
    await mkdir(path.join(directory, 'resume'));
    await writeFile(path.join(directory, 'resume/resume.md'), resumeMarkdown);
    await writeFile(
      path.join(directory, 'contacts.lino'),
      'email\n  canonical@example.test\nfull_name\n  "Canonical Owner"\n'
    );
    await writeFile(
      path.join(directory, 'profile.lino'),
      'city\n  Vietnam\ntimezone\n  "UTC+7"\n'
    );
    plan = await planCurrent(page);
    if (process.env.FORMS_PRIVATE_PROFILE_BEFORE === '1') {
      assert(
        !email(plan).answer.proposal,
        'published parent misses existing contacts'
      );
      await captureFormField(page, email(plan).id, 'before', 'private_profile');
      console.log(
        '[forms-private-profile-before]',
        JSON.stringify({
          filesPresent: 3,
          proposal: null,
          submissions: fixture.submits - submissions,
        })
      );
      return;
    }
    assert(
      (await page.locator('[data-form-profile]').inputValue()) === '' &&
        email(plan).answer.proposal.value === 'canonical@example.test' &&
        plan.planning.profileSource.privateFiles.length === 3,
      'current private defaults need no named profile selection'
    );
    const ownerName = plan.fields.find((field) => field.name === 'fullName');
    assert(
      ownerName.answer.preserveCurrent && ownerName.answer.requiresReview,
      'automatic defaults retain the owner name and explicit review'
    );
    await page.locator(`[data-form-select="${email(plan).id}"]`).check();
    await writeFile(
      path.join(directory, 'contacts.lino'),
      'email\n  updated@example.test\nfull_name\n  "Canonical Owner"\n'
    );
    const stale = await applyCurrent(page);
    assert(
      stale.state === 'refused' &&
        stale.code === 'form-answers-changed' &&
        (await owner.page.locator('[name="email"]').inputValue()) === '' &&
        (await owner.page.evaluate(() => globalThis.events.length)) === 0,
      'changed private file refuses before any native write'
    );
    plan = await planCurrent(page);
    assert(
      email(plan).answer.proposal.value === 'updated@example.test',
      'replan loads the current private bytes'
    );
    await captureFormFieldLayouts(page, email(plan).id, 'private_profile');
    await page.locator(`[data-form-select="${email(plan).id}"]`).check();
    const result = await applyCurrent(page);
    assert(
      result.state === 'applied' &&
        result.receipts.length === 1 &&
        result.receipts[0].status === 'applied' &&
        (await owner.page.locator('[name="email"]').inputValue()) ===
          'updated@example.test',
      'reviewed private email reaches the actual native control'
    );
    assert(
      (await owner.page.locator('[name="fullName"]').inputValue()) ===
        "Owner's current answer" &&
        (await owner.page.evaluate(() => globalThis.navigationClicks)) === 0 &&
        fixture.submits === submissions,
      'owner text, Submit and Next remain untouched'
    );
    await closeFormReview(page, until, 'private profile review closes');
    console.log(
      '[forms-private-profile]',
      JSON.stringify({
        namedProfile: false,
        privateFiles: plan.planning.profileSource.privateFiles.length,
        changedSourceRefused: stale.code,
        email: 'updated@example.test',
        ownerNameRetained: true,
        nativeReceipts: result.receipts.length,
        submissions: fixture.submits - submissions,
        closed: owner.closed,
      })
    );
  } finally {
    if (owner && !owner.closed) {
      await closeFormReview(page, until, 'private profile cleanup closes');
    }
    store.logFile = originalLogFile;
    await rm(directory, { recursive: true, force: true });
  }
};
