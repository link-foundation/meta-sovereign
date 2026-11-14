import { assert } from './e2e-chat.mjs';

export const verifyQuestionTurns = async ({
  page,
  panel,
  editor,
  preview,
  store,
  until,
}) => {
  await panel
    .getByRole('checkbox', {
      name: 'Replace configured values with placeholders',
    })
    .uncheck();
  const cases = [
    [
      'Which city do you live in?',
      'Nha Trang',
      'Thanks for the details! Which city do you live in?',
      false,
    ],
    [
      'Describe your experience with Kubernetes.',
      'Yes.',
      'Describe your experience with Kubernetes.',
      true,
    ],
  ];
  for (const [question, text, incoming, review] of cases) {
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
      'turn rule saved through production UI'
    );
    await preview
      .getByLabel('Question or pattern', { exact: true })
      .fill(incoming);
    await preview
      .getByRole('button', { name: 'Preview answer', exact: true })
      .click();
    const result = preview.locator('[data-answer-preview]');
    await result
      .getByText(
        review
          ? 'Review required before automatic sending.'
          : 'Approved and complete.',
        { exact: true }
      )
      .waitFor();
    if (!review) {
      await result.getByText(text, { exact: true }).waitFor();
    }
  }
  const question = cases[1][0];
  const answer = 'Operated a cluster of twelve nodes.';
  for (const [id, sender, body] of [
    [1, 'them', question],
    [2, 'them', 'Can we continue our conversation?'],
    [3, 'me', 'Hello!'],
    [4, 'me', answer],
  ]) {
    await store.put({
      id: `msg:telegram:turns:${id}`,
      source: 'telegram',
      chat: 'turns',
      sender,
      body,
      timestamp: `2026-11-09T10:00:0${id}Z`,
    });
  }
  const learner = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Learn from conversations', { exact: true }),
  });
  await learner
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  const proposal = learner.locator('li').filter({ hasText: question });
  await proposal
    .getByText('Observed answer turns: 1', { exact: true })
    .waitFor();
  assert(
    (await proposal.locator('pre').innerText()) === answer,
    'only the substantive answer is learned under its technical question'
  );
  assert(
    (await learner
      .getByText('Can we continue our conversation?', { exact: true })
      .count()) === 0,
    'a reminder is not learned as the technical question'
  );
};
