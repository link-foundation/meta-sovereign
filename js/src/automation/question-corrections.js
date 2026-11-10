// An explicit correction limits reuse for that question. It does not rewrite
// the transcript, extract new facts or turn corrected text into observed sends.
import { matchQuestion } from './question-match.js';
import { questionCore } from './question-turns.js';
import { renderAnswer } from './question-profile.js';
import { rejectedAnswer } from './question-policy.js';

export const answerRuleEligible = (rule, { source, chat } = {}) =>
  rule.enabled !== false &&
  (!rule.sources?.length || rule.sources.includes(source)) &&
  (!rule.chats?.length || rule.chats.includes(`${source}:${chat}`));

export const createAnswerCorrectionGuard = (
  rules = [],
  { policy = {}, profile = {}, contract = (text) => text } = {}
) => {
  const identity = (text) => {
    const value = contract(text).trim();
    return policy.punctuationEquivalent
      ? value.replace(/[.!。！]+$/u, '')
      : value;
  };
  const corrections = rules
    .filter((rule) => rule.answers.some((answer) => answer.canonical))
    .map((rule) => ({
      rule,
      questions: [rule.question, ...(rule.questions ?? [])].map(questionCore),
      answers: new Set(
        rule.answers
          .filter((answer) => answer.canonical)
          .flatMap((answer) => {
            const rendered = renderAnswer(answer.text, profile).text;
            return rejectedAnswer(answer.text, policy) ||
              rejectedAnswer(rendered, policy)
              ? []
              : [identity(answer.text), identity(rendered)];
          })
      ),
    }));
  return (question, text, context = {}) => {
    const core = questionCore(question);
    const matching = corrections.filter(
      (entry) =>
        answerRuleEligible(entry.rule, context) &&
        entry.questions.some((pattern) => matchQuestion(pattern, core))
    );
    return (
      !matching.length ||
      matching.some((entry) => entry.answers.has(identity(text)))
    );
  };
};
