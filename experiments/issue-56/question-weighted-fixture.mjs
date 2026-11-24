import { saveAnswerRule } from '../../js/src/automation/question-store.js';

export const weightedQuestions = {
  saved: 'What are your software engineering experiences?',
  asked: 'Describe your experiences in software engineering?',
  answer: 'Five years building accessible applications.',
};
export const seedWeightedAnswers = async (store) => {
  for (const [id, count, text] of [
    ['frequent', 9, weightedQuestions.answer],
    ['other', 2, 'Three years of application development.'],
  ]) {
    await saveAnswerRule(store, {
      id: `weighted-${id}`,
      question: weightedQuestions.saved,
      answers: [{ text, count, approved: true }],
    });
  }
};
