import { guardedSend } from './outbox.js';
import { questionChoiceKey } from './question-choice-key.js';
import {
  boundedBrowserText,
  browserChoiceDraft,
  browserTextReceipt,
} from './question-browser-state.js';
import { answerChoiceState } from './question-options.js';
import { checkedBrowserPendingTurn } from '../sources/browser-pending-turn.js';

const failure = (code, message) =>
  Object.assign(new Error(message), { code, fallback: false });

const textDraft = (record, text) => {
  const { snapshot } = record;
  if (
    !boundedBrowserText(text, 12000) ||
    snapshot.strictOptions !== false ||
    snapshot.answerOptions.length ||
    snapshot.question.outgoing ||
    snapshot.hasDraft ||
    record.prefilled ||
    !checkedBrowserPendingTurn(snapshot.pendingTurn, snapshot.question) ||
    answerChoiceState(snapshot.question.body, { options: [] }).strictOptions
  ) {
    throw failure(
      'question-browser-text',
      'Review the complete incoming turn and a nonempty text reply in an empty provider composer.'
    );
  }
  const draft = browserChoiceDraft(record, text);
  return {
    ...draft,
    answer: {
      message: draft.answer.message,
      strictOptions: false,
      textReply: true,
    },
  };
};

/** Explicit reviewed text uses the same durable turn reservation as native choices. */
export const createBrowserTextReview =
  ({ store, send, clock, log, status, capabilities, freshReview }) =>
  async (input = {}) => {
    const record = await freshReview(input);
    if (input.confirm !== true) {
      throw failure(
        'confirm-required',
        'Review and confirm this exact text reply.'
      );
    }
    if (
      !capabilities().textSources?.some(({ id }) => id === record.target.source)
    ) {
      throw failure(
        'answer-text-unavailable',
        'This provider has no verified browser text reply support.'
      );
    }
    const draft = textDraft(record, input.text);
    const outcome = await guardedSend({
      store,
      kind: 'question-text',
      owner: record.id,
      key: questionChoiceKey(draft),
      draft,
      clock,
      log,
      userConfirmed: true,
      send: async (selected) => {
        const result = await send.replyText({
          ...record.target,
          chat: record.snapshot.chat,
          expected: globalThis.structuredClone(record.snapshot),
          text: selected.text,
        });
        if (!browserTextReceipt(result, selected)) {
          throw Object.assign(
            failure(
              'send-unknown',
              'The provider text reply receipt could not be verified.'
            ),
            { ambiguous: true }
          );
        }
        return result;
      },
    });
    return {
      ...(await status(record)),
      ...(outcome.code ? { code: outcome.code } : {}),
    };
  };
