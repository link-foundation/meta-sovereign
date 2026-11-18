export const id = '0022-unread-answers';
export const from = 21;
export const to = 22;
export const description =
  'Keep legacy unread passes and polling inputs in review-only mode.';

export const up = async (ctx) => {
  await ctx.scan({ prefix: 'question-unread:' }, async (batch) => {
    const records = batch.filter((row) =>
      ['question-unread', 'question-unread-polling'].includes(row.kind)
    );
    for (const row of records) {
      if (
        (row.answerChats !== undefined &&
          typeof row.answerChats !== 'boolean') ||
        (row.input?.answerChats !== undefined &&
          typeof row.input.answerChats !== 'boolean')
      ) {
        throw Object.assign(
          new Error('Unread answer intent is not a boolean.'),
          {
            code: 'UNREAD_ANSWERS_COLLISION',
          }
        );
      }
    }
    await ctx.putMany(
      records.map((row) => ({
        ...row,
        answerChats: row.answerChats ?? false,
        ...(row.input &&
        typeof row.input === 'object' &&
        !Array.isArray(row.input)
          ? {
              input: {
                ...row.input,
                answerChats: row.input.answerChats ?? false,
              },
            }
          : {}),
      }))
    );
  });
};
