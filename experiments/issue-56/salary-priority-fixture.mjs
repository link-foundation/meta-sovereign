import { clarificationSalary } from './salary-clarification-fixture.mjs';

export const prioritySalary = {
  ...clarificationSalary,
  currencies: [
    ...clarificationSalary.currencies,
    {
      code: 'USDT',
      keywords: ['USDT', 'blockchain', 'криптовалют', 'cryptocurrenc'],
      net: 6200,
      gross: 7300,
      contextPriority: 10,
    },
  ],
};
export const priorityQuestion = 'What salary do you expect?';
export const priorityVacancy = {
  description: 'Lead Blockchain Engineer / Architect, from USD 5 000 per month',
  evidence: 'vacancy:hh:12',
};
export const priorityExpected = 'From 6 200 USDT net per month.';
