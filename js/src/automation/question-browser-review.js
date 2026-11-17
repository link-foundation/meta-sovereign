import { randomUUID } from 'node:crypto';
import { previewAnswer } from './question-store.js';
import { normalizeAnswerAction } from './question-answers.js';
import { browserAnswerPlanning } from './question-browser-context.js';
import { checkBrowserQuestion } from './question-browser-state.js';

/** Freeze observed questions once; later review actions still recheck the provider. */
export const createBrowserReviewRecorder =
  ({ store, clock, runner, status }) =>
  async (target, observed, input = {}, options = {}) => {
    const snapshot = checkBrowserQuestion(observed);
    const planning = {
      ...normalizeAnswerAction(input),
      ...browserAnswerPlanning(input, observed),
    };
    const plan = snapshot.question.outgoing
      ? null
      : await previewAnswer(
          store,
          {
            ...input,
            ...planning,
            source: target.source,
            chat: snapshot.chat,
            question: snapshot.question.body,
            links: snapshot.question.links,
            pendingMessages: snapshot.pendingTurn?.messages,
            options: snapshot.answerOptions,
            strictOptions: snapshot.strictOptions,
          },
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
