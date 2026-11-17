import { salaryOptionConfig } from './salary-option-fixture.mjs';

export const bandSalary = salaryOptionConfig;
export const bandQuestion = 'What salary in USD net do you expect?';
export const bandChoices = ['USD 0–5000', 'USD 5001–8000'];
export const bandMixedChoices = ['USD 5000–8000', 'EUR 5000–8000'];
export const bandSavedRule = (
  text = 'From USD 4000 net per month.',
  extra = {}
) => ({
  id: 'qa-rule:specific-salary',
  question: bandQuestion,
  answers: [{ text, approved: true, count: 5 }],
  ...extra,
});
