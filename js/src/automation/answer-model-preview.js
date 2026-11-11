import { prepareAnswerModelContext } from './answer-model-context.js';
import { runAnswerModelDrafts } from './answer-model-drafts.js';
import { answerModelFailure } from './answer-model-config.js';
import { answerChoiceState, applyAnswerChoices } from './question-options.js';
import { pendingAnswerText } from './question-pending-plan.js';

const unresolvedRequests = (answer, input) => {
  if (answer.noReply || answer.noReplyProposed) {
    return [];
  }
  if (answer.parts?.length && !input.options?.length) {
    return answer.parts.flatMap((part, index) =>
      part.text || part.noReply || part.noReplyProposed
        ? []
        : [
            {
              id: `part:${index}`,
              question: part.question,
              options: [],
            },
          ]
    );
  }
  return answer.text
    ? []
    : [
        {
          id: 'question',
          question: input.question,
          options: input.options ?? [],
        },
      ];
};

const draftedAnswer = (answer, draft, choices, model) =>
  applyAnswerChoices(
    {
      ...answer,
      ...draft,
      match: 'model',
      source: 'model',
      complete: !draft.missing.length && Boolean(draft.text),
      requiresReview: true,
      optionMismatch: false,
      rules: [],
      model,
    },
    { options: choices, strictOptions: choices.length > 0 }
  );

const mergedAnswer = (answer, result, choices) => {
  if (!result.drafts.length) {
    return { ...answer, model: result.model };
  }
  if (result.drafts[0].id === 'question') {
    return draftedAnswer(answer, result.drafts[0], choices, result.model);
  }
  const byId = new Map(result.drafts.map((draft) => [draft.id, draft]));
  const parts = answer.parts.map((part, index) => {
    const draft = byId.get(`part:${index}`);
    return draft ? draftedAnswer(part, draft, [], result.model) : part;
  });
  const text = pendingAnswerText(parts);
  if (text.length > 12000) {
    return {
      ...answer,
      model: {
        ...result.model,
        state: 'refused',
        used: false,
        code: 'answer-model-output',
      },
    };
  }
  return {
    ...answer,
    text,
    parts,
    complete: parts.every((part) => part.complete),
    requiresReview: true,
    missing: [...new Set(parts.flatMap((part) => part.missing))],
    model: result.model,
  };
};

export const modelAnswerPreview = async (
  store,
  input,
  answer,
  context,
  options
) => {
  if (input.modelDraft !== undefined && typeof input.modelDraft !== 'boolean') {
    throw answerModelFailure(
      'answer-model-config',
      'Model draft opt-in must be a boolean.'
    );
  }
  if (
    !input.modelDraft ||
    answer.optionPending ||
    answer.pending?.blocked ||
    answer.pending?.limited
  ) {
    return answer;
  }
  try {
    answerChoiceState(input.question, input);
  } catch {
    throw answerModelFailure(
      'answer-model-context',
      'Draft answer options must be bounded text.'
    );
  }
  const requests = unresolvedRequests(answer, input);
  if (requests.length > 25) {
    return {
      ...answer,
      model: { state: 'refused', used: false, code: 'answer-model-context' },
    };
  }
  const prepared = await prepareAnswerModelContext(
    store,
    context,
    answer.parts?.length
      ? answer.parts.map((part) => part.question)
      : [input.question]
  );
  const result = await runAnswerModelDrafts({
    ...options,
    prepared,
    requests,
    policy: context.policy,
  });
  return mergedAnswer(answer, result, input.options ?? []);
};
