import { browserQuestion } from './question-browser-fixture.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import {
  mountPendingHistory,
  editPendingMessage,
} from './pending-turn-fixture.mjs';

export const earlierQuestion = 'What is your English level?';
export const earlierAnswer = 'My English level is B2.';
export const pendingRules = () => [
  {
    id: 'qa-rule:pending-english',
    question: earlierQuestion,
    answers: [{ text: earlierAnswer, approved: true }],
  },
  {
    id: 'qa-rule:experience',
    question: browserQuestion().question.body,
    answers: [{ text: 'Yes', approved: true }],
  },
];
export const wholeTurnSnapshot = ({ strictOptions = false, earlier } = {}) => {
  const latest = browserQuestion();
  return {
    ...latest,
    strictOptions,
    answerOptions: strictOptions ? ['Yes', 'No'] : [],
    pendingTurn: {
      boundary: { kind: 'outgoing', id: '98', body: 'Previous owner reply' },
      messages: [
        { id: '100', body: earlier ?? earlierQuestion },
        { id: '101', body: latest.question.body },
      ],
    },
  };
};

export const mountWholeTurn = async (fixture) => {
  await saveAnswerRule(fixture.store, pendingRules()[0]);
  await fixture.reset({ freeText: true });
  await fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
  await fixture.page.evaluate(mountPendingHistory);
  await fixture.page.evaluate(editPendingMessage, earlierQuestion);
};
