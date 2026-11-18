import { randomUUID } from 'node:crypto';
import { previewAnswer } from './question-store.js';
import { normalizeAnswerAction } from './question-answers.js';
import { browserQuestionInput } from './question-browser-vacancy.js';
import { checkBrowserQuestion } from './question-browser-state.js';

/** Freeze observed questions once; later review actions still recheck the provider. */
export const createBrowserReviewRecorder =
  ({ store, clock, runner, status, answerPlanning }) =>
  async (target, observed, input = {}, options = {}) => {
    const snapshot = checkBrowserQuestion(observed);
    const planning = {
      ...normalizeAnswerAction(input),
      ...(await answerPlanning(input, observed, target, options)),
    };
    const plan = snapshot.question.outgoing
      ? null
      : await previewAnswer(
          store,
          browserQuestionInput(target, snapshot, { ...input, ...planning }),
          { runner, signal: options.signal }
        );
    const record = {
      id: `question-browser:${randomUUID()}`,
      kind: 'question-browser',
      tokens: ['question-browser', target.source, snapshot.chat],
      target,
      snapshot,
      planning,
      plan,
      expiresAt: new Date(clock().getTime() + 30 * 60 * 1000).toISOString(),
    };
    await store.put(record);
    return status(record);
  };
