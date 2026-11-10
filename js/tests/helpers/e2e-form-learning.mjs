import { listAnswerRules } from '../../src/automation/question-store.js';
import { responseFor, decoded, planCurrent } from './e2e-form-review.mjs';
import { assert } from './e2e-chat.mjs';
import { verifyFormLearningGestures } from './e2e-form-learning-gestures.mjs';

const currentPlan = async (page) => {
  const read = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await read);
  await page
    .locator('[data-form-profile] option[value="qa-profile:forms-fixture"]')
    .waitFor({ state: 'attached' });
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  const plan = await planCurrent(page);
  assert(
    plan.ok && plan.mode === 'answer-plan',
    'current page questions planned'
  );
};
const historyFor = async (page) => {
  const pending = responseFor(page, 'history');
  await page.locator('[data-review-action="history"]').click();
  return decoded(await pending);
};
const capture = async (page, suffix) => {
  const outcome = page.locator('[data-form-learned="observed-submission"]');
  await (
    (await outcome.count()) ? outcome : page.locator('[data-form-journal] > h2')
  ).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/issue-56-forms-learning-${suffix}.png`,
  });
};

export const verifyFormLearningUi = async ({
  page,
  owned,
  fixture,
  until,
  store,
}) => {
  const before = process.env.FORMS_LEARNING_BEFORE === '1';
  if (!before) {
    await verifyFormLearningGestures(page);
  }
  await page.setViewportSize({ width: 1200, height: 800 });
  if (!before) {
    assert(
      await page.locator('[data-form-learn]').isChecked(),
      'learning is on by default'
    );
  }
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/learning'));
  const opening = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  const opened = await decoded(await opening);
  if (!before) {
    assert(
      opened.session.answerLearning.state === 'waiting-plan',
      'snapshots alone do not arm learning'
    );
  }
  const owner = owned.at(-1);
  await currentPlan(page);
  assert(
    !(await listAnswerRules(store)).some(
      (rule) => rule.question === 'Company context'
    ),
    'unchanged prefill was not learned'
  );
  await owner.page
    .locator('[name="learningAnswer"]')
    .fill('I build distributed systems; contact ada@example.test');
  if (!before) {
    await until(
      async () =>
        (await listAnswerRules(store)).some(
          (rule) => rule.question === 'Company context'
        ),
      'stable owner edit becomes a proposal before Send'
    );
    const rule = (await listAnswerRules(store)).find(
      (value) => value.question === 'Company context'
    );
    assert(
      rule.answers[0].text ===
        'I build distributed systems; contact {{email}}' &&
        !rule.answers[0].approved,
      'contact contracted without granting approval'
    );
    assert(fixture.submits === 0, 'stable learning does not submit');
  }
  await owner.page.locator('#next').click();
  await owner.page.waitForURL('**/learning?page=2');
  await currentPlan(page);
  await owner.page
    .locator('[name="learningAnswer"]')
    .fill('Available after the current notice period');
  await owner.page.getByRole('button', { name: 'Gửi', exact: true }).click();
  await owner.page.getByRole('status').waitFor();
  let history;
  if (!before) {
    await until(async () => {
      history = await historyFor(page);
      return history.checkpoints.some(
        (entry) =>
          entry.action === 'learn' &&
          entry.report.outcome.learning.kind === 'observed-submission'
      );
    }, 'actual Vietnamese completion saves later-page answers');
  } else {
    history = await historyFor(page);
  }
  if (before) {
    await capture(page, 'before');
  } else {
    assert(
      history.answerLearning.saved === 2 && history.answerLearning.failed === 0,
      'two actual answers saved with accurate counters'
    );
    assert(fixture.submits === 1, 'only the owner sent the form');
    const rules = await listAnswerRules(store);
    assert(
      rules
        .filter((rule) =>
          ['Company context', 'Availability notes'].includes(rule.question)
        )
        .every((rule) =>
          rule.answers.every((answer) => !answer.approved && answer.count === 1)
        ),
      'learning remains unapproved and idempotent'
    );
    assert(
      !JSON.stringify(history).includes('learning-secret-canary'),
      'password never read'
    );
    const learned = history.checkpoints.find(
      (entry) =>
        entry.action === 'learn' &&
        entry.report.outcome.learning.kind === 'observed-submission'
    );
    await page.locator(`[data-form-checkpoint="${learned.sequence}"]`).click();
    await page.locator('[data-form-learned="observed-submission"]').waitFor();
    await page
      .locator('[data-form-learned="observed-submission"] summary')
      .click();
    assert(
      (await page.locator('[data-form-learned] dd').allTextContents())
        .join('|')
        .includes('Available after the current notice period'),
      'actual considered answers can be inspected'
    );
    if (process.env.FORMS_LEARNING_SCREENSHOTS === '1') {
      await capture(page, 'after');
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, 'mobile');
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'learning journal fits phone width'
    );
  }
  const closing = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await closing);
  assert(owner.closed, 'learning and capture drain before browser closes');
  assert(
    !before,
    'baseline lacks stable owner edit and submitted answer learning'
  );
};
