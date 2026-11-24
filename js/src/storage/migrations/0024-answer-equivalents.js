import {
  normalizeAnswerEquivalents,
  validateAnswerEquivalents,
} from '../../automation/question-equivalents.js';

export const id = '0024-answer-equivalents';
export const from = 23;
export const to = 24;
export const description =
  'Admit explicit question-scoped equivalent answer wording without rewriting legacy observations.';

export const up = async (ctx) => {
  await ctx.scan({ prefix: 'qa-rule:' }, async (batch) => {
    for (const row of batch) {
      if (!Array.isArray(row.answers)) {
        continue;
      }
      try {
        validateAnswerEquivalents(
          row.answers.map((answer) => ({
            ...answer,
            approved: answer?.approved === true,
            canonical: answer?.canonical === true,
            equivalents: normalizeAnswerEquivalents(answer?.equivalents),
          }))
        );
      } catch {
        throw Object.assign(
          new Error('Saved equivalent answer declarations are invalid.'),
          {
            code: 'ANSWER_EQUIVALENTS_COLLISION',
          }
        );
      }
    }
  });
};
