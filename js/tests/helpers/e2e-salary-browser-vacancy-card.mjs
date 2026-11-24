import { verifySalaryBrowserVacancy } from './e2e-salary-browser-vacancy.mjs';
import {
  mountSalaryVacancyCard,
  salaryVacancyCardAnswer,
} from '../../../experiments/issue-56/salary-vacancy-card-fixture.mjs';

export const verifySalaryBrowserVacancyCard = async (browser) => {
  const before = process.env.SALARY_VACANCY_EXPECT_PAGE === '1';
  await verifySalaryBrowserVacancy(browser, {
    expected: before ? 'From $6 000 net per month.' : salaryVacancyCardAnswer,
    reads: before ? 1 : 0,
    prepare: mountSalaryVacancyCard,
    marker: '[salary-browser-vacancy-card]',
  });
};
