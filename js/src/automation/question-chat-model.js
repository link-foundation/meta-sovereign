import {
  previewAnswer,
  readChatAnswerInput,
  validateAnswerDraft,
} from './question-store.js';
import { modelFingerprint } from './answer-model-context.js';
import { normalizeAnswerAction } from './question-answers.js';
import { prefillLinkFor } from '../crm/reengage.js';
import { debugQuestionTurn } from './question-turns.js';

/** Serial bounded requests; planning and validation never deliver a message. */
export const draftChatModelAnswers = async (
  store,
  automation,
  plan,
  options = {}
) => {
  if (
    automation.action.kind !== 'answer-questions' ||
    !automation.action.modelDraft
  ) {
    return plan;
  }
  const drafts = [];
  const excluded = [...plan.excluded];
  for (const original of plan.drafts) {
    options.signal?.throwIfAborted();
    const turn = await readChatAnswerInput(store, automation, original);
    if (!turn.ok) {
      excluded.push({
        key: original.key,
        name: original.name,
        reason: 'question-turn-unavailable',
      });
      continue;
    }
    const answer = await previewAnswer(
      store,
      { ...turn.input, now: options.now },
      options
    );
    const draft = {
      ...original,
      text: answer.text,
      prefill: prefillLinkFor({ ...original, text: answer.text }),
      answer: {
        ...original.answer,
        ...answer,
        ...(answer.model?.used
          ? {
              modelAction: await modelFingerprint(
                normalizeAnswerAction(automation.action)
              ),
            }
          : {}),
      },
    };
    const valid = await validateAnswerDraft(store, automation, draft, {
      reviewed: true,
      now: options.now,
    });
    if (!valid.ok || !draft.text) {
      debugQuestionTurn('chat-model-excluded', {
        question: original.answer.message,
        code: valid.code ?? answer.model?.state,
      });
      excluded.push({
        key: original.key,
        name: original.name,
        reason: valid.ok ? 'question-unanswered' : 'question-turn-unavailable',
        answer: draft.answer,
      });
    } else {
      drafts.push(draft);
    }
  }
  return { ...plan, total: drafts.length, drafts, excluded };
};
