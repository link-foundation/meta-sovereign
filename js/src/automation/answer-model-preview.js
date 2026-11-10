import { prepareAnswerModelContext } from './answer-model-context.js';
import { runAnswerModelDrafts } from './answer-model-drafts.js';
import { answerModelFailure } from './answer-model-config.js';
import { questionKey } from './question-match.js';
const validOptions = (options) =>
  options === undefined ||
  (Array.isArray(options) &&
    options.length <= 100 &&
    options.every(
      (choice) => typeof choice === 'string' && choice.length <= 6000
    ));

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
  if (!input.modelDraft) {
    return answer;
  }
  if (!validOptions(input.options)) {
    throw answerModelFailure(
      'answer-model-context',
      'Draft answer options must be bounded text.'
    );
  }
  const prepared = await prepareAnswerModelContext(store, context, [
    input.question,
  ]);
  const requests =
    answer.text || answer.noReply
      ? []
      : [
          {
            id: 'question',
            question: input.question,
            options: input.options ?? [],
          },
        ];
  const result = await runAnswerModelDrafts({
    ...options,
    prepared,
    requests,
    policy: context.policy,
  });
  const draft = result.drafts[0];
  if (!draft) {
    return { ...answer, model: result.model };
  }
  const choices = input.options ?? [];
  const optionMismatch =
    choices.length > 0 &&
    choices.filter((choice) => questionKey(choice) === questionKey(draft.text))
      .length !== 1;
  return {
    ...answer,
    ...draft,
    match: 'model',
    source: 'model',
    complete: !draft.missing.length && Boolean(draft.text) && !optionMismatch,
    requiresReview: true,
    optionMismatch,
    rules: [],
    model: result.model,
  };
};
