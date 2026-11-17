import { questionKey } from './question-match.js';
import { debugQuestionTurn } from './question-turns.js';

/** Only the preceding incoming question and its consecutive sent replies count. */
export const holdRepeatedAnswer = (question, answer, context) => {
  const recent = context.recent;
  if (
    context.questionMode === 'field' ||
    !answer.text ||
    !Array.isArray(recent) ||
    recent.length > 20
  ) {
    return answer;
  }
  const key = (text) => questionKey(text, context.matching);
  const replies = [];
  for (const entry of recent) {
    if (typeof entry?.text !== 'string' || entry.text.length > 6000) {
      break;
    }
    if (entry.outgoing === true) {
      replies.push(entry);
      continue;
    }
    if (
      key(entry.text) === key(question) &&
      replies.some((reply) => key(reply.text) === key(answer.text))
    ) {
      debugQuestionTurn('repeated-answer-review', { replies: replies.length });
      return { ...answer, requiresReview: true, repeatedAnswer: true };
    }
    break;
  }
  return answer;
};
