import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assert } from './e2e-chat.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';
import {
  noticeTurn,
  archivedNoticeTurns,
  noticePatternVariant,
  noticePattern,
} from '../../../experiments/issue-56/notice-learning-fixture.mjs';
import {
  noticeText,
  noticeReply,
} from '../../../experiments/issue-56/notice-fixture.mjs';

const seedNoticeLearning = async (store, patterns) => {
  for (const entry of await store.query((entry) =>
    /^(?:msg:|qa-rule:)/u.test(entry.id)
  )) {
    await store.delete(entry.id);
  }
  for (const message of archivedNoticeTurns()) {
    await store.put(message);
  }
  if (patterns) {
    for (const message of noticeTurn({
      chat: 'variant',
      question: noticePatternVariant,
    })) {
      await store.put(message);
    }
  }
  await store.put(
    noticeTurn({
      chat: 'silent',
      question: 'We will review your details tomorrow.',
    })[0]
  );
};
const verifyMissingProposal = async (learner, patterns, shot) => {
  const selector = patterns ? '[data-learned-notice-patterns]' : 'li';
  assert(
    (await learner.locator(selector).count()) === 0,
    'parent omits learned notice proposals'
  );
  await shot('before');
  return patterns
    ? { before: true, missingNoticePatterns: true }
    : { before: true, missingNoticeLearning: true };
};

export const verifyNoticeLearning = async ({
  page,
  base,
  store,
  until,
  screenshots,
  before = false,
  patterns = false,
}) => {
  await seedNoticeLearning(store, patterns);
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(`${base}/?notice-learning=1#/automation`);
  const panel = page.locator('[data-question-controls]');
  await openQuestionDisclosure(panel);
  const summary = panel.getByText('Learn from conversations', { exact: true });
  const learner = summary.locator('..');
  await openQuestionDisclosure(learner);
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
        path: join(
          screenshots,
          `notice-${patterns ? 'patterns' : 'learning'}-${name}.png`
        ),
      });
    }
  };
  await preview();
  await learner
    .getByText(
      `Archived messages inspected: ${patterns ? 7 : 5} of ${patterns ? 7 : 5}.`,
      { exact: true }
    )
    .waitFor();
  if (before) {
    return verifyMissingProposal(learner, patterns, shot);
  }
  const proposal = learner
    .locator(':scope > div > ul > li')
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
  if (patterns) {
    const generated = proposal.locator('[data-learned-notice-patterns]');
    await generated.locator('summary').click();
    await generated.getByText(noticePattern, { exact: true }).waitFor();
  }
  assert((await rules()).length === 0, 'preview leaves knowledge unchanged');
  assert(
    (await learner.locator(':scope > div > ul > li').count()) ===
      (patterns ? 2 : 1),
    'owner silence creates no rule'
  );
  await shot('desktop');
  await learner
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(
    async () => (await rules()).length === (patterns ? 2 : 1),
    'actual notice proposal persisted'
  );
  await preview();
  await proposal
    .getByText('Observed answer turns: 2', { exact: true })
    .waitFor();
  const saved = (await rules()).find((rule) => rule.question === noticeText);
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
  if (patterns) {
    assert(
      saved.learnedPatterns.includes(noticePattern),
      'generated pattern persisted separately from owner aliases'
    );
    const generated = editor.locator('[data-learned-notice-patterns]');
    await generated.locator('summary').click();
    await generated.getByText(noticePattern, { exact: true }).waitFor();
  }
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
