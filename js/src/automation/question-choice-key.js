import { outboxKey } from './outbox.js';

/** All reviewed and automated native selections reserve the same question. */
export const questionChoiceKey = (draft) =>
  draft.answer?.strictOptions && draft.answer.message
    ? outboxKey({
        owner: 'question-choice',
        source: draft.source,
        chat: draft.chat,
        step: draft.answer.message,
      })
    : null;
