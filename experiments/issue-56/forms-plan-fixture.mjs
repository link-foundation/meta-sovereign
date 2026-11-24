import { saveAnswerProfile } from '../../js/src/automation/question-profiles.js';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';

/** Synthetic owner values shared by browser and independent MCP verification. */
export const seedFormAnswers = async (store) => {
  const profile = await saveAnswerProfile(store, {
    id: 'forms-fixture',
    name: 'Application owner',
    values: {
      name: 'Ada Example',
      email: 'ada@example.test',
      location: 'Vietnam',
      timezone: 'UTC+7',
      website: 'https://example.test/ada',
    },
  });
  for (const [id, question, text] of [
    ['arrangement', 'Work arrangement', 'Remote'],
    ['language', 'Preferred language', 'English'],
    ['availability', 'Availability', '2027-01-15'],
    ['newsletter', 'Receive email updates', 'Yes'],
  ]) {
    await saveAnswerRule(store, {
      id,
      question,
      answers: [
        {
          text,
          approved: true,
          count: 2,
          evidence: ['synthetic-reviewed-answer'],
        },
      ],
    });
  }
  return profile;
};
