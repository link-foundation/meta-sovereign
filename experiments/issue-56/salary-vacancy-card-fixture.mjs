import { mountSalaryVacancy } from './salary-vacancy-browser-fixture.mjs';

export const salaryVacancyCard = 'Platform engineer — 5 000 EUR';
export const salaryVacancyCardAnswer = 'From 5 500 € net per month.';
export const mountSalaryVacancyCard = async (fixture) => {
  await mountSalaryVacancy(fixture);
  await fixture.page
    .locator('[data-qa="chatik-header-sub-header"] a')
    .evaluate((link, title) => {
      link.textContent = title;
    }, salaryVacancyCard);
};
