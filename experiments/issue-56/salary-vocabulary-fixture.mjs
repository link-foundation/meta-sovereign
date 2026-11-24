import { wordingSalary } from './salary-wording-fixture.mjs';

export const vocabularySalary = wordingSalary;
export const salaryVocabularyQuestion =
  'What package retainer would be suitable in EUR?';
export const salaryVocabularyRules = () =>
  [
    'What package retainer do you expect?',
    'Please specify your package retainer.',
    'Your preferred package retainer?',
  ].map((question, index) => ({
    id: `qa-rule:salary-vocabulary-${index}`,
    question,
    answers: [
      { text: 'From {{salary_gross}} gross per month.', approved: true },
    ],
  }));
export const salaryVocabularyExpected = 'From 6 500 € gross per month.';
