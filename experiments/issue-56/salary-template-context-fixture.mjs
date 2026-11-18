import { clarificationSalary } from './salary-clarification-fixture.mjs';

export const contextSalary = clarificationSalary;
export const salaryTemplateQuestion = 'What salary in EUR net do you expect?';
export const salaryTemplateExpected = 'I expect 5 500 €, negotiable.';
export const salaryTemplateRule = (overrides = {}) => ({
  id: 'qa-rule:salary-context-template',
  question: salaryTemplateQuestion,
  answers: [
    {
      text: 'I expect {{salary_net_usd}}, negotiable.',
      approved: true,
      count: 3,
    },
  ],
  ...overrides,
});
