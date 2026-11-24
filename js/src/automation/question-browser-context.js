import { browserAnswerRecent } from '../sources/browser-answer-context.js';
import { normalizeAnswerEnvironment } from './question-context.js';

/** A present native window supersedes caller history, including empty barriers. */
export const browserAnswerPlanning = (input, observed) => {
  const recent = browserAnswerRecent(observed);
  if (recent === null) {
    throw Object.assign(new Error('The question history was not verified.'), {
      code: 'question-browser-unverified',
      fallback: false,
    });
  }
  return normalizeAnswerEnvironment({
    ...input,
    ...(recent === undefined ? {} : { recent }),
  });
};
