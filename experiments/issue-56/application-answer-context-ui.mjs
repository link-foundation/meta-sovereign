import { translate } from '../../js/src/web/i18n.js';
import { applicationAnswerSalary } from './application-answer-context-fixture.mjs';

/** Use the actual shared controls; never inject application state into React. */
export const configureApplicationAnswerContext = async (panel) => {
  const t = (key) => translate('en', key);
  const context = panel.locator('[data-application-answer-context]');
  const profile = context.locator('[data-shared-profile]');
  await profile.locator(':scope > summary').click();
  await profile
    .getByRole('button', { name: t('questions.sharedLoad'), exact: true })
    .click();
  await profile
    .getByLabel(t('questions.sharedSelect'), { exact: true })
    .selectOption('qa-profile:questionnaire');
  await profile
    .getByLabel(t('questions.shared.id'), { exact: true })
    .filter({ visible: true })
    .waitFor();
  await profile.locator(':scope > summary').click();
  const salary = context.locator('[data-answer-salary]');
  await salary.locator(':scope > summary').click();
  await salary
    .getByLabel(t('questions.salaryEnabled'), { exact: true })
    .check();
  await salary
    .getByLabel(t('questions.salaryApproved'), { exact: true })
    .check();
  await salary
    .getByLabel(t('questions.salaryHours'), { exact: true })
    .fill('160');
  for (const [
    index,
    currency,
  ] of applicationAnswerSalary.currencies.entries()) {
    if (index) {
      await salary
        .getByRole('button', { name: t('questions.salaryAdd'), exact: true })
        .click();
    }
    const row = salary.locator('[data-salary-currency]').nth(index);
    for (const [key, value] of Object.entries({
      Code: currency.code,
      Keywords: currency.keywords.join(', '),
    })) {
      await row
        .getByLabel(t(`questions.salary${key}`), { exact: true })
        .fill(value);
    }
    for (const key of ['net', 'gross']) {
      await row
        .getByLabel(t(`questions.salary.${key}`), { exact: true })
        .fill(String(currency[key]));
    }
  }
  await salary
    .getByLabel(t('questions.salaryDefault'), { exact: true })
    .selectOption('RUB');
  await salary.locator(':scope > summary').click();
};
