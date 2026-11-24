import { assert } from './e2e-chat.mjs';

export const verifyQuestionLanguage = async ({
  page,
  panel,
  editor,
  preview,
  store,
  until,
}) => {
  await page.setViewportSize({ width: 1200, height: 1100 });
  await page.locator('.app-shell-compact').waitFor({ state: 'detached' });
  await page.unroute('**/api/automations/answers/save');
  const cases = [
    ['आप कहाँ रहते हैं', 'वियतनाम'],
    ['请介绍您的经验', '五年软件开发经验。'],
    ['इस दिन का अर्थ क्या है?', 'day'],
  ];
  for (const [question, text] of cases) {
    await panel
      .getByRole('button', { name: 'New answer rule', exact: true })
      .click();
    await editor
      .getByLabel('Question or pattern', { exact: true })
      .fill(question);
    await editor.getByLabel('Answer', { exact: true }).fill(text);
    await editor
      .getByRole('checkbox', { name: 'Approved for automatic sending' })
      .check();
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await until(
      async () =>
        (await store.query((link) => link.id?.startsWith('qa-rule:'))).some(
          (link) => link.question === question
        ),
      'multilingual rule saved through production UI'
    );
    await preview
      .getByLabel('Question or pattern', { exact: true })
      .fill(question);
    await preview
      .getByRole('button', { name: 'Preview answer', exact: true })
      .click();
    const result = preview.locator('[data-answer-preview]');
    await result.getByText(text, { exact: true }).waitFor();
    await result.getByText('Approved and complete.', { exact: true }).waitFor();
  }
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('इस दीन का अर्थ क्या है?');
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await preview
    .locator('[data-answer-preview]')
    .getByText('Review required before automatic sending.', { exact: true })
    .waitFor();

  for (const [index, [question, answer]] of cases.slice(0, 2).entries()) {
    for (const [offset, sender, body] of [
      [0, 'them', question],
      [1, 'me', answer],
    ]) {
      const id = index * 2 + offset;
      await store.put({
        id: `msg:vk:language:${id}`,
        source: 'vk',
        chat: 'language',
        sender,
        body,
        timestamp: new Date(Date.UTC(2026, 10, 9, 10, 0, id)).toISOString(),
      });
    }
  }
  const learner = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Learn from conversations', { exact: true }),
  });
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  for (const [question, answer] of cases.slice(0, 2)) {
    const learned = learner.locator('li').filter({ hasText: question });
    await learned.getByText(answer, { exact: true }).waitFor();
    await learned
      .getByText('Observed answer turns: 1', { exact: true })
      .waitFor();
  }
  assert(
    (await store.query((link) => link.id?.startsWith('qa-rule:')))
      .filter((link) => cases.some(([question]) => link.question === question))
      .every((link) => link.answers[0].count === 0),
    'learning preview does not change approval or observed counts'
  );
};
