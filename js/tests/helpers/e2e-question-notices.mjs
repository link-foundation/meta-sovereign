import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assert } from './e2e-chat.mjs';
import { openQuestionPreview } from './question-preview.mjs';
import {
  noticeText,
  noticeReply,
  noticeRule,
} from '../../../experiments/issue-56/notice-fixture.mjs';

export const verifyQuestionNotices = async ({
  page,
  base,
  store,
  until,
  screenshots,
  before = false,
}) => {
  await page.setViewportSize({ width: 1180, height: 950 });
  await store.put(noticeRule());
  await page.goto(`${base}/?notice-check=1#/automation`);
  const { panel, preview } = await openQuestionPreview(page);
  const question = preview.getByLabel('Question or pattern', { exact: true });
  const run = async (value) => {
    await question.fill(value);
    await preview
      .getByRole('button', { name: 'Preview answer', exact: true })
      .click();
  };
  const result = preview.locator('[data-answer-preview]');
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await result.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `notice-${name}.png`) });
    }
  };
  await run(`Hello, Alice! ${noticeText}\nBest regards,\nRecruiter`);
  if (before) {
    await result
      .getByText('Add or complete a saved answer.', { exact: true })
      .waitFor();
    assert(
      (await panel.getByLabel('Rule type', { exact: true }).count()) === 0,
      'parent has no notice rule control'
    );
    await shot('before');
    return { before: true, missingNoticeReply: true };
  }
  await result.getByText(noticeReply, { exact: true }).waitFor();
  await result
    .getByText('Review required before automatic sending.', {
      exact: true,
    })
    .waitFor();
  const editor = panel.locator('[data-answer-rule]');
  const saveNotice = async (approved) => {
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await until(
      async () =>
        (await store.query((entry) => entry.id?.startsWith('qa-rule:'))).some(
          (entry) =>
            entry.kind === 'notice' &&
            entry.answers[0].text === '[без ответа]' &&
            entry.answers[0].approved === approved
        ),
      `notice editor persisted the no-reply rule, approved=${approved}`
    );
  };
  await panel
    .getByRole('button', { name: 'New answer rule', exact: true })
    .click();
  await editor.getByLabel('Rule type', { exact: true }).selectOption('notice');
  await editor
    .getByLabel('Question or pattern', { exact: true })
    .fill('Thank you. Your answers have been recorded.');
  await editor.getByLabel('Answer', { exact: true }).fill('[без ответа]');
  await saveNotice(false);
  await run('Thank you. Your answers have been recorded.');
  await result
    .getByText(
      'Proposed no-reply notice. Review and approve its saved rule first.',
      { exact: true }
    )
    .waitFor();
  await editor
    .getByRole('checkbox', {
      name: 'Reviewed notice rule (text replies still require review)',
      exact: true,
    })
    .check();
  await saveNotice(true);
  await run(`Hello, Alice! ${noticeText}\nBest regards,\nRecruiter`);
  await result.getByText(noticeReply, { exact: true }).waitFor();
  await shot('reply-desktop');
  await run('Thank you. Your answers have been recorded.');
  await result.getByText('No reply needed.', { exact: true }).first().waitFor();
  await shot('no-reply-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.app-shell-compact').waitFor();
  await shot('no-reply-mobile');
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'notice review fits mobile viewport'
  );
  await run(`${noticeText} Please send your passport.`);
  await result
    .getByText('Add or complete a saved answer.', { exact: true })
    .waitFor();
  await run('What is your passport number?');
  await result
    .getByText('Add or complete a saved answer.', { exact: true })
    .waitFor();
  return { cases: 6 };
};
