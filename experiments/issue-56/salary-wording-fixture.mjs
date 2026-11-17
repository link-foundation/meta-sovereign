import { clarificationSalary } from './salary-clarification-fixture.mjs';

export const wordingSalary = clarificationSalary;
export const salaryWordingQuestion = 'Ваши зарплатные ожидания в EUR?';
export const salaryWordingTemplate =
  'От {{salary_net_usd}} ежемесячно на руки.';
export const salaryWordingExpected = 'От 5 500 € ежемесячно на руки.';
export const salaryWordingRule = (overrides = {}) => ({
  id: 'qa-rule:salary-wording',
  question: 'Ожидания по зарплате в долларах?',
  answers: [{ text: salaryWordingTemplate, approved: true, count: 12 }],
  ...overrides,
});
