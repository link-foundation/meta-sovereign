export const id = '0023-answer-final-period';
export const from = 22;
export const to = 23;
export const description =
  'Record the default final-period preference without rewriting answer observations.';

export const up = async (ctx) => {
  const policy = await ctx.get('qa-policy:reuse');
  if (!policy) {
    return;
  }
  if (
    policy.answerFinalPeriod !== undefined &&
    !['with', 'without'].includes(policy.answerFinalPeriod)
  ) {
    throw Object.assign(
      new Error('Saved final-period preference is invalid.'),
      {
        code: 'ANSWER_FINAL_PERIOD_COLLISION',
      }
    );
  }
  await ctx.put({
    ...policy,
    answerFinalPeriod: policy.answerFinalPeriod ?? 'with',
  });
};
