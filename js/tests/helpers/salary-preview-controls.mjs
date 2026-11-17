import { openQuestionDisclosure } from './question-preview.mjs';

/** Configure the shared preview and browser planning state through visible fields. */
export const configureSalaryPreview = async (preview, salary) => {
  const controls = preview.locator('[data-answer-salary]');
  await openQuestionDisclosure(controls);
  for (const name of [
    'Use configured salary targets',
    'Approve complete salary answers for automatic sending',
  ]) {
    await controls.getByRole('checkbox', { name, exact: true }).check();
  }
  for (const [index, entry] of salary.currencies.entries()) {
    if (index) {
      await controls
        .getByRole('button', { name: 'Add salary currency', exact: true })
        .click();
    }
    const fields = controls.locator('[data-salary-currency]').nth(index);
    for (const [label, value] of [
      ['Currency code, e.g. USD', entry.code],
      ['Currency words, comma-separated', entry.keywords.join(', ')],
      ['Monthly net amount', entry.net],
      ['Monthly gross amount', entry.gross],
    ]) {
      if (value !== undefined) {
        await fields.getByLabel(label, { exact: true }).fill(String(value));
      }
    }
  }
  return controls;
};
