import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assert } from './e2e-chat.mjs';
import {
  noticeTurn,
  archivedNoticeTurns,
} from '../../../experiments/issue-56/notice-learning-fixture.mjs';
import {
  noticeText,
  noticeReply,
} from '../../../experiments/issue-56/notice-fixture.mjs';

export const verifyNoticeLearning = async ({
  page,
  base,
  store,
  until,
  screenshots,
  before = false,
}) => {
  for (const entry of await store.query((entry) =>
    /^(?:msg:|qa-rule:)/u.test(entry.id)
  )) {
    await store.delete(entry.id);
  }
  for (const message of archivedNoticeTurns()) {
    await store.put(message);
  }
  await store.put(
    noticeTurn({
      chat: 'silent',
      question: 'We will review your details tomorrow.',
    })[0]
  );
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(`${base}/?notice-learning=1#/automation`);
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const summary = panel.getByText('Learn from conversations', { exact: true });
  await summary.click();
  const learner = summary.locator('..');
  const preview = () =>
    learner
      .getByRole('button', { name: 'Preview learned answers', exact: true })
      .click();
  const rules = () => store.query((entry) => entry.id?.startsWith('qa-rule:'));
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await learner.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(screenshots, `notice-learning-${name}.png`),
      });
    }
  };
  await preview();
  await learner
    .getByText('Archived messages inspected: 5 of 5.', { exact: true })
    .waitFor();
  if (before) {
    assert(
      (await learner.locator('li').count()) === 0,
      'parent omits actual notice replies'
    );
    await shot('before');
    return { before: true, missingNoticeLearning: true };
  }
  const proposal = learner
    .locator('li')
    .filter({ has: page.getByText(noticeText, { exact: true }) });
  await proposal.getByText(noticeReply, { exact: true }).waitFor();
  await proposal.getByText('Passive notice', { exact: true }).waitFor();
  assert(
    await proposal.evaluate(
      (entry) =>
        entry.querySelector('.meta').getBoundingClientRect().bottom <=
        entry.querySelector('strong').getBoundingClientRect().top + 1
    ),
    'the notice kind occupies its own line above the message'
  );
  await proposal
    .getByText('Observed answer turns: 2', { exact: true })
    .waitFor();
  assert((await rules()).length === 0, 'preview leaves knowledge unchanged');
  assert(
    (await learner.locator('li').count()) === 1,
    'owner silence creates no rule'
  );
  await shot('desktop');
  await learner
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(
    async () => (await rules()).length === 1,
    'actual notice proposal persisted'
  );
  await preview();
  await proposal
    .getByText('Observed answer turns: 2', { exact: true })
    .waitFor();
  const [saved] = await rules();
  assert(
    saved.kind === 'notice' &&
      saved.answers[0].count === 2 &&
      !saved.answers[0].approved,
    'saving or replaying learning never approves or recounts observations'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.app-shell-compact').waitFor();
  await shot('mobile');
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'notice learning fits mobile'
  );
  await panel.getByRole('button', { name: noticeText, exact: true }).click();
  const editor = panel.locator('[data-answer-rule]');
  assert(
    (await editor.getByLabel('Rule type', { exact: true }).inputValue()) ===
      'notice',
    'learned record opens as a notice'
  );
  assert(
    !(await editor
      .getByRole('checkbox', {
        name: 'Reviewed notice rule (text replies still require review)',
        exact: true,
      })
      .isChecked()),
    'learning retains explicit review'
  );
  return { cases: 3 };
};
