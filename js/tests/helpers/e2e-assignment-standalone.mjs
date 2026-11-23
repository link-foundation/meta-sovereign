import { assert } from './e2e-chat.mjs';
import { decoded } from './e2e-form-review.mjs';
import { readAnswerModel } from '../../src/automation/answer-model-config.js';
import { seedAssignmentAnswers } from '../../../experiments/issue-56/forms-assignment-fixture.mjs';

export const standaloneTarget = 'fixture-owner/standalone-task';
export const standaloneInstructions =
  'Design the stock reconciliation process. Include a three-page proposal describing stale warehouse records and recovery.';

const openPublisher = async (page) => {
  const publisher = page.locator('[data-standalone-assignment]');
  await publisher.locator('summary').click();
  return publisher;
};

const screenshot = async (page, state, locator) => {
  if (process.env.ASSIGNMENT_STANDALONE_SCREENSHOTS !== '1') {
    return;
  }
  await locator.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.screenshot({
    path: `docs/screenshots/issue-56-assignment-standalone-${state}.png`,
  });
};

const request = async (page, publisher, action) => {
  const pending = page.waitForResponse((value) =>
    value.url().endsWith(`/api/forms/assignment/${action}`)
  );
  await publisher.locator(`[data-action="${action}-assignment"]`).click();
  return decoded(await pending);
};

const posted = async (page, publisher) => {
  await publisher.getByLabel('GitHub owner/repository').fill(standaloneTarget);
  const text = publisher.getByLabel('Assignment instructions', { exact: true });
  await text.fill(standaloneInstructions);
  await screenshot(page, 'input', text);
  const preview = await request(page, publisher, 'draft');
  const evidence = publisher.getByText('Instructions used: pasted text', {
    exact: false,
  });
  await evidence.waitFor();
  assert(
    preview.draft?.formUrl === undefined &&
      preview.draft?.sourceEvidence?.scope === 'owner-provided-text',
    'pasted text is the only source'
  );
  await screenshot(page, 'review', evidence);
  await text.fill('Different instructions.');
  assert(
    (await publisher.locator('[data-action="publish-assignment"]').count()) ===
      0,
    'source edit clears the publication review'
  );
  const restored = await request(page, publisher, 'restore');
  assert(
    restored.draft.id === preview.draft.id &&
      (await text.inputValue()) === standaloneInstructions,
    'saved text returns after restore'
  );
  return preview.draft;
};

const recover = async (page, publisher, draft) => {
  const unknown = await request(page, publisher, 'publish');
  assert(
    unknown.state === 'uncertain',
    'lost issue response remains uncertain'
  );
  await publisher.getByRole('alert').waitFor();
  assert(
    await publisher
      .getByLabel('Assignment instructions', { exact: true })
      .isDisabled(),
    'attempted source is frozen'
  );
  await page.reload();
  const reopened = await openPublisher(page);
  await reopened.getByLabel('GitHub owner/repository').fill(standaloneTarget);
  const restored = await request(page, reopened, 'restore');
  assert(
    restored.attempted && restored.draft.id === draft.id,
    'reload restores the issued draft'
  );
  const verified = await request(page, reopened, 'publish');
  assert(
    verified.state === 'verified' && verified.assignment === undefined,
    'readback completes standalone publication without a form association'
  );
  const receipt = reopened.locator('[data-assignment-published]');
  await receipt.waitFor();
  await screenshot(page, 'verified', receipt);
};

export const verifyStandaloneAssignmentUi = async ({
  page,
  store,
  fixture,
  until,
  standalonePublication,
}) => {
  const read = page.locator('[data-action="read-form"]');
  await until(() => read.isEnabled(), 'available Forms controls');
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.ASSIGNMENT_STANDALONE_BEFORE === '1') {
    assert(
      (await page.locator('[data-standalone-assignment]').count()) === 0,
      'parent cannot draft without a form'
    );
    await screenshot(page, 'before', read);
    return;
  }
  if ((await readAnswerModel(store)).revision === null) {
    await seedAssignmentAnswers(store);
  }
  const initialSubmissions = fixture.submits;
  const publisher = await openPublisher(page);
  const draft = await posted(page, publisher);
  assert(
    !standalonePublication.state.calls.includes('create'),
    'private review never creates the repository'
  );
  await recover(page, publisher, draft);
  const count = (name) =>
    standalonePublication.state.calls.filter((call) => call === name).length;
  assert(
    count('create') === 1 && count('create-issue') === 1,
    'exactly one repository and issue created'
  );
  assert(
    standalonePublication.state.modelCalls.length === 1,
    'same review uses one model call'
  );
  assert(
    fixture.submits === initialSubmissions,
    'standalone publication never submits an employer form'
  );
  assert(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'standalone panel fits phone'
  );
  console.log(
    '[assignment-standalone]',
    JSON.stringify({
      draft: draft.id,
      repositories: 1,
      issues: 1,
      modelCalls: 1,
      submissions: 0,
    })
  );
  await page.locator('[data-standalone-assignment] summary').click();
  await page.reload();
  await page.setViewportSize({ width: 1200, height: 800 });
};
