import { assert } from './e2e-chat.mjs';

export const verifyQuestionSubstitution = async ({
  page,
  panel,
  preview,
  editor,
  store,
  until,
}) => {
  const fields = preview.locator(
    ':scope > [data-answer-profile] > [data-profile-values]'
  );
  await fields
    .getByLabel('Field name, e.g. city', { exact: true })
    .fill('email');
  await fields.getByRole('button', { name: 'Add field', exact: true }).click();
  await fields.getByLabel('email', { exact: true }).fill('owner@example.test');
  await panel
    .getByRole('button', { name: 'New answer rule', exact: true })
    .click();
  const question = 'How can we contact you?';
  await editor
    .getByLabel('Question or pattern', { exact: true })
    .fill(question);
  await editor
    .getByLabel('Answer', { exact: true })
    .fill('Email owner@example.test; salary $6 000 net.');
  await editor
    .getByRole('checkbox', { name: 'Approved for automatic sending' })
    .check();
  await panel
    .getByRole('checkbox', {
      name: 'Replace configured values with placeholders',
    })
    .check();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const expected = 'Email {{email}}; salary {{salary_net_usd}} net.';
  await until(
    async () =>
      (await editor.getByLabel('Answer', { exact: true }).inputValue()) ===
      expected,
    'saved configured values become placeholders'
  );
  const saved = (
    await store.query((link) => link.id?.startsWith('qa-rule:'))
  ).find((rule) => rule.question === question);
  assert(
    saved.answers[0].text === expected && !saved.profile,
    'saved rule contains template without a profile copy'
  );
  for (const [width, height, path] of [
    [1200, 1100, process.env.QUESTIONS_SUBSTITUTION_SCREENSHOT],
    [390, 844, process.env.QUESTIONS_SUBSTITUTION_MOBILE_SCREENSHOT],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .locator('.app-shell-compact')
      .waitFor({ state: width < 600 ? 'visible' : 'detached' });
    await editor.getByLabel('Answer', { exact: true }).scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth === globalThis.innerWidth
      ),
      'placeholder editor fits viewport'
    );
    if (path) {
      await page.screenshot({ path, scale: 'css' });
    }
  }
  await page.setViewportSize({ width: 1200, height: 1100 });
  await page.locator('.app-shell-compact').waitFor({ state: 'detached' });
  await fields.getByLabel('email', { exact: true }).fill('next@example.test');
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill(question);
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  const result = preview.locator('[data-answer-preview]');
  await result
    .getByText('Email next@example.test; salary $6 000 net.', { exact: true })
    .waitFor();
  await result.getByText('Approved and complete.', { exact: true }).waitFor();
  const evidence = result.locator('[data-salary-template-evidence]');
  await evidence.locator(':scope > summary').click();
  await evidence.getByText('salary_net_usd: $6 000', { exact: true }).waitFor();
};
