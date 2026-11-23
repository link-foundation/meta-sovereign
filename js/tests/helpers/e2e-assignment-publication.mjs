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
      process.env.ASSIGNMENT_PUBLICATION_BEFORE === '1' ||
      (process.env.ASSIGNMENT_LANGUAGE_SCREENSHOTS === '1' &&
        state.startsWith('language-'))
    ) {
      await page.screenshot({
        path: `docs/screenshots/issue-56-assignment-source-${state}-${layout}.png`,
      });
    }
    assert(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth
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
const request = async (page, control, action) => {
  const pending = response(page, action);
  await control.locator(`[data-action="${action}-assignment"]`).click();
  return decoded(await pending);
};

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

const verifyDraftReview = async ({
  page,
  control,
  target,
  language,
  publication,
  sourceUrl,
}) => {
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
  assert(
    (await language.inputValue()) === '',
    'vacancy selection is the default'
  );
  await language.selectOption('python');
  if (process.env.ASSIGNMENT_LANGUAGE_SCREENSHOTS === '1') {
    await layouts(page, 'language-control', language);
  }
  await control
    .locator('[data-assignment-publish-input="source"]')
    .fill(sourceUrl);
  const preview = await request(page, control, 'draft');
  await control.locator('[data-assignment-draft]').waitFor();
  verifySourceDraft(preview, publication, sourceUrl);
  const languageReview = control.locator('[data-assignment-language="python"]');
  assert(
    preview.draft.languageOverride === 'python' &&
      (await languageReview.textContent()) === 'Selected by you: Python',
    'explicit template language is part of the review'
  );
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
  if (process.env.ASSIGNMENT_LANGUAGE_SCREENSHOTS === '1') {
    await layouts(page, 'language-review', languageReview);
  }
  await language.selectOption('typescript');
  assert(
    (await control.locator('[data-action="publish-assignment"]').count()) === 0,
    'changing the language clears the publish review'
  );
  const savedPreview = await request(page, page, 'restore');
  assert(
    savedPreview.draft.id === preview.draft.id &&
      (await language.inputValue()) === 'python',
    'restoring a saved preview also restores its language control'
  );
  return preview.draft;
};

const verifyRecovery = async ({
  page,
  control,
  target,
  language,
  url,
  draft,
}) => {
  const unknown = await request(page, control, 'publish');
  assert(
    unknown.state === 'uncertain',
    'lost issue response remains uncertain'
  );
  await control.getByRole('alert').waitFor();
  assert(
    await language.isDisabled(),
    'attempted template language remains frozen'
  );
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
  const restored = await request(page, page, 'restore');
  assert(
    restored.attempted &&
      restored.draft.id === draft.id &&
      restored.draft.languageOverride === 'python',
    'reload restores the same issued draft'
  );
  await control.locator('[data-assignment-draft]').waitFor();
  const recovered = await request(page, control, 'publish');
  assert(
    recovered.ok && recovered.state === 'verified',
    'same publication recovers through positive readback'
  );
  await control.locator('[data-assignment-published]').waitFor();
  return { recovered, restored };
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
  const language = control.locator(
    '[data-assignment-publish-input="language"]'
  );
  if (process.env.ASSIGNMENT_LANGUAGE_BEFORE === '1') {
    assert(
      (await language.count()) === 0,
      'parent has no template language choice'
    );
    await layouts(
      page,
      'language-before',
      control.locator('[data-assignment-publish-input="vacancy"]')
    );
    await closeFormReview(page, until, 'parent review closed');
    assert(
      publication.state.calls.length === 0,
      'parent probe has no GitHub calls'
    );
    return;
  }
  const sourceUrl = fixture.url.replace('/application', '/source-redirect');
  const draft = await verifyDraftReview({
    page,
    control,
    target,
    language,
    publication,
    sourceUrl,
  });
  const { recovered, restored } = await verifyRecovery({
    page,
    control,
    target,
    language,
    url,
    draft,
  });
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
      draft: draft.id,
      state: recovered.state,
      repositories: 1,
      issues: 1,
      languageOverride: restored.draft.languageOverride,
      heldUntilReadback: true,
      submissions: 0,
    })
  );
};
