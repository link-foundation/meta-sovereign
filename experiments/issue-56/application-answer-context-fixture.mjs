import { saveAnswerProfile } from '../../js/src/automation/question-profiles.js';
import {
  formQuestions,
  seedFormQuestionnaire,
} from './form-questionnaire-fixture.mjs';

export const applicationAnswerQuestions = [
  formQuestions[0],
  'What salary in RUB before taxes do you expect?',
  ...formQuestions.slice(1),
];
export const applicationAnswerQuestionnaire = applicationAnswerQuestions
  .map((question, index) => `${index + 1}. ${question}`)
  .join('\n');
export const applicationAnswerSalary = {
  enabled: true,
  approved: true,
  exchangeMode: 'snapshot',
  defaultCurrency: 'RUB',
  defaultBasis: 'net',
  monthlyHours: 160,
  currencies: [
    { code: 'USD', keywords: ['USD'], net: 6200, gross: 7400 },
    { code: 'RUB', keywords: ['RUB'], net: 450000, gross: 530000 },
  ],
};
export const seedApplicationAnswerContext = async (store) => {
  const profile = await seedFormQuestionnaire(store);
  return saveAnswerProfile(store, {
    ...profile,
    values: {
      email: profile.values.email,
      github: profile.values.github,
    },
  });
};
