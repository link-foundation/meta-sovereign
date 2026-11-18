import { assert } from './e2e-chat.mjs';
import {
  decoded,
  openFormPlan,
  planCurrent,
  applyCurrent,
  closeFormReview,
  responseFor,
} from './e2e-form-review.mjs';
import {
  seedAssignmentAnswers,
  assignmentRepository,
} from '../../../experiments/issue-56/forms-assignment-fixture.mjs';

const captureAssignment = async (page, name, locator) => {
  if (
    process.env.FORMS_ASSIGNMENT_SCREENSHOTS !== '1' &&
    process.env.FORMS_ASSIGNMENT_BEFORE !== '1'
  ) {
    return;
  }
  await locator.evaluate((node) =>
    node.scrollIntoView({ block: 'center', behavior: 'instant' })
  );
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-assignment-${name}.png`,
  });
};
const captureLayouts = async (page, state) => {
  for (const [layout, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await captureAssignment(
      page,
      `${state}-${layout}`,
      page.locator('[data-form-assignment]')
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'assignment fits viewport'
    );
  }
  await page.setViewportSize({ width: 1200, height: 800 });
};
export const verifyFormAssignmentUi = async ({
  page,
  fixture,
  owned,
  store,
  until,
}) => {
  await seedAssignmentAnswers(store);
  const url = fixture.url.replace('/application', '/assignment');
  let plan = await openFormPlan(page, url, 'qa-profile:forms-fixture');
  const owner = owned.at(-1);
  const before = process.env.FORMS_ASSIGNMENT_BEFORE === '1';
  await captureAssignment(
    page,
    before ? 'before' : 'held-desktop',
    page.locator(before ? '[data-form-plan-summary]' : '[data-form-assignment]')
  );
  assert(
    plan.planning.proposed === 0,
    'assignment holds every answer before a repository exists'
  );
  assert(
    await page
      .locator('[data-form-assignment-state="needs-repository"]')
      .count(),
    'hold is visible'
  );
  assert(
    (await page.locator('[data-action="attach-form-resume"]').count()) === 0,
    'no PDF attachment while held'
  );
  let pending = responseFor(page, 'prefill');
  await page.locator('[data-action="prefill-form"]').click();
  const refused = await decoded(await pending);
  assert(
    refused.code === 'form-assignment-required' &&
      refused.receipts.length === 0 &&
      refused.uploads.length === 0,
    'automatic filling refuses before any write'
  );
  assert(
    (await owner.page.locator('[name="english"]').inputValue()) === '',
    'refusal leaves actual form empty'
  );
  await captureLayouts(page, 'held');
  const input = page.locator('[data-form-assignment-url]');
  await input.fill('https://github.com/fixture-owner/missing');
  await page.locator('[data-action="link-assignment-repository"]').click();
  await page
    .locator('[data-form-assignment-error="form-assignment-unverified"]')
    .waitFor();
  assert(
    (await input.inputValue()).endsWith('/missing'),
    'failed verification keeps owner input'
  );
  assert(
    await page
      .locator('[data-form-assignment-state="needs-repository"]')
      .count(),
    'unconfirmed repository keeps hold'
  );
  await input.fill(assignmentRepository);
  pending = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/assignment/repository')
  );
  await page.locator('[data-action="link-assignment-repository"]').click();
  const linked = await decoded(await pending);
  await page.locator('[data-form-assignment-state="verified"]').waitFor();
  assert(
    linked.assignment.state === 'verified' &&
      (await page.locator('[data-form-fill]').count()) === 0,
    'confirmed association discards old selection'
  );
  plan = await planCurrent(page);
  const task = plan.fields.find((field) => field.name === 'task');
  const english = plan.fields.find((field) => field.name === 'english');
  assert(
    task.answer.source === 'assignment' &&
      task.answer.text === assignmentRepository,
    'specific result field gets verified repository'
  );
  for (const field of [task, english]) {
    await page.locator(`[data-form-select="${field.id}"]`).check();
  }
  const applied = await applyCurrent(page);
  assert(
    applied.state === 'applied' && applied.receipts.length === 2,
    'reviewed changes have actual readback receipts'
  );
  assert(
    (await owner.page.locator('[name="task"]').inputValue()) ===
      assignmentRepository,
    'repository is in the real form'
  );
  assert(
    (await owner.page.locator('[name="english"]').inputValue()) === 'B2',
    'ordinary answers resume after verification'
  );
  assert(
    (await owner.page.locator('[name="name"]').inputValue()) ===
      'Owner keeps this text',
    'unselected owner answer preserved'
  );
  assert(
    (await owner.page.locator('[name="github"]').inputValue()) === '',
    'task repository never fills an unrelated GitHub field'
  );
  assert(
    (await owner.page
      .locator('[name="resume"]')
      .evaluate((node) => node.files.length)) === 0,
    'reviewed text changes attach no PDF'
  );
  await captureLayouts(page, 'verified');
  assert(
    (await owner.page.evaluate(() => globalThis.submissions)) === 0,
    'no submission'
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await closeFormReview(page, until, 'assignment review closed');
  console.log(
    '[forms-assignment]',
    JSON.stringify({
      heldProposals: 0,
      refusedWrites: 0,
      failedVerificationPreserved: true,
      applied: applied.receipts.length,
      ownerPreserved: true,
      unrelatedGithubEmpty: true,
      uploads: 0,
      submissions: 0,
      closed: owner.closed,
    })
  );
};
