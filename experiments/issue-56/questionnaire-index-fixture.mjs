export const indexedQuestions = [
  'Which editor do you use?',
  'What is your preferred deployment region?',
];
export const existingQuestionnaire = {
  id: 'qa-rule:existing-index-fixture',
  question: indexedQuestions.map((part, i) => `${i + 1}. ${part}`).join('\n'),
  answers: [{ text: '1. Vim.\n2. Helsinki.', approved: true, count: 0 }],
};
