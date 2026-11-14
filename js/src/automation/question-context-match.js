import { matchQuestion, questionKey } from './question-match.js';
import { sameQuestionSubjects } from './question-subjects.js';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const keywordsIn = (text, group) => {
  const key = ` ${questionKey(text)} `;
  return group.choices.some((choice) =>
    choice.keywords.some((word) => key.includes(` ${questionKey(word)} `))
  );
};
const contextualSubjects = (pattern, question, rule, contexts) => {
  for (const group of contexts) {
    const fields = [
      group.key,
      ...group.choices.flatMap((choice) => Object.keys(choice.profile)),
    ];
    // Only an owner-configured variable template can span context choices.
    // A literal subject in the pattern and a hardcoded answer keep the guard.
    if (
      keywordsIn(pattern, group) ||
      !rule.answers.every((answer) =>
        fields.some((field) => answer.text.includes(`{{${field}}}`))
      )
    ) {
      continue;
    }
    for (const word of group.choices.flatMap((choice) => choice.keywords)) {
      question = question.replace(
        new RegExp(
          `(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`,
          'giu'
        ),
        ' '
      );
    }
  }
  return sameQuestionSubjects(pattern, question);
};

export const matchContextualQuestion = (pattern, question, rule, context) =>
  matchQuestion(pattern, question, {
    ...context.matching,
    templateSubjects: (left, right) =>
      contextualSubjects(left, right, rule, context.contexts ?? []),
  });
