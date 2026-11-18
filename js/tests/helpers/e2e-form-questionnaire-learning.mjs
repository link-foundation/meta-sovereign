import { listAnswerRules } from '../../src/automation/question-store.js';
import { assert } from './e2e-chat.mjs';
import { responseFor, decoded, planCurrent } from './e2e-form-review.mjs';
import {
  learningQuestions,
  learningAnswers,
} from '../../../experiments/issue-56/forms-questionnaire-learning-fixture.mjs';

export const verifyFormQuestionnaireLearningUi = async ({
  page,
  owned,
  fixture,
  store,
  until,
}) => {
  const initialSubmits = fixture.submits;
  const initialOwned = owned.length;
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator('[data-form-slot]').fill('application-2');
  await page
    .locator('[data-form-url]')
    .fill(fixture.url.replace('/application', '/questionnaire-learning'));
  let pending = responseFor(page, 'open');
  await page.locator('[data-action="open-form-review"]').click();
  await decoded(await pending);
  const owner = owned.at(-1);
  pending = responseFor(page, 'read');
  await page.locator('[data-review-action="read"]').click();
  await decoded(await pending);
  await planCurrent(page);
  assert(
    !(await listAnswerRules(store)).some(
      (rule) => rule.question === learningQuestions
    ),
    'planning creates no observed questionnaire knowledge'
  );
  await owner.page
    .locator('[name="questionnaireAnswer"]')
    .fill(learningAnswers);
  assert(fixture.submits === initialSubmits, 'editing does not submit');
  await owner.page.getByRole('button', { name: 'Submit', exact: true }).click();
  await owner.page.getByRole('status').waitFor();
  let history;
  await until(async () => {
    pending = responseFor(page, 'history');
    await page.locator('[data-review-action="history"]').click();
    history = await decoded(await pending);
    return history.checkpoints.some((entry) => entry.action === 'learn');
  }, 'confirmed questionnaire learning receipt');
  const phase = process.env.FORMS_QUESTIONNAIRE_LEARNING_PHASE ?? 'after';
  await page.locator('[data-form-journal] > h2').scrollIntoViewIfNeeded();
  if (process.env.FORMS_QUESTIONNAIRE_LEARNING_SCREENSHOTS === '1') {
    await page.screenshot({
      path: `docs/screenshots/issue-56-forms-questionnaire-learning-${phase}.png`,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `docs/screenshots/issue-56-forms-questionnaire-learning-${phase}-mobile.png`,
    });
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > globalThis.innerWidth
  );
  pending = responseFor(page, 'close');
  await page.locator('[data-review-action="close"]').click();
  await decoded(await pending);
  const rules = (await listAnswerRules(store)).filter((rule) =>
    [
      learningQuestions,
      'Which languages do you use?',
      'Where do you live?',
    ].includes(rule.question)
  );
  console.log(
    '[forms-questionnaire-learning]',
    JSON.stringify({
      phase,
      saved: history.answerLearning.saved,
      skipped: history.answerLearning.skipped,
      rules: rules.map((rule) => ({
        question: rule.question,
        answers: rule.answers,
      })),
      submissions: fixture.submits - initialSubmits,
      sessions: owned.length - initialOwned,
      closed: owner.closed,
      overflow,
    })
  );
  assert(
    owner.closed && fixture.submits === initialSubmits + 1,
    'one owner submission and drained native session'
  );
  assert(
    history.answerLearning.saved === 3 && history.answerLearning.skipped === 0,
    'whole and both component proposals have truthful counters'
  );
  assert(
    rules.length === 3 &&
      rules.every((rule) =>
        rule.answers.every((answer) => !answer.approved && answer.count === 1)
      ),
    'whole and individual observations stay unapproved'
  );
  assert(!overflow, 'questionnaire learning journal fits phone width');
};
