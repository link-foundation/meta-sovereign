import { assert } from './e2e-chat.mjs';
import {
  openFormPlan,
  planCurrent,
  closeFormReview,
  decoded,
} from './e2e-form-review.mjs';
import { seedAssignmentAnswers } from '../../../experiments/issue-56/forms-assignment-fixture.mjs';
import { readAnswerModel } from '../../src/automation/answer-model-config.js';
import { instructionText } from '../../../experiments/issue-56/assignment-source-fixture.mjs';

const layouts = async (page, state, locator) => {
  for (const [layout, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(
      (expected) => globalThis.innerWidth === expected,
      width
    );
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolve)
          );
        })
    );
    await locator.evaluate((node) =>
      node.scrollIntoView({ block: 'center', behavior: 'instant' })
    );
    await page.waitForFunction(
      (node) => {
        const bounds = node.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.bottom > 0 &&
          bounds.top < globalThis.innerHeight
        );
      },
      await locator.elementHandle()
    );
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolve)
          );
        })
    );
    if (
      process.env.ASSIGNMENT_PUBLICATION_SCREENSHOTS === '1' ||
      process.env.ASSIGNMENT_PUBLICATION_BEFORE === '1'
    ) {
      await page.screenshot({
        path: `docs/screenshots/issue-56-assignment-source-${state}-${layout}.png`,
      });
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'publisher fits viewport'
    );
  }
  await page.setViewportSize({ width: 1200, height: 800 });
};
const response = (page, action) =>
  page.waitForResponse((value) =>
    value.url().endsWith(`/api/forms/assignment/${action}`)
  );

const verifySourceDraft = (preview, publication, sourceUrl) => {
  assert(
    preview.draft.sourceEvidence.requestedUrl === sourceUrl &&
      preview.draft.sourceEvidence.url.endsWith('/instructions'),
    'review exposes original and resolved source evidence'
  );
  const prompt = publication.state.modelCalls.at(-1).prompt;
  assert(
    prompt.includes(instructionText) &&
      !/Private|Invisible|Hidden/u.test(prompt),
    'visible instructions reach the model without hidden or editable values'
  );
  assert(
    preview.draft.body.includes('three pages') &&
      preview.draft.body.includes('## Deliverable and stack') &&
      preview.draft.body.includes('## Stack'),
    'written instructions and both required sections remain reviewable'
  );
};

export const verifyAssignmentPublicationUi = async ({
  page,
  fixture,
  store,
  until,
  publication,
  sourceReads,
}) => {
  if ((await readAnswerModel(store)).revision === null) {
    await seedAssignmentAnswers(store);
  }
  const url = `${fixture.url.replace('/application', '/assignment')}?publication=1`;
  const held = await openFormPlan(page, url, 'qa-profile:forms-fixture');
  assert(
    held.planning.proposed === 0,
    'publication starts with whole-form hold'
  );
  if (process.env.ASSIGNMENT_PUBLICATION_BEFORE === '1') {
    await layouts(page, 'before', page.locator('[data-form-assignment]'));
  }
  const control = page.locator('[data-assignment-publisher]');
  assert(
    (await control.count()) === 1,
    'server-backed assignment publisher exists'
  );
  const target = control.locator('[data-assignment-publish-input="target"]');
  await target.fill('invalid/');
  await control.locator('[data-action="draft-assignment"]').click();
  await control.locator('[data-assignment-publish-error]').waitFor();
  assert(
    (await target.inputValue()) === 'invalid/',
    'refusal preserves target'
  );
  assert(
    !publication.state.calls.includes('create'),
    'invalid preview has no writes'
  );
  await target.fill('fixture-owner/reviewed-task');
  const sourceUrl = fixture.url.replace('/application', '/source-redirect');
  await control
    .locator('[data-assignment-publish-input="source"]')
    .fill(sourceUrl);
  let pending = response(page, 'draft');
  await control.locator('[data-action="draft-assignment"]').click();
  const preview = await decoded(await pending);
  await control.locator('[data-assignment-draft]').waitFor();
  verifySourceDraft(preview, publication, sourceUrl);
  assert(
    preview.draft.visibility === 'private' &&
      preview.draft.body.includes('## Stack'),
    'public prose and visibility are reviewable'
  );
  assert(
    !publication.state.calls.includes('create'),
    'preview has no GitHub mutations'
  );
  await layouts(page, 'review', control.locator('[data-assignment-draft]'));
  pending = response(page, 'publish');
  await control.locator('[data-action="publish-assignment"]').click();
  const unknown = await decoded(await pending);
  assert(
    unknown.state === 'uncertain',
    'lost issue response remains uncertain'
  );
  await control.getByRole('alert').waitFor();
  assert(await target.isDisabled(), 'attempted target remains frozen');
  assert(
    await page
      .locator('[data-form-assignment-state="needs-repository"]')
      .count(),
    'uncertain publication keeps form held'
  );
  await layouts(page, 'uncertain', control.getByRole('alert'));
  await page.reload();
  await page.locator('[data-view-content="forms"]').waitFor();
  await openFormPlan(page, url, 'qa-profile:forms-fixture');
  pending = response(page, 'restore');
  await page.locator('[data-action="restore-assignment"]').click();
  const restored = await decoded(await pending);
  assert(
    restored.attempted && restored.draft.id === preview.draft.id,
    'reload restores the same issued draft'
  );
  await control.locator('[data-assignment-draft]').waitFor();
  pending = response(page, 'publish');
  await control.locator('[data-action="publish-assignment"]').click();
  const recovered = await decoded(await pending);
  assert(
    recovered.ok && recovered.state === 'verified',
    'same publication recovers through positive readback'
  );
  await control.locator('[data-assignment-published]').waitFor();
  assert(
    publication.state.calls.filter((call) => call === 'create').length === 1,
    'one repository creation'
  );
  assert(
    publication.state.calls.filter((call) => call === 'create-issue').length ===
      1,
    'one issue creation'
  );
  assert(publication.state.pipeline, 'actual fixture pipeline confirmed');
  assert(
    sourceReads.length === 1 && sourceReads.every((read) => read.closed),
    'restore and publication retain one owned source snapshot'
  );
  assert(
    (await control
      .locator('[data-assignment-publish-input="source"]')
      .inputValue()) === sourceUrl,
    'restored source input matches reviewed evidence'
  );
  await layouts(
    page,
    'verified',
    control.locator('[data-assignment-published]')
  );
  const planned = await planCurrent(page);
  assert(
    planned.fields.find((field) => field.name === 'task').answer.text ===
      'https://github.com/fixture-owner/reviewed-task',
    'specific result field gets published repository'
  );
  assert(fixture.submits === 0, 'publication never submits the employer form');
  await closeFormReview(page, until, 'publication review closed');
  console.log(
    '[assignment-publication]',
    JSON.stringify({
      draft: preview.draft.id,
      state: recovered.state,
      repositories: 1,
      issues: 1,
      heldUntilReadback: true,
      submissions: 0,
    })
  );
};
