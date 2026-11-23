import { assert } from './e2e-chat.mjs';
import { openFormPlan, closeFormReview, decoded } from './e2e-form-review.mjs';
import { seedAssignmentAnswers } from '../../../experiments/issue-56/forms-assignment-fixture.mjs';
import { vacancyUrl } from '../../../experiments/issue-56/assignment-vacancy-fixture.mjs';
import { importAssignmentChat } from '../../../experiments/issue-56/assignment-chat-vacancy-fixture.mjs';

const capture = async (page, review, state) => {
  for (const [layout, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth
      ),
      'assignment review fits the viewport'
    );
    await review.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    if (process.env.FORMS_ASSIGNMENT_CHAT_SCREENSHOTS === '1') {
      await page.screenshot({
        path: `docs/screenshots/issue-56-assignment-chat-vacancy-${state}-${layout}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1200, height: 800 });
};

export const verifyAssignmentChatVacancy = async ({
  page,
  until,
  fixture,
  store,
  owned,
  chatPublication,
  vacancyReads,
}) => {
  const formUrl = new URL('/assignment-chat-link', fixture.url).href;
  await seedAssignmentAnswers(store);
  await importAssignmentChat(store, formUrl);
  const priorReads = vacancyReads.length;
  const before = process.env.FORMS_ASSIGNMENT_CHAT_PARENT === '1';
  await openFormPlan(page, formUrl, 'qa-profile:forms-fixture');
  const owner = owned.at(-1);
  try {
    const controls = page.locator(
      '[data-form-assignment] [data-assignment-publisher]'
    );
    await controls
      .locator('[data-assignment-publish-input="target"]')
      .fill('fixture-owner/chat-task');
    const vacancy = controls.locator(
      '[data-assignment-publish-input="vacancy"]'
    );
    assert(
      (await vacancy.inputValue()) === '',
      'vacancy override starts blank'
    );
    const pending = page.waitForResponse((response) =>
      response.url().endsWith('/api/forms/assignment/draft')
    );
    await controls.locator('[data-action="draft-assignment"]').click();
    const response = await pending;
    const { ok, draft } = await decoded(response);
    assert(ok, 'reviewable assignment draft');
    const review = controls.locator('[data-assignment-draft]');
    await review.waitFor();
    const link = review.locator(`a[href="${vacancyUrl}"]`);
    if (before) {
      assert(
        (await link.count()) === 0 &&
          draft.vacancyEvidence.source === 'unknown',
        'parent loses chat vacancy'
      );
    } else {
      await link.waitFor();
      assert(
        (await link.textContent()).includes('Python engineer'),
        'review shows the captured HH vacancy'
      );
      assert(
        draft.vacancyEvidence.source === 'chat' &&
          draft.vacancyEvidence.url === vacancyUrl,
        'draft binds the exact chat vacancy'
      );
    }
    await capture(page, before ? review : link, before ? 'before' : 'after');
    const formValue = await owner.page.locator('[name="english"]').inputValue();
    assert(
      !formValue && fixture.submits === 0,
      'draft leaves the native form untouched'
    );
    const reads = vacancyReads.slice(priorReads);
    assert(
      JSON.stringify(reads) === JSON.stringify(before ? [] : [vacancyUrl]),
      'only the associated vacancy may be read'
    );
    assert(
      !chatPublication.state.repository && !chatPublication.state.issues.length,
      'draft does not publish'
    );
    console.log(
      '[assignment-chat-vacancy]',
      JSON.stringify({
        source: draft.vacancyEvidence.source,
        reads,
        response: response.status(),
        vacancyOverride: await vacancy.inputValue(),
        submissions: fixture.submits,
      })
    );
  } finally {
    await closeFormReview(page, until, 'chat assignment review closed');
  }
  assert(owner.closed, 'the owned form browser closes');
};
