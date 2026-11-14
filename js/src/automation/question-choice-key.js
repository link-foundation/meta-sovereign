import { outboxKey } from './outbox.js';

/** Reviewed text and native selections reserve the same question across reviews. */
export const questionChoiceKey = (draft) =>
  (draft.answer?.strictOptions || draft.answer?.textReply === true) &&
  draft.answer.message
    ? outboxKey({
        owner: 'question-choice',
        source: draft.source,
        chat: draft.chat,
        step: draft.answer.message,
      })
    : null;
