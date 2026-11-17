import { mountSalaryVacancy } from './salary-vacancy-browser-fixture.mjs';
import { salaryVacancyCard } from './salary-vacancy-fixture.mjs';

export {
  salaryVacancyCard,
  salaryVacancyCardAnswer,
} from './salary-vacancy-fixture.mjs';
export const mountSalaryVacancyCard = async (fixture) => {
  await mountSalaryVacancy(fixture);
  await fixture.page
    .locator('[data-qa="chatik-header-sub-header"] a')
    .evaluate((link, title) => {
      link.textContent = title;
    }, salaryVacancyCard);
};
