import { questionKey } from './question-match.js';

const explicitChoice =
  /\b(?:choose|select|pick)\s+(?:one|an?\s+option|from)\b|выбер(?:и|ите)\s+(?:один|одну|вариант|из)|(?:एक|कोई)\s+विकल्प\s+चुन|请(?:选择|选取)(?:一个|一项)|选择一个/iu;

/** Empty strict options mean pending controls, never permission to type text. */
export const answerChoiceState = (question, input = {}) => {
  const options = input.options === undefined ? [] : input.options;
  if (
    !Array.isArray(options) ||
    options.length > 100 ||
    options.some(
      (option) =>
        typeof option !== 'string' || !option.trim() || option.length > 6000
    ) ||
    (input.strictOptions !== undefined &&
      typeof input.strictOptions !== 'boolean')
  ) {
    throw new Error(
      'Answer choices require bounded text and a boolean strictOptions'
    );
  }
  return {
    options,
    strictOptions:
      input.strictOptions === true ||
      options.length > 0 ||
      (input.questionMode !== 'field' && explicitChoice.test(question)),
  };
};

export const applyAnswerChoices = (answer, { options, strictOptions }) => {
  if (!strictOptions) {
    return answer;
  }
  const choices = options.filter(
    (choice) => questionKey(choice) === questionKey(answer.text)
  );
  return answer.complete && choices.length === 1
    ? { ...answer, text: choices[0], option: choices[0], strictOptions: true }
    : {
        ...answer,
        text: '',
        complete: false,
        requiresReview: true,
        strictOptions: true,
        optionMismatch: true,
        optionPending: options.length === 0,
      };
};
